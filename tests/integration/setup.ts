import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import("../../src/worker/index");
    }
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Alex and Elena are admins, as in production.
const team = [
  ["alex@lab.test", "Alex", "researcher", 1],
  ["priya@lab.test", "Priya", "researcher", 0],
  ["leo@lab.test", "Leo", "researcher", 0],
  ["elena@lab.test", "Elena", "prof", 1],
] as const;
// Everyone is in project 1, whose invite code is TESTCODE.
await env.DB.batch([
  ...team.map(([email, name]) => env.DB.prepare("INSERT OR IGNORE INTO members (email, name) VALUES (?, ?)").bind(email, name)),
  env.DB.prepare("INSERT OR IGNORE INTO projects (id, title, subtitle, invite_code, created_by) VALUES (1, 'Harbour Lab', 'Standup', 'TESTCODE', 1)"),
  ...team.map(([email, , role, admin], i) =>
    env.DB.prepare("INSERT OR IGNORE INTO memberships (project_id, member_id, role, is_admin, sort) SELECT 1, id, ?, ?, ? FROM members WHERE email = ?").bind(role, admin, i, email),
  ),
]);
