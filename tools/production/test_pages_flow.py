"""Offline deployment orchestration tests; no uploads or public requests."""
import contextlib
import copy
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlparse
from urllib.error import HTTPError

import pages

SHA = 'a' * 40
DEPLOYMENT_ID = 'b5ae5285-bbcb-43d8-8de2-c401a4ef0ebb'


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
            self.assertEqual(request.get_header('User-agent'),
                             'SmokeNotesReleaseVerifier/1.0 (+https://github.com/ppwwq/smoke-notes)')
            self.assertEqual(request.get_header('Cache-control'), 'no-cache')
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

    def verify_existing(self, canonical, *, fetch_error=None):
        (self.dist / 'release.json').write_text(json.dumps({'sha': SHA}) + '\n')
        before = {p.name: p.read_bytes() for p in self.dist.iterdir()}

        def fetch(request, timeout):
            self.assertEqual(request.get_header('User-agent'),
                             'SmokeNotesReleaseVerifier/1.0 (+https://github.com/ppwwq/smoke-notes)')
            self.assertEqual(request.get_header('Cache-control'), 'no-cache')
            if fetch_error:
                raise fetch_error
            return io.BytesIO((self.dist / urlparse(request.full_url).path.lstrip('/')).read_bytes())

        with patch.dict('os.environ', {'RELEASE_SHA': SHA, 'VERIFY_DEPLOYMENT_ID': DEPLOYMENT_ID}, clear=True), \
             patch('pages.DIST', self.dist), patch('pages.api', return_value=project(canonical)) as api, \
             patch('pages.subprocess.run') as upload, patch('pages.urllib.request.urlopen', side_effect=fetch) as fetcher, \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.api_mock, self.upload_mock, self.fetch_mock, self.output = api, upload, fetcher, output
            try:
                pages.main(verify_only=True)
            finally:
                upload.assert_not_called()
                self.assertEqual(before, {p.name: p.read_bytes() for p in self.dist.iterdir()})

    def test_verify_existing_exact_deployment_without_upload_or_local_writes(self):
        self.verify_existing(deployment(DEPLOYMENT_ID))
        self.assertEqual(self.api_mock.call_count, 1)
        self.assertEqual(self.fetch_mock.call_count, 2)
        self.assertIn('All 2 static files match', self.output.getvalue())

    def test_verify_existing_rejects_wrong_id_sha_or_preview_before_public_reads(self):
        cases = [deployment('some-other-deployment')]
        wrong_sha = deployment(DEPLOYMENT_ID)
        wrong_sha['deployment_trigger']['metadata']['commit_hash'] = 'b' * 40
        cases += [wrong_sha, dict(deployment(DEPLOYMENT_ID), environment='preview')]
        for candidate in cases:
            with self.subTest(candidate=candidate), self.assertRaisesRegex(RuntimeError, 'not confirmed'):
                self.verify_existing(candidate)
            self.fetch_mock.assert_not_called()

    def test_public_denial_is_not_retried_and_diagnostic_omits_sensitive_exception(self):
        error = HTTPError('https://example.invalid/private?secret=never-print', 403,
                          'sensitive response text', {'Authorization': 'secret'}, None)
        with self.assertRaises(HTTPError):
            self.verify_existing(deployment(DEPLOYMENT_ID), fetch_error=error)
        self.assertEqual(self.fetch_mock.call_count, 1)
        self.assertEqual(pages.failure_report(error),
                         'Pages verification failed: stage=compare_public_assets kind=http http_status=403. No automatic retry or rollback.')

    def test_missing_verification_identity_fails_before_network_or_upload(self):
        with patch.dict('os.environ', {'RELEASE_SHA': SHA}, clear=True), patch('pages.DIST', self.dist), \
             patch('pages.api') as api, patch('pages.subprocess.run') as upload:
            with self.assertRaisesRegex(RuntimeError, 'exact existing deployment ID'):
                pages.main(verify_only=True)
            api.assert_not_called()
            upload.assert_not_called()

    def test_backend_workflow_cannot_publish_or_verify_the_web(self):
        workflow = (Path(__file__).resolve().parents[2] / '.github/workflows/release-production.yml').read_text()
        for removed in ('\n  web:', '\n  verify_web:', 'environment: production-web',
                        'CLOUDFLARE_API_TOKEN', 'tools/production/pages.py', 'wrangler'):
            self.assertNotIn(removed, workflow)
        self.assertIn('environment: production-backend', workflow)
        self.assertIn('python3 tools/production/guard.py --release', workflow)



if __name__ == '__main__':
    unittest.main()
