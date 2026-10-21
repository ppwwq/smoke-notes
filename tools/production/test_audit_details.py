import copy
import unittest

import audit_details as details
import audit_only as audit


class AuditDetailTests(unittest.TestCase):
    def test_grant_changes_report_only_known_metadata(self):
        grant = dict(table_name='notes', grantee='authenticated', privilege_type='SELECT',
                     is_grantable=False, grantor='postgres')
        extra = dict(grant, grantee='service_role', privilege_type='DELETE')
        report = '\n'.join(details.grant_differences([grant], [extra]))
        self.assertIn('grant.missing: table=notes role=authenticated privilege=SELECT', report)
        self.assertIn('grant.extra: table=notes role=service_role privilege=DELETE', report)
        for field in ('table_name', 'grantee', 'privilege_type', 'grantor', 'is_grantable'):
            report = '\n'.join(details.grant_differences([grant], [dict(grant, **{field:'secret-payload'})]))
            self.assertIn('UNRECOGNIZED_METADATA_SUPPRESSED', report)
            self.assertNotIn('secret-payload', report)

    def test_function_body_and_acl_changes_do_not_leak_source(self):
        expected = dict(definition='CREATE OR REPLACE FUNCTION public.is_workspace_member(target_workspace uuid)\n'
                        ' RETURNS boolean\n LANGUAGE sql\nAS $function$select true;$function$\n',
                        owner='postgres', acl='{postgres=X/postgres,authenticated=X/postgres}')
        actual = dict(expected, definition=expected['definition'].replace('true', "'private-body'"),
                      acl='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
        report = '\n'.join(details.function_differences([expected], [actual]))
        self.assertIn('function.is_workspace_member.header: MATCH', report)
        self.assertIn('function.is_workspace_member.body: REVIEW_REQUIRED', report)
        self.assertIn('execute_extra: role=service_role grantable=no grantor=postgres', report)
        self.assertNotIn('private-body', report)
        bad = dict(actual, acl='{secret-role=X/postgres}', owner='secret-owner')
        report = '\n'.join(details.function_differences([expected], [bad]))
        self.assertNotIn('secret-', report)
        self.assertIn('UNRECOGNIZED_METADATA_SUPPRESSED', report)

    def test_unknown_function_names_are_suppressed(self):
        row = dict(definition='CREATE OR REPLACE FUNCTION public.secret_function()\nAS $$secret$$',
                   owner='secret', acl=None)
        report = '\n'.join(details.function_differences([], [row]))
        self.assertEqual(report, 'function.detail: UNRECOGNIZED_METADATA_SUPPRESSED')

    def test_reviewed_format_pair_is_diagnostic_only(self):
        header = 'CREATE OR REPLACE FUNCTION public.is_workspace_member(target_workspace uuid)\n RETURNS boolean\n LANGUAGE sql'
        expected_body = '\n  select exists (\n    select 1 from public.workspace_members\n    where workspace_id = target_workspace and user_id = auth.uid()\n  );\n'
        actual_body = ' select exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=auth.uid()); '
        def row(body):
            return dict(definition=header + '\nAS $function$' + body + '$function$\n', owner='postgres', acl=None)
        reference = {'major':17, 'schema':{k:[] for k in audit.CATEGORIES}}
        reference['schema']['functions'] = [row(expected_body)]
        observed = dict(copy.deepcopy(reference), client_tls=True)
        observed['schema']['functions'] = [row(actual_body)]
        report, passed = audit.compare(reference, observed, {'exists':True,'versions':list(audit.VERSIONS)})
        self.assertIn('body: PREVIOUSLY_REVIEWED_FORMAT_ONLY', report)
        self.assertIn('functions: REVIEW_REQUIRED', report)
        self.assertFalse(passed)

    def test_detail_reporting_never_turns_drift_into_a_pass(self):
        reference = {'major':17, 'schema':{k:[] for k in audit.CATEGORIES}}
        observed = dict(copy.deepcopy(reference), client_tls=True)
        observed['schema']['table_grants'] = [dict(table_name='notes', grantee='service_role',
            privilege_type='SELECT', is_grantable=False, grantor='postgres')]
        report, passed = audit.compare(reference, observed, {'exists':True,'versions':list(audit.VERSIONS)})
        self.assertFalse(passed)
        self.assertIn('table_grants: REVIEW_REQUIRED', report)


if __name__ == '__main__':
    unittest.main()
