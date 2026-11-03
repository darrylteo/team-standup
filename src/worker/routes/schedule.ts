import { Hono } from "hono";
import { expandRule, isValidDate, sgtToday } from "../../shared/dates";
import type { MeetingDate } from "../../shared/types";
import { body, log, me, nextMeeting, pid, requireAdmin } from "../ctx";
import type { AppEnv } from "../env";

export const schedule = new Hono<AppEnv>();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Times are optional: "" means the meeting has a date but no set time. */
const timeOf = (v: unknown, fallback = "") => (v === "" || v === null || v === undefined ? "" : typeof v === "string" && TIME_RE.test(v) ? v : fallback);
const toDate = (r: Record<string, unknown>): MeetingDate => ({
  date: r.date as string,
  time: r.time as string,
  series_id: (r.series_id as number) ?? null,
  cancelled: !!r.cancelled,
  note: r.note as string,
});

/** Scheduled dates plus any past dates that have check-ins, newest first; `next` is the one check-ins are for. */
schedule.get("/schedule", async (c) => {
  const [{ results: dates }, { results: used }, next] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM meeting_dates WHERE project_id = ? ORDER BY date").bind(pid(c)).all(),
    c.env.DB.prepare("SELECT DISTINCT meeting_date FROM updates WHERE project_id = ?").bind(pid(c)).all<{ meeting_date: string }>(),
    nextMeeting(c),
  ]);
  const all = new Map(dates.map((r) => [r.date as string, toDate(r)]));
  for (const { meeting_date } of used) if (!all.has(meeting_date)) all.set(meeting_date, { date: meeting_date, time: "", series_id: null, cancelled: false, note: "", unscheduled: true });
  if (!all.has(next.date)) all.set(next.date, { date: next.date, time: next.time, series_id: null, cancelled: false, note: "", unscheduled: !next.scheduled });
  return c.json({ next, today: sgtToday(), dates: [...all.values()].sort((a, b) => b.date.localeCompare(a.date)) });
});

schedule.post("/schedule/dates", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const b = await body(c);
  if (!isValidDate(b.date)) return c.json({ error: "Pick a date" }, 400);
  const time = timeOf(b.time);
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 120) : "";
  await c.env.DB.prepare(
    `INSERT INTO meeting_dates (project_id, date, time, note, created_by) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (project_id, date) DO UPDATE SET time = ?3, note = ?4, cancelled = 0`,
  )
    .bind(pid(c), b.date, time, note, me(c).id)
    .run();
  await log(c, "add_meeting", { date: b.date, time });
  return c.json({ ok: true }, 201);
});

/** "Repeat weekly on Tue, Thu from … to …" — expanded into dates; existing dates are left as they are. */
schedule.post("/schedule/series", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const b = await body(c);
  const rule = {
    from: b.from as string,
    to: b.to as string,
    weekdays: Array.isArray(b.weekdays) ? (b.weekdays as number[]) : [],
    every: Number(b.every) || 1,
  };
  const time = timeOf(b.time);
  const dates = expandRule(rule);
  if (!dates.length) return c.json({ error: "That rule doesn't produce any dates — check the range and weekdays" }, 400);
  const series = await c.env.DB.prepare("INSERT INTO schedule_series (project_id, rule, created_by) VALUES (?, ?, ?) RETURNING id")
    .bind(pid(c), JSON.stringify({ ...rule, time }), me(c).id)
    .first<{ id: number }>();
  const res = await c.env.DB.batch(
    dates.map((d) =>
      c.env.DB.prepare("INSERT OR IGNORE INTO meeting_dates (project_id, date, time, series_id, created_by) VALUES (?, ?, ?, ?, ?)").bind(
        pid(c),
        d,
        time,
        series!.id,
        me(c).id,
      ),
    ),
  );
  const added = res.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  await log(c, "add_series", { ...rule, time, added });
  return c.json({ series_id: series!.id, added, skipped: dates.length - added }, 201);
});

schedule.patch("/schedule/dates/:date", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const date = c.req.param("date");
  const cur = await c.env.DB.prepare("SELECT * FROM meeting_dates WHERE project_id = ? AND date = ?").bind(pid(c), date).first();
  if (!cur) return c.json({ error: "That date isn't scheduled" }, 404);
  const b = await body(c);
  const time = "time" in b ? timeOf(b.time, cur.time as string) : cur.time;
  const cancelled = typeof b.cancelled === "boolean" ? (b.cancelled ? 1 : 0) : cur.cancelled;
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 120) : cur.note;
  await c.env.DB.prepare("UPDATE meeting_dates SET time = ?, cancelled = ?, note = ? WHERE project_id = ? AND date = ?").bind(time, cancelled, note, pid(c), date).run();
  await log(c, cancelled ? "cancel_meeting" : "update_meeting", { date, time, note });
  return c.json({ ok: true });
});

schedule.delete("/schedule/dates/:date", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const date = c.req.param("date");
  const used = await c.env.DB.prepare("SELECT 1 FROM updates WHERE project_id = ? AND meeting_date = ? LIMIT 1").bind(pid(c), date).first();
  if (used) return c.json({ error: "People have checked in for this date — cancel it instead of deleting" }, 409);
  await c.env.DB.prepare("DELETE FROM meeting_dates WHERE project_id = ? AND date = ?").bind(pid(c), date).run();
  await log(c, "delete_meeting", { date });
  return c.json({ ok: true });
});

/** Remove the future, unused dates of a series (past ones and dates with check-ins stay). */
schedule.delete("/schedule/series/:id", async (c) => {
  const denied = requireAdmin(c);
  if (denied) return denied;
  const id = Number(c.req.param("id"));
  const res = await c.env.DB.prepare(
    `DELETE FROM meeting_dates WHERE project_id = ?1 AND series_id = ?2 AND date >= ?3
       AND date NOT IN (SELECT DISTINCT meeting_date FROM updates WHERE project_id = ?1)`,
  )
    .bind(pid(c), id, sgtToday())
    .run();
  await log(c, "delete_series", { series_id: id, removed: res.meta.changes });
  return c.json({ removed: res.meta.changes });
});
