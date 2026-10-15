type RotationResult = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

export async function rotatePairingCode(
  generate: () => Promise<{ code: string; codeHash: string }>,
  rotate: (codeHash: string) => PromiseLike<RotationResult>,
) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { code, codeHash } = await generate();
    const { data, error } = await rotate(codeHash);
    if (error?.code === "23505") continue;
    if (error) throw new Error(error.message);
    if (typeof data !== "string" || !Number.isFinite(Date.parse(data))) {
      throw new Error("invalid_pairing_response");
    }
    return { code, expiresAt: data };
  }
  throw new Error("pairing_code_collision_retry_exhausted");
}
