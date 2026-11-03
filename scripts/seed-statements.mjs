// The SQL that creates the first project and its team, shared by seed.mjs (through wrangler) and the in-browser demo.
import { sql } from "./sql.mjs";

export function seedStatements({ project, members }, inviteCode) {
  const memberId = (email) => `(SELECT id FROM members WHERE email = ${sql(email)})`;
  return [
    // People: handles and avatars are only set on first insert; after that people manage them on My profile.
    ...members.map(
      (m) =>
        `INSERT INTO members (email, name, handle, avatar) VALUES (${sql(m.email)}, ${sql(m.name)}, ${sql(m.handle ?? null)}, ${sql(m.avatar)})
       ON CONFLICT (email) DO UPDATE SET name = excluded.name;`,
    ),
    // Project 1 is created once, by the first admin in the list; its title and theme are then managed in the app.
    `INSERT INTO projects (id, title, subtitle, palette, invite_code, created_by)
     VALUES (1, ${sql(project.title)}, ${sql(project.subtitle)}, ${sql(project.theme)}, ${sql(inviteCode)}, ${memberId(members.find((m) => m.admin).email)})
     ON CONFLICT (id) DO NOTHING;`,
    // Admin flags are only set on first insert too; after that admins manage them on the Admin page.
    ...members.map(
      (m, i) =>
        `INSERT INTO memberships (project_id, member_id, role, is_admin, sort) VALUES (1, ${memberId(m.email)}, ${sql(m.role)}, ${m.admin ? 1 : 0}, ${i})
       ON CONFLICT (project_id, member_id) DO UPDATE SET role = excluded.role, sort = excluded.sort;`,
    ),
  ];
}
