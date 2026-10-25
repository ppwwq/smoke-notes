"""Real hosted Auth/Edge/PostgREST test, only new anonymous accounts/workspace.
Not a browser, IndexedDB engine, physical-device or Realtime transport test.
No service-role key, persistent test credentials, or permanent deletion.
"""
import copy
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid


class HostedHTTPError(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__(f'Hosted request failed with HTTP {status}')


def check(ok, message):
    if not ok:
        raise RuntimeError(message)


class Client:
    def __init__(self, origin, key):
        self.origin, self.key, self.token = origin, key, None
        response = self.request('/auth/v1/signup', {'data': {'release_probe': True}})
        self.token = response['access_token']
        # Mask freshly generated session credentials before any later exception/output.
        for value in (self.token, response.get('refresh_token')):
            if value and os.environ.get('GITHUB_ACTIONS') == 'true':
                print('::add-mask::' + value)

    def request(self, path, body=None):
        headers = {'apikey': self.key, 'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        request = urllib.request.Request(self.origin + path,
            data=None if body is None else json.dumps(body).encode(), headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Bodies can contain credentials, SQL details or row content. Never print them.
            raise HostedHTTPError(error.code) from None

    def todos(self, workspace):
        return self.request('/rest/v1/todos?workspace_id=eq.' + workspace + '&select=*')

    def push(self, payload, base, operation_id=None):
        result = self.request('/functions/v1/apply-mutation', {'operation': {
            'id': operation_id or str(uuid.uuid4()), 'entity': 'todo', 'entityId': payload['id'],
            'baseVersion': base, 'action': 'delete' if payload.get('deletedAt') else 'upsert',
            'payload': payload}})
        check(result.get('todoPlanningVersion') == 1, 'Planning acknowledgement missing')
        return result


def payload(row):
    return {'id': row['id'], 'workspaceId': row['workspace_id'], 'text': row['text'],
            'rank': row['rank'], 'completed': row['completed'], 'deletedAt': row['deleted_at'],
            'planning': copy.deepcopy(row['planning'])}


def verify(a, b):
    workspace = a.request('/rest/v1/rpc/bootstrap_workspace', {})
    check(isinstance(workspace, str) and str(uuid.UUID(workspace)) == workspace, 'Invalid test workspace')
    check(a.todos(workspace) == [], 'Fresh test workspace must be empty')
    for client in (a, b):
        cap = client.request('/functions/v1/apply-mutation', {'capabilities': True})
        check(cap.get('capabilities', {}).get('todoPlanning') == 1, 'Planning not deployed')
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    date = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=8)).date().isoformat()
    sid, rid, oid = (str(uuid.uuid4()) for _ in range(3))
    series = {'id': sid, 'workspaceId': workspace, 'text': 'Release probe only', 'rank': 0,
              'completed': False, 'deletedAt': None, 'planning': {'version': 1, 'kind': 'series',
              'revisions': [{'id': rid, 'effectiveFrom': date, 'changedAt': now,
              'text': 'Release probe only', 'notes': '', 'repeat': {'kind': 'daily'},
              'paused': False, 'stopped': False}]}}
    check(a.push(series, 0)['status'] == 'applied', 'Series write failed')
    owner_rows = a.todos(workspace)
    check(len(owner_rows) == 1 and owner_rows[0]['id'] == sid and owner_rows[0]['version'] == 1,
          'Owner must see probe before RLS check')
    check(b.todos(workspace) == [], 'Unpaired session read the existing probe')
    unauthorized = copy.deepcopy(series)
    unauthorized['text'] = 'Unauthorized release probe edit'
    unauthorized['planning']['revisions'][0]['text'] = unauthorized['text']
    denied = False
    try:
        b.push(unauthorized, 1)
    except HostedHTTPError as error:
        denied = error.status == 403
    check(denied, 'Unpaired mutation must be rejected with 403')
    check(a.todos(workspace) == owner_rows, 'Denied write changed owner data')
    pair = a.request('/functions/v1/create-pairing', {'workspaceId': workspace})
    joined = b.request('/functions/v1/redeem-pairing', {'code': pair['code']})
    check(joined.get('workspaceId') == workspace, 'Pairing mismatch')
    occurrence = {'id': oid, 'workspaceId': workspace, 'text': 'Release probe only', 'rank': 1,
                  'completed': False, 'deletedAt': None,
                  'planning': {'version': 1, 'kind': 'occurrence', 'seriesId': sid,
                               'date': date, 'status': 'open', 'generated': True}}
    op = str(uuid.uuid4())
    check(a.push(occurrence, 0, op)['status'] == 'applied', 'A write failed')
    check(a.push(occurrence, 0, op)['status'] == 'applied', 'Idempotent retry failed')
    rows = b.todos(workspace)
    current = next(r for r in rows if r['id'] == oid)
    check(len(rows) == 2 and current['planning']['date'] == date, 'A to B pull failed')
    edited = payload(current)
    edited['completed'] = True
    stamp = {'id': str(uuid.uuid4()), 'at': now}
    edited['planning'].update(status='completed', generated=False, completedAt=now,
                             clocks={'status': stamp}, events=[{**stamp, 'status': 'completed', 'completedAt': now}])
    check(b.push(edited, current['version'])['status'] == 'applied', 'B completion failed')
    # A's old/offline create must conflict and return B's intact completion.
    conflict = a.push(occurrence, 0)
    check(conflict['status'] == 'conflict' and conflict['record']['completed'], 'Offline conflict lost completion')
    complete = next(r for r in a.todos(workspace) if r['id'] == oid)
    check(complete['planning']['events'], 'Status history missing')
    undone = payload(complete)
    undone['completed'] = False
    undo_stamp = {'id': str(uuid.uuid4()), 'at': dt.datetime.now(dt.timezone.utc).isoformat()}
    undone['planning'].update(status='open', completedAt=None, clocks={'status': undo_stamp})
    undone['planning']['events'].append({**undo_stamp, 'status': 'open', 'completedAt': None})
    check(a.push(undone, complete['version'])['status'] == 'applied', 'Undo write failed')
    check(not next(r for r in b.todos(workspace) if r['id'] == oid)['completed'], 'Undo pull failed')
    # Tombstone only our synthetic rows; retain accounts/workspace/history for audit.
    for row in a.todos(workspace):
        check(row['id'] in (sid, oid), 'Unexpected row: refuse cleanup')
        deleted = payload(row)
        deleted['deletedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        check(a.push(deleted, row['version'])['status'] == 'applied', 'Soft cleanup failed')
    kept = b.todos(workspace)
    check(len(kept) == 2 and all(r['deleted_at'] for r in kept), 'Tombstone sync failed')
    print('PASS: two new anonymous clients, isolated workspace, pairing/RLS, A↔B pull, retry/conflict, complete/undo/history, soft deletion.')
    print('Test accounts/workspace remain for audit; no permanent deletion. This is API verification, not UI/Realtime acceptance.')


def public_config():
    ref = os.environ['SUPABASE_PROJECT_REF']
    check(bool(re.fullmatch('[a-z]{20}', ref)), 'Invalid project')
    origin = 'https://' + ref + '.supabase.co'
    key = os.environ['SUPABASE_PUBLISHABLE_KEY']
    check(key.startswith('sb_publishable_') or key.startswith('eyJ'), 'Use public publishable/anon key')
    if key.startswith('eyJ'):
        import base64
        claims = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))
        check(claims.get('role') == 'anon', 'Never use service-role JWT for this test')
    return origin, key


def main():
    origin, key = public_config()
    if "--config-only" in sys.argv:
        print("Public client configuration validated; no hosted requests sent.")
        return
    verify(Client(origin, key), Client(origin, key))
    from hosted_planner import verify_planner
    verify_planner(origin, key)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Hosted sync verification FAILED; stop release. Synthetic rows may remain; no blind cleanup.', file=sys.stderr)
        sys.exit(1)
