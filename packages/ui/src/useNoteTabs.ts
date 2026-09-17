import { useEffect, useRef, useState } from "react";
import type { LocalRepository, Note } from "@smoke-notes/core";
import type { DesktopBridge } from "./types";

// sessionStorage belongs to this window and survives switchNote's document reload.
const storageKey = "smoke-notes:note-tabs";
function readOrder(): string[] {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? "[]",
    );
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (id): id is string =>
                typeof id === "string" && id.length > 0 && id.length <= 128,
            ),
          ),
        ].slice(0, 4)
      : [];
  } catch {
    return [];
  }
}

export function useNoteTabs(
  repository: LocalRepository,
  noteId: string,
  bridge: DesktopBridge,
) {
  const [notes, setNotes] = useState<Note[]>([]);
  const orderRef = useRef<string[] | null>(null);
  useEffect(() => {
    let revision = 0;
    if (orderRef.current === null) orderRef.current = readOrder();
    const reload = async () => {
      const request = ++revision;
      try {
        const recent = await bridge.getRecentNoteIds(noteId, 20);
        const ids = [...new Set([...orderRef.current!, noteId, ...recent])];
        const records = await Promise.all(
          ids.map((id) => repository.getNote(id)),
        );
        if (request !== revision) return;
        const valid = records.filter((item): item is Note => item !== null);
        const next = valid.slice(0, 4);
        // An externally opened note must be reachable without moving existing tabs.
        const current = valid.find((item) => item.id === noteId);
        if (current && !next.some((item) => item.id === noteId))
          next.splice(3, 1, current);
        orderRef.current = next.map((item) => item.id);
        setNotes(next);
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(orderRef.current));
        } catch {
          // Keep the in-memory order if session storage is unavailable.
        }
      } catch {
        // A temporary read failure must not erase the existing navigation.
      }
    };
    void reload();
    window.addEventListener("smoke-notes:data-changed", reload);
    return () => {
      ++revision;
      window.removeEventListener("smoke-notes:data-changed", reload);
    };
  }, [bridge, noteId, repository]);
  return { notes, setNotes };
}
