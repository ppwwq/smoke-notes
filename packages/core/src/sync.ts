import type { Table } from 'dexie';
import { createConflictCopy } from './domain';
import { SmokeNotesDatabase } from './database';
import type { Note, Notebook, SyncEntity, SyncOperation, Todo } from './types';

export type RemoteRecord = Notebook | Note | Todo;

export type PushResult =
  | { status: 'applied' }
  | { status: 'conflict'; record: RemoteRecord };

export interface RemoteChange {
  entity: SyncEntity;
  record: RemoteRecord;
}

export interface RemoteSyncAdapter {
  push(operation: SyncOperation): Promise<PushResult>;
  pull(cursor: string | null): Promise<{ changes: RemoteChange[]; cursor: string }>;
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
    const pending = (await this.database.operations.orderBy('createdAt').toArray()).filter(
      (operation) => new Date(operation.nextAttemptAt) <= now,
    );
    const result: FlushResult = { applied: 0, conflicts: 0, failed: 0 };

    for (const operation of pending) {
      try {
        const pushed = await this.adapter.push(operation);
        if (pushed.status === 'applied') {
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

  async pull(cursor: string | null): Promise<string> {
    const response = await this.adapter.pull(cursor);
    for (const change of response.changes) {
      const hasPendingLocalChange =
        (await this.database.operations.where('entityId').equals(change.record.id).count()) > 0;
      if (!hasPendingLocalChange) await this.tableFor(change.entity).put(change.record);
    }
    return response.cursor;
  }

  private async preserveConflict(operation: SyncOperation, serverRecord: RemoteRecord): Promise<void> {
    const table = this.tableFor(operation.entity);
    if (operation.entity !== 'note') {
      await this.database.transaction('rw', table, this.database.operations, async () => {
        await table.put(serverRecord);
        await this.database.operations.delete(operation.id);
      });
      return;
    }

    const local = await this.database.notes.get(operation.entityId);
    await this.database.transaction(
      'rw',
      this.database.notes,
      this.database.operations,
      async () => {
        await this.database.notes.put(serverRecord as Note);
        await this.database.operations.delete(operation.id);
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
          entity: 'note',
          entityId: copy.id,
          action: 'upsert',
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
    if (entity === 'notebook') {
      return this.database.notebooks as unknown as Table<RemoteRecord, string>;
    }
    if (entity === 'note') return this.database.notes as unknown as Table<RemoteRecord, string>;
    return this.database.todos as unknown as Table<RemoteRecord, string>;
  }
}
