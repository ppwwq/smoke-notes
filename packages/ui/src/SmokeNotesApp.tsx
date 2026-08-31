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
  Notebook,
  Todo,
  TrashRecord,
} from "@smoke-notes/core";
import {
  ArrowLeft,
  CheckCircle2,
  Menu,
  Minus,
  NotebookPen,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { NotesWorkspace } from "./components/NotesWorkspace";
import { TodoWorkspace } from "./components/TodoWorkspace";
import { SettingsPanel } from "./components/SettingsPanel";
import { PairingDialog } from "./components/PairingDialog";
import { RichNoteEditor } from "./components/RichNoteEditor";
import type { AppPlatform, DesktopBridge, PairingController } from "./types";
import "./styles.css";

interface SmokeNotesAppProps {
  repository: LocalRepository;
  platform: AppPlatform;
  desktopBridge?: DesktopBridge;
  pairingController?: PairingController;
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
}: SmokeNotesAppProps) {
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [lastTrashed, setLastTrashed] = useState<LastTrashed | null>(null);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [backgroundOpacity, setBackgroundOpacity] = useState(0.82);

  const refresh = useCallback(
    async (preferredNotebookId?: string | null) => {
      const [nextNotebooks, nextTodos, nextTrash] = await Promise.all([
        repository.listNotebooks(),
        repository.listTodos(),
        repository.listTrash(),
      ]);
      setNotebooks(nextNotebooks);
      setTodos(nextTodos);
      setTrash(nextTrash);
      const requestedId =
        preferredNotebookId === undefined
          ? selectedNotebookIdRef.current
          : preferredNotebookId;
      const targetId = nextNotebooks.some((item) => item.id === requestedId)
        ? requestedId
        : (nextNotebooks[0]?.id ?? null);
      selectedNotebookIdRef.current = targetId;
      setSelectedNotebookId(targetId);
      const nextNotes = targetId ? await repository.listNotes(targetId) : [];
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
  }, [refresh]);

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

  async function selectNotebook(id: string) {
    setView("notes");
    selectedNotebookIdRef.current = id;
    setSelectedNotebookId(id);
    const nextNotes = await repository.listNotes(id);
    setNotes(nextNotes);
    setSelectedNoteId(null);
    setMobileNavOpen(false);
  }

  const selectedNotebook =
    notebooks.find((item) => item.id === selectedNotebookId) ?? null;
  const selectedNote = selectedNoteId
    ? (notes.find((item) => item.id === selectedNoteId) ?? null)
    : null;

  return (
    <div
      className={`smoke-app platform-${platform}`}
      style={{ "--background-opacity": backgroundOpacity } as CSSProperties}
    >
      <div className="noise-layer" />
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
      <button
        type="button"
        className="mobile-menu"
        aria-label="打开便签本"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu size={19} />
      </button>
      <div className={`sidebar-shell${mobileNavOpen ? " mobile-open" : ""}`}>
        <button
          type="button"
          className="mobile-scrim"
          aria-label="关闭便签本"
          onClick={() => setMobileNavOpen(false)}
        />
        <Sidebar
          notebooks={notebooks}
          selectedNotebookId={selectedNotebookId}
          view={view}
          onSelectNotebook={(id) => void selectNotebook(id)}
          onShowTodos={() => {
            setView("todos");
            setMobileNavOpen(false);
          }}
          onCreateNotebook={async (name) => {
            const created = await repository.createNotebook(name);
            setView("notes");
            await refreshAfterMutation(created.id);
          }}
          onMoveNotebook={async (id, previous, next) => {
            await repository.moveNotebook(id, previous, next);
            await refreshAfterMutation(selectedNotebookId);
          }}
          onRenameNotebook={async (id, name) => {
            await repository.renameNotebook(id, name);
            await refreshAfterMutation(selectedNotebookId);
          }}
          onTrashNotebook={async (id) => {
            const notebook = notebooks.find((item) => item.id === id);
            await repository.trashNotebook(id);
            setLastTrashed({
              entity: "notebook",
              id,
              label: notebook?.name ?? "便签本",
            });
            await refreshAfterMutation(null);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

      <div className="workspace-shell">
        <div
          className="connection-chip"
          title={online ? "设备在线" : "离线记录中"}
        >
          {online ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span>{online ? "已连接" : "离线中"}</span>
        </div>
        {view === "todos" ? (
          <TodoWorkspace
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
        ) : platform === "web" && selectedNote ? (
          <main className="mobile-note-screen">
            <header className="mobile-note-header">
              <button
                type="button"
                aria-label="返回便签列表"
                onClick={() => setSelectedNoteId(null)}
              >
                <ArrowLeft size={18} />
              </button>
              <span>手机便签</span>
              <button
                type="button"
                aria-label="删除便签"
                onClick={async () => {
                  await repository.trashNote(selectedNote.id);
                  setLastTrashed({
                    entity: "note",
                    id: selectedNote.id,
                    label: selectedNote.title,
                  });
                  setSelectedNoteId(null);
                  await refreshAfterMutation(selectedNotebookId);
                }}
              >
                <Trash2 size={17} />
              </button>
            </header>
            <RichNoteEditor
              note={selectedNote}
              onSave={async (changes) => {
                const updated = await repository.updateNote(
                  selectedNote.id,
                  changes,
                );
                setNotes((current) =>
                  current.map((item) =>
                    item.id === updated.id ? updated : item,
                  ),
                );
                window.dispatchEvent(
                  new CustomEvent("smoke-notes:data-changed"),
                );
              }}
              className="mobile-rich-editor"
            />
          </main>
        ) : (
          <NotesWorkspace
            notebook={selectedNotebook}
            notes={notes}
            openOnSingleClick={platform === "web"}
            onOpenNote={(id) => {
              if (platform === "desktop") void desktopBridge?.openNote(id);
              else setSelectedNoteId(id);
            }}
            onCreateNote={async (kind) => {
              if (!selectedNotebookId) return;
              const note = await repository.createNote(selectedNotebookId, {
                title: "",
                body: "",
                kind,
              });
              await refreshAfterMutation(selectedNotebookId);
              if (platform === "desktop")
                await desktopBridge?.openNote(note.id);
              else setSelectedNoteId(note.id);
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

      <nav className="mobile-bottom-nav" aria-label="手机主导航">
        <button
          type="button"
          className={view === "notes" ? "active" : ""}
          onClick={() => setView("notes")}
        >
          <NotebookPen size={19} />
          <span>便签</span>
        </button>
        <button
          type="button"
          className={view === "todos" ? "active" : ""}
          onClick={() => setView("todos")}
        >
          <CheckCircle2 size={19} />
          <span>待办</span>
        </button>
      </nav>

      {settingsOpen && (
        <SettingsPanel
          bridge={desktopBridge}
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
  );
}
