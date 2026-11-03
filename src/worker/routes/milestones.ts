import { Hono } from "hono";
import { isValidDate } from "../../shared/dates";
import type { Milestone, MilestoneStatus } from "../../shared/types";
import { me, pid } from "../ctx";
import { activeMemberIds, toHistory, toMilestone } from "../db";
import type { AppEnv } from "../env";

export const milestones = new Hono<AppEnv>();
const STATUSES: MilestoneStatus[] = ["planned", "in_progress", "at_risk", "done"];

function cleanMilestone(raw: Record<string, unknown>, memberIds: Set<number>): Partial<Milestone> | string {
  const out: Partial<Milestone> = {};
  if ("title" in raw) {
    if (typeof raw.title !== "string" || !raw.title.trim()) return "title is required";
    out.title = raw.title.trim().slice(0, 120);
  }
  if ("due_date" in raw) {
    if (!isValidDate(raw.due_date)) return "due_date must be YYYY-MM-DD";
    out.due_date = raw.due_date;
  }
  if ("status" in raw) {
    if (!STATUSES.includes(raw.status as MilestoneStatus)) return `status must be one of ${STATUSES.join(", ")}`;
    out.status = raw.status as MilestoneStatus;
  }
  if ("owners" in raw) out.owners = Array.isArray(raw.owners) ? [...new Set(raw.owners.filter((x): x is number => typeof x === "number" && memberIds.has(x)))] : [];
  if ("notes" in raw) out.notes = typeof raw.notes === "string" ? raw.notes.slice(0, 1000) : "";
  return out;
}

milestones.get("/milestones", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM milestones WHERE project_id = ? AND deleted = 0 ORDER BY due_date, id").bind(pid(c)).all();
  return c.json(results.map(toMilestone));
});

milestones.post("/milestones", async (c) => {
  const raw = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const m = cleanMilestone({ status: "planned", owners: [], notes: "", ...raw }, await activeMemberIds(c.env.DB, pid(c)));
  if (typeof m === "string") return c.json({ error: m }, 400);
  if (!m.title || !m.due_date) return c.json({ error: "title and due_date are required" }, 400);
  const row = await c.env.DB.prepare(
    "INSERT INTO milestones (project_id, title, due_date, owners, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(pid(c), m.title, m.due_date, JSON.stringify(m.owners), m.status, m.notes, me(c).id)
    .first();
  const created = toMilestone(row!);
  const changes = Object.fromEntries(["title", "due_date", "owners", "status", "notes"].map((k) => [k, { from: null, to: created[k as keyof Milestone] }]));
  await c.env.DB.prepare("INSERT INTO milestone_history (milestone_id, member_id, action, changes) VALUES (?, ?, 'create', ?)")
    .bind(created.id, me(c).id, JSON.stringify(changes))
    .run();
  return c.json(created, 201);
});

milestones.patch("/milestones/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM milestones WHERE project_id = ? AND id = ? AND deleted = 0").bind(pid(c), id).first();
  if (!row) return c.json({ error: "Milestone not found" }, 404);
  const before = toMilestone(row);
  const raw = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const patch = cleanMilestone(raw, await activeMemberIds(c.env.DB, pid(c)));
  if (typeof patch === "string") return c.json({ error: patch }, 400);
  const after = { ...before, ...patch };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(patch) as (keyof Milestone)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { from: before[k], to: after[k] };
  }
  if (!Object.keys(changes).length) return c.json(before);
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE milestones SET title = ?, due_date = ?, owners = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?").bind(
      after.title,
      after.due_date,
      JSON.stringify(after.owners),
      after.status,
      after.notes,
      now,
      id,
    ),
    c.env.DB.prepare("INSERT INTO milestone_history (milestone_id, member_id, action, changes) VALUES (?, ?, 'update', ?)").bind(
      id,
      me(c).id,
      JSON.stringify(changes),
    ),
  ]);
  return c.json({ ...after, updated_at: now });
});

milestones.delete("/milestones/:id", async (c) => {
  const id = Number(c.req.param("id"));
  // Soft delete so history (and the OneDrive backup) keeps the record.
  const res = await c.env.DB.prepare("UPDATE milestones SET deleted = 1 WHERE project_id = ? AND id = ? AND deleted = 0").bind(pid(c), id).run();
  if (!res.meta.changes) return c.json({ error: "Milestone not found" }, 404);
  await c.env.DB.prepare("INSERT INTO milestone_history (milestone_id, member_id, action, changes) VALUES (?, ?, 'delete', '{}')").bind(id, me(c).id).run();
  return c.json({ ok: true });
});

milestones.get("/milestones/history", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT h.*, m.title FROM milestone_history h JOIN milestones m ON m.id = h.milestone_id
     WHERE m.project_id = ? ORDER BY h.at DESC, h.id DESC LIMIT 200`).bind(pid(c)).all();
  return c.json(results.map(toHistory));
});
