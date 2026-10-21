import type { Todo } from "./types";
import { RecordValidationError } from "./validation";

export type TodoStatus = "open" | "completed" | "skipped";
export interface TodoRepeat {
  kind: "daily" | "weekdays" | "weekly";
  /** Sunday = 0 through Saturday = 6. */
  weekdays?: number[];
}
export interface TodoSettings {
  timeZone: "Asia/Hong_Kong";
  dayBoundaryHour: 0 | 4;
}
export interface TodoStamp {
  at: string;
  id: string;
}
export interface TodoRule {
  id: string;
  effectiveFrom: string;
  changedAt: string;
  text: string;
  notes: string;
  repeat: TodoRepeat;
  paused: boolean;
  stopped: boolean;
}
export interface TodoPlanning {
  version: 1;
  kind: "task" | "series" | "occurrence" | "settings";
  date?: string;
  notes?: string;
  status?: TodoStatus;
  completedAt?: string | null;
  seriesId?: string;
  sourceRevisionId?: string;
  sourceRevisionAt?: string;
  ruleSkipped?: boolean;
  revisions?: TodoRule[];
  settings?: TodoSettings;
  clocks?: Record<string, TodoStamp>;
  /** No explicit user edit yet. It must never beat an explicit completion. */
  generated?: boolean;
  events?: Array<{
    id: string;
    at: string;
    status: TodoStatus;
    completedAt: string | null;
  }>;
}
export interface TodoCreateOptions {
  date?: string;
  notes?: string;
  repeat?: TodoRepeat;
}
export interface TodoRuleChanges {
  text?: string;
  notes?: string;
  repeat?: TodoRepeat;
  paused?: boolean;
  stopped?: boolean;
}
export const DEFAULT_TODO_SETTINGS: TodoSettings = {
  timeZone: "Asia/Hong_Kong",
  dayBoundaryHour: 0,
};

export function getTodoDay(now = new Date(), boundary: 0 | 4 = 0): string {
  // Hong Kong has no DST. Offset before extracting the date also handles 04:00.
  return new Date(now.getTime() + (8 - boundary) * 3_600_000)
    .toISOString()
    .slice(0, 10);
}
export function isTodoDate(date: unknown): date is string {
  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  );
}
export function addTodoDays(date: string, days: number): string {
  if (!isTodoDate(date)) throw new RecordValidationError("请选择有效日期。");
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
export function getTodoDate(todo: Todo): string {
  return todo.planning?.date ?? getTodoDay(new Date(todo.updatedAt));
}
export function getTodoStatus(todo: Todo): TodoStatus {
  return todo.planning?.status ?? (todo.completed ? "completed" : "open");
}
export function getTodoRule(todo: Todo, date?: string): TodoRule | undefined {
  return [...(todo.planning?.revisions ?? [])]
    .filter((rule) => !date || rule.effectiveFrom <= date)
    .sort(
      (a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom) ||
        a.changedAt.localeCompare(b.changedAt) ||
        a.id.localeCompare(b.id),
    )
    .at(-1);
}
export function todoOccursOn(rule: TodoRule, date: string): boolean {
  if (rule.paused || rule.stopped || rule.effectiveFrom > date) return false;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (
    rule.repeat.kind === "daily" ||
    (rule.repeat.kind === "weekdays"
      ? weekday >= 1 && weekday <= 5
      : !!rule.repeat.weekdays?.includes(weekday))
  );
}
export function normalizeTodoRepeat(repeat: TodoRepeat): TodoRepeat {
  if (!repeat || !["daily", "weekdays", "weekly"].includes(repeat.kind))
    throw new RecordValidationError("请选择有效重复规则。");
  if (repeat.kind !== "weekly") return { kind: repeat.kind };
  const days = [...new Set(repeat.weekdays ?? [])].sort();
  if (
    !days.length ||
    days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    throw new RecordValidationError("请至少选择一个有效星期。");
  return { kind: "weekly", weekdays: days };
}

/** UUIDv5 using SHA-1 over the DNS namespace + application-specific name.
 * Synchronous so deterministic ids can be created inside an IndexedDB transaction.
 */
export function todoStableId(name: string): string {
  const namespace = [
    0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0,
    0x4f, 0xd4, 0x30, 0xc8,
  ];
  const data = [...namespace, ...new TextEncoder().encode(name)];
  const bitLength = data.length * 8;
  data.push(0x80);
  while (data.length % 64 !== 56) data.push(0);
  for (let i = 7; i >= 0; i--)
    data.push(i >= 4 ? 0 : (bitLength >>> (i * 8)) & 255);
  let h0 = 0x67452301,
    h1 = 0xefcdab89,
    h2 = 0x98badcfe,
    h3 = 0x10325476,
    h4 = 0xc3d2e1f0;
  const rot = (n: number, b: number) => (n << b) | (n >>> (32 - b));
  for (let offset = 0; offset < data.length; offset += 64) {
    const w = new Int32Array(80);
    for (let i = 0; i < 16; i++)
      w[i] =
        (data[offset + i * 4] << 24) |
        (data[offset + i * 4 + 1] << 16) |
        (data[offset + i * 4 + 2] << 8) |
        data[offset + i * 4 + 3];
    for (let i = 16; i < 80; i++)
      w[i] = rot(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4;
    for (let i = 0; i < 80; i++) {
      const f =
        i < 20
          ? (b & c) | (~b & d)
          : i < 40
            ? b ^ c ^ d
            : i < 60
              ? (b & c) | (b & d) | (c & d)
              : b ^ c ^ d;
      const k =
        i < 20
          ? 0x5a827999
          : i < 40
            ? 0x6ed9eba1
            : i < 60
              ? 0x8f1bbcdc
              : 0xca62c1d6;
      const temp = (rot(a, 5) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = rot(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  const bytes = [h0, h1, h2, h3].flatMap((n) => [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ]);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function todoOccurrenceId(seriesId: string, date: string): string {
  return todoStableId(`smoke-notes:todo-occurrence:${seriesId}:${date}`);
}
