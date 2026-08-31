import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase note-kind migration", () => {
  it("adds a constrained note kind with a backwards-compatible default", () => {
    const path = resolve(
      process.cwd(),
      "supabase/migrations/202608290001_note_kinds.sql",
    );

    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, "utf8");
    expect(sql).toMatch(/add column kind text not null default 'note'/i);
    expect(sql).toMatch(/kind in \('note', 'todo'\)/i);
  });

  it("writes the note kind through the mutation edge function", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/apply-mutation/index.ts"),
      "utf8",
    );

    expect(source).toContain("kind: noteKind(payload.kind)");
  });
});
