import { GlassSurface } from "./glass/GlassSurface";
import { WebDialog } from "./glass/WebDialog";
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
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import {
  HIGHLIGHT_COLORS,
  RecordValidationError,
  TEXT_LIMITS,
  NOTE_COLORS,
  TEXT_COLORS,
  richTextToPlainText,
  sameValue as sameContent,
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
  Type,
  X,
} from "lucide-react";

export type NoteEdit = Pick<
  Note,
  "title" | "body" | "contentJson" | "color"
> & { baseSnapshot?: Note };

interface RichNoteEditorProps {
  note: Note;
  onSave(changes: NoteEdit): Promise<Note | void> | Note | void;
  className?: string;
  onSaveStatusChange?(status: string): void;
  compact?: boolean;
  formatOpen?: boolean;
  onFormatClose?(): void;
  progressive?: boolean;
  onFormatToggle?(): void;
  appearanceOpen?: boolean;
  onAppearanceClose?(): void;
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

// Replace only the changed range. ProseMirror maps the current selection through
// this transaction; unchanged paragraphs and their DOM stay in place.
function applyRemoteContent(editor: Editor, content: RichTextDocument) {
  const next = editor.schema.nodeFromJSON(content);
  const previous = editor.state.doc;
  const start = previous.content.findDiffStart(next.content);
  if (start === null) return;
  const end = previous.content.findDiffEnd(next.content)!;
  const overlap = start - Math.min(end.a, end.b);
  const endA = end.a + Math.max(0, overlap);
  const endB = end.b + Math.max(0, overlap);
  const scroll: { element: HTMLElement; top: number; left: number }[] = [];
  for (
    let element: HTMLElement | null = editor.view.dom;
    element;
    element = element.parentElement
  ) {
    scroll.push({ element, top: element.scrollTop, left: element.scrollLeft });
  }
  editor.view.dispatch(
    editor.state.tr
      .replace(start, endA, next.slice(start, endB))
      .setMeta("preventUpdate", true)
      .setMeta("addToHistory", false),
  );
  for (const { element, top, left } of scroll) {
    element.scrollTop = top;
    element.scrollLeft = left;
  }
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
  baseSnapshot: Note;
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
    progressive = false,
    onFormatToggle,
    appearanceOpen = false,
    onAppearanceClose,
  },
  ref,
) {
  const [draft, setDraft] = useState(() => noteEdit(note));
  const { title, color } = draft;
  const [saveStatus, setSaveStatus] = useState("已自动保存");
  const [composing, setComposing] = useState(false);
  const composition = useRef<{
    done: Promise<void>;
    finish(): void;
    ending?: object;
  } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      composition.current?.finish();
      composition.current = null;
    };
  }, []);
  useEffect(() => {
    onSaveStatusChange?.(saveStatus);
  }, [saveStatus, onSaveStatusChange]);
  const sessionRef = useRef<EditingSession>({
    noteId: note.id,
    baseSnapshot: note,
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
    shouldRerenderOnTransaction: true,
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
    if (!(compact || progressive) || !formatOpen) return;
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
  }, [compact, progressive, formatOpen, closeFormat, editor]);

  const flushSave = useCallback(async () => {
    const session = sessionRef.current;
    if (composition.current) await composition.current.done;
    if (!mounted.current || sessionRef.current !== session) return;
    if (session.saving) return session.saving;
    if (sameEdit(session.draft, session.persisted)) return;
    setSaveStatus("保存中…");
    // Serialize writes and include any edits made while a save was pending.
    const save = async () => {
      while (
        mounted.current &&
        sessionRef.current === session &&
        !sameEdit(session.draft, session.persisted)
      ) {
        if (composition.current) await composition.current.done;
        if (!mounted.current || sessionRef.current !== session) return;
        const changes = session.draft;
        const saved = await session.onSave({
          ...changes,
          baseSnapshot: session.baseSnapshot,
        });
        if (composition.current) await composition.current.done;
        if (!mounted.current || sessionRef.current !== session) return;
        const accepted = saved ? noteEdit(saved) : changes;
        const latest = session.draft;
        const contentJson = sameContent(latest.contentJson, changes.contentJson)
          ? accepted.contentJson
          : latest.contentJson;
        session.draft = {
          title: latest.title === changes.title ? accepted.title : latest.title,
          color: latest.color === changes.color ? accepted.color : latest.color,
          contentJson,
          body: richTextToPlainText(contentJson),
        };
        const acceptedSnapshot = saved ?? {
          ...session.baseSnapshot,
          ...accepted,
        };
        const recovered = saved && saved.id !== session.noteId;
        // A field edited while this write was pending may still be based on
        // the old document. Do not rebase it onto an unseen remote merge: the
        // next write must be able to preserve both versions as a conflict.
        const pendingContent =
          !recovered &&
          !sameContent(latest.contentJson, changes.contentJson) &&
          !sameContent(latest.contentJson, accepted.contentJson) &&
          !sameContent(changes.contentJson, accepted.contentJson);
        session.baseSnapshot = {
          ...acceptedSnapshot,
          title:
            !recovered &&
            latest.title !== changes.title &&
            latest.title !== accepted.title &&
            changes.title.trim() !== accepted.title
              ? session.baseSnapshot.title
              : acceptedSnapshot.title,
          color:
            !recovered &&
            latest.color !== changes.color &&
            latest.color !== accepted.color &&
            changes.color !== accepted.color
              ? session.baseSnapshot.color
              : acceptedSnapshot.color,
          ...(pendingContent
            ? {
                contentJson: session.baseSnapshot.contentJson,
                body: session.baseSnapshot.body,
              }
            : {}),
        };
        if (recovered) {
          // A recovered copy contains this draft, including its generated
          // title suffix, so continued edits start from the copy's full state.
          session.noteId = saved.id;
          session.incoming = accepted;
        }
        session.persisted = accepted;
        if (sessionRef.current === session) {
          setDraft(session.draft);
          // Apply only content newly merged by storage. Reapplying each React
          // draft during typing can overwrite a newer ProseMirror transaction.
          if (
            editor &&
            sameContent(latest.contentJson, changes.contentJson) &&
            !sameContent(accepted.contentJson, changes.contentJson)
          ) {
            applyRemoteContent(editor, accepted.contentJson);
          }
        }
      }
    };
    session.saving = save();
    try {
      await session.saving;
      if (sessionRef.current === session) setSaveStatus("已自动保存");
    } catch (error) {
      if (sessionRef.current === session)
        setSaveStatus(
          error instanceof RecordValidationError ? error.message : "保存失败",
        );
      throw error;
    } finally {
      session.saving = undefined;
    }
  }, [editor]);

  useImperativeHandle(ref, () => ({ flushSave }), [flushSave]);

  useEffect(() => {
    if (composition.current) return;
    const incoming = noteEdit(note);
    const session = sessionRef.current;
    const changingNote = session.noteId !== note.id;
    session.onSave = onSave;
    let next = incoming;
    if (session.noteId === note.id) {
      // Database refreshes produce fresh objects even when nothing changed.
      if (sameEdit(session.incoming, incoming)) {
        if (note.version >= session.baseSnapshot.version) {
          session.baseSnapshot = {
            ...session.baseSnapshot,
            version: note.version,
            updatedAt: note.updatedAt,
          };
        }
        return;
      }
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
      // Only advance the baseline for fields the user has not changed.
      // Dirty fields still refer to the version actually seen before editing.
      session.baseSnapshot = {
        ...note,
        title:
          next.title === incoming.title
            ? note.title
            : session.baseSnapshot.title,
        color:
          next.color === incoming.color
            ? note.color
            : session.baseSnapshot.color,
        ...(sameContent(next.contentJson, incoming.contentJson)
          ? {}
          : {
              contentJson: session.baseSnapshot.contentJson,
              body: session.baseSnapshot.body,
            }),
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
        baseSnapshot: note,
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
      applyRemoteContent(editor, next.contentJson);
    }
    if (editor && changingNote) {
      // A note switch is a new editing session. Reinitialize plugin state so
      // undo, redo and input rules cannot replay changes from the previous note.
      const state = editor.state;
      editor.view.updateState(
        state
          .reconfigure({ plugins: [] })
          .reconfigure({ plugins: state.plugins }),
      );
    }
  }, [editor, note, onSave, composing]);

  useEffect(() => {
    if (!editor || composing) return;
    const session = sessionRef.current;
    if (sameEdit(session.draft, session.persisted)) return;
    const timer = window.setTimeout(() => {
      // Failed saves retain the draft, and explicit navigation can retry them.
      void flushSave().catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, editor, flushSave, note.id, composing]);

  if (!editor) return <div className="rich-editor-loading">正在打开便签…</div>;

  return (
    <section
      className={`rich-note-editor note-color-${color} ${className}${compact ? " compact-editor" : ""}${progressive ? " progressive-editor" : ""}`.trim()}
      onCompositionStartCapture={() => {
        if (composition.current) {
          // Some IMEs start the next word before the previous end callback
          // runs. Keep the same waiters and invalidate that pending callback.
          composition.current.ending = undefined;
          return;
        }
        let finish!: () => void;
        const done = new Promise<void>((resolve) => {
          finish = resolve;
        });
        composition.current = { done, finish };
        setComposing(true);
      }}
      onCompositionEndCapture={() => {
        const current = composition.current;
        if (!current) return;
        const ending = {};
        current.ending = ending;
        const session = sessionRef.current;
        // The final input/ProseMirror transaction can follow compositionend.
        window.setTimeout(() => {
          if (
            composition.current !== current ||
            current.ending !== ending ||
            !mounted.current
          )
            return;
          if (sessionRef.current === session && !editor.isDestroyed) {
            const contentJson = editor.getJSON() as RichTextDocument;
            updateDraft({
              contentJson,
              body: richTextToPlainText(contentJson),
            });
          }
          composition.current = null;
          setComposing(false);
          current.finish();
        }, 0);
      }}
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
        {!progressive && (
          <div className="note-color-strip" aria-label="便签颜色">
            {NOTE_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className={`note-color-dot note-color-dot-${item}${color === item ? " active" : ""}`}
                aria-label={`便签颜色：${item}`}
                aria-pressed={color === item}
                onClick={() => updateDraft({ color: item })}
              >
                {color === item && <Check size={11} />}
              </button>
            ))}
          </div>
        )}
        <input
          className="rich-note-title"
          aria-label="便签标题"
          maxLength={TEXT_LIMITS.noteTitle}
          value={title}
          placeholder="输入标题"
          onChange={(event) => updateDraft({ title: event.target.value })}
        />
        <EditorContent editor={editor} className="rich-note-body" />
      </div>
      {progressive && !compact && (
        <div className="editor-tool-entry">
          <button
            type="button"
            data-format-toggle
            aria-label="格式"
            aria-expanded={formatOpen}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onFormatToggle}
          >
            <Type size={19} />
            <span>文字格式</span>
          </button>
          <span>自动保存到本机</span>
        </div>
      )}
      <footer
        ref={toolbarRef}
        hidden={(compact || progressive) && !formatOpen}
        role="toolbar"
        className={`format-toolbar${compact || progressive ? " floating-format-toolbar" : ""}`}
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
        <GlassSurface />
        <button
          type="button"
          aria-label="粗体"
          aria-pressed={editor.isActive("bold")}
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
          aria-pressed={editor.isActive("italic")}
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
          aria-pressed={editor.isActive("underline")}
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
          aria-pressed={editor.isActive("strike")}
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
          aria-pressed={editor.isActive("taskList")}
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
            aria-expanded={markMenu === "text"}
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
            aria-expanded={markMenu === "highlight"}
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
      {progressive && appearanceOpen && (
        <WebDialog
          web
          kind="appearance"
          label="便签外观"
          onClose={() => {
            void flushSave()
              .then(onAppearanceClose)
              .catch(() => {});
          }}
        >
          <header>
            <div>
              <p className="eyebrow">NOTE APPEARANCE</p>
              <h2>便签外观</h2>
            </div>
            <button
              type="button"
              aria-label="关闭便签外观"
              onClick={() => {
                void flushSave()
                  .then(onAppearanceClose)
                  .catch(() => {});
              }}
            >
              <X size={20} />
            </button>
          </header>
          <p>给这张便签选一个底色。文字颜色和高亮在「格式」中调整。</p>
          <div className="note-appearance-options" aria-label="便签底色">
            {NOTE_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className={`appearance-option note-color-${item}`}
                aria-label={`便签颜色：${item}`}
                aria-pressed={color === item}
                onClick={() => updateDraft({ color: item })}
              >
                <span className="appearance-swatch">
                  {color === item && <Check size={18} />}
                </span>
                <span>
                  {
                    {
                      amber: "暖沙",
                      rose: "浅玫",
                      sage: "鼠尾草",
                      sky: "晴空",
                      violet: "淡紫",
                      graphite: "雾灰",
                    }[item]
                  }
                </span>
              </button>
            ))}
          </div>
          <div className="appearance-footer">
            <span role="status">{saveStatus}</span>
            <button
              type="button"
              disabled={saveStatus === "保存中…"}
              onClick={() => {
                void flushSave()
                  .then(onAppearanceClose)
                  .catch(() => {});
              }}
            >
              完成
            </button>
          </div>
        </WebDialog>
      )}
    </section>
  );
});
