# 烟笺云端部署状态

- Supabase organization: Smoke Notes（Free）。
- Project: smoke-notes / koundrkjeambrcodxkdd。
- Project URL: https://koundrkjeambrcodxkdd.supabase.co
- Dashboard shows Healthy; actual region is East US (Ohio), us-east-2.
- Database initialized through dashboard SQL editor in one transaction. UI returned `Success. No rows returned.`
- Schema includes the three original migrations and `202609050001_pairing_hardening.sql` behavior. Dashboard SQL execution does not register CLI migration history; reconcile history before a future `supabase db push`.
- Anonymous sign-ins enabled and saved.
- Deployed `create-pairing`, `redeem-pairing`, `apply-mutation` through dashboard editors. Shared HTTP helpers were inlined; local sources retain shared imports.
- User explicitly approved disabling legacy JWT verification for all three functions. OFF saved for each on 2026-09-05; internal user and workspace checks remain.
- Cloudflare account: 21861701f7418c927894fbbf1490691f. Direct Upload Pages project: smoke-notes-philip.
- Production web URL: https://smoke-notes-philip.pages.dev . Cloudflare reported deployment success and the live page rendered the six-digit pairing form.
- WEB_APP_URL saved as https://smoke-notes-philip.pages.dev . Frontend public configuration saved in gitignored root .env.
- Desktop 0.1.3 built and installed to D:\签\@smoke-notesdesktop with installer exit code 0. Installed app.asar SHA256 matches release: 06C91E0C1A3E470F8DA69FCA813E6A42C3D384AC8380220CB72E48CBDF9DCF47. App relaunched; no desktop tests run.
- User explicitly authorized enroll_local_workspace and temporary cloud verification records. RPC applied through SQL editor; returned Success. No rows returned.
- Live verification PASSED: two independent anonymous sessions paired to the same workspace; A-to-B and B-to-A note edits; empty title preservation; stale-version conflict; unrelated device denied read. Test note and notebook soft-deleted afterward. Report: outputs/live-sync-verification.json.
- Actual user phone pairing and installed desktop data synchronization still require user interaction; these were not observed.
- No desktop tests run in this deployment phase.

Next: user opens Settings / Connect phone in updated desktop and scans the code or enters it on the deployed web page. Do not confuse live API verification with observed real-phone acceptance.
