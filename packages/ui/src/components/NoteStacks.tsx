import type { CSSProperties } from "react";
import type { Note, Notebook } from "@smoke-notes/core";
import { ArrowUpRight, Plus } from "../icons";

export interface NotebookNotes {
  notebook: Notebook;
  notes: Note[];
}

export function NoteStacks({
  groups,
  onExpand,
}: {
  groups: NotebookNotes[];
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
            {notes.slice(0, 3).map((note, index) => (
              <span
                key={note.id}
                className={`stack-paper note-color-${note.color}`}
                style={
                  {
                    "--paper-index": index,
                    viewTransitionName: `note-${note.id}`,
                  } as CSSProperties
                }
              >
                <strong>{note.title || "无标题便签"}</strong>
                <span>{note.body || "空白便签"}</span>
                <small>{note.kind === "todo" ? "待办便签" : "随手记"}</small>
              </span>
            ))}
            {!notes.length && (
              <span className="stack-empty">
                <Plus size={24} />
                <span>写下第一张便签</span>
              </span>
            )}
          </span>
          <span className="note-stack-caption">
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
