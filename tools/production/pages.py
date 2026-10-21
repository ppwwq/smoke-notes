"""Deploy only static dist to the existing project, then verify production bytes."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error

PROJECT = 'smoke-notes-philipwwq'
ORIGIN = 'https://' + PROJECT + '.pages.dev'
DIST = Path('apps/web/dist')
STAGE = 'initialization'


def failure_report(error):
    # Never interpolate exception messages, response bodies, URLs or CLI output.
    kind = ('http' if isinstance(error, urllib.error.HTTPError) else
            'network' if isinstance(error, urllib.error.URLError) else
            'timeout' if isinstance(error, (TimeoutError, subprocess.TimeoutExpired)) else 'validation')
    status = f' http_status={error.code}' if isinstance(error, urllib.error.HTTPError) else ''
    return f'Pages verification failed: stage={STAGE} kind={kind}{status}. No automatic retry or rollback.'


def validate_dist(root):
    files = sorted(root.rglob('*'))
    allowed = {'.html', '.js', '.css', '.json', '.webmanifest', '.png', '.svg', '.ico', '.woff', '.woff2', '.txt'}
    for path in files:
        if path.is_symlink():
            raise RuntimeError('Symlink in dist')
        if path.is_dir():
            continue
        rel = path.relative_to(root)
        if any(part.startswith('.') for part in rel.parts) or path.suffix not in allowed:
            raise RuntimeError('Unexpected or sensitive file in dist')
        if path.name in ('_worker.js', 'package.json') or 'functions' in rel.parts:
            raise RuntimeError('Only static assets may be deployed')
    if not (root / 'index.html').is_file():
        raise RuntimeError('Missing built web entry')
    return [p for p in files if p.is_file()]


def api(path):
    account = os.environ['CLOUDFLARE_ACCOUNT_ID']
    if not re.fullmatch('[0-9a-f]{32}', account):
        raise RuntimeError('Invalid Cloudflare account')
    req = urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/{PROJECT}' + path,
        headers={'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN']})
    with urllib.request.urlopen(req, timeout=30) as response:
        data = json.load(response)
    if not data.get('success'):
        raise RuntimeError('Cloudflare API rejected request')
    return data['result']


def main(*, verify_only=False):
    global STAGE
    STAGE = 'validate_local_build'
    sha = os.environ['RELEASE_SHA']
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise RuntimeError('Invalid SHA')
    validate_dist(DIST)
    if verify_only:
        expected_id = os.environ.get('VERIFY_DEPLOYMENT_ID', '')
        if not re.fullmatch('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', expected_id):
            raise RuntimeError('An exact existing deployment ID is required')
        if json.loads((DIST / 'release.json').read_text()) != {'sha': sha}:
            raise RuntimeError('Local build marker must match the reviewed release')
    else:
        (DIST / 'release.json').write_text(json.dumps({'sha': sha}) + '\n')
    files = validate_dist(DIST)
    STAGE = 'read_project'
    project = api('')
    if project.get('subdomain') != PROJECT + '.pages.dev' or project.get('production_branch') != 'main':
        raise RuntimeError('Existing Pages target/branch does not match')
    previous_id = (project.get('canonical_deployment') or {}).get('id')
    # Never create a project or upload the repository, environment files or a dump.
    if not verify_only:
        STAGE = 'upload'
        result = subprocess.run(['wrangler', 'pages', 'deploy', str(DIST), '--project-name', PROJECT,
            '--branch', 'main', '--commit-hash', sha, '--commit-dirty=false'], capture_output=True, text=True, timeout=600)
        if result.returncode:
            raise RuntimeError('Pages upload failed; outcome may be uncertain, inspect dashboard before retry')
    deployment = None
    STAGE = 'confirm_canonical_deployment'
    for _ in range(1 if verify_only else 18):
        canonical = (project if verify_only else api('')).get('canonical_deployment') or {}
        metadata = canonical.get('deployment_trigger', {}).get('metadata', {})
        matches_id = canonical.get('id') == expected_id if verify_only else canonical.get('id') and canonical['id'] != previous_id
        if (matches_id
                and canonical.get('environment') == 'production'
                and metadata.get('branch') == 'main' and metadata.get('commit_hash') == sha
                and canonical.get('latest_stage', {}).get('name') == 'deploy'
                and canonical.get('latest_stage', {}).get('status') == 'success'):
            deployment = canonical
            break
        if not verify_only:
            time.sleep(5)
    if deployment is None:
        raise RuntimeError('Production deployment not confirmed; do not automatically redeploy/rollback')
    STAGE = 'compare_public_assets'
    for path in files:
        rel = path.relative_to(DIST).as_posix()
        expected = hashlib.sha256(path.read_bytes()).hexdigest()
        for attempt in range(6):
            req = urllib.request.Request(ORIGIN + '/' + rel + '?release=' + sha,
                                         headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=30) as response:
                actual = hashlib.sha256(response.read()).hexdigest()
            if actual == expected:
                break
            if attempt == 5:
                raise RuntimeError('Production bytes differ; stop and investigate, never roll back DB')
            time.sleep(5)
    STAGE = 'write_verification_report'
    report = f'Production deployment: {deployment["id"]}\nURL: {ORIGIN}/\nSHA: {sha}\nAll {len(files)} static files match. Interactive mobile acceptance still required.\n'
    print(report)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as stream:
            stream.write(report)


if __name__ == '__main__':
    try:
        if sys.argv[1:] not in ([], ['--verify-only']):
            raise RuntimeError('Unknown argument')
        main(verify_only=sys.argv[1:] == ['--verify-only'])
    except Exception as error:
        print(failure_report(error), file=sys.stderr)
        sys.exit(1)
