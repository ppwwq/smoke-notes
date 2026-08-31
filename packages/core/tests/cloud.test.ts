import { describe, expect, it } from "vitest";
import {
  mapRemoteRecord,
  normalizePairingCode,
  pairingCodeFromUrl,
} from "../src/index";

describe("pairing input", () => {
  it("accepts a spaced six digit code and rejects other input", () => {
    expect(normalizePairingCode(" 12 34 56 ")).toBe("123456");
    expect(normalizePairingCode("12345")).toBeNull();
    expect(normalizePairingCode("12A456")).toBeNull();
  });

  it("reads a pairing code from a phone link", () => {
    expect(pairingCodeFromUrl("https://notes.example.com/?pair=654321")).toBe(
      "654321",
    );
    expect(pairingCodeFromUrl("https://notes.example.com/")).toBeNull();
  });
});

describe("remote record mapping", () => {
  it("maps Supabase note rows into the shared local model", () => {
    expect(
      mapRemoteRecord("note", {
        id: "note-1",
        notebook_id: "book-1",
        title: "云端",
        body: "正文",
        rank: 1024,
        version: 3,
        conflict_of: null,
        updated_at: "2026-08-28T12:00:00.000Z",
        deleted_at: null,
      }),
    ).toEqual({
      id: "note-1",
      notebookId: "book-1",
      title: "云端",
      body: "正文",
      contentJson: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "正文" }] },
        ],
      },
      color: "amber",
      kind: "note",
      rank: 1024,
      version: 3,
      conflictOf: null,
      updatedAt: "2026-08-28T12:00:00.000Z",
      deletedAt: null,
    });
  });

  it("preserves synced rich formatting and the note color", () => {
    const contentJson = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "重点", marks: [{ type: "bold" }] }],
        },
      ],
    };
    expect(
      mapRemoteRecord("note", {
        id: "note-rich",
        notebook_id: "book-1",
        title: "标注",
        body: "重点",
        content_json: contentJson,
        color: "rose",
        kind: "todo",
        rank: 2048,
        version: 4,
        conflict_of: null,
        updated_at: "2026-08-28T13:00:00.000Z",
        deleted_at: null,
      }),
    ).toMatchObject({
      contentJson,
      color: "rose",
      kind: "todo",
      body: "重点",
    });
  });

  it("preserves an empty title returned by Supabase", () => {
    expect(
      mapRemoteRecord("note", {
        id: "note-empty-title",
        notebook_id: "book-1",
        title: "",
        body: "正文",
        rank: 1024,
        version: 1,
        conflict_of: null,
        updated_at: "2026-08-30T12:00:00.000Z",
        deleted_at: null,
      }),
    ).toMatchObject({ title: "" });
  });
});
