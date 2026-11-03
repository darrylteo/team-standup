import type { Context } from "hono";
import { sgtToday, upcomingMeeting } from "../shared/dates";
import type { Update } from "../shared/types";
import type { AppEnv } from "./env";

export type C = Context<AppEnv>;

/** The caller as a member of the current project (only on /api/p/:pid/* routes). */
export const me = (c: C) => c.get("me")!;
/** The signed-in person, on every route. */
export const account = (c: C) => c.get("account")!;
/** Id of the project in the URL; membership was checked before any project route runs. */
export const pid = (c: C) => c.get("project")!.id;

export async function body<T = Record<string, unknown>>(c: C): Promise<T> {
  return c.req.json<T>().catch(() => ({}) as T);
}

export const requireAdmin = (c: C) => (me(c).is_admin ? null : c.json({ error: "Only project admins can do that" }, 403));

/** Next scheduled (not cancelled) meeting from today; falls back to the default weekday if nothing is scheduled. */
export async function nextMeeting(c: C): Promise<{ date: string; time: string; scheduled: boolean }> {
  const row = await c.env.DB.prepare("SELECT date, time FROM meeting_dates WHERE project_id = ? AND date >= ? AND cancelled = 0 ORDER BY date LIMIT 1")
    .bind(pid(c), sgtToday())
    .first<{ date: string; time: string }>();
  if (row) return { ...row, scheduled: true };
  return { date: upcomingMeeting(Number(c.env.MEETING_WEEKDAY ?? 4)), time: "", scheduled: false };
}

/** Private "needs input from" items are visible only to the two people involved. */
export function visibleTo(viewerId: number, u: Update): Update {
  return { ...u, waiting: u.waiting.filter((w) => !w.private || u.member_id === viewerId || w.member_id === viewerId) };
}

export async function log(c: C, action: string, details: object) {
  await c.env.DB.prepare("INSERT INTO admin_log (project_id, actor_id, action, details) VALUES (?, ?, ?, ?)")
    .bind(pid(c), account(c).id, action, JSON.stringify(details))
    .run();
}
