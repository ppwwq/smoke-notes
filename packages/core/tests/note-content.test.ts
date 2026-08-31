import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_NOTE_COLOR,
  SmokeNotesDatabase,
  migrateLegacyNoteContent,
  migrateLegacyTaskLists,
  normalizeHighlightColor,
  normalizeNoteColor,
  normalizeNoteKind,
  normalizeRichTextDocument,
  normalizeTextColor,
  richTextToPlainText,
} from "../src/index";

const databases: string[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((name) => Dexie.delete(name)));
});

describe("rich note content", () => {
  it("migrates legacy plain text into paragraph nodes without losing line breaks", () => {
    const content = migrateLegacyNoteContent("第一行\n第二行");

    expect(content).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "第一行" }] },
        { type: "paragraph", content: [{ type: "text", text: "第二行" }] },
      ],
    });
    expect(richTextToPlainText(content)).toBe("第一行\n第二行");
  });

  it("keeps only the supported note, text, and highlight colors", () => {
    expect(normalizeNoteColor("rose")).toBe("rose");
    expect(normalizeNoteColor("neon")).toBe(DEFAULT_NOTE_COLOR);
    expect(normalizeTextColor("#e98286")).toBe("#e98286");
    expect(normalizeTextColor("javascript:alert(1)")).toBeNull();
    expect(normalizeHighlightColor("#7f6a2f")).toBe("#7f6a2f");
    expect(normalizeHighlightColor("#ffffff")).toBeNull();
  });

  it("normalizes missing note kinds to a regular note", () => {
    expect(normalizeNoteKind("todo")).toBe("todo");
    expect(normalizeNoteKind("note")).toBe("note");
    expect(normalizeNoteKind(undefined)).toBe("note");
    expect(normalizeNoteKind("reminder")).toBe("note");
  });

  it("converts legacy bullet lists into unchecked task lists without losing text", () => {
    const migrated = migrateLegacyTaskLists({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "保留这一项" }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(migrated.content[0]).toMatchObject({
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "保留这一项" }],
            },
          ],
        },
      ],
    });
    expect(richTextToPlainText(migrated)).toBe("保留这一项");
  });

  it("preserves regular bullet lists during document normalization", () => {
    const bulletDocument = {
      type: "doc" as const,
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "普通分点" }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(normalizeRichTextDocument(bulletDocument)).toEqual(bulletDocument);
  });
});

describe("database migration", () => {
  it("upgrades existing plain notes with rich content and a safe default color", async () => {
    const name = `smoke-notes-migration-${crypto.randomUUID()}`;
    databases.push(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      notebooks: "id, workspaceId, rank, deletedAt",
      notes: "id, notebookId, rank, deletedAt",
      todos: "id, workspaceId, rank, deletedAt",
      operations: "id, entity, entityId, createdAt, nextAttemptAt",
    });
    await legacy.table("notes").add({
      id: "note-legacy",
      notebookId: "book-1",
      title: "旧便签",
      body: "没有格式的正文",
      rank: 1024,
      version: 2,
      conflictOf: null,
      updatedAt: "2026-08-28T12:00:00.000Z",
      deletedAt: null,
    });
    legacy.close();

    const current = new SmokeNotesDatabase(name);
    const note = await current.notes.get("note-legacy");
    current.close();

    expect(note).toMatchObject({
      color: DEFAULT_NOTE_COLOR,
      body: "没有格式的正文",
    });
    expect(richTextToPlainText(note!.contentJson)).toBe("没有格式的正文");
  });

  it("upgrades v2 notes with a default kind without changing bullet lists", async () => {
    const name = `smoke-notes-kind-migration-${crypto.randomUUID()}`;
    databases.push(name);
    const legacy = new Dexie(name);
    legacy.version(2).stores({
      notebooks: "id, workspaceId, rank, deletedAt",
      notes: "id, notebookId, rank, deletedAt, color",
      todos: "id, workspaceId, rank, deletedAt",
      operations: "id, entity, entityId, createdAt, nextAttemptAt",
    });
    await legacy.table("notes").add({
      id: "note-v2",
      notebookId: "book-1",
      title: "旧清单",
      body: "保留项目",
      contentJson: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "保留项目" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      color: "sage",
      rank: 1024,
      version: 2,
      conflictOf: null,
      updatedAt: "2026-08-28T12:00:00.000Z",
      deletedAt: null,
    });
    legacy.close();

    const current = new SmokeNotesDatabase(name);
    const note = await current.notes.get("note-v2");
    current.close();

    expect(note?.kind).toBe("note");
    expect(note?.contentJson.content[0]).toMatchObject({
      type: "bulletList",
      content: [{ type: "listItem" }],
    });
    expect(note?.body).toBe("保留项目");
  });
});
