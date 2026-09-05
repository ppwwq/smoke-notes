import type { Table } from "dexie";
import { isTrashExpired, rankBetween, RANK_GAP } from "./domain";
import type { Note, Notebook, SyncEntity, SyncOperation, Todo } from "./types";
import { SmokeNotesDatabase } from "./database";
import {
  createTaskListContent,
  migrateLegacyNoteContent,
  normalizeNoteColor,
  normalizeNoteKind,
  normalizeRichTextDocument,
  richTextToPlainText,
} from "./note-content";

export interface RepositoryContext {
  workspaceId: string;
  deviceId: string;
  now?: () => Date;
  createId?: () => string;
}

export type TrashRecord =
  | { entity: "notebook"; record: Notebook }
  | { entity: "note"; record: Note }
  | { entity: "todo"; record: Todo };

function byRank<T extends { rank: number }>(a: T, b: T): number {
  return (
    a.rank - b.rank ||
    ("id" in a && "id" in b ? String(a.id).localeCompare(String(b.id)) : 0)
  );
}

export class LocalRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    readonly database: SmokeNotesDatabase,
    private readonly context: RepositoryContext,
  ) {
    this.now = context.now ?? (() => new Date());
    this.createId = context.createId ?? (() => crypto.randomUUID());
  }

  async listNotebooks(): Promise<Notebook[]> {
    return (await this.database.notebooks.toArray())
      .filter((item) => !item.deletedAt)
      .sort(byRank);
  }

  async listNotes(notebookId: string): Promise<Note[]> {
    return (
      await this.database.notes.where("notebookId").equals(notebookId).toArray()
    )
      .filter((item) => !item.deletedAt)
      .sort(byRank);
  }

  async getNote(id: string): Promise<Note | null> {
    const note = await this.database.notes.get(id);
    return note && !note.deletedAt ? note : null;
  }

  async listTodos(): Promise<Todo[]> {
    return (await this.database.todos.toArray())
      .filter((item) => !item.deletedAt)
      .sort(byRank);
  }

  async listPendingOperations(): Promise<SyncOperation[]> {
    return this.database.operations.orderBy("createdAt").toArray();
  }

  async createNotebook(name: string): Promise<Notebook> {
    const rank = await this.nextRank(this.database.notebooks);
    const timestamp = this.now().toISOString();
    const notebook: Notebook = {
      id: this.createId(),
      workspaceId: this.context.workspaceId,
      name: name.trim() || "未命名便签本",
      rank,
      version: 1,
      updatedAt: timestamp,
      deletedAt: null,
    };
    await this.database.transaction(
      "rw",
      this.database.notebooks,
      this.database.operations,
      async () => {
        await this.database.notebooks.add(notebook);
        await this.enqueue("notebook", notebook, 0);
      },
    );
    return notebook;
  }

  async createNote(
    notebookId: string,
    content: Pick<Note, "title"> &
      Partial<Pick<Note, "body" | "contentJson" | "color" | "kind">>,
  ): Promise<Note> {
    const current = await this.listNotes(notebookId);
    const timestamp = this.now().toISOString();
    const kind = normalizeNoteKind(content.kind);
    const contentJson = content.contentJson
      ? normalizeRichTextDocument(content.contentJson, content.body ?? "")
      : kind === "todo"
        ? createTaskListContent(content.body ?? "")
        : migrateLegacyNoteContent(content.body ?? "");
    const note: Note = {
      id: this.createId(),
      notebookId,
      kind,
      title: content.title.trim(),
      contentJson,
      body: richTextToPlainText(contentJson),
      color: normalizeNoteColor(content.color),
      rank: (current.at(-1)?.rank ?? 0) + RANK_GAP,
      version: 1,
      conflictOf: null,
      updatedAt: timestamp,
      deletedAt: null,
    };
    await this.database.transaction(
      "rw",
      this.database.notes,
      this.database.operations,
      async () => {
        await this.database.notes.add(note);
        await this.enqueue("note", note, 0);
      },
    );
    return note;
  }

  async createTodo(text: string): Promise<Todo> {
    const rank = await this.nextRank(this.database.todos);
    const timestamp = this.now().toISOString();
    const todo: Todo = {
      id: this.createId(),
      workspaceId: this.context.workspaceId,
      text: text.trim() || "新待办",
      completed: false,
      rank,
      version: 1,
      updatedAt: timestamp,
      deletedAt: null,
    };
    await this.database.transaction(
      "rw",
      this.database.todos,
      this.database.operations,
      async () => {
        await this.database.todos.add(todo);
        await this.enqueue("todo", todo, 0);
      },
    );
    return todo;
  }

  async toggleTodo(id: string): Promise<Todo> {
    return this.persistMutation(this.database.todos, "todo", id, (current) => ({
      completed: !current.completed,
    }));
  }

  async renameNotebook(id: string, name: string): Promise<Notebook> {
    return this.persistMutation(
      this.database.notebooks,
      "notebook",
      id,
      () => ({ name: name.trim() || "未命名便签本" }),
    );
  }

  async updateNote(
    id: string,
    changes: Pick<Note, "title"> &
      Partial<Pick<Note, "body" | "contentJson" | "color">>,
  ): Promise<Note> {
    return this.persistMutation(this.database.notes, "note", id, (current) => {
      const contentJson = changes.contentJson
        ? normalizeRichTextDocument(
            changes.contentJson,
            changes.body ?? current.body,
          )
        : changes.body === undefined
          ? current.contentJson
          : migrateLegacyNoteContent(changes.body);
      return {
        title: changes.title.trim(),
        contentJson,
        body: richTextToPlainText(contentJson),
        color:
          changes.color === undefined
            ? current.color
            : normalizeNoteColor(changes.color),
      };
    });
  }

  async updateTodo(id: string, changes: Pick<Todo, "text">): Promise<Todo> {
    return this.persistMutation(this.database.todos, "todo", id, () => ({
      text: changes.text.trim() || "新待办",
    }));
  }

  async moveNote(
    id: string,
    previousRank: number | null,
    nextRank: number | null,
  ): Promise<Note> {
    return this.persistMutation(this.database.notes, "note", id, () => ({
      rank: rankBetween(previousRank, nextRank),
    }));
  }

  async moveNotebook(
    id: string,
    previousRank: number | null,
    nextRank: number | null,
  ): Promise<Notebook> {
    return this.persistMutation(
      this.database.notebooks,
      "notebook",
      id,
      () => ({ rank: rankBetween(previousRank, nextRank) }),
    );
  }

  async moveTodo(
    id: string,
    previousRank: number | null,
    nextRank: number | null,
  ): Promise<Todo> {
    return this.persistMutation(this.database.todos, "todo", id, () => ({
      rank: rankBetween(previousRank, nextRank),
    }));
  }

  async trashNote(id: string): Promise<Note> {
    return this.trashRecord(this.database.notes, "note", id);
  }

  async trashNotebook(id: string): Promise<Notebook> {
    return this.database.transaction(
      "rw",
      this.database.notebooks,
      this.database.notes,
      this.database.operations,
      async () => {
        const current = await this.requireRecord(this.database.notebooks, id);
        const deletedAt = this.now().toISOString();
        const updated = this.updatedRecord(current, { deletedAt });
        const childNotes = (
          await this.database.notes.where("notebookId").equals(id).toArray()
        ).filter((note) => !note.deletedAt);
        await this.database.notebooks.put(updated);
        await this.enqueue("notebook", updated, current.version, "delete");
        for (const note of childNotes) {
          const deletedNote = this.updatedRecord(note, { deletedAt });
          await this.database.notes.put(deletedNote);
          await this.enqueue("note", deletedNote, note.version, "delete");
        }
        return updated;
      },
    );
  }

  async trashTodo(id: string): Promise<Todo> {
    return this.trashRecord(this.database.todos, "todo", id);
  }

  async restore(entity: "notebook", id: string): Promise<Notebook>;
  async restore(entity: "note", id: string): Promise<Note>;
  async restore(entity: "todo", id: string): Promise<Todo>;
  async restore(
    entity: SyncEntity,
    id: string,
  ): Promise<Notebook | Note | Todo> {
    if (entity === "notebook") {
      return this.database.transaction(
        "rw",
        this.database.notebooks,
        this.database.notes,
        this.database.operations,
        async () => {
          const current = await this.requireRecord(this.database.notebooks, id);
          const updated = this.updatedRecord(current, { deletedAt: null });
          const childNotes = (
            await this.database.notes.where("notebookId").equals(id).toArray()
          ).filter((note) => note.deletedAt);
          await this.database.notebooks.put(updated);
          await this.enqueue("notebook", updated, current.version);
          for (const note of childNotes) {
            const restoredNote = this.updatedRecord(note, { deletedAt: null });
            await this.database.notes.put(restoredNote);
            await this.enqueue("note", restoredNote, note.version);
          }
          return updated;
        },
      );
    }
    return this.persistMutation(this.tableFor(entity), entity, id, () => ({
      deletedAt: null,
    }));
  }

  async listTrash(): Promise<TrashRecord[]> {
    const [notebooks, notes, todos] = await Promise.all([
      this.database.notebooks.toArray(),
      this.database.notes.toArray(),
      this.database.todos.toArray(),
    ]);
    return [
      ...notebooks
        .filter((record) => record.deletedAt)
        .map((record) => ({ entity: "notebook" as const, record })),
      ...notes
        .filter((record) => record.deletedAt)
        .map((record) => ({ entity: "note" as const, record })),
      ...todos
        .filter((record) => record.deletedAt)
        .map((record) => ({ entity: "todo" as const, record })),
    ].sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt));
  }

  async purgeExpiredTrash(): Promise<number> {
    const trash = (await this.listTrash()).filter(({ record }) =>
      isTrashExpired(record.deletedAt, this.now()),
    );
    await this.database.transaction(
      "rw",
      this.database.notebooks,
      this.database.notes,
      this.database.todos,
      async () => {
        await Promise.all(
          trash.map(({ entity, record }) =>
            this.tableFor(entity).delete(record.id),
          ),
        );
      },
    );
    return trash.length;
  }

  private async nextRank<T extends { rank: number; deletedAt: string | null }>(
    table: Table<T, string>,
  ): Promise<number> {
    const records = (await table.toArray())
      .filter((item) => !item.deletedAt)
      .sort(byRank);
    return (records.at(-1)?.rank ?? 0) + RANK_GAP;
  }

  private updatedRecord<T extends { version: number; updatedAt: string }>(
    current: T,
    changes: Partial<T>,
  ): T {
    return {
      ...current,
      ...changes,
      version: current.version + 1,
      updatedAt: this.now().toISOString(),
    };
  }

  private async requireRecord<T>(
    table: Table<T, string>,
    id: string,
  ): Promise<T> {
    const record = await table.get(id);
    if (!record) throw new Error(`Record ${id} was not found`);
    return record;
  }

  private async persistMutation<T extends Notebook | Note | Todo>(
    table: Table<T, string>,
    entity: SyncEntity,
    id: string,
    changes: (current: T) => Partial<T>,
    action: SyncOperation["action"] = "upsert",
  ): Promise<T> {
    // Read and enqueue in the same transaction so compaction cannot rebase between them.
    return this.database.transaction(
      "rw",
      table,
      this.database.operations,
      async () => {
        const current = await this.requireRecord(table, id);
        const updated = this.updatedRecord(current, changes(current));
        await table.put(updated);
        await this.enqueue(entity, updated, current.version, action);
        return updated;
      },
    );
  }

  private async trashRecord<T extends Notebook | Note | Todo>(
    table: Table<T, string>,
    entity: SyncEntity,
    id: string,
  ): Promise<T> {
    return this.persistMutation(
      table,
      entity,
      id,
      () => ({ deletedAt: this.now().toISOString() }) as Partial<T>,
      "delete",
    );
  }

  private async enqueue(
    entity: SyncEntity,
    record: Notebook | Note | Todo,
    baseVersion: number,
    action: SyncOperation["action"] = "upsert",
  ): Promise<void> {
    const timestamp = this.now().toISOString();
    await this.database.operations.add({
      id: this.createId(),
      deviceId: this.context.deviceId,
      entity,
      entityId: record.id,
      action,
      baseVersion,
      payload: { ...record },
      attempts: 0,
      nextAttemptAt: timestamp,
      createdAt: timestamp,
    });
  }

  private tableFor(entity: SyncEntity): Table<Notebook | Note | Todo, string> {
    if (entity === "notebook") {
      return this.database.notebooks as unknown as Table<
        Notebook | Note | Todo,
        string
      >;
    }
    if (entity === "note") {
      return this.database.notes as unknown as Table<
        Notebook | Note | Todo,
        string
      >;
    }
    return this.database.todos as unknown as Table<
      Notebook | Note | Todo,
      string
    >;
  }
}
