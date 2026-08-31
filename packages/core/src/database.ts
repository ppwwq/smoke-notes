import Dexie, { type Table } from "dexie";
import type { Note, Notebook, SyncOperation, Todo } from "./types";
import {
  normalizeNoteColor,
  normalizeNoteKind,
  normalizeRichTextDocument,
  richTextToPlainText,
} from "./note-content";

export class SmokeNotesDatabase extends Dexie {
  notebooks!: Table<Notebook, string, Notebook>;
  notes!: Table<Note, string, Note>;
  todos!: Table<Todo, string, Todo>;
  operations!: Table<SyncOperation, string, SyncOperation>;

  constructor(name = "smoke-notes") {
    super(name);
    this.version(1).stores({
      notebooks: "id, workspaceId, rank, deletedAt",
      notes: "id, notebookId, rank, deletedAt",
      todos: "id, workspaceId, rank, deletedAt",
      operations: "id, entity, entityId, createdAt, nextAttemptAt",
    });
    this.version(2)
      .stores({
        notebooks: "id, workspaceId, rank, deletedAt",
        notes: "id, notebookId, rank, deletedAt, color",
        todos: "id, workspaceId, rank, deletedAt",
        operations: "id, entity, entityId, createdAt, nextAttemptAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Note, string>("notes")
          .toCollection()
          .modify((note) => {
            note.contentJson = normalizeRichTextDocument(
              note.contentJson,
              note.body,
            );
            note.body = richTextToPlainText(note.contentJson);
            note.color = normalizeNoteColor(note.color);
          });
      });
    this.version(3)
      .stores({
        notebooks: "id, workspaceId, rank, deletedAt",
        notes: "id, notebookId, rank, deletedAt, color, kind",
        todos: "id, workspaceId, rank, deletedAt",
        operations: "id, entity, entityId, createdAt, nextAttemptAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Note, string>("notes")
          .toCollection()
          .modify((note) => {
            note.kind = normalizeNoteKind(note.kind);
            note.contentJson = normalizeRichTextDocument(
              note.contentJson,
              note.body,
            );
            note.body = richTextToPlainText(note.contentJson);
          });
      });
  }
}
