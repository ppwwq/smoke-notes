import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalRepository,
  SmokeNotesDatabase,
  SyncEngine,
  type PushResult,
  type RemoteSyncAdapter,
  type SyncOperation,
} from '../src/index';

describe('SyncEngine', () => {
  let database: SmokeNotesDatabase;
  let repository: LocalRepository;

  beforeEach(() => {
    database = new SmokeNotesDatabase(`sync-test-${crypto.randomUUID()}`);
    let id = 0;
    repository = new LocalRepository(database, {
      workspaceId: 'workspace-1',
      deviceId: 'desktop-1',
      now: () => new Date('2026-08-28T12:00:00.000Z'),
      createId: () => `seed-${++id}`,
    });
  });

  afterEach(async () => database.delete());

  it('removes successfully uploaded operations from the outbox', async () => {
    await repository.createTodo('同步我');
    const adapter: RemoteSyncAdapter = {
      push: vi.fn(async (): Promise<PushResult> => ({ status: 'applied' })),
      pull: vi.fn(async () => ({ changes: [], cursor: '1' })),
    };
    const engine = new SyncEngine(database, adapter, {
      deviceId: 'desktop-1',
      now: () => new Date('2026-08-28T12:00:00.000Z'),
      createId: () => 'unused',
    });

    expect(await engine.flush()).toEqual({ applied: 1, conflicts: 0, failed: 0 });
    expect(await repository.listPendingOperations()).toEqual([]);
  });

  it('backs off failed operations without dropping them', async () => {
    await repository.createTodo('稍后再试');
    const adapter: RemoteSyncAdapter = {
      push: vi.fn(async () => {
        throw new Error('offline');
      }),
      pull: vi.fn(async () => ({ changes: [], cursor: '1' })),
    };
    const engine = new SyncEngine(database, adapter, {
      deviceId: 'desktop-1',
      now: () => new Date('2026-08-28T12:00:00.000Z'),
      createId: () => 'unused',
    });

    expect(await engine.flush()).toEqual({ applied: 0, conflicts: 0, failed: 1 });
    expect(await repository.listPendingOperations()).toMatchObject([
      { attempts: 1, nextAttemptAt: '2026-08-28T12:00:02.000Z' },
    ]);
  });

  it('keeps a local note conflict as a separate copy', async () => {
    const notebook = await repository.createNotebook('工作');
    const note = await repository.createNote(notebook.id, { title: '方案', body: '本地改动' });
    await database.operations.where('entity').notEqual('note').delete();
    const serverRecord = {
      ...note,
      title: '方案',
      body: '手机改动',
      version: 5,
      updatedAt: '2026-08-28T12:01:00.000Z',
    };
    const adapter: RemoteSyncAdapter = {
      push: vi.fn(async (_operation: SyncOperation): Promise<PushResult> => ({
        status: 'conflict',
        record: serverRecord,
      })),
      pull: vi.fn(async () => ({ changes: [], cursor: '1' })),
    };
    const engine = new SyncEngine(database, adapter, {
      deviceId: 'desktop-1',
      now: () => new Date('2026-08-28T12:02:00.000Z'),
      createId: () => 'conflict-copy-1',
    });

    expect(await engine.flush()).toEqual({ applied: 0, conflicts: 1, failed: 0 });
    expect(await repository.listNotes(notebook.id)).toMatchObject([
      { id: note.id, body: '手机改动', version: 5 },
      {
        id: 'conflict-copy-1',
        body: '本地改动',
        title: '方案（冲突副本）',
        conflictOf: note.id,
      },
    ]);
  });
});
