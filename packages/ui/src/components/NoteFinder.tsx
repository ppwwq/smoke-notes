import { useRef } from "react";
import { Search, X, ArrowRight } from "lucide-react";
import type { NotebookNotes } from "./NoteStacks";

function findNotes(groups: NotebookNotes[], terms: string[]) {
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

function matchedText(text: string, terms: string[], excerpt = false) {
  const lower = text.toLocaleLowerCase();
  const matches = terms
    .map((term) => ({ index: lower.indexOf(term), length: term.length }))
    .filter(({ index }) => index !== -1)
    .sort((a, b) => a.index - b.index || b.length - a.length);
  const start = excerpt ? Math.max(0, (matches[0]?.index ?? 0) - 24) : 0;
  const end = excerpt ? Math.min(text.length, start + 96) : text.length;
  let offset = start;
  return (
    <>
      {start > 0 && "…"}
      {matches.map(({ index, length }) => {
        if (index < offset || index >= end) return null;
        const preceding = text.slice(offset, index);
        offset = Math.min(index + length, end);
        return (
          <span key={index}>
            {preceding}
            <mark>{text.slice(index, offset)}</mark>
          </span>
        );
      })}
      {text.slice(offset, end)}
      {end < text.length && "…"}
    </>
  );
}

export function NoteFinderToolbar({
  query,
  onQueryChange,
  inNotebook = false,
}: {
  query: string;
  onQueryChange(value: string): void;
  inNotebook?: boolean;
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
          placeholder={inNotebook ? "搜索所有便签本" : "搜索标题、内容或便签本"}
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
  const terms = [
    ...new Set(query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)),
  ];
  const results = findNotes(groups, terms);
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
                  <strong>
                    {matchedText(note.title || "无标题便签", terms)}
                  </strong>
                  <span>
                    {matchedText(note.body || "空白便签", terms, true)}
                  </span>
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
