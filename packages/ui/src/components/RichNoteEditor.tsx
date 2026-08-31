import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
}

export interface RichNoteEditorHandle {
  flushSave(): Promise<void>;
}

function editableTitle(title: string): string {
  return title === "主标题" || title === "无标题" ? "" : title;
}

export const RichNoteEditor = forwardRef<
  RichNoteEditorHandle,
  RichNoteEditorProps
>(function RichNoteEditor({ note, onSave, className = "" }, ref) {
  const [title, setTitle] = useState(() => editableTitle(note.title));
  const [color, setColor] = useState(note.color);
  const [contentJson, setContentJson] = useState<RichTextDocument>(
    note.contentJson,
  );
  const [markMenu, setMarkMenu] = useState<"text" | "highlight" | null>(null);
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
    onUpdate: ({ editor: current }) =>
      setContentJson(current.getJSON() as RichTextDocument),
  });
  const currentEdit = useCallback<() => NoteEdit>(
    () => ({
      title,
      body: richTextToPlainText(contentJson),
      contentJson,
      color,
    }),
    [color, contentJson, title],
  );

  useImperativeHandle(
    ref,
    () => ({
      async flushSave() {
        const changes = currentEdit();
        if (
          changes.title === editableTitle(note.title) &&
          changes.body === note.body &&
          changes.color === note.color &&
          JSON.stringify(changes.contentJson) ===
            JSON.stringify(note.contentJson)
        )
          return;
        await onSave(changes);
      },
    }),
    [currentEdit, note, onSave],
  );

  useEffect(() => {
    setTitle(editableTitle(note.title));
    setColor(note.color);
    setContentJson(note.contentJson);
    if (
      editor &&
      JSON.stringify(editor.getJSON()) !== JSON.stringify(note.contentJson)
    ) {
      editor.commands.setContent(note.contentJson, { emitUpdate: false });
    }
  }, [editor, note.color, note.contentJson, note.id, note.title]);

  useEffect(() => {
    if (!editor) return;
    const body = richTextToPlainText(contentJson);
    if (
      title === editableTitle(note.title) &&
      body === note.body &&
      color === note.color &&
      JSON.stringify(contentJson) === JSON.stringify(note.contentJson)
    )
      return;
    const timer = window.setTimeout(() => {
      void onSave({ title, body, contentJson, color });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [title, color, contentJson, editor, note, onSave]);

  if (!editor) return <div className="rich-editor-loading">正在打开便签…</div>;

  return (
    <section
      className={`rich-note-editor note-color-${color} ${className}`.trim()}
    >
      <div className="note-color-strip" aria-label="便签颜色">
        {NOTE_COLORS.map((item) => (
          <button
            key={item}
            type="button"
            className={`note-color-dot note-color-dot-${item}${color === item ? " active" : ""}`}
            aria-label={`便签颜色：${item}`}
            onClick={() => setColor(item)}
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
        onChange={(event) => setTitle(event.target.value)}
      />
      <EditorContent editor={editor} className="rich-note-body" />
      <footer className="format-toolbar" aria-label="文字格式">
        <button
          type="button"
          aria-label="粗体"
          className={editor.isActive("bold") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={17} />
        </button>
        <button
          type="button"
          aria-label="斜体"
          className={editor.isActive("italic") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={17} />
        </button>
        <button
          type="button"
          aria-label="下划线"
          className={editor.isActive("underline") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={17} />
        </button>
        <button
          type="button"
          aria-label="删除线"
          className={editor.isActive("strike") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={17} />
        </button>
        <button
          type="button"
          aria-label="待办清单"
          className={editor.isActive("taskList") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
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
                    editor.chain().focus().setColor(item).run();
                    setMarkMenu(null);
                  }}
                />
              ))}
              <button
                type="button"
                className="clear-mark"
                aria-label="清除字体颜色"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
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
                    editor.chain().focus().setHighlight({ color: item }).run();
                    setMarkMenu(null);
                  }}
                />
              ))}
              <button
                type="button"
                className="clear-mark"
                aria-label="清除荧光标注"
                onClick={() => {
                  editor.chain().focus().unsetHighlight().run();
                  setMarkMenu(null);
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        <span className="format-status">已自动保存</span>
      </footer>
    </section>
  );
});
