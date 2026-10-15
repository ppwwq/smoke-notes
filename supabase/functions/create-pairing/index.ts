import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, sha256Hex } from "../_shared/http.ts";
import { rotatePairingCode } from "./rotate.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "authentication_required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user)
      return json({ error: "authentication_required" }, 401);

    const { workspaceId } = await request.json();
    const membership = await client
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (membership.error || !membership.data)
      return json({ error: "workspace_forbidden" }, 403);

    const webUrl = Deno.env.get("WEB_APP_URL");
    if (!webUrl) throw new Error("WEB_APP_URL is not configured");
    const pairingUrl = new URL(webUrl);
    const { code, expiresAt } = await rotatePairingCode(
      async () => {
        const random = new Uint32Array(1);
        crypto.getRandomValues(random);
        const code = String(random[0] % 1_000_000).padStart(6, "0");
        return { code, codeHash: await sha256Hex(code) };
      },
      (codeHash) =>
        client.rpc("rotate_pairing_code", {
          p_workspace_id: workspaceId,
          p_code_hash: codeHash,
        }),
    );

    pairingUrl.searchParams.set("pair", code);
    return json({ code, expiresAt, url: pairingUrl.toString() });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "pairing_failed" },
      400,
    );
  }
});
