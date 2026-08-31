import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, sha256Hex } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "authentication_required" }, 401);
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
      },
    );
    const { code } = await request.json();
    if (!/^\d{6}$/.test(String(code)))
      return json({ error: "invalid_code" }, 400);
    const { data, error } = await client.rpc("redeem_pairing_code", {
      p_code_hash: await sha256Hex(String(code)),
    });
    if (error || !data)
      return json({ error: error?.message ?? "invalid_or_expired_code" }, 400);
    return json({ workspaceId: data });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "pairing_failed" },
      400,
    );
  }
});
