import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  LocalRepository,
  Note,
  Notebook,
  Todo,
  TrashRecord,
  SyncStatus,
} from "@smoke-notes/core";
import {
  ArrowLeft,
  CheckCircle2,
  Menu,
  Minus,
  MoreHorizontal,
  Settings2,
  Library,
  NotebookPen,
  Trash2,
  Wifi,
  WifiOff,
  X,
  NoteAppearance as Palette,
} from "./icons";
import { Sidebar } from "./components/Sidebar";
import { WebNotebookCollection } from "./components/WebNotebookCollection";
import { NotesWorkspace } from "./components/NotesWorkspace";
import { TodoWorkspace, type TodoFilter } from "./components/TodoWorkspace";
import { SettingsPanel } from "./components/SettingsPanel";
import { PairingDialog } from "./components/PairingDialog";
import type { RichNoteEditorHandle } from "./components/RichNoteEditor";
import { SyncIndicator } from "./components/SyncIndicator";
import { useMobileSidebar } from "./useMobileSidebar";
const RichNoteEditor = lazy(() =>
  import("./components/RichNoteEditor").then((module) => ({
    default: module.RichNoteEditor,
  })),
);
import type { AppPlatform, DesktopBridge, PairingController } from "./types";
import { useWebViewport } from "./useWebViewport";
import { useWebBackground } from "./useWebBackground";
import { useDesktopQuit } from "./useDesktopQuit";
import { GlassContext } from "./components/glass/GlassContext";
import { GlassSurface } from "./components/glass/GlassSurface";
import "./styles.css";

interface SmokeNotesAppProps {
  repository: LocalRepository;
  platform: AppPlatform;
  desktopBridge?: DesktopBridge;
  pairingController?: PairingController;
  syncStatus?: SyncStatus;
}

interface LastTrashed {
  entity: "notebook" | "note" | "todo";
  id: string;
  label: string;
}

export function SmokeNotesApp({
  repository,
  platform,
  desktopBridge,
  pairingController,
  syncStatus,
}: SmokeNotesAppProps) {
  const {
    background,
    changeBackground,
    reduceTransparency,
    reducedTransparency,
    systemReduced,
    changeReduceTransparency,
    notice: backgroundNotice,
  } = useWebBackground(platform === "web");
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [trash, setTrash] = useState<TrashRecord[]>([]);
  const [view, setView] = useState<"notes" | "todos">("notes");
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(
    null,
  );
  const selectedNotebookIdRef = useRef<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [notebookCollectionOpen, setNotebookCollectionOpen] = useState(false);
  const [notebookCardsExpanded, setNotebookCardsExpanded] = useState(false);
  const [todoFilter, setTodoFilter] = useState<TodoFilter>("all");
  const workspaceRef = useRef<HTMLDivElement>(null);
  const browsePositions = useRef(new Map<string, Map<string, number>>());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const { mobile, panelRef, triggerRef } = useMobileSidebar(
    mobileNavOpen,
    closeMobileNav,
  );
  const [pairingOpen, setPairingOpen] = useState(false);
  const [lastTrashed, setLastTrashed] = useState<LastTrashed | null>(null);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.82);
  const [saveStatus, setSaveStatus] = useState("已自动保存");
  const [manualSaving, setManualSaving] = useState(false);
  const manualSavePending = useRef(false);
  const creatingRef = useRef(false);
  const editorRef = useRef<RichNoteEditorHandle>(null);
  const { preparingQuit, quitError } = useDesktopQuit(desktopBridge, editorRef);
  const activeNoteRef = useRef<Note | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [editorMenu, setEditorMenu] = useState<
    "format" | "more" | "appearance" | null
  >(null);
  const [editorActionError, setEditorActionError] = useState("");
  const editorDeletePending = useRef(false);
  const [editorDeleting, setEditorDeleting] = useState(false);
  const closeEditorMenu = useCallback(() => setEditorMenu(null), []);
  const refreshRevision = useRef(0);
  const invalidateRefresh = useCallback(() => {
    ++refreshRevision.current;
  }, []);

  const refresh = useCallback(
    async (preferredNotebookId?: string | null) => {
      const revision = ++refreshRevision.current;
      const [nextNotebooks, nextTodos, nextTrash] = await Promise.all([
        repository.listNotebooks(),
        repository.listTodos(),
        repository.listTrash(),
      ]);
      if (revision !== refreshRevision.current) return;
      const requestedId =
        preferredNotebookId === undefined
          ? selectedNotebookIdRef.current
          : preferredNotebookId;
      const targetId = nextNotebooks.some((item) => item.id === requestedId)
        ? requestedId
        : (nextNotebooks[0]?.id ?? null);
      const nextNotes = targetId ? await repository.listNotes(targetId) : [];
      // A save or a later refresh invalidates this snapshot, even when local
      // queue compaction has lowered the note's version in the meantime.
      if (revision !== refreshRevision.current) return;
      const activeNote = activeNoteRef.current;
      if (activeNote && !nextNotes.some((item) => item.id === activeNote.id)) {
        // A remote deletion must not unmount an editor with an unsaved draft.
        // Storage preserves changed drafts as a new note; onSave selects it.
        try {
          await editorRef.current?.flushSave();
        } catch {
          return;
        }
        if (revision !== refreshRevision.current) return;
      }
      setNotebooks(nextNotebooks);
      setTodos(nextTodos);
      setTrash(nextTrash);
      selectedNotebookIdRef.current = targetId;
      setSelectedNotebookId(targetId);
      setNotes(nextNotes);
      setSelectedNoteId((current) => {
        if (nextNotes.some((note) => note.id === current)) return current;
        return null;
      });
    },
    [repository],
  );

  const refreshAfterMutation = useCallback(
    async (preferredNotebookId?: string | null) => {
      await refresh(preferredNotebookId);
      window.dispatchEvent(new CustomEvent("smoke-notes:data-changed"));
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    return invalidateRefresh;
  }, [refresh, invalidateRefresh]);

  useEffect(() => {
    if (!desktopBridge) return;
    void desktopBridge
      .getWindowState()
      .then((state) => setBackgroundOpacity(state.backgroundOpacity));
  }, [desktopBridge]);

  useEffect(() => {
    const reload = () => {
      void refresh();
    };
    window.addEventListener("smoke-notes:data-changed", reload);
    return () => window.removeEventListener("smoke-notes:data-changed", reload);
  }, [refresh]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!lastTrashed) return;
    const timer = window.setTimeout(() => setLastTrashed(null), 6000);
    return () => window.clearTimeout(timer);
  }, [lastTrashed]);

  async function saveBeforeLeaving() {
    try {
      await editorRef.current?.flushSave();
      return true;
    } catch {
      return false;
    }
  }

  async function showTodos() {
    if (!(await saveBeforeLeaving())) return;
    setView("todos");
    setMobileNavOpen(false);
  }

  async function selectNotebook(id: string) {
    if (!(await saveBeforeLeaving())) return;
    setView("notes");
    selectedNotebookIdRef.current = id;
    setSelectedNoteId(null);
    setMobileNavOpen(false);
    await refresh(id);
  }

  const selectedNotebook =
    notebooks.find((item) => item.id === selectedNotebookId) ?? null;
  const selectedNote = selectedNoteId
    ? (notes.find((item) => item.id === selectedNoteId) ?? null)
    : null;
  useLayoutEffect(() => {
    activeNoteRef.current = selectedNote;
  }, [selectedNote]);

  useEffect(() => {
    if (platform !== "web") return;
    const saveInBackground = () => {
      if (document.visibilityState === "hidden")
        void editorRef.current?.flushSave().catch(() => {});
    };
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (
        !activeNoteRef.current ||
        saveStatus === "已自动保存" ||
        saveStatus === "已保存"
      )
        return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", saveInBackground);
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => {
      document.removeEventListener("visibilitychange", saveInBackground);
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    };
  }, [platform, saveStatus]);

  const webEditing = platform === "web" && view === "notes" && !!selectedNote;
  const browseKey = notebookCollectionOpen
    ? "notebooks"
    : view === "todos"
      ? `todos:${todoFilter}`
      : `notes:${selectedNotebookId}`;
  useLayoutEffect(() => {
    if (platform !== "web" || webEditing) return;
    const positions = browsePositions.current.get(browseKey);
    workspaceRef.current
      ?.querySelectorAll<HTMLElement>(
        ".notes-board, .notes-board-scroll, .todo-workspace, .web-notebook-collection",
      )
      .forEach((element) => {
        element.scrollTop = positions?.get(element.classList[0]) ?? 0;
      });
  }, [platform, browseKey, webEditing]);
  const { style: viewportStyle, compactEditing } = useWebViewport(webEditing);
  useEffect(() => {
    setEditorMenu(null);
    setEditorActionError("");
  }, [compactEditing, selectedNoteId]);
  useEffect(() => {
    if (editorMenu !== "more") return;
    moreButtonRef.current?.parentElement
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(".editor-more-control")
      )
        closeEditorMenu();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeEditorMenu();
        moreButtonRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [editorMenu, closeEditorMenu]);

  async function createNotebook(name: string) {
    if (!(await saveBeforeLeaving())) return;
    const created = await repository.createNotebook(name);
    setNotebookCollectionOpen(false);
    setView("notes");
    await refreshAfterMutation(created.id);
  }

  async function saveManually() {
    if (manualSavePending.current) return;
    manualSavePending.current = true;
    setManualSaving(true);
    try {
      await editorRef.current?.flushSave();
      setSaveStatus("已保存");
    } catch {
      setSaveStatus("保存失败，请重试");
    } finally {
      manualSavePending.current = false;
      setManualSaving(false);
    }
  }

  return (
    <GlassContext.Provider
      value={{
        enabled: platform === "web" && background === "glass",
        reduced: reducedTransparency,
      }}
    >
      <div
        inert={preparingQuit}
        className={`smoke-app platform-${platform}${webEditing ? " web-editing" : ""}`}
        data-web-background={platform === "web" ? background : undefined}
        data-reduced-transparency={
          platform === "web" ? String(reducedTransparency) : undefined
        }
        style={
          {
            "--background-opacity": backgroundOpacity,
            ...viewportStyle,
          } as CSSProperties
        }
      >
        <div className="noise-layer" />
        {quitError && <p role="alert">{quitError}</p>}
        {platform === "desktop" && desktopBridge && (
          <header className="main-window-titlebar" aria-label="主窗口控制">
            <span className="main-window-drag-handle">烟笺</span>
            <button
              type="button"
              aria-label="最小化主窗口"
              onClick={() => void desktopBridge.minimizeWindow()}
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              aria-label="关闭主窗口"
              onClick={() => void desktopBridge.closeCurrentWindow()}
            >
              <X size={16} />
            </button>
          </header>
        )}
        {!webEditing && platform !== "web" && (
          <button
            type="button"
            className="mobile-menu"
            ref={triggerRef}
            aria-label="打开便签本"
            aria-expanded={mobileNavOpen}
            aria-controls="notebook-sidebar"
            inert={mobile && mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={19} />
          </button>
        )}
        <div
          id="notebook-sidebar"
          ref={panelRef}
          className={`sidebar-shell${mobileNavOpen ? " mobile-open" : ""}`}
          inert={mobile && !mobileNavOpen}
          aria-hidden={mobile && !mobileNavOpen ? true : undefined}
          role={mobile && mobileNavOpen ? "dialog" : undefined}
          aria-modal={mobile && mobileNavOpen ? true : undefined}
          aria-label={mobile && mobileNavOpen ? "便签本导航" : undefined}
        >
          <button
            type="button"
            className="mobile-scrim"
            aria-label="关闭便签本"
            onClick={() => setMobileNavOpen(false)}
          />
          <Sidebar
            web={platform === "web"}
            onClose={platform === "web" && mobile ? closeMobileNav : undefined}
            notebooks={notebooks}
            selectedNotebookId={selectedNotebookId}
            view={view}
            onSelectNotebook={(id) => {
              setNotebookCollectionOpen(false);
              void selectNotebook(id);
            }}
            onShowTodos={() => {
              setNotebookCollectionOpen(false);
              void showTodos();
            }}
            onCreateNotebook={createNotebook}
            onMoveNotebook={async (id, previous, next) => {
              await repository.moveNotebook(id, previous, next);
              await refreshAfterMutation(selectedNotebookId);
            }}
            onRenameNotebook={async (id, name) => {
              await repository.renameNotebook(id, name);
              await refreshAfterMutation(selectedNotebookId);
            }}
            onTrashNotebook={async (id) => {
              if (!(await saveBeforeLeaving())) return;
              const notebook = notebooks.find((item) => item.id === id);
              await repository.trashNotebook(id);
              setLastTrashed({
                entity: "notebook",
                id,
                label: notebook?.name ?? "便签本",
              });
              await refreshAfterMutation(null);
            }}
            onOpenSettings={() => {
              setMobileNavOpen(false);
              setSettingsOpen(true);
            }}
          />
        </div>

        <div
          ref={workspaceRef}
          className={`workspace-shell${platform === "web" && syncStatus ? " has-sync-status" : ""}`}
          inert={mobile && mobileNavOpen}
          onScrollCapture={(event) => {
            if (platform !== "web" || webEditing) return;
            const element = event.target;
            if (
              !(element instanceof HTMLElement) ||
              !element.matches(
                ".notes-board, .notes-board-scroll, .todo-workspace, .web-notebook-collection",
              )
            )
              return;
            const positions =
              browsePositions.current.get(browseKey) ?? new Map();
            positions.set(element.classList[0], element.scrollTop);
            browsePositions.current.set(browseKey, positions);
          }}
        >
          {platform === "web" ? (
            <SyncIndicator status={syncStatus} />
          ) : (
            <div
              className="connection-chip"
              title={online ? "设备在线" : "离线记录中"}
            >
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span>{online ? "已连接" : "离线中"}</span>
            </div>
          )}
          {platform === "web" && notebookCollectionOpen ? (
            <WebNotebookCollection
              notebooks={notebooks}
              expanded={notebookCardsExpanded}
              onExpandedChange={setNotebookCardsExpanded}
              onManage={() => setMobileNavOpen(true)}
              manageRef={triggerRef}
              onSelect={(id) => {
                setNotebookCollectionOpen(false);
                void selectNotebook(id);
              }}
              onCreate={createNotebook}
            />
          ) : view === "todos" ? (
            <TodoWorkspace
              web={platform === "web"}
              filter={platform === "web" ? todoFilter : undefined}
              onFilterChange={platform === "web" ? setTodoFilter : undefined}
              todos={todos}
              onCreate={async (text) => {
                await repository.createTodo(text);
                await refreshAfterMutation(selectedNotebookId);
              }}
              onToggle={async (id) => {
                await repository.toggleTodo(id);
                await refreshAfterMutation(selectedNotebookId);
              }}
              onUpdate={async (id, text) => {
                await repository.updateTodo(id, { text });
                await refreshAfterMutation(selectedNotebookId);
              }}
              onTrash={async (id) => {
                const todo = todos.find((item) => item.id === id);
                await repository.trashTodo(id);
                setLastTrashed({
                  entity: "todo",
                  id,
                  label: todo?.text ?? "待办",
                });
                await refreshAfterMutation(selectedNotebookId);
              }}
              onMove={async (id, previous, next) => {
                await repository.moveTodo(id, previous, next);
                await refreshAfterMutation(selectedNotebookId);
              }}
            />
          ) : selectedNote ? (
            <main
              className={`mobile-note-screen${platform === "desktop" ? " desktop-inline-note" : ""}${compactEditing ? " compact-editing" : ""}`}
            >
              <header className="mobile-note-header">
                <GlassSurface />
                <button
                  type="button"
                  aria-label="返回便签列表"
                  onClick={async () => {
                    if (await saveBeforeLeaving()) setSelectedNoteId(null);
                  }}
                >
                  <ArrowLeft size={18} />
                  返回
                </button>
                <span
                  className="mobile-save-status"
                  role="status"
                  aria-label="保存状态"
                  aria-live="polite"
                >
                  {saveStatus}
                </span>
                {compactEditing && (
                  <button
                    type="button"
                    data-format-toggle
                    aria-label="格式"
                    aria-expanded={editorMenu === "format"}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() =>
                      setEditorMenu(editorMenu === "format" ? null : "format")
                    }
                  >
                    格式
                  </button>
                )}
                <button
                  type="button"
                  className="mobile-save-button"
                  aria-label="保存"
                  disabled={manualSaving || saveStatus === "保存中…"}
                  onClick={() => void saveManually()}
                >
                  {manualSaving ? "保存中…" : "保存"}
                </button>
                <div className="editor-more-control">
                  {(compactEditing || platform === "web") && (
                    <button
                      type="button"
                      ref={moreButtonRef}
                      aria-label="更多操作"
                      aria-haspopup="menu"
                      aria-expanded={editorMenu === "more"}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() =>
                        setEditorMenu(editorMenu === "more" ? null : "more")
                      }
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  )}
                  {((platform !== "web" && !compactEditing) ||
                    editorMenu === "more") && (
                    <div
                      role={
                        compactEditing || platform === "web"
                          ? "menu"
                          : undefined
                      }
                      className={
                        compactEditing || platform === "web"
                          ? "editor-more-menu"
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (
                          !["ArrowDown", "ArrowUp", "Home", "End"].includes(
                            event.key,
                          )
                        )
                          return;
                        event.preventDefault();
                        const items = Array.from(
                          event.currentTarget.querySelectorAll<HTMLButtonElement>(
                            '[role="menuitem"]',
                          ),
                        );
                        const current = items.indexOf(
                          document.activeElement as HTMLButtonElement,
                        );
                        items[
                          event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? items.length - 1
                              : (current +
                                  (event.key === "ArrowUp" ? -1 : 1) +
                                  items.length) %
                                items.length
                        ]?.focus();
                      }}
                    >
                      {platform === "web" && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setEditorMenu("appearance")}
                        >
                          <Palette size={18} />
                          便签外观
                        </button>
                      )}
                      {platform === "web" && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeEditorMenu();
                            setSettingsOpen(true);
                          }}
                        >
                          <Settings2 size={18} />
                          应用设置
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="删除便签"
                        role={
                          compactEditing || platform === "web"
                            ? "menuitem"
                            : undefined
                        }
                        className="destructive-action"
                        disabled={editorDeleting}
                        onClick={async () => {
                          if (editorDeletePending.current) return;
                          editorDeletePending.current = true;
                          setEditorDeleting(true);
                          closeEditorMenu();
                          setEditorActionError("");
                          try {
                            if (!(await saveBeforeLeaving())) return;
                            await repository.trashNote(selectedNote.id);
                            setLastTrashed({
                              entity: "note",
                              id: selectedNote.id,
                              label: selectedNote.title,
                            });
                            setSelectedNoteId(null);
                            await refreshAfterMutation(selectedNotebookId);
                          } catch {
                            setEditorActionError(
                              "删除失败，便签和当前内容已保留，请重试。",
                            );
                          } finally {
                            editorDeletePending.current = false;
                            setEditorDeleting(false);
                          }
                        }}
                      >
                        <Trash2 size={17} />
                        {(compactEditing || platform === "web") && "删除便签"}
                      </button>
                    </div>
                  )}
                </div>
              </header>
              {editorActionError && (
                <p role="alert" className="editor-action-error">
                  {editorActionError}
                </p>
              )}
              <Suspense
                fallback={
                  <div role="status" className="rich-editor-loading">
                    正在打开便签…
                  </div>
                }
              >
                <RichNoteEditor
                  ref={editorRef}
                  compact={compactEditing}
                  progressive={platform === "web"}
                  formatOpen={editorMenu === "format"}
                  onFormatClose={closeEditorMenu}
                  onFormatToggle={() =>
                    setEditorMenu(editorMenu === "format" ? null : "format")
                  }
                  appearanceOpen={editorMenu === "appearance"}
                  onAppearanceClose={closeEditorMenu}
                  note={selectedNote}
                  onSaveStatusChange={setSaveStatus}
                  onSave={async (changes) => {
                    const updated = await repository.updateNote(
                      changes.baseSnapshot?.id ?? selectedNote.id,
                      changes,
                    );
                    invalidateRefresh();
                    setNotes((current) => {
                      const retained = current.filter(
                        (item) =>
                          item.id !== selectedNote.id || item.id === updated.id,
                      );
                      return retained.some((item) => item.id === updated.id)
                        ? retained.map((item) =>
                            item.id === updated.id ? updated : item,
                          )
                        : [...retained, updated];
                    });
                    if (updated.id !== selectedNote.id) {
                      selectedNotebookIdRef.current = updated.notebookId;
                      setSelectedNotebookId(updated.notebookId);
                      setSelectedNoteId(updated.id);
                    }
                    window.dispatchEvent(
                      new CustomEvent("smoke-notes:data-changed"),
                    );
                    return updated;
                  }}
                  className="mobile-rich-editor"
                />
              </Suspense>
            </main>
          ) : (
            <NotesWorkspace
              web={platform === "web"}
              notebook={selectedNotebook}
              notes={notes}
              openOnSingleClick={platform === "web"}
              onOpenNote={(id) => {
                if (platform === "desktop") void desktopBridge?.openNote(id);
                else setSelectedNoteId(id);
              }}
              onCreateNote={async (kind) => {
                if (!selectedNotebookId || creatingRef.current) return;
                creatingRef.current = true;
                try {
                  await editorRef.current?.flushSave();
                  const note = await repository.createNote(selectedNotebookId, {
                    title: "",
                    body: "",
                    kind,
                  });
                  await refreshAfterMutation(selectedNotebookId);
                  setSelectedNoteId(note.id);
                } finally {
                  creatingRef.current = false;
                }
              }}
              onTrashNote={async (id) => {
                const note = notes.find((item) => item.id === id);
                await repository.trashNote(id);
                setLastTrashed({
                  entity: "note",
                  id,
                  label: note?.title ?? "便签",
                });
                await refreshAfterMutation(selectedNotebookId);
              }}
              onMoveNote={async (id, previous, next) => {
                await repository.moveNote(id, previous, next);
                await refreshAfterMutation(selectedNotebookId);
              }}
            />
          )}
        </div>

        <div style={{ display: "contents" }} inert={mobile && mobileNavOpen}>
          {!webEditing && platform === "web" && (
            <nav className="web-dock" aria-label="手机主导航">
              <button
                type="button"
                aria-label="便签"
                aria-current={
                  !notebookCollectionOpen && view === "notes"
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  setNotebookCollectionOpen(false);
                  setView("notes");
                }}
              >
                <NotebookPen size={20} />
                <span>便签</span>
              </button>
              <button
                type="button"
                aria-label="待办"
                aria-current={
                  !notebookCollectionOpen && view === "todos"
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  setNotebookCollectionOpen(false);
                  void showTodos();
                }}
              >
                <CheckCircle2 size={20} />
                <span>待办</span>
              </button>
              <button
                type="button"
                aria-label="浏览便签本"
                aria-current={notebookCollectionOpen ? "page" : undefined}
                onClick={() => setNotebookCollectionOpen(true)}
              >
                <Library size={20} />
                <span>便签本</span>
              </button>
              <button
                type="button"
                aria-label="打开设置"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 size={20} />
                <span>设置</span>
              </button>
            </nav>
          )}
          {!webEditing && platform === "desktop" && (
            <nav
              className="mobile-bottom-nav"
              aria-label="手机主导航"
              inert={mobile && mobileNavOpen}
            >
              <button
                type="button"
                className={view === "notes" ? "active" : ""}
                onClick={() => {
                  setNotebookCollectionOpen(false);
                  setView("notes");
                }}
              >
                <NotebookPen size={19} />
                <span>便签</span>
              </button>
              <button
                type="button"
                className={view === "todos" ? "active" : ""}
                onClick={() => {
                  setNotebookCollectionOpen(false);
                  void showTodos();
                }}
              >
                <CheckCircle2 size={19} />
                <span>待办</span>
              </button>
            </nav>
          )}
        </div>
        {settingsOpen && (
          <SettingsPanel
            bridge={desktopBridge}
            webBackground={platform === "web" ? background : undefined}
            onWebBackgroundChange={changeBackground}
            backgroundNotice={backgroundNotice}
            reduceTransparency={reduceTransparency}
            systemReduced={systemReduced}
            onReduceTransparencyChange={changeReduceTransparency}
            trash={trash}
            onClose={() => setSettingsOpen(false)}
            onOpenPairing={() => {
              setSettingsOpen(false);
              setPairingOpen(true);
            }}
            onBackgroundOpacityChange={setBackgroundOpacity}
            onRestore={async (item) => {
              if (item.entity === "notebook")
                await repository.restore("notebook", item.record.id);
              else if (item.entity === "note")
                await repository.restore("note", item.record.id);
              else await repository.restore("todo", item.record.id);
              await refreshAfterMutation(selectedNotebookId);
            }}
          />
        )}
        {pairingOpen && (
          <PairingDialog
            web={platform === "web"}
            controller={pairingController}
            onClose={() => setPairingOpen(false)}
          />
        )}
        {lastTrashed && (
          <div className="undo-toast" role="status">
            <span>“{lastTrashed.label}”已移至最近删除</span>
            <button
              type="button"
              aria-label="撤销删除"
              onClick={async () => {
                if (lastTrashed.entity === "notebook")
                  await repository.restore("notebook", lastTrashed.id);
                else if (lastTrashed.entity === "note")
                  await repository.restore("note", lastTrashed.id);
                else await repository.restore("todo", lastTrashed.id);
                setLastTrashed(null);
                await refreshAfterMutation(selectedNotebookId);
              }}
            >
              撤销
            </button>
          </div>
        )}
      </div>
    </GlassContext.Provider>
  );
}
