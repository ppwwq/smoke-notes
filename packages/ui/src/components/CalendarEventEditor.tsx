import { calendarColorOptions } from "./calendar-colors";
import { useRef, useState } from "react";
import { X, Trash2, Copy } from "lucide-react";
import {
  addTodoDays,
  calendarMinute,
  calendarStamp,
  RecordValidationError,
  type CalendarEventInput,
  type CalendarOccurrence,
  type CalendarEvent,
  type PlannerTodoInput,
} from "@smoke-notes/core";
import { WebDialog } from "./glass/WebDialog";
import { WorkspaceSelect } from "./WorkspaceSelect";
import { PlannerDatePicker } from "./PlannerDatePicker";
import { CalendarTimePicker } from "./CalendarTimePicker";
import { CalendarRepeatFields } from "./CalendarRepeatFields";
import { PlannerTypeField, type PlannerTypeActions } from "./PlannerTypeField";
import { CalendarTodoEditor } from "./CalendarTodoEditor";
import { SegmentedControl } from "./SegmentedControl";
export function CalendarEventEditor({
  date,
  time,
  occurrence,
  source,
  today,
  onClose,
  onSave,
  onDelete,
  types,
  todoTypeIds,
  todoTimes,
  preferences,
  onSaveType,
  onDeleteType,
  onSavePlannerTodo,
  initialKind = "event",
  initialInput,
}: PlannerTypeActions & {
  initialKind?: "event" | "todo";
  initialInput?: CalendarEventInput;
  date: string;
  time?: string;
  occurrence?: CalendarOccurrence;
  source?: CalendarEvent;
  today: string;
  onClose(): void;
  onSave(
    input: CalendarEventInput,
    id?: string,
    occurrenceDate?: string,
    following?: boolean,
  ): Promise<void>;
  onDelete?(
    id: string,
    occurrenceDate?: string,
    following?: boolean,
  ): Promise<void>;
}) {
  const initial = initialInput ??
    occurrence?.source ??
    occurrence ?? {
      title: "",
      start: `${date}T${time ?? "09:00"}`,
      end: `${date}T${time ? calendarStamp(calendarMinute(`${date}T${time}`) + (preferences?.defaultDuration ?? 60)).slice(11) : "10:00"}`,
      allDay: !time,
      location: "",
      notes: "",
      url: "",
      color: "purple" as const,
      typeId: preferences?.defaultTypeId ?? null,
      timeZone: preferences?.timeZone ?? "Asia/Hong_Kong",
    };
  const [fields, setFields] = useState<CalendarEventInput>({
    ...initial,
    start:
      !initialInput && !occurrence && !time ? `${date}T00:00` : initial.start,
    end:
      !initialInput && !occurrence && !time
        ? `${addTodoDays(date, 1)}T00:00`
        : time && !initialInput && !occurrence
          ? calendarStamp(
              calendarMinute(`${date}T${time}`) +
                (preferences?.defaultDuration ?? 60),
            )
          : initial.end,
  });
  const [entryKind, setEntryKind] = useState(initialKind);
  const [todoDraft, setTodoDraft] = useState<PlannerTodoInput>();
  const typeActions = {
    types,
    todoTypeIds,
    todoTimes,
    preferences,
    onSaveType,
    onDeleteType,
    onSavePlannerTodo,
  };
  const [scope, setScope] = useState<"one" | "following" | "all">("one");
  const [copy, setCopy] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  const [editing, setEditing] = useState(!occurrence);
  function change(patch: Partial<CalendarEventInput>) {
    setFields((current) => ({ ...current, ...patch }));
  }
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      onClose();
    } catch (e) {
      setError(
        e instanceof RecordValidationError
          ? e.message
          : "保存失败，修改已保留，请重试。",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const occurrenceDate =
    occurrence?.recurring && scope !== "all" && !copy
      ? occurrence.occurrenceDate
      : undefined;
  const endDate = fields.allDay
    ? addTodoDays(fields.end.slice(0, 10), -1)
    : fields.end.slice(0, 10);
  if (!occurrence && entryKind === "todo")
    return (
      <CalendarTodoEditor
        {...typeActions}
        date={date}
        today={today}
        initialDraft={todoDraft}
        initialTime={time}
        onDraftChange={setTodoDraft}
        onSwitchToEvent={() => setEntryKind("event")}
        onClose={onClose}
      />
    );
  return (
    <WebDialog
      web
      kind="actions"
      label={occurrence && !copy ? "日程详情" : "新建日程"}
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      {!editing && occurrence ? (
        <article className="calendar-event-details">
          <header>
            <button type="button" onClick={onClose}>
              完成
            </button>
            <button type="button" onClick={() => setEditing(true)}>
              编辑日程
            </button>
          </header>
          <h2>{occurrence.title}</h2>
          {types?.find((t) => t.id === occurrence.typeId) && (
            <span
              className={`planner-type-badge event-${types.find((t) => t.id === occurrence.typeId)!.color}`}
            >
              {types.find((t) => t.id === occurrence.typeId)!.name}
            </span>
          )}
          <p className="calendar-detail-time">
            {occurrence.allDay
              ? `${occurrence.start.slice(0, 10)}${addTodoDays(occurrence.end.slice(0, 10), -1) !== occurrence.start.slice(0, 10) ? ` 至 ${addTodoDays(occurrence.end.slice(0, 10), -1)}` : ""} · 全天`
              : `${occurrence.start.replace("T", " ")} 至 ${occurrence.start.slice(0, 10) === occurrence.end.slice(0, 10) ? occurrence.end.slice(11) : occurrence.end.replace("T", " ")}`}
          </p>
          {!occurrence.allDay && (
            <p className="calendar-local-hint">
              显示时区：{occurrence.timeZone ?? "Asia/Hong_Kong"}
              {occurrence.source?.timeZone &&
              occurrence.source.timeZone !== occurrence.timeZone
                ? ` · 原时区：${occurrence.source.timeZone}`
                : ""}
            </p>
          )}
          {occurrence.location && (
            <div>
              <small>地点</small>
              <p>{occurrence.location}</p>
            </div>
          )}
          {occurrence.recurring && (
            <div>
              <small>重复</small>
              <p>
                每 {source?.repeat?.interval ?? 1}{" "}
                {
                  { daily: "天", weekly: "周", monthly: "个月", yearly: "年" }[
                    source?.repeat?.frequency ?? "daily"
                  ]
                }
                {source?.repeat?.until
                  ? ` · 至 ${source.repeat.until}`
                  : source?.repeat?.count
                    ? ` · 共 ${source.repeat.count} 次`
                    : ""}
              </p>
            </div>
          )}
          {occurrence.url && /^https?:\/\//i.test(occurrence.url) && (
            <div>
              <small>链接</small>
              <p>
                <a href={occurrence.url} target="_blank" rel="noreferrer">
                  {occurrence.url}
                </a>
              </p>
            </div>
          )}
          {occurrence.notes && (
            <div>
              <small>备注</small>
              <p className="calendar-detail-notes">{occurrence.notes}</p>
            </div>
          )}
          <footer>
            <button
              type="button"
              onClick={() => {
                setCopy(true);
                setScope("all");
                setEditing(true);
                change({ repeat: undefined });
              }}
            >
              <Copy size={16} />
              复制日程
            </button>
          </footer>
        </article>
      ) : (
        <form
          className="calendar-event-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              onSave(
                fields,
                copy ? undefined : occurrence?.eventId,
                occurrenceDate,
                scope === "following",
              ),
            );
          }}
        >
          <header>
            <h2>{occurrence && !copy ? "日程详情" : "新建日程"}</h2>
            <button
              type="button"
              aria-label="关闭日程详情"
              disabled={busy}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </header>
          <fieldset disabled={busy}>
            {!occurrence && onSavePlannerTodo && (
              <SegmentedControl
                label="新增安排类型"
                value="event"
                options={[
                  { value: "event", label: "行程" },
                  { value: "todo", label: "每日待办" },
                ]}
                onChange={(value) => setEntryKind(value as "event" | "todo")}
              />
            )}
            <PlannerTypeField
              {...typeActions}
              value={fields.typeId}
              onChange={(typeId) =>
                change({
                  typeId,
                  color:
                    types?.find((t) => t.id === typeId)?.color ?? fields.color,
                })
              }
            />
            <label>
              标题
              <input
                autoFocus
                aria-label="日程标题"
                value={fields.title}
                maxLength={240}
                placeholder="添加标题"
                onChange={(e) => change({ title: e.target.value })}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.nativeEvent.isComposing || e.keyCode === 229)
                  )
                    e.preventDefault();
                }}
              />
            </label>
            {occurrence?.recurring && !copy && (
              <label>
                修改范围
                <WorkspaceSelect
                  label="日程修改范围"
                  value={scope}
                  options={[
                    { value: "one", label: "仅此日程" },
                    { value: "following", label: "此日程及以后" },
                    { value: "all", label: "整个重复系列" },
                  ]}
                  onChange={(next) => {
                    setScope(next);
                    if (next === "all" && source) setFields({ ...source });
                    else
                      setFields({
                        ...(occurrence.source ?? occurrence),
                        repeat: source?.repeat,
                      });
                  }}
                />
              </label>
            )}
            <label className="calendar-toggle">
              全天
              <input
                type="checkbox"
                aria-label="全天日程"
                checked={fields.allDay}
                onChange={(e) => {
                  const allDay = e.target.checked;
                  change({
                    allDay,
                    start:
                      fields.start.slice(0, 10) +
                      (allDay ? "T00:00" : "T09:00"),
                    end: allDay
                      ? `${addTodoDays(fields.end.slice(0, 10), fields.end.endsWith("T00:00") ? 0 : 1)}T00:00`
                      : `${endDate}T10:00`,
                  });
                }}
              />
            </label>
            <div className="calendar-form-dates">
              <label>
                开始
                <PlannerDatePicker
                  label="日程开始日期"
                  today={today}
                  value={fields.start.slice(0, 10)}
                  onChange={(next) => {
                    const start = next + fields.start.slice(10),
                      duration =
                        calendarMinute(fields.end) -
                        calendarMinute(fields.start);
                    change({
                      start,
                      end: calendarStamp(calendarMinute(start) + duration),
                    });
                  }}
                />
                {!fields.allDay && (
                  <CalendarTimePicker
                    label="日程开始时间"
                    value={fields.start.slice(11)}
                    onChange={(time) => {
                      const start = fields.start.slice(0, 11) + time;
                      change({
                        start,
                        end: calendarStamp(
                          calendarMinute(start) +
                            calendarMinute(fields.end) -
                            calendarMinute(fields.start),
                        ),
                      });
                    }}
                  />
                )}
              </label>
              <label>
                结束
                <PlannerDatePicker
                  label="日程结束日期"
                  today={today}
                  value={endDate}
                  onChange={(next) =>
                    change({
                      end:
                        (fields.allDay ? addTodoDays(next, 1) : next) +
                        fields.end.slice(10),
                    })
                  }
                />
                {!fields.allDay && (
                  <CalendarTimePicker
                    label="日程结束时间"
                    value={fields.end.slice(11)}
                    onChange={(time) =>
                      change({ end: fields.end.slice(0, 11) + time })
                    }
                  />
                )}
              </label>
            </div>
            <p className="calendar-local-hint">
              {fields.allDay
                ? "全天安排"
                : occurrence
                  ? `时间按原日程时区 ${fields.timeZone ?? "Asia/Hong_Kong"}`
                  : "时间按日历设置"}{" "}
              · 保存在本机
            </p>
            <label>
              重复
              <WorkspaceSelect
                label="日程重复"
                disabled={!!occurrenceDate && scope === "one"}
                value={
                  (occurrenceDate && scope === "one"
                    ? source?.repeat?.frequency
                    : fields.repeat?.frequency) ?? "none"
                }
                options={[
                  { value: "none", label: "从不" },
                  { value: "daily", label: "每天" },
                  { value: "weekly", label: "每周" },
                  { value: "monthly", label: "每月" },
                  { value: "yearly", label: "每年" },
                ]}
                onChange={(frequency) =>
                  change({
                    repeat:
                      frequency === "none"
                        ? undefined
                        : {
                            frequency: frequency as
                              "daily" | "weekly" | "monthly" | "yearly",
                            interval: 1,
                            ...(frequency === "weekly"
                              ? {
                                  weekdays: [
                                    new Date(
                                      fields.start.slice(0, 10) + "T12:00:00",
                                    ).getDay(),
                                  ],
                                }
                              : {}),
                          },
                  })
                }
              />
            </label>
            {fields.repeat && (!occurrenceDate || scope === "following") && (
              <CalendarRepeatFields
                repeat={fields.repeat}
                start={fields.start}
                today={today}
                onChange={(repeat) => change({ repeat })}
              />
            )}
            <label>
              地点
              <input
                aria-label="日程地点"
                value={fields.location}
                maxLength={500}
                placeholder="地点或会议室"
                onChange={(e) => change({ location: e.target.value })}
              />
            </label>
            <label>
              颜色
              <WorkspaceSelect
                label="日程颜色"
                value={
                  types?.find((t) => t.id === fields.typeId)?.color ??
                  fields.color
                }
                disabled={!!fields.typeId}
                options={calendarColorOptions}
                onChange={(color) => change({ color })}
              />
              {fields.typeId && <small>跟随类型标签配色</small>}
            </label>
            <label>
              链接
              <input
                aria-label="日程链接"
                type="url"
                value={fields.url}
                maxLength={2000}
                placeholder="https://"
                onChange={(e) => change({ url: e.target.value })}
              />
            </label>
            <label>
              备注
              <textarea
                aria-label="日程备注"
                rows={3}
                value={fields.notes}
                maxLength={4000}
                onChange={(e) => change({ notes: e.target.value })}
              />
            </label>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <footer>
            {occurrence && !copy && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCopy(true);
                    setScope("all");
                  }}
                >
                  <Copy size={16} />
                  复制
                </button>
                {onDelete && (
                  <button
                    type="button"
                    className="calendar-delete"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        onDelete(
                          occurrence.eventId,
                          occurrenceDate,
                          scope === "following",
                        ),
                      )
                    }
                  >
                    <Trash2 size={16} />
                    删除
                    {scope === "following"
                      ? "此日程及以后"
                      : occurrenceDate
                        ? "这一次"
                        : "日程"}
                  </button>
                )}
              </>
            )}
            <button
              className="planner-save"
              disabled={busy || !fields.title.trim()}
            >
              {busy ? "保存中…" : "保存日程"}
            </button>
          </footer>
        </form>
      )}
    </WebDialog>
  );
}
