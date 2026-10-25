// Run with: node tools/test-planner-database.mjs (isolated in-memory PostgreSQL).
/* global console */
import { PGlite } from "../work/android-validation/node_modules/@electric-sql/pglite/dist/index.js";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.workspaces(id uuid primary key);create table public.workspace_members(workspace_id uuid,user_id uuid);
create function public.is_workspace_member(w uuid) returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid())$$;
grant usage on schema auth to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;`);
await db.exec(
  await readFile("supabase/migrations/202610250001_planner_sync.sql", "utf8"),
);
const user = randomUUID(),
  other = randomUUID(),
  ws = randomUUID(),
  id = randomUUID();
await db.exec(
  `insert into auth.users values('${user}'),('${other}');insert into public.workspaces values('${ws}');insert into public.workspace_members values('${ws}','${user}');set role authenticated;set request.jwt.claim.sub='${user}';`,
);
const payload = {
  id,
  workspaceId: ws,
  title: "synthetic",
  start: "2026-10-25T09:00",
  end: "2026-10-25T10:00",
  allDay: false,
  color: "purple",
  timeZone: "Asia/Hong_Kong",
  notes: "",
  location: "",
  url: "",
  deletedAt: null,
  exceptions: {},
};
async function mutate(op, version, p = payload) {
  return (
    await db.query(
      "select public.apply_planner_mutation($1,$2,$3,$4,$5,$6) as result",
      [op, ws, "event", id, version, p],
    )
  ).rows[0].result;
}
const op = randomUUID();
for (const table of ["planner_records", "planner_receipts"]) {
  await assert.rejects(() => db.query(`truncate ${table}`), /permission denied/);
}
const first = await mutate(op, 0);
assert.equal(first.status, "applied");
assert.equal(first.record.version, 1);
assert.deepEqual(await mutate(op, 0), first);
await assert.rejects(
  () => mutate(op, 0, { ...payload, title: "changed payload" }),
  /operation_id_conflict/,
);
const conflict = await mutate(randomUUID(), 0, {
  ...payload,
  title: "offline",
});
assert.equal(conflict.status, "conflict");
assert.equal(conflict.record.payload.title, "synthetic");
await assert.rejects(
  () => db.query("update planner_records set version=90"),
  /permission denied/,
);
await assert.rejects(
  () => mutate(randomUUID(), 1, { ...payload, end: payload.start }),
  /invalid_event/,
);
await assert.rejects(
  () => mutate(randomUUID(), 1, { ...payload, timeZone: "bad/zone" }),
  /invalid_event/,
);
await assert.rejects(
  () =>
    mutate(randomUUID(), 1, {
      ...payload,
      exceptions: { "2026-10-26": { ...payload, title: "" } },
    }),
  /invalid_exception/,
);
await db.exec(`set request.jwt.claim.sub='${other}'`);
assert.equal((await db.query("select * from planner_records")).rows.length, 0);
await assert.rejects(() => mutate(randomUUID(), 1), /workspace_forbidden/);
await assert.rejects(() => mutate(op, 0), /workspace_forbidden/);
await db.exec(`set request.jwt.claim.sub='${user}'`);
const deleted = await mutate(randomUUID(), 1, {
  ...payload,
  deletedAt: "2026-10-25T00:00:00Z",
});
assert.equal(deleted.record.version, 2);
const stale = await mutate(randomUUID(), 1);
assert.equal(stale.status, "conflict");
assert.ok(stale.record.payload.deletedAt);
await db.exec("set role anon");
await assert.rejects(() => mutate(randomUUID(), 2), /permission denied/);
console.log(
  "PASS: planner PostgreSQL migration, validation, CAS, receipt binding, tombstones, RLS and anonymous denial",
);
await db.close();
