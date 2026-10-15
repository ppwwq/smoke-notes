import { describe, expect, it } from "vitest";
import {
  mergeNoteChanges,
  migrateLegacyNoteContent,
  sameNoteContent,
  type Note,
} from "../src/index";

function note(): Note {
  return {
    id: "note-1",
    notebookId: "notebook-1",
    kind: "note",
    title: "标题",
    body: "正文",
    contentJson: migrateLegacyNoteContent("正文\n\n"),
    color: "amber",
    rank: 1024,
    version: 1,
    conflictOf: null,
    updatedAt: "2026-08-28T12:00:00.000Z",
    deletedAt: null,
  };
}

describe("rich-text projection compatibility", () => {
  it("treats old and current plain text projections of the same rich document as equal", () => {
    const legacy = note();
    const current = { ...legacy, body: "正文\n\n", version: 2 };

    expect(sameNoteContent(legacy, current)).toBe(true);
    expect(mergeNoteChanges(legacy, current, legacy)).toEqual(current);
  });

  it("merges a real text edit despite a concurrent correction to the old plain text projection", () => {
    const base = note();
    const local = {
      ...base,
      body: "正文\n\n新内容",
      contentJson: migrateLegacyNoteContent("正文\n\n新内容"),
      version: 2,
    };
    const remote = {
      ...base,
      body: "正文\n\n",
      color: "sky" as const,
      version: 2,
    };

    expect(mergeNoteChanges(local, remote, base)).toMatchObject({
      body: "正文\n\n新内容",
      contentJson: local.contentJson,
      color: "sky",
    });
  });

  it("still compares the body of old records with no rich-text document", () => {
    const first = { ...note(), contentJson: undefined } as unknown as Note;
    const second = { ...first, body: "另一个未迁移的正文" };

    expect(sameNoteContent(first, second)).toBe(false);
  });
});
