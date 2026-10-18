import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Isolated review build: no cloud config, no authentication, no service worker.
// The production entry point and its database/connection contracts are untouched.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-review",
    emptyOutDir: true,
    rolldownOptions: { input: "review.html" },
  },
});
