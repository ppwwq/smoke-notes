import type { Table } from "dexie";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmokeNotesDatabase } from "./database";

export type PlannerKind = "event" | "type" | "link";
export type PlannerPayload = Record<string, unknown>;
export interface PlannerRow {
  workspace_id: string;
  kind: PlannerKind;
  id: string;
  version: number;
  payload: PlannerPayload | null;
}
export interface PlannerSyncState {
  key: string;
  workspaceId: string;
  kind: PlannerKind;
  id: string;
  version: number;
  snapshot: PlannerPayload | null;
  pending?: { id: string; payload: PlannerPayload | null };
  /** The server refused this exact payload; skip it until the record changes. */
  rejected?: { payload: PlannerPayload | null; reason: string };
}
export interface PlannerConflict {
  id: string;
  workspaceId: string;
  kind: PlannerKind;
  recordId: string;
  local: PlannerPayload | null;
  remote: PlannerPayload | null;
  createdAt: string;
  /** Set when the server refused the record (for example "invalid_event"). */
  reason?: string;
}
export interface PlannerTransport {
  capabilities(): Promise<void>;
  push(
    state: PlannerSyncState,
  ): Promise<{ status: "applied" | "conflict"; record: PlannerRow }>;
  pull(workspaceId: string): Promise<PlannerRow[]>;
}
// Compare semantic JSON, not property insertion order or device timestamps.
export function plannerFingerprint(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(plannerFingerprint).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([k, v]) => v !== undefined && k !== "updatedAt")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${plannerFingerprint(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const equal = (a: unknown, b: unknown) =>
  plannerFingerprint(a) === plannerFingerprint(b);
const kinds: PlannerKind[] = ["type", "event", "link"];

// Errors the server raises after checking a record. Sending the same record
// again would fail the same way, so it is set aside instead of retried forever.
const serverRejections = new Set([
  "invalid_operation",
  "invalid_payload",
  "invalid_event",
  "invalid_exception",
  "invalid_type",
  "invalid_link",
  "invalid_time",
  "missing_remote_record",
  "operation_id_conflict",
]);
function serverRejection(error: unknown): string | null {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && serverRejections.has(message)
    ? message
    : null;
}

/** A durable snapshot outbox. Scan and pull-merge run in local transactions so
 * edits made during network requests cannot be overwritten. Persisted local
 * rows are the source of truth even if the process dies before the next scan. */
export class PlannerSyncEngine {
  constructor(
    private db: SmokeNotesDatabase,
    private transport: PlannerTransport,
    private workspaceId: string,
  ) {}
  private table(kind: PlannerKind): Table<PlannerPayload, string> {
    return {
      event: this.db.calendarEvents,
      type: this.db.plannerTypes,
      link: this.db.todoTypeLinks,
    }[kind] as unknown as Table<PlannerPayload, string>;
  }
  private key(kind: PlannerKind, id: string) {
    return `${this.workspaceId}:${kind}:${id}`;
  }
  private localTables() {
    return [
      this.db.calendarEvents,
      this.db.plannerTypes,
      this.db.todoTypeLinks,
      this.db.plannerSync,
      this.db.plannerConflicts,
    ];
  }
  private async scan() {
    await this.db.transaction("rw", this.localTables(), async () => {
      for (const kind of kinds) {
        const records = await this.table(kind)
          .where("workspaceId")
          .equals(this.workspaceId)
          .toArray();
        const states = await this.db.plannerSync
          .where("workspaceId")
          .equals(this.workspaceId)
          .filter((s) => s.kind === kind)
          .toArray();
        const ids = new Set([
          ...records.map((r) => String(r.id)),
          ...states.map((s) => s.id),
        ]);
        const locals = new Map(records.map((r) => [String(r.id), r]));
        const known = new Map(states.map((s) => [s.id, s]));
        for (const id of ids) {
          const payload = locals.get(id) ?? null;
          const state = known.get(id) ?? {
            key: this.key(kind, id),
            workspaceId: this.workspaceId,
            kind,
            id,
            version: 0,
            snapshot: null,
          };
          // A payload the server already refused waits until the user edits it.
          const refused =
            !!state.rejected && equal(payload, state.rejected.payload);
          // Never alter a sent payload while its acknowledgement is uncertain.
          if (!state.pending && !refused && !equal(payload, state.snapshot)) {
            state.pending = { id: crypto.randomUUID(), payload };
            state.rejected = undefined;
            await this.db.plannerSync.put(state);
          }
        }
      }
    });
  }
  async synchronize() {
    await this.transport.capabilities();
    await this.scan();
    const states = await this.db.plannerSync
      .where("workspaceId")
      .equals(this.workspaceId)
      .filter((s) => !!s.pending)
      .toArray();
    for (const state of states) {
      let result: Awaited<ReturnType<PlannerTransport["push"]>>;
      try {
        result = await this.transport.push(state);
      } catch (error) {
        const reason = serverRejection(error);
        if (!reason) throw error; // network or unknown: retry next round
        await this.setAside(state, reason);
        continue;
      }
      if (
        !["applied", "conflict"].includes(result.status) ||
        result.record.workspace_id !== this.workspaceId ||
        result.record.id !== state.id ||
        result.record.kind !== state.kind ||
        !Number.isInteger(result.record.version) ||
        result.record.version < 1
      )
        throw new Error("日历同步未收到有效确认；本机内容已保留。");
      await this.db.transaction("rw", this.localTables(), async () => {
        const current = await this.db.plannerSync.get(state.key);
        if (!current || current.pending?.id !== state.pending?.id) return;
        if (result.status === "conflict") {
          const local = (await this.table(state.kind).get(state.id)) ?? null;
          const remote = result.record.payload;
          if (!equal(local, remote)) {
            await this.db.plannerConflicts.put({
              id: state.pending!.id,
              workspaceId: this.workspaceId,
              kind: state.kind,
              recordId: state.id,
              local,
              remote,
              createdAt: new Date().toISOString(),
            });
            // Keep both event bodies visible. Deleted records are never revived
            // under their old ID; their pre-conflict body remains in the archive.
            if (state.kind === "event" && local && !local.deletedAt) {
              const copy = {
                ...local,
                id: crypto.randomUUID(),
                title: `${String(local.title).slice(0, 225)}（冲突副本）`,
                importKey: undefined,
              };
              await this.table("event").put(copy);
            }
          }
          if (remote) await this.table(state.kind).put(remote);
          else await this.table(state.kind).delete(state.id);
        }
        await this.db.plannerSync.put({
          ...current,
          version: result.record.version,
          snapshot:
            result.status === "applied"
              ? state.pending!.payload
              : result.record.payload,
          pending: undefined,
        });
      });
    }
    const remote = await this.transport.pull(this.workspaceId);
    await this.db.transaction("rw", this.localTables(), async () => {
      for (const row of remote) {
        if (row.workspace_id !== this.workspaceId || !kinds.includes(row.kind))
          continue;
        const key = this.key(row.kind, row.id);
        const state = await this.db.plannerSync.get(key);
        const local = (await this.table(row.kind).get(row.id)) ?? null;
        // A local write may have happened while pulling. Leave it for CAS push.
        if (state?.pending || !equal(local, state?.snapshot ?? null)) continue;
        if (state && row.version <= state.version) continue;
        if (row.payload) await this.table(row.kind).put(row.payload);
        else await this.table(row.kind).delete(row.id);
        await this.db.plannerSync.put({
          key,
          workspaceId: this.workspaceId,
          kind: row.kind,
          id: row.id,
          version: row.version,
          snapshot: row.payload,
        });
      }
    });
    await this.scan();
  }
  /** Keep a refused record on this device and copy it into the conflict area.
   * Nothing is deleted; other records keep syncing. */
  private async setAside(state: PlannerSyncState, reason: string) {
    console.warn("Calendar record refused by the server", state.id, reason);
    await this.db.transaction("rw", this.localTables(), async () => {
      const current = await this.db.plannerSync.get(state.key);
      if (!current || current.pending?.id !== state.pending?.id) return;
      await this.db.plannerConflicts.put({
        id: state.pending!.id,
        workspaceId: this.workspaceId,
        kind: state.kind,
        recordId: state.id,
        local: (await this.table(state.kind).get(state.id)) ?? null,
        remote: null,
        createdAt: new Date().toISOString(),
        reason,
      });
      await this.db.plannerSync.put({
        ...current,
        pending: undefined,
        rejected: { payload: state.pending!.payload, reason },
      });
    });
  }
  async pendingCount() {
    await this.scan();
    return this.db.plannerSync
      .where("workspaceId")
      .equals(this.workspaceId)
      .filter((s) => !!s.pending)
      .count();
  }
}

export function supabasePlannerTransport(
  client: SupabaseClient,
): PlannerTransport {
  return {
    async capabilities() {
      const { data, error } = await client.rpc("planner_sync_capabilities");
      if (error || data?.planner !== 1)
        throw new Error("日历云同步尚未启用，内容已保存在本机。");
    },
    async push(state) {
      const { data, error } = await client.rpc("apply_planner_mutation", {
        p_operation_id: state.pending!.id,
        p_workspace_id: state.workspaceId,
        p_kind: state.kind,
        p_id: state.id,
        p_base_version: state.version,
        p_payload: state.pending!.payload,
      });
      if (error) throw error;
      return data;
    },
    async pull(workspaceId) {
      // Stable key paging, no device clock cursor. An edit to an already-read
      // row is picked up on the next pass, including soft deletions.
      const rows: PlannerRow[] = [];
      for (const kind of kinds) {
        let after = "";
        for (;;) {
          const { data, error } = await client
            .from("planner_records")
            .select("workspace_id,kind,id,version,payload")
            .eq("workspace_id", workspaceId)
            .eq("kind", kind)
            .gt("id", after)
            .order("id")
            .limit(500);
          if (error) throw error;
          if (!data?.length) break;
          rows.push(...(data as PlannerRow[]));
          after = String(data[data.length - 1].id);
        }
      }
      return rows;
    },
  };
}
