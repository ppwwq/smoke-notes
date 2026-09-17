import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import {
  HIGHLIGHT_COLORS,
  NOTE_COLORS,
  TEXT_COLORS,
  richTextToPlainText,
  type Note,
  type RichTextDocument,
} from "@smoke-notes/core";
import {
  Bold,
  Check,
  Highlighter,
  Italic,
  List,
  Palette,
  Strikethrough,
  Underline as UnderlineIcon,
} from "lucide-react";

export type NoteEdit = Pick<Note, "title" | "body" | "contentJson" | "color">;

interface RichNoteEditorProps {
  note: Note;
  onSave(changes: NoteEdit): Promise<void> | void;
  className?: string;
  onSaveStatusChange?(status: string): void;
  compact?: boolean;
  formatOpen?: boolean;
  onFormatClose?(): void;
}

export interface RichNoteEditorHandle {
  flushSave(): Promise<void>;
}

function editableTitle(title: string): string {
  return title === "主标题" || title === "无标题" ? "" : title;
}

function noteEdit(note: Note): NoteEdit {
  return {
    title: editableTitle(note.title),
    body: note.body,
    contentJson: note.contentJson,
    color: note.color,
  };
}

function sameContent(left: RichTextDocument, right: RichTextDocument) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameEdit(left: NoteEdit, right: NoteEdit) {
  return (
    left.title === right.title &&
    left.body === right.body &&
    left.color === right.color &&
    sameContent(left.contentJson, right.contentJson)
  );
}

interface EditingSession {
  noteId: string;
  incoming: NoteEdit;
  persisted: NoteEdit;
  draft: NoteEdit;
  onSave: RichNoteEditorProps["onSave"];
  saving?: Promise<void>;
}

export const RichNoteEditor = forwardRef<
  RichNoteEditorHandle,
  RichNoteEditorProps
>(function RichNoteEditor(
  {
    note,
    onSave,
    onSaveStatusChange,
    className = "",
    compact = false,
    formatOpen = false,
    onFormatClose,
  },
  ref,
) {
  const [draft, setDraft] = useState(() => noteEdit(note));
  const { title, color } = draft;
  const [saveStatus, setSaveStatus] = useState("已自动保存");
  useEffect(() => {
    onSaveStatusChange?.(saveStatus);
  }, [saveStatus, onSaveStatusChange]);
  const sessionRef = useRef<EditingSession>({
    noteId: note.id,
    incoming: draft,
    persisted: draft,
    draft,
    onSave,
  });
  const [markMenu, setMarkMenu] = useState<"text" | "highlight" | null>(null);
  const updateDraft = useCallback((changes: Partial<NoteEdit>) => {
    const session = sessionRef.current;
    session.draft = { ...session.draft, ...changes };
    setDraft(session.draft);
    setSaveStatus(
      sameEdit(session.draft, session.persisted) ? "已自动保存" : "待保存",
    );
  }, []);
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: "task-list-item" },
      }),
    ],
    content: note.contentJson,
    editorProps: {
      attributes: {
        "aria-label": "便签正文",
        role: "textbox",
        class: "rich-note-content",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: current }) => {
      const contentJson = current.getJSON() as RichTextDocument;
      updateDraft({ contentJson, body: richTextToPlainText(contentJson) });
    },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLElement>(null);
  const scrollPosition = useRef({ body: 0, combined: 0 });
  const previousCompact = useRef(compact);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const body = scroll?.querySelector<HTMLElement>(".rich-note-body");
    if (!scroll || !body || previousCompact.current === compact) return;
    const position = scrollPosition.current;
    if (compact) {
      // Keep the active paragraph in place; the title remains reachable by scrolling up.
      scroll.scrollTop = document.activeElement?.closest(".rich-note-body")
        ? position.body
        : 0;
      position.combined = scroll.scrollTop;
    } else {
      body.scrollTop = position.combined;
      position.body = body.scrollTop;
      scroll.scrollTop = 0;
    }
    previousCompact.current = compact;
  }, [compact]);

  const closeFormat = useCallback(() => {
    setMarkMenu(null);
    onFormatClose?.();
  }, [onFormatClose]);
  useEffect(() => {
    if (!compact || !formatOpen) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !toolbarRef.current?.contains(target) &&
        !target.closest("[data-format-toggle]")
      )
        closeFormat();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeFormat();
      editor?.commands.focus(undefined, { scrollIntoView: !compact });
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [compact, formatOpen, closeFormat, editor]);

  const flushSave = useCallback(async () => {
    const session = sessionRef.current;
    if (session.saving) return session.saving;
    if (sameEdit(session.draft, session.persisted)) return;
    setSaveStatus("保存中…");
    // Serialize writes and include any edits made while a save was pending.
    const save = async () => {
      while (
        sessionRef.current === session &&
        !sameEdit(session.draft, session.persisted)
      ) {
        const changes = session.draft;
        await session.onSave(changes);
        session.persisted = changes;
      }
    };
    session.saving = save();
    try {
      await session.saving;
      if (sessionRef.current === session) setSaveStatus("已自动保存");
    } catch (error) {
      if (sessionRef.current === session) setSaveStatus("保存失败");
      throw error;
    } finally {
      session.saving = undefined;
    }
  }, []);

  useImperativeHandle(ref, () => ({ flushSave }), [flushSave]);

  useEffect(() => {
    const incoming = noteEdit(note);
    const session = sessionRef.current;
    session.onSave = onSave;
    let next = incoming;
    if (session.noteId === note.id) {
      // Database refreshes produce fresh objects even when nothing changed.
      if (sameEdit(session.incoming, incoming)) return;
      // Merge remote changes only into fields the user has not edited locally.
      const contentJson = sameContent(
        session.draft.contentJson,
        session.persisted.contentJson,
      )
        ? incoming.contentJson
        : session.draft.contentJson;
      next = {
        title:
          session.draft.title === session.persisted.title
            ? incoming.title
            : session.draft.title,
        color:
          session.draft.color === session.persisted.color
            ? incoming.color
            : session.draft.color,
        contentJson,
        body: richTextToPlainText(contentJson),
      };
      session.incoming = incoming;
      session.persisted = incoming;
      session.draft = next;
      if (!session.saving) {
        setSaveStatus(sameEdit(next, incoming) ? "已自动保存" : "待保存");
      }
    } else {
      sessionRef.current = {
        noteId: note.id,
        incoming,
        persisted: incoming,
        draft: incoming,
        onSave,
      };
      setMarkMenu(null);
      setSaveStatus("已自动保存");
    }
    setDraft(next);
    if (
      editor &&
      !sameContent(editor.getJSON() as RichTextDocument, next.contentJson)
    ) {
      editor.commands.setContent(next.contentJson, { emitUpdate: false });
    }
  }, [editor, note, onSave]);

  useEffect(() => {
    if (!editor) return;
    const session = sessionRef.current;
    if (sameEdit(session.draft, session.persisted)) return;
    const timer = window.setTimeout(() => {
      // Failed saves retain the draft, and explicit navigation can retry them.
      void flushSave().catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, editor, flushSave, note.id]);

  if (!editor) return <div className="rich-editor-loading">正在打开便签…</div>;

  return (
    <section
      className={`rich-note-editor note-color-${color} ${className}${compact ? " compact-editor" : ""}`.trim()}
    >
      <div
        className="rich-note-scroll"
        ref={scrollRef}
        onScrollCapture={(event) => {
          const target = event.target as HTMLElement;
          if (target === scrollRef.current)
            scrollPosition.current.combined = target.scrollTop;
          else if (target.classList.contains("rich-note-body"))
            scrollPosition.current.body = target.scrollTop;
        }}
      >
        <div className="note-color-strip" aria-label="便签颜色">
          {NOTE_COLORS.map((item) => (
            <button
              key={item}
              type="button"
              className={`note-color-dot note-color-dot-${item}${color === item ? " active" : ""}`}
              aria-label={`便签颜色：${item}`}
              onClick={() => updateDraft({ color: item })}
            >
              {color === item && <Check size={11} />}
            </button>
          ))}
        </div>
        <input
          className="rich-note-title"
          aria-label="便签标题"
          value={title}
          placeholder="输入标题"
          onChange={(event) => updateDraft({ title: event.target.value })}
        />
        <EditorContent editor={editor} className="rich-note-body" />
      </div>
      <footer
        ref={toolbarRef}
        hidden={compact && !formatOpen}
        role="toolbar"
        className={`format-toolbar${compact ? " floating-format-toolbar" : ""}`}
        aria-label="文字格式"
        onClick={(event) => {
          if (!compact) return;
          const target = (event.target as Element).closest("button");
          if (
            target &&
            (target.parentElement === toolbarRef.current ||
              target.closest(".mark-palette"))
          )
            closeFormat();
        }}
        onPointerDown={(event) => {
          if (onSaveStatusChange || compact) event.preventDefault();
        }}
      >
        <button
          type="button"
          aria-label="粗体"
          className={editor.isActive("bold") ? "active" : ""}
          onClick={() =>
            editor
              .chain()
              .focus(undefined, { scrollIntoView: !compact })
              .toggleBold()
              .run()
          }
        >
          <Bold size={17} />
        </button>
        <button
          type="button"
          aria-label="斜体"
          className={editor.isActive("italic") ? "active" : ""}
          onClick={() =>
            editor
              .chain()
              .focus(undefined, { scrollIntoView: !compact })
              .toggleItalic()
              .run()
          }
        >
          <Italic size={17} />
        </button>
        <button
          type="button"
          aria-label="下划线"
          className={editor.isActive("underline") ? "active" : ""}
          onClick={() =>
            editor
              .chain()
              .focus(undefined, { scrollIntoView: !compact })
              .toggleUnderline()
              .run()
          }
        >
          <UnderlineIcon size={17} />
        </button>
        <button
          type="button"
          aria-label="删除线"
          className={editor.isActive("strike") ? "active" : ""}
          onClick={() =>
            editor
              .chain()
              .focus(undefined, { scrollIntoView: !compact })
              .toggleStrike()
              .run()
          }
        >
          <Strikethrough size={17} />
        </button>
        <button
          type="button"
          aria-label="待办清单"
          className={editor.isActive("taskList") ? "active" : ""}
          onClick={() =>
            editor
              .chain()
              .focus(undefined, { scrollIntoView: !compact })
              .toggleTaskList()
              .run()
          }
        >
          <List size={17} />
        </button>
        <span className="format-divider" />
        <div className="mark-control">
          <button
            type="button"
            aria-label="字体颜色"
            className={markMenu === "text" ? "active" : ""}
            onClick={() => setMarkMenu(markMenu === "text" ? null : "text")}
          >
            <Palette size={17} />
          </button>
          {markMenu === "text" && (
            <div className="mark-palette" aria-label="选择字体颜色">
              {TEXT_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`字体色 ${item}`}
                  style={{ "--swatch": item } as CSSProperties}
                  onClick={() => {
                    editor
                      .chain()
                      .focus(undefined, { scrollIntoView: !compact })
                      .setColor(item)
                      .run();
                    setMarkMenu(null);
                  }}
                />
              ))}
              <button
                type="button"
                className="clear-mark"
                aria-label="清除字体颜色"
                onClick={() => {
                  editor
                    .chain()
                    .focus(undefined, { scrollIntoView: !compact })
                    .unsetColor()
                    .run();
                  setMarkMenu(null);
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        <div className="mark-control">
          <button
            type="button"
            aria-label="荧光标注"
            className={markMenu === "highlight" ? "active" : ""}
            onClick={() =>
              setMarkMenu(markMenu === "highlight" ? null : "highlight")
            }
          >
            <Highlighter size={17} />
          </button>
          {markMenu === "highlight" && (
            <div className="mark-palette" aria-label="选择荧光颜色">
              {HIGHLIGHT_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`荧光色 ${item}`}
                  style={{ "--swatch": item } as CSSProperties}
                  onClick={() => {
                    editor
                      .chain()
                      .focus(undefined, { scrollIntoView: !compact })
                      .setHighlight({ color: item })
                      .run();
                    setMarkMenu(null);
                  }}
                />
              ))}
              <button
                type="button"
                className="clear-mark"
                aria-label="清除荧光标注"
                onClick={() => {
                  editor
                    .chain()
                    .focus(undefined, { scrollIntoView: !compact })
                    .unsetHighlight()
                    .run();
                  setMarkMenu(null);
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        <span className="format-status" aria-live="polite">
          {saveStatus}
        </span>
      </footer>
    </section>
  );
});
