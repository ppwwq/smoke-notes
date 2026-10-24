import { useEffect, useState } from "react";
import type { Notebook } from "@smoke-notes/core";

const storageKey = (workspace: string) =>
  `smoke-notes:notebook-tones:${workspace}`;
function readTones(workspace: string): Record<string, number> {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(storageKey(workspace)) ?? "{}",
    );
    if (!stored || typeof stored !== "object" || Array.isArray(stored))
      return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        ([, value]) => Number.isInteger(value) && value >= 0 && value < 4,
      ),
    );
  } catch {
    return {};
  }
}

/** Preserve the current palette on first use, then let each notebook keep its cover. */
export function useNotebookTones(notebooks: Notebook[]) {
  const workspace = notebooks[0]?.workspaceId ?? "";
  const [saved, setSaved] = useState(() => ({
    workspace,
    tones: readTones(workspace),
  }));
  let tones =
    saved.workspace === workspace ? saved.tones : readTones(workspace);
  if (
    saved.workspace !== workspace ||
    notebooks.some((book) => !Object.hasOwn(tones, book.id))
  ) {
    tones = { ...tones };
    notebooks.forEach((book, index) => {
      if (!Object.hasOwn(tones, book.id)) tones[book.id] = index % 4;
    });
    setSaved({ workspace, tones });
  }
  useEffect(() => {
    if (!saved.workspace) return;
    try {
      localStorage.setItem(
        storageKey(saved.workspace),
        JSON.stringify(saved.tones),
      );
    } catch {
      /* Storage can be disabled; keep the current session's covers. */
    }
  }, [saved]);
  return tones;
}
