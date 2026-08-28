import Dexie, { type Table } from 'dexie';
import type { Note, Notebook, SyncOperation, Todo } from './types';

export class SmokeNotesDatabase extends Dexie {
  notebooks!: Table<Notebook, string, Notebook>;
  notes!: Table<Note, string, Note>;
  todos!: Table<Todo, string, Todo>;
  operations!: Table<SyncOperation, string, SyncOperation>;

  constructor(name = 'smoke-notes') {
    super(name);
    this.version(1).stores({
      notebooks: 'id, workspaceId, rank, deletedAt',
      notes: 'id, notebookId, rank, deletedAt',
      todos: 'id, workspaceId, rank, deletedAt',
      operations: 'id, entity, entityId, createdAt, nextAttemptAt',
    });
  }
}
