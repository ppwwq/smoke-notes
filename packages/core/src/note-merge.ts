import type { Note } from "./types";

// JSONB can reorder object keys. Formatting and task states still matter.
function sameValue(left: unknown, right: unknown): boolean {
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

const fields = [
  "notebookId",
  "kind",
  "title",
  "body",
  "contentJson",
  "color",
  "rank",
] as const;

export function sameNoteContent(left: Note, right: Note): boolean {
  return (
    Boolean(left.deletedAt) === Boolean(right.deletedAt) &&
    fields.every((field) => sameValue(left[field], right[field]))
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
  for (const field of fields.filter(
    (field) => field !== "body" && field !== "contentJson",
  )) {
    if (sameValue(local[field], base[field])) continue;
    if (
      !sameValue(remote[field], base[field]) &&
      !sameValue(local[field], remote[field])
    )
      return null;
    Object.assign(merged, { [field]: local[field] });
  }
  // Rich text and its plain-text projection form one field.
  const content = (note: Note) => ({
    body: note.body,
    contentJson: note.contentJson,
  });
  if (!sameValue(content(local), content(base))) {
    if (
      !sameValue(content(remote), content(base)) &&
      !sameValue(content(local), content(remote))
    )
      return null;
    merged.body = local.body;
    merged.contentJson = local.contentJson;
  }
  return merged;
}
