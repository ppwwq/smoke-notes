"""Bounded catalog diagnostics. Never print server-provided text or accept drift."""
import hashlib
import re

TABLES = ('workspaces', 'workspace_members', 'notebooks', 'notes', 'todos',
          'pairing_codes', 'pairing_attempts', 'applied_operations')
ROLES = ('PUBLIC', 'anon', 'authenticated', 'postgres', 'service_role', 'supabase_admin')
PRIVILEGES = ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
FUNCTIONS = ('is_workspace_member', 'bootstrap_workspace', 'redeem_pairing_code',
             'enroll_local_workspace', 'rotate_pairing_code', 'apply_workspace_mutation',
             'valid_todo_planning', 'workspace_sync_capabilities')
# Exact body pairs independently inspected on 2026-10-21. Diagnostic labels only:
# these do NOT change the audit's strict comparison or authorize history repair.
REVIEWED_FORMAT_PAIRS = {
    'enroll_local_workspace': (
        'd40220846b226aa46f27bab315b8b0d4d6f5f5618ac5445486cec0d428e7c44d',
        'd897f37db467f55468c2e1d6b4b0780f5d83b69ead88f403efa6e934219a0e20'),
    'is_workspace_member': (
        '64ce4dd8c19a6505b7bc9d8cc215b578407a2fc10fc7b92ab1cc06ce4fc587e9',
        'fae2834b273fc370f2114d094403a1095891b83460db32f18a518b8dea054cd6'),
    'redeem_pairing_code': (
        '70388432a25a041f88348740c71d591d388dd743068bde43301775ca130db25f',
        'b0518813a98133008f1040bf3d2353a3dd7fd21de1baf141544f3dfa4462360e'),
}


def grants(rows):
    safe, unknown = set(), False
    for row in rows or []:
        if not isinstance(row, dict):
            unknown = True
            continue
        table, role, privilege, grantor = (row.get(k) for k in
            ('table_name', 'grantee', 'privilege_type', 'grantor'))
        grantable = row.get('is_grantable')
        if (table not in TABLES or role not in ROLES or privilege not in PRIVILEGES
                or grantor not in ROLES or type(grantable) is not bool):
            unknown = True
            continue
        safe.add((table, role, privilege, 'yes' if grantable else 'no', grantor))
    return safe, unknown


def grant_differences(expected, observed):
    before, before_unknown = grants(expected)
    after, after_unknown = grants(observed)
    lines = []
    if before_unknown or after_unknown:
        lines.append('grant.detail: UNRECOGNIZED_METADATA_SUPPRESSED')
    for kind, entries in (('missing', before - after), ('extra', after - before)):
        for table, role, privilege, grantable, grantor in sorted(entries):
            lines.append(f'grant.{kind}: table={table} role={role} privilege={privilege} '
                         f'grantable={grantable} grantor={grantor}')
    return lines


def function_map(rows):
    found, unknown = {}, False
    for row in rows or []:
        definition = row.get('definition') if isinstance(row, dict) else None
        match = re.match(r'CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(', definition or '')
        name = match[1] if match else None
        if name not in FUNCTIONS or name in found:
            unknown = True
            continue
        found[name] = row
    return found, unknown


def definition_parts(definition):
    match = re.fullmatch(r'(.*?)\nAS (\$[a-zA-Z_0-9]*\$)(.*)\2\n?', definition, re.S)
    return (match[1], match[3]) if match else None


def acl_entries(acl):
    if acl is None:
        return set(), 'DEFAULT'
    if not isinstance(acl, str) or not acl.startswith('{') or not acl.endswith('}'):
        return set(), 'UNRECOGNIZED_METADATA_SUPPRESSED'
    entries = set()
    for value in acl[1:-1].split(',') if acl[1:-1] else []:
        match = re.fullmatch(r'([a-z_]*?)=(X\*?)/([a-z_]+)', value)
        if not match:
            return set(), 'UNRECOGNIZED_METADATA_SUPPRESSED'
        role, grantor = match[1] or 'PUBLIC', match[3]
        if role not in ROLES or grantor not in ROLES:
            return set(), 'UNRECOGNIZED_METADATA_SUPPRESSED'
        entries.add((role, 'yes' if match[2] == 'X*' else 'no', grantor))
    return entries, 'EXPLICIT'


def function_differences(expected, observed):
    before, before_unknown = function_map(expected)
    after, after_unknown = function_map(observed)
    lines = []
    if before_unknown or after_unknown:
        lines.append('function.detail: UNRECOGNIZED_METADATA_SUPPRESSED')
    for name in FUNCTIONS:
        if name not in before and name not in after:
            continue
        if name not in before or name not in after:
            lines.append(f'function.{name}.presence: REVIEW_REQUIRED')
            continue
        left, right = before[name], after[name]
        for field in ('owner', 'definition', 'acl'):
            lines.append(f'function.{name}.{field}: ' +
                         ('MATCH' if left.get(field) == right.get(field) else 'REVIEW_REQUIRED'))
        parts = [definition_parts(row['definition']) for row in (left, right)]
        if all(parts):
            lines.append(f'function.{name}.header: ' + ('MATCH' if parts[0][0] == parts[1][0] else 'REVIEW_REQUIRED'))
            bodies = tuple(hashlib.sha256(p[1].replace('\r\n', '\n').encode()).hexdigest() for p in parts)
            body_state = ('MATCH' if bodies[0] == bodies[1] else
                          'PREVIOUSLY_REVIEWED_FORMAT_ONLY' if bodies == REVIEWED_FORMAT_PAIRS.get(name)
                          else 'REVIEW_REQUIRED')
            lines.append(f'function.{name}.body: ' + body_state)
        else:
            lines.append(f'function.{name}.parts: UNRECOGNIZED_METADATA_SUPPRESSED')
        a, a_state = acl_entries(left.get('acl'))
        b, b_state = acl_entries(right.get('acl'))
        lines.append(f'function.{name}.acl_kind: reference={a_state} observed={b_state}')
        if a_state == b_state == 'EXPLICIT':
            for kind, entries in (('missing', a - b), ('extra', b - a)):
                for role, grantable, grantor in sorted(entries):
                    lines.append(f'function.{name}.execute_{kind}: role={role} '
                                 f'grantable={grantable} grantor={grantor}')
    return lines
