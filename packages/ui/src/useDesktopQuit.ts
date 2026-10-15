import { useEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { RichNoteEditorHandle } from "./components/RichNoteEditor";
import type { DesktopBridge } from "./types";

export function useDesktopQuit(
  bridge: Pick<DesktopBridge, "onPrepareQuit" | "onQuitCancelled"> | undefined,
  editor: RefObject<RichNoteEditorHandle | null>,
) {
  const [preparingQuit, setPreparingQuit] = useState(false);
  const [quitError, setQuitError] = useState<string | null>(null);
  useEffect(() => {
    if (!bridge?.onPrepareQuit || !bridge.onQuitCancelled) return;
    let generation = 0;
    const removePrepare = bridge.onPrepareQuit(async () => {
      const current = ++generation;
      setQuitError(null);
      // Allow an active IME composition to finish before locking the controls.
      await editor.current?.flushSave();
      if (current !== generation) throw new Error("Quit cancelled");
      // The main process must not receive an acknowledgement while the UI is
      // still editable. Flush the lock synchronously, then any final blur edit.
      flushSync(() => setPreparingQuit(true));
      await editor.current?.flushSave();
      if (current !== generation) throw new Error("Quit cancelled");
    });
    const removeCancel = bridge.onQuitCancelled((message) => {
      ++generation;
      setPreparingQuit(false);
      setQuitError(message);
    });
    return () => {
      ++generation;
      removePrepare();
      removeCancel();
    };
  }, [bridge, editor]);
  return { preparingQuit, quitError };
}
