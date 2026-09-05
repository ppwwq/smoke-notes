import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SupabaseCloud,
  mapRemoteRecord,
  normalizePairingCode,
  pairingCodeFromUrl,
} from "../src/index";

type RemoteTable = "notebooks" | "notes" | "todos";
type ServerRow = Record<string, unknown> & { id: string; updated_at: string };

function noteRow(id: string, updatedAt: string, version = 1): ServerRow {
  return {
    id,
    notebook_id: "book-1",
    title: id,
    body: "正文",
    rank: 1024,
    version,
    updated_at: updatedAt,
    deleted_at: null,
  };
}

// Keep the real Supabase query builder; emulate only the HTTP database boundary.
function mockServer() {
  const server = {
    rows: { notebooks: [], notes: [], todos: [] } as Record<
      RemoteTable,
      ServerRow[]
    >,
    pageLimit: 1000,
    requests: [] as URL[],
    beforeRequest: null as ((table: RemoteTable, url: URL) => void) | null,
    failRequest: null as ((table: RemoteTable, url: URL) => boolean) | null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const table = url.pathname.split("/").at(-1) as RemoteTable;
      server.requests.push(url);
      server.beforeRequest?.(table, url);
      if (server.failRequest?.(table, url)) {
        return new Response(
          JSON.stringify({ message: "page unavailable", code: "XX000" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      let rows = [...server.rows[table]];
      for (const filter of url.searchParams.getAll("updated_at")) {
        const dot = filter.indexOf(".");
        const operator = filter.slice(0, dot);
        const value = filter.slice(dot + 1);
        rows = rows.filter((row) =>
          operator === "gt"
            ? row.updated_at > value
            : operator === "gte"
              ? row.updated_at >= value
              : row.updated_at <= value,
        );
      }
      const after = url.searchParams.get("or");
      if (after) {
        const match = after.match(
          /^\(updated_at\.gt\.(.+),and\(updated_at\.eq\.(.+),id\.gt\.([^)]*)\)\)$/,
        );
        if (!match || match[1] !== match[2])
          throw new Error(`Unsupported page filter: ${after}`);
        rows = rows.filter(
          (row) =>
            row.updated_at > match[1] ||
            (row.updated_at === match[1] && row.id > match[3]),
        );
      }
      const ordering = (url.searchParams.get("order") ?? "")
        .split(",")
        .filter(Boolean);
      rows.sort((a, b) => {
        for (const order of ordering) {
          const [column, direction] = order.split(".");
          const left = String(a[column]);
          const right = String(b[column]);
          if (left !== right)
            return (left < right ? -1 : 1) * (direction === "desc" ? -1 : 1);
        }
        return 0;
      });
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Math.min(
        Number(url.searchParams.get("limit") ?? server.pageLimit),
        server.pageLimit,
      );
      const data = rows.slice(offset, offset + limit);
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return server;
}

const cloud = new SupabaseCloud({
  url: "https://smoke-notes-tests.supabase.co",
  publishableKey: "test-key",
  webUrl: "https://notes.example.com",
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-05T10:03:00.000Z"));
});

describe("cloud pull", () => {
  it("still downloads later server changes when the device clock is years ahead", async () => {
    const server = mockServer();
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"));
    server.rows.notes = [noteRow("note-1", "2026-09-05T10:00:00.000Z")];
    const first = await cloud.syncAdapter.pull(null);
    server.rows.notes.push(noteRow("note-2", "2026-09-05T10:01:00.000Z"));

    const next = await cloud.syncAdapter.pull(first.cursor);

    expect(next.changes.some((change) => change.record.id === "note-2")).toBe(
      true,
    );
  });

  it("recovers records hidden behind a legacy cursor made by a fast device clock", async () => {
    const server = mockServer();
    server.rows.notes = [noteRow("missing-note", "2026-09-05T10:00:00.000Z")];

    const result = await cloud.syncAdapter.pull("2040-01-01T00:00:00.000Z");

    expect(result.changes.map((change) => change.record.id)).toEqual([
      "missing-note",
    ]);
  });

  it("downloads every row beyond the server cap in deterministic timestamp and id order", async () => {
    const server = mockServer();
    server.rows.notes = Array.from({ length: 1205 }, (_, index) =>
      noteRow(
        `note-${String(index).padStart(4, "0")}`,
        "2026-09-05T10:00:00.000Z",
      ),
    ).reverse();

    const result = await cloud.syncAdapter.pull(null);

    expect(result.changes).toHaveLength(1205);
    expect(result.changes.map((change) => change.record.id)).toEqual(
      server.rows.notes.map((row) => row.id).sort(),
    );
    expect(new Set(result.changes.map((change) => change.record.id)).size).toBe(
      1205,
    );
  });

  it("replays the cursor timestamp so later records with the same timestamp are not lost", async () => {
    const server = mockServer();
    server.rows.notes = [noteRow("note-z", "2026-09-05T10:00:00.000Z")];
    const first = await cloud.syncAdapter.pull(null);
    server.rows.notes.push(noteRow("note-a", "2026-09-05T10:00:00.000Z"));

    const next = await cloud.syncAdapter.pull(first.cursor);

    expect(next.changes.some((change) => change.record.id === "note-a")).toBe(
      true,
    );
  });

  it("keeps each table's progress independent from concurrent changes in another table", async () => {
    const server = mockServer();
    server.rows.notebooks = [
      {
        ...noteRow("book-1", "2026-09-05T10:00:00.000Z"),
        workspace_id: "workspace-1",
        name: "便签",
      },
    ];
    server.rows.notes = [noteRow("note-1", "2026-09-05T10:02:00.000Z")];
    let notebookRead = false;
    let changed = false;
    server.beforeRequest = (table, url) => {
      if (url.searchParams.get("select") !== "*") return;
      if (table === "notebooks") notebookRead = true;
      if (table === "notes" && notebookRead && !changed) {
        changed = true;
        server.rows.notebooks[0] = {
          ...server.rows.notebooks[0],
          updated_at: "2026-09-05T10:01:00.000Z",
          version: 2,
        };
        server.rows.notes[0] = noteRow("note-1", "2026-09-05T10:02:00.000Z", 2);
      }
    };
    const first = await cloud.syncAdapter.pull(null);

    const next = await cloud.syncAdapter.pull(first.cursor);

    expect(next.changes).toContainEqual(
      expect.objectContaining({
        entity: "notebook",
        record: expect.objectContaining({ id: "book-1", version: 2 }),
      }),
    );
  });

  it("does not advance past an earlier-page edit when newer rows arrive during pagination", async () => {
    const server = mockServer();
    server.pageLimit = 2;
    server.rows.notes = [
      noteRow("note-1", "2026-09-05T10:00:00.000Z"),
      noteRow("note-2", "2026-09-05T10:00:00.000Z"),
      noteRow("note-3", "2026-09-05T10:01:00.000Z"),
    ];
    let dataRequests = 0;
    server.beforeRequest = (table, url) => {
      if (table !== "notes" || url.searchParams.get("select") !== "*") return;
      if (++dataRequests === 2) {
        server.rows.notes[0] = noteRow("note-1", "2026-09-05T10:02:00.000Z", 2);
        server.rows.notes.push(noteRow("note-4", "2026-09-05T10:03:00.000Z"));
      }
    };
    const first = await cloud.syncAdapter.pull(null);

    const next = await cloud.syncAdapter.pull(first.cursor);

    expect(next.changes).toContainEqual(
      expect.objectContaining({
        record: expect.objectContaining({ id: "note-1", version: 2 }),
      }),
    );
    expect(next.changes.some((change) => change.record.id === "note-4")).toBe(
      true,
    );
  });

  it("rejects a later-page error and allows a complete retry from the original cursor", async () => {
    const server = mockServer();
    server.pageLimit = 2;
    server.rows.notes = Array.from({ length: 5 }, (_, index) =>
      noteRow(`note-${index}`, "2026-09-05T10:00:00.000Z"),
    );
    let dataRequests = 0;
    server.failRequest = (table, url) =>
      table === "notes" &&
      url.searchParams.get("select") === "*" &&
      ++dataRequests === 2;

    await expect(cloud.syncAdapter.pull(null)).rejects.toMatchObject({
      message: "page unavailable",
    });

    server.failRequest = () => false;
    const retry = await cloud.syncAdapter.pull(null);
    expect(retry.changes.map((change) => change.record.id)).toEqual(
      server.rows.notes.map((row) => row.id),
    );
  });
});

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
