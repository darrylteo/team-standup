import { Hono } from "hono";
import { isThemeKey } from "../../shared/catalog";
import { sgtToday } from "../../shared/dates";
import type { Member } from "../../shared/types";
import { cleanProjectText } from "../../shared/validate";
import { body, log, me, nextMeeting, pid, requireAdmin, visibleTo } from "../ctx";
import { ACCOUNT_SELECT, allMembers, inviteCode, latestUpdates, memberIn, toAccount, toProject } from "../db";
import type { AppEnv } from "../env";

/** People in a project, the project's own settings, and admin tools. Mounted under /api/p/:pid. */
export const members = new Hono<AppEnv>();

members.get("/me", async (c) => {
  const [unread, latest, meeting] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE project_id = ? AND member_id = ? AND read_at IS NULL").bind(pid(c), me(c).id).first<{ n: number }>(),
    latestUpdates(c.env.DB, pid(c)),
    nextMeeting(c),
  ]);
  // Only requests still waiting for my answer count; ones I marked cleared are waiting on the other person.
  const waitingOnMe = latest.flatMap((u) => u.waiting.filter((w) => w.member_id === me(c).id && w.state === "open")).length;
  return c.json({ me: me(c), project: c.get("project"), unread: unread?.n ?? 0, waiting_on_me: waitingOnMe, upcoming: meeting.date, meeting, today: sgtToday() });
});

members.get("/members", async (c) => c.json(await allMembers(c.env.DB, pid(c))));

/** Everything currently waiting on me, from each teammate's latest card (private items included: I'm involved). */
members.get("/waiting/me", async (c) => {
  const latest = await latestUpdates(c.env.DB, pid(c));
  const items = latest.flatMap((u) =>
    visibleTo(me(c).id, u)
      .waiting.filter((w) => w.member_id === me(c).id && w.state !== "resolved")
      .map((w) => ({ ...w, from_id: u.member_id, update_id: u.id, meeting_date: u.meeting_date })),
  );
  return c.json(items);
});

// ---------- the project itself ----------

const activeAdmins = (c: Parameters<typeof pid>[0]) =>
  c.env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE project_id = ? AND is_admin = 1 AND active = 1").bind(pid(c)).first<{ n: number }>();

members.get("/project", (c) => c.json(c.get("project")));

members.patch("/project", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const b = await body(c);
  const text = cleanProjectText(b);
  if (typeof text === "string") return c.json({ error: text }, 400);
  const cur = c.get("project")!;
  const next = { title: text.title ?? cur.title, subtitle: text.subtitle ?? cur.subtitle, theme: isThemeKey(b.theme) ? b.theme : cur.theme };
  await c.env.DB.prepare("UPDATE projects SET title = ?, subtitle = ?, palette = ? WHERE id = ?").bind(next.title, next.subtitle, next.theme, cur.id).run();
  await log(c, "update_project", next);
  return c.json({ ...cur, ...next });
});

/** A new code stops the old one working, e.g. after it was shared too widely. */
members.post("/project/invite", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const code = inviteCode();
  await c.env.DB.prepare("UPDATE projects SET invite_code = ? WHERE id = ?").bind(code, pid(c)).run();
  await log(c, "new_invite_code", {});
  return c.json({ invite_code: code });
});

/** Leave the project. The last admin has to hand over first, so a project is never left without one. */
/**
 * Leave the project. The last admin hands over first. The very last person closes the project for good,
 * which they must confirm with { close: true } after being warned (and offered an export).
 */
members.post("/leave", async (c) => {
  const self = me(c);
  const { close } = await body<{ close?: boolean }>(c);
  const [admins, others] = await Promise.all([
    activeAdmins(c),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE project_id = ? AND active = 1 AND member_id != ?").bind(pid(c), self.id).first<{ n: number }>(),
  ]);
  const last = (others?.n ?? 0) === 0;
  if (self.is_admin && !last && (admins?.n ?? 0) <= 1) return c.json({ error: "You're the only admin. Make someone else an admin on the Admin page first." }, 400);
  if (last && close !== true)
    return c.json({ error: "You're the last person in this project. Leaving closes it for good.", last_member: true }, 409);
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE memberships SET active = 0 WHERE project_id = ? AND member_id = ?").bind(pid(c), self.id),
    // Closing also retires the invite code, so nobody can rejoin a project with no one left to run it.
    ...(last ? [c.env.DB.prepare("UPDATE projects SET closed_at = ?, invite_code = 'closed-' || id || '-' || ? WHERE id = ?").bind(now, now, pid(c))] : []),
  ]);
  await log(c, last ? "close_project" : "leave_project", { email: self.email });
  return c.json({ ok: true, closed: last });
});

// ---------- admin: people ----------

members.post("/admin/members", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const b = await body(c);
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const domain = c.env.EMAIL_DOMAIN?.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "Enter a valid email" }, 400);
  if (domain && !email.endsWith(`@${domain}`)) return c.json({ error: `Emails must end with @${domain}` }, 400);
  const role = b.role === "prof" ? "prof" : "researcher";
  const db = c.env.DB;
  // The person may already have an account from another project; their own name wins over the one typed here.
  let person = await db.prepare(`${ACCOUNT_SELECT} WHERE m.email = ?`).bind(email).first();
  if (!person) {
    const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 40) : email.split("@")[0];
    await db.prepare("INSERT INTO members (email, name) VALUES (?, ?)").bind(email, name).run();
    person = await db.prepare(`${ACCOUNT_SELECT} WHERE m.email = ?`).bind(email).first();
  }
  const acct = toAccount(person!);
  const existing = await db.prepare("SELECT active FROM memberships WHERE project_id = ? AND member_id = ?").bind(pid(c), acct.id).first<{ active: number }>();
  if (existing?.active) return c.json({ error: `${email} is already in this project` }, 409);
  if (existing) {
    await db.prepare("UPDATE memberships SET active = 1, deleted_at = NULL, role = ? WHERE project_id = ? AND member_id = ?").bind(role, pid(c), acct.id).run();
  } else {
    const max = await db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM memberships WHERE project_id = ?").bind(pid(c)).first<{ n: number }>();
    await db
      .prepare("INSERT INTO memberships (project_id, member_id, role, is_admin, sort) VALUES (?, ?, ?, ?, ?)")
      .bind(pid(c), acct.id, role, b.is_admin === true ? 1 : 0, max?.n ?? 0)
      .run();
  }
  await log(c, existing ? "reactivate_member" : "add_member", { email, name: acct.name, role });
  return c.json(await memberIn(db, pid(c), acct.id), 201);
});

members.patch("/admin/members/:id", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const id = Number(c.req.param("id"));
  const cur: Member | null = await memberIn(c.env.DB, pid(c), id);
  if (!cur || cur.deleted) return c.json({ error: "That person isn't in this project" }, 404);
  const b = await body(c);
  const next = {
    role: b.role === "prof" || b.role === "researcher" ? b.role : cur.role,
    is_admin: typeof b.is_admin === "boolean" ? b.is_admin : cur.is_admin,
    active: typeof b.active === "boolean" ? b.active : cur.active,
  };
  // Admins can't drop their own admin rights or remove themselves; another admin has to.
  if (id === me(c).id && ((cur.is_admin && !next.is_admin) || !next.active))
    return c.json({ error: "You can't remove your own admin rights or yourself. Ask another admin, or leave from the project menu." }, 400);
  // Never leave the project without an admin.
  if (cur.is_admin && cur.active && (!next.is_admin || !next.active)) {
    const admins = await activeAdmins(c);
    if ((admins?.n ?? 0) <= 1) return c.json({ error: "Keep at least one active admin" }, 400);
  }
  await c.env.DB.prepare("UPDATE memberships SET role = ?, is_admin = ?, active = ? WHERE project_id = ? AND member_id = ?")
    .bind(next.role, next.is_admin ? 1 : 0, next.active ? 1 : 0, pid(c), id)
    .run();
  const changes = Object.fromEntries(
    (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== cur[k]).map((k) => [k, { from: cur[k], to: next[k] }]),
  );
  if (Object.keys(changes).length) await log(c, "update_member", { email: cur.email, changes });
  return c.json({ ...cur, ...next });
});

/**
 * Delete a removed member from the project for good (e.g. they changed jobs). Only their check-ins stay, under
 * their name; badges they received, their commends, pokes and notifications here go, and they drop off milestone owners.
 */
members.delete("/admin/members/:id", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const id = Number(c.req.param("id"));
  const cur = await memberIn(c.env.DB, pid(c), id);
  if (!cur || cur.deleted) return c.json({ error: "That person isn't in this project" }, 404);
  if (cur.active) return c.json({ error: "Remove them from the project first; then they can be deleted" }, 400);
  const db = c.env.DB;
  const p = pid(c);
  const { results: owned } = await db.prepare("SELECT id, owners FROM milestones WHERE project_id = ? AND deleted = 0").bind(p).all<{ id: number; owners: string }>();
  await db.batch([
    db.prepare("UPDATE memberships SET deleted_at = ?, is_admin = 0 WHERE project_id = ? AND member_id = ?").bind(new Date().toISOString(), p, id),
    // Badges they received go; badges they awarded stay, since those belong to the people who earned them.
    db.prepare("DELETE FROM badges WHERE project_id = ? AND member_id = ?").bind(p, id),
    db.prepare("DELETE FROM commends WHERE project_id = ? AND (from_id = ?2 OR to_id = ?2)").bind(p, id),
    db.prepare("DELETE FROM pokes WHERE project_id = ? AND (from_id = ?2 OR to_id = ?2)").bind(p, id),
    db.prepare("DELETE FROM notifications WHERE project_id = ? AND (member_id = ?2 OR actor_id = ?2)").bind(p, id),
    ...owned
      .filter((m) => (JSON.parse(m.owners) as number[]).includes(id))
      .map((m) => db.prepare("UPDATE milestones SET owners = ? WHERE id = ?").bind(JSON.stringify((JSON.parse(m.owners) as number[]).filter((x) => x !== id)), m.id)),
  ]);
  await log(c, "delete_member", { email: cur.email, name: cur.name });
  return c.json({ ok: true });
});

members.get("/admin/log", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const { results } = await c.env.DB.prepare("SELECT * FROM admin_log WHERE project_id = ? ORDER BY at DESC, id DESC LIMIT 100").bind(pid(c)).all();
  return c.json(results.map((r) => ({ ...r, details: JSON.parse(r.details as string) })));
});

/** Storage is shared by every project on the free plan, so admins see the whole database's size. */
members.get("/admin/storage", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const res = await c.env.DB.prepare(
    `SELECT (SELECT COALESCE(SUM(LENGTH(data)), 0) FROM figures) AS figures_bytes, (SELECT COUNT(*) FROM figures) AS figures,
            (SELECT COALESCE(SUM(LENGTH(data)), 0) FROM avatar_images) AS photo_bytes`,
  ).all();
  const row = res.results[0] as Record<string, number>;
  return c.json({ ...row, db_bytes: res.meta.size_after ?? null, limit_bytes: 500 * 1024 * 1024 });
});

/** This project's data as JSON for its admins (figures listed without their bytes). */
members.get("/project/export", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const db = c.env.DB;
  const p = pid(c);
  const results = await db.batch([
    db.prepare("SELECT * FROM projects WHERE id = ?").bind(p),
    db.prepare("SELECT m.id, m.email, m.name, m.handle, s.role, s.is_admin, s.active, s.sort FROM memberships s JOIN members m ON m.id = s.member_id WHERE s.project_id = ?").bind(p),
    db.prepare("SELECT * FROM meeting_dates WHERE project_id = ?").bind(p),
    db.prepare("SELECT * FROM updates WHERE project_id = ?").bind(p),
    db.prepare("SELECT * FROM milestones WHERE project_id = ?").bind(p),
    db.prepare("SELECT h.* FROM milestone_history h JOIN milestones m ON m.id = h.milestone_id WHERE m.project_id = ?").bind(p),
    db.prepare("SELECT * FROM commends WHERE project_id = ?").bind(p),
    db.prepare("SELECT * FROM badges WHERE project_id = ?").bind(p),
    db.prepare("SELECT project_id, member_id, meeting_date, mime, updated_at FROM figures WHERE project_id = ?").bind(p),
    db.prepare("SELECT * FROM meeting_notes WHERE project_id = ? AND deleted = 0").bind(p),
  ]);
  const names = ["project", "members", "meeting_dates", "updates", "milestones", "milestone_history", "commends", "badges", "figures", "meeting_notes"];
  const tables = Object.fromEntries(names.map((n, i) => [n, results[i].results]));
  tables.project = [toProject(results[0].results[0] as Record<string, unknown>)];
  c.header("Content-Disposition", `attachment; filename="standup-project-${p}-${sgtToday()}.json"`);
  return c.json({ app: "team-standup", kind: "project", exported_at: new Date().toISOString(), tables });
});
