import type { Note, Notebook, SyncEntity, Todo } from "./types";

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
  else if (entity === "todo")
    check((record as Todo).text, TEXT_LIMITS.todoText, "待办内容");
  else {
    const note = record as Note;
    check(note.title, TEXT_LIMITS.noteTitle, "便签标题");
    check(note.body, TEXT_LIMITS.noteBody, "便签正文");
    if (JSON.stringify(note.contentJson).length > TEXT_LIMITS.noteContent)
      throw new RecordValidationError("便签内容及格式过大，请拆分为多张便签。");
  }
}
