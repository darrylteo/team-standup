import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyAccessJwt } from "../../src/worker/auth";

const opts = { teamDomain: "lab.cloudflareaccess.com", aud: "aud-123", backupClientId: "backup.access" };

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, o: { aud?: string; key?: CryptoKey } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://${opts.teamDomain}`)
      .setAudience(o.aud ?? opts.aud)
      .setExpirationTime("5m")
      .sign(o.key ?? privateKey);
  return { keys, sign };
}

describe("Cloudflare Access JWT", () => {
  it("accepts a valid token and returns the email", async () => {
    const { keys, sign } = await setup();
    expect(await verifyAccessJwt(await sign({ email: "mei@example.edu" }), keys, opts)).toEqual({
      ok: true,
      identity: { kind: "member", email: "mei@example.edu" },
    });
  });
  it("rejects a token for another Access application", async () => {
    const { keys, sign } = await setup();
    expect((await verifyAccessJwt(await sign({ email: "a@b.c" }, { aud: "other" }), keys, opts)).ok).toBe(false);
  });
  it("rejects a token signed by someone else", async () => {
    const { keys, sign } = await setup();
    const forger = await generateKeyPair("RS256");
    expect((await verifyAccessJwt(await sign({ email: "a@b.c" }, { key: forger.privateKey }), keys, opts)).ok).toBe(false);
  });
  it("maps the backup service token, and nothing else without an email", async () => {
    const { keys, sign } = await setup();
    expect(await verifyAccessJwt(await sign({ common_name: "backup.access" }), keys, opts)).toEqual({ ok: true, identity: { kind: "backup" } });
    expect((await verifyAccessJwt(await sign({ common_name: "other" }), keys, opts)).ok).toBe(false);
  });
});
