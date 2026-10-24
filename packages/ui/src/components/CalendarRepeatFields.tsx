import type { CalendarRepeat } from "@smoke-notes/core";
import { WorkspaceSelect } from "./WorkspaceSelect";
import { PlannerDatePicker } from "./PlannerDatePicker";

export function CalendarRepeatFields({
  repeat,
  start,
  today,
  onChange,
}: {
  repeat: CalendarRepeat;
  start: string;
  today: string;
  onChange(repeat: CalendarRepeat): void;
}) {
  const day = new Date(`${start.slice(0, 10)}T12:00:00`);
  const frequencyLabels = {
    daily: "天",
    weekly: "周",
    monthly: "个月",
    yearly: "年",
  };
  const end = repeat.until ? "date" : repeat.count ? "count" : "never";
  const patch = (next: Partial<CalendarRepeat>) =>
    onChange({ ...repeat, ...next });
  return (
    <div className="calendar-repeat-options">
      <label>
        每隔（{frequencyLabels[repeat.frequency]}）
        <input
          aria-label="日程重复间隔"
          type="number"
          min={1}
          max={99}
          value={repeat.interval}
          onChange={(e) => patch({ interval: Number(e.target.value) })}
        />
      </label>
      {repeat.frequency === "weekly" && (
        <div
          className="calendar-weekdays"
          role="group"
          aria-label="日程重复星期"
        >
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button
              key={d}
              type="button"
              aria-label={`星期${"日一二三四五六"[d]}`}
              aria-pressed={repeat.weekdays?.includes(d) ?? false}
              onClick={() =>
                patch({
                  weekdays: repeat.weekdays?.includes(d)
                    ? repeat.weekdays.filter((v) => v !== d)
                    : [...(repeat.weekdays ?? []), d],
                })
              }
            >
              {"日一二三四五六"[d]}
            </button>
          ))}
        </div>
      )}
      {repeat.frequency === "yearly" && (
        <div
          className="calendar-repeat-months"
          role="group"
          aria-label="日程重复月份"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={(repeat.months ?? [day.getMonth() + 1]).includes(m)}
              onClick={() => {
                const current = repeat.months ?? [day.getMonth() + 1];
                patch({
                  months: current.includes(m)
                    ? current.filter((v) => v !== m)
                    : [...current, m],
                });
              }}
            >
              {m}月
            </button>
          ))}
        </div>
      )}
      {(repeat.frequency === "monthly" || repeat.frequency === "yearly") && (
        <>
          <label>
            重复方式
            <WorkspaceSelect
              label="按日期或星期重复"
              value={repeat.nthWeekday ? "weekday" : "date"}
              options={[
                { value: "date", label: "在指定日期" },
                { value: "weekday", label: "在第几个星期几" },
              ]}
              onChange={(value) =>
                patch({
                  nthWeekday:
                    value === "weekday"
                      ? {
                          ordinal: Math.ceil(day.getDate() / 7),
                          weekday: day.getDay(),
                        }
                      : undefined,
                  monthDays: undefined,
                })
              }
            />
          </label>
          {repeat.nthWeekday ? (
            <div className="calendar-repeat-pattern">
              <WorkspaceSelect
                label="重复星期序号"
                value={repeat.nthWeekday.ordinal}
                options={[1, 2, 3, 4, 5, -1].map((n) => ({
                  value: n,
                  label: n === -1 ? "最后一个" : `第${"一二三四五"[n - 1]}个`,
                }))}
                onChange={(ordinal) =>
                  patch({ nthWeekday: { ...repeat.nthWeekday!, ordinal } })
                }
              />
              <WorkspaceSelect
                label="重复星期几"
                value={repeat.nthWeekday.weekday}
                options={[1, 2, 3, 4, 5, 6, 0].map((n) => ({
                  value: n,
                  label: `星期${"日一二三四五六"[n]}`,
                }))}
                onChange={(weekday) =>
                  patch({ nthWeekday: { ...repeat.nthWeekday!, weekday } })
                }
              />
            </div>
          ) : (
            <div
              className="calendar-repeat-days"
              role="group"
              aria-label="每月重复日期"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`每月${n}日`}
                  aria-pressed={(repeat.monthDays ?? [day.getDate()]).includes(
                    n,
                  )}
                  onClick={() => {
                    const current = repeat.monthDays ?? [day.getDate()];
                    patch({
                      monthDays: current.includes(n)
                        ? current.filter((v) => v !== n)
                        : [...current, n],
                    });
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <label>
        结束重复
        <WorkspaceSelect
          label="结束重复方式"
          value={end}
          options={[
            { value: "never", label: "永不" },
            { value: "date", label: "在指定日期" },
            { value: "count", label: "重复指定次数" },
          ]}
          onChange={(value) =>
            patch({
              until: value === "date" ? start.slice(0, 10) : undefined,
              count: value === "count" ? 10 : undefined,
            })
          }
        />
      </label>
      {end === "date" && (
        <PlannerDatePicker
          label="重复结束日期"
          value={repeat.until!}
          today={today}
          onChange={(until) => patch({ until })}
        />
      )}
      {end === "count" && (
        <label>
          重复次数
          <input
            aria-label="日程重复次数"
            type="number"
            min={1}
            max={10000}
            value={repeat.count}
            onChange={(e) => patch({ count: Number(e.target.value) })}
          />
        </label>
      )}
    </div>
  );
}
