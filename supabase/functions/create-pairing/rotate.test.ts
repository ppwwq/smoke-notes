import { describe, expect, it, vi } from "vitest";
import { rotatePairingCode } from "./rotate";

describe("atomic pairing rotation", () => {
  const expiresAt = "2026-10-15T06:05:00Z";
  const collision = {
    data: null,
    error: { code: "23505", message: "duplicate" },
  };

  it("generates a new code on collisions and returns the server expiry", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ code: "123456", codeHash: "old-hash" })
      .mockResolvedValueOnce({ code: "654321", codeHash: "new-hash" });
    const rotate = vi
      .fn()
      .mockResolvedValueOnce(collision)
      .mockResolvedValueOnce({ data: expiresAt, error: null });
    await expect(rotatePairingCode(generate, rotate)).resolves.toEqual({
      code: "654321",
      expiresAt,
    });
    expect(rotate.mock.calls).toEqual([["old-hash"], ["new-hash"]]);
  });

  it("bounds retries when historical codes keep colliding", async () => {
    const generate = vi.fn(async () => ({ code: "123456", codeHash: "hash" }));
    const rotate = vi.fn(async () => collision);
    await expect(rotatePairingCode(generate, rotate)).rejects.toThrow(
      "retry_exhausted",
    );
    expect(generate).toHaveBeenCalledTimes(10);
    expect(rotate).toHaveBeenCalledTimes(10);
  });

  it("does not retry permission or database failures", async () => {
    const generate = vi.fn(async () => ({ code: "123456", codeHash: "hash" }));
    const rotate = vi.fn(async () => ({
      data: null,
      error: { code: "P0001", message: "workspace_forbidden" },
    }));
    await expect(rotatePairingCode(generate, rotate)).rejects.toThrow(
      "workspace_forbidden",
    );
    expect(rotate).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, "invalid"])(
    "rejects malformed RPC success %j",
    async (data) => {
      await expect(
        rotatePairingCode(
          async () => ({ code: "123456", codeHash: "hash" }),
          async () => ({ data, error: null }),
        ),
      ).rejects.toThrow("invalid_pairing_response");
    },
  );
});
