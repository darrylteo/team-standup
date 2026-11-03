import { Hono } from "hono";
import { BADGE_CHOICES, BADGES, cleanCustomBadge } from "../../shared/catalog";
import { addDays, isValidDate, sgtToday, weekStart } from "../../shared/dates";
import { me, nextMeeting, pid } from "../ctx";
import { activeMemberIds, notify, toBadge, toNotification } from "../db";
import type { AppEnv } from "../env";

export const social = new Hono<AppEnv>();

/** Pokes, commends and badges only go to active members of the same project. */
const inProject = async (c: Parameters<typeof pid>[0], id: unknown) => typeof id === "number" && (await activeMemberIds(c.env.DB, pid(c))).has(id);

social.post("/pokes", async (c) => {
  const raw = await c.req.json<{ to?: number; note?: string }>().catch(() => ({}) as { to?: number; note?: string });
  if (!(await inProject(c, raw.to))) return c.json({ error: "Pick a teammate to poke" }, 400);
  if (raw.to === me(c).id) return c.json({ error: "You can't poke yourself" }, 400);
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 140) : "";
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO pokes (project_id, from_id, to_id, note) VALUES (?, ?, ?, ?)").bind(pid(c), me(c).id, raw.to, note),
    notify(c.env.DB, pid(c), raw.to!, "poke", me(c).id, { note }),
  ]);
  return c.json({ ok: true }, 201);
});

// Commend: at most one per teammate per calendar week (the primary key enforces it).
social.put("/commends/:date/:memberId", async (c) => {
  const date = c.req.param("date");
  const to = Number(c.req.param("memberId"));
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  if (to === me(c).id) return c.json({ error: "Commends are for teammates" }, 400);
  if (!(await inProject(c, to))) return c.json({ error: "Teammate not found" }, 404);
  const target = await c.env.DB.prepare("SELECT name FROM members WHERE id = ?").bind(to).first<{ name: string }>();
  const res = await c.env.DB.prepare("INSERT OR IGNORE INTO commends (project_id, from_id, to_id, week, meeting_date) VALUES (?, ?, ?, ?, ?)")
    .bind(pid(c), me(c).id, to, weekStart(date), date)
    .run();
  if (!res.meta.changes) return c.json({ error: `You've already commended ${target!.name} this week` }, 409);
  await notify(c.env.DB, pid(c), to, "commend", null, { date }).run(); // anonymous
  return c.json({ ok: true }, 201);
});

social.delete("/commends/:date/:memberId", async (c) => {
  const date = c.req.param("date");
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  await c.env.DB.prepare("DELETE FROM commends WHERE project_id = ? AND from_id = ? AND to_id = ? AND week = ?")
    .bind(pid(c), me(c).id, Number(c.req.param("memberId")), weekStart(date))
    .run();
  return c.json({ ok: true });
});

social.get("/badges", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM badges WHERE project_id = ? ORDER BY at DESC").bind(pid(c)).all();
  return c.json({ catalog: BADGES.filter((b) => BADGE_CHOICES.includes(b.key)), awarded: results.map(toBadge) });
});

social.post("/badges", async (c) => {
  if (me(c).role !== "prof") return c.json({ error: "Only pilots (professors) can award badges" }, 403);
  const raw = await c.req.json<{ member_id?: number; badge_key?: string; note?: string; label?: string; icon?: string }>().catch(() => ({}) as Record<string, never>);
  // One of the five presets, or the pilot's own badge.
  let look = { label: "", icon: "" };
  if (raw.badge_key === "custom") {
    const custom = cleanCustomBadge(raw.label, raw.icon);
    if (typeof custom === "string") return c.json({ error: custom }, 400);
    look = custom;
  } else if (!(BADGE_CHOICES as string[]).includes(raw.badge_key as string)) return c.json({ error: "Unknown badge" }, 400);
  if (!(await inProject(c, raw.member_id))) return c.json({ error: "Pick a teammate" }, 400);
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 200) : "";
  const row = await c.env.DB.prepare("INSERT INTO badges (project_id, member_id, badge_key, label, icon, note, awarded_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *")
    .bind(pid(c), raw.member_id, raw.badge_key, look.label, look.icon, note, me(c).id)
    .first();
  await notify(c.env.DB, pid(c), raw.member_id!, "badge", me(c).id, { badge_key: raw.badge_key, ...look, note }).run();
  return c.json(toBadge(row!), 201);
});

social.delete("/badges/:id", async (c) => {
  if (me(c).role !== "prof") return c.json({ error: "Only pilots (professors) can remove badges" }, 403);
  await c.env.DB.prepare("DELETE FROM badges WHERE project_id = ? AND id = ?").bind(pid(c), Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

social.get("/notifications", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM notifications WHERE project_id = ? AND member_id = ? ORDER BY at DESC, id DESC LIMIT 50")
    .bind(pid(c), me(c).id)
    .all();
  const list = results.map(toNotification);
  // Reminder is computed, not stored: shown from the day before the meeting until you submit, unless you're away.
  const upcoming = (await nextMeeting(c)).date;
  const away = await c.env.DB.prepare("SELECT 1 FROM away WHERE member_id = ? AND from_date <= ?2 AND to_date >= ?2").bind(me(c).id, upcoming).first();
  if (!away && sgtToday() >= addDays(upcoming, -1)) {
    const mine = await c.env.DB.prepare("SELECT submitted_at FROM updates WHERE project_id = ? AND member_id = ? AND meeting_date = ?")
      .bind(pid(c), me(c).id, upcoming)
      .first();
    if (!mine?.submitted_at)
      list.unshift({ id: 0, member_id: me(c).id, kind: "reminder", actor_id: null, payload: { date: upcoming }, at: new Date().toISOString(), read_at: null });
  }
  return c.json(list);
});

social.post("/notifications/read", async (c) => {
  await c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE project_id = ? AND member_id = ? AND read_at IS NULL")
    .bind(new Date().toISOString(), pid(c), me(c).id)
    .run();
  return c.json({ ok: true });
});
