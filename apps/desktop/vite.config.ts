import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  envDir: fileURLToPath(new URL("../../", import.meta.url)),
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
});
