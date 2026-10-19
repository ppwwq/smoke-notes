import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { NOTE_DEFAULT_OPACITY, NOTE_MIN_OPACITY } from "@smoke-notes/core";
import type {
  LocalRepository,
  Note,
  NoteKind,
  NoteWindowState,
} from "@smoke-notes/core";
import {
  CheckSquare2,
  Minus,
  MoreHorizontal,
  Type,
  NoteAppearance,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "./icons";
import type { DesktopBridge } from "./types";
import { useNoteTabs } from "./useNoteTabs";
import { useDesktopQuit } from "./useDesktopQuit";
import { useActionMenu } from "./useActionMenu";
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
  const { notes: recentNotes, setNotes: setRecentNotes } = useNoteTabs(
    repository,
    noteId,
    bridge,
  );
  const {
    open: createMenuOpen,
    setOpen: setCreateMenuOpen,
    controlRef: createControlRef,
    triggerRef: createTriggerRef,
    onKeyDown: onCreateKeyDown,
  } = useActionMenu();
  const {
    open: toolsOpen,
    setOpen: setToolsOpen,
    controlRef: toolsControlRef,
    triggerRef: toolsTriggerRef,
    onKeyDown: onToolsKeyDown,
  } = useActionMenu();
  const [formatOpen, setFormatOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("已自动保存");
  const saveError = ["已自动保存", "待保存", "保存中…"].includes(saveStatus)
    ? null
    : saveStatus;
  const [pinBusy, setPinBusy] = useState(false);
  const opacityRevision = useRef(0);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const switchingRef = useRef(false);
  const [pendingCreated, setPendingCreated] = useState<{
    id: string;
    kind: NoteKind;
  } | null>(null);
  const editorRef = useRef<RichNoteEditorHandle>(null);
  const { preparingQuit, quitError } = useDesktopQuit(bridge, editorRef);
  const rootRef = useRef<HTMLDivElement>(null);
  const refreshRevision = useRef(0);
  const invalidateRefresh = useCallback(() => {
    ++refreshRevision.current;
  }, []);
  const activeNoteIdRef = useRef(noteId);
  const [recoveryTarget, setRecoveryTarget] = useState<string | null>(null);
  const attemptedRecoveryRef = useRef<string | null>(null);
  const openRecoveredNote = useCallback(
    async (targetId: string) => {
      if (switchingRef.current) return;
      switchingRef.current = true;
      setSwitching(true);
      setSwitchError(null);
      try {
        await editorRef.current?.flushSave();
        await bridge.switchNote(targetId);
        setRecoveryTarget(null);
      } catch {
        setSwitchError("恢复副本保存或切换失败，当前草稿已保留，请重试。");
      } finally {
        switchingRef.current = false;
        setSwitching(false);
      }
    },
    [bridge],
  );
  useEffect(() => {
    if (
      !recoveryTarget ||
      switching ||
      attemptedRecoveryRef.current === recoveryTarget
    )
      return;
    attemptedRecoveryRef.current = recoveryTarget;
    void openRecoveredNote(recoveryTarget);
  }, [openRecoveredNote, recoveryTarget, switching]);
  const closeNote = useCallback(async () => {
    if (switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    setSwitchError(null);
    try {
      await editorRef.current?.flushSave();
      await bridge.closeNote(noteId);
    } catch {
      setSwitchError("保存或关闭失败，当前草稿已保留，请重试。");
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }, [bridge, noteId]);
  useEffect(
    () => bridge.onNoteCloseRequested?.(() => void closeNote()),
    [bridge, closeNote],
  );
  useEffect(() => {
    if (rootRef.current)
      return attachNoteMousePassthrough(rootRef.current, bridge);
  }, [bridge, noteId]);
  const refresh = useCallback(async () => {
    const revision = ++refreshRevision.current;
    try {
      const next = await repository.getNote(activeNoteIdRef.current);
      if (revision !== refreshRevision.current) return;
      // Another renderer may delete a note while this editor has unsaved
      // changes. Preserve that draft before removing the editor.
      if (!next) await editorRef.current?.flushSave();
      if (revision === refreshRevision.current) setNote(next);
    } catch {
      if (revision === refreshRevision.current)
        setSwitchError("读取或保存失败，当前草稿已保留，请重试。");
    }
  }, [repository]);

  useEffect(() => {
    activeNoteIdRef.current = noteId;
    void refresh();
    void bridge.getNoteWindowState(noteId).then(setWindowState);
    const reload = () => {
      void refresh();
    };
    window.addEventListener("smoke-notes:data-changed", reload);
    return () => {
      invalidateRefresh();
      window.removeEventListener("smoke-notes:data-changed", reload);
    };
  }, [refresh, bridge, noteId, invalidateRefresh]);

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
  }, [createMenuOpen, createControlRef, setCreateMenuOpen]);

  if (!note)
    return (
      <div
        ref={rootRef}
        inert={preparingQuit}
        className="note-window missing-note"
      >
        <p>这张便签已被删除或无法读取。</p>
        {quitError && <p role="alert">{quitError}</p>}
        {switchError && <p role="alert">{switchError}</p>}
        <button
          type="button"
          disabled={switching}
          onClick={() => void closeNote()}
        >
          关闭
        </button>
      </div>
    );
  const currentNote = note;

  async function createNote(kind: NoteKind) {
    if (switchingRef.current) return;
    switchingRef.current = true;
    setSwitching(true);
    setSwitchError(null);
    setCreateMenuOpen(false);
    let target = pendingCreated;
    try {
      await editorRef.current?.flushSave();
      if (!target) {
        const created = await repository.createNote(currentNote.notebookId, {
          title: "",
          body: "",
          color: currentNote.color,
          kind,
        });
        target = { id: created.id, kind };
        setPendingCreated(target);
        window.dispatchEvent(new CustomEvent("smoke-notes:data-changed"));
      }
      await bridge.switchNote(target.id);
      setPendingCreated(null);
    } catch {
      setSwitchError(
        target
          ? "新便签已创建，但切换失败。请重试打开，不会重复创建。"
          : "保存或新建失败，当前草稿已保留，请重试。",
      );
    } finally {
      switchingRef.current = false;
      setSwitching(false);
    }
  }

  return (
    <div
      ref={rootRef}
      inert={preparingQuit}
      className={`note-window note-window-${note.color}`}
      onFocusCapture={(event) => {
        if (!createControlRef.current?.contains(event.target)) {
          setCreateMenuOpen(false);
        }
      }}
      style={
        {
          "--background-opacity":
            windowState?.backgroundOpacity ?? NOTE_DEFAULT_OPACITY,
        } as CSSProperties
      }
    >
      <nav
        className="recent-note-tabs"
        aria-label="最近便签"
        aria-busy={switching}
      >
        {recentNotes.map((item) => {
          const displayTitle = item.title || "无标题便签";
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`切换便签：${displayTitle}`}
              className={`recent-note-tab${item.id === noteId ? " active" : ""}`}
              title={displayTitle}
              aria-current={item.id === noteId ? "page" : undefined}
              disabled={switching}
              onClick={async () => {
                if (item.id === noteId || switchingRef.current) return;
                switchingRef.current = true;
                setSwitching(true);
                setSwitchError(null);
                try {
                  const target = await repository.getNote(item.id);
                  if (!target) {
                    setRecentNotes((current) =>
                      current.filter((candidate) => candidate.id !== item.id),
                    );
                    setSwitchError("这张便签已不存在，请选择另一张。");
                    return;
                  }
                  await editorRef.current?.flushSave();
                  await bridge.switchNote(item.id);
                  setToolsOpen(false);
                } catch {
                  setSwitchError("切换失败，当前内容已保留，请重试。");
                } finally {
                  switchingRef.current = false;
                  setSwitching(false);
                }
              }}
            >
              <span>{displayTitle}</span>
            </button>
          );
        })}
      </nav>
      <header className="note-window-bar">
        <div
          className="note-window-create-control"
          ref={createControlRef}
          onKeyDown={onCreateKeyDown}
        >
          <button
            type="button"
            aria-label="新建便签"
            ref={createTriggerRef}
            disabled={switching || !!pendingCreated}
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
        <span className="note-window-drag-handle" aria-label="拖动便签" />
        <div
          className="note-tools-control"
          ref={toolsControlRef}
          onKeyDown={onToolsKeyDown}
        >
          <button
            type="button"
            aria-label="便签工具"
            aria-haspopup="menu"
            aria-expanded={toolsOpen}
            ref={toolsTriggerRef}
            onClick={() => {
              setCreateMenuOpen(false);
              setToolsOpen(!toolsOpen);
            }}
          >
            <MoreHorizontal size={17} />
          </button>
          {toolsOpen && (
            <div className="note-tools-panel" role="menu" aria-label="便签工具">
              <button
                type="button"
                role="menuitem"
                data-format-toggle
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  setToolsOpen(false);
                  setFormatOpen(true);
                }}
              >
                <Type size={15} />
                文字格式
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setToolsOpen(false);
                  setAppearanceOpen(true);
                }}
              >
                <NoteAppearance size={15} />
                便签颜色
              </button>
              <button
                type="button"
                role="menuitem"
                aria-label="删除便签"
                disabled={switching}
                onClick={async () => {
                  if (switchingRef.current) return;
                  switchingRef.current = true;
                  setSwitching(true);
                  setSwitchError(null);
                  try {
                    await editorRef.current?.flushSave();
                    await repository.trashNote(activeNoteIdRef.current);
                    window.dispatchEvent(
                      new CustomEvent("smoke-notes:data-changed"),
                    );
                    await bridge.closeNote(noteId);
                  } catch {
                    setSwitchError("删除失败，请重试。");
                  } finally {
                    switchingRef.current = false;
                    setSwitching(false);
                  }
                }}
              >
                <Trash2 size={15} />
                删除便签
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="最小化便签"
          onClick={() => void bridge.minimizeWindow()}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="note-pin-control"
          disabled={pinBusy || !windowState}
          aria-pressed={windowState?.alwaysOnTop ?? false}
          aria-label={windowState?.alwaysOnTop ? "取消置顶" : "窗口置顶"}
          onClick={async () => {
            setPinBusy(true);
            setControlError(null);
            try {
              const alwaysOnTop = await bridge.setAlwaysOnTop(
                !(windowState?.alwaysOnTop ?? false),
              );
              setWindowState(
                await bridge.saveNoteWindowState(noteId, { alwaysOnTop }),
              );
            } catch {
              setControlError("置顶设置失败，请重试。");
            } finally {
              setPinBusy(false);
            }
          }}
        >
          {windowState?.alwaysOnTop ? <PinOff size={15} /> : <Pin size={15} />}
          <span>{windowState?.alwaysOnTop ? "已置顶" : "未置顶"}</span>
        </button>
        <label
          className="note-opacity-control"
          title="背景不透明度：数值越小越清透"
        >
          <input
            type="range"
            min={NOTE_MIN_OPACITY * 100}
            max="100"
            aria-label="便签透明度"
            value={Math.round(
              (windowState?.backgroundOpacity ?? NOTE_DEFAULT_OPACITY) * 100,
            )}
            onChange={async (event) => {
              const requested = Number(event.target.value) / 100;
              const revision = ++opacityRevision.current;
              setControlError(null);
              try {
                const backgroundOpacity =
                  await bridge.setBackgroundOpacity(requested);
                if (revision === opacityRevision.current)
                  setWindowState((current) =>
                    current ? { ...current, backgroundOpacity } : current,
                  );
              } catch {
                if (revision === opacityRevision.current)
                  setControlError("透明度保存失败，请重试。");
              }
            }}
          />
        </label>
        <button
          type="button"
          aria-label="关闭便签"
          disabled={switching}
          onClick={() => void closeNote()}
        >
          <X size={17} />
        </button>
      </header>
      {quitError && <p role="alert">{quitError}</p>}
      {controlError && <p role="alert">{controlError}</p>}
      {saveError && !quitError && !switchError && (
        <p role="alert">{saveError}，草稿仍保留，请重试。</p>
      )}
      {switchError && (
        <div role="alert">
          <p>{switchError}</p>
          {pendingCreated && (
            <button
              type="button"
              disabled={switching}
              onClick={() => void createNote(pendingCreated.kind)}
            >
              重试打开新便签
            </button>
          )}
          {recoveryTarget && (
            <button
              type="button"
              disabled={switching}
              onClick={() => void openRecoveredNote(recoveryTarget)}
            >
              打开恢复副本
            </button>
          )}
        </div>
      )}
      <RichNoteEditor
        ref={editorRef}
        note={note}
        onSave={async (changes: NoteEdit) => {
          const updated = await repository.updateNote(
            changes.baseSnapshot?.id ?? currentNote.id,
            changes,
          );
          invalidateRefresh();
          activeNoteIdRef.current = updated.id;
          setNote(updated);
          if (updated.id !== noteId) setRecoveryTarget(updated.id);
          window.dispatchEvent(new CustomEvent("smoke-notes:data-changed"));
          return updated;
        }}
        onSaveStatusChange={setSaveStatus}
        className="standalone-note-editor"
        progressive
        compact
        formatOpen={formatOpen}
        onFormatClose={() => setFormatOpen(false)}
        appearanceOpen={appearanceOpen}
        onAppearanceClose={() => setAppearanceOpen(false)}
      />
    </div>
  );
}
