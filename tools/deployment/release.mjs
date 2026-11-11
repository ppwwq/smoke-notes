import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const project = "koundrkjeambrcodxkdd";
const account = "86eac8fedb92cf5e11c160669b5605b7";
const pagesProject = "smoke-notes-philipwwq";
const site = `https://${pagesProject}.pages.dev`;
const api = `https://${project}.supabase.co`;
const functions = ["apply-mutation", "create-pairing", "redeem-pairing"];
const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = join(root, "apps/web/dist");
const statePath = join(
  process.env.RUNNER_TEMP || root,
  "smoke-function-versions.json",
);
const hash = (data) => createHash("sha256").update(data).digest("hex");

function required(name) {
  const value = process.env[name];
  assert(value, `Missing ${name}`);
  return value;
}

export function validatePublicKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key || "")) return;
  // Legacy anon JWTs are public client configuration. Never accept service_role.
  let payload;
  try {
    payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    );
  } catch {
    throw new Error("Invalid public Supabase client key");
  }
  assert(
    payload.role === "anon" && payload.ref === project,
    "Client JWT must be anon and belong to the approved project",
  );
}

function checkConfig() {
  assert.equal(required("VITE_SUPABASE_URL"), api, "Unexpected Supabase URL");
  assert.equal(required("VITE_WEB_APP_URL"), site, "Unexpected production URL");
  assert.equal(
    required("CLOUDFLARE_ACCOUNT_ID"),
    account,
    "Unexpected Cloudflare account",
  );
  validatePublicKey(required("VITE_SUPABASE_PUBLISHABLE_KEY"));
}

async function request(url, token) {
  const response = await fetch(url, {
    headers: token
      ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
      : {},
    signal: AbortSignal.timeout(30000),
  });
  assert(response.ok, `Cloud metadata request failed (${response.status})`);
  return response.json(); // Never log provider response bodies, tokens or key material.
}

async function checkMain() {
  assert.equal(required("GITHUB_REPOSITORY"), "ppwwq/smoke-notes");
  assert.equal(required("GITHUB_REF"), "refs/heads/main");
  const sha = required("GITHUB_SHA");
  assert(/^[0-9a-f]{40}$/.test(sha), "Invalid release SHA");
  const main = await request(
    "https://api.github.com/repos/ppwwq/smoke-notes/git/ref/heads/main",
    required("GH_TOKEN"),
  );
  assert.equal(main.object.sha, sha, "Release is stale: main has advanced");
}

async function functionMetadata(name) {
  return request(
    `https://api.supabase.com/v1/projects/${project}/functions/${name}`,
    required("SUPABASE_ACCESS_TOKEN"),
  );
}

async function preflight() {
  await checkMain();
  checkConfig();
  const supabase = await request(
    `https://api.supabase.com/v1/projects/${project}`,
    required("SUPABASE_ACCESS_TOKEN"),
  );
  assert.equal(supabase.id, project, "Unexpected Supabase project");
  assert.equal(
    supabase.status,
    "ACTIVE_HEALTHY",
    "Supabase project is not healthy",
  );
  const cloudflare = await request(
    `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${pagesProject}`,
    required("CLOUDFLARE_API_TOKEN"),
  );
  assert(cloudflare.success, "Cloudflare project lookup failed");
  assert.equal(cloudflare.result.name, pagesProject);
  assert.equal(
    cloudflare.result.production_branch,
    "main",
    "Unexpected Pages production branch",
  );
  const versions = {};
  for (const name of functions) {
    const current = await functionMetadata(name);
    assert(Number.isInteger(current.version), "Missing function version");
    assert.equal(current.status, "ACTIVE", "Existing function is not active");
    versions[name] = current.version;
  }
  writeFileSync(statePath, JSON.stringify(versions));
  console.log(
    "Approved cloud targets, current main and existing functions verified",
  );
}

function run(program, args, secretNames) {
  // Each child receives only the credentials it needs; raw output is withheld.
  const env = { ...process.env };
  for (const name of [
    "GH_TOKEN",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_URL",
    "CLOUDFLARE_API_TOKEN",
  ]) {
    if (!secretNames.includes(name)) delete env[name];
  }
  const result = spawnSync(program, args, {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 600000,
  });
  assert(
    result.status === 0 && !result.error,
    `${program} failed; output withheld to protect credentials`,
  );
}

async function retry(check) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await check();
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((done) => setTimeout(done, 5000));
    }
  }
}

async function checkFunctionHttp(name) {
  const url = `${api}/functions/v1/${name}`;
  const options = await fetch(url, {
    method: "OPTIONS",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(options.status, 200, `${name}: OPTIONS failed`);
  assert.equal(
    options.headers.get("access-control-allow-origin"),
    "*",
    `${name}: CORS failed`,
  );
  const denied = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(
    denied.status,
    401,
    `${name}: unauthenticated request was not rejected`,
  );
  const body = await denied.json();
  assert.equal(
    body.error,
    "authentication_required",
    `${name}: unexpected authentication response`,
  );
}

async function deployFunctions() {
  await checkMain();
  const versions = JSON.parse(readFileSync(statePath, "utf8"));
  for (const name of functions) {
    assert(
      Number.isInteger(versions[name]),
      "Missing preflight function version",
    );
    run(
      "supabase",
      ["functions", "deploy", name, "--project-ref", project, "--use-api"],
      ["SUPABASE_ACCESS_TOKEN"],
    );
    await retry(async () => {
      const deployed = await functionMetadata(name);
      assert(
        deployed.version > versions[name],
        `${name}: no new version observed`,
      );
      assert.equal(
        deployed.status,
        "ACTIVE",
        `${name}: deployed version is not active`,
      );
      assert.equal(
        deployed.verify_jwt,
        false,
        `${name}: unexpected gateway JWT configuration`,
      );
      await checkFunctionHttp(name);
    });
    console.log(
      `${name}: new active version, CORS and authentication boundary verified`,
    );
  }
}

export function assetPaths(html) {
  const paths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(
    (match) => match[1],
  );
  assert(
    paths.some((path) => path.endsWith(".js")),
    "No built JavaScript asset found",
  );
  assert(
    paths.every((path) => /^\/assets\/[A-Za-z0-9_.-]+$/.test(path)),
    "Unsafe asset path",
  );
  return [...new Set(paths)];
}

function stamp() {
  const sha = required("GITHUB_SHA");
  assert(/^[0-9a-f]{40}$/.test(sha), "Invalid release SHA");
  const html = readFileSync(join(dist, "index.html"));
  const files = Object.fromEntries(
    ["/index.html", ...assetPaths(html.toString())].map((path) => [
      path,
      hash(readFileSync(join(dist, path))),
    ]),
  );
  writeFileSync(
    join(dist, "release-info.json"),
    JSON.stringify({ commit: sha, files }, null, 2) + "\n",
  );
  console.log(`Release stamped for ${sha}`);
}

async function deployPages() {
  await checkMain();
  const expected = JSON.parse(
    readFileSync(join(dist, "release-info.json"), "utf8"),
  );
  assert.equal(
    expected.commit,
    required("GITHUB_SHA"),
    "Build and release SHA differ",
  );
  run(
    "wrangler",
    [
      "pages",
      "deploy",
      "apps/web/dist",
      "--project-name",
      pagesProject,
      "--branch",
      "main",
      "--commit-hash",
      expected.commit,
      "--commit-dirty=false",
    ],
    ["CLOUDFLARE_API_TOKEN"],
  );
  await retry(async () => {
    const live = await request(
      `${site}/release-info.json?release=${expected.commit}`,
    );
    assert.equal(
      live.commit,
      expected.commit,
      "Live production release SHA differs",
    );
    for (const [path, digest] of Object.entries(expected.files)) {
      const response = await fetch(
        `${site}${path}?release=${expected.commit}`,
        { signal: AbortSignal.timeout(15000) },
      );
      assert(response.ok, "Live artifact request failed");
      assert.equal(
        hash(Buffer.from(await response.arrayBuffer())),
        digest,
        `Live artifact differs: ${path}`,
      );
    }
  });
  console.log(`Verified production ${site} at ${expected.commit}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const operations = {
      "check-config": checkConfig,
      "check-main": checkMain,
      preflight,
      stamp,
      functions: deployFunctions,
      pages: deployPages,
    };
    assert(
      Object.hasOwn(operations, process.argv[2]),
      "Unknown release operation",
    );
    await operations[process.argv[2]]();
  } catch (error) {
    // Assertions can include actual response objects; only emit our fixed message.
    console.error(
      error instanceof assert.AssertionError
        ? error.message.split("\n")[0]
        : "Release step failed; details withheld",
    );
    process.exitCode = 1;
  }
}
