import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["electron/main.ts", "electron/preload.ts"],
  format: ["cjs"],
  outDir: "dist-electron",
  clean: true,
  platform: "node",
  target: "node20",
  external: ["electron"],
  noExternal: ["@smoke-notes/core"],
});
