import type { CalendarEventInput } from "./calendar-events";
import type { TodoCreateOptions } from "./todo-planning";

export interface PlannerType {
  id: string;
  workspaceId: string;
  name: string;
  color: CalendarEventInput["color"];
}
/** Type labels are local metadata, separate from the existing todo sync contract. */
export interface TodoTypeLink {
  id: string;
  workspaceId: string;
  todoId: string;
  importKey?: string;
  typeId: string | null;
  time?: string | null;
}
export interface PlannerTodoInput extends TodoCreateOptions {
  text: string;
  date: string;
  notes: string;
  typeId?: string | null;
  time?: string | null;
}

export interface PlannerPreferences {
  workspaceId: string;
  hiddenTypeIds: string[];
  showUnclassified: boolean;
  showReminders: boolean;
  defaultTypeId: string | null;
  defaultDuration: number;
  timeZone?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  showWeekNumbers?: boolean;
  monthDensity?: "compact" | "comfortable";
}
export const DEFAULT_PLANNER_PREFERENCES: Omit<
  PlannerPreferences,
  "workspaceId"
> = {
  hiddenTypeIds: [],
  showUnclassified: true,
  showReminders: true,
  defaultTypeId: null,
  defaultDuration: 60,
  timeZone: "Asia/Hong_Kong",
  weekStartsOn: 1,
  showWeekNumbers: false,
  monthDensity: "compact",
};
/** An explicit null overrides series metadata (e.g. make one occurrence all-day). */
export function plannerTodoValue<T>(
  values: Record<string, T> | undefined,
  todo: { id: string; planning?: { seriesId?: string } },
): T | undefined {
  return Object.hasOwn(values ?? {}, todo.id)
    ? values?.[todo.id]
    : values?.[todo.planning?.seriesId ?? ""];
}
export function plannerTypeVisible(
  typeId: string | null | undefined,
  preferences?: PlannerPreferences,
): boolean {
  return typeId
    ? !preferences?.hiddenTypeIds.includes(typeId)
    : preferences?.showUnclassified !== false;
}
