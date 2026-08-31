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

export type NoteColor =
  "amber" | "rose" | "sage" | "sky" | "violet" | "graphite";
export type NoteKind = "note" | "todo";

export interface RichTextNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: RichTextNode[];
}

export interface RichTextDocument extends RichTextNode {
  type: "doc";
  content: RichTextNode[];
}

export interface Note extends SyncFields {
  notebookId: EntityId;
  kind: NoteKind;
  title: string;
  contentJson: RichTextDocument;
  body: string;
  color: NoteColor;
  rank: number;
  conflictOf: EntityId | null;
}

export interface Todo extends SyncFields {
  workspaceId: EntityId;
  text: string;
  completed: boolean;
  rank: number;
}

export type SyncEntity = "notebook" | "note" | "todo";
export type SyncAction = "upsert" | "delete";

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
  backgroundOpacity: number;
  alwaysOnTop: boolean;
  width: number;
  height: number;
  x?: number;
  y?: number;
  lastView: "notes" | "todos";
}

export interface NoteWindowState {
  noteId: EntityId;
  x?: number;
  y?: number;
  width: number;
  height: number;
  backgroundOpacity: number;
  alwaysOnTop: boolean;
  isOpen: boolean;
  lastOpenedAt?: string;
}
