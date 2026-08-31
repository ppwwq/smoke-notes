import type {
  NoteColor,
  NoteKind,
  RichTextDocument,
  RichTextNode,
} from "./types";

export const NOTE_COLORS = [
  "amber",
  "rose",
  "sage",
  "sky",
  "violet",
  "graphite",
] as const;
export const DEFAULT_NOTE_COLOR: NoteColor = "amber";
export const DEFAULT_NOTE_KIND: NoteKind = "note";
export const TEXT_COLORS = [
  "#d9dde1",
  "#e98286",
  "#e6a35c",
  "#d7bd68",
  "#75b99a",
  "#78aecd",
  "#b59ad6",
] as const;
export const HIGHLIGHT_COLORS = [
  "#6f3d40",
  "#73512d",
  "#7f6a2f",
  "#365f50",
  "#36586d",
  "#56446d",
] as const;

export function migrateLegacyNoteContent(body = ""): RichTextDocument {
  return {
    type: "doc",
    content: body.split("\n").map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}

export function createTaskListContent(body = ""): RichTextDocument {
  return {
    type: "doc",
    content: [
      {
        type: "taskList",
        content: body.split("\n").map((line) => ({
          type: "taskItem",
          attrs: { checked: false },
          content: [
            {
              type: "paragraph",
              ...(line ? { content: [{ type: "text", text: line }] } : {}),
            },
          ],
        })),
      },
    ],
  };
}

function nodeText(node: RichTextNode): string {
  if (typeof node.text === "string") return node.text;
  const content = node.content ?? [];
  const joined = content.map(nodeText).join("");
  return node.type === "paragraph" ? `${joined}\n` : joined;
}

export function richTextToPlainText(document: RichTextDocument): string {
  return (document.content ?? []).map(nodeText).join("").replace(/\n+$/, "");
}

export function normalizeNoteColor(value: unknown): NoteColor {
  return typeof value === "string" && NOTE_COLORS.includes(value as NoteColor)
    ? (value as NoteColor)
    : DEFAULT_NOTE_COLOR;
}

export function normalizeNoteKind(value: unknown): NoteKind {
  return value === "todo" ? "todo" : DEFAULT_NOTE_KIND;
}

function migrateTaskNode(node: RichTextNode): RichTextNode {
  const type =
    node.type === "bulletList"
      ? "taskList"
      : node.type === "listItem"
        ? "taskItem"
        : node.type;
  const attrs =
    type === "taskItem"
      ? { ...node.attrs, checked: node.attrs?.checked === true }
      : node.attrs;
  return {
    ...node,
    ...(type === undefined ? {} : { type }),
    ...(attrs === undefined ? {} : { attrs }),
    ...(node.content
      ? { content: node.content.map((item) => migrateTaskNode(item)) }
      : {}),
  };
}

export function migrateLegacyTaskLists(
  document: RichTextDocument,
): RichTextDocument {
  return migrateTaskNode(document) as RichTextDocument;
}

function normalizePaletteColor<T extends readonly string[]>(
  value: unknown,
  palette: T,
): T[number] | null {
  return typeof value === "string" && palette.includes(value)
    ? (value as T[number])
    : null;
}

export function normalizeTextColor(
  value: unknown,
): (typeof TEXT_COLORS)[number] | null {
  return normalizePaletteColor(value, TEXT_COLORS);
}

export function normalizeHighlightColor(
  value: unknown,
): (typeof HIGHLIGHT_COLORS)[number] | null {
  return normalizePaletteColor(value, HIGHLIGHT_COLORS);
}

export function normalizeRichTextDocument(
  value: unknown,
  fallbackBody = "",
): RichTextDocument {
  if (!value || typeof value !== "object")
    return migrateLegacyNoteContent(fallbackBody);
  const candidate = value as Partial<RichTextDocument>;
  if (candidate.type !== "doc" || !Array.isArray(candidate.content)) {
    return migrateLegacyNoteContent(fallbackBody);
  }
  return candidate as RichTextDocument;
}
