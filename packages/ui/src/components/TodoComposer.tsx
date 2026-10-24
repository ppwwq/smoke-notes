import { useRef, useState } from "react";
import {
  addTodoDays,
  RecordValidationError,
  TEXT_LIMITS,
  type TodoCreateOptions,
} from "@smoke-notes/core";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { RepeatFields, type RepeatChoice } from "./TodoRepeatFields";
import { PlannerCalendar } from "./PlannerCalendar";

export function TodoComposer({
  today,
  active = true,
  onCreate,
  onShowTodos,
}: {
  today: string;
  active?: boolean;
  onCreate(text: string, options?: TodoCreateOptions): Promise<void>;
  onShowTodos?(): void;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState<RepeatChoice>("once");
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [customDate, setCustomDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const revision = useRef(0);
  const pending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const chosenDate = date || today;
  async function add() {
    if (!text.trim() || pending.current) return;
    if (repeat === "weekly" && !days.length) {
      setError("请至少选择一个星期。");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setFeedback("");
    const savedRevision = revision.current;
    try {
      await onCreate(text, {
        date: chosenDate,
        notes,
        ...(repeat !== "once"
          ? {
              repeat: {
                kind: repeat,
                ...(repeat === "weekly" ? { weekdays: days } : {}),
              },
            }
          : {}),
      });
      if (revision.current === savedRevision) {
        setText("");
        setNotes("");
      }
      setFeedback(
        `已添加到${chosenDate === today ? "今天" : chosenDate === addTodoDays(today, 1) ? "明天" : chosenDate}${repeat === "once" ? "" : "，将按规则重复"}。`,
      );
      // Do not steal focus back if the panel was closed while the write finished.
      if (
        input.current?.getClientRects().length &&
        document.activeElement?.closest(".todo-create-form")
      )
        input.current.focus();
    } catch (error) {
      setError(
        error instanceof RecordValidationError
          ? error.message
          : "添加失败，请重试。输入已保留。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="todo-create-form"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <p className="create-description">按日期安排的一件事，也可以定期重复。</p>
      <input
        ref={input}
        data-create-focus={active ? "" : undefined}
        className="create-task-input"
        aria-label="新待办内容"
        placeholder="有什么想完成的事？"
        maxLength={TEXT_LIMITS.todoText}
        value={text}
        onChange={(event) => {
          revision.current++;
          setText(event.target.value);
          setError("");
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          if (!event.nativeEvent.isComposing && event.keyCode !== 229)
            void add();
        }}
      />
      <div className="create-date-chips" role="group" aria-label="快速安排日期">
        <button
          type="button"
          aria-pressed={chosenDate === today}
          onClick={() => {
            revision.current++;
            setDate("");
            setCustomDate(false);
          }}
        >
          今天
        </button>
        <button
          type="button"
          aria-pressed={chosenDate === addTodoDays(today, 1)}
          onClick={() => {
            revision.current++;
            setDate(addTodoDays(today, 1));
            setCustomDate(false);
          }}
        >
          明天
        </button>
        <button
          type="button"
          aria-expanded={customDate}
          onClick={() => setCustomDate(!customDate)}
        >
          <CalendarDays size={15} />
          {chosenDate !== today && chosenDate !== addTodoDays(today, 1)
            ? chosenDate.slice(5)
            : "选日期"}
        </button>
      </div>
      {customDate && (
        <div className="create-inline-calendar">
          <PlannerCalendar
            label="新待办日期"
            value={chosenDate}
            today={today}
            onChange={(value) => {
              revision.current++;
              setDate(value);
            }}
          />
        </div>
      )}
      <details className="planner-disclosure planner-create-options">
        <summary>
          重复与备注{repeat !== "once" && <span> · 已设重复</span>}
        </summary>
        <div className="planner-fields">
          <RepeatFields
            value={repeat}
            days={days}
            label="新待办重复"
            onChange={(value) => {
              revision.current++;
              setRepeat(value);
            }}
            onDaysChange={(value) => {
              revision.current++;
              setDays(value);
            }}
          />
          <label>
            备注
            <textarea
              aria-label="新待办备注"
              maxLength={4000}
              value={notes}
              placeholder="可选，写下一点提醒"
              onChange={(event) => {
                revision.current++;
                setNotes(event.target.value);
              }}
            />
          </label>
        </div>
      </details>
      {error && (
        <p className="create-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="create-submit"
        type="submit"
        disabled={busy || !text.trim()}
      >
        {busy ? "正在添加…" : "添加"}
        <ArrowUpRight size={18} />
      </button>
      <div className="create-result" role="status" aria-label="新建待办反馈">
        {feedback && (
          <>
            <span>{feedback}</span>
            {onShowTodos && (
              <button type="button" onClick={onShowTodos}>
                查看待办
              </button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
