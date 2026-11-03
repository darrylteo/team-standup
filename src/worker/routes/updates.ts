import { Hono } from "hono";
import { bottlenecks } from "../../shared/bottlenecks";
import { isValidDate } from "../../shared/dates";
import type { WaitingItem } from "../../shared/types";
import { cleanUpdateBody, emptyUpdate } from "../../shared/validate";
import { body, me, nextMeeting, pid, visibleTo } from "../ctx";
import { activeMemberIds, notify, updateRow, updatesFor } from "../db";
import type { AppEnv } from "../env";
import { imageResponse, MAX_FIGURE_BYTES, readImage, toBase64 } from "../photo";

export const updates = new Hono<AppEnv>();

const dateOr = async (c: Parameters<typeof me>[0], d: string | undefined) => d ?? (await nextMeeting(c)).date;

updates.get("/updates", async (c) => {
  const date = await dateOr(c, c.req.query("date"));
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const { updates: all, commends } = await updatesFor(c.env.DB, pid(c), date, me(c).id);
  const shown = all.map((u) => visibleTo(me(c).id, u));
  return c.json({ date, updates: shown, commends, bottlenecks: bottlenecks(shown.filter((u) => u.submitted_at)) });
});

/** My card for a date, plus my previous card's "next week" list offered as suggestions. */
updates.get("/updates/mine", async (c) => {
  const date = await dateOr(c, c.req.query("date"));
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const [mine, previous] = await Promise.all([
    updateRow(c.env.DB, pid(c), "u.member_id = ? AND u.meeting_date = ?", me(c).id, date),
    updateRow(c.env.DB, pid(c), "u.member_id = ? AND u.meeting_date < ? ORDER BY u.meeting_date DESC LIMIT 1", me(c).id, date),
  ]);
  // Open "needs input" items carry forward so blockers don't silently vanish between meetings.
  const carry = (previous?.waiting ?? []).filter((w) => w.state !== "resolved");
  return c.json({
    date,
    update: mine,
    draft: emptyUpdate(),
    suggestions: { done: previous?.next ?? [], waiting: carry, from_date: previous?.meeting_date ?? null },
  });
});

updates.put("/updates/:date", async (c) => {
  const date = c.req.param("date");
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const raw = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!raw) return c.json({ error: "Body must be JSON" }, 400);
  const p = pid(c);
  const clean = cleanUpdateBody(raw, await activeMemberIds(c.env.DB, p));
  const db = c.env.DB;
  const before = await updateRow(db, p, "u.member_id = ? AND u.meeting_date = ?", me(c).id, date);
  // A "cleared?" request from the other person survives an edit made in a form opened before it arrived.
  const prev = new Map((before?.waiting ?? []).map((w) => [w.id, w]));
  clean.waiting = clean.waiting.map((w) => (prev.get(w.id)?.state === "clear_requested" && w.state === "open" ? { ...w, state: "clear_requested" } : w));
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO updates (project_id, member_id, meeting_date, body, submitted_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (project_id, member_id, meeting_date) DO UPDATE SET body = ?4, submitted_at = COALESCE(updates.submitted_at, ?5), updated_at = ?6`,
    )
    .bind(p, me(c).id, date, JSON.stringify(clean), raw.submit !== false ? now : null, now)
    .run();
  const saved = (await updateRow(db, p, "u.member_id = ? AND u.meeting_date = ?", me(c).id, date))!;
  // Tell people about new requests for their input; the payload lets the notification jump to the item.
  // Drafts autosave as people type, so nobody is notified until the card is submitted; at that moment every
  // request on it counts as new. After that, only requests added later are new.
  const justSubmitted = !before?.submitted_at && !!saved.submitted_at;
  const asked = saved.submitted_at
    ? clean.waiting.filter((w) => w.member_id !== null && w.member_id !== me(c).id && (justSubmitted || !prev.has(w.id)) && w.state !== "resolved")
    : [];
  // Re-adding the same request (e.g. deleted and typed again) shouldn't stack identical unread notifications.
  const unread = asked.length
    ? await db
        .prepare("SELECT member_id, json_extract(payload, '$.text') AS text FROM notifications WHERE project_id = ? AND kind = 'waiting' AND actor_id = ? AND read_at IS NULL")
        .bind(p, me(c).id)
        .all<{ member_id: number; text: string }>()
    : { results: [] };
  const fresh = asked.filter((w) => !unread.results.some((n) => n.member_id === w.member_id && n.text === w.text));
  if (fresh.length)
    await db.batch(fresh.map((w) => notify(db, p, w.member_id!, "waiting", me(c).id, { date, text: w.text, update_id: saved.id, item_id: w.id })));
  return c.json(saved);
});

/**
 * Holding-pattern etiquette: the person whose input is needed can say "cleared"; only the person waiting
 * confirms (resolves) or keeps it open.
 */
updates.post("/waiting/:updateId/:itemId", async (c) => {
  const u = await updateRow(c.env.DB, pid(c), "u.id = ?", Number(c.req.param("updateId")));
  if (!u) return c.json({ error: "Check-in not found" }, 404);
  const item = u.waiting.find((w) => w.id === c.req.param("itemId"));
  if (!item) return c.json({ error: "That request no longer exists" }, 404);
  const { action } = await body<{ action?: string }>(c);
  const isTarget = item.member_id === me(c).id;
  const isOwner = u.member_id === me(c).id;
  let next: WaitingItem["state"];
  if (action === "request_clear" && isTarget) next = "clear_requested";
  else if (action === "confirm_clear" && isOwner) next = "resolved";
  else if (action === "keep_open" && isOwner) next = "open";
  else return c.json({ error: "Only the person waiting can close this; the other person can mark it cleared" }, 403);
  const waiting = u.waiting.map((w) => (w.id === item.id ? { ...w, state: next } : w));
  const { id, member_id, meeting_date, submitted_at, updated_at, figure, ...rest } = u;
  void [id, member_id, meeting_date, submitted_at, updated_at, figure];
  await c.env.DB.prepare("UPDATE updates SET body = ? WHERE id = ?").bind(JSON.stringify({ ...rest, waiting }), u.id).run();
  if (next === "clear_requested")
    await notify(c.env.DB, pid(c), u.member_id, "clear_requested", me(c).id, { text: item.text, update_id: u.id, item_id: item.id, date: u.meeting_date }).run();
  return c.json({ state: next });
});

// ---------- figure of the week ----------

updates.put("/figures/:date", async (c) => {
  const date = c.req.param("date");
  if (!isValidDate(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const img = await readImage(c.req.raw, MAX_FIGURE_BYTES, "Figure is too large even after resizing. Try a simpler image.");
  if ("error" in img) return c.json({ error: img.error }, img.status);
  await c.env.DB.prepare(
    `INSERT INTO figures (project_id, member_id, meeting_date, mime, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (project_id, member_id, meeting_date) DO UPDATE SET mime = ?4, data = ?5, updated_at = ?6`,
  )
    .bind(pid(c), me(c).id, date, img.mime, toBase64(img.bytes), new Date().toISOString())
    .run();
  const u = await updateRow(c.env.DB, pid(c), "u.member_id = ? AND u.meeting_date = ?", me(c).id, date);
  return c.json({ figure: u?.figure ?? `/api/p/${pid(c)}/figures/${date}/${me(c).id}` });
});

updates.delete("/figures/:date", async (c) => {
  await c.env.DB.prepare("DELETE FROM figures WHERE project_id = ? AND member_id = ? AND meeting_date = ?").bind(pid(c), me(c).id, c.req.param("date")).run();
  return c.json({ ok: true });
});

updates.get("/figures/:date/:memberId", async (c) => {
  const row = await c.env.DB.prepare("SELECT mime, data FROM figures WHERE project_id = ? AND meeting_date = ? AND member_id = ?")
    .bind(pid(c), c.req.param("date"), Number(c.req.param("memberId")))
    .first<{ mime: string; data: string }>();
  return row ? imageResponse(row) : c.json({ error: "No figure" }, 404);
});
