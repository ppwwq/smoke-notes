import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The iOS host loads its bundled assets on a fixed local origin.
export default defineConfig({
  base: "./",
  envDir: fileURLToPath(new URL("../../", import.meta.url)),
  plugins: [react()],
  define: { "import.meta.env.JOTDAY_IOS_HOST": JSON.stringify("true") },
  build: {
    outDir: fileURLToPath(
      new URL("../ios/Sources/Jotday/Web", import.meta.url),
    ),
    emptyOutDir: true,
  },
});
