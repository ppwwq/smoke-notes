"""Offline protocol model: tests the release probe, not a real hosted RLS policy."""
import contextlib
import copy
import io
import unittest
from unittest.mock import patch

import hosted_sync

WORKSPACE = '11111111-1111-4111-8111-111111111111'


class Model:
    def __init__(self, *, leak_reads=False, allow_writes=False, denial_status=403, mutate_on_denial=False):
        self.rows = {}
        self.operations = {}
        self.joined = False
        self.leak_reads, self.allow_writes, self.denial_status = leak_reads, allow_writes, denial_status
        self.mutate_on_denial = mutate_on_denial
        self.events = []


class FakeClient:
    def __init__(self, model, owner):
        self.model, self.owner = model, owner

    def request(self, path, body=None):
        if path.endswith('bootstrap_workspace'):
            return WORKSPACE
        if path.endswith('apply-mutation') and body == {'capabilities': True}:
            return {'capabilities': {'todoPlanning': 1}}
        if path.endswith('create-pairing'):
            self.model.events.append('create-pairing')
            return {'code': 'fake-code'}
        if path.endswith('redeem-pairing'):
            self.model.joined = True
            return {'workspaceId': WORKSPACE}
        raise AssertionError('Unexpected fake request: ' + path)

    def todos(self, workspace):
        assert workspace == WORKSPACE
        m = self.model
        if not self.owner and not m.joined:
            m.events.append(('unpaired-read', len(m.rows)))
            if not m.leak_reads:
                return []
        return copy.deepcopy(list(m.rows.values()))

    def push(self, payload, base, operation_id=None):
        m = self.model
        if not self.owner and not m.joined:
            m.events.append(('unpaired-write', len(m.rows)))
            if not m.allow_writes:
                if m.mutate_on_denial:
                    m.rows[payload['id']]['text'] = payload['text']
                raise hosted_sync.HostedHTTPError(m.denial_status)
        if operation_id and operation_id in m.operations:
            return copy.deepcopy(m.operations[operation_id])
        previous = m.rows.get(payload['id'])
        if (previous['version'] if previous else 0) != base:
            return {'status': 'conflict', 'record': copy.deepcopy(previous)}
        row = {key: copy.deepcopy(payload[key]) for key in ('id', 'text', 'rank', 'completed', 'planning')}
        row.update(workspace_id=payload['workspaceId'], deleted_at=payload['deletedAt'], version=base + 1)
        m.rows[row['id']] = row
        result = {'status': 'applied', 'record': copy.deepcopy(row)}
        if operation_id:
            m.operations[operation_id] = result
        return copy.deepcopy(result)


class HostedProbeTests(unittest.TestCase):
    def setUp(self):
        # Fail loudly if a future refactor accidentally escapes the offline model.
        blocker = patch('urllib.request.urlopen', side_effect=AssertionError('Network forbidden in offline tests'))
        blocker.start()
        self.addCleanup(blocker.stop)

    def verify(self, model):
        with contextlib.redirect_stdout(io.StringIO()):
            hosted_sync.verify(FakeClient(model, True), FakeClient(model, False))

    def test_full_probe_checks_populated_workspace_before_pairing(self):
        model = Model()
        self.verify(model)
        self.assertEqual(model.events[:3], [('unpaired-read', 1), ('unpaired-write', 1), 'create-pairing'])
        self.assertEqual(len(model.rows), 2)
        self.assertTrue(all(row['deleted_at'] for row in model.rows.values()))
        occurrence = next(row for row in model.rows.values() if row['planning']['kind'] == 'occurrence')
        self.assertEqual(occurrence['version'], 4)  # create, complete, undo, tombstone; retry/conflict add no version
        self.assertEqual([e['status'] for e in occurrence['planning']['events']], ['completed', 'open'])

    def test_unpaired_read_leak_is_detected_before_pairing(self):
        model = Model(leak_reads=True)
        with self.assertRaisesRegex(RuntimeError, 'Unpaired session read'):
            self.verify(model)
        self.assertFalse(model.joined)
        self.assertEqual(len(model.rows), 1)

    def test_unpaired_write_without_403_is_detected_before_pairing(self):
        model = Model(allow_writes=True)
        with self.assertRaisesRegex(RuntimeError, 'must be rejected with 403'):
            self.verify(model)
        self.assertFalse(model.joined)

    def test_unrelated_auth_failure_cannot_masquerade_as_rls_success(self):
        model = Model(denial_status=401)
        with self.assertRaisesRegex(RuntimeError, 'must be rejected with 403'):
            self.verify(model)
        self.assertFalse(model.joined)

    def test_403_with_side_effects_cannot_masquerade_as_rls_success(self):
        model = Model(mutate_on_denial=True)
        with self.assertRaisesRegex(RuntimeError, 'Denied write changed owner data'):
            self.verify(model)
        self.assertFalse(model.joined)


if __name__ == '__main__':
    unittest.main()
