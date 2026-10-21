import type { Todo } from "./types";
import {
  getTodoRule,
  type TodoPlanning,
  type TodoStamp,
} from "./todo-planning";

function compare(a?: TodoStamp, b?: TodoStamp): number {
  if (!a) return b ? -1 : 0;
  if (!b) return 1;
  return a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
}
/** Merge independent user intents. Initial generated instances have no clocks,
 * so opening another device cannot undo a completion. Ties are deterministic.
 * Rule revisions and status events remain append-only audit history.
 */
export function mergeTodoChanges(local: Todo, remote: Todo): Todo {
  if (!local.planning && !remote.planning) return remote;
  if (!local.planning) return remote;
  if (!remote.planning) return local;
  const lp = local.planning,
    rp = remote.planning;
  const clocks = { ...rp.clocks };
  // A newly learned effective rule may revise an untouched generated snapshot.
  // Explicit field clocks still win over either generated baseline below.
  const sourceOrder =
    (lp.sourceRevisionAt ?? "").localeCompare(rp.sourceRevisionAt ?? "") ||
    (lp.sourceRevisionId ?? "").localeCompare(rp.sourceRevisionId ?? "");
  const baseline = lp.kind === "occurrence" && sourceOrder > 0 ? local : remote;
  const planning: TodoPlanning = { ...baseline.planning! };
  const merged: Todo = {
    ...remote,
    text: baseline.text,
    completed: baseline.completed,
    planning,
  };
  const choose = (field: string): Todo => {
    const a = lp.clocks?.[field],
      b = rp.clocks?.[field];
    if (!a && !b) return baseline;
    if (compare(a, b) > 0) {
      if (a) clocks[field] = a;
      return local;
    }
    return remote;
  };
  merged.text = choose("text").text;
  merged.rank = choose("rank").rank;
  merged.deletedAt = choose("deleted").deletedAt;
  planning.notes = choose("notes").planning?.notes;
  if (planning.kind !== "occurrence")
    planning.date = choose("date").planning?.date;
  planning.settings = choose("settings").planning?.settings;
  const status = choose("status");
  planning.status = status.planning?.status;
  planning.completedAt = status.planning?.completedAt;
  merged.completed = status.completed;
  if (planning.kind === "occurrence" && status.planning?.clocks?.status) {
    planning.sourceRevisionId = status.planning.sourceRevisionId;
    planning.sourceRevisionAt = status.planning.sourceRevisionAt;
    planning.ruleSkipped = false;
  }
  planning.clocks = Object.fromEntries(
    Object.entries(clocks).sort(([a], [b]) => a.localeCompare(b)),
  );
  if (lp.generated !== undefined || rp.generated !== undefined)
    planning.generated = lp.generated === true && rp.generated === true;
  if (lp.revisions || rp.revisions) {
    const revisions = new Map(
      [...(rp.revisions ?? []), ...(lp.revisions ?? [])].map((r) => [r.id, r]),
    );
    planning.revisions = [...revisions.values()].sort(
      (a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom) ||
        a.changedAt.localeCompare(b.changedAt) ||
        a.id.localeCompare(b.id),
    );
    const rule = getTodoRule(merged);
    if (rule) {
      merged.text = rule.text;
      planning.notes = rule.notes;
    }
  }
  if (lp.events || rp.events) {
    const events = new Map(
      [...(rp.events ?? []), ...(lp.events ?? [])].map((event) => [
        event.id,
        event,
      ]),
    );
    planning.events = [...events.values()].sort(
      (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
    );
  }
  return merged;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function sameTodoContent(a: Todo, b: Todo): boolean {
  return (
    a.text === b.text &&
    a.completed === b.completed &&
    a.rank === b.rank &&
    a.deletedAt === b.deletedAt &&
    canonical(a.planning) === canonical(b.planning)
  );
}
