import { useRef, useState } from "react";
import { useActionMenu } from "../useActionMenu";
import type { Note, NoteKind, Notebook } from "@smoke-notes/core";
import {
  ArrowLeft,
  CheckSquare2,
  ExternalLink,
  FilePlus2,
  StickyNote,
  Trash2,
} from "../icons";
import { SortableStack } from "./SortableStack";
import { RecordActions } from "./RecordActions";
import { NoteStacks, type NotebookNotes } from "./NoteStacks";

interface NotesWorkspaceProps {
  web?: boolean;
  notebook: Notebook | null;
  notes: Note[];
  groups?: NotebookNotes[];
  expanded?: boolean;
  onExpandNotebook?(id: string): void;
  onCollapse?(): void;
  openOnSingleClick: boolean;
  onOpenNote(id: string): void;
  onCreateNote(kind: NoteKind): Promise<void>;
  onTrashNote(id: string): Promise<void>;
  onMoveNote(
    id: string,
    previous: number | null,
    next: number | null,
  ): Promise<void>;
}

export function NotesWorkspace(props: NotesWorkspaceProps) {
  const {
    open: createMenuOpen,
    setOpen: setCreateMenuOpen,
    controlRef,
    triggerRef,
    onKeyDown,
  } = useActionMenu();
  const [creating, setCreating] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const pending = useRef(false);
  const collapsed = props.groups !== undefined && !props.expanded;
  async function create(kind: NoteKind) {
    if (pending.current) return;
    pending.current = true;
    setCreating(true);
    setCreateError(null);
    setCreateMenuOpen(false);
    try {
      await props.onCreateNote(kind);
    } catch {
      setCreateError("新建失败，已有内容已保留，请重试。");
    } finally {
      pending.current = false;
      setCreating(false);
    }
  }
  if (!props.notebook)
    return (
      <main className="empty-workspace">
        <span className="empty-orbit">
          <FilePlus2 size={28} />
        </span>
        <p className="eyebrow">NO NOTEBOOK YET</p>
        <h1>先建立一个便签本</h1>
        <p>
          {props.web
            ? "在下方「便签本」中建立一个空间。工作、生活、灵感，都可以各有一处。"
            : "左侧的「＋」是入口。工作、生活、灵感，都可以各有一处安静空间。"}
        </p>
      </main>
    );

  return (
    <main
      className={`notes-board${props.web && arranging ? " arranging" : ""}`}
    >
      <header className="notes-board-header">
        <div>
          {props.expanded && props.onCollapse && (
            <button
              type="button"
              className="collapse-notes"
              onClick={props.onCollapse}
            >
              <ArrowLeft size={16} />
              收起便签
            </button>
          )}
          <h1>{collapsed ? "我的便签" : props.notebook.name}</h1>
          <span>
            {collapsed
              ? `${props.groups!.length} 个便签本 · ${props.groups!.reduce((total, group) => total + group.notes.length, 0)} 张便签`
              : `${props.notes.length} 张便签`}
          </span>
        </div>
        <div
          className="create-note-control"
          ref={controlRef}
          onKeyDown={onKeyDown}
        >
          <button
            type="button"
            className="create-note-button"
            aria-label="新建便签"
            ref={triggerRef}
            disabled={creating}
            aria-haspopup="menu"
            aria-expanded={createMenuOpen}
            onClick={() => setCreateMenuOpen((open) => !open)}
          >
            <FilePlus2 size={17} />
            <span>新建便签</span>
          </button>
          {createMenuOpen && (
            <div className="create-note-menu" role="menu" aria-label="便签类型">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  void create("note");
                }}
              >
                <StickyNote size={15} />
                普通便签
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  void create("todo");
                }}
              >
                <CheckSquare2 size={15} />
                待办便签
              </button>
            </div>
          )}
        </div>
      </header>
      {collapsed && (
        <p className="stack-context">
          按便签本收好，点开一叠继续记录。新建到「{props.notebook.name}」。
        </p>
      )}
      {createError && (
        <p role="alert" className="create-note-error">
          {createError}
        </p>
      )}
      {props.web && !collapsed && (
        <div className="list-context-bar">
          <span>
            {arranging ? "拖动手柄，调整便签顺序" : "你的记录，都在这里"}
          </span>
          <button
            type="button"
            aria-pressed={arranging}
            onClick={() => setArranging(!arranging)}
          >
            {arranging ? "完成整理" : "整理便签"}
          </button>
        </div>
      )}
      <section
        className="notes-board-scroll"
        aria-label={`${props.notebook.name}便签列表`}
      >
        {collapsed ? (
          <NoteStacks
            groups={props.groups!}
            activeNotebookId={props.notebook.id}
            onExpand={(id) => props.onExpandNotebook?.(id)}
          />
        ) : (
          <>
            {props.notes.length === 0 ? (
              <button
                type="button"
                className="blank-note-card"
                disabled={creating}
                onClick={() => void create("note")}
              >
                <FilePlus2 size={25} />
                <strong>写下第一张便签</strong>
                <span>自动保存，离线也能继续。</span>
              </button>
            ) : (
              <SortableStack
                items={props.notes}
                label={(note) => note.title || "无标题便签"}
                onMove={props.onMoveNote}
                className="sticky-card-grid"
                renderItem={(note, index) => {
                  const displayTitle = note.title || "无标题便签";
                  return (
                    <div className="note-card-shell">
                      <article
                        className={`sticky-card note-color-${note.color}`}
                        data-note-id={note.id}
                        style={{
                          viewTransitionName: `note-${note.id}`,
                          viewTransitionClass: `paper paper-depth-${Math.min(index, 3)}`,
                        }}
                      >
                        <button
                          type="button"
                          className="sticky-card-open"
                          aria-label={`打开便签：${displayTitle}`}
                          onClick={() => {
                            if (props.openOnSingleClick)
                              props.onOpenNote(note.id);
                          }}
                          onDoubleClick={() => props.onOpenNote(note.id)}
                        >
                          <span className="sticky-card-accent" />
                          {note.kind === "todo" && (
                            <span
                              className="note-kind-marker"
                              aria-label={`待办便签：${displayTitle}`}
                            >
                              <CheckSquare2 size={13} />
                            </span>
                          )}
                          <strong>{displayTitle}</strong>
                          <p>{note.body || "空白便签"}</p>
                          <time>
                            {new Date(note.updatedAt).toLocaleDateString(
                              "zh-HK",
                              {
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </time>
                          <ExternalLink
                            size={14}
                            className="sticky-open-icon"
                          />
                        </button>
                        {!props.web && (
                          <button
                            type="button"
                            className="sticky-card-delete"
                            aria-label={`删除便签：${displayTitle}`}
                            onClick={() => void props.onTrashNote(note.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </article>
                      {props.web && (
                        <RecordActions
                          name={displayTitle}
                          kind="便签"
                          onTrash={() => props.onTrashNote(note.id)}
                        />
                      )}
                    </div>
                  );
                }}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}
