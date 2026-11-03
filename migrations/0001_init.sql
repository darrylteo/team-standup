-- Initial schema. Once this file is committed and deployed it is append-only (rule C2): put later changes in
-- 0002_*.sql and so on. See docs/MAINTAINING.md for how to write a safe migration.

-- People. One row per email; the profile (name, avatar, flairs) is shared by every project they are in.
CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  handle TEXT UNIQUE COLLATE NOCASE, -- @handle for mentions; NULL until set
  avatar TEXT NOT NULL DEFAULT '{}',
  profile TEXT NOT NULL DEFAULT '{}', -- flairs and background
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A team that meets: its own members, calendar, check-ins, milestones and colour theme.
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'terminal' CHECK (theme IN ('terminal', 'lounge', 'runway')),
  invite_code TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Who is in which project. Role and admin are per project; leaving or removal deactivates so history keeps names.
CREATE TABLE memberships (
  project_id INTEGER NOT NULL REFERENCES projects(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  role TEXT NOT NULL DEFAULT 'researcher' CHECK (role IN ('researcher', 'prof')),
  is_admin INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (project_id, member_id)
);
CREATE INDEX memberships_by_member ON memberships (member_id, active);

-- Meeting calendar managed by admins. Recurring rules are expanded into concrete dates when saved.
CREATE TABLE schedule_series (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  rule TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE meeting_dates (
  project_id INTEGER NOT NULL REFERENCES projects(id),
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '', -- '' = no set time
  series_id INTEGER REFERENCES schedule_series(id),
  cancelled INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES members(id),
  PRIMARY KEY (project_id, date)
);

CREATE TABLE updates (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  meeting_date TEXT NOT NULL,
  body TEXT NOT NULL,
  submitted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (project_id, member_id, meeting_date)
);
CREATE INDEX updates_by_date ON updates (project_id, meeting_date);

-- Figure of the week: one image per person per meeting, base64 so backups stay plain text.
CREATE TABLE figures (
  project_id INTEGER NOT NULL REFERENCES projects(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  meeting_date TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (project_id, member_id, meeting_date)
);

CREATE TABLE milestones (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  owners TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'at_risk', 'done')),
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES members(id),
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX milestones_by_project ON milestones (project_id, due_date);

CREATE TABLE milestone_history (
  id INTEGER PRIMARY KEY,
  milestone_id INTEGER NOT NULL REFERENCES milestones(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changes TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE pokes (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  from_id INTEGER NOT NULL REFERENCES members(id),
  to_id INTEGER NOT NULL REFERENCES members(id),
  note TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One commendation per giver, per teammate, per calendar week (Monday date), so everyone can commend everyone.
CREATE TABLE commends (
  project_id INTEGER NOT NULL REFERENCES projects(id),
  from_id INTEGER NOT NULL REFERENCES members(id),
  to_id INTEGER NOT NULL REFERENCES members(id),
  week TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (project_id, from_id, to_id, week)
);
CREATE INDEX commends_by_week ON commends (project_id, week);

-- Uploaded avatar photos, base64 so backups and restores stay plain text. Max ~1 MB decoded.
-- in_use = 0 keeps the last photo around so people can switch back to it after trying the drawn avatar.
CREATE TABLE avatar_images (
  member_id INTEGER PRIMARY KEY REFERENCES members(id),
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  in_use INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Uploaded profile banner images (profile.background = "custom" shows it).
CREATE TABLE banner_images (
  member_id INTEGER PRIMARY KEY REFERENCES members(id),
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE badges (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  badge_key TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  awarded_by INTEGER NOT NULL REFERENCES members(id),
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  kind TEXT NOT NULL,
  actor_id INTEGER REFERENCES members(id),
  payload TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at TEXT
);
CREATE INDEX notifications_by_member ON notifications (member_id, project_id, read_at);

-- Live meeting state per meeting date, shared by every screen.
CREATE TABLE meeting_state (
  project_id INTEGER NOT NULL REFERENCES projects(id),
  meeting_date TEXT NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (project_id, meeting_date)
);

-- Who changed the project, its people or its schedule, and when.
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  actor_id INTEGER NOT NULL REFERENCES members(id),
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX admin_log_by_project ON admin_log (project_id, at);
