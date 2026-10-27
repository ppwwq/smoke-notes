import type { Table } from "dexie";
import { createConflictCopy } from "./domain";
import { mergeNoteChanges, sameNoteContent } from "./note-merge";
import { SmokeNotesDatabase } from "./database";
import { mergeTodoChanges, sameTodoContent } from "./todo-merge";
import type { Note, Notebook, SyncEntity, SyncOperation, Todo } from "./types";

export type RemoteRecord = Notebook | Note | Todo;

export type PushResult =
  | { status: "applied" }
  | { status: "conflict"; record: RemoteRecord }
  | { status: "rejected"; reason: string };

export interface RemoteChange {
  entity: SyncEntity;
  record: RemoteRecord;
}

export interface RemoteSyncAdapter {
  push(operation: SyncOperation): Promise<PushResult>;
  pull(
    cursor: string | null,
  ): Promise<{ changes: RemoteChange[]; cursor: string }>;
}

export interface SyncEngineContext {
  deviceId: string;
  now?: () => Date;
  createId?: () => string;
}

export interface FlushResult {
  applied: number;
  conflicts: number;
  failed: number;
}

export interface SyncQueueState {
  pending: number;
  rejected: number;
}

// Share the fallback across instances, including separate Dexie connections.
// Browsers use Web Locks so the same protection also spans tabs/windows.
const activeFlushes = new Map<string, Promise<FlushResult>>();

export class SyncEngine {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly database: SmokeNotesDatabase,
    private readonly adapter: RemoteSyncAdapter,
    private readonly context: SyncEngineContext,
  ) {
    this.now = context.now ?? (() => new Date());
    this.createId = context.createId ?? (() => crypto.randomUUID());
  }

  async getQueueState(): Promise<SyncQueueState> {
    const operations = await this.database.operations.toArray();
    return {
      pending: operations.filter((operation) => !operation.rejected).length,
      rejected: operations.filter((operation) => !!operation.rejected).length,
    };
  }

  async flush(): Promise<FlushResult> {
    const key = `smoke-notes:flush:${this.database.name}`;
    if (typeof navigator !== "undefined" && navigator.locks)
      return navigator.locks.request(key, () => this.flushPending());

    const previous = activeFlushes.get(key);
    const flushing = (previous ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.flushPending());
    activeFlushes.set(key, flushing);
    try {
      return await flushing;
    } finally {
      if (activeFlushes.get(key) === flushing) activeFlushes.delete(key);
    }
  }

  private async flushPending(): Promise<FlushResult> {
    await this.compactUnsentChanges();
    const now = this.now();
    const pending = (
      await this.database.operations.orderBy("createdAt").toArray()
    )
      .filter(
        (operation) =>
          !operation.rejected && new Date(operation.nextAttemptAt) <= now,
      )
      // IDs do not preserve insertion order when records share a timestamp.
      // Upload parent notebooks before notes that reference them.
      .sort(
        (a, b) =>
          Number(b.entity === "notebook") - Number(a.entity === "notebook"),
      );
    const result: FlushResult = { applied: 0, conflicts: 0, failed: 0 };
    const visited = new Set<string>();

    for (const candidate of pending) {
      const key = `${candidate.entity}:${candidate.entityId}`;
      if (visited.has(key)) continue;
      // Read the payload and mark it immutable atomically. Even without Web
      // Locks, another tab cannot compact it between this read and the send.
      const operation = await this.database.transaction(
        "rw",
        this.database.operations,
        async () => {
          const current = await this.database.operations.get(candidate.id);
          if (
            !current ||
            current.rejected ||
            new Date(current.nextAttemptAt) > now
          )
            return null;
          const earlier = await this.database.operations
            .where("entityId")
            .equals(current.entityId)
            .toArray();
          if (
            earlier.some(
              (item) =>
                item.entity === current.entity &&
                item.baseVersion < current.baseVersion,
            )
          )
            return null;
          if (
            current.entity === "note" &&
            typeof current.payload.notebookId === "string"
          ) {
            const parentOperations = await this.database.operations
              .where("entityId")
              .equals(current.payload.notebookId)
              .toArray();
            if (
              parentOperations.some(
                (item) => item.entity === "notebook" && item.baseVersion === 0,
              )
            )
              return null;
          }
          await this.database.operations.update(current.id, {
            attempts: current.attempts + 1,
          });
          return current;
        },
      );
      if (!operation) continue;
      visited.add(key);
      try {
        const pushed = await this.adapter.push(operation);
        if (pushed.status === "applied") {
          await this.database.operations.delete(operation.id);
          result.applied += 1;
        } else if (pushed.status === "rejected") {
          // The server refused this change for good. Keep it (and the local
          // note) but take it out of the retry queue so others keep syncing.
          await this.database.operations.update(operation.id, {
            rejected: pushed.reason,
          });
          console.warn(
            "Note change set aside:",
            pushed.reason,
            operation.entityId,
          );
        } else {
          if (await this.preserveConflict(operation, pushed.record))
            result.conflicts += 1;
        }
      } catch {
        const attempts = operation.attempts + 1;
        const backoffMs = Math.min(60_000, 2 ** attempts * 1000);
        await this.database.operations.update(operation.id, {
          attempts,
          nextAttemptAt: new Date(now.getTime() + backoffMs).toISOString(),
        });
        result.failed += 1;
      }
    }

    return result;
  }

  private async compactUnsentChanges(): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.operations,
      this.database.notebooks,
      this.database.notes,
      this.database.todos,
      async () => {
        const groups = new Map<string, SyncOperation[]>();
        for (const operation of await this.database.operations.toArray()) {
          const key = `${operation.entity}:${operation.entityId}`;
          const group = groups.get(key) ?? [];
          group.push(operation);
          groups.set(key, group);
        }
        for (const group of groups.values()) {
          // An uncertain upload is retried unchanged before compacting its successors.
          if (
            group.length < 2 ||
            group.some((item) => item.attempts > 0 && !item.rejected)
          )
            continue;
          group.sort((a, b) => a.baseVersion - b.baseVersion);
          if (
            group.some(
              (item, index) =>
                index > 0 &&
                item.baseVersion !== Number(group[index - 1].payload.version),
            )
          )
            continue;
          const first = group[0];
          const last = group[group.length - 1];
          const table = this.tableFor(first.entity);
          const local = await table.get(first.entityId);
          if (!local || local.version !== Number(last.payload.version))
            continue;
          const version = first.baseVersion + 1;
          await table.put({ ...local, version });
          const rejected = group.some((item) => item.rejected);
          await this.database.operations.put({
            ...first,
            ...(rejected
              ? {
                  id: this.createId(),
                  rejected: undefined,
                  attempts: 0,
                  nextAttemptAt: this.now().toISOString(),
                }
              : {}),
            action: last.action,
            payload: { ...last.payload, version },
          });
          await this.database.operations.bulkDelete(
            (rejected ? group : group.slice(1)).map((item) => item.id),
          );
        }
      },
    );
  }

  async pull(cursor: string | null): Promise<string> {
    const response = await this.adapter.pull(cursor);
    for (const change of response.changes) {
      const table = this.tableFor(change.entity);
      await this.database.transaction(
        "rw",
        table,
        this.database.operations,
        async () => {
          const hasPendingLocalChange =
            (await this.database.operations
              .where("entityId")
              .equals(change.record.id)
              .count()) > 0;
          if (hasPendingLocalChange) return;
          const current = await table.get(change.record.id);
          if (current && current.version > change.record.version) return;
          await table.put(change.record);
        },
      );
    }
    return response.cursor;
  }

  private async preserveConflict(
    operation: SyncOperation,
    serverRecord: RemoteRecord,
  ): Promise<boolean> {
    const table = this.tableFor(operation.entity);
    if (
      operation.entity === "todo" &&
      (operation.payload.planning || (serverRecord as Todo).planning)
    ) {
      return this.database.transaction(
        "rw",
        this.database.todos,
        this.database.operations,
        async () => {
          if (!(await this.database.operations.get(operation.id))) return false;
          const local = await this.database.todos.get(operation.entityId);
          const remote = serverRecord as Todo;
          await this.database.operations
            .where("entityId")
            .equals(operation.entityId)
            .delete();
          if (!local) {
            await this.database.todos.put(remote);
            return false;
          }
          const merged = mergeTodoChanges(local, remote);
          if (sameTodoContent(merged, remote)) {
            await this.database.todos.put(remote);
            return false;
          }
          const timestamp = this.now().toISOString();
          const updated = {
            ...merged,
            version: remote.version + 1,
            updatedAt: timestamp,
          };
          await this.database.todos.put(updated);
          await this.database.operations.add({
            id: this.createId(),
            deviceId: this.context.deviceId,
            entity: "todo",
            entityId: updated.id,
            action: updated.deletedAt ? "delete" : "upsert",
            baseVersion: remote.version,
            payload: { ...updated },
            attempts: 0,
            nextAttemptAt: timestamp,
            createdAt: timestamp,
          });
          return false;
        },
      );
    }
    if (operation.entity !== "note") {
      return this.database.transaction(
        "rw",
        table,
        this.database.operations,
        async () => {
          if (!(await this.database.operations.get(operation.id))) return false;
          await table.put(serverRecord);
          await this.database.operations
            .where("entityId")
            .equals(operation.entityId)
            .delete();
          return true;
        },
      );
    }

    return this.database.transaction(
      "rw",
      this.database.notes,
      this.database.operations,
      async () => {
        // An older tab may still return a cached conflict after another tab
        // reconciled this upload. It must not overwrite later local edits.
        if (!(await this.database.operations.get(operation.id))) return false;
        const local = await this.database.notes.get(operation.entityId);
        await this.database.notes.put(serverRecord as Note);
        await this.database.operations
          .where("entityId")
          .equals(operation.entityId)
          .delete();
        if (!local) return false;

        const timestamp = this.now().toISOString();
        const remote = serverRecord as Note;
        const base =
          operation.baseSnapshot?.version === operation.baseVersion
            ? operation.baseSnapshot
            : undefined;
        const merged = mergeNoteChanges(local, remote, base);
        if (merged) {
          if (!sameNoteContent(merged, remote)) {
            const updated = {
              ...merged,
              version: remote.version + 1,
              updatedAt: timestamp,
            };
            await this.database.notes.put(updated);
            // The server has cached the old operation's conflict response.
            // Reconciliation is a new operation, never a changed retry.
            await this.database.operations.add({
              id: this.createId(),
              deviceId: this.context.deviceId,
              entity: "note",
              entityId: local.id,
              action: updated.deletedAt ? "delete" : "upsert",
              baseVersion: remote.version,
              baseSnapshot: remote,
              payload: { ...updated },
              attempts: 0,
              nextAttemptAt: timestamp,
              createdAt: timestamp,
            });
          }
          return false;
        }
        const copy = createConflictCopy(
          { ...local, id: this.createId(), rank: local.rank + 0.5 },
          serverRecord.id,
          timestamp,
        );
        await this.database.notes.add(copy);
        await this.database.operations.add({
          id: this.createId(),
          deviceId: this.context.deviceId,
          entity: "note",
          entityId: copy.id,
          action: "upsert",
          baseVersion: 0,
          payload: { ...copy },
          attempts: 0,
          nextAttemptAt: timestamp,
          createdAt: timestamp,
        });
        return true;
      },
    );
  }

  private tableFor(entity: SyncEntity): Table<RemoteRecord, string> {
    if (entity === "notebook") {
      return this.database.notebooks as unknown as Table<RemoteRecord, string>;
    }
    if (entity === "note")
      return this.database.notes as unknown as Table<RemoteRecord, string>;
    return this.database.todos as unknown as Table<RemoteRecord, string>;
  }
}
