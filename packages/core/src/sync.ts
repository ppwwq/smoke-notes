import type { Table } from "dexie";
import { createConflictCopy } from "./domain";
import { SmokeNotesDatabase } from "./database";
import type { Note, Notebook, SyncEntity, SyncOperation, Todo } from "./types";

export type RemoteRecord = Notebook | Note | Todo;

export type PushResult =
  { status: "applied" } | { status: "conflict"; record: RemoteRecord };

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

  async flush(): Promise<FlushResult> {
    const now = this.now();
    await this.compactUnsentChanges();
    const pending = (
      await this.database.operations.orderBy("createdAt").toArray()
    ).filter((operation) => new Date(operation.nextAttemptAt) <= now);
    const result: FlushResult = { applied: 0, conflicts: 0, failed: 0 };
    const visited = new Set<string>();

    for (const operation of pending) {
      const key = `${operation.entity}:${operation.entityId}`;
      if (visited.has(key)) continue;
      const earlier = await this.database.operations
        .where("entityId")
        .equals(operation.entityId)
        .toArray();
      if (earlier.some((item) => item.baseVersion < operation.baseVersion))
        continue;
      visited.add(key);
      try {
        // Once sent, this operation must retain its identity and payload for retries.
        await this.database.operations.update(operation.id, {
          attempts: operation.attempts + 1,
        });
        const pushed = await this.adapter.push(operation);
        if (pushed.status === "applied") {
          await this.database.operations.delete(operation.id);
          result.applied += 1;
        } else {
          await this.preserveConflict(operation, pushed.record);
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
          if (group.length < 2 || group.some((item) => item.attempts > 0))
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
          await this.database.operations.put({
            ...first,
            action: last.action,
            payload: { ...last.payload, version },
          });
          await this.database.operations.bulkDelete(
            group.slice(1).map((item) => item.id),
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
  ): Promise<void> {
    const table = this.tableFor(operation.entity);
    if (operation.entity !== "note") {
      await this.database.transaction(
        "rw",
        table,
        this.database.operations,
        async () => {
          await table.put(serverRecord);
          await this.database.operations
            .where("entityId")
            .equals(operation.entityId)
            .delete();
        },
      );
      return;
    }

    await this.database.transaction(
      "rw",
      this.database.notes,
      this.database.operations,
      async () => {
        const local = await this.database.notes.get(operation.entityId);
        await this.database.notes.put(serverRecord as Note);
        await this.database.operations
          .where("entityId")
          .equals(operation.entityId)
          .delete();
        if (!local) return;

        const timestamp = this.now().toISOString();
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
