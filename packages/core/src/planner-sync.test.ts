import { afterEach, describe, expect, it } from "vitest";
import { SmokeNotesDatabase } from "./database";
import { LocalRepository } from "./repository";
import {
  PlannerSyncEngine,
  type PlannerRow,
  type PlannerSyncState,
  type PlannerTransport,
} from "./planner-sync";

const databases: SmokeNotesDatabase[] = [];
const workspace = "11111111-1111-4111-8111-111111111111";
const input = {
  title: "安排",
  start: "2026-10-25T09:00",
  end: "2026-10-25T10:00",
  allDay: false,
  notes: "",
  location: "",
  url: "",
  color: "purple" as const,
};
function device(transport: PlannerTransport) {
  const db = new SmokeNotesDatabase(crypto.randomUUID());
  databases.push(db);
  const repo = new LocalRepository(db, {
    workspaceId: workspace,
    deviceId: crypto.randomUUID(),
  });
  return { db, repo, sync: new PlannerSyncEngine(db, transport, workspace) };
}
function server() {
  const rows = new Map<string, PlannerRow>(),
    receipts = new Map<
      string,
      { status: "applied" | "conflict"; record: PlannerRow }
    >();
  let lose = false;
  const transport: PlannerTransport = {
    async capabilities() {},
    async push(s: PlannerSyncState) {
      const op = s.pending!;
      if (receipts.has(op.id)) return structuredClone(receipts.get(op.id)!);
      const key = `${s.kind}:${s.id}`,
        old = rows.get(key);
      const conflict = !!old && old.version !== s.version;
      const record = conflict
        ? old!
        : {
            workspace_id: workspace,
            kind: s.kind,
            id: s.id,
            version: (old?.version ?? 0) + 1,
            payload: op.payload,
          };
      if (!conflict) rows.set(key, structuredClone(record));
      const result = {
        status: conflict ? ("conflict" as const) : ("applied" as const),
        record,
      };
      receipts.set(op.id, structuredClone(result));
      if (lose) {
        lose = false;
        throw new Error("response lost");
      }
      return structuredClone(result);
    },
    async pull() {
      return structuredClone([...rows.values()]);
    },
  };
  return {
    transport,
    rows,
    loseNext: () => {
      lose = true;
    },
  };
}
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});
describe("calendar snapshot outbox", () => {
  it("migrates existing events and labels without changing IDs; then syncs edits both ways", async () => {
    const s = server(),
      a = device(s.transport),
      b = device(s.transport);
    const type = await a.repo.savePlannerType("工作", "sage");
    const event = await a.repo.saveCalendarEvent({ ...input, typeId: type.id });
    await a.sync.synchronize();
    await b.sync.synchronize();
    expect((await b.repo.listCalendarEvents())[0]).toEqual(event);
    expect(await b.repo.listPlannerTypes()).toEqual([type]);
    await b.repo.saveCalendarEvent(
      { ...input, title: "手机改动", typeId: type.id },
      event.id,
    );
    await b.sync.synchronize();
    await a.sync.synchronize();
    expect((await a.repo.listCalendarEvents())[0].title).toBe("手机改动");
  });
  it("retries the same receipt after a lost response and preserves newer local edits", async () => {
    const s = server(),
      a = device(s.transport);
    const event = await a.repo.saveCalendarEvent(input);
    s.loseNext();
    await expect(a.sync.synchronize()).rejects.toThrow("response lost");
    const pending = (await a.db.plannerSync.toArray())[0].pending!.id;
    await a.repo.saveCalendarEvent(
      { ...input, title: "saved while offline" },
      event.id,
    );
    await a.sync.synchronize();
    expect((await a.repo.listCalendarEvents())[0].title).toBe(
      "saved while offline",
    );
    expect((await a.db.plannerSync.toArray())[0].pending!.id).not.toBe(pending);
    await a.sync.synchronize();
    expect(s.rows.get(`event:${event.id}`)?.payload?.title).toBe(
      "saved while offline",
    );
    expect(s.rows.get(`event:${event.id}`)?.version).toBe(2);
  });
  it("preserves conflicting bodies as a visible event copy and an archive", async () => {
    const s = server(),
      a = device(s.transport),
      b = device(s.transport);
    const event = await a.repo.saveCalendarEvent(input);
    await a.sync.synchronize();
    await b.sync.synchronize();
    await a.repo.saveCalendarEvent({ ...input, title: "网页离线" }, event.id);
    await b.repo.saveCalendarEvent({ ...input, title: "手机离线" }, event.id);
    await a.sync.synchronize();
    await b.sync.synchronize();
    await b.sync.synchronize();
    await a.sync.synchronize();
    expect(
      (await a.repo.listCalendarEvents()).map((e) => e.title).sort(),
    ).toEqual(["手机离线（冲突副本）", "网页离线"].sort());
    expect(await b.db.plannerConflicts.count()).toBe(1);
  });
  it("does not resurrect deleted IDs when another device edits offline", async () => {
    const s = server(),
      a = device(s.transport),
      b = device(s.transport);
    const event = await a.repo.saveCalendarEvent(input);
    await a.sync.synchronize();
    await b.sync.synchronize();
    await a.repo.deleteCalendarEvent(event.id);
    await b.repo.saveCalendarEvent(
      { ...input, title: "still editing" },
      event.id,
    );
    await a.sync.synchronize();
    await b.sync.synchronize();
    expect((await b.db.calendarEvents.get(event.id))?.deletedAt).toBeTruthy();
    expect((await b.repo.listCalendarEvents())[0].id).not.toBe(event.id);
  });
  it("carries hard-deleted type tombstones and cleared event labels", async () => {
    const s = server(),
      a = device(s.transport),
      b = device(s.transport);
    const type = await a.repo.savePlannerType("标签", "purple");
    await a.repo.saveCalendarEvent({ ...input, typeId: type.id });
    await a.sync.synchronize();
    await b.sync.synchronize();
    await a.repo.deletePlannerType(type.id);
    await a.sync.synchronize();
    await b.sync.synchronize();
    expect(await b.repo.listPlannerTypes()).toEqual([]);
    expect((await b.repo.listCalendarEvents())[0].typeId).toBeNull();
    await b.sync.synchronize();
    expect(await b.repo.listPlannerTypes()).toEqual([]);
  });
  it("does not overwrite a new edit made during a pull", async () => {
    const s = server(),
      a = device(s.transport);
    const event = await a.repo.saveCalendarEvent(input);
    await a.sync.synchronize();
    const pull = s.transport.pull;
    s.transport.pull = async (w) => {
      await a.repo.saveCalendarEvent({ ...input, title: "typing" }, event.id);
      return pull(w);
    };
    await a.sync.synchronize();
    expect((await a.repo.listCalendarEvents())[0].title).toBe("typing");
    expect(await a.sync.pendingCount()).toBe(1);
  });
  it("never sends rows from another workspace", async () => {
    const s = server(),
      a = device(s.transport);
    await a.db.calendarEvents.put({
      ...input,
      id: crypto.randomUUID(),
      workspaceId: "elsewhere",
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      exceptions: {},
    });
    await a.sync.synchronize();
    expect(s.rows.size).toBe(0);
  });
  it("keeps recurrence exceptions, import identity and per-device preferences", async () => {
    const s = server(),
      a = device(s.transport),
      b = device(s.transport);
    const event = await a.repo.saveCalendarEvent({
      ...input,
      repeat: { frequency: "weekly", interval: 2, weekdays: [0, 3] },
    });
    await a.repo.saveCalendarEvent(
      { ...input, title: "本次例外" },
      event.id,
      "2026-10-28",
    );
    await a.db.calendarEvents.update(event.id, { importKey: "ics:test" });
    await a.sync.synchronize();
    await b.sync.synchronize();
    expect(await b.db.calendarEvents.get(event.id)).toEqual(
      await a.db.calendarEvents.get(event.id),
    );
    expect(await b.db.plannerPreferences.count()).toBe(0);
  });
});
