import { env, exports } from "cloudflare:workers";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { resolveIdentity } from "../../src/worker/auth";
import type { Env } from "../../src/worker/env";
import type { Member, Milestone, MilestoneHistory, Update } from "../../src/shared/types";

// Same rule as the client: account-level routes are global, everything else belongs to a project (1 unless given).
const GLOBAL = /^\/(session|projects|account|avatars|health|export)(\/|\?|$)/;
const url = (path: string, project = 1) => (GLOBAL.test(path) ? `/api${path}` : `/api/p/${project}${path}`);
const call = async (path: string, opts: { as?: string; method?: string; body?: unknown; host?: string; project?: number } = {}) => {
  const res = await exports.default.fetch(`http://${opts.host ?? "localhost"}${url(path, opts.project)}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-dev-user": opts.as ?? "alex@lab.test" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as any };
};
const putBytes = (path: string, bytes: Uint8Array, as = "alex@lab.test") =>
  exports.default.fetch(`http://localhost${url(path)}`, { method: "PUT", headers: { "x-dev-user": as }, body: bytes });

const ids = async () => Object.fromEntries(((await call("/members")).json as Member[]).map((m) => [m.name, m.id])) as Record<string, number>;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe("auth", () => {
  it("health needs no identity", async () => {
    expect((await call("/health", { host: "example.com" })).status).toBe(200);
  });
  it("rejects the dev identity off localhost", async () => {
    expect((await call("/me", { host: "standup.example.workers.dev" })).status).toBe(401);
  });
  it("refuses emails outside the university domain", async () => {
    const r = await call("/session", { as: "stranger@gmail.com" });
    expect(r.status).toBe(403);
    expect(r.json.error).toContain("@example.edu");
  });
  it("gives a new SUTD person an account with no projects, and keeps them out of other projects", async () => {
    const s = await call("/session", { as: "first_visit@example.edu" });
    expect(s.status).toBe(200);
    expect(s.json.account.name).toBe("First Visit");
    expect(s.json.projects).toEqual([]);
    const r = await call("/me", { as: "first_visit@example.edu" });
    expect(r.status).toBe(403);
    expect(r.json.error).toContain("not in this project");
  });
  it("returns the caller, admin flag and the next meeting", async () => {
    const r = await call("/me");
    expect(r.json.me).toMatchObject({ name: "Alex", is_admin: true });
    expect(r.json.meeting.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("weekly check-ins", () => {
  it("saves my card, suggests last plan, carries open requests forward and notifies who I need", async () => {
    const m = await ids();
    await call("/updates/2026-10-22", {
      method: "PUT",
      body: { next: ["Benchmark heuristic"], waiting: [{ member_id: m.Leo, text: "roster" }] },
    });
    const saved = await call("/updates/2026-10-29", {
      method: "PUT",
      body: { weather: "turbulence", done: ["Benchmarked"], waiting: [{ member_id: m.Priya, text: "real-time feed" }] },
    });
    expect(saved.status).toBe(200);
    expect(saved.json as Update).toMatchObject({ weather: "turbulence", done: ["Benchmarked"] });

    const mine = (await call("/updates/mine?date=2026-10-29")).json;
    expect(mine.suggestions.done).toEqual(["Benchmark heuristic"]);
    expect(mine.suggestions.waiting.map((w: { text: string }) => w.text)).toEqual(["roster"]);

    const priya = (await call("/notifications", { as: "priya@lab.test" })).json;
    expect(priya.some((n: any) => n.kind === "waiting" && n.actor_id === m.Alex)).toBe(true);
  });

  it("only ever writes the caller's own card", async () => {
    await call("/updates/2026-11-05", { method: "PUT", as: "leo@lab.test", body: { done: ["by leo"] } });
    await call("/updates/2026-11-05", { method: "PUT", body: { done: ["by alex"], member_id: 999 } });
    const week = (await call("/updates?date=2026-11-05")).json.updates as Update[];
    expect(week.map((u) => u.done[0]).sort()).toEqual(["by alex", "by leo"]);
  });

  it("keeps the deep-dive length and rejects odd lengths", async () => {
    const u = (await call("/updates/2026-11-12", { method: "PUT", body: { deep_dive: { topic: "Results", minutes: 45 } } })).json as Update;
    expect(u.deep_dive).toMatchObject({ topic: "Results", minutes: 45 }); // the longest choice on My check-in
    const v = (await call("/updates/2026-11-12", { method: "PUT", body: { deep_dive: { topic: "Results", minutes: 999 } } })).json as Update;
    expect(v.deep_dive?.minutes).toBe(15);
  });

  it("rejects bad dates", async () => {
    expect((await call("/updates/2026-13-01", { method: "PUT", body: {} })).status).toBe(400);
  });
});

describe("needs input from (holding pattern)", () => {
  it("hides private requests from everyone except the two people involved", async () => {
    const m = await ids();
    await call("/updates/2026-11-19", { method: "PUT", as: "leo@lab.test", body: { waiting: [{ member_id: m.Elena, text: "metric choice", private: true }] } });
    const see = async (as: string) => ((await call("/updates?date=2026-11-19", { as })).json.updates as Update[]).flatMap((u) => u.waiting);
    expect(await see("priya@lab.test")).toEqual([]);
    expect(await see("elena@lab.test")).toHaveLength(1);
    expect(await see("leo@lab.test")).toHaveLength(1);
    expect((await call("/updates?date=2026-11-19", { as: "priya@lab.test" })).json.bottlenecks).toEqual([]);
  });

  it("the other person marks it cleared; only the person waiting closes it", async () => {
    const m = await ids();
    const u = (await call("/updates/2026-11-26", { method: "PUT", as: "leo@lab.test", body: { waiting: [{ member_id: m.Priya, text: "model API" }] } })).json as Update;
    const item = u.waiting[0];
    expect((await call("/waiting/me", { as: "priya@lab.test" })).json.some((w: { text: string }) => w.text === "model API")).toBe(true);
    expect((await call(`/waiting/${u.id}/${item.id}`, { as: "priya@lab.test", body: { action: "confirm_clear" } })).status).toBe(403);
    expect((await call(`/waiting/${u.id}/${item.id}`, { as: "priya@lab.test", body: { action: "request_clear" } })).json.state).toBe("clear_requested");
    const leo = (await call("/notifications", { as: "leo@lab.test" })).json;
    expect(leo.some((n: any) => n.kind === "clear_requested")).toBe(true);
    // An edit from a form opened earlier doesn't wipe the request.
    await call("/updates/2026-11-26", { method: "PUT", as: "leo@lab.test", body: { waiting: [{ ...item, state: "open" }] } });
    expect((await call(`/waiting/${u.id}/${item.id}`, { as: "leo@lab.test", body: { action: "confirm_clear" } })).json.state).toBe("resolved");
    const week = (await call("/updates?date=2026-11-26")).json;
    expect(week.bottlenecks).toEqual([]);
  });
});

describe("milestones", () => {
  it("logs who changed what", async () => {
    const m = await ids();
    const created = (await call("/milestones", { body: { title: "Final report", due_date: "2026-12-18", owners: [m.Alex] } })).json as Milestone;
    await call(`/milestones/${created.id}`, { method: "PATCH", as: "leo@lab.test", body: { due_date: "2026-12-11", status: "at_risk" } });
    const history = ((await call("/milestones/history")).json as MilestoneHistory[]).filter((h) => h.milestone_id === created.id);
    expect(history.map((h) => h.action)).toEqual(["update", "create"]);
    expect(history[0]).toMatchObject({ member_id: m.Leo, changes: { due_date: { from: "2026-12-18", to: "2026-12-11" } } });
  });
  it("validates input", async () => {
    expect((await call("/milestones", { body: { title: "x", due_date: "soon" } })).status).toBe(400);
  });
});

describe("social", () => {
  it("pokes are unlimited, but not to yourself", async () => {
    const m = await ids();
    for (let i = 0; i < 3; i++) expect((await call("/pokes", { body: { to: m.Leo, note: "slides?" } })).status).toBe(201);
    expect((await call("/pokes", { body: { to: m.Alex } })).status).toBe(400);
  });
  it("only professors award badges", async () => {
    const m = await ids();
    expect((await call("/badges", { body: { member_id: m.Priya, badge_key: "problem_solver" } })).status).toBe(403);
    expect((await call("/badges", { as: "elena@lab.test", body: { member_id: m.Priya, badge_key: "employee_of_month" } })).status).toBe(400);
    expect((await call("/badges", { as: "elena@lab.test", body: { member_id: m.Priya, badge_key: "problem_solver" } })).status).toBe(201);
  });
  it("one commend per teammate per calendar week, even with two meetings that week", async () => {
    const m = await ids();
    expect((await call(`/commends/2026-12-01/${m.Alex}`, { method: "PUT" })).status).toBe(400);
    expect((await call(`/commends/2026-12-01/${m.Priya}`, { method: "PUT" })).status).toBe(201); // Tuesday
    const again = await call(`/commends/2026-12-03/${m.Priya}`, { method: "PUT" }); // Thursday, same week
    expect(again.status).toBe(409);
    expect(again.json.error).toContain("already commended Priya this week");
    expect((await call(`/commends/2026-12-03/${m.Leo}`, { method: "PUT" })).status).toBe(201);
    expect((await call(`/commends/2026-12-08/${m.Priya}`, { method: "PUT" })).status).toBe(201); // next week
    const week = (await call("/updates?date=2026-12-03")).json;
    expect(week.commends).toEqual(expect.arrayContaining([expect.objectContaining({ to_id: m.Priya, mine: true }), expect.objectContaining({ to_id: m.Leo, mine: true })]));
    // Anonymous: other people learn how many, never from whom, and the notification has no sender.
    const theirs = (await call("/updates?date=2026-12-03", { as: "leo@lab.test" })).json.commends as Record<string, unknown>[];
    expect(theirs.filter((x) => x.to_id === m.Priya)).toEqual([expect.objectContaining({ mine: false })]);
    expect(JSON.stringify(theirs)).not.toContain("from_id");
    const note = ((await call("/notifications", { as: "priya@lab.test" })).json as { kind: string; actor_id: number | null }[]).find((n) => n.kind === "commend");
    expect(note?.actor_id).toBeNull();
    await call(`/commends/2026-12-03/${m.Priya}`, { method: "DELETE" });
    expect((await call(`/commends/2026-12-03/${m.Priya}`, { method: "PUT" })).status).toBe(201);
  });
});

describe("profile", () => {
  it("sets a unique @handle, flairs (max 3) and keeps only safe avatar keys", async () => {
    const r = await call("/account/profile", {
      method: "PATCH",
      body: {
        handle: "@Alex_T",
        flairs: [{ text: "OR nerd", color: "sky" }, { text: "☕ x3", color: "nope" }, { text: "c" }, { text: "d" }],
        avatar: { kind: "human", body: "male", hair: "short", evil: "<script>", "bad key": "x" },
      },
    });
    expect(r.status).toBe(200);
    expect(r.json.handle).toBe("alex_t");
    expect(r.json.profile.flairs).toEqual([{ text: "OR nerd", color: "sky" }, { text: "☕ x3", color: "slate" }, { text: "c", color: "slate" }]);
    expect(r.json.avatar).toEqual({ kind: "human", body: "male", hair: "short" });
    expect((await call("/account/profile", { method: "PATCH", as: "priya@lab.test", body: { handle: "alex_t" } })).status).toBe(409);
    expect((await call("/account/profile", { method: "PATCH", as: "priya@lab.test", body: { handle: "no spaces" } })).status).toBe(400);
  });
  it("keeps light/dark on the person's account, separate from everyone else's", async () => {
    const theme = async (as: string) => (await call("/session", { as })).json.account.profile.theme;
    expect(await theme("leo@lab.test")).toBe(null); // follows the device until chosen
    await call("/account/profile", { method: "PATCH", as: "leo@lab.test", body: { theme: "light" } });
    await call("/account/profile", { method: "PATCH", as: "leo@lab.test", body: { name: "Leo" } }); // other edits keep it
    expect(await theme("leo@lab.test")).toBe("light");
    expect(await theme("priya@lab.test")).toBe(null);
    await call("/account/profile", { method: "PATCH", as: "leo@lab.test", body: { theme: "neon" } });
    expect(await theme("leo@lab.test")).toBe(null);
  });
});

describe("photos and figures", () => {
  it("stores a PNG avatar and serves it back safely", async () => {
    expect((await putBytes("/account/avatar", PNG)).status).toBe(200);
    const me = (await call("/me")).json.me as Member;
    const img = await exports.default.fetch(`http://localhost${me.photo}`, { headers: { "x-dev-user": "priya@lab.test" } });
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
  });
  it("photos reach the owner and teammates, not every SUTD login", async () => {
    expect((await putBytes("/account/avatar", PNG)).status).toBe(200);
    const me = (await call("/me")).json.me as Member;
    const get = (as: string) => exports.default.fetch(`http://localhost${me.photo}`, { headers: { "x-dev-user": as } });
    expect((await get("alex@lab.test")).status).toBe(200);
    expect((await get("priya@lab.test")).status).toBe(200);
    expect((await get("lurker@example.edu")).status).toBe(404);
  });
  it("refuses SVG/HTML disguised as images and oversize files", async () => {
    expect((await putBytes("/account/avatar", new TextEncoder().encode("<svg onload=alert(1)>"))).status).toBe(415);
    const big = new Uint8Array(1_000_001);
    big.set([0xff, 0xd8, 0xff]);
    expect((await putBytes("/account/avatar", big)).status).toBe(413);
  });
  it("one figure per person per meeting, shown on the card", async () => {
    await call("/updates/2026-12-10", { method: "PUT", body: { figure_caption: "Deadhead vs STT" } });
    expect((await putBytes("/figures/2026-12-10", PNG)).status).toBe(200);
    expect((await putBytes("/figures/2026-12-10", PNG)).status).toBe(200); // replaces, never adds a second
    const u = ((await call("/updates?date=2026-12-10")).json.updates as Update[]).find((x) => x.figure)!;
    expect(u.figure_caption).toBe("Deadhead vs STT");
    const img = await exports.default.fetch(`http://localhost${u.figure}`, { headers: { "x-dev-user": "leo@lab.test" } });
    expect(img.status).toBe(200);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM figures WHERE meeting_date = '2026-12-10'").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});

describe("admin", () => {
  it("admins add, deactivate and reactivate people; others can't", async () => {
    expect((await call("/admin/members", { as: "priya@lab.test", body: { email: "new_person@example.edu" } })).status).toBe(403);
    expect((await call("/admin/members", { body: { email: "someone@gmail.com" } })).status).toBe(400);
    const added = await call("/admin/members", { body: { email: "new_person@example.edu", name: "New Person" } });
    expect(added.status).toBe(201);
    expect((await call("/me", { as: "new_person@example.edu" })).status).toBe(200);
    await call(`/admin/members/${added.json.id}`, { method: "PATCH", body: { active: false } });
    expect((await call("/me", { as: "new_person@example.edu" })).status).toBe(403);
    expect((await call("/admin/members", { body: { email: "new_person@example.edu" } })).status).toBe(201); // reactivate
    const log = (await call("/admin/log")).json as { action: string }[];
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["add_member", "update_member", "reactivate_member"]));
  });
  it("never leaves the team without an admin", async () => {
    const m = await ids();
    await call(`/admin/members/${m.Elena}`, { method: "PATCH", body: { is_admin: false } });
    const r = await call(`/admin/members/${m.Alex}`, { method: "PATCH", body: { is_admin: false } });
    expect(r.status).toBe(400);
    await call(`/admin/members/${m.Elena}`, { method: "PATCH", body: { is_admin: true } });
  });
});

describe("schedule", () => {
  it("admins add a repeating series like a calendar; the next meeting follows it", async () => {
    const r = await call("/schedule/series", { body: { from: "2030-01-01", to: "2030-01-31", weekdays: [2, 4], every: 1, time: "10:30" } });
    expect(r.json).toMatchObject({ added: 10, skipped: 0 });
    const again = await call("/schedule/series", { body: { from: "2030-01-01", to: "2030-01-10", weekdays: [2], every: 1 } });
    expect(again.json).toMatchObject({ added: 0, skipped: 2 });
    await call("/schedule/dates/2030-01-03", { method: "PATCH", body: { cancelled: true, note: "Holiday" } });
    const s = (await call("/schedule")).json;
    expect(s.dates.find((d: { date: string }) => d.date === "2030-01-03")).toMatchObject({ cancelled: true, note: "Holiday", time: "10:30" });
    expect((await call("/schedule/series", { as: "priya@lab.test", body: { from: "2030-02-01", to: "2030-02-28", weekdays: [4] } })).status).toBe(403);
  });
  it("won't delete a date people have checked in for", async () => {
    await call("/schedule/dates", { body: { date: "2030-03-05", time: "14:00" } });
    await call("/updates/2030-03-05", { method: "PUT", body: { done: ["x"] } });
    expect((await call("/schedule/dates/2030-03-05", { method: "DELETE" })).status).toBe(409);
  });
});

describe("live meeting", () => {
  it("applies actions server-side so every screen converges", async () => {
    const m = await ids();
    await call("/meetings/2026-10-29/actions", { body: { type: "open", member_id: m.Priya } });
    await call("/meetings/2026-10-29/actions", { as: "leo@lab.test", body: { type: "close", member_id: m.Priya } });
    const s = (await call("/meetings/2026-10-29/state")).json;
    expect(s.state).toMatchObject({ phase: "round", current: null, closed: [m.Priya] });
    expect(s.state.opened_at).toBeGreaterThan(0);
    expect(s.version).toBe(2);
  });
});

describe("export", () => {
  it("lets project admins export their project, listing figures without their bytes", async () => {
    const r = await call("/project/export");
    expect(r.json.app).toBe("team-standup");
    expect(Object.keys(r.json.tables)).toEqual(expect.arrayContaining(["project", "members", "meeting_dates", "updates", "commends", "figures"]));
    for (const f of r.json.tables.figures) expect(f).not.toHaveProperty("data");
    expect((await call("/project/export", { as: "priya@lab.test" })).status).toBe(403);
  });
  it("keeps the whole-database export for the backup token", async () => {
    expect((await call("/export")).status).toBe(403);
  });
});

describe("projects", () => {
  it("anyone can start a project, becomes its admin, and others join with the code", async () => {
    const made = await call("/projects", { as: "priya@lab.test", body: { title: "  Reading group ", subtitle: "papers", theme: "lounge" } });
    expect(made.status).toBe(201);
    const p = made.json.id as number;
    const s = (await call("/session", { as: "priya@lab.test" })).json;
    const mine = s.projects.find((x: { id: number }) => x.id === p);
    expect(mine).toMatchObject({ title: "Reading group", subtitle: "papers", theme: "lounge", is_admin: true });
    expect(mine.invite_code).toMatch(/^[A-Z2-9]{8}$/);

    // Not in it yet: no access to its data.
    expect((await call("/members", { as: "leo@lab.test", project: p })).status).toBe(403);
    expect((await call("/projects/join", { as: "leo@lab.test", body: { code: "nope" } })).status).toBe(404);
    const joined = await call("/projects/join", { as: "leo@lab.test", body: { code: ` ${mine.invite_code.toLowerCase().slice(0, 4)}-${mine.invite_code.slice(4)} ` } });
    expect(joined.status).toBe(201);
    const people = (await call("/members", { as: "leo@lab.test", project: p })).json as Member[];
    expect(people.map((m) => [m.name, m.is_admin])).toEqual([
      ["Priya", true],
      ["Leo", false],
    ]);
    // Members of a project don't see its invite code; admins hear that someone joined.
    expect((await call("/project", { as: "leo@lab.test", project: p })).json.invite_code).toBeUndefined();
    expect((await call("/notifications", { as: "priya@lab.test", project: p })).json.some((n: { kind: string }) => n.kind === "joined")).toBe(true);
  });

  it("keeps each project's check-ins, milestones and admin rights separate", async () => {
    const p = (await call("/projects", { as: "leo@lab.test", body: { title: "Side project" } })).json.id as number;
    await call("/updates/2031-01-02", { method: "PUT", as: "leo@lab.test", project: p, body: { done: ["side work"] } });
    await call("/milestones", { as: "leo@lab.test", project: p, body: { title: "Side deadline", due_date: "2031-02-01" } });
    const main = (await call("/updates?date=2031-01-02", { as: "leo@lab.test" })).json.updates as Update[];
    expect(main).toEqual([]);
    expect(((await call("/milestones")).json as Milestone[]).some((m) => m.title === "Side deadline")).toBe(false);
    // Leo is admin of his project but not of project 1.
    expect((await call("/schedule/dates", { as: "leo@lab.test", body: { date: "2031-01-09" } })).status).toBe(403);
    expect((await call("/schedule/dates", { as: "leo@lab.test", project: p, body: { date: "2031-01-09" } })).status).toBe(201);
    // Someone outside the project can't poke into it or be poked from it.
    const m = await ids();
    expect((await call("/pokes", { as: "leo@lab.test", project: p, body: { to: m.Priya } })).status).toBe(400);
  });

  it("admins rename, re-theme and rotate the code; members can't", async () => {
    expect((await call("/project", { method: "PATCH", as: "priya@lab.test", body: { title: "Hijack" } })).status).toBe(403);
    const r = await call("/project", { method: "PATCH", body: { title: "Harbour Lab Weekly", subtitle: "Team Standup", theme: "runway" } });
    expect(r.json).toMatchObject({ title: "Harbour Lab Weekly", theme: "runway" });
    expect((await call("/project", { method: "PATCH", body: { title: "  " } })).status).toBe(400);
    expect((await call("/project", { method: "PATCH", body: { theme: "neon" } })).json.theme).toBe("runway");
    // Themes added after the first release (stored in projects.palette since migration 0003) save and load too.
    for (const theme of ["notebook", "studio"]) {
      expect((await call("/project", { method: "PATCH", body: { theme } })).json.theme).toBe(theme);
      expect((await call("/session")).json.projects.find((x: { id: number }) => x.id === 1).theme).toBe(theme);
    }
    const code = (await call("/project/invite", { body: {} })).json.invite_code;
    expect(code).not.toBe("TESTCODE");
    expect((await call("/projects/join", { as: "first_visit@example.edu", body: { code: "TESTCODE" } })).status).toBe(404);
    await call("/project", { method: "PATCH", body: { theme: "terminal" } });
  });

  it("members can leave; the only admin hands over first; rejoining restores the membership", async () => {
    const p = (await call("/projects", { as: "priya@lab.test", body: { title: "Leaving test" } })).json.id as number;
    const code = (await call("/project", { as: "priya@lab.test", project: p })).json.invite_code;
    await call("/projects/join", { as: "leo@lab.test", body: { code } });
    const left = await call("/leave", { as: "priya@lab.test", project: p, body: {} });
    expect(left.status).toBe(400);
    expect(left.json.error).toContain("only admin");
    expect((await call("/leave", { as: "leo@lab.test", project: p, body: {} })).status).toBe(200);
    expect((await call("/members", { as: "leo@lab.test", project: p })).status).toBe(403);
    expect((await call("/session", { as: "leo@lab.test" })).json.projects.some((x: { id: number }) => x.id === p)).toBe(false);
    expect((await call("/projects/join", { as: "leo@lab.test", body: { code } })).status).toBe(201);
    expect((await call("/members", { as: "leo@lab.test", project: p })).status).toBe(200);
  });
});

describe("presenting order", () => {
  it("is shared through the meeting state and survives a reset", async () => {
    const m = await ids();
    await call("/meetings/2031-03-06/actions", { body: { type: "order", order: [m.Leo, m.Priya, m.Leo, "x"] } });
    await call("/meetings/2031-03-06/actions", { body: { type: "reset" } });
    expect((await call("/meetings/2031-03-06/state", { as: "priya@lab.test" })).json.state.order).toEqual([m.Leo, m.Priya]);
  });
});

describe("away calendar", () => {
  it("people mark their own away days, which every project they're in sees", async () => {
    const r = await call("/account/away", { as: "priya@lab.test", body: { from_date: "2031-04-06", to_date: "2031-04-10", note: "INFORMS conference" } });
    expect(r.status).toBe(201);
    expect((await call("/account/away", { as: "priya@lab.test", body: { from_date: "2031-04-10", to_date: "2031-04-06" } })).status).toBe(400);
    const cal = (await call("/calendar?from=2031-04-01&to=2031-04-30", { as: "leo@lab.test" })).json;
    expect(cal.away).toEqual([expect.objectContaining({ member_id: (await ids()).Priya, from_date: "2031-04-06", to_date: "2031-04-10", note: "INFORMS conference" })]);
    // Only Priya can remove it, whatever id someone else sends.
    await call(`/account/away/${r.json.id}`, { method: "DELETE", as: "leo@lab.test" });
    expect((await call("/calendar?from=2031-04-01&to=2031-04-30")).json.away).toHaveLength(1);
    await call(`/account/away/${r.json.id}`, { method: "DELETE", as: "priya@lab.test" });
    expect((await call("/calendar?from=2031-04-01&to=2031-04-30")).json.away).toHaveLength(0);
  });
  it("doesn't show away days of people outside the project", async () => {
    await call("/account/away", { as: "first_visit@example.edu", body: { from_date: "2031-05-01", to_date: "2031-05-02" } });
    expect((await call("/calendar?from=2031-05-01&to=2031-05-31")).json.away).toEqual([]);
  });
});

describe("meeting whiteboard", () => {
  const D = "2031-07-03";
  it("anyone adds notes; a note being typed in is locked to its typist", async () => {
    const a = (await call(`/notes/${D}`, { as: "priya@lab.test", body: { text: "Decision: use the 15-day set", x: 0.1, y: 20 } })).json;
    expect(a).toMatchObject({ text: "Decision: use the 15-day set", editing_by: (await ids()).Priya });
    // Leo can't type over Priya while she is typing, but can move the note.
    const blocked = await call(`/notes/${D}/${a.id}`, { method: "PATCH", as: "leo@lab.test", body: { text: "overwritten" } });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toContain("Priya is typing");
    expect((await call(`/notes/${D}/${a.id}`, { method: "PATCH", as: "leo@lab.test", body: { x: 5, y: -3 } })).json).toMatchObject({ x: 1, y: 0 });
    expect((await call(`/notes/${D}/${a.id}/lock`, { as: "leo@lab.test", body: { on: true } })).status).toBe(409);
    // Once she stops, Leo can take over.
    await call(`/notes/${D}/${a.id}/lock`, { as: "priya@lab.test", body: { on: false } });
    expect((await call(`/notes/${D}/${a.id}/lock`, { as: "leo@lab.test", body: { on: true } })).status).toBe(200);
    expect((await call(`/notes/${D}/${a.id}`, { method: "PATCH", as: "leo@lab.test", body: { text: "Decision: 15-day set, plus peak hour" } })).json.text).toBe(
      "Decision: 15-day set, plus peak hour",
    );
  });
  it("only the author or an admin removes a note with text in it", async () => {
    const n = (await call(`/notes/${D}`, { as: "leo@lab.test", body: { text: "Leo's note" } })).json;
    expect((await call(`/notes/${D}/${n.id}`, { method: "DELETE", as: "priya@lab.test" })).status).toBe(403);
    expect((await call(`/notes/${D}/${n.id}`, { method: "DELETE" })).status).toBe(200); // Alex is an admin
    expect(((await call(`/notes/${D}`)).json as { id: number }[]).some((x) => x.id === n.id)).toBe(false);
  });
  it("files the notes as a flight log on the calendar once the meeting is over", async () => {
    const before = (await call(`/calendar?from=${D}&to=${D}`)).json;
    expect(before.logs).toEqual([]); // the meeting hasn't happened yet
    await call(`/meetings/${D}/actions`, { body: { type: "phase", phase: "wrap" } });
    const after = (await call(`/calendar?from=${D}&to=${D}`)).json;
    expect(after.logs).toEqual([{ date: D, count: 1, preview: "Decision: 15-day set, plus peak hour" }]);
  });
  it("keeps notes inside their project", async () => {
    const p = (await call("/projects", { as: "leo@lab.test", body: { title: "Notes elsewhere" } })).json.id as number;
    await call(`/notes/${D}`, { as: "leo@lab.test", project: p, body: { text: "secret side note" } });
    expect(((await call(`/notes/${D}`)).json as { text: string }[]).map((x) => x.text)).not.toContain("secret side note");
    expect((await call(`/notes/${D}`, { as: "priya@lab.test", project: p })).status).toBe(403);
  });
});

describe("badges: five presets or a custom one", () => {
  it("offers five presets and refuses others; custom badges need a name and can't be rankings", async () => {
    const m = await ids();
    const elena = { as: "elena@lab.test" };
    expect((await call("/badges", elena)).json.catalog).toHaveLength(5);
    expect((await call("/badges", { ...elena, body: { member_id: m.Priya, badge_key: "coffee_alchemist" } })).status).toBe(400);
    const ok = await call("/badges", { ...elena, body: { member_id: m.Priya, badge_key: "custom", label: "  Gantt   Whisperer ", icon: "🦉" } });
    expect(ok.status).toBe(201);
    expect(ok.json).toMatchObject({ badge_key: "custom", label: "Gantt Whisperer", icon: "🦉" });
    expect((await call("/badges", { ...elena, body: { member_id: m.Priya, badge_key: "custom", label: "Best researcher" } })).json.error).toContain("not rankings");
    expect((await call("/badges", { ...elena, body: { member_id: m.Priya, badge_key: "custom", label: "x" } })).status).toBe(400);
    expect((await call("/badges", { ...elena, body: { member_id: m.Priya, badge_key: "custom", label: "Plot Artist", icon: "<b>" } })).json.icon).toBe("🏅");
    expect((await call("/badges", { body: { member_id: m.Priya, badge_key: "custom", label: "Plot Artist" } })).status).toBe(403);
  });
});

describe("waiting on you", () => {
  it("counts only requests still waiting for an answer, and doesn't stack identical notifications", async () => {
    const m = await ids();
    const D = "2031-08-07";
    const ask = () => call(`/updates/${D}`, { method: "PUT", as: "leo@lab.test", body: { waiting: [{ member_id: m.Elena, text: "duplicate check" }] } });
    const first = (await ask()).json as Update;
    await ask(); // sent again without the item id, as a fresh form would
    const notes = (await call("/notifications", { as: "elena@lab.test" })).json as { kind: string; payload: { text?: string } }[];
    expect(notes.filter((n) => n.kind === "waiting" && n.payload.text === "duplicate check")).toHaveLength(1);
    const before = (await call("/me", { as: "elena@lab.test" })).json.waiting_on_me as number;
    const item = ((await call(`/updates?date=${D}`, { as: "elena@lab.test" })).json.updates as Update[]).find((u) => u.id === first.id)!.waiting[0];
    await call(`/waiting/${first.id}/${item.id}`, { as: "elena@lab.test", body: { action: "request_clear" } });
    expect((await call("/me", { as: "elena@lab.test" })).json.waiting_on_me).toBe(before - 1);
  });
});

describe("round 7: members, closing projects, drafts", () => {
  it("admins can't drop their own admin rights or remove themselves", async () => {
    const m = await ids();
    expect((await call(`/admin/members/${m.Alex}`, { method: "PATCH", body: { is_admin: false } })).status).toBe(400);
    expect((await call(`/admin/members/${m.Alex}`, { method: "PATCH", body: { active: false } })).status).toBe(400);
  });

  it("a removed member can be deleted for good; only their check-ins stay", async () => {
    const added = (await call("/admin/members", { body: { email: "leaver@example.edu", name: "Leaver" } })).json as Member;
    await call("/updates/2031-09-04", { method: "PUT", as: "leaver@example.edu", body: { done: ["last week's work"] } });
    await call("/badges", { as: "elena@lab.test", body: { member_id: added.id, badge_key: "team_player" } });
    expect((await call(`/admin/members/${added.id}`, { method: "DELETE" })).status).toBe(400); // remove first
    await call(`/admin/members/${added.id}`, { method: "PATCH", body: { active: false } });
    expect((await call(`/admin/members/${added.id}`, { method: "DELETE", as: "priya@lab.test" })).status).toBe(403);
    expect((await call(`/admin/members/${added.id}`, { method: "DELETE" })).status).toBe(200);
    const people = (await call("/members")).json as Member[];
    expect(people.find((p) => p.id === added.id)).toMatchObject({ deleted: true, active: false });
    expect(((await call("/badges")).json.awarded as { member_id: number }[]).some((b) => b.member_id === added.id)).toBe(false);
    expect(((await call("/updates?date=2031-09-04")).json.updates as Update[]).map((u) => u.member_id)).toContain(added.id);
    expect((await call(`/admin/members/${added.id}`, { method: "PATCH", body: { active: true } })).status).toBe(404);
    expect((await call("/me", { as: "leaver@example.edu" })).status).toBe(403);
  });

  it("the last person leaving must confirm, and the project then closes for good", async () => {
    const p = (await call("/projects", { as: "priya@lab.test", body: { title: "Short-lived" } })).json.id as number;
    const code = (await call("/project", { as: "priya@lab.test", project: p })).json.invite_code;
    const warn = await call("/leave", { as: "priya@lab.test", project: p, body: {} });
    expect(warn.status).toBe(409);
    expect(warn.json.last_member).toBe(true);
    expect((await call("/leave", { as: "priya@lab.test", project: p, body: { close: true } })).json).toMatchObject({ closed: true });
    expect((await call("/projects/join", { as: "leo@lab.test", body: { code } })).status).toBe(404);
    expect((await call("/members", { as: "priya@lab.test", project: p })).status).toBe(410);
  });

  it("drafts autosave without notifying anyone; submitting sends the requests", async () => {
    const m = await ids();
    const D = "2031-09-11";
    const n = async () => ((await call("/notifications", { as: "priya@lab.test" })).json as { kind: string; payload: { text?: string } }[]).filter((x) => x.payload.text === "draft-only ask").length;
    await call(`/updates/${D}`, { method: "PUT", as: "leo@lab.test", body: { waiting: [{ id: "draftask1", member_id: m.Priya, text: "draft-only ask" }], submit: false } });
    expect(await n()).toBe(0);
    await call(`/updates/${D}`, { method: "PUT", as: "leo@lab.test", body: { waiting: [{ id: "draftask1", member_id: m.Priya, text: "draft-only ask" }], submit: true } });
    expect(await n()).toBe(1);
  });
});

describe("trial switcher", () => {
  const team = "team.cloudflareaccess.com";
  const prod = { ...env, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: "aud-1", TRIAL_SWITCHER: "" } as unknown as Env;
  const signer = async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
    const sign = (email: string) =>
      new SignJWT({ email }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(`https://${team}`).setAudience("aud-1").setExpirationTime("5m").sign(privateKey);
    return { keys, sign };
  };
  const req = (token: string, as?: string) =>
    new Request("https://pm.example.workers.dev/api/session", { headers: { "cf-access-jwt-assertion": token, ...(as ? { "x-dev-user": as } : {}) } });

  it("ignores x-dev-user behind Access unless TRIAL_SWITCHER is on", async () => {
    const { keys, sign } = await signer();
    const r = await resolveIdentity(req(await sign("alex@lab.test"), "elena@lab.test"), prod, keys);
    expect(r).toEqual({ ok: true, identity: { kind: "member", email: "alex@lab.test" } });
  });
  it("with TRIAL_SWITCHER on, acts as the teammate and keeps who signed in", async () => {
    const { keys, sign } = await signer();
    const r = await resolveIdentity(req(await sign("alex@lab.test"), "Elena@lab.test"), { ...prod, TRIAL_SWITCHER: "on" }, keys);
    expect(r).toEqual({ ok: true, identity: { kind: "member", email: "elena@lab.test", signedInAs: "alex@lab.test" } });
  });
  it("still needs a valid Access token", async () => {
    const { keys } = await signer();
    const r = await resolveIdentity(req("not-a-token", "elena@lab.test"), { ...prod, TRIAL_SWITCHER: "on" }, keys);
    expect(r.ok).toBe(false);
  });
});
