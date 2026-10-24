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
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value as RepeatChoice)}
        >
          {allowOnce && <option value="once">不重复</option>}
          <option value="daily">每天</option>
          <option value="weekdays">工作日（周一至周五）</option>
          <option value="weekly">指定星期</option>
        </select>
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
