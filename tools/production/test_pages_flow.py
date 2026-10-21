"""Offline deployment orchestration tests; no uploads or public requests."""
import contextlib
import copy
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlparse

import pages

SHA = 'a' * 40


def deployment(identifier='new'):
    return {'id': identifier, 'environment': 'production',
            'deployment_trigger': {'metadata': {'branch': 'main', 'commit_hash': SHA}},
            'latest_stage': {'name': 'deploy', 'status': 'success'}}


def project(canonical):
    return {'subdomain': pages.PROJECT + '.pages.dev', 'production_branch': 'main',
            'canonical_deployment': canonical}


class PagesProbeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dist = Path(self.temp.name)
        (self.dist / 'index.html').write_text('<html>offline fixture</html>')

    def run_release(self, responses, *, wrong_bytes=False, upload_code=0):
        def fetch(request, timeout):
            self.assertEqual(urlparse(request.full_url).hostname, pages.PROJECT + '.pages.dev')
            relative = urlparse(request.full_url).path.lstrip('/')
            data = b'wrong bytes' if wrong_bytes else (self.dist / relative).read_bytes()
            return io.BytesIO(data)
        self.api = patch('pages.api', side_effect=responses)
        with patch.dict('os.environ', {'RELEASE_SHA': SHA}, clear=True), patch('pages.DIST', self.dist), \
             self.api as api, patch('pages.subprocess.run', return_value=subprocess.CompletedProcess([], upload_code)) as upload, \
             patch('pages.urllib.request.urlopen', side_effect=fetch) as fetcher, patch('pages.time.sleep'), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.api_mock, self.upload_mock, self.fetch_mock, self.output = api, upload, fetcher, output
            pages.main()

    def test_previous_same_sha_is_skipped_until_new_production_deployment(self):
        old = deployment('old')
        self.run_release([project(old), project(old), project(deployment())])
        self.assertEqual(self.api_mock.call_count, 3)
        self.assertEqual(self.upload_mock.call_count, 1)
        self.assertEqual(self.fetch_mock.call_count, 2)  # HTML plus release.json
        self.assertIn('Production deployment: new', self.output.getvalue())

    def test_stale_preview_wrong_branch_sha_or_stage_is_never_confirmed(self):
        cases = [deployment('old')]
        for field, value in [('environment', 'preview'), ('latest_stage', {'name': 'build', 'status': 'success'}),
                             ('latest_stage', {'name': 'deploy', 'status': 'failure'})]:
            cases.append(dict(deployment(), **{field: value}))
        for field, value in [('branch', 'feature'), ('commit_hash', 'b' * 40)]:
            bad = copy.deepcopy(deployment())
            bad['deployment_trigger']['metadata'][field] = value
            cases.append(bad)
        for bad in cases:
            with self.subTest(candidate=bad), self.assertRaisesRegex(RuntimeError, 'not confirmed'):
                self.run_release([project(deployment('old'))] + [project(bad)] * 18)
            self.assertEqual(self.upload_mock.call_count, 1)
            self.fetch_mock.assert_not_called()

    def test_mismatched_public_bytes_fail_without_redeploy(self):
        with self.assertRaisesRegex(RuntimeError, 'bytes differ'):
            self.run_release([project(deployment('old')), project(deployment())], wrong_bytes=True)
        self.assertEqual(self.upload_mock.call_count, 1)

    def test_uncertain_upload_failure_is_not_retried(self):
        with self.assertRaisesRegex(RuntimeError, 'outcome may be uncertain'):
            self.run_release([project(deployment('old'))], upload_code=1)
        self.assertEqual(self.upload_mock.call_count, 1)
        self.assertEqual(self.api_mock.call_count, 1)
        self.fetch_mock.assert_not_called()


if __name__ == '__main__':
    unittest.main()
