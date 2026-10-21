"""Recognize a reviewed hosted baseline without changing production ACLs."""
import hashlib

import audit_details


def functions_match(expected, observed):
    left, bad_left = audit_details.function_map(expected)
    right, bad_right = audit_details.function_map(observed)
    if bad_left or bad_right or set(left) != set(right):
        return False
    for name in left:
        a, b = left[name], right[name]
        if set(a) != {'owner', 'definition', 'acl'} or set(b) != set(a):
            return False
        if a['owner'] != b['owner']:
            return False
        acl_a, kind_a = audit_details.acl_entries(a['acl'])
        acl_b, kind_b = audit_details.acl_entries(b['acl'])
        if kind_a != 'EXPLICIT' or kind_b != 'EXPLICIT' or acl_a != acl_b:
            return False
        parts_a = audit_details.definition_parts(a['definition'])
        parts_b = audit_details.definition_parts(b['definition'])
        if not parts_a or not parts_b or parts_a[0] != parts_b[0]:
            return False
        bodies = tuple(hashlib.sha256(p[1].replace('\r\n', '\n').encode()).hexdigest()
                       for p in (parts_a, parts_b))
        if bodies[0] != bodies[1] and bodies != audit_details.REVIEWED_FORMAT_PAIRS.get(name):
            return False
    return True


def matches(reference, observed):
    expected, actual = reference.get('hosted_schema'), observed.get('schema')
    categories = set(reference.get('schema', {}))
    if (not isinstance(expected, dict) or not isinstance(actual, dict)
            or set(expected) != categories or set(actual) != categories
            or not categories or reference.get('major') != 17
            or observed.get('major') != 17 or observed.get('client_tls') is not True):
        return False
    for category in categories:
        if category == 'functions':
            if not functions_match(expected[category], actual[category]):
                return False
        elif expected[category] != actual[category]:
            return False
    return True
