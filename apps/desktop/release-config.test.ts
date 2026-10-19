import { describe, expect, it } from "vitest";
import { validateReleaseConfig } from "./release-config";

const valid = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwx",
  VITE_WEB_APP_URL: "https://notes.example.com",
};

describe("desktop release configuration", () => {
  it("rejects missing and example configuration instead of producing a sync-disabled release", () => {
    expect(() => validateReleaseConfig({})).toThrow(/VITE_SUPABASE_URL/);
    expect(() =>
      validateReleaseConfig({
        ...valid,
        VITE_SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
      }),
    ).toThrow(/placeholder/);
  });
  it("accepts only public browser credentials and HTTPS endpoints", () => {
    expect(() => validateReleaseConfig(valid)).not.toThrow();
    expect(() =>
      validateReleaseConfig({
        ...valid,
        VITE_WEB_APP_URL: "http://localhost:5173",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      validateReleaseConfig({
        ...valid,
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_should_never_be_embedded",
      }),
    ).toThrow(/publishable/);
    const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    expect(() =>
      validateReleaseConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: token }),
    ).toThrow(/publishable/);
    const publicToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    expect(() =>
      validateReleaseConfig({
        ...valid,
        VITE_SUPABASE_PUBLISHABLE_KEY: publicToken,
      }),
    ).not.toThrow();
  });
});
