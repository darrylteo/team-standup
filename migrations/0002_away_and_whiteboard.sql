-- Away dates, the meeting whiteboard, custom badges, deleting members and closing projects. Additive only.

-- When someone is away (conference, leave, fieldwork). Belongs to the person, so it shows in every project they're in.
CREATE TABLE away (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id),
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL, -- inclusive
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX away_by_member ON away (member_id, to_date);

-- Notes on a meeting's whiteboard. Each note is edited on its own, so people can type at the same time;
-- whoever is typing in a note holds a short soft lock (editing_by / editing_at) so nobody overwrites them.
-- Once the meeting is over, the set is filed on the calendar as that meeting's flight log.
CREATE TABLE meeting_notes (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  meeting_date TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES members(id),
  text TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'amber',
  x REAL NOT NULL DEFAULT 0, -- left edge as a fraction of the board width (0–1)
  y REAL NOT NULL DEFAULT 0, -- top edge in pixels
  updated_by INTEGER REFERENCES members(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  editing_by INTEGER REFERENCES members(id),
  editing_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX meeting_notes_by_date ON meeting_notes (project_id, meeting_date);

-- Custom badges: pilots can name their own badge (badge_key = 'custom') besides the five presets.
ALTER TABLE badges ADD COLUMN label TEXT NOT NULL DEFAULT '';
ALTER TABLE badges ADD COLUMN icon TEXT NOT NULL DEFAULT '';

-- Removed members can be deleted for good from a project (e.g. after changing jobs). The row stays only so their
-- past check-ins keep a name; they no longer appear anywhere else in the project.
ALTER TABLE memberships ADD COLUMN deleted_at TEXT;

-- When the last person leaves, the project closes for good: its invite code stops working and nobody can open it.
ALTER TABLE projects ADD COLUMN closed_at TEXT;
