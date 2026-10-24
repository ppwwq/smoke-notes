import {
  calendarMinute,
  getTodoDate,
  type Todo,
  type CalendarOccurrence,
} from "@smoke-notes/core";
/** Allocate overlapping events into columns so none hides another. */
export function eventColumns(events: CalendarOccurrence[], date: string) {
  const lower = calendarMinute(`${date}T00:00`);
  const rows = events
    .map((event) => ({
      event,
      start: Math.max(0, calendarMinute(event.start) - lower),
      end: Math.min(1440, calendarMinute(event.end) - lower),
      column: 0,
      count: 1,
    }))
    .filter((row) => row.end > 0 && row.start < 1440)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let group: typeof rows = [],
    ends: number[] = [],
    groupEnd = -1;
  const finish = () => {
    for (const row of group) row.count = ends.length;
    group = [];
    ends = [];
  };
  for (const row of rows) {
    if (row.start >= groupEnd) finish();
    let col = ends.findIndex((end) => end <= row.start);
    if (col < 0) col = ends.length;
    ends[col] = row.end;
    row.column = col;
    group.push(row);
    groupEnd = Math.max(groupEnd, row.end);
  }
  finish();
  return rows;
}

export function calendarSpanRows(
  events: CalendarOccurrence[],
  todos: Todo[],
  dates: string[],
) {
  const lower = dates[0] + "T00:00",
    upper = calendarMinute(dates.at(-1)! + "T00:00") + 1440;
  const entries = [
    ...events
      .filter(
        (event) => event.end > lower && calendarMinute(event.start) < upper,
      )
      .map((event) => ({
        id: event.id,
        event,
        todo: undefined as Todo | undefined,
        start: event.start,
        end: event.end,
      })),
    ...todos
      .filter((todo) => dates.includes(getTodoDate(todo)))
      .map((todo) => ({
        id: `todo:${todo.id}`,
        event: undefined as CalendarOccurrence | undefined,
        todo,
        start: getTodoDate(todo) + "T00:00",
        end: getTodoDate(todo) + "T23:59",
      })),
  ]
    .map((item) => ({
      ...item,
      first: Math.max(
        0,
        Math.floor((calendarMinute(item.start) - calendarMinute(lower)) / 1440),
      ),
      last: Math.min(
        dates.length - 1,
        Math.ceil((calendarMinute(item.end) - calendarMinute(lower)) / 1440) -
          1,
      ),
      row: 0,
    }))
    .sort(
      (a, b) =>
        b.last - b.first - (a.last - a.first) ||
        a.start.localeCompare(b.start) ||
        a.id.localeCompare(b.id),
    );
  const occupied: boolean[][] = [];
  for (const item of entries) {
    let row = occupied.findIndex((cells) =>
      dates.every(
        (_, index) => index < item.first || index > item.last || !cells[index],
      ),
    );
    if (row < 0) {
      row = occupied.length;
      occupied.push([]);
    }
    for (let day = item.first; day <= item.last; day++)
      occupied[row][day] = true;
    item.row = row;
  }
  return entries;
}
