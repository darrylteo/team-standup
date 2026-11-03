import { Hono } from "hono";
import { NOTE_COLORS, NOTE_LIMITS } from "../../shared/catalog";
import { addDays, isValidDate, sgtToday } from "../../shared/dates";
import { meetingOver } from "../../shared/meeting";
import type { Away, CalendarResponse, FlightLog, MeetingDate, MeetingNote } from "../../shared/types";
import { body, me, pid, type C } from "../ctx";
import type { AppEnv } from "../env";

/** The project calendar (meetings, who's away, flight logs, milestones) and each meeting's whiteboard. */
export const calendar = new Hono<AppEnv>();

type Row = Record<string, unknown>;
export const toAway = (r: Row): Away => ({
  id: r.id as number,
  member_id: r.member_id as number,
  from_date: r.from_date as string,
  to_date: r.to_date as string,
  note: r.note as string,
});
const toNote = (r: Row, lockCutoff: string): MeetingNote => ({
  id: r.id as number,
  meeting_date: r.meeting_date as string,
  author_id: r.author_id as number,
  text: r.text as string,
  color: r.color as string,
  x: r.x as number,
  y: r.y as number,
  updated_by: (r.updated_by as number) ?? null,
  updated_at: r.updated_at as string,
  // A lock nobody has refreshed lately has lapsed (closed laptop, lost wifi).
  editing_by: r.editing_by && (r.editing_at as string) > lockCutoff ? (r.editing_by as number) : null,
});
const lockCutoff = () => new Date(Date.now() - NOTE_LIMITS.lockSeconds * 1000).toISOString();

/** Away stretches of this project's active members that overlap [from, to]. */
async function awayIn(c: C, from: string, to: string): Promise<Away[]> {
  const { results } = await c.env.DB.prepare(
    `SELECT a.* FROM away a JOIN memberships s ON s.member_id = a.member_id AND s.project_id = ? AND s.active = 1
     WHERE a.from_date <= ? AND a.to_date >= ? ORDER BY a.from_date, a.id`,
  )
    .bind(pid(c), to, from)
    .all();
  return results.map(toAway);
}

calendar.get("/calendar", async (c) => {
  const today = sgtToday();
  const from = c.req.query("from") ?? `${today.slice(0, 7)}-01`;
  const to = c.req.query("to") ?? addDays(from, 41);
  if (!isValidDate(from) || !isValidDate(to) || to < from) return c.json({ error: "from and to must be YYYY-MM-DD, from first" }, 400);
  if (to > addDays(from, 92)) return c.json({ error: "Ask for at most three months at a time" }, 400);
  const db = c.env.DB;
  const p = pid(c);
  const [dates, notes, states, ms] = await db.batch([
    db.prepare("SELECT * FROM meeting_dates WHERE project_id = ? AND date BETWEEN ? AND ? ORDER BY date").bind(p, from, to),
    db
      .prepare(
        `SELECT meeting_date, COUNT(*) AS n, (SELECT text FROM meeting_notes x WHERE x.project_id = ?1 AND x.meeting_date = n.meeting_date AND x.deleted = 0 AND x.text != '' ORDER BY x.id LIMIT 1) AS first
         FROM meeting_notes n WHERE project_id = ?1 AND deleted = 0 AND text != '' AND meeting_date BETWEEN ?2 AND ?3 GROUP BY meeting_date`,
      )
      .bind(p, from, to),
    db.prepare("SELECT meeting_date, state FROM meeting_state WHERE project_id = ? AND meeting_date BETWEEN ? AND ?").bind(p, from, to),
    db.prepare("SELECT id, title, due_date, status FROM milestones WHERE project_id = ? AND deleted = 0 AND due_date BETWEEN ? AND ? ORDER BY due_date").bind(p, from, to),
  ]);
  const phase = new Map((states.results as Row[]).map((r) => [r.meeting_date as string, (JSON.parse(r.state as string) as { phase?: string }).phase]));
  const logs: FlightLog[] = (notes.results as Row[])
    .filter((r) => meetingOver(r.meeting_date as string, today, phase.get(r.meeting_date as string)))
    .map((r) => ({ date: r.meeting_date as string, count: r.n as number, preview: String(r.first ?? "").split("\n")[0].slice(0, 80) }));
  const meetings: MeetingDate[] = (dates.results as Row[]).map((r) => ({
    date: r.date as string,
    time: r.time as string,
    series_id: (r.series_id as number) ?? null,
    cancelled: !!r.cancelled,
    note: r.note as string,
  }));
  const res: CalendarResponse = { from, to, today, meetings, away: await awayIn(c, from, to), logs, milestones: ms.results as CalendarResponse["milestones"] };
  return c.json(res);
});

// ---------- whiteboard ----------

const notesFor = async (c: C, date: string) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM meeting_notes WHERE project_id = ? AND meeting_date = ? AND deleted = 0 ORDER BY y, x, id")
    .bind(pid(c), date)
    .all();
  const cutoff = lockCutoff();
  return results.map((r) => toNote(r, cutoff));
};
const noteRow = (c: C, date: string, id: number) =>
  c.env.DB.prepare("SELECT * FROM meeting_notes WHERE project_id = ? AND meeting_date = ? AND id = ? AND deleted = 0").bind(pid(c), date, id).first();
const clampPos = (b: Record<string, unknown>) => ({
  x: typeof b.x === "number" && Number.isFinite(b.x) ? Math.min(1, Math.max(0, b.x)) : undefined,
  y: typeof b.y === "number" && Number.isFinite(b.y) ? Math.min(20_000, Math.max(0, Math.round(b.y))) : undefined,
});

calendar.get("/notes/:date", async (c) => {
  const date = c.req.param("date");
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  return c.json(await notesFor(c, date));
});

calendar.post("/notes/:date", async (c) => {
  const date = c.req.param("date");
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const b = await body(c);
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM meeting_notes WHERE project_id = ? AND meeting_date = ? AND deleted = 0").bind(pid(c), date).first<{ n: number }>();
  if ((n?.n ?? 0) >= NOTE_LIMITS.perMeeting) return c.json({ error: `The whiteboard holds ${NOTE_LIMITS.perMeeting} notes. Combine a few first.` }, 400);
  const pos = clampPos(b);
  const color = (NOTE_COLORS as readonly string[]).includes(b.color as string) ? (b.color as string) : NOTE_COLORS[(n?.n ?? 0) % NOTE_COLORS.length];
  const text = typeof b.text === "string" ? b.text.slice(0, NOTE_LIMITS.chars) : "";
  const now = new Date().toISOString();
  // The author starts typing straight away, so the new note is created already locked to them.
  const row = await c.env.DB.prepare(
    `INSERT INTO meeting_notes (project_id, meeting_date, author_id, text, color, x, y, updated_by, updated_at, editing_by, editing_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?3, ?8, ?3, ?8) RETURNING *`,
  )
    .bind(pid(c), date, me(c).id, text, color, pos.x ?? 0, pos.y ?? 0, now)
    .first();
  return c.json(toNote(row!, lockCutoff()), 201);
});

/** Start or stop typing in a note. Refused while someone else is typing in it. */
calendar.post("/notes/:date/:id/lock", async (c) => {
  const { on } = await body<{ on?: boolean }>(c);
  const id = Number(c.req.param("id"));
  if (on === false) {
    await c.env.DB.prepare("UPDATE meeting_notes SET editing_by = NULL, editing_at = NULL WHERE project_id = ? AND id = ? AND editing_by = ?").bind(pid(c), id, me(c).id).run();
    return c.json({ ok: true });
  }
  const res = await c.env.DB.prepare(
    `UPDATE meeting_notes SET editing_by = ?1, editing_at = ?2
     WHERE project_id = ?3 AND id = ?4 AND deleted = 0 AND (editing_by IS NULL OR editing_by = ?1 OR editing_at < ?5)`,
  )
    .bind(me(c).id, new Date().toISOString(), pid(c), id, lockCutoff())
    .run();
  if (res.meta.changes) return c.json({ ok: true });
  return lockedError(c, id);
});

async function lockedError(c: C, id: number) {
  const who = await c.env.DB.prepare("SELECT m.name FROM meeting_notes n JOIN members m ON m.id = n.editing_by WHERE n.id = ?").bind(id).first<{ name: string }>();
  return who ? c.json({ error: `${who.name} is typing in this note` }, 409) : c.json({ error: "That note was removed" }, 404);
}

/** Change a note's text, colour or position. Text changes need the note's lock (or a lapsed one). */
calendar.patch("/notes/:date/:id", async (c) => {
  const date = c.req.param("date");
  const id = Number(c.req.param("id"));
  const cur = await noteRow(c, date, id);
  if (!cur) return c.json({ error: "That note was removed" }, 404);
  const b = await body(c);
  const pos = clampPos(b);
  const now = new Date().toISOString();
  const typing = typeof b.text === "string";
  if (typing && cur.editing_by && cur.editing_by !== me(c).id && (cur.editing_at as string) > lockCutoff()) return lockedError(c, id);
  const next = {
    text: typing ? (b.text as string).slice(0, NOTE_LIMITS.chars) : (cur.text as string),
    color: (NOTE_COLORS as readonly string[]).includes(b.color as string) ? (b.color as string) : (cur.color as string),
    x: pos.x ?? (cur.x as number),
    y: pos.y ?? (cur.y as number),
  };
  const row = await c.env.DB.prepare(
    `UPDATE meeting_notes SET text = ?, color = ?, x = ?, y = ?, updated_by = ?, updated_at = ?,
       editing_by = CASE WHEN ? THEN ? ELSE editing_by END, editing_at = CASE WHEN ? THEN ? ELSE editing_at END
     WHERE id = ? RETURNING *`,
  )
    .bind(next.text, next.color, next.x, next.y, me(c).id, now, typing ? 1 : 0, me(c).id, typing ? 1 : 0, now, id)
    .first();
  return c.json(toNote(row!, lockCutoff()));
});

/** Notes are soft-deleted so a mistaken delete can be restored from the database or a backup. */
calendar.delete("/notes/:date/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const cur = await noteRow(c, c.req.param("date"), id);
  if (!cur) return c.json({ ok: true });
  if (cur.author_id !== me(c).id && !me(c).is_admin && (cur.text as string).trim())
    return c.json({ error: "Only the note's author or an admin can remove a note with text in it" }, 403);
  await c.env.DB.prepare("UPDATE meeting_notes SET deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?").bind(me(c).id, new Date().toISOString(), id).run();
  return c.json({ ok: true });
});
