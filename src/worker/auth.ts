import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Env } from "./env";

/** `signedInAs` is set when the trial switcher lets the signed-in person act as `email`. */
export type Identity = { kind: "member"; email: string; signedInAs?: string } | { kind: "backup" };
export type AuthResult = { ok: true; identity: Identity } | { ok: false; status: 401 | 403; error: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const jwksCache = new Map<string, JWTVerifyGetKey>();

function remoteKeys(teamDomain: string): JWTVerifyGetKey {
  let keys = jwksCache.get(teamDomain);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, keys);
  }
  return keys;
}

/** Verify a Cloudflare Access JWT. Exported separately so tests can supply local keys. */
export async function verifyAccessJwt(
  token: string,
  keys: JWTVerifyGetKey,
  opts: { teamDomain: string; aud: string; backupClientId?: string },
): Promise<AuthResult> {
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: `https://${opts.teamDomain}`, audience: opts.aud });
    if (typeof payload.email === "string" && payload.email) return { ok: true, identity: { kind: "member", email: payload.email } };
    if (opts.backupClientId && payload.common_name === opts.backupClientId) return { ok: true, identity: { kind: "backup" } };
    return { ok: false, status: 403, error: "Token has no email" };
  } catch {
    return { ok: false, status: 401, error: "Invalid Access token" };
  }
}

/**
 * Production: identity comes only from a verified Cloudflare Access JWT. While TRIAL_SWITCHER is on, a signed-in
 * person may act as another teammate with the x-dev-user header (the index middleware only allows existing members).
 * Local dev: DEV_USER (or the x-dev-user header) is honoured, but only on localhost.
 * `keys` is for tests; production fetches the team's public keys.
 */
export async function resolveIdentity(req: Request, env: Env, keys?: JWTVerifyGetKey): Promise<AuthResult> {
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const token = req.headers.get("cf-access-jwt-assertion");
    if (!token) return { ok: false, status: 401, error: "Sign in through Cloudflare Access" };
    const res = await verifyAccessJwt(token, keys ?? remoteKeys(env.ACCESS_TEAM_DOMAIN), {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      aud: env.ACCESS_AUD,
      backupClientId: env.BACKUP_CLIENT_ID,
    });
    const as = req.headers.get("x-dev-user")?.trim().toLowerCase();
    if (res.ok && res.identity.kind === "member" && env.TRIAL_SWITCHER === "on" && as && as !== res.identity.email.toLowerCase())
      return { ok: true, identity: { kind: "member", email: as, signedInAs: res.identity.email } };
    return res;
  }
  const host = new URL(req.url).hostname;
  if (env.DEV_USER && LOCAL_HOSTS.has(host)) {
    const email = req.headers.get("x-dev-user") || env.DEV_USER;
    return { ok: true, identity: { kind: "member", email } };
  }
  return { ok: false, status: 401, error: "Auth is not configured: set ACCESS_TEAM_DOMAIN and ACCESS_AUD" };
}
