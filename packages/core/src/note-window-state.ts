import { clampOpacity } from "./domain";
import type { NoteWindowState } from "./types";

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 420;
// The Electron window keeps a 30 px transparent lane for the side tabs, so
// the editable note body still has the promised 220 px minimum width.
const MIN_WIDTH = 250;
const MIN_HEIGHT = 180;
const DEFAULT_OPACITY = 0.92;

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
    backgroundOpacity: clampOpacity(backgroundOpacity ?? DEFAULT_OPACITY),
    alwaysOnTop: input?.alwaysOnTop === true,
    isOpen: input?.isOpen === true,
    ...(lastOpenedAt ? { lastOpenedAt } : {}),
  };
}
