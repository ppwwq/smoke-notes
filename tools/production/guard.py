"""Fail-closed release identity, environment and MANUAL backup attestation gate."""
import datetime as dt
import json
import os
import re
import sys
import urllib.request

REPO = 'ppwwq/smoke-notes'
WORKFLOW = '.github/workflows/release-production.yml'
ENVIRONMENTS = ('production-backend', 'production-web')


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def api(path):
    request = urllib.request.Request('https://api.github.com/repos/' + REPO + path,
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def validate_context(env, current_main):
    sha = env.get('RELEASE_SHA', '')
    require(bool(re.fullmatch('[0-9a-f]{40}', sha)), 'Expected a full reviewed commit SHA')
    require(env.get('GITHUB_REPOSITORY') == REPO, 'Wrong repository')
    require(env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch', 'Manual dispatch only')
    require(env.get('GITHUB_REF') == 'refs/heads/main', 'Select main, not a branch/tag')
    require(env.get('GITHUB_WORKFLOW_REF') == f'{REPO}/{WORKFLOW}@refs/heads/main', 'Untrusted workflow ref')
    require(sha == env.get('GITHUB_SHA') == env.get('GITHUB_WORKFLOW_SHA') == current_main,
            'Reviewed SHA must be the workflow SHA and current main; dispatch again after review')


def validate_environment(config, branches):
    require(config.get('can_admins_bypass') is False, 'Disable environment admin bypass')
    policy = config.get('deployment_branch_policy') or {}
    require(policy.get('custom_branch_policies') is True, 'Use selected deployment branches')
    require([(b.get('name'), b.get('type')) for b in branches] == [('main', 'branch')],
            'Environment must allow only the main branch, no tags or wildcards')
    reviews = [r for r in config.get('protection_rules', []) if r.get('type') == 'required_reviewers']
    require(any(r.get('reviewers') and r.get('prevent_self_review') is True for r in reviews),
            'Require an independent reviewer and prevent self review')


def validate_attestation(record, sha, evidence, project, now=None):
    """Validate freshness/binding, NOT the backup bytes or actual restore operation."""
    now = now or dt.datetime.now(dt.timezone.utc)
    require(record.get('release_sha') == sha and record.get('project_ref') == project,
            'Backup attestation does not match this release/project')
    require(record.get('evidence_id') == evidence and bool(re.fullmatch(r'[A-Za-z0-9_-]{8,100}', evidence)),
            'Use the exact opaque evidence ID approved by the reviewer')
    require(record.get('restore_verified') is True and record.get('retained') is True,
            'Retained backup and isolated restore verification are mandatory')
    require(bool(record.get('isolated_restore_target')) and record.get('isolated_restore_target') != project and bool(record.get('reviewer')),
            'Missing restore target/reviewer')
    for field in ('backup_sha256',):
        require(bool(re.fullmatch('[0-9a-f]{64}', record.get(field, ''))), 'Missing backup SHA-256')
    made = dt.datetime.fromisoformat(record['backup_at'])
    restored = dt.datetime.fromisoformat(record['restore_verified_at'])
    expires = dt.datetime.fromisoformat(record['retained_until'])
    require(made.tzinfo is not None and restored.tzinfo is not None and expires.tzinfo is not None,
            'Use timestamps with timezone offsets')
    require(now - dt.timedelta(hours=24) <= made <= restored <= now,
            'Backup/restore evidence must be chronological and less than 24h old')
    require(expires >= now + dt.timedelta(days=7), 'Retain the backup at least seven more days')


def main():
    validate_context(os.environ, api('/git/ref/heads/main')['object']['sha'])
    for name in ENVIRONMENTS:
        config = api('/environments/' + name)
        branches = api('/environments/' + name + '/deployment-branch-policies?per_page=100')
        require(branches.get('total_count') == 1, 'Exactly one deployment branch rule is required')
        validate_environment(config, branches['branch_policies'])
    if '--backup' in sys.argv:
        require(os.environ.get('RELEASE_ENABLED') == 'true', 'Release setup not enabled by owner')
        validate_attestation(json.loads(os.environ['BACKUP_RESTORE_ATTESTATION']),
            os.environ['RELEASE_SHA'], os.environ['BACKUP_EVIDENCE_ID'], os.environ['SUPABASE_PROJECT_REF'])
        print('Manual backup attestation accepted; reviewer, not this script, verified backup/restore.')
    print('Reviewed main SHA and protected environments verified.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never echo API response bodies, credentials, URLs or attestation contents.
        print('Release guard failed. Check SHA, environment protection and backup evidence; no bypass.', file=sys.stderr)
        sys.exit(1)
