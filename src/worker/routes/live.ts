import { Hono } from "hono";
import { isValidDate } from "../../shared/dates";
import { applyMeeting, initialMeeting, type MeetingAction } from "../../shared/meeting";
import type { MeetingState } from "../../shared/types";
import { pid } from "../ctx";
import type { AppEnv } from "../env";

export const live = new Hono<AppEnv>();

async function loadMeeting(db: D1Database, projectId: number, date: string): Promise<{ state: MeetingState; version: number }> {
  const row = await db.prepare("SELECT state, version FROM meeting_state WHERE project_id = ? AND meeting_date = ?").bind(projectId, date).first<{ state: string; version: number }>();
  return row ? { state: { ...initialMeeting(), ...JSON.parse(row.state) }, version: row.version } : { state: initialMeeting(), version: 0 };
}

live.get("/meetings/:date/state", async (c) => {
  const date = c.req.param("date");
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  return c.json({ ...(await loadMeeting(c.env.DB, pid(c), date)), now: Date.now() });
});

live.post("/meetings/:date/actions", async (c) => {
  const date = c.req.param("date");
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const action = await c.req.json<MeetingAction>().catch(() => null);
  if (!action || typeof action.type !== "string") return c.json({ error: "Body must be a meeting action" }, 400);
  // Optimistic concurrency: retry if another laptop changed the meeting between read and write.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { state, version } = await loadMeeting(c.env.DB, pid(c), date);
    const next = applyMeeting(state, action, Date.now());
    const res = await c.env.DB.prepare(
      `INSERT INTO meeting_state (meeting_date, state, version, updated_at, project_id) VALUES (?1, ?2, 1, ?3, ?5)
       ON CONFLICT (project_id, meeting_date) DO UPDATE SET state = ?2, version = meeting_state.version + 1, updated_at = ?3 WHERE meeting_state.version = ?4`,
    )
      .bind(date, JSON.stringify(next), new Date().toISOString(), version, pid(c))
      .run();
    if (res.meta.changes) return c.json({ state: next, version: version + 1, now: Date.now() });
  }
  return c.json({ error: "The meeting changed on another screen — try again" }, 409);
});
