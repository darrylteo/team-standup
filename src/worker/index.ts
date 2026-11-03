import { Hono } from "hono";
import { sgtToday } from "../shared/dates";
import { resolveIdentity } from "./auth";
import { ACCOUNT_SELECT, MEMBER_SELECT, toAccount, toMember, toProject } from "./db";
import type { AppEnv } from "./env";
import { accounts } from "./routes/account";
import { calendar } from "./routes/calendar";
import { live } from "./routes/live";
import { members } from "./routes/members";
import { milestones } from "./routes/milestones";
import { schedule } from "./routes/schedule";
import { social } from "./routes/social";
import { updates } from "./routes/updates";

const app = new Hono<AppEnv>().basePath("/api");

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong on the server" }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));

// The backup service token may only read the export and the figure files it lists.
const BACKUP_PATHS = /^\/api\/(export|p\/\d+\/figures\/\d{4}-\d{2}-\d{2}\/\d+)$/;

/** "alex.tan@example.edu" → "Alex Tan": a starting display name people can change on My profile. */
const nameFromEmail = (email: string) =>
  email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 40) || email;

// Identity: everyone signed in through Access gets an account on first visit. What they can see is decided by
// project membership: a new account sees no project until it creates one or joins with an invite code.
app.use("*", async (c, next) => {
  const auth = await resolveIdentity(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  c.set("me", null);
  c.set("project", null);
  c.set("signedInAs", null);
  if (auth.identity.kind === "backup") {
    if (c.req.method !== "GET" || !BACKUP_PATHS.test(c.req.path)) return c.json({ error: "Backup token can only export" }, 403);
    c.set("account", null);
    c.set("backup", true);
    return next();
  }
  let email = auth.identity.email.trim().toLowerCase();
  let row = await c.env.DB.prepare(`${ACCOUNT_SELECT} WHERE m.email = ? COLLATE NOCASE`).bind(email).first();
  // The trial switcher only acts as people who already exist; anyone else falls back to the signed-in person.
  if (auth.identity.signedInAs && row) c.set("signedInAs", auth.identity.signedInAs.toLowerCase());
  else if (auth.identity.signedInAs) {
    email = auth.identity.signedInAs.trim().toLowerCase();
    row = await c.env.DB.prepare(`${ACCOUNT_SELECT} WHERE m.email = ? COLLATE NOCASE`).bind(email).first();
  }
  if (!row) {
    const domain = c.env.EMAIL_DOMAIN?.trim();
    if (domain && !email.endsWith(`@${domain}`)) return c.json({ error: `Sign in with your @${domain} email` }, 403);
    await c.env.DB.prepare("INSERT OR IGNORE INTO members (email, name) VALUES (?, ?)").bind(email, nameFromEmail(email)).run();
    row = await c.env.DB.prepare(`${ACCOUNT_SELECT} WHERE m.email = ? COLLATE NOCASE`).bind(email).first();
  }
  c.set("account", toAccount(row!));
  c.set("backup", false);
  return next();
});

// Everything about one project lives under /api/p/:pid. Only active members of that project get past here.
const project = new Hono<AppEnv>();
project.use("*", async (c, next) => {
  const id = Number(c.req.param("pid"));
  if (!Number.isInteger(id)) return c.json({ error: "Unknown project" }, 404);
  if (c.get("backup")) {
    c.set("project", { id, title: "", subtitle: "", theme: "terminal" });
    return next();
  }
  const [p, m] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id),
    c.env.DB.prepare(`${MEMBER_SELECT} AND m.id = ?`).bind(id, c.get("account")!.id),
  ]);
  const proj = p.results[0] as Record<string, unknown> | undefined;
  const row = m.results[0] as Record<string, unknown> | undefined;
  if (proj?.closed_at) return c.json({ error: "This project was closed when its last member left." }, 410);
  if (!proj || !row || !row.active || row.deleted_at) return c.json({ error: "You're not in this project. Ask one of its admins for an invite code." }, 403);
  const member = toMember(row);
  c.set("me", member);
  c.set("project", toProject(proj, member.is_admin));
  return next();
});
project.route("/", members);
project.route("/", schedule);
project.route("/", updates);
project.route("/", milestones);
project.route("/", social);
project.route("/", live);
project.route("/", calendar);

app.route("/", accounts);
app.route("/p/:pid", project);

// ---------- backup ----------

const EXPORT_TABLES = [
  "members",
  "projects",
  "memberships",
  "schedule_series",
  "meeting_dates",
  "updates",
  "milestones",
  "milestone_history",
  "pokes",
  "commends",
  "badges",
  "notifications",
  "meeting_state",
  "avatar_images",
  "admin_log",
  "away",
  "meeting_notes",
] as const;

/** The whole database as JSON, for the OneDrive backup token only. Figures are listed without their bytes. */
app.get("/export", async (c) => {
  if (!c.get("backup")) return c.json({ error: "Only the backup token can export everything. Admins can export their project from the Admin page." }, 403);
  const db = c.env.DB;
  const results = await db.batch([
    ...EXPORT_TABLES.map((t) => db.prepare(`SELECT * FROM ${t}`)),
    db.prepare("SELECT project_id, member_id, meeting_date, mime, updated_at FROM figures"),
  ]);
  const tables: Record<string, unknown[]> = Object.fromEntries(EXPORT_TABLES.map((t, i) => [t, results[i].results]));
  tables.figures = results[EXPORT_TABLES.length].results;
  c.header("Content-Disposition", `attachment; filename="standup-backup-${sgtToday()}.json"`);
  return c.json({ app: "team-standup", schema: 4, exported_at: new Date().toISOString(), tables });
});

export default { fetch: app.fetch } satisfies ExportedHandler<AppEnv["Bindings"]>;
