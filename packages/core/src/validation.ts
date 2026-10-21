import type { Note, Notebook, SyncEntity, Todo } from "./types";
import { isTodoDate, normalizeTodoRepeat } from "./todo-planning";

// Keep in step with apply-mutation's limits; validate before committing an outbox entry.
export const TEXT_LIMITS = {
  notebookName: 80,
  noteTitle: 200,
  todoText: 500,
  noteBody: 100000,
  noteContent: 500000,
} as const;

export class RecordValidationError extends Error {}
function check(value: string, max: number, label: string) {
  if (value.length > max)
    throw new RecordValidationError(`${label}不能超过 ${max} 个字符。`);
}
export function validateSyncRecord(
  entity: SyncEntity,
  record: Notebook | Note | Todo,
) {
  if (entity === "notebook")
    check((record as Notebook).name, TEXT_LIMITS.notebookName, "便签本名称");
  else if (entity === "todo") {
    const todo = record as Todo;
    check(todo.text, TEXT_LIMITS.todoText, "待办内容");
    const plan = todo.planning;
    if (plan) {
      if (
        plan.version !== 1 ||
        !["task", "series", "occurrence", "settings"].includes(plan.kind)
      )
        throw new RecordValidationError("待办计划格式无效。");
      if (plan.date !== undefined && !isTodoDate(plan.date))
        throw new RecordValidationError("请选择有效日期。");
      check(plan.notes ?? "", 10000, "待办备注");
      if (
        plan.status &&
        !["open", "completed", "skipped"].includes(plan.status)
      )
        throw new RecordValidationError("无效的待办状态。");
      if (plan.kind === "occurrence" && (!plan.seriesId || !plan.date))
        throw new RecordValidationError("待办实例缺少所属规则或日期。");
      if (plan.kind === "series" && !plan.revisions?.length)
        throw new RecordValidationError("重复待办缺少规则。");
      for (const rule of plan.revisions ?? []) {
        if (!isTodoDate(rule.effectiveFrom))
          throw new RecordValidationError("重复规则日期无效。");
        normalizeTodoRepeat(rule.repeat);
        check(rule.text, TEXT_LIMITS.todoText, "待办内容");
        check(rule.notes, 10000, "待办备注");
      }
      if (
        plan.settings &&
        (plan.settings.timeZone !== "Asia/Hong_Kong" ||
          ![0, 4].includes(plan.settings.dayBoundaryHour))
      )
        throw new RecordValidationError("待办日期设置无效。");
      if (JSON.stringify(plan).length > 1000000)
        throw new RecordValidationError(
          "待办计划历史过大，请新建重复事项保留现有历史。",
        );
    }
  } else {
    const note = record as Note;
    check(note.title, TEXT_LIMITS.noteTitle, "便签标题");
    check(note.body, TEXT_LIMITS.noteBody, "便签正文");
    if (JSON.stringify(note.contentJson).length > TEXT_LIMITS.noteContent)
      throw new RecordValidationError("便签内容及格式过大，请拆分为多张便签。");
  }
}
