import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  LocalRepository,
  Note,
  NoteKind,
  NoteWindowState,
} from "@smoke-notes/core";
import {
  CheckSquare2,
  Minus,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import type { DesktopBridge } from "./types";
import { attachNoteMousePassthrough } from "./note-mouse-passthrough";
import {
  RichNoteEditor,
  type NoteEdit,
  type RichNoteEditorHandle,
} from "./components/RichNoteEditor";
import "./styles.css";

interface NoteWindowAppProps {
  repository: LocalRepository;
  noteId: string;
  bridge: DesktopBridge;
}

export function NoteWindowApp({
  repository,
  noteId,
  bridge,
}: NoteWindowAppProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [windowState, setWindowState] = useState<NoteWindowState | null>(null);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createControlRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RichNoteEditorHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (rootRef.current)
      return attachNoteMousePassthrough(rootRef.current, bridge);
  }, [bridge, noteId]);
  const refresh = useCallback(
    async () => setNote(await repository.getNote(noteId)),
    [repository, noteId],
  );

  useEffect(() => {
    void refresh();
    void bridge.getNoteWindowState(noteId).then(setWindowState);
    const reload = () => {
      void refresh();
    };
    window.addEventListener("smoke-notes:data-changed", reload);
    return () => window.removeEventListener("smoke-notes:data-changed", reload);
  }, [refresh, bridge, noteId]);

  useEffect(() => {
    let cancelled = false;
    void bridge.getRecentNoteIds(noteId, 20).then(async (ids) => {
      const uniqueIds = [...new Set([noteId, ...ids])];
      const records = await Promise.all(
        uniqueIds.map((id) => repository.getNote(id)),
      );
      if (!cancelled)
        setRecentNotes(
          records.filter((item): item is Note => item !== null).slice(0, 4),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, noteId, repository]);

  useEffect(() => {
    if (!createMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !createControlRef.current?.contains(event.target)
      ) {
        setCreateMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [createMenuOpen]);

  if (!note)
    return (
      <div ref={rootRef} className="note-window missing-note">
        <p>这张便签已被删除或无法读取。</p>
        <button type="button" onClick={() => void bridge.closeNote(noteId)}>
          关闭
        </button>
      </div>
    );
  const currentNote = note;

  async function createNote(kind: NoteKind) {
    const created = await repository.createNote(currentNote.notebookId, {
      title: "",
      body: "",
      color: currentNote.color,
      kind,
    });
    setCreateMenuOpen(false);
    window.dispatchEvent(new CustomEvent("smoke-notes:data-changed"));
    await bridge.openNote(created.id);
  }

  return (
    <div
      ref={rootRef}
      className={`note-window note-window-${note.color}`}
      onFocusCapture={(event) => {
        if (!createControlRef.current?.contains(event.target)) {
          setCreateMenuOpen(false);
        }
      }}
      style={
        {
          "--background-opacity": windowState?.backgroundOpacity ?? 0.92,
        } as CSSProperties
      }
    >
      <nav className="recent-note-tabs" aria-label="最近便签">
        {recentNotes.map((item) => {
          const displayTitle = item.title || "无标题便签";
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`切换便签：${displayTitle}`}
              className={`recent-note-tab note-color-${item.color}${item.id === noteId ? " active" : ""}`}
              title={displayTitle}
              onClick={async () => {
                if (item.id === noteId) return;
                const target = await repository.getNote(item.id);
                if (!target) {
                  setRecentNotes((current) =>
                    current.filter((candidate) => candidate.id !== item.id),
                  );
                  return;
                }
                try {
                  await editorRef.current?.flushSave();
                  await bridge.switchNote(item.id);
                } catch {
                  /* Keep the current note visible when navigation fails. */
                }
              }}
            >
              <span>{displayTitle}</span>
            </button>
          );
        })}
      </nav>
      <header className="note-window-bar">
        <div className="note-window-create-control" ref={createControlRef}>
          <button
            type="button"
            aria-label="新建便签"
            aria-haspopup="menu"
            aria-expanded={createMenuOpen}
            onClick={() => setCreateMenuOpen((open) => !open)}
          >
            <Plus size={17} />
          </button>
          {createMenuOpen && (
            <div className="note-window-create-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => void createNote("note")}
              >
                <StickyNote size={12} />
                普通便签
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void createNote("todo")}
              >
                <CheckSquare2 size={12} />
                待办便签
              </button>
            </div>
          )}
        </div>
        <span className="note-window-drag-handle" />
        <button
          type="button"
          aria-label="最小化便签"
          onClick={() => void bridge.minimizeWindow()}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          aria-label={windowState?.alwaysOnTop ? "取消置顶" : "窗口置顶"}
          onClick={async () => {
            const next = !(windowState?.alwaysOnTop ?? false);
            await bridge.setAlwaysOnTop(next);
            setWindowState(
              await bridge.saveNoteWindowState(noteId, { alwaysOnTop: next }),
            );
          }}
        >
          {windowState?.alwaysOnTop ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
        <label className="note-opacity-control" title="透明度">
          <input
            type="range"
            min="45"
            max="100"
            aria-label="便签透明度"
            value={Math.round((windowState?.backgroundOpacity ?? 0.92) * 100)}
            onChange={async (event) => {
              const backgroundOpacity = await bridge.setBackgroundOpacity(
                Number(event.target.value) / 100,
              );
              setWindowState(
                await bridge.saveNoteWindowState(noteId, {
                  backgroundOpacity,
                }),
              );
            }}
          />
        </label>
        <button
          type="button"
          aria-label="删除便签"
          onClick={async () => {
            await repository.trashNote(noteId);
            await bridge.closeNote(noteId);
            window.dispatchEvent(new CustomEvent("smoke-notes:data-changed"));
          }}
        >
          <Trash2 size={15} />
        </button>
        <button
          type="button"
          aria-label="关闭便签"
          onClick={() => void bridge.closeNote(noteId)}
        >
          <X size={17} />
        </button>
      </header>
      <RichNoteEditor
        ref={editorRef}
        note={note}
        onSave={async (changes: NoteEdit) => {
          const updated = await repository.updateNote(noteId, changes);
          setNote(updated);
          window.dispatchEvent(new CustomEvent("smoke-notes:data-changed"));
        }}
        className="standalone-note-editor"
      />
    </div>
  );
}
