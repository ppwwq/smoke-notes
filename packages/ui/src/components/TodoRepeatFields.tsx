import { WorkspaceSelect } from "./WorkspaceSelect";
export type RepeatChoice = "once" | "daily" | "weekdays" | "weekly";
const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export function RepeatFields({
  value,
  days,
  onChange,
  onDaysChange,
  label,
  allowOnce = true,
}: {
  value: RepeatChoice;
  days: number[];
  onChange(value: RepeatChoice): void;
  onDaysChange(days: number[]): void;
  label: string;
  allowOnce?: boolean;
}) {
  return (
    <>
      <label>
        重复
        <WorkspaceSelect<RepeatChoice>
          label={label}
          value={value}
          onChange={onChange}
          options={[
            ...(allowOnce ? [{ value: "once" as const, label: "不重复" }] : []),
            { value: "daily", label: "每天" },
            { value: "weekdays", label: "工作日（周一至周五）" },
            { value: "weekly", label: "指定星期" },
          ]}
        />
      </label>
      {value === "weekly" && (
        <fieldset className="planner-weekdays">
          <legend>每周哪几天</legend>
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={days.includes(day)}
                aria-label={`星期${weekdayLabels[day]}`}
                onChange={(event) =>
                  onDaysChange(
                    event.target.checked
                      ? [...days, day].sort()
                      : days.filter((item) => item !== day),
                  )
                }
              />
              <span>{weekdayLabels[day]}</span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}
