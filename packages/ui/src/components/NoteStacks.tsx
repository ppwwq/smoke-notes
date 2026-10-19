import type { CSSProperties } from "react";
import type { Note, Notebook } from "@smoke-notes/core";
import { ArrowUpRight, Plus } from "../icons";

export interface NotebookNotes {
  notebook: Notebook;
  notes: Note[];
}

export function NoteStacks({
  groups,
  activeNotebookId,
  onExpand,
}: {
  groups: NotebookNotes[];
  activeNotebookId: string;
  onExpand(id: string): void;
}) {
  return (
    <div className="note-stacks">
      {groups.map(({ notebook, notes }) => (
        <button
          key={notebook.id}
          type="button"
          className="note-stack"
          aria-label={`展开便签本：${notebook.name}，${notes.length} 张便签`}
          onClick={() => onExpand(notebook.id)}
        >
          <span className="note-stack-papers" aria-hidden="true">
            {(notebook.id === activeNotebookId ? notes : notes.slice(0, 3)).map(
              (note, index) => (
                <span
                  key={note.id}
                  className={`stack-paper note-color-${note.color}`}
                  style={
                    {
                      // Cards beyond the visible cover have a real destination,
                      // underneath it, instead of fading out in their grid cells.
                      "--paper-index": Math.min(index, 3),
                      viewTransitionName: `note-${note.id}`,
                      viewTransitionClass: `paper paper-depth-${Math.min(index, 3)}`,
                      opacity: index > 2 ? 0 : undefined,
                    } as CSSProperties
                  }
                >
                  <strong>{note.title || "无标题便签"}</strong>
                  <span>{note.body || "空白便签"}</span>
                  <small>{note.kind === "todo" ? "待办便签" : "随手记"}</small>
                </span>
              ),
            )}
            {!notes.length && (
              <span
                className="stack-empty"
                style={{ viewTransitionName: `empty-${notebook.id}` }}
              >
                <Plus size={24} />
                <span>写下第一张便签</span>
              </span>
            )}
          </span>
          <span
            className="note-stack-caption"
            style={{ viewTransitionName: `caption-${notebook.id}` }}
          >
            <span>
              <strong>{notebook.name}</strong>
              <small>{notes.length} 张便签 · 点击展开</small>
            </span>
            <ArrowUpRight size={20} />
          </span>
        </button>
      ))}
    </div>
  );
}
