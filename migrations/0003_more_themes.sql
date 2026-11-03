-- Two more project themes (Lab Notebook, Cozy Studio). 0001 limits projects.theme to three names with a CHECK that
-- SQLite can't change in place, and rebuilding projects fails on D1 because every project table points at it.
-- So the theme now lives in a new column without the CHECK; the app accepts only known keys (isThemeKey in
-- src/shared/catalog.ts), so future themes need no migration. The old theme column stays, unused.
ALTER TABLE projects ADD COLUMN palette TEXT NOT NULL DEFAULT 'terminal';
UPDATE projects SET palette = theme;
