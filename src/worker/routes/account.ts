import { Hono, type Context } from "hono";
import { AVATAR_BACKGROUNDS, isThemeKey } from "../../shared/catalog";
import { addDays, isValidDate, sgtToday } from "../../shared/dates";
import type { ProjectSummary } from "../../shared/types";
import { cleanFlairs, cleanProjectText, HANDLE_RE } from "../../shared/validate";
import { account, body } from "../ctx";
import { inviteCode } from "../db";
import type { AppEnv } from "../env";
import { imageResponse, MAX_PHOTO_BYTES, readImage, toBase64 } from "../photo";
import { toAway } from "./calendar";

/** Routes about the signed-in person rather than one project: profile, photos, and the project list. */
export const accounts = new Hono<AppEnv>();

/** Avatar parts are short keys into the renderer's catalog; anything else is dropped. */
function cleanAvatar(raw: unknown): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const key = /^[a-zA-Z]{1,16}$/;
  const val = /^[a-z0-9_]{1,24}$/;
  for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>).slice(0, 16)) {
    if (!key.test(k)) continue;
    if (typeof v === "string" && val.test(v)) out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string" && val.test(x)).slice(0, 6);
  }
  return out;
}

/** Who I am and every project I'm in, with unread counts for the switcher. */
accounts.get("/session", async (c) => {
  if (!c.get("account")) return c.json({ error: "Sign in to see projects" }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.title, p.subtitle, p.palette AS theme, p.invite_code, s.role, s.is_admin,
       (SELECT COUNT(*) FROM notifications n WHERE n.project_id = p.id AND n.member_id = s.member_id AND n.read_at IS NULL) AS unread,
       (SELECT COUNT(*) FROM memberships x WHERE x.project_id = p.id AND x.active = 1) AS members
     FROM memberships s JOIN projects p ON p.id = s.project_id
     WHERE s.member_id = ? AND s.active = 1 ORDER BY p.created_at, p.id`,
  )
    .bind(account(c).id)
    .all();
  const projects: ProjectSummary[] = results.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    subtitle: r.subtitle as string,
    theme: r.theme as ProjectSummary["theme"],
    ...(r.is_admin ? { invite_code: r.invite_code as string } : {}),
    role: r.role as ProjectSummary["role"],
    is_admin: !!r.is_admin,
    unread: r.unread as number,
    members: r.members as number,
  }));
  return c.json({ account: account(c), projects, today: sgtToday(), switcher: c.env.TRIAL_SWITCHER === "on", signed_in_as: c.get("signedInAs") });
});

/** Start a project. The creator is its first admin and can invite others with the code. */
accounts.post("/projects", async (c) => {
  const b = await body(c);
  const text = cleanProjectText(b);
  if (typeof text === "string") return c.json({ error: text }, 400);
  if (!text.title) return c.json({ error: "Give the project a title" }, 400);
  const theme = isThemeKey(b.theme) ? b.theme : "terminal";
  const db = c.env.DB;
  const p = await db
    .prepare("INSERT INTO projects (title, subtitle, palette, invite_code, created_by) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(text.title, text.subtitle ?? "", theme, inviteCode(), account(c).id)
    .first<{ id: number }>();
  await db.batch([
    db.prepare("INSERT INTO memberships (project_id, member_id, role, is_admin) VALUES (?, ?, ?, 1)").bind(p!.id, account(c).id, b.role === "prof" ? "prof" : "researcher"),
    db.prepare("INSERT INTO admin_log (project_id, actor_id, action, details) VALUES (?, ?, 'create_project', ?)").bind(p!.id, account(c).id, JSON.stringify({ title: text.title })),
  ]);
  return c.json({ id: p!.id }, 201);
});

/** Join with an invite code (case and spaces don't matter). Rejoining after leaving restores the old membership. */
accounts.post("/projects/join", async (c) => {
  const { code } = await body<{ code?: string }>(c);
  const clean = typeof code === "string" ? code.replace(/[\s-]/g, "").toUpperCase() : "";
  const p = clean ? await c.env.DB.prepare("SELECT id, title FROM projects WHERE invite_code = ?").bind(clean).first<{ id: number; title: string }>() : null;
  if (!p) return c.json({ error: "That invite code doesn't match a project. Check it with the person who sent it." }, 404);
  const db = c.env.DB;
  const cur = await db.prepare("SELECT active FROM memberships WHERE project_id = ? AND member_id = ?").bind(p.id, account(c).id).first<{ active: number }>();
  if (cur?.active) return c.json({ id: p.id, title: p.title, already: true });
  const sort = await db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM memberships WHERE project_id = ?").bind(p.id).first<{ n: number }>();
  await db.batch([
    cur
      ? db.prepare("UPDATE memberships SET active = 1, deleted_at = NULL WHERE project_id = ? AND member_id = ?").bind(p.id, account(c).id)
      : db.prepare("INSERT INTO memberships (project_id, member_id, sort) VALUES (?, ?, ?)").bind(p.id, account(c).id, sort?.n ?? 0),
    db.prepare("INSERT INTO admin_log (project_id, actor_id, action, details) VALUES (?, ?, 'join_with_code', ?)").bind(p.id, account(c).id, JSON.stringify({ email: account(c).email })),
    // Admins hear about new arrivals, the way a group chat shows "joined using the invite link".
    db
      .prepare(
        `INSERT INTO notifications (project_id, member_id, kind, actor_id, payload)
         SELECT ?1, member_id, 'joined', ?2, '{}' FROM memberships WHERE project_id = ?1 AND is_admin = 1 AND active = 1 AND member_id != ?2`,
      )
      .bind(p.id, account(c).id),
  ]);
  return c.json({ id: p.id, title: p.title }, 201);
});

accounts.patch("/account/profile", async (c) => {
  const b = await body(c);
  const cur = account(c);
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 40) : cur.name;
  let handle = cur.handle;
  if ("handle" in b) {
    const h = typeof b.handle === "string" ? b.handle.trim().replace(/^@/, "").toLowerCase() : "";
    if (h && !HANDLE_RE.test(h)) return c.json({ error: "Handles use 2–20 lowercase letters, numbers or _" }, 400);
    if (h) {
      const taken = await c.env.DB.prepare("SELECT id FROM members WHERE handle = ? AND id != ?").bind(h, cur.id).first();
      if (taken) return c.json({ error: `@${h} is already taken` }, 409);
    }
    handle = h || null;
  }
  const avatar = "avatar" in b ? cleanAvatar(b.avatar) : cur.avatar;
  const profile = {
    flairs: "flairs" in b ? cleanFlairs(b.flairs) : cur.profile.flairs,
    avatarBg: (AVATAR_BACKGROUNDS as readonly string[]).includes(b.avatarBg as string) ? (b.avatarBg as string) : cur.profile.avatarBg,
    theme: "theme" in b ? (b.theme === "light" || b.theme === "dark" ? b.theme : null) : cur.profile.theme,
  };
  await c.env.DB.prepare("UPDATE members SET name = ?, handle = ?, avatar = ?, profile = ? WHERE id = ?")
    .bind(name, handle, JSON.stringify(avatar), JSON.stringify(profile), cur.id)
    .run();
  return c.json({ ...cur, name, handle, avatar, profile });
});

// ---------- away dates ----------

accounts.get("/account/away", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM away WHERE member_id = ? AND to_date >= ? ORDER BY from_date").bind(account(c).id, addDays(sgtToday(), -60)).all();
  return c.json(results.map(toAway));
});

accounts.post("/account/away", async (c) => {
  const b = await body(c);
  const from = b.from_date;
  const to = b.to_date ?? b.from_date;
  if (!isValidDate(from) || !isValidDate(to)) return c.json({ error: "Pick the first and last day you're away" }, 400);
  if (to < from) return c.json({ error: "The last day comes before the first" }, 400);
  if (to > addDays(from, 365)) return c.json({ error: "Away stretches are at most a year" }, 400);
  const upcoming = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM away WHERE member_id = ? AND to_date >= ?").bind(account(c).id, sgtToday()).first<{ n: number }>();
  if ((upcoming?.n ?? 0) >= 50) return c.json({ error: "That's a lot of trips! Remove some old ones first." }, 400);
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 80) : "";
  const row = await c.env.DB.prepare("INSERT INTO away (member_id, from_date, to_date, note) VALUES (?, ?, ?, ?) RETURNING *").bind(account(c).id, from, to, note).first();
  return c.json(toAway(row!), 201);
});

accounts.delete("/account/away/:id", async (c) => {
  // Only your own: the member id comes from the session, never the request (rule S2).
  await c.env.DB.prepare("DELETE FROM away WHERE id = ? AND member_id = ?").bind(Number(c.req.param("id")), account(c).id).run();
  return c.json({ ok: true });
});

// ---------- avatar photos ----------

accounts.put("/account/avatar", async (c) => {
  const img = await readImage(c.req.raw, MAX_PHOTO_BYTES, "Image is over 1 MB. Try a smaller one.");
  if ("error" in img) return c.json({ error: img.error }, img.status);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO avatar_images (member_id, mime, data, in_use, updated_at) VALUES (?1, ?2, ?3, 1, ?4) ON CONFLICT (member_id) DO UPDATE SET mime = ?2, data = ?3, in_use = 1, updated_at = ?4",
  )
    .bind(account(c).id, img.mime, toBase64(img.bytes), now)
    .run();
  return c.json({ photo: `/api/avatars/${account(c).id}?v=${encodeURIComponent(now)}` });
});

/** Switch between the saved photo and the drawn avatar without losing the photo. */
accounts.post("/account/avatar/use", async (c) => {
  const { photo } = await body<{ photo?: boolean }>(c);
  const res = await c.env.DB.prepare("UPDATE avatar_images SET in_use = ? WHERE member_id = ?").bind(photo ? 1 : 0, account(c).id).run();
  if (!res.meta.changes && photo) return c.json({ error: "No saved photo — upload one first" }, 404);
  return c.json({ ok: true });
});

accounts.delete("/account/avatar", async (c) => {
  await c.env.DB.prepare("DELETE FROM avatar_images WHERE member_id = ?").bind(account(c).id).run();
  return c.json({ ok: true });
});

/**
 * Photos reach their owner and anyone who shares, or once shared, a project with them: a face shows in every project
 * its owner belongs to, but not to every SUTD login. Anyone else gets the same 404 as no photo.
 */
async function canSeePhoto(c: Context<AppEnv>, ownerId: number) {
  const viewer = account(c).id;
  if (viewer === ownerId) return true;
  const shared = await c.env.DB.prepare("SELECT 1 FROM memberships a JOIN memberships b ON b.project_id = a.project_id WHERE a.member_id = ? AND b.member_id = ? LIMIT 1")
    .bind(viewer, ownerId)
    .first();
  return !!shared;
}

accounts.get("/avatars/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = (await canSeePhoto(c, id)) ? await c.env.DB.prepare("SELECT mime, data FROM avatar_images WHERE member_id = ?").bind(id).first<{ mime: string; data: string }>() : null;
  return row ? imageResponse(row) : c.json({ error: "No photo" }, 404);
});
