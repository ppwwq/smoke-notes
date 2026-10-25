"""Hosted planner RPC probe in its own synthetic workspace; no user data access."""
import copy
import datetime as dt
import uuid
from hosted_sync import Client, HostedHTTPError, check


def verify_planner(origin, key):
    a, b = Client(origin, key), Client(origin, key)
    workspace = a.request('/rest/v1/rpc/bootstrap_workspace', {})
    check(str(uuid.UUID(workspace)) == workspace, 'Invalid planner probe workspace')
    for client in (a, b):
        check(client.request('/rest/v1/rpc/planner_sync_capabilities', {}).get('planner') == 1,
              'Planner capability missing')
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    event_id, type_id, todo_id = (str(uuid.uuid4()) for _ in range(3))
    event = dict(id=event_id, workspaceId=workspace, title='Planner release probe only',
                 start='2026-10-25T09:00', end='2026-10-25T10:00', allDay=False,
                 color='purple', timeZone='Asia/Hong_Kong', notes='', location='', url='',
                 repeat={'frequency': 'weekly', 'interval': 1, 'weekdays': [0]},
                 exceptions={'2026-11-01': None}, importKey='probe-' + event_id,
                 typeId=type_id, deletedAt=None, updatedAt=now)

    def push(client, kind, record_id, value, base, op=None):
        return client.request('/rest/v1/rpc/apply_planner_mutation', {
            'p_operation_id': op or str(uuid.uuid4()), 'p_workspace_id': workspace,
            'p_kind': kind, 'p_id': record_id, 'p_payload': value, 'p_base_version': base})

    def rows(client):
        return client.request('/rest/v1/planner_records?workspace_id=eq.' + workspace + '&order=kind,id')

    op = str(uuid.uuid4())
    first = push(a, 'event', event_id, event, 0, op)
    check(first['status'] == 'applied' and first['record']['version'] == 1, 'Planner create failed')
    check(push(a, 'event', event_id, event, 0, op) == first, 'Planner retry changed receipt')
    check(rows(b) == [], 'Planner RLS leaked unpaired rows')
    denied = False
    try:
        push(b, 'event', event_id, event, 1)
    except HostedHTTPError as error:
        denied = error.status == 400  # Explicit workspace_forbidden PL/pgSQL exception.
    check(denied, 'Planner non-member write was not rejected')
    check(rows(a) == [first['record']], 'Denied planner write changed data')
    pair = a.request('/functions/v1/create-pairing', {'workspaceId': workspace})
    joined = b.request('/functions/v1/redeem-pairing', {'code': pair['code']})
    check(joined.get('workspaceId') == workspace, 'Planner pairing mismatch')
    check(rows(b) == [first['record']], 'Planner A to B pull failed')
    changed = copy.deepcopy(event)
    changed['title'] = 'Planner release probe edited on B'
    second = push(b, 'event', event_id, changed, 1)
    check(second['status'] == 'applied' and rows(a)[0]['payload'] == changed, 'Planner B to A failed')
    stale = push(a, 'event', event_id, event, 1)
    check(stale['status'] == 'conflict' and stale['record']['payload'] == changed, 'Planner conflict lost B edit')
    label = dict(id=type_id, workspaceId=workspace, name='Release probe', color='sage')
    link_id = workspace + ':' + todo_id
    link = dict(id=link_id, workspaceId=workspace, todoId=todo_id, typeId=type_id, time='09:30')
    check(push(a, 'type', type_id, label, 0)['status'] == 'applied', 'Planner label failed')
    check(push(b, 'link', link_id, link, 0)['status'] == 'applied', 'Planner todo time failed')
    check(len(rows(a)) == 3 and rows(a) == rows(b), 'Planner metadata diverged')
    deleted = copy.deepcopy(changed)
    deleted['deletedAt'] = now
    check(push(a, 'event', event_id, deleted, 2)['status'] == 'applied', 'Planner delete failed')
    stale = push(b, 'event', event_id, changed, 2)
    check(stale['status'] == 'conflict' and stale['record']['payload']['deletedAt'], 'Planner delete resurrected')
    for kind, record_id in (('type', type_id), ('link', link_id)):
        check(push(a, kind, record_id, None, 1)['status'] == 'applied', 'Planner metadata tombstone failed')
    retained = rows(b)
    check(len(retained) == 3 and all(r['payload'] is None or r['payload'].get('deletedAt') for r in retained),
          'Planner cleanup must retain only probe tombstones')
    print('PASS: hosted planner pairing/RLS, A-B-A, retry, CAS conflict, recurrence/exception/import preservation, label/time, tombstones.')
