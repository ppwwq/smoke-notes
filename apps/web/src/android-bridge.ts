import {
  mapRemoteRecord,
  type CalendarEvent,
  type Note,
  type Notebook,
  type PlannerConflict,
  type PlannerKind,
  type PlannerSyncState,
  type PlannerType,
  type SmokeNotesDatabase,
  type SupabaseCloud,
  type SyncEntity,
  type SyncOperation,
  type Todo,
  type TodoTypeLink,
} from "@smoke-notes/core";
import type {
  AndroidBridge,
  AndroidNativeAction,
  AndroidWidgetSnapshot,
} from "@smoke-notes/ui";

export interface RawAndroidInterface {
  onAppReady?(): void;
  consumeLegacyMigration?(): string;
  markLegacyMigrated?(): void;
  updateWidgetSnapshot?(json: string): void;
  setSystemBarTheme?(backgroundHex: string, darkIcons: boolean): void;
  haptic?(kind: string): void;
  pinWidget?(): void;
  saveTextFile?(filename: string, mimeType: string, content: string): void;
  hideKeyboard?(): void;
  openExternalUrl?(url: string): void;
}

declare global {
  interface Window {
    JotdayAndroid?: RawAndroidInterface;
    __jotdayHandleBack?: () => boolean;
    __jotdayNativeAction?: (action: AndroidNativeAction) => void;
    __jotdayPendingAction?: AndroidNativeAction | null;
  }
}

interface LegacyWorkspaceState {
  id: string;
  version?: number;
  snapshot?: unknown;
  operation?: { id?: string; baseVersion?: number } | null;
}

interface LegacyMigrationPayload {
  workspaceId: string;
  paired?: boolean;
  session?: { access_token?: string; refresh_token?: string } | null;
  notebooks?: Record<string, unknown>[];
  notes?: Record<string, unknown>[];
  todos?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  types?: Record<string, unknown>[];
  links?: Record<string, unknown>[];
  conflicts?: Record<string, unknown>[];
  workspaceStates?: Partial<Record<SyncEntity, LegacyWorkspaceState[]>>;
  plannerStates?: Partial<
    Record<
      PlannerKind,
      Array<{
        id: string;
        version?: number;
        snapshot?: Record<string, unknown> | null;
      }>
    >
  >;
}

function rawAndroid(): RawAndroidInterface | undefined {
  if (typeof window === "undefined") return undefined;
  return window.JotdayAndroid;
}

export function getAndroidBridge(): AndroidBridge | undefined {
  const native = rawAndroid();
  if (!native) return undefined;
  return {
    onAppReady() {
      try {
        native.onAppReady?.();
      } catch {
        // Ignore bridge invocation errors outside Android WebView.
      }
    },
    setSystemBarTheme(backgroundHex, darkIcons) {
      try {
        native.setSystemBarTheme?.(backgroundHex, darkIcons);
      } catch {
        // Ignore bridge invocation errors.
      }
    },
    haptic(kind) {
      try {
        native.haptic?.(kind);
      } catch {
        // Ignore bridge invocation errors.
      }
    },
    pinWidget() {
      try {
        native.pinWidget?.();
      } catch {
        // Ignore bridge invocation errors.
      }
    },
    saveTextFile(filename, mimeType, content) {
      try {
        native.saveTextFile?.(filename, mimeType, content);
      } catch {
        // Ignore bridge invocation errors.
      }
    },
    hideKeyboard() {
      try {
        native.hideKeyboard?.();
      } catch {
        // Ignore bridge invocation errors.
      }
    },
    updateWidgetSnapshot(snapshot: AndroidWidgetSnapshot) {
      try {
        native.updateWidgetSnapshot?.(JSON.stringify(snapshot));
      } catch {
        // Ignore bridge invocation errors.
      }
    },
    openExternalUrl(url) {
      try {
        native.openExternalUrl?.(url);
      } catch {
        // Ignore bridge invocation errors.
      }
    },
  };
}

function normalizeLegacyEvent(
  raw: Record<string, unknown>,
  workspaceId: string,
): CalendarEvent {
  return {
    id: String(raw.id),
    workspaceId: String(raw.workspaceId || workspaceId),
    title: String(raw.title ?? ""),
    start: String(raw.start ?? ""),
    end: String(raw.end ?? ""),
    allDay: raw.allDay === true,
    notes: String(raw.notes ?? ""),
    location: String(raw.location ?? ""),
    url: String(raw.url ?? ""),
    color: (raw.color as CalendarEvent["color"]) ?? "purple",
    ...(raw.repeat && typeof raw.repeat === "object"
      ? { repeat: raw.repeat as CalendarEvent["repeat"] }
      : {}),
    typeId:
      typeof raw.typeId === "string" || raw.typeId === null ? raw.typeId : null,
    ...(typeof raw.timeZone === "string" && raw.timeZone
      ? { timeZone: raw.timeZone }
      : {}),
    ...(typeof raw.importKey === "string" && raw.importKey
      ? { importKey: raw.importKey }
      : {}),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    deletedAt: raw.deletedAt ? String(raw.deletedAt) : null,
    exceptions:
      raw.exceptions && typeof raw.exceptions === "object"
        ? (raw.exceptions as CalendarEvent["exceptions"])
        : {},
  };
}

export async function migrateAndroidLegacyData(
  database: SmokeNotesDatabase,
  cloud: SupabaseCloud | null,
  deviceId: string,
): Promise<boolean> {
  const native = rawAndroid();
  if (!native?.consumeLegacyMigration) return false;
  let raw: string;
  try {
    raw = native.consumeLegacyMigration() || "";
  } catch {
    return false;
  }
  if (!raw.trim()) return false;

  if (localStorage.getItem("smoke-notes:workspace-id")) {
    try {
      native.markLegacyMigrated?.();
    } catch {
      // Ignore bridge error.
    }
    return false;
  }

  let data: LegacyMigrationPayload;
  try {
    data = JSON.parse(raw) as LegacyMigrationPayload;
  } catch {
    return false;
  }
  if (!data?.workspaceId) return false;

  const now = new Date().toISOString();
  const stateMaps: Record<SyncEntity, Map<string, LegacyWorkspaceState>> = {
    notebook: new Map(
      (data.workspaceStates?.notebook ?? []).map((s) => [s.id, s]),
    ),
    note: new Map((data.workspaceStates?.note ?? []).map((s) => [s.id, s])),
    todo: new Map((data.workspaceStates?.todo ?? []).map((s) => [s.id, s])),
  };

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
      database.plannerSync,
      database.plannerConflicts,
    ],
    async () => {
      const putWorkspaceEntities = async (
        entity: SyncEntity,
        rows: Record<string, unknown>[],
      ) => {
        for (const row of rows) {
          if (!row?.id) continue;
          const mapped = mapRemoteRecord(entity, row);
          const state = stateMaps[entity].get(mapped.id);
          const hasPending = !!state?.operation || mapped.version === 0;
          const baseVersion =
            typeof state?.operation?.baseVersion === "number"
              ? state.operation.baseVersion
              : typeof state?.version === "number"
                ? state.version
                : 0;
          const stored = hasPending
            ? {
                ...mapped,
                version: Math.max(1, mapped.version, baseVersion + 1),
              }
            : mapped;

          if (entity === "notebook") {
            await database.notebooks.put(stored as Notebook);
          } else if (entity === "note") {
            await database.notes.put(stored as Note);
          } else {
            await database.todos.put(stored as Todo);
          }

          if (hasPending) {
            const op: SyncOperation = {
              id: state?.operation?.id || crypto.randomUUID(),
              deviceId,
              entity,
              entityId: stored.id,
              action: stored.deletedAt ? "delete" : "upsert",
              baseVersion,
              payload: { ...stored },
              attempts: 0,
              createdAt: now,
              nextAttemptAt: now,
            };
            await database.operations.put(op);
          }
        }
      };

      await putWorkspaceEntities("notebook", data.notebooks ?? []);
      await putWorkspaceEntities("note", data.notes ?? []);
      await putWorkspaceEntities("todo", data.todos ?? []);

      for (const row of data.events ?? []) {
        if (!row?.id) continue;
        await database.calendarEvents.put(
          normalizeLegacyEvent(row, data.workspaceId),
        );
      }

      for (const row of data.types ?? []) {
        if (!row?.id) continue;
        const item: PlannerType = {
          id: String(row.id),
          workspaceId: String(row.workspaceId || data.workspaceId),
          name: String(row.name ?? ""),
          color: (row.color as PlannerType["color"]) ?? "purple",
        };
        await database.plannerTypes.put(item);
      }

      for (const row of data.links ?? []) {
        if (!row?.id || !row?.todoId) continue;
        const item: TodoTypeLink = {
          id: String(row.id),
          workspaceId: String(row.workspaceId || data.workspaceId),
          todoId: String(row.todoId),
          typeId:
            typeof row.typeId === "string" || row.typeId === null
              ? row.typeId
              : null,
          ...(row.time !== undefined
            ? { time: row.time ? String(row.time) : null }
            : {}),
          ...(typeof row.importKey === "string" && row.importKey
            ? { importKey: row.importKey }
            : {}),
        };
        await database.todoTypeLinks.put(item);
      }

      for (const kind of ["type", "event", "link"] as const) {
        for (const state of data.plannerStates?.[kind] ?? []) {
          if (!state?.id) continue;
          const entry: PlannerSyncState = {
            key: `${data.workspaceId}:${kind}:${state.id}`,
            workspaceId: data.workspaceId,
            kind,
            id: state.id,
            version: Number(state.version ?? 0),
            snapshot: state.snapshot ?? null,
          };
          await database.plannerSync.put(entry);
        }
      }

      for (const conflict of data.conflicts ?? []) {
        const kind = conflict?.kind;
        if (
          kind === "event" ||
          kind === "type" ||
          kind === "link"
        ) {
          const item: PlannerConflict = {
            id: String(conflict.id || crypto.randomUUID()),
            workspaceId: data.workspaceId,
            kind,
            recordId: String(conflict.recordId ?? ""),
            local:
              (conflict.local as Record<string, unknown> | null) ?? null,
            remote:
              (conflict.remote as Record<string, unknown> | null) ?? null,
            createdAt: String(conflict.createdAt ?? now),
          };
          await database.plannerConflicts.put(item);
        }
      }
    },
  );

  localStorage.setItem("smoke-notes:workspace-id", data.workspaceId);
  if (!data.paired) {
    localStorage.setItem("smoke-notes:local-only", data.workspaceId);
  } else {
    localStorage.removeItem("smoke-notes:local-only");
  }

  if (
    data.paired &&
    cloud &&
    data.session?.access_token &&
    data.session?.refresh_token
  ) {
    try {
      await cloud.client.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    } catch {
      // If session token expired, normal anonymous/re-pairing flow handles it.
    }
  }

  try {
    native.markLegacyMigrated?.();
  } catch {
    // Ignore bridge error.
  }
  return true;
}

export async function buildAndroidBackupJson(
  database: SmokeNotesDatabase,
  workspaceId: string,
): Promise<string> {
  const notebooks = await database.notebooks
    .where("workspaceId")
    .equals(workspaceId)
    .toArray();
  const notebookIds = notebooks.map((book) => book.id);
  const notes = notebookIds.length
    ? await database.notes.where("notebookId").anyOf(notebookIds).toArray()
    : [];
  const [todos, events, types, links, conflicts] = await Promise.all([
    database.todos.where("workspaceId").equals(workspaceId).toArray(),
    database.calendarEvents.where("workspaceId").equals(workspaceId).toArray(),
    database.plannerTypes.where("workspaceId").equals(workspaceId).toArray(),
    database.todoTypeLinks.where("workspaceId").equals(workspaceId).toArray(),
    database.plannerConflicts
      .where("workspaceId")
      .equals(workspaceId)
      .toArray(),
  ]);
  return JSON.stringify(
    {
      format: "jotday-android-backup",
      version: 2,
      workspaceId,
      createdAt: new Date().toISOString(),
      notebook: notebooks,
      note: notes,
      todo: todos,
      event: events,
      type: types,
      link: links,
      conflicts,
    },
    null,
    2,
  );
}
