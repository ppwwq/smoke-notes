export type EntityId = string;

export interface SyncFields {
  id: EntityId;
  version: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Notebook extends SyncFields {
  workspaceId: EntityId;
  name: string;
  rank: number;
}

export interface Note extends SyncFields {
  notebookId: EntityId;
  title: string;
  body: string;
  rank: number;
  conflictOf: EntityId | null;
}

export interface Todo extends SyncFields {
  workspaceId: EntityId;
  text: string;
  completed: boolean;
  rank: number;
}

export type SyncEntity = 'notebook' | 'note' | 'todo';
export type SyncAction = 'upsert' | 'delete';

export interface SyncOperation {
  id: EntityId;
  deviceId: EntityId;
  entity: SyncEntity;
  entityId: EntityId;
  action: SyncAction;
  baseVersion: number;
  payload: Record<string, unknown>;
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
}

export interface WindowState {
  opacity: number;
  alwaysOnTop: boolean;
  width: number;
  height: number;
  x?: number;
  y?: number;
  lastView: 'notes' | 'todos';
}
