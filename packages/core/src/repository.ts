import type { CalendarImportResult } from "./calendar-import";
import { DEFAULT_CALENDAR_ZONE, validCalendarZone } from "./calendar-timezone";
import {
  validateCalendarEvent,
  CALENDAR_COLORS,
  calendarRule,
  type CalendarEvent,
  type CalendarEventInput,
} from "./calendar-events";
import type { Table } from "dexie";
import {
  DEFAULT_PLANNER_PREFERENCES,
  type PlannerPreferences,
  type PlannerType,
  type PlannerTodoInput,
} from "./planner-types";
import { makeTodoOccurrence } from "./todo-calendar";
import {
  createConflictCopy,
  isTrashExpired,
  rankBetween,
  RANK_GAP,
} from "./domain";
import type { Note, Notebook, SyncEntity, SyncOperation, Todo } from "./types";
import { SmokeNotesDatabase } from "./database";
import { mergeNoteChanges, sameNoteContent } from "./note-merge";
import {
  TEXT_LIMITS,
  validateSyncRecord,
  RecordValidationError,
} from "./validation";
import {
  DEFAULT_TODO_SETTINGS,
  addTodoDays,
  getTodoDate,
  getTodoDay,
  getTodoRule,
  getTodoStatus,
  isTodoDate,
  normalizeTodoRepeat,
  todoOccursOn,
  todoOccurrenceId,
  todoStableId,
  type TodoCreateOptions,
  type TodoPlanning,
  type TodoRuleChanges,
  type TodoSettings,
  type TodoStatus,
} from "./todo-planning";
import {
  createTaskListContent,
  migrateLegacyNoteContent,
  normalizeNoteColor,
  nextNoteColor,
  normalizeNoteKind,
  normalizeRichTextDocument,
  richTextToPlainText,
} from "./note-content";

export interface RepositoryContext {
  workspaceId: string;
  deviceId: string;
  now?: () => Date;
  createId?: () => string;
}

export type TrashRecord =
  | { entity: "notebook"; record: Notebook }
  | { entity: "note"; record: Note }
  | { entity: "todo"; record: Todo };

function byRank<T extends { rank: number }>(a: T, b: T): number {
  return (
    a.rank - b.rank ||
    ("id" in a && "id" in b ? String(a.id).localeCompare(String(b.id)) : 0)
  );
}

export class LocalRepository {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    readonly database: SmokeNotesDatabase,
    private readonly context: RepositoryContext,
  ) {
    this.now = context.now ?? (() => new Date());
    this.createId = context.createId ?? (() => crypto.randomUUID());
  }

  // PlannerSyncEngine reconciles durable calendar rows through its own CAS contract.
  async getPlannerPreferences(): Promise<PlannerPreferences> {
    return (
      (await this.database.plannerPreferences.get(
        this.context.workspaceId,
      )) ?? {
        ...DEFAULT_PLANNER_PREFERENCES,
        hiddenTypeIds: [],
        workspaceId: this.context.workspaceId,
      }
    );
  }
  async savePlannerPreferences(input: PlannerPreferences): Promise<void> {
    if (!validCalendarZone(input.timeZone ?? DEFAULT_CALENDAR_ZONE))
      throw new RecordValidationError("请选择有效时区。");
    if (
      ![15, 30, 60, 90, 120].includes(input.defaultDuration) ||
      ![0, 1, 2, 3, 4, 5, 6].includes(input.weekStartsOn ?? 1) ||
      typeof (input.showWeekNumbers ?? false) !== "boolean" ||
      !["compact", "comfortable"].includes(input.monthDensity ?? "compact") ||
      typeof input.showUnclassified !== "boolean" ||
      typeof input.showReminders !== "boolean" ||
      !Array.isArray(input.hiddenTypeIds) ||
      input.hiddenTypeIds.some((id) => typeof id !== "string")
    )
      throw new RecordValidationError("请选择有效的日历设置。");
    await this.database.transaction(
      "rw",
      this.database.plannerPreferences,
      this.database.plannerTypes,
      async () => {
        await this.requirePlannerType(input.defaultTypeId);
        const types = await this.listPlannerTypes();
        await this.database.plannerPreferences.put({
          workspaceId: this.context.workspaceId,
          hiddenTypeIds: [...new Set(input.hiddenTypeIds)].filter((id) =>
            types.some((t) => t.id === id),
          ),
          showUnclassified: input.showUnclassified,
          showReminders: input.showReminders,
          defaultTypeId: input.defaultTypeId ?? null,
          defaultDuration: input.defaultDuration,
          timeZone: input.timeZone ?? DEFAULT_CALENDAR_ZONE,
          weekStartsOn: input.weekStartsOn ?? 1,
          showWeekNumbers: input.showWeekNumbers ?? false,
          monthDensity: input.monthDensity ?? "compact",
        });
      },
    );
  }
  async listPlannerTypes(): Promise<PlannerType[]> {
    return this.database.plannerTypes
      .where("workspaceId")
      .equals(this.context.workspaceId)
      .toArray();
  }
  async listPlannerConflicts() {
    return this.database.plannerConflicts
      .where("workspaceId")
      .equals(this.context.workspaceId)
      .toArray();
  }
  async listTodoTypeLinks() {
    return this.database.todoTypeLinks
      .where("workspaceId")
      .equals(this.context.workspaceId)
      .toArray();
  }
  async savePlannerType(
    name: string,
    color: PlannerType["color"],
    id?: string,
  ): Promise<PlannerType> {
    name = name.trim();
    if (!name || name.length > 40)
      throw new RecordValidationError("类型名称须为 1 至 40 字。");
    if (!CALENDAR_COLORS.includes(color))
      throw new RecordValidationError("请选择有效颜色。");
    return this.database.transaction(
      "rw",
      this.database.plannerTypes,
      async () => {
        const types = await this.listPlannerTypes();
        if (id && !types.some((t) => t.id === id))
          throw new RecordValidationError("类型已不存在，请刷新后重试。");
        if (
          types.some(
            (t) =>
              t.id !== id &&
              t.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          )
        )
          throw new RecordValidationError("已有同名类型，请换一个名称。");
        const type: PlannerType = {
          id: id ?? this.createId(),
          workspaceId: this.context.workspaceId,
          name,
          color,
        };
        await this.database.plannerTypes.put(type);
        return type;
      },
    );
  }
  async deletePlannerType(id: string): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.plannerTypes,
      this.database.todoTypeLinks,
      this.database.calendarEvents,
      this.database.plannerPreferences,
      async () => {
        const type = await this.database.plannerTypes.get(id);
        if (!type || type.workspaceId !== this.context.workspaceId)
          throw new RecordValidationError("类型已不存在。");
        await this.database.plannerTypes.delete(id);
        const preferences = await this.getPlannerPreferences();
        await this.database.plannerPreferences.put({
          ...preferences,
          hiddenTypeIds: preferences.hiddenTypeIds.filter(
            (value) => value !== id,
          ),
          defaultTypeId:
            preferences.defaultTypeId === id ? null : preferences.defaultTypeId,
        });
        await this.database.todoTypeLinks
          .where("workspaceId")
          .equals(this.context.workspaceId)
          .filter((link) => link.typeId === id)
          .modify({ typeId: null });
        await this.database.calendarEvents
          .where("workspaceId")
          .equals(this.context.workspaceId)
          .modify((event) => {
            if (event.typeId === id) event.typeId = null;
            for (const value of Object.values(event.exceptions))
              if (value?.typeId === id) value.typeId = null;
          });
      },
    );
  }
  private async requirePlannerType(typeId?: string | null) {
    if (!typeId) return;
    const type = await this.database.plannerTypes.get(typeId);
    if (!type || type.workspaceId !== this.context.workspaceId)
      throw new RecordValidationError("所选类型已不存在，请重新选择。");
  }
  async savePlannerTodo(input: PlannerTodoInput, target?: Todo): Promise<Todo> {
    if (
      !input.text.trim() ||
      input.text.length > TEXT_LIMITS.todoText ||
      input.notes.length > 10000
    )
      throw new RecordValidationError(
        "请填写有效的待办内容（不超过 500 字）及备注。",
      );
    if (input.time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))
      throw new RecordValidationError("请选择有效的待办时间。");
    if (!isTodoDate(input.date))
      throw new RecordValidationError("请选择有效日期。");
    return this.database.transaction(
      "rw",
      [
        this.database.todos,
        this.database.operations,
        this.database.notebooks,
        this.database.plannerTypes,
        this.database.todoTypeLinks,
      ],
      async () => {
        await this.requirePlannerType(input.typeId);
        let saved: Todo;
        if (target) {
          if (target.workspaceId !== this.context.workspaceId)
            throw new RecordValidationError("无法编辑其他工作区的待办。");
          if (target.planning?.kind === "occurrence")
            await this.ensureTodoOccurrence(
              target.planning.seriesId!,
              getTodoDate(target),
            );
          const current = await this.requireRecord(
            this.database.todos,
            target.id,
          );
          if (
            current.deletedAt ||
            current.workspaceId !== this.context.workspaceId
          )
            throw new RecordValidationError("待办已删除，请刷新。");
          if (current.planning?.kind === "series")
            throw new RecordValidationError("请选择具体日期的待办。");
          if (input.scope === "following") {
            if (
              current.planning?.kind !== "occurrence" ||
              input.date !== getTodoDate(current)
            )
              throw new RecordValidationError("请选择重复待办的本次日期。");
            await this.updateTodoRule(
              current.planning.seriesId!,
              {
                text: input.text,
                notes: input.notes,
                ...(input.repeat ? { repeat: input.repeat } : {}),
              },
              input.date,
            );
            // Explicit exceptions on other dates remain unchanged; this date is the user's edit.
            saved = await this.updateTodo(current.id, {
              text: input.text,
              notes: input.notes,
            });
            await this.reconcileTodos();
            return saved;
          }
          if (input.repeat)
            throw new RecordValidationError("编辑这一次时不能更改重复规则。");
          if (
            current.planning?.kind === "occurrence" &&
            input.date !== getTodoDate(current)
          )
            throw new RecordValidationError("重复待办的本次日期不可更改。");
          saved = await this.updateTodo(target.id, {
            text: input.text,
            notes: input.notes,
          });
          if (input.date !== getTodoDate(saved))
            saved = await this.rescheduleTodo(saved.id, input.date);
        } else saved = await this.createTodo(input.text, input);
        const previousLink = await this.database.todoTypeLinks.get(
          `${this.context.workspaceId}:${saved.id}`,
        );
        await this.database.todoTypeLinks.put({
          importKey: previousLink?.importKey,
          id: `${this.context.workspaceId}:${saved.id}`,
          workspaceId: this.context.workspaceId,
          todoId: saved.id,
          typeId: input.typeId ?? null,
          time: input.time ?? null,
        });
        return saved;
      },
    );
  }
  /** Move one calendar reminder; recurring occurrences detach without changing the rule. */
  async movePlannerTodo(
    target: Todo,
    date: string,
    time?: string | null,
  ): Promise<Todo> {
    if (target.workspaceId !== this.context.workspaceId || !isTodoDate(date))
      throw new RecordValidationError("请选择有效的待办和日期。");
    return this.database.transaction(
      "rw",
      [
        this.database.todos,
        this.database.operations,
        this.database.notebooks,
        this.database.plannerTypes,
        this.database.todoTypeLinks,
      ],
      async () => {
        const current =
          target.planning?.kind === "occurrence"
            ? await this.ensureTodoOccurrence(
                target.planning.seriesId!,
                getTodoDate(target),
              )
            : await this.requireRecord(this.database.todos, target.id);
        if (
          current.deletedAt ||
          current.workspaceId !== this.context.workspaceId ||
          current.planning?.kind === "series" ||
          getTodoStatus(current) === "skipped"
        )
          throw new RecordValidationError("待办已变更，请刷新后重试。");
        const own = await this.database.todoTypeLinks.get(
          `${this.context.workspaceId}:${current.id}`,
        );
        const link =
          own ??
          (current.planning?.seriesId
            ? await this.database.todoTypeLinks.get(
                `${this.context.workspaceId}:${current.planning.seriesId}`,
              )
            : undefined);
        const input: PlannerTodoInput = {
          text: current.text,
          notes: current.planning?.notes ?? "",
          date,
          time: time === undefined ? link?.time : time,
          typeId: link?.typeId,
        };
        if (
          current.planning?.kind !== "occurrence" ||
          date === getTodoDate(current)
        )
          return this.savePlannerTodo(input, current);
        const moved = await this.savePlannerTodo(input);
        const saved =
          getTodoStatus(current) === "completed"
            ? await this.setTodoStatus(moved.id, "completed")
            : moved;
        await this.setTodoStatus(current.id, "skipped");
        return saved;
      },
    );
  }
  async importCalendarPlan(
    text: string,
    timeZone = DEFAULT_CALENDAR_ZONE,
  ): Promise<CalendarImportResult> {
    const { parseCalendarImport } = await import("./calendar-import");
    const plan = parseCalendarImport(text, timeZone);
    return this.database.transaction(
      "rw",
      [
        this.database.calendarEvents,
        this.database.plannerTypes,
        this.database.todos,
        this.database.operations,
        this.database.notebooks,
        this.database.todoTypeLinks,
      ],
      async () => {
        const existing = await this.listCalendarEvents();
        const links = await this.listTodoTypeLinks();
        const liveTodos = await this.database.todos
          .where("workspaceId")
          .equals(this.context.workspaceId)
          .filter((todo) => !todo.deletedAt)
          .toArray();
        const seen = new Set([
          ...existing.map((event) => event.importKey),
          ...links
            .filter((link) => liveTodos.some((todo) => todo.id === link.todoId))
            .map((link) => link.importKey),
        ]);
        const types = await this.listPlannerTypes();
        const result = { imported: 0, skipped: 0 };
        for (const item of plan.items) {
          const key = `${item.kind}:${item.uid ?? JSON.stringify(item)}`;
          if (seen.has(key)) {
            result.skipped++;
            continue;
          }
          const name = item.typeName?.trim();
          let type = name
            ? types.find(
                (type) =>
                  type.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
              )
            : undefined;
          if (name && !type) {
            type = await this.savePlannerType(
              name,
              item.kind === "event" ? item.input.color : "purple",
            );
            types.push(type);
          }
          if (item.kind === "event") {
            const event = await this.saveCalendarEvent({
              ...item.input,
              typeId: type?.id,
            });
            const exceptions = Object.fromEntries(
              Object.entries(item.exceptions ?? {}).map(([day, value]) => [
                day,
                value
                  ? validateCalendarEvent({ ...value, typeId: type?.id })
                  : null,
              ]),
            );
            await this.database.calendarEvents.put({
              ...event,
              importKey: key,
              exceptions,
            });
          } else {
            const todo = await this.savePlannerTodo({
              ...item.input,
              typeId: type?.id,
            });
            await this.database.todoTypeLinks.update(
              `${this.context.workspaceId}:${todo.id}`,
              { importKey: key },
            );
          }
          seen.add(key);
          result.imported++;
        }
        return result;
      },
    );
  }
  async listCalendarEvents(): Promise<CalendarEvent[]> {
    return this.database.calendarEvents
      .where("workspaceId")
      .equals(this.context.workspaceId)
      .filter((event) => !event.deletedAt)
      .toArray();
  }
  async saveCalendarEvent(
    input: CalendarEventInput,
    id?: string,
    occurrenceDate?: string,
    following = false,
  ): Promise<CalendarEvent> {
    const fields = validateCalendarEvent({
      ...input,
      repeat: occurrenceDate && !following ? undefined : input.repeat,
    });
    if (occurrenceDate && !isTodoDate(occurrenceDate))
      throw new RecordValidationError("无效的重复日期。");
    return this.database.transaction(
      "rw",
      this.database.calendarEvents,
      this.database.plannerTypes,
      async () => {
        await this.requirePlannerType(fields.typeId);
        const previous = id
          ? await this.database.calendarEvents.get(id)
          : undefined;
        if (
          id &&
          (!previous ||
            previous.deletedAt ||
            previous.workspaceId !== this.context.workspaceId)
        )
          throw new RecordValidationError("日程已删除，请刷新后重试。");
        const base = {
          id: id ?? this.createId(),
          workspaceId: this.context.workspaceId,
          updatedAt: this.now().toISOString(),
          deletedAt: null,
        };
        if (following && occurrenceDate && previous?.repeat) {
          // Split atomically: the history keeps its IDs and future edits become a new series.
          const futureExceptions = Object.fromEntries(
            Object.entries(previous.exceptions).filter(
              ([day]) => day >= occurrenceDate,
            ),
          );
          const pastExceptions = Object.fromEntries(
            Object.entries(previous.exceptions).filter(
              ([day]) => day < occurrenceDate,
            ),
          );
          const remaining =
            fields.repeat?.count === previous.repeat.count &&
            fields.repeat?.count
              ? Math.max(
                  1,
                  fields.repeat.count -
                    (calendarRule(previous)
                      ?.between(
                        new Date(`${previous.start.slice(0, 10)}T00:00:00Z`),
                        new Date(`${occurrenceDate}T00:00:00Z`),
                        true,
                      )
                      .filter(
                        (d) => d.toISOString().slice(0, 10) < occurrenceDate,
                      ).length ?? 0),
                )
              : fields.repeat?.count;
          const next: CalendarEvent = {
            ...fields,
            ...base,
            id: this.createId(),
            repeat: fields.repeat
              ? { ...fields.repeat, count: remaining }
              : undefined,
            // Explicit exceptions retain their individually chosen dates. The edited instance
            // itself is replaced by the new series and must not shadow its first event.
            exceptions: fields.repeat
              ? Object.fromEntries(
                  Object.entries(futureExceptions).filter(
                    ([day]) => day !== occurrenceDate,
                  ),
                )
              : {},
          };
          await this.database.calendarEvents.put({
            ...previous,
            updatedAt: base.updatedAt,
            repeat: {
              ...previous.repeat,
              count: undefined,
              until: addTodoDays(occurrenceDate, -1),
            },
            exceptions: pastExceptions,
            deletedAt:
              occurrenceDate <= previous.start.slice(0, 10)
                ? base.updatedAt
                : null,
          });
          await this.database.calendarEvents.put(next);
          return next;
        }
        const event: CalendarEvent =
          previous && occurrenceDate
            ? {
                ...previous,
                ...base,
                exceptions: {
                  ...previous.exceptions,
                  [occurrenceDate]: fields,
                },
              }
            : {
                ...fields,
                ...base,
                importKey: previous?.importKey,
                exceptions: fields.repeat ? (previous?.exceptions ?? {}) : {},
              };
        await this.database.calendarEvents.put(event);
        return event;
      },
    );
  }
  async deleteCalendarEvent(
    id: string,
    occurrenceDate?: string,
    following = false,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.calendarEvents,
      async () => {
        const event = await this.database.calendarEvents.get(id);
        if (!event || event.workspaceId !== this.context.workspaceId) return;
        await this.database.calendarEvents.put({
          ...event,
          updatedAt: this.now().toISOString(),
          ...(occurrenceDate && following && event.repeat
            ? {
                repeat: {
                  ...event.repeat,
                  count: undefined,
                  until: addTodoDays(occurrenceDate, -1),
                },
                exceptions: Object.fromEntries(
                  Object.entries(event.exceptions).filter(
                    ([day]) => day < occurrenceDate,
                  ),
                ),
                deletedAt:
                  occurrenceDate <= event.start.slice(0, 10)
                    ? this.now().toISOString()
                    : null,
              }
            : occurrenceDate
              ? { exceptions: { ...event.exceptions, [occurrenceDate]: null } }
              : { deletedAt: this.now().toISOString() }),
        });
      },
    );
  }
  async restoreCalendarEvent(
    snapshot: CalendarEvent,
    occurrenceDate?: string,
    following = false,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.calendarEvents,
      async () => {
        const current = await this.database.calendarEvents.get(snapshot.id);
        if (!current || current.workspaceId !== this.context.workspaceId)
          return;
        const exceptions = { ...current.exceptions };
        if (occurrenceDate && following) {
          for (const [day, value] of Object.entries(snapshot.exceptions))
            if (day >= occurrenceDate) exceptions[day] = value;
        } else if (occurrenceDate) {
          if (Object.hasOwn(snapshot.exceptions, occurrenceDate))
            exceptions[occurrenceDate] = snapshot.exceptions[occurrenceDate];
          else delete exceptions[occurrenceDate];
        }
        await this.database.calendarEvents.put({
          ...current,
          deletedAt: null,
          ...(following ? { repeat: snapshot.repeat } : {}),
          exceptions,
          updatedAt: this.now().toISOString(),
        });
      },
    );
  }

  async listNotebooks(): Promise<Notebook[]> {
    return (await this.database.notebooks.toArray())
      .filter((item) => !item.deletedAt)
      .sort(byRank);
  }

  async listNotes(notebookId: string): Promise<Note[]> {
    return (
      await this.database.notes.where("notebookId").equals(notebookId).toArray()
    )
      .filter((item) => !item.deletedAt)
      .sort(byRank);
  }

  async getNote(id: string): Promise<Note | null> {
    const note = await this.database.notes.get(id);
    return note && !note.deletedAt ? note : null;
  }

  async listTodos(): Promise<Todo[]> {
    return (await this.database.todos.toArray())
      .filter(
        (item) =>
          !item.deletedAt &&
          item.planning?.kind !== "series" &&
          item.planning?.kind !== "settings",
      )
      .sort(byRank);
  }

  async listPendingOperations(): Promise<SyncOperation[]> {
    return this.database.operations.orderBy("createdAt").toArray();
  }

  async createNotebook(name: string): Promise<Notebook> {
    return this.database.transaction(
      "rw",
      this.database.notebooks,
      this.database.operations,
      async () => {
        const notebook: Notebook = {
          id: this.createId(),
          workspaceId: this.context.workspaceId,
          name: name.trim() || "未命名便签本",
          rank: await this.nextRank(this.database.notebooks),
          version: 1,
          updatedAt: this.now().toISOString(),
          deletedAt: null,
        };
        await this.database.notebooks.add(notebook);
        await this.enqueue("notebook", notebook, 0);
        return notebook;
      },
    );
  }

  async createNote(
    notebookId: string,
    content: Pick<Note, "title"> &
      Partial<Pick<Note, "body" | "contentJson" | "color" | "kind">>,
  ): Promise<Note> {
    const kind = normalizeNoteKind(content.kind);
    const contentJson = content.contentJson
      ? normalizeRichTextDocument(content.contentJson, content.body ?? "")
      : kind === "todo"
        ? createTaskListContent(content.body ?? "")
        : migrateLegacyNoteContent(content.body ?? "");
    return this.database.transaction(
      "rw",
      this.database.notebooks,
      this.database.notes,
      this.database.operations,
      async () => {
        const notebook = await this.requireRecord(
          this.database.notebooks,
          notebookId,
        );
        if (notebook.deletedAt)
          throw new Error("便签本已删除，请先恢复或选择其他便签本。");
        const current = await this.listNotes(notebookId);
        const note: Note = {
          id: this.createId(),
          notebookId,
          kind,
          title: content.title.trim(),
          contentJson,
          body: richTextToPlainText(contentJson),
          color:
            content.color === undefined
              ? nextNoteColor(current)
              : normalizeNoteColor(content.color),
          rank: (current.at(-1)?.rank ?? 0) + RANK_GAP,
          version: 1,
          conflictOf: null,
          updatedAt: this.now().toISOString(),
          deletedAt: null,
        };
        await this.database.notes.add(note);
        await this.enqueue("note", note, 0);
        return note;
      },
    );
  }

  async createTodo(text: string, options?: TodoCreateOptions): Promise<Todo> {
    const settings = options
      ? await this.getTodoSettings()
      : DEFAULT_TODO_SETTINGS;
    const date =
      options?.date ?? getTodoDay(this.now(), settings.dayBoundaryHour);
    if (options && !isTodoDate(date))
      throw new RecordValidationError("请选择有效日期。");
    const repeat = options?.repeat
      ? normalizeTodoRepeat(options.repeat)
      : undefined;
    return this.database.transaction(
      "rw",
      this.database.todos,
      this.database.operations,
      async () => {
        const todo: Todo = {
          id: this.createId(),
          workspaceId: this.context.workspaceId,
          text: text.trim() || "新待办",
          completed: false,
          ...(options
            ? {
                planning: {
                  version: 1 as const,
                  kind: repeat ? ("series" as const) : ("task" as const),
                  date,
                  notes: options.notes?.trim() ?? "",
                  status: "open" as const,
                  completedAt: null,
                  clocks: {},
                  ...(repeat
                    ? {
                        revisions: [
                          {
                            id: this.createId(),
                            effectiveFrom: date,
                            changedAt: this.now().toISOString(),
                            text: text.trim() || "新待办",
                            notes: options.notes?.trim() ?? "",
                            repeat,
                            paused: false,
                            stopped: false,
                          },
                        ],
                      }
                    : {}),
                },
              }
            : {}),
          rank: await this.nextRank(this.database.todos),
          version: 1,
          updatedAt: this.now().toISOString(),
          deletedAt: null,
        };
        if (todo.planning)
          todo.planning.clocks = Object.fromEntries(
            ["text", "notes", "date", "status", "rank", "deleted"].map(
              (field) => [field, { at: todo.updatedAt, id: this.createId() }],
            ),
          );
        await this.database.todos.add(todo);
        await this.enqueue("todo", todo, 0);
        return todo;
      },
    );
  }

  async toggleTodo(id: string): Promise<Todo> {
    const current = await this.requireRecord(this.database.todos, id);
    if (current.planning)
      return this.setTodoStatus(
        id,
        getTodoStatus(current) === "completed" ? "open" : "completed",
      );
    return this.persistMutation(this.database.todos, "todo", id, (todo) => ({
      completed: !todo.completed,
    }));
  }

  async listTodoSeries(): Promise<Todo[]> {
    return (await this.database.todos.toArray())
      .filter((todo) => !todo.deletedAt && todo.planning?.kind === "series")
      .sort(byRank);
  }

  /** Persist a projected date only when the user acts; concurrent tabs share its stable ID. */
  async ensureTodoOccurrence(seriesId: string, date: string): Promise<Todo> {
    if (!isTodoDate(date)) throw new RecordValidationError("请选择有效日期。");
    return this.database.transaction(
      "rw",
      this.database.todos,
      this.database.operations,
      async () => {
        const series = await this.requireRecord(this.database.todos, seriesId);
        if (
          series.workspaceId !== this.context.workspaceId ||
          series.deletedAt ||
          series.planning?.kind !== "series"
        )
          throw new RecordValidationError("重复计划已不存在，请刷新日历。");
        const id = todoOccurrenceId(seriesId, date);
        const previous = await this.database.todos.get(id);
        if (previous?.deletedAt)
          throw new RecordValidationError(
            "这次待办已删除，可以在最近删除中恢复。",
          );
        if (previous && !previous.planning?.generated) return previous;
        const rule = getTodoRule(series, date);
        if (!rule || !todoOccursOn(rule, date))
          throw new RecordValidationError(
            "这一天的重复安排已改变，请刷新日历。",
          );
        if (previous?.planning?.sourceRevisionId === rule.id) return previous;
        const projected = makeTodoOccurrence(
          series,
          rule,
          date,
          this.now().toISOString(),
        );
        const saved = { ...projected, version: (previous?.version ?? 0) + 1 };
        await this.database.todos.put(saved);
        await this.enqueue("todo", saved, previous?.version ?? 0);
        return saved;
      },
    );
  }

  async getTodoSettings(): Promise<TodoSettings> {
    const record = await this.database.todos.get(
      todoStableId(`smoke-notes:todo-settings:${this.context.workspaceId}`),
    );
    return record?.planning?.settings ?? { ...DEFAULT_TODO_SETTINGS };
  }

  async setTodoDayBoundary(hour: 0 | 4): Promise<void> {
    if (hour !== 0 && hour !== 4)
      throw new RecordValidationError("换日时间只能是 00:00 或 04:00。");
    const id = todoStableId(
      `smoke-notes:todo-settings:${this.context.workspaceId}`,
    );
    await this.database.transaction(
      "rw",
      this.database.todos,
      this.database.operations,
      async () => {
        const current = await this.database.todos.get(id);
        const timestamp = current
          ? this.todoTimestamp(current)
          : this.now().toISOString();
        const updated: Todo = {
          ...(current ?? {
            id,
            workspaceId: this.context.workspaceId,
            text: "待办日期设置",
            completed: false,
            rank: 0,
            version: 0,
            deletedAt: null,
          }),
          version: (current?.version ?? 0) + 1,
          updatedAt: timestamp,
          planning: {
            version: 1,
            kind: "settings",
            settings: { timeZone: "Asia/Hong_Kong", dayBoundaryHour: hour },
            clocks: { settings: { at: timestamp, id: this.createId() } },
          },
        };
        await this.database.todos.put(updated);
        await this.enqueue("todo", updated, current?.version ?? 0);
      },
    );
    await this.reconcileTodos();
  }

  /** Materialize each scheduled date once, including dates missed while closed.
   * One transaction protects separate tabs; UUIDv5 protects separate devices.
   * No background process or open PC is required for catch-up on next launch.
   */
  async reconcileTodos(): Promise<number> {
    return this.database.transaction(
      "rw",
      this.database.todos,
      this.database.operations,
      async () => {
        const settings = await this.getTodoSettings();
        const today = getTodoDay(this.now(), settings.dayBoundaryHour);
        let added = 0;
        const records = await this.database.todos.toArray();
        const existing = new Map(records.map((record) => [record.id, record]));
        for (const series of records.filter(
          (record) => !record.deletedAt && record.planning?.kind === "series",
        )) {
          const start = [...(series.planning?.revisions ?? [])]
            .map((r) => r.effectiveFrom)
            .sort()[0];
          if (!start) continue;
          for (let date = start; date <= today; date = addTodoDays(date, 1)) {
            const rule = getTodoRule(series, date);
            if (!rule) continue;
            const occurs = todoOccursOn(rule, date);
            const id = todoOccurrenceId(series.id, date);
            const previous = existing.get(id);
            if (previous) {
              // An offline device can provision future dates from a stale rule.
              // Reconcile only untouched generated snapshots; explicit user edits
              // and completions remain historical facts, never rewritten.
              if (
                previous.planning?.generated &&
                !previous.deletedAt &&
                previous.planning.sourceRevisionId !== rule.id
              ) {
                const updated = this.updatedRecord(previous, {
                  text: rule.text,
                  completed: false,
                  planning: {
                    ...previous.planning,
                    notes: rule.notes,
                    sourceRevisionId: rule.id,
                    sourceRevisionAt: rule.changedAt,
                    status: occurs ? "open" : "skipped",
                    ruleSkipped: !occurs,
                  },
                });
                await this.database.todos.put(updated);
                existing.set(id, updated);
                await this.enqueue("todo", updated, previous.version);
              }
              continue;
            }
            if (!occurs) continue;
            const todo: Todo = {
              id,
              workspaceId: series.workspaceId,
              text: rule.text,
              completed: false,
              rank: series.rank,
              version: 1,
              updatedAt: this.now().toISOString(),
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
            await this.database.todos.add(todo);
            existing.set(id, todo);
            await this.enqueue("todo", todo, 0);
            added++;
          }
        }
        return added;
      },
    );
  }

  private todoTimestamp(current: Todo): string {
    // Preserve local intent order even for same-millisecond edits or a clock
    // moving backwards. Concurrent devices break equal clocks by event id.
    const planning = current.planning;
    const prior = [
      ...Object.values(planning?.clocks ?? {}).map((clock) => clock.at),
      ...(planning?.revisions ?? []).map((rule) => rule.changedAt),
      ...(planning?.events ?? []).map((event) => event.at),
    ];
    const latest = Math.max(
      0,
      ...prior.map((value) => Date.parse(value)).filter(Number.isFinite),
    );
    return new Date(Math.max(this.now().getTime(), latest + 1)).toISOString();
  }

  private todoPlanning(current: Todo): TodoPlanning {
    return (
      current.planning ?? {
        version: 1,
        kind: "task",
        date: getTodoDate(current),
        notes: "",
        status: getTodoStatus(current),
        completedAt: current.completed ? current.updatedAt : null,
        clocks: {},
      }
    );
  }

  async setTodoStatus(id: string, status: TodoStatus): Promise<Todo> {
    if (!["open", "completed", "skipped"].includes(status))
      throw new RecordValidationError("无效的待办状态。");
    return this.persistMutation(this.database.todos, "todo", id, (current) => {
      if (
        current.planning?.kind === "series" ||
        current.planning?.kind === "settings"
      )
        throw new RecordValidationError("请修改当天的待办实例。");
      const planning = this.todoPlanning(current),
        timestamp = this.todoTimestamp(current),
        eventId = this.createId();
      const completedAt = status === "completed" ? timestamp : null;
      return {
        completed: status === "completed",
        planning: {
          ...planning,
          status,
          completedAt,
          generated: false,
          clocks: {
            ...planning.clocks,
            ...(planning.kind === "occurrence" && planning.generated
              ? {
                  text: planning.clocks?.text ?? { at: timestamp, id: eventId },
                  notes: planning.clocks?.notes ?? {
                    at: timestamp,
                    id: eventId,
                  },
                }
              : {}),
            status: { at: timestamp, id: eventId },
          },
          events: [
            ...(planning.events ?? []),
            { id: eventId, at: timestamp, status, completedAt },
          ],
        },
      };
    });
  }

  async rescheduleTodo(id: string, date: string): Promise<Todo> {
    if (!isTodoDate(date)) throw new RecordValidationError("请选择有效日期。");
    return this.persistMutation(this.database.todos, "todo", id, (current) => {
      if (
        current.planning?.kind === "occurrence" ||
        current.planning?.kind === "series"
      )
        throw new RecordValidationError("重复待办请修改未来规则或跳过今天。");
      const planning = this.todoPlanning(current);
      return {
        planning: {
          ...planning,
          date,
          clocks: {
            ...planning.clocks,
            date: { at: this.todoTimestamp(current), id: this.createId() },
          },
        },
      };
    });
  }

  async updateTodoRule(
    id: string,
    changes: TodoRuleChanges,
    fromDate?: string,
  ): Promise<Todo> {
    if (fromDate !== undefined && !isTodoDate(fromDate))
      throw new RecordValidationError("请选择有效日期。");
    await this.reconcileTodos();
    const settings = await this.getTodoSettings();
    const effectiveFrom =
      fromDate ??
      addTodoDays(getTodoDay(this.now(), settings.dayBoundaryHour), 1);
    return this.persistMutation(this.database.todos, "todo", id, (current) => {
      const previous = getTodoRule(current, fromDate);
      if (
        current.deletedAt ||
        current.workspaceId !== this.context.workspaceId ||
        current.planning?.kind !== "series" ||
        !previous
      )
        throw new RecordValidationError("未找到重复待办规则。");
      const rule = {
        ...previous,
        ...changes,
        id: this.createId(),
        effectiveFrom:
          current.planning.date && current.planning.date > effectiveFrom
            ? current.planning.date
            : effectiveFrom,
        changedAt: this.todoTimestamp(current),
        text:
          changes.text === undefined
            ? previous.text
            : changes.text.trim() || "新待办",
        notes:
          changes.notes === undefined ? previous.notes : changes.notes.trim(),
        repeat: changes.repeat
          ? normalizeTodoRepeat(changes.repeat)
          : previous.repeat,
      };
      return {
        text: rule.text,
        planning: {
          ...current.planning,
          notes: rule.notes,
          revisions: [
            ...(current.planning.revisions ?? []),
            rule,
            // Override already scheduled revisions too, without deleting revision history.
            ...(fromDate
              ? [
                  ...new Set(
                    (current.planning.revisions ?? [])
                      .map((r) => r.effectiveFrom)
                      .filter((date) => date > fromDate),
                  ),
                ].map((effectiveFrom) => ({
                  ...rule,
                  id: this.createId(),
                  effectiveFrom,
                }))
              : []),
          ],
        },
      };
    });
  }

  async pauseTodoSeries(id: string, paused: boolean): Promise<Todo> {
    return this.updateTodoRule(id, { paused });
  }
  async stopTodoSeries(id: string): Promise<Todo> {
    return this.updateTodoRule(id, { stopped: true });
  }

  async renameNotebook(id: string, name: string): Promise<Notebook> {
    return this.persistMutation(
      this.database.notebooks,
      "notebook",
      id,
      () => ({ name: name.trim() || "未命名便签本" }),
    );
  }

  async updateNote(
    id: string,
    changes: Pick<Note, "title"> &
      Partial<Pick<Note, "body" | "contentJson" | "color">> & {
        baseSnapshot?: Note;
      },
  ): Promise<Note> {
    return this.persistMutation(
      this.database.notes,
      "note",
      id,
      (current) => {
        const contentJson = changes.contentJson
          ? normalizeRichTextDocument(
              changes.contentJson,
              changes.body ?? current.body,
            )
          : changes.body === undefined
            ? current.contentJson
            : migrateLegacyNoteContent(changes.body);
        return {
          title: changes.title.trim(),
          contentJson,
          body: richTextToPlainText(contentJson),
          color:
            changes.color === undefined
              ? current.color
              : normalizeNoteColor(changes.color),
        };
      },
      "upsert",
      changes.baseSnapshot,
    );
  }

  async updateTodo(
    id: string,
    changes: Pick<Todo, "text"> & { notes?: string },
  ): Promise<Todo> {
    return this.persistMutation(this.database.todos, "todo", id, (current) => {
      const text = changes.text.trim() || "新待办";
      if (!current.planning && changes.notes === undefined) return { text };
      const planning = this.todoPlanning(current),
        timestamp = this.todoTimestamp(current);
      return {
        text,
        planning: {
          ...planning,
          ...(changes.notes === undefined
            ? {}
            : { notes: changes.notes.trim() }),
          generated: false,
          clocks: {
            ...planning.clocks,
            text: { at: timestamp, id: this.createId() },
            ...(changes.notes === undefined
              ? {}
              : { notes: { at: timestamp, id: this.createId() } }),
          },
        },
      };
    });
  }

  async moveNote(
    id: string,
    previousRank: number | null,
    nextRank: number | null,
  ): Promise<Note> {
    return this.persistMutation(this.database.notes, "note", id, () => ({
      rank: rankBetween(previousRank, nextRank),
    }));
  }

  async moveNotebook(
    id: string,
    previousRank: number | null,
    nextRank: number | null,
  ): Promise<Notebook> {
    return this.persistMutation(
      this.database.notebooks,
      "notebook",
      id,
      () => ({ rank: rankBetween(previousRank, nextRank) }),
    );
  }

  async moveTodo(
    id: string,
    previousRank: number | null,
    nextRank: number | null,
  ): Promise<Todo> {
    return this.persistMutation(this.database.todos, "todo", id, () => ({
      rank: rankBetween(previousRank, nextRank),
    }));
  }

  async trashNote(id: string): Promise<Note> {
    return this.trashRecord(this.database.notes, "note", id);
  }

  async trashNotebook(id: string): Promise<Notebook> {
    return this.database.transaction(
      "rw",
      this.database.notebooks,
      this.database.notes,
      this.database.operations,
      async () => {
        const current = await this.requireRecord(this.database.notebooks, id);
        if (current.deletedAt) return current;
        const deletedAt = this.now().toISOString();
        const updated = this.updatedRecord(current, { deletedAt });
        const childNotes = (
          await this.database.notes.where("notebookId").equals(id).toArray()
        ).filter((note) => !note.deletedAt);
        await this.database.notebooks.put(updated);
        await this.enqueue("notebook", updated, current.version, "delete");
        for (const note of childNotes) {
          const deletedNote = this.updatedRecord(note, { deletedAt });
          await this.database.notes.put(deletedNote);
          await this.enqueue("note", deletedNote, note.version, "delete", note);
        }
        return updated;
      },
    );
  }

  async trashTodo(id: string): Promise<Todo> {
    return this.trashRecord(this.database.todos, "todo", id);
  }

  async restore(entity: "notebook", id: string): Promise<Notebook>;
  async restore(entity: "note", id: string): Promise<Note>;
  async restore(entity: "todo", id: string): Promise<Todo>;
  async restore(
    entity: SyncEntity,
    id: string,
  ): Promise<Notebook | Note | Todo> {
    if (entity === "notebook") {
      return this.database.transaction(
        "rw",
        this.database.notebooks,
        this.database.notes,
        this.database.operations,
        async () => {
          const current = await this.requireRecord(this.database.notebooks, id);
          if (!current.deletedAt) return current;
          const updated = this.updatedRecord(current, { deletedAt: null });
          const childNotes = (
            await this.database.notes.where("notebookId").equals(id).toArray()
          ).filter((note) => note.deletedAt === current.deletedAt);
          await this.database.notebooks.put(updated);
          await this.enqueue("notebook", updated, current.version);
          for (const note of childNotes) {
            const restoredNote = this.updatedRecord(note, { deletedAt: null });
            await this.database.notes.put(restoredNote);
            await this.enqueue(
              "note",
              restoredNote,
              note.version,
              "upsert",
              note,
            );
          }
          return updated;
        },
      );
    }
    if (entity === "note") {
      return this.database.transaction(
        "rw",
        this.database.notebooks,
        this.database.notes,
        this.database.operations,
        async () => {
          const current = await this.requireRecord(this.database.notes, id);
          const notebook = await this.requireRecord(
            this.database.notebooks,
            current.notebookId,
          );
          if (notebook.deletedAt) {
            const restored = this.updatedRecord(notebook, { deletedAt: null });
            await this.database.notebooks.put(restored);
            await this.enqueue("notebook", restored, notebook.version);
          }
          return this.persistMutation(this.database.notes, "note", id, () => ({
            deletedAt: null,
          }));
        },
      );
    }
    return this.persistMutation(this.tableFor(entity), entity, id, () => ({
      deletedAt: null,
    }));
  }

  async listTrash(): Promise<TrashRecord[]> {
    const [notebooks, notes, todos] = await Promise.all([
      this.database.notebooks.toArray(),
      this.database.notes.toArray(),
      this.database.todos.toArray(),
    ]);
    return [
      ...notebooks
        .filter((record) => record.deletedAt)
        .map((record) => ({ entity: "notebook" as const, record })),
      ...notes
        .filter((record) => record.deletedAt)
        .map((record) => ({ entity: "note" as const, record })),
      ...todos
        .filter((record) => record.deletedAt)
        .map((record) => ({ entity: "todo" as const, record })),
    ].sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt));
  }

  async purgeExpiredTrash(): Promise<number> {
    const trash = (await this.listTrash()).filter(
      ({ entity, record }) =>
        // All task history, including legacy tasks, remains recoverable indefinitely.
        entity !== "todo" && isTrashExpired(record.deletedAt, this.now()),
    );
    await this.database.transaction(
      "rw",
      this.database.notebooks,
      this.database.notes,
      this.database.todos,
      async () => {
        await Promise.all(
          trash.map(({ entity, record }) =>
            this.tableFor(entity).delete(record.id),
          ),
        );
      },
    );
    return trash.length;
  }

  private async nextRank<T extends { rank: number; deletedAt: string | null }>(
    table: Table<T, string>,
  ): Promise<number> {
    const records = (await table.toArray())
      .filter((item) => !item.deletedAt)
      .sort(byRank);
    return (records.at(-1)?.rank ?? 0) + RANK_GAP;
  }

  private updatedRecord<T extends { version: number; updatedAt: string }>(
    current: T,
    changes: Partial<T>,
  ): T {
    return {
      ...current,
      ...changes,
      version: current.version + 1,
      updatedAt: this.now().toISOString(),
    };
  }

  private async requireRecord<T>(
    table: Table<T, string>,
    id: string,
  ): Promise<T> {
    const record = await table.get(id);
    if (!record) throw new Error(`Record ${id} was not found`);
    return record;
  }

  private async persistMutation<T extends Notebook | Note | Todo>(
    table: Table<T, string>,
    entity: SyncEntity,
    id: string,
    changes: (current: T) => Partial<T>,
    action: SyncOperation["action"] = "upsert",
    baseSnapshot?: Note,
  ): Promise<T> {
    // Read and enqueue in the same transaction so compaction cannot rebase between them.
    return this.database.transaction(
      "rw",
      table,
      this.database.notebooks,
      this.database.operations,
      async () => {
        const current = await this.requireRecord(table, id);
        let updated = this.updatedRecord(current, changes(current));
        if (entity === "todo" && (updated as Todo).planning) {
          const todo = updated as Todo;
          const clocks = { ...todo.planning!.clocks };
          if (current.deletedAt !== updated.deletedAt)
            clocks.deleted = {
              at: this.todoTimestamp(current as Todo),
              id: this.createId(),
            };
          if (current.rank !== updated.rank)
            clocks.rank = {
              at: this.todoTimestamp(current as Todo),
              id: this.createId(),
            };
          todo.planning = { ...todo.planning!, clocks };
        }
        if (entity === "note" && baseSnapshot) {
          if (baseSnapshot.id !== id)
            throw new Error("Draft belongs to a different note");
          if (current.deletedAt) {
            const draft = this.updatedRecord(
              baseSnapshot as T,
              changes(baseSnapshot as T),
            ) as Note;
            if (sameNoteContent(draft, baseSnapshot)) return current;
            const copy = createConflictCopy(
              { ...draft, id: this.createId(), rank: draft.rank + 0.5 },
              id,
              this.now().toISOString(),
            );
            const notebook = await this.database.notebooks.get(copy.notebookId);
            if (!notebook || notebook.deletedAt) {
              const suffix = "（恢复）";
              const recovered: Notebook = {
                id: this.createId(),
                workspaceId: notebook?.workspaceId ?? this.context.workspaceId,
                name: notebook
                  ? `${notebook.name.slice(0, TEXT_LIMITS.notebookName - suffix.length)}${suffix}`
                  : "恢复的便签",
                rank: await this.nextRank(this.database.notebooks),
                version: 1,
                updatedAt: this.now().toISOString(),
                deletedAt: null,
              };
              await this.database.notebooks.add(recovered);
              await this.enqueue("notebook", recovered, 0);
              copy.notebookId = recovered.id;
            }
            await this.database.notes.add(copy);
            await this.enqueue("note", copy, 0);
            return copy as T;
          }
          const merged = mergeNoteChanges(
            updated as Note,
            current as Note,
            baseSnapshot,
          );
          if (merged) {
            updated = {
              ...merged,
              version: updated.version,
              updatedAt: updated.updatedAt,
            } as T;
          } else {
            // Keep the editor on its existing note ID and preserve the other
            // version atomically, including its upload, before replacing it.
            const copy = createConflictCopy(
              {
                ...(current as Note),
                id: this.createId(),
                rank: (current as Note).rank + 0.5,
              },
              id,
              this.now().toISOString(),
            );
            await this.database.notes.add(copy);
            await this.enqueue("note", copy, 0);
          }
        }
        if (
          entity === "note" &&
          sameNoteContent(current as Note, updated as Note)
        )
          return current;
        await table.put(updated);
        await this.enqueue(
          entity,
          updated,
          current.version,
          action,
          entity === "note" ? (current as Note) : undefined,
        );
        return updated;
      },
    );
  }

  private async trashRecord<T extends Notebook | Note | Todo>(
    table: Table<T, string>,
    entity: SyncEntity,
    id: string,
  ): Promise<T> {
    return this.persistMutation(
      table,
      entity,
      id,
      () => ({ deletedAt: this.now().toISOString() }) as Partial<T>,
      "delete",
    );
  }

  private async enqueue(
    entity: SyncEntity,
    record: Notebook | Note | Todo,
    baseVersion: number,
    action: SyncOperation["action"] = "upsert",
    baseSnapshot?: Note,
  ): Promise<void> {
    validateSyncRecord(entity, record);
    const timestamp = this.now().toISOString();
    await this.database.operations.add({
      id: this.createId(),
      deviceId: this.context.deviceId,
      entity,
      entityId: record.id,
      action,
      baseVersion,
      ...(baseSnapshot ? { baseSnapshot } : {}),
      payload: { ...record },
      attempts: 0,
      nextAttemptAt: timestamp,
      createdAt: timestamp,
    });
  }

  private tableFor(entity: SyncEntity): Table<Notebook | Note | Todo, string> {
    if (entity === "notebook") {
      return this.database.notebooks as unknown as Table<
        Notebook | Note | Todo,
        string
      >;
    }
    if (entity === "note") {
      return this.database.notes as unknown as Table<
        Notebook | Note | Todo,
        string
      >;
    }
    return this.database.todos as unknown as Table<
      Notebook | Note | Todo,
      string
    >;
  }
}
