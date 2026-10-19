import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { validateReleaseConfig } from "./release-config";

export default defineConfig(({ mode }) => {
  const envRoot = fileURLToPath(new URL("../../", import.meta.url));
  if (mode === "release")
    validateReleaseConfig(loadEnv(mode, envRoot, "VITE_"));
  return {
    envDir:
      mode === "preview"
        ? false
        : fileURLToPath(new URL("../../", import.meta.url)),
    base: "./",
    plugins: [react()],
    server: {
      watch: {
        ignored: [
          "**/release",
          "**/release/**",
          "**/release-*",
          "**/release-*/**",
          "**/dist-electron",
          "**/dist-electron/**",
        ],
      },
    },
    build: { outDir: "dist", emptyOutDir: true },
  };
});
