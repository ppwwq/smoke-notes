/* global console, process */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "apps/web/dist");
const project = "smoke-notes-philipwwq";
const origin = `https://${project}.pages.dev`;
const args = process.argv.slice(2);
const verifyOnly = args.includes("--verify-only");
const cliIndex = args.indexOf("--wrangler");
const wrangler = cliIndex >= 0 ? args[cliIndex + 1] : process.env.WRANGLER_CLI;
if (!wrangler || !existsSync(wrangler)) {
  throw new Error(
    "Provide your installed wrangler.js with --wrangler <path> or WRANGLER_CLI.",
  );
}
const execute = (binary, commandArgs, cwd = root) =>
  execFileSync(binary, commandArgs, {
    cwd,
    windowsHide: true,
    timeout: 600_000,
    maxBuffer: 8 * 1024 * 1024,
    encoding: "utf8",
  });
const git = (...commandArgs) => execute("git", commandArgs).trim();
const runWrangler = (...commandArgs) =>
  execute(process.execPath, [resolve(wrangler), ...commandArgs]);
const sha = git("rev-parse", "HEAD");
if (git("branch", "--show-current") !== "main")
  throw new Error("Publish from main.");
const sourcePaths = [
  "apps/web",
  "packages/core",
  "packages/ui",
  "package.json",
  "pnpm-lock.yaml",
  "tools/deploy-web.mjs",
];
if (git("status", "--porcelain", "--", ...sourcePaths))
  throw new Error("Commit application source before publishing.");
if (git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0] !== sha)
  throw new Error("Push the reviewed main commit before publishing.");
const projects = JSON.parse(runWrangler("pages", "project", "list", "--json"));
const target = projects.find(
  (item) => item["Project Name"] === project || item.name === project,
);
if (!target)
  throw new Error(
    "Existing Pages project not found; this script never creates one.",
  );

if (!verifyOnly) {
  console.log(
    execute(
      process.execPath,
      [resolve(root, "node_modules/vite/bin/vite.js"), "build"],
      resolve(root, "apps/web"),
    ),
  );
  writeFileSync(resolve(dist, "release.json"), JSON.stringify({ sha }) + "\n");
} else if (
  JSON.parse(readFileSync(resolve(dist, "release.json"), "utf8")).sha !== sha
) {
  throw new Error(
    "The existing build does not match HEAD. Reconstruct it before verifying.",
  );
}
const allowed = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".webmanifest",
  ".png",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".txt",
]);
const files = [];
function collect(directory) {
  for (const name of readdirSync(directory)) {
    const file = resolve(directory, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || name.startsWith(".") || name === "functions")
      throw new Error(`Unexpected build path: ${name}`);
    if (stat.isDirectory()) collect(file);
    else {
      if (
        !allowed.has(extname(file)) ||
        ["_worker.js", "package.json"].includes(name)
      )
        throw new Error(`Unexpected build file: ${name}`);
      files.push(relative(dist, file).replaceAll("\\", "/"));
    }
  }
}
collect(dist);
if (!files.includes("index.html")) throw new Error("Web entry is missing.");
if (!verifyOnly)
  console.log(
    runWrangler(
      "pages",
      "deploy",
      dist,
      "--project-name",
      project,
      "--branch",
      "main",
      "--commit-hash",
      sha,
      "--commit-dirty=false",
    ),
  );
const deployments = JSON.parse(
  runWrangler(
    "pages",
    "deployment",
    "list",
    "--project-name",
    project,
    "--environment",
    "production",
    "--json",
  ),
);
const latest = deployments[0];
if (
  !latest ||
  latest.Environment !== "Production" ||
  latest.Branch !== "main" ||
  !/^([a-f0-9]{7}|[a-f0-9]{40})$/.test(latest.Source ?? "") ||
  !sha.startsWith(latest.Source)
) {
  throw new Error(
    "Latest production deployment does not match. Inspect it before retrying; do not blindly redeploy.",
  );
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const file of files) {
  const remote = execFileSync(
    "curl.exe",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      "30",
      "--retry",
      "2",
      "--retry-all-errors",
      "-H",
      "Cache-Control: no-cache",
      `${origin}/${file}?release=${sha}`,
    ],
    { windowsHide: true, timeout: 100_000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (digest(remote) !== digest(readFileSync(resolve(dist, file))))
    throw new Error(
      `Published bytes differ: ${file}. Inspect before retrying.`,
    );
}
const report = {
  origin,
  sha,
  deployment: latest.Id,
  matchedFiles: files.length,
  files,
  verifiedAt: new Date().toISOString(),
};
mkdirSync(resolve(root, "outputs/web-local-deploy"), { recursive: true });
writeFileSync(
  resolve(root, "outputs/web-local-deploy", `${sha}.json`),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({ ...report, files: undefined }, null, 2));
