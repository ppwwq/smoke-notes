import type { Note } from "./types";
import { normalizeRichTextDocument, richTextToPlainText } from "./note-content";

// JSONB can reorder object keys. Formatting and task states still matter.
export function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
  );
}

const fields = ["notebookId", "kind", "title", "color", "rank"] as const;

// The rich document is authoritative. Old clients used a different plain-text
// projection for line breaks; comparing that cached projection creates false
// conflicts. Unmigrated records still retain their body as the fallback.
const content = (note: Note) =>
  normalizeRichTextDocument(note.contentJson, note.body);

export function sameNoteContent(left: Note, right: Note): boolean {
  return (
    Boolean(left.deletedAt) === Boolean(right.deletedAt) &&
    fields.every((field) => sameValue(left[field], right[field])) &&
    sameValue(content(left), content(right))
  );
}

export function mergeNoteChanges(
  local: Note,
  remote: Note,
  base?: Note,
): Note | null {
  if (sameNoteContent(local, remote)) return remote;
  if (!base || base.id !== local.id) return null;
  if (sameNoteContent(local, base)) return remote;
  if (sameNoteContent(remote, base))
    return { ...local, conflictOf: remote.conflictOf };
  // Never turn a delete-versus-edit conflict into a silent deletion or revival.
  if (local.deletedAt || remote.deletedAt || base.deletedAt) return null;
  const merged = { ...remote };
  for (const field of fields) {
    if (sameValue(local[field], base[field])) continue;
    if (
      !sameValue(remote[field], base[field]) &&
      !sameValue(local[field], remote[field])
    )
      return null;
    Object.assign(merged, { [field]: local[field] });
  }
  if (!sameValue(content(local), content(base))) {
    if (
      !sameValue(content(remote), content(base)) &&
      !sameValue(content(local), content(remote))
    )
      return null;
    merged.contentJson = content(local);
    merged.body = richTextToPlainText(merged.contentJson);
  }
  return merged;
}
