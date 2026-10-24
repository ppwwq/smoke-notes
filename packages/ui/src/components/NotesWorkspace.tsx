import type { Note, Notebook } from "@smoke-notes/core";
import {
  ArrowLeft,
  CheckSquare2,
  ExternalLink,
  FilePlus2,
  Trash2,
} from "../icons";
import { SortableStack } from "./SortableStack";
import { RecordActions } from "./RecordActions";
import { NoteStacks, type NotebookNotes } from "./NoteStacks";
import { NoteFinderToolbar, NoteFinderResults } from "./NoteFinder";

interface NotesWorkspaceProps {
  web?: boolean;
  notebook: Notebook | null;
  notes: Note[];
  groups?: NotebookNotes[];
  expanded?: boolean;
  onExpandNotebook?(id: string): void;
  onCollapse?(): void;
  openOnSingleClick: boolean;
  onOpenNote(id: string, notebookId?: string): void;
  query?: string;
  onQueryChange?(value: string): void;
  syncMessage?: string;
  onCreateRequest(): void;
  onTrashNote(id: string): Promise<void>;
  onMoveNote(
    id: string,
    previous: number | null,
    next: number | null,
  ): Promise<void>;
}

export function NotesWorkspace(props: NotesWorkspaceProps) {
  const collapsed = props.groups !== undefined && !props.expanded;
  const finding = !!props.query?.trim();
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
        <button
          type="button"
          className="planner-empty-add"
          onClick={props.onCreateRequest}
        >
          建立便签本与便签
        </button>
      </main>
    );

  return (
    <main className="notes-board">
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
      </header>
      {collapsed && !finding && (
        <p className="stack-context">
          点开一叠继续记录。分类、重命名与整理在「便签本」。
        </p>
      )}
      {props.web && props.groups && props.onQueryChange && (
        <NoteFinderToolbar
          query={props.query ?? ""}
          onQueryChange={props.onQueryChange}
        />
      )}
      {props.web && !collapsed && !finding && (
        <div className="list-context-bar">
          <span>长按便签任意位置，拖动调整顺序</span>
        </div>
      )}
      <section
        className="notes-board-scroll"
        aria-label={finding ? "查找便签结果" : `${props.notebook.name}便签列表`}
      >
        {finding ? (
          <NoteFinderResults
            groups={props.groups ?? []}
            query={props.query ?? ""}
            onClear={() => props.onQueryChange?.("")}
            onOpen={props.onOpenNote}
          />
        ) : collapsed ? (
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
                onClick={props.onCreateRequest}
              >
                <FilePlus2 size={25} />
                <strong>写下第一张便签</strong>
                <span>自动保存，离线也能继续。</span>
              </button>
            ) : (
              <SortableStack
                wholeCard
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
        {props.web && props.syncMessage && (
          <p className="notes-storage-status">{props.syncMessage}</p>
        )}
      </section>
    </main>
  );
}
