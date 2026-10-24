import { useRef } from "react";
import { Search, X, ArrowRight } from "lucide-react";
import type { NotebookNotes } from "./NoteStacks";

function findNotes(groups: NotebookNotes[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return groups
    .flatMap(({ notebook, notes }) => notes.map((note) => ({ notebook, note })))
    .filter(({ notebook, note }) => {
      const text =
        `${note.title}\n${note.body}\n${notebook.name}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .sort(
      (a, b) =>
        b.note.updatedAt.localeCompare(a.note.updatedAt) ||
        a.note.id.localeCompare(b.note.id),
    );
}

export function NoteFinderToolbar({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange(value: string): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="note-finder-toolbar">
      <div className="note-search" role="search" aria-label="查找便签">
        <Search size={18} aria-hidden="true" />
        <input
          ref={input}
          type="search"
          aria-label="搜索所有便签"
          placeholder="搜索标题、内容或便签本"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              onQueryChange("");
              event.stopPropagation();
            }
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="清除搜索"
            onClick={() => {
              onQueryChange("");
              input.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

export function NoteFinderResults({
  groups,
  query,
  onClear,
  onOpen,
}: {
  groups: NotebookNotes[];
  query: string;
  onClear(): void;
  onOpen(id: string, notebookId: string): void;
}) {
  const results = findNotes(groups, query);
  return (
    <div className="note-finder-results">
      <p className="note-finder-count" role="status">
        {`找到 ${results.length} 张便签 · 所有便签本`}
      </p>
      {results.length ? (
        <ul className="note-result-list">
          {results.map(({ note, notebook }) => (
            <li key={note.id}>
              <button
                type="button"
                className={`note-result note-color-${note.color}`}
                data-note-id={note.id}
                aria-label={`打开便签：${note.title || "无标题便签"}`}
                onClick={() => onOpen(note.id, notebook.id)}
              >
                <span className="note-result-copy">
                  <strong>{note.title || "无标题便签"}</strong>
                  <span>{note.body || "空白便签"}</span>
                  <small>
                    {notebook.name} ·{" "}
                    {note.kind === "todo" ? "清单便签" : "文字便签"}
                  </small>
                </span>
                <span className="note-result-end">
                  <time dateTime={note.updatedAt}>
                    {new Date(note.updatedAt).toLocaleDateString("zh-CN", {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                  <ArrowRight size={18} aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="note-search-empty">
          <h2>{query.trim() ? "没有找到这张便签" : "还没有记录"}</h2>
          <p>
            {query.trim()
              ? "试试标题中的几个字、正文关键词，或便签本名称。"
              : "从右下方新建，留住第一个想法。"}
          </p>
          {query.trim() && (
            <button type="button" onClick={onClear}>
              清除搜索
            </button>
          )}
        </div>
      )}
    </div>
  );
}
