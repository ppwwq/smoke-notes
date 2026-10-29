import { useRef, useState } from "react";
import { X, Check } from "lucide-react";
import {
  getTodoDate,
  type TodoRepeat,
  plannerTodoValue,
  RecordValidationError,
  type PlannerTodoInput,
  type Todo,
} from "@smoke-notes/core";
import { WebDialog } from "./glass/WebDialog";
import { SegmentedControl } from "./SegmentedControl";
import { PlannerDatePicker } from "./PlannerDatePicker";
import { CalendarTimePicker } from "./CalendarTimePicker";
import { CalendarScheduleDisclosure } from "./CalendarScheduleDisclosure";
import { RepeatFields } from "./TodoRepeatFields";
import { PlannerTypeField, type PlannerTypeActions } from "./PlannerTypeField";

export function CalendarTodoEditor({
  todo,
  date,
  today,
  initialDraft,
  initialTime,
  seriesRepeat,
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
  seriesRepeat?: TodoRepeat;
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
  const [scope, setScope] = useState<"one" | "following">("one");
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
      await actions.onSavePlannerTodo(
        recurring
          ? {
              ...draft,
              scope,
              repeat: scope === "following" ? draft.repeat : undefined,
            }
          : draft,
        todo,
      );
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
      placement={todo ? "center" : "top-end"}
      label={todo ? "编辑待办" : "新建安排"}
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <form
        className={`calendar-event-editor${todo ? "" : " calendar-composer"}`}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <header>
          <h2 className={!todo ? "calendar-composer-heading" : undefined}>
            {todo ? "编辑待办" : "新建安排"}
          </h2>
          <button
            type="button"
            aria-label={todo ? "关闭待办编辑" : "关闭新建安排"}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
          {!todo && (
            <fieldset className="calendar-composer-kind" disabled={busy}>
              {!onSwitchToEvent && <span>新建安排</span>}
              {onSwitchToEvent && (
                <SegmentedControl
                  label="安排类型"
                  value="todo"
                  options={[
                    { value: "event", label: "日程" },
                    { value: "todo", label: "待办" },
                  ]}
                  onChange={(value) => {
                    if (value === "event") onSwitchToEvent();
                  }}
                />
              )}
            </fieldset>
          )}
          {!todo && (
            <button
              className="calendar-composer-save"
              aria-label="保存待办"
              title={busy ? "保存中…" : "保存待办"}
              aria-busy={busy}
              disabled={busy || !draft.text.trim()}
            >
              {busy ? <span>…</span> : <Check size={21} />}
            </button>
          )}
        </header>
        <fieldset disabled={busy}>
          <label className="calendar-composer-title">
            内容
            <input
              autoFocus
              aria-label="待办内容"
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
          {recurring && (
            <>
              <SegmentedControl<"one" | "following">
                label="修改范围"
                value={scope}
                options={[
                  { value: "one", label: "仅此次" },
                  { value: "following", label: "此后全部" },
                ]}
                onChange={setScope}
              />
              <p className="calendar-local-hint">
                {scope === "one"
                  ? "只修改这一天的待办。"
                  : "从这一天起修改内容、备注和重复规则；保留其他日期的单次修改和完成记录。时间与类型请选“仅此次”修改。"}
              </p>
            </>
          )}
          <CalendarScheduleDisclosure
            date={draft.date}
            detail={draft.time ?? "未指定时间"}
          >
            <label>
              {recurring ? "本次日期" : "开始日期"}
              <PlannerDatePicker
                label="待办日期"
                value={draft.date}
                today={today}
                disabled={recurring}
                onChange={(date) => change({ date })}
              />
            </label>
            <fieldset disabled={recurring && scope === "following"}>
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
            </fieldset>
            {(!todo || (recurring && scope === "following")) && (
              <RepeatFields
                allowOnce={!todo}
                label="待办重复"
                value={
                  draft.repeat?.kind ??
                  (recurring ? (seriesRepeat?.kind ?? "daily") : "once")
                }
                days={
                  draft.repeat?.weekdays ??
                  seriesRepeat?.weekdays ?? [1, 2, 3, 4, 5]
                }
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
          </CalendarScheduleDisclosure>
          <fieldset disabled={recurring && scope === "following"}>
            <PlannerTypeField
              {...actions}
              value={draft.typeId}
              onChange={(typeId) => change({ typeId })}
            />
          </fieldset>
          <label>
            备注
            <textarea
              aria-label="待办备注"
              rows={3}
              maxLength={10000}
              value={draft.notes}
              onChange={(e) => change({ notes: e.target.value })}
            />
          </label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {todo && (
          <footer>
            <button
              className="planner-save"
              disabled={busy || !draft.text.trim()}
            >
              {busy ? "保存中…" : "保存待办"}
            </button>
          </footer>
        )}
      </form>
    </WebDialog>
  );
}
