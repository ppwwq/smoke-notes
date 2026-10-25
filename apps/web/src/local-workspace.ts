import {
  SmokeNotesDatabase,
  todoStableId,
  type Notebook,
  type Note,
  type Todo,
  type SyncOperation,
} from "@smoke-notes/core";

/** Only for a workspace explicitly marked local-only: none of its writes were sent. */
export async function adoptLocalWorkspace(
  database: SmokeNotesDatabase,
  from: string,
  to: string,
  deviceId: string,
) {
  if (from === to) return;
  await database.transaction(
    "rw",
    [
      database.notebooks,
      database.notes,
      database.todos,
      database.operations,
      database.calendarEvents,
      database.plannerTypes,
      database.todoTypeLinks,
      database.plannerPreferences,
    ],
    async () => {
      const notebooks = await database.notebooks
        .where("workspaceId")
        .equals(from)
        .toArray();
      const notes = await database.notes
        .where("notebookId")
        .anyOf(notebooks.map((item) => item.id))
        .toArray();
      const todos = await database.todos
        .where("workspaceId")
        .equals(from)
        .toArray();
      const records = [
        ...notebooks.map((record) => ({ entity: "notebook" as const, record })),
        ...notes.map((record) => ({ entity: "note" as const, record })),
        ...todos.map((record) => ({ entity: "todo" as const, record })),
      ];
      const keys = new Set(
        records.map(({ entity, record }) => `${entity}:${record.id}`),
      );
      await database.operations
        .filter((op) => keys.has(`${op.entity}:${op.entityId}`))
        .delete();
      const timestamp = new Date().toISOString();
      for (const { entity, record } of records) {
        const next = { ...record, version: 1 };
        if ("workspaceId" in next) next.workspaceId = to;
        if ("planning" in next && next.planning?.kind === "settings") {
          next.id = todoStableId(`smoke-notes:todo-settings:${to}`);
          await database.todos.delete(record.id);
        }
        // Keep IDs, rich text, completion/history, clocks and tombstones. Collapse
        // unsent local edits into one create snapshot, not updates to absent rows.
        if (entity === "notebook")
          await database.notebooks.put(next as Notebook);
        else if (entity === "note") await database.notes.put(next as Note);
        else await database.todos.put(next as Todo);
        const operation: SyncOperation = {
          id: crypto.randomUUID(),
          deviceId,
          entity,
          entityId: next.id,
          action: "upsert",
          baseVersion: 0,
          payload: { ...next },
          attempts: 0,
          createdAt: timestamp,
          nextAttemptAt: timestamp,
        };
        await database.operations.add(operation);
      }
      await database.calendarEvents
        .where("workspaceId")
        .equals(from)
        .modify({ workspaceId: to });
      await database.plannerTypes
        .where("workspaceId")
        .equals(from)
        .modify({ workspaceId: to });
      const links = await database.todoTypeLinks
        .where("workspaceId")
        .equals(from)
        .toArray();
      for (const link of links) {
        await database.todoTypeLinks.delete(link.id);
        await database.todoTypeLinks.put({
          ...link,
          workspaceId: to,
          id: `${to}:${link.todoId}`,
        });
      }
      const preferences = await database.plannerPreferences.get(from);
      if (preferences) {
        await database.plannerPreferences.put({
          ...preferences,
          workspaceId: to,
        });
        await database.plannerPreferences.delete(from);
      }
    },
  );
}
