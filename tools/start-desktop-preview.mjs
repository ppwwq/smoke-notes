import { spawn } from "node:child_process";
import console from "node:console";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";

const desktop = fileURLToPath(new URL("../apps/desktop/", import.meta.url));
const require = createRequire(join(desktop, "package.json"));
// Resolve metadata only: requiring Electron's index can trigger a binary download.
const installed = dirname(require.resolve("electron/package.json"));
const executable =
  process.env.SMOKENOTES_ELECTRON ?? join(installed, "dist", "electron.exe");
if (!existsSync(executable)) {
  throw new Error(
    "没有可用的本地 Electron。请把 SMOKENOTES_ELECTRON 指向已安装的 electron.exe；预览不会下载或安装软件。",
  );
}
const child = spawn(executable, [desktop, "--preview"], {
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
