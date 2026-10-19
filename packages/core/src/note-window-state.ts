import type { NoteWindowState } from "./types";

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 400;
const MIN_WIDTH = 250;
const MIN_HEIGHT = 180;
export const NOTE_MIN_OPACITY = 0.2;
export const NOTE_DEFAULT_OPACITY = 0.28;

export function clampNoteOpacity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(NOTE_MIN_OPACITY, value))
    : NOTE_DEFAULT_OPACITY;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function normalizeNoteWindowState(
  noteId: string,
  input: (Partial<NoteWindowState> & { opacity?: unknown }) | null | undefined,
): NoteWindowState {
  const width = finiteNumber(input?.width);
  const height = finiteNumber(input?.height);
  const backgroundOpacity =
    finiteNumber(input?.backgroundOpacity) ?? finiteNumber(input?.opacity);
  const x = finiteNumber(input?.x);
  const y = finiteNumber(input?.y);
  const lastOpenedAt =
    typeof input?.lastOpenedAt === "string" &&
    Number.isFinite(Date.parse(input.lastOpenedAt))
      ? input.lastOpenedAt
      : undefined;
  return {
    noteId,
    ...(x === undefined ? {} : { x: Math.round(x) }),
    ...(y === undefined ? {} : { y: Math.round(y) }),
    width: Math.max(MIN_WIDTH, Math.round(width ?? DEFAULT_WIDTH)),
    height: Math.max(MIN_HEIGHT, Math.round(height ?? DEFAULT_HEIGHT)),
    backgroundOpacity: clampNoteOpacity(backgroundOpacity),
    alwaysOnTop: input?.alwaysOnTop === true,
    isOpen: input?.isOpen === true,
    ...(lastOpenedAt ? { lastOpenedAt } : {}),
  };
}
