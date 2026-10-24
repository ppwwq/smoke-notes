import type { Todo } from "./types";
import {
  addTodoDays,
  getTodoDate,
  getTodoRule,
  isTodoDate,
  todoOccursOn,
  todoOccurrenceId,
  type TodoRule,
} from "./todo-planning";
import { RecordValidationError } from "./validation";

export function makeTodoOccurrence(
  series: Todo,
  rule: TodoRule,
  date: string,
  updatedAt: string,
): Todo {
  return {
    id: todoOccurrenceId(series.id, date),
    workspaceId: series.workspaceId,
    text: rule.text,
    completed: false,
    rank: series.rank,
    version: 0,
    updatedAt,
    deletedAt: null,
    planning: {
      version: 1,
      kind: "occurrence",
      seriesId: series.id,
      date,
      notes: rule.notes,
      status: "open",
      completedAt: null,
      sourceRevisionId: rule.id,
      sourceRevisionAt: rule.changedAt,
      generated: true,
      clocks: {},
    },
  };
}

/** Read-only month projection. Include tombstones so deleted occurrences stay absent. */
export function projectTodoRange(
  records: Todo[],
  from: string,
  to: string,
  today: string,
): Todo[] {
  if (
    !isTodoDate(from) ||
    !isTodoDate(to) ||
    !isTodoDate(today) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 62 * 86_400_000
  )
    throw new RecordValidationError("请选择不超过两个月的日期范围。");
  const existing = new Map(records.map((todo) => [todo.id, todo]));
  const result = new Map(
    records
      .filter((todo) => {
        const date = getTodoDate(todo);
        return (
          !todo.deletedAt &&
          todo.planning?.kind !== "series" &&
          todo.planning?.kind !== "settings" &&
          !todo.planning?.ruleSkipped &&
          date >= from &&
          date <= to &&
          !(
            date > today &&
            todo.planning?.kind === "occurrence" &&
            todo.planning.generated
          )
        );
      })
      .map((todo) => [todo.id, todo]),
  );
  for (const series of records.filter(
    (todo) => !todo.deletedAt && todo.planning?.kind === "series",
  )) {
    for (
      let date = from > today ? from : addTodoDays(today, 1);
      date <= to;
      date = addTodoDays(date, 1)
    ) {
      const rule = getTodoRule(series, date);
      if (!rule || !todoOccursOn(rule, date)) continue;
      const id = todoOccurrenceId(series.id, date),
        prior = existing.get(id);
      if (prior?.deletedAt || (prior && !prior.planning?.generated)) continue;
      const projected = makeTodoOccurrence(
        series,
        rule,
        date,
        prior?.updatedAt ?? rule.changedAt,
      );
      result.set(
        id,
        prior ? { ...projected, version: prior.version } : projected,
      );
    }
  }
  return [...result.values()].sort(
    (a, b) =>
      getTodoDate(a).localeCompare(getTodoDate(b)) ||
      a.rank - b.rank ||
      a.id.localeCompare(b.id),
  );
}
