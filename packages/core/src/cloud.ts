import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Note, Notebook, SyncEntity, Todo } from "./types";
import {
  normalizeNoteColor,
  normalizeNoteKind,
  normalizeRichTextDocument,
  richTextToPlainText,
} from "./note-content";
import type {
  PushResult,
  RemoteChange,
  RemoteRecord,
  RemoteSyncAdapter,
} from "./sync";

export interface CloudConfig {
  url: string;
  publishableKey: string;
  webUrl: string;
}

export interface PairingDetails {
  code: string;
  expiresAt: string;
  url: string;
}

export function normalizePairingCode(input: string): string | null {
  const normalized = input.replace(/\s/g, "");
  return /^\d{6}$/.test(normalized) ? normalized : null;
}

export function pairingCodeFromUrl(url: string): string | null {
  try {
    return normalizePairingCode(new URL(url).searchParams.get("pair") ?? "");
  } catch {
    return null;
  }
}

export function mapRemoteRecord(
  entity: "notebook",
  row: Record<string, unknown>,
): Notebook;
export function mapRemoteRecord(
  entity: "note",
  row: Record<string, unknown>,
): Note;
export function mapRemoteRecord(
  entity: "todo",
  row: Record<string, unknown>,
): Todo;
export function mapRemoteRecord(
  entity: SyncEntity,
  row: Record<string, unknown>,
): RemoteRecord;
export function mapRemoteRecord(
  entity: SyncEntity,
  row: Record<string, unknown>,
): RemoteRecord {
  const shared = {
    id: String(row.id),
    version: Number(row.version),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    rank: Number(row.rank),
  };
  if (entity === "notebook") {
    return {
      ...shared,
      workspaceId: String(row.workspace_id),
      name: String(row.name),
    };
  }
  if (entity === "note") {
    const contentJson = normalizeRichTextDocument(
      row.content_json,
      String(row.body ?? ""),
    );
    return {
      ...shared,
      notebookId: String(row.notebook_id),
      kind: normalizeNoteKind(row.kind),
      title: String(row.title),
      contentJson,
      body: richTextToPlainText(contentJson),
      color: normalizeNoteColor(row.color),
      conflictOf: row.conflict_of ? String(row.conflict_of) : null,
    };
  }
  return {
    ...shared,
    workspaceId: String(row.workspace_id),
    text: String(row.text),
    completed: row.completed === true,
  };
}

class SupabaseSyncAdapter implements RemoteSyncAdapter {
  constructor(private readonly client: SupabaseClient) {}

  async push(
    operation: Parameters<RemoteSyncAdapter["push"]>[0],
  ): Promise<PushResult> {
    const { data, error } = await this.client.functions.invoke(
      "apply-mutation",
      {
        body: { operation },
      },
    );
    if (error) throw error;
    if (data?.status === "conflict" && data.record) {
      return {
        status: "conflict",
        record: mapRemoteRecord(
          operation.entity,
          data.record as Record<string, unknown>,
        ),
      };
    }
    return { status: "applied" };
  }

  async pull(
    cursor: string | null,
  ): Promise<{ changes: RemoteChange[]; cursor: string }> {
    const startedAt = new Date().toISOString();
    const since = cursor ?? "1970-01-01T00:00:00.000Z";
    const [notebooks, notes, todos] = await Promise.all([
      this.client.from("notebooks").select("*").gt("updated_at", since),
      this.client.from("notes").select("*").gt("updated_at", since),
      this.client.from("todos").select("*").gt("updated_at", since),
    ]);
    const firstError = notebooks.error ?? notes.error ?? todos.error;
    if (firstError) throw firstError;
    return {
      cursor: startedAt,
      changes: [
        ...(notebooks.data ?? []).map((row) => ({
          entity: "notebook" as const,
          record: mapRemoteRecord("notebook", row),
        })),
        ...(notes.data ?? []).map((row) => ({
          entity: "note" as const,
          record: mapRemoteRecord("note", row),
        })),
        ...(todos.data ?? []).map((row) => ({
          entity: "todo" as const,
          record: mapRemoteRecord("todo", row),
        })),
      ],
    };
  }
}

export class SupabaseCloud {
  readonly client: SupabaseClient;
  readonly syncAdapter: RemoteSyncAdapter;

  constructor(private readonly config: CloudConfig) {
    this.client = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    this.syncAdapter = new SupabaseSyncAdapter(this.client);
  }

  async ensureAnonymousSession(): Promise<string> {
    const current = await this.client.auth.getSession();
    if (current.error) throw current.error;
    if (current.data.session?.user.id) return current.data.session.user.id;
    const created = await this.client.auth.signInAnonymously();
    if (created.error || !created.data.user)
      throw created.error ?? new Error("Unable to create device session");
    return created.data.user.id;
  }

  async bootstrapWorkspace(): Promise<string> {
    await this.ensureAnonymousSession();
    const { data, error } = await this.client.rpc("bootstrap_workspace");
    if (error || !data) throw error ?? new Error("Unable to create workspace");
    return String(data);
  }

  async createPairing(workspaceId: string): Promise<PairingDetails> {
    await this.ensureAnonymousSession();
    const { data, error } = await this.client.functions.invoke(
      "create-pairing",
      {
        body: { workspaceId, webUrl: this.config.webUrl },
      },
    );
    if (error || !data?.code)
      throw error ?? new Error("Unable to create pairing code");
    return {
      code: String(data.code),
      expiresAt: String(data.expiresAt),
      url: String(data.url),
    };
  }

  async redeemPairing(input: string): Promise<string> {
    const code = normalizePairingCode(input);
    if (!code) throw new Error("请输入 6 位配对码");
    await this.ensureAnonymousSession();
    const { data, error } = await this.client.functions.invoke(
      "redeem-pairing",
      { body: { code } },
    );
    if (error || !data?.workspaceId)
      throw error ?? new Error("配对码无效或已过期");
    return String(data.workspaceId);
  }

  subscribe(onChange: (change: RemoteChange) => void): () => void {
    const channel = this.client.channel("smoke-notes-changes");
    const tables: Array<[SyncEntity, string]> = [
      ["notebook", "notebooks"],
      ["note", "notes"],
      ["todo", "todos"],
    ];
    for (const [entity, table] of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          const row = (
            payload.new && Object.keys(payload.new).length
              ? payload.new
              : payload.old
          ) as Record<string, unknown>;
          if (row?.id)
            onChange({ entity, record: mapRemoteRecord(entity, row) });
        },
      );
    }
    void channel.subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }
}
