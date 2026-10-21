const kinds = new Set(["task", "series", "occurrence", "settings"]);

/** Keep the complete planning document, including clocks and past revisions.
 * PostgreSQL validates the detailed schema atomically with the row and receipt.
 */
export function planningPayload(payload: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(payload, "planning")) return {};
  const value = payload.planning;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).version !== 1 ||
    !kinds.has(String((value as Record<string, unknown>).kind)) ||
    JSON.stringify(value).length > 1_000_000
  )
    throw new Error("invalid_todo_planning");
  return { planning: value };
}

export function supportsTodoPlanning(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Record<string, unknown>).todoPlanning === 1
  );
}
