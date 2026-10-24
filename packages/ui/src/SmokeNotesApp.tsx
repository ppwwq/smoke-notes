import type {
  CalendarEvent,
  PlannerType,
  PlannerPreferences,
} from "@smoke-notes/core";
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
  NoteKind,
  Notebook,
  Todo,
  TrashRecord,
  SyncStatus,
  TodoSettings,
} from "@smoke-notes/core";
import { getTodoDay } from "@smoke-notes/core";
import {
  ArrowLeft,
  ExternalLink,
  Minus,
  MoreHorizontal,
  Settings2,
  Trash2,
  Wifi,
  WifiOff,
  X,
  NoteAppearance as Palette,
} from "./icons";
import { CalendarEventEditor } from "./components/CalendarEventEditor";
import type { PlannerTypeActions } from "./components/PlannerTypeField";
import { WorkspaceCreate } from "./components/WorkspaceCreate";
import { WorkspaceDock } from "./components/WorkspaceDock";
import { Sidebar } from "./components/Sidebar";
import { WebNotebookCollection } from "./components/WebNotebookCollection";
import { NotesWorkspace } from "./components/NotesWorkspace";
import { TodoWorkspace, type TodoFilter } from "./components/TodoWorkspace";
import { SettingsPanel } from "./components/SettingsPanel";
import { PairingDialog } from "./components/PairingDialog";
import type { RichNoteEditorHandle } from "./components/RichNoteEditor";
import { SyncIndicator } from "./components/SyncIndicator";
import { LoadingStatus } from "./components/LoadingStatus";
import { DiamondGrid } from "./components/diamond-grid/DiamondGrid";
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
import { transitionWorkspace } from "./workspace-motion";

interface SmokeNotesAppProps {
  repository: LocalRepository;
  platform: AppPlatform;
  desktopBridge?: DesktopBridge;
  pairingController?: PairingController;
  onRedeemPairing?: (code: string) => Promise<void>;
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
  onRedeemPairing,
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
  } = useWebBackground(true);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notebookNotes, setNotebookNotes] = useState<Record<string, Note[]>>(
    {},
  );
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todoSeries, setTodoSeries] = useState<Todo[]>([]);
  const [todoSettings, setTodoSettings] = useState<TodoSettings>({
    timeZone: "Asia/Hong_Kong",
    dayBoundaryHour: 0,
  });
  const [todoToday, setTodoToday] = useState(() => getTodoDay(new Date(), 0));
  const [planningError, setPlanningError] = useState("");
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
  const lastOpenedNote = useRef<string | null>(null);
  const wasEditing = useRef(false);
  const browsePositions = useRef(new Map<string, Map<string, number>>());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const { mobile, panelRef, triggerRef } = useMobileSidebar(
    mobileNavOpen,
    closeMobileNav,
    true,
  );
  const [pairingOpen, setPairingOpen] = useState(false);
  const [lastTrashed, setLastTrashed] = useState<LastTrashed | null>(null);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const syncMessage = syncStatus
    ? {
        synced: "已同步",
        syncing: "正在同步 · 内容已保存在本机",
        retrying: "待同步 · 内容已保存在本机，稍后重试",
        offline: "离线 · 内容已保存在本机，联网后同步",
        error: "同步失败 · 内容已保存在本机，请检查连接后重试",
      }[syncStatus.phase] +
      (syncStatus.pending ? ` · ${syncStatus.pending} 项待同步` : "")
    : "已保存在本机 · 未启用云端同步";
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.82);
  const [saveStatus, setSaveStatus] = useState("已自动保存");
  const reportEditorSaveStatus = useCallback((next: string) => {
    // The editor's effect can arrive after the explicit save promise resolves.
    // Keep the more specific manual result until a new edit or save starts.
    setSaveStatus((current) =>
      (current === "已保存" && next === "已自动保存") ||
      (current === "保存失败，请重试" && next === "保存失败")
        ? current
        : next,
    );
  }, []);
  const [manualSaving, setManualSaving] = useState(false);
  const manualSavePending = useRef(false);
  const creatingRef = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [plannerPreferences, setPlannerPreferences] =
    useState<PlannerPreferences>();
  const [todoTimes, setTodoTimes] = useState<Record<string, string | null>>({});
  const [plannerTypes, setPlannerTypes] = useState<PlannerType[]>([]);
  const [todoTypeIds, setTodoTypeIds] = useState<Record<string, string | null>>(
    {},
  );
  const [plannerCreateDate, setPlannerCreateDate] = useState<string | null>(
    null,
  );
  const [calendarUndo, setCalendarUndo] = useState<{
    snapshot: CalendarEvent;
    date?: string;
    following?: boolean;
  } | null>(null);
  const [createMode, setCreateMode] = useState<"note" | "todo" | "notebook">(
    "note",
  );
  const [showAllTodosRequest, setShowAllTodosRequest] = useState(0);
  const [calendarCreateDate, setCalendarCreateDate] = useState<string | null>(
    null,
  );
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
      // Materialize missed dates locally before displaying today. This also
      // runs after remote changes; deterministic occurrence IDs make it safe.
      await repository.reconcileTodos();
      const [
        nextNotebooks,
        nextTodos,
        nextTrash,
        nextSeries,
        nextSettings,
        nextEvents,
        nextTypes,
        nextTypeLinks,
        nextPlannerPreferences,
      ] = await Promise.all([
        repository.listNotebooks(),
        repository.listTodos(),
        repository.listTrash(),
        repository.listTodoSeries(),
        repository.getTodoSettings(),
        repository.listCalendarEvents(),
        repository.listPlannerTypes(),
        repository.listTodoTypeLinks(),
        repository.getPlannerPreferences(),
      ]);
      if (revision !== refreshRevision.current) return;
      const requestedId =
        preferredNotebookId === undefined
          ? selectedNotebookIdRef.current
          : preferredNotebookId;
      const targetId = nextNotebooks.some((item) => item.id === requestedId)
        ? requestedId
        : (nextNotebooks[0]?.id ?? null);
      const entries = await Promise.all(
        nextNotebooks.map(
          async (book) =>
            [book.id, await repository.listNotes(book.id)] as const,
        ),
      );
      const nextNotebookNotes = Object.fromEntries(entries);
      const nextNotes = targetId ? (nextNotebookNotes[targetId] ?? []) : [];
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
      setTodoSeries(nextSeries);
      setCalendarEvents(nextEvents);
      setPlannerTypes(nextTypes);
      setPlannerPreferences(nextPlannerPreferences);
      setTodoTimes(
        Object.fromEntries(
          nextTypeLinks
            .filter((link) => link.time !== undefined)
            .map((link) => [link.todoId, link.time!]),
        ),
      );
      setTodoTypeIds(
        Object.fromEntries(
          nextTypeLinks.map((link) => [link.todoId, link.typeId]),
        ),
      );
      setTodoSettings(nextSettings);
      setTodoToday(getTodoDay(new Date(), nextSettings.dayBoundaryHour));
      setPlanningError("");
      setTrash(nextTrash);
      selectedNotebookIdRef.current = targetId;
      setSelectedNotebookId(targetId);
      setNotes(nextNotes);
      setNotebookNotes(nextNotebookNotes);
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
    void refresh().catch(() =>
      setPlanningError("读取记录失败，请重试。已有内容仍保存在本机。"),
    );
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
      void refresh().catch(() =>
        setPlanningError("刷新失败，已有内容已保留，请重试。"),
      );
    };
    window.addEventListener("smoke-notes:data-changed", reload);
    return () => window.removeEventListener("smoke-notes:data-changed", reload);
  }, [refresh]);

  useEffect(() => {
    const refreshDay = (force = false) => {
      if (document.visibilityState === "hidden") return;
      if (
        force ||
        getTodoDay(new Date(), todoSettings.dayBoundaryHour) !== todoToday
      )
        void refresh().catch(() =>
          setPlanningError("换日更新失败，请重试。已有记录已保留。"),
        );
    };
    const wake = () => refreshDay(true);
    const timer = window.setInterval(() => refreshDay(), 30_000);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh, todoSettings.dayBoundaryHour, todoToday]);

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
    setNoteQuery("");
    setView("notes");
    selectedNotebookIdRef.current = id;
    setSelectedNoteId(null);
    setMobileNavOpen(false);
    await refresh(id);
    transitionWorkspace(() => setNotesExpanded(true), true);
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

  const webEditing = view === "notes" && !!selectedNote;
  const browseKey = notebookCollectionOpen
    ? "notebooks"
    : view === "todos"
      ? `todos:${todoFilter}`
      : noteQuery.trim()
        ? `note-find:${noteQuery}`
        : notesExpanded
          ? `notes:${selectedNotebookId}`
          : "note-stacks";
  useLayoutEffect(() => {
    const returningFromEditor = wasEditing.current && !webEditing;
    wasEditing.current = webEditing;
    if (webEditing) return;
    const positions = browsePositions.current.get(browseKey);
    workspaceRef.current
      ?.querySelectorAll<HTMLElement>(
        ".notes-board, .notes-board-scroll, .todo-workspace, .web-notebook-collection",
      )
      .forEach((element) => {
        element.scrollTop = positions?.get(element.classList[0]) ?? 0;
      });
    if (returningFromEditor && lastOpenedNote.current) {
      const card = Array.from(
        workspaceRef.current?.querySelectorAll<HTMLElement>("[data-note-id]") ??
          [],
      ).find((el) => el.dataset.noteId === lastOpenedNote.current);
      card
        ?.closest<HTMLElement>(".note-result, .sticky-card")
        ?.querySelector<HTMLButtonElement>(".sticky-card-open")
        ?.focus({ preventScroll: true });
      if (card?.matches(".note-result")) card.focus({ preventScroll: true });
    }
  }, [browseKey, webEditing, notesExpanded]);
  const { style: viewportStyle, compactEditing } = useWebViewport(
    webEditing || createOpen,
  );
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
    setMobileNavOpen(false);
    setNotesExpanded(true);
  }

  async function createWorkspaceNote(
    kind: NoteKind,
    notebookId: string,
    body = "",
  ) {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      await editorRef.current?.flushSave();
      const note = await repository.createNote(notebookId, {
        title: "",
        body,
        kind,
      });
      await refreshAfterMutation(notebookId);
      setView("notes");
      setNotebookCollectionOpen(false);
      setNotesExpanded(true);
      setNoteQuery("");
      transitionWorkspace(() => setSelectedNoteId(note.id));
    } finally {
      creatingRef.current = false;
    }
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

  const plannerActions: PlannerTypeActions = {
    types: plannerTypes,
    todoTimes,
    preferences: plannerPreferences,
    onSavePreferences: async (preferences) => {
      await repository.savePlannerPreferences(preferences);
      await refreshAfterMutation(selectedNotebookId);
    },
    todoTypeIds,
    onSaveType: async (name, color, id) => {
      const type = await repository.savePlannerType(name, color, id);
      await refreshAfterMutation(selectedNotebookId);
      return type;
    },
    onDeleteType: async (id) => {
      await repository.deletePlannerType(id);
      await refreshAfterMutation(selectedNotebookId);
    },
    onSavePlannerTodo: async (input, todo) => {
      await repository.savePlannerTodo(input, todo);
      await refreshAfterMutation(selectedNotebookId);
    },
    onMovePlannerTodo: async (todo, date, time) => {
      await repository.movePlannerTodo(todo, date, time);
      await refreshAfterMutation(selectedNotebookId);
    },
  };
  return (
    <GlassContext.Provider
      value={{
        enabled: background === "glass",
        reduced: reducedTransparency,
      }}
    >
      <div
        inert={preparingQuit}
        className={`smoke-app workspace-app platform-${platform}${webEditing ? " web-editing" : ""}`}
        data-web-background={background}
        data-reduced-transparency={String(reducedTransparency)}
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
            web
            onClose={closeMobileNav}
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
          className={`workspace-shell${syncStatus ? " has-sync-status" : ""}`}
          inert={mobile && mobileNavOpen}
          onScrollCapture={(event) => {
            if (webEditing) return;
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
          {planningError && (
            <div className="planning-error" role="alert">
              {planningError}
              <button
                type="button"
                onClick={() =>
                  void refresh().catch(() =>
                    setPlanningError("读取记录失败，请重试。"),
                  )
                }
              >
                重试
              </button>
            </div>
          )}
          {platform === "web" ? (
            <SyncIndicator status={syncStatus} />
          ) : (
            <div
              className="connection-chip"
              role="status"
              aria-label="同步状态"
              title={
                syncStatus
                  ? "云同步状态；未同步的修改保留在本地"
                  : online
                    ? "设备网络在线"
                    : "离线记录中"
              }
            >
              {syncStatus?.phase === "syncing" ? (
                <DiamondGrid />
              ) : online ? (
                <Wifi size={13} />
              ) : (
                <WifiOff size={13} />
              )}
              <span>
                {syncStatus
                  ? {
                      syncing: "正在同步",
                      synced: "已同步",
                      retrying: "等待重试",
                      offline: "离线中",
                      error: "同步失败",
                    }[syncStatus.phase]
                  : online
                    ? "网络在线"
                    : "离线中"}
              </span>
            </div>
          )}
          {notebookCollectionOpen ? (
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
              onRename={async (id, name) => {
                await repository.renameNotebook(id, name);
                await refreshAfterMutation(selectedNotebookId);
              }}
              onMove={async (id, previous, next) => {
                await repository.moveNotebook(id, previous, next);
                await refreshAfterMutation(selectedNotebookId);
              }}
              onTrash={async (id) => {
                const book = notebooks.find((item) => item.id === id);
                await repository.trashNotebook(id);
                setLastTrashed({
                  entity: "notebook",
                  id,
                  label: book?.name ?? "便签本",
                });
                await refreshAfterMutation(selectedNotebookId);
              }}
            />
          ) : view === "todos" ? (
            <TodoWorkspace
              {...plannerActions}
              events={calendarEvents}
              onImportPlan={async (text, timeZone) => {
                const result = await repository.importCalendarPlan(
                  text,
                  timeZone,
                );
                await refreshAfterMutation(selectedNotebookId);
                return result;
              }}
              onSaveEvent={async (input, id, occurrenceDate, following) => {
                await repository.saveCalendarEvent(
                  input,
                  id,
                  occurrenceDate,
                  following,
                );
                await refreshAfterMutation(selectedNotebookId);
              }}
              onDeleteEvent={async (id, date, following) => {
                const snapshot = calendarEvents.find(
                  (event) => event.id === id,
                );
                await repository.deleteCalendarEvent(id, date, following);
                if (snapshot) setCalendarUndo({ snapshot, date, following });
                await refreshAfterMutation(selectedNotebookId);
              }}
              canUndoEvent={!!calendarUndo}
              onUndoEvent={async () => {
                if (!calendarUndo) return;
                await repository.restoreCalendarEvent(
                  calendarUndo.snapshot,
                  calendarUndo.date,
                  calendarUndo.following,
                );
                setCalendarUndo(null);
                await refreshAfterMutation(selectedNotebookId);
              }}
              web
              filter={todoFilter}
              onFilterChange={setTodoFilter}
              todos={todos}
              today={todoToday}
              series={todoSeries}
              deletedTodos={trash
                .filter((item) => item.entity === "todo")
                .map((item) => item.record as Todo)}
              onCalendarDateChange={setCalendarCreateDate}
              onPrepareTodo={async (todo) => {
                if (todo.planning?.seriesId && todo.planning.date)
                  await repository.ensureTodoOccurrence(
                    todo.planning.seriesId,
                    todo.planning.date,
                  );
              }}
              syncMessage={syncMessage}
              onCreateRequest={(date) => {
                setCalendarCreateDate(date ?? null);
                setCreateMode("todo");
                setCreateOpen(true);
              }}
              showAllRequest={showAllTodosRequest}
              onSetStatus={async (id, status) => {
                await repository.setTodoStatus(id, status);
                await refreshAfterMutation(selectedNotebookId);
              }}
              onReschedule={async (id, date) => {
                await repository.rescheduleTodo(id, date);
                await refreshAfterMutation(selectedNotebookId);
              }}
              onUpdateRule={async (id, changes) => {
                await repository.updateTodoRule(id, changes);
                await refreshAfterMutation(selectedNotebookId);
              }}
              onPauseSeries={async (id, paused) => {
                await repository.pauseTodoSeries(id, paused);
                await refreshAfterMutation(selectedNotebookId);
              }}
              onStopSeries={async (id) => {
                await repository.stopTodoSeries(id);
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
              style={{ viewTransitionName: `note-${selectedNote.id}` }}
              className={`mobile-note-screen${compactEditing ? " compact-editing" : ""}`}
            >
              <header className="mobile-note-header">
                <GlassSurface />
                <button
                  type="button"
                  aria-label="返回便签列表"
                  onClick={async () => {
                    if (await saveBeforeLeaving())
                      transitionWorkspace(() => setSelectedNoteId(null));
                  }}
                >
                  <ArrowLeft size={18} />
                  返回
                </button>
                {desktopBridge && (
                  <button
                    type="button"
                    className="open-desktop-note"
                    aria-label="在桌面打开便签"
                    onClick={async () => {
                      if (!(await saveBeforeLeaving())) return;
                      try {
                        await desktopBridge.openNote(selectedNote.id);
                      } catch {
                        setEditorActionError("打开失败，内容已保留，请重试。");
                      }
                    }}
                  >
                    <ExternalLink size={17} />
                    <span>桌面便签</span>
                  </button>
                )}
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
                  {
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
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowDown" ||
                          event.key === "ArrowUp"
                        ) {
                          event.preventDefault();
                          setEditorMenu("more");
                        }
                      }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  }
                  {editorMenu === "more" && (
                    <div
                      role="menu"
                      aria-label="便签操作"
                      className="editor-more-menu"
                      onBlur={(event) => {
                        if (
                          !event.currentTarget.parentElement?.contains(
                            event.relatedTarget,
                          )
                        )
                          setEditorMenu((current) =>
                            current === "more" ? null : current,
                          );
                      }}
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
                      {
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setEditorMenu("appearance")}
                        >
                          <Palette size={18} />
                          便签外观
                        </button>
                      }
                      {
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
                      }
                      <button
                        type="button"
                        aria-label="删除便签"
                        role="menuitem"
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
                        删除便签
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
                  <div className="rich-editor-loading">
                    <LoadingStatus label="正在打开便签…" />
                  </div>
                }
              >
                <RichNoteEditor
                  ref={editorRef}
                  compact={compactEditing}
                  progressive
                  formatOpen={editorMenu === "format"}
                  onFormatClose={closeEditorMenu}
                  onFormatToggle={() =>
                    setEditorMenu(editorMenu === "format" ? null : "format")
                  }
                  appearanceOpen={editorMenu === "appearance"}
                  onAppearanceClose={closeEditorMenu}
                  note={selectedNote}
                  onSaveStatusChange={reportEditorSaveStatus}
                  onSave={async (changes) => {
                    const updated = await repository.updateNote(
                      changes.baseSnapshot?.id ?? selectedNote.id,
                      changes,
                    );
                    invalidateRefresh();
                    setNotebookNotes((current) => ({
                      ...current,
                      [updated.notebookId]: [
                        ...(current[updated.notebookId] ?? []).filter(
                          (item) =>
                            item.id !== updated.id &&
                            item.id !== selectedNote.id,
                        ),
                        updated,
                      ].sort((a, b) => a.rank - b.rank),
                    }));
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
              web
              query={noteQuery}
              onQueryChange={setNoteQuery}
              syncMessage={syncMessage}
              notebook={selectedNotebook}
              groups={notebooks.map((notebook) => ({
                notebook,
                notes: notebookNotes[notebook.id] ?? [],
              }))}
              expanded={notesExpanded}
              onExpandNotebook={(id) => {
                void selectNotebook(id);
              }}
              onCollapse={() =>
                transitionWorkspace(() => setNotesExpanded(false), true)
              }
              notes={notes}
              openOnSingleClick
              onOpenNote={(id, notebookId) => {
                lastOpenedNote.current = id;
                transitionWorkspace(() => {
                  if (notebookId && notebookId !== selectedNotebookId) {
                    invalidateRefresh();
                    selectedNotebookIdRef.current = notebookId;
                    setSelectedNotebookId(notebookId);
                    setNotes(notebookNotes[notebookId] ?? []);
                  }
                  setSelectedNoteId(id);
                });
              }}
              onCreateRequest={() => {
                setCreateMode("note");
                setCreateOpen(true);
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
          {!webEditing && (
            <WorkspaceDock
              selected={
                settingsOpen
                  ? 3
                  : notebookCollectionOpen
                    ? 2
                    : view === "todos"
                      ? 1
                      : 0
              }
              onSelect={(index) => {
                if (index === 3) {
                  setSettingsOpen(true);
                  return;
                }
                setNotebookCollectionOpen(index === 2);
                if (index === 0) setView("notes");
                if (index === 1) {
                  setShowAllTodosRequest(0);
                  void showTodos();
                }
              }}
            />
          )}
        </div>
        <WorkspaceCreate
          hidden={webEditing || settingsOpen || pairingOpen || mobileNavOpen}
          open={createOpen}
          onOpenChange={(open) => {
            if (open && view === "todos" && calendarCreateDate)
              setPlannerCreateDate(calendarCreateDate);
            else setCreateOpen(open);
          }}
          triggerLabel={
            view === "todos" && calendarCreateDate ? "新增安排" : undefined
          }
          mode={createMode}
          onModeChange={setCreateMode}
          allowNotebook={notebookCollectionOpen}
          defaultMode={
            notebookCollectionOpen
              ? "notebook"
              : view === "todos"
                ? "todo"
                : "note"
          }
          notebooks={notebooks}
          selectedNotebookId={selectedNotebookId}
          today={todoToday}
          todoDate={
            view === "todos" ? (calendarCreateDate ?? undefined) : undefined
          }
          onCreateNote={createWorkspaceNote}
          onCreateNotebook={async (name) => {
            const book = await repository.createNotebook(name);
            await refreshAfterMutation(book.id);
            return book.id;
          }}
          onCreateTodo={async (text, options) => {
            await repository.createTodo(text, options ?? {});
            await refreshAfterMutation(selectedNotebookId);
          }}
          onShowTodos={() => {
            setNotebookCollectionOpen(false);
            setTodoFilter("all");
            if (!calendarCreateDate || view !== "todos")
              setShowAllTodosRequest((value) => value + 1);
            void showTodos();
          }}
        />
        {plannerCreateDate && (
          <CalendarEventEditor
            {...plannerActions}
            date={plannerCreateDate}
            today={todoToday}
            time="09:00"
            onClose={() => setPlannerCreateDate(null)}
            onSave={async (input) => {
              await repository.saveCalendarEvent(input);
              await refreshAfterMutation(selectedNotebookId);
            }}
          />
        )}
        {settingsOpen && (
          <SettingsPanel
            bridge={desktopBridge}
            webBackground={background}
            onWebBackgroundChange={changeBackground}
            backgroundNotice={backgroundNotice}
            reduceTransparency={reduceTransparency}
            systemReduced={systemReduced}
            onReduceTransparencyChange={changeReduceTransparency}
            todoBoundaryHour={todoSettings.dayBoundaryHour}
            onTodoBoundaryChange={async (hour) => {
              await repository.setTodoDayBoundary(hour);
              await refreshAfterMutation(selectedNotebookId);
            }}
            syncMessage={syncMessage}
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
            web
            controller={pairingController}
            onRedeem={onRedeemPairing}
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
