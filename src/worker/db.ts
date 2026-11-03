import { weekStart } from "../shared/dates";
import type { Account, BadgeAward, Commend, Member, Milestone, MilestoneHistory, Notification, Project, Update, UpdateBody } from "../shared/types";
import { emptyUpdate } from "../shared/validate";

type Row = Record<string, unknown>;
const json = <T>(v: unknown, fallback: T): T => {
  try {
    return typeof v === "string" ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

const PHOTO_JOINS = "LEFT JOIN avatar_images a ON a.member_id = m.id";
/** A person with their photo stamp. */
const profileOf = (p: Partial<Account["profile"]>): Account["profile"] => ({
  flairs: p.flairs ?? [],
  avatarBg: p.avatarBg ?? "navy",
  theme: p.theme === "light" || p.theme === "dark" ? p.theme : null,
});
export const ACCOUNT_SELECT = `SELECT m.*, a.updated_at AS photo_at, a.in_use AS photo_in_use FROM members m ${PHOTO_JOINS}`;
/** People in one project (bind the project id first), with that project's role, admin flag and order. */
export const MEMBER_SELECT = `SELECT m.*, s.role, s.is_admin, s.active, s.sort, s.deleted_at, a.updated_at AS photo_at, a.in_use AS photo_in_use
  FROM memberships s JOIN members m ON m.id = s.member_id ${PHOTO_JOINS} WHERE s.project_id = ?`;
const UPDATE_SELECT =
  "SELECT u.*, f.updated_at AS figure_at FROM updates u LEFT JOIN figures f ON f.project_id = u.project_id AND f.member_id = u.member_id AND f.meeting_date = u.meeting_date";

export const toAccount = (r: Row): Account => ({
  id: r.id as number,
  email: r.email as string,
  name: r.name as string,
  handle: (r.handle as string) ?? null,
  avatar: json(r.avatar, {}) as Account["avatar"],
  // The version stamp busts browser caches when someone replaces their photo.
  photo: r.photo_at && r.photo_in_use ? `/api/avatars/${r.id}?v=${encodeURIComponent(r.photo_at as string)}` : null,
  saved_photo: r.photo_at ? `/api/avatars/${r.id}?v=${encodeURIComponent(r.photo_at as string)}` : null,
  // Older profiles may still carry a "background" key from the retired profile backgrounds; only these keys are read.
  profile: profileOf(json<Partial<Account["profile"]>>(r.profile, {})),
});

export const toMember = (r: Row): Member => ({
  ...toAccount(r),
  role: r.role as Member["role"],
  is_admin: !!r.is_admin,
  active: !!r.active && !r.deleted_at,
  deleted: !!r.deleted_at,
  sort: r.sort as number,
});

export const toProject = (r: Row, withCode = false): Project => ({
  id: r.id as number,
  title: r.title as string,
  subtitle: r.subtitle as string,
  theme: r.palette as Project["theme"], // projects.palette since migration 0003; the old theme column is unused
  ...(withCode ? { invite_code: r.invite_code as string } : {}),
});

// Cards saved before private/cleared existed read as public and open.
const WAITING_DEFAULTS = { private: false, state: "open" as const };

const toUpdate = (r: Row): Update => {
  const body = { ...emptyUpdate(), ...json<Partial<UpdateBody>>(r.body, {}) };
  return {
    ...body,
    waiting: body.waiting.map((w) => ({ ...WAITING_DEFAULTS, ...w })),
    id: r.id as number,
    member_id: r.member_id as number,
    meeting_date: r.meeting_date as string,
    submitted_at: (r.submitted_at as string) ?? null,
    updated_at: r.updated_at as string,
    figure: r.figure_at ? `/api/p/${r.project_id}/figures/${r.meeting_date}/${r.member_id}?v=${encodeURIComponent(r.figure_at as string)}` : null,
  };
};

export const toMilestone = (r: Row): Milestone => ({
  id: r.id as number,
  title: r.title as string,
  due_date: r.due_date as string,
  owners: json(r.owners, []),
  status: r.status as Milestone["status"],
  notes: r.notes as string,
  created_by: r.created_by as number,
  updated_at: r.updated_at as string,
});

export const toHistory = (r: Row): MilestoneHistory => ({
  id: r.id as number,
  milestone_id: r.milestone_id as number,
  title: (r.title as string) ?? "",
  member_id: r.member_id as number,
  action: r.action as MilestoneHistory["action"],
  changes: json(r.changes, {}),
  at: r.at as string,
});

export const toBadge = (r: Row): BadgeAward => ({
  id: r.id as number,
  member_id: r.member_id as number,
  badge_key: r.badge_key as string,
  label: (r.label as string) ?? "",
  icon: (r.icon as string) ?? "",
  note: r.note as string,
  awarded_by: r.awarded_by as number,
  at: r.at as string,
});

export const toNotification = (r: Row): Notification => ({
  id: r.id as number,
  member_id: r.member_id as number,
  kind: r.kind as Notification["kind"],
  actor_id: r.kind === "commend" ? null : ((r.actor_id as number) ?? null), // commends stay anonymous, even older ones
  payload: json(r.payload, {}),
  at: r.at as string,
  read_at: (r.read_at as string) ?? null,
});

export async function allMembers(db: D1Database, projectId: number): Promise<Member[]> {
  const { results } = await db.prepare(`${MEMBER_SELECT} ORDER BY s.sort, m.id`).bind(projectId).all();
  return results.map(toMember);
}

export async function memberIn(db: D1Database, projectId: number, memberId: number): Promise<Member | null> {
  const r = await db.prepare(`${MEMBER_SELECT} AND m.id = ?`).bind(projectId, memberId).first();
  return r ? toMember(r) : null;
}

export async function activeMemberIds(db: D1Database, projectId: number): Promise<Set<number>> {
  const { results } = await db.prepare("SELECT member_id FROM memberships WHERE project_id = ? AND active = 1").bind(projectId).all<{ member_id: number }>();
  return new Set(results.map((r) => r.member_id));
}

export function notify(db: D1Database, projectId: number, memberId: number, kind: Notification["kind"], actorId: number | null, payload: object) {
  return db
    .prepare("INSERT INTO notifications (project_id, member_id, kind, actor_id, payload) VALUES (?, ?, ?, ?, ?)")
    .bind(projectId, memberId, kind, actorId, JSON.stringify(payload));
}

/** One check-in in a project; `where` is extra SQL on `u`, bound after the project id. */
export async function updateRow(db: D1Database, projectId: number, where: string, ...binds: unknown[]): Promise<Update | null> {
  const r = await db.prepare(`${UPDATE_SELECT} WHERE u.project_id = ? AND ${where}`).bind(projectId, ...binds).first();
  return r ? toUpdate(r) : null;
}

export async function updatesFor(db: D1Database, projectId: number, date: string, viewerId: number): Promise<{ updates: Update[]; commends: Commend[] }> {
  const [u, c] = await db.batch([
    db.prepare(`${UPDATE_SELECT} WHERE u.project_id = ? AND u.meeting_date = ?`).bind(projectId, date),
    // Anonymous: who gave a commend never leaves the server, only whether the viewer did.
    db.prepare("SELECT rowid AS id, to_id, from_id = ? AS mine FROM commends WHERE project_id = ? AND week = ?").bind(viewerId, projectId, weekStart(date)),
  ]);
  const commends = (c.results as Row[]).map((r) => ({ id: r.id as number, to_id: r.to_id as number, mine: !!r.mine }));
  return { updates: (u.results as Row[]).map(toUpdate), commends };
}

/** Each teammate's most recent submitted card: "who is waiting on me" reads from these. */
export async function latestUpdates(db: D1Database, projectId: number): Promise<Update[]> {
  const { results } = await db
    .prepare(
      `${UPDATE_SELECT} WHERE u.project_id = ?1 AND u.submitted_at IS NOT NULL AND u.meeting_date = (
         SELECT MAX(meeting_date) FROM updates x WHERE x.project_id = ?1 AND x.member_id = u.member_id AND x.submitted_at IS NOT NULL)`,
    )
    .bind(projectId)
    .all();
  return (results as Row[]).map(toUpdate);
}

/** Invite codes: 8 characters without look-alikes (no 0/O or 1/I/L), easy to read out in a meeting. */
export function inviteCode(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}
