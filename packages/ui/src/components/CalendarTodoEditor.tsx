import { useRef, useState } from "react";
import { X } from "lucide-react";
import {
  getTodoDate,
  plannerTodoValue,
  RecordValidationError,
  type PlannerTodoInput,
  type Todo,
} from "@smoke-notes/core";
import { WebDialog } from "./glass/WebDialog";
import { SegmentedControl } from "./SegmentedControl";
import { PlannerDatePicker } from "./PlannerDatePicker";
import { CalendarTimePicker } from "./CalendarTimePicker";
import { RepeatFields } from "./TodoRepeatFields";
import { PlannerTypeField, type PlannerTypeActions } from "./PlannerTypeField";

export function CalendarTodoEditor({
  todo,
  date,
  today,
  initialDraft,
  initialTime,
  onDraftChange,
  onSwitchToEvent,
  onClose,
  ...actions
}: PlannerTypeActions & {
  todo?: Todo;
  date: string;
  today: string;
  initialDraft?: PlannerTodoInput;
  initialTime?: string;
  onDraftChange?(draft: PlannerTodoInput): void;
  onSwitchToEvent?(): void;
  onClose(): void;
}) {
  const [draft, setDraft] = useState<PlannerTodoInput>(
    () =>
      initialDraft ?? {
        text: todo?.text ?? "",
        date: todo ? getTodoDate(todo) : date,
        notes: todo?.planning?.notes ?? "",
        time: todo
          ? (plannerTodoValue(actions.todoTimes, todo) ?? null)
          : (initialTime ?? null),
        repeat: todo ? undefined : { kind: "daily" },
        typeId: todo
          ? Object.hasOwn(actions.todoTypeIds ?? {}, todo.id)
            ? actions.todoTypeIds?.[todo.id]
            : actions.todoTypeIds?.[todo.planning?.seriesId ?? ""]
          : (actions.preferences?.defaultTypeId ?? null),
      },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  function change(patch: Partial<PlannerTodoInput>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    onDraftChange?.(next);
  }
  async function save() {
    if (pending.current || !actions.onSavePlannerTodo) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await actions.onSavePlannerTodo(draft, todo);
      onClose();
    } catch (e) {
      setError(
        e instanceof RecordValidationError
          ? e.message
          : "保存失败，输入已保留，请重试。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const recurring = todo?.planning?.kind === "occurrence";
  return (
    <WebDialog
      web
      kind="actions"
      label={todo ? "编辑每日待办" : "新增每日待办"}
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <form
        className="calendar-event-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <header>
          <h2>{todo ? "编辑待办" : "新增安排"}</h2>
          <button
            type="button"
            aria-label="关闭待办编辑"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <fieldset disabled={busy}>
          {onSwitchToEvent && (
            <SegmentedControl
              label="新增安排类型"
              value="todo"
              options={[
                { value: "event", label: "行程" },
                { value: "todo", label: "每日待办" },
              ]}
              onChange={(value) => {
                if (value === "event") onSwitchToEvent();
              }}
            />
          )}
          <label>
            内容
            <input
              autoFocus
              aria-label="每日待办内容"
              value={draft.text}
              maxLength={500}
              placeholder="今天想完成什么？"
              onChange={(e) => change({ text: e.target.value })}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.nativeEvent.isComposing || e.keyCode === 229)
                )
                  e.preventDefault();
              }}
            />
          </label>
          <label>
            {recurring ? "本次日期" : "开始日期"}
            <PlannerDatePicker
              label="每日待办日期"
              value={draft.date}
              today={today}
              disabled={recurring}
              onChange={(date) => change({ date })}
            />
          </label>
          <label className="calendar-toggle">
            <input
              type="checkbox"
              checked={!!draft.time}
              onChange={(e) =>
                change({ time: e.target.checked ? "09:00" : null })
              }
            />
            指定待办时间
          </label>
          {draft.time && (
            <CalendarTimePicker
              label="待办时间"
              value={draft.time}
              onChange={(time) => change({ time })}
            />
          )}
          {!todo && (
            <RepeatFields
              label="每日待办重复"
              value={draft.repeat?.kind ?? "once"}
              days={draft.repeat?.weekdays ?? [1, 2, 3, 4, 5]}
              onChange={(kind) =>
                change({
                  repeat:
                    kind === "once"
                      ? undefined
                      : {
                          kind,
                          ...(kind === "weekly"
                            ? { weekdays: [1, 2, 3, 4, 5] }
                            : {}),
                        },
                })
              }
              onDaysChange={(weekdays) =>
                change({ repeat: { kind: "weekly", weekdays } })
              }
            />
          )}
          {recurring && (
            <p className="calendar-local-hint">
              修改仅影响这一次。其他日期继续按原规则重复。
            </p>
          )}
          <PlannerTypeField
            {...actions}
            value={draft.typeId}
            onChange={(typeId) => change({ typeId })}
          />
          <label>
            备注
            <textarea
              aria-label="每日待办备注"
              rows={3}
              maxLength={10000}
              value={draft.notes}
              onChange={(e) => change({ notes: e.target.value })}
            />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button
            className="planner-save"
            disabled={busy || !draft.text.trim()}
          >
            {busy ? "保存中…" : "保存待办"}
          </button>
        </footer>
      </form>
    </WebDialog>
  );
}
