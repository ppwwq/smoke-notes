import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";

type Entity = "notebook" | "note" | "todo";
const tableFor: Record<Entity, string> = {
  notebook: "notebooks",
  note: "notes",
  todo: "todos",
};

function finiteRank(value: unknown): number {
  const rank = Number(value);
  if (!Number.isFinite(rank)) throw new Error("invalid_rank");
  return rank;
}

function text(value: unknown, max: number, fallback: string): string {
  const normalized = String(value ?? "").trim() || fallback;
  if (normalized.length > max) throw new Error("text_too_long");
  return normalized;
}

function bodyText(value: unknown): string {
  const normalized = String(value ?? "");
  if (normalized.length > 100000) throw new Error("text_too_long");
  return normalized;
}

const noteColors = new Set([
  "amber",
  "rose",
  "sage",
  "sky",
  "violet",
  "graphite",
]);

function noteColor(value: unknown): string {
  return typeof value === "string" && noteColors.has(value) ? value : "amber";
}

function noteKind(value: unknown): "note" | "todo" {
  return value === "todo" ? "todo" : "note";
}

function richContent(
  value: unknown,
  fallbackBody: string,
): Record<string, unknown> {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  const normalized =
    candidate?.type === "doc" && Array.isArray(candidate.content)
      ? candidate
      : {
          type: "doc",
          content: fallbackBody.split("\n").map((line) => ({
            type: "paragraph",
            ...(line ? { content: [{ type: "text", text: line }] } : {}),
          })),
        };
  if (JSON.stringify(normalized).length > 500000)
    throw new Error("content_too_large");
  return normalized;
}

function mapPayload(
  entity: Entity,
  payload: Record<string, unknown>,
  version: number,
) {
  const shared = {
    id: String(payload.id),
    rank: finiteRank(payload.rank),
    version,
    updated_at: new Date().toISOString(),
    deleted_at: payload.deletedAt || null,
  };
  if (entity === "notebook")
    return {
      ...shared,
      workspace_id: String(payload.workspaceId),
      name: text(payload.name, 80, "未命名便签本"),
    };
  if (entity === "note") {
    const body = bodyText(payload.body);
    return {
      ...shared,
      notebook_id: String(payload.notebookId),
      title: text(payload.title, 200, ""),
      body,
      content_json: richContent(payload.contentJson, body),
      color: noteColor(payload.color),
      kind: noteKind(payload.kind),
      conflict_of: payload.conflictOf || null,
    };
  }
  return {
    ...shared,
    workspace_id: String(payload.workspaceId),
    text: text(payload.text, 500, "新待办"),
    completed: payload.completed === true,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "authentication_required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const service = createClient(url, serviceKey);
    const auth = await userClient.auth.getUser();
    if (auth.error || !auth.data.user)
      return json({ error: "authentication_required" }, 401);

    const { operation } = await request.json();
    const entity = operation?.entity as Entity;
    if (
      !["notebook", "note", "todo"].includes(entity) ||
      !operation?.id ||
      !operation?.entityId ||
      operation?.payload?.id !== operation.entityId
    )
      return json({ error: "invalid_operation" }, 400);
    const prior = await service
      .from("applied_operations")
      .select("result")
      .eq("id", operation.id)
      .eq("user_id", auth.data.user.id)
      .maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) return json(prior.data.result);

    const payload = operation.payload as Record<string, unknown>;
    let workspaceId = entity === "note" ? null : String(payload.workspaceId);
    if (entity === "note") {
      const notebook = await service
        .from("notebooks")
        .select("workspace_id")
        .eq("id", payload.notebookId)
        .maybeSingle();
      workspaceId = notebook.data?.workspace_id ?? null;
    }
    if (!workspaceId) return json({ error: "workspace_missing" }, 400);
    const member = await service
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", auth.data.user.id)
      .maybeSingle();
    if (!member.data) return json({ error: "workspace_forbidden" }, 403);

    const table = tableFor[entity];
    const existing = await service
      .from(table)
      .select("*")
      .eq("id", operation.entityId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (
      existing.data &&
      entity !== "note" &&
      existing.data.workspace_id !== workspaceId
    ) {
      return json({ error: "workspace_forbidden" }, 403);
    }
    if (existing.data && entity === "note") {
      const originalNotebook = await service
        .from("notebooks")
        .select("workspace_id")
        .eq("id", existing.data.notebook_id)
        .maybeSingle();
      if (originalNotebook.data?.workspace_id !== workspaceId) {
        return json({ error: "workspace_forbidden" }, 403);
      }
    }
    const baseVersion = Number(operation.baseVersion);
    if (!Number.isInteger(baseVersion) || baseVersion < 0)
      return json({ error: "invalid_version" }, 400);
    if (existing.data && Number(existing.data.version) !== baseVersion) {
      const result = { status: "conflict", record: existing.data };
      await service
        .from("applied_operations")
        .insert({ id: operation.id, user_id: auth.data.user.id, result });
      return json(result, 200);
    }
    if (!existing.data && baseVersion !== 0)
      return json({ error: "missing_remote_record" }, 409);

    const row = mapPayload(
      entity,
      payload,
      existing.data ? Number(existing.data.version) + 1 : 1,
    );
    const saved = existing.data
      ? await service
          .from(table)
          .update(row)
          .eq("id", operation.entityId)
          .eq("version", baseVersion)
          .select("*")
          .maybeSingle()
      : await service.from(table).insert(row).select("*").single();
    if (saved.error) throw saved.error;
    if (!saved.data) return json({ error: "concurrent_change_retry" }, 409);
    const result = { status: "applied", record: saved.data };
    await service
      .from("applied_operations")
      .insert({ id: operation.id, user_id: auth.data.user.id, result });
    return json(result);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "mutation_failed" },
      400,
    );
  }
});
