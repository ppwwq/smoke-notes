import assert from "node:assert/strict";
import test from "node:test";
import { assetPaths, project, validatePublicKey } from "./release.mjs";

const jwt = (role, ref) =>
  `header.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.signature`;

test("frontend accepts public keys but rejects privileged and mismatched JWTs", () => {
  validatePublicKey("sb_publishable_example_public_key");
  validatePublicKey(jwt("anon", project));
  for (const key of [
    jwt("service_role", project),
    jwt("anon", "other-project"),
    "sb_secret_example",
    "",
    undefined,
  ]) {
    assert.throws(() => validatePublicKey(key));
  }
});

test("live verification requires built JS and rejects path traversal", () => {
  assert.deepEqual(
    assetPaths(
      '<script src="/assets/index-abc.js"></script><link href="/assets/index-abc.css">',
    ),
    ["/assets/index-abc.js", "/assets/index-abc.css"],
  );
  assert.throws(() => assetPaths("<html>old release</html>"));
  assert.throws(() =>
    assetPaths('<script src="/assets/../../secret.js"></script>'),
  );
});
