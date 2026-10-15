import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";

type Entity = "notebook" | "note" | "todo";

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

function mapPayload(entity: Entity, payload: Record<string, unknown>) {
  const shared = {
    id: String(payload.id),
    rank: finiteRank(payload.rank),
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
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
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
    const payload = operation.payload as Record<string, unknown>;
    const baseVersion = Number(operation.baseVersion);
    if (!Number.isInteger(baseVersion) || baseVersion < 0)
      return json({ error: "invalid_version" }, 400);
    // The row change and retry receipt must commit together. Otherwise a lost
    // response can turn a successful save into a conflict on the next attempt.
    const { data, error } = await userClient.rpc("apply_workspace_mutation", {
      p_operation_id: operation.id,
      p_entity: entity,
      p_entity_id: operation.entityId,
      p_base_version: baseVersion,
      p_row: mapPayload(entity, payload),
    });
    if (error) {
      const status =
        error.message === "workspace_forbidden"
          ? 403
          : error.message === "missing_remote_record"
            ? 409
            : 400;
      return json({ error: error.message }, status);
    }
    return json(data);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "mutation_failed" },
      400,
    );
  }
});
