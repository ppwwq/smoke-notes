export function validateReleaseConfig(
  env: Record<string, string | undefined>,
): void {
  for (const name of ["VITE_SUPABASE_URL", "VITE_WEB_APP_URL"]) {
    const value = env[name];
    if (!value) throw new Error(`Release build requires ${name}`);
    if (/YOUR_PROJECT|example\.invalid/i.test(value))
      throw new Error(`${name} contains a placeholder`);
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${name} must be an HTTPS URL`);
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname === "localhost"
    )
      throw new Error(`${name} must be an HTTPS URL without credentials`);
  }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key);
  if (!publicKey && key.split(".").length === 3) {
    try {
      publicKey =
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"))
          .role === "anon";
    } catch {
      publicKey = false;
    }
  }
  if (!publicKey)
    throw new Error(
      "Release build requires a publishable Supabase key; secret/service-role keys must never enter a desktop bundle",
    );
}
