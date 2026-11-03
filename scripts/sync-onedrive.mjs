// Pull a full JSON export from the deployed app and write it into the team's OneDrive folder.
// Run by hand (`npm run backup`) or from Windows Task Scheduler; OneDrive syncs the file to everyone.
//
// Needs backup.config.json next to package.json (gitignored), e.g.
// {
//   "url": "https://pm.<subdomain>.workers.dev",
//   "clientId": "<Access service token client id>",
//   "clientSecret": "<Access service token client secret>",
//   "folder": "C:\\Users\\you\\OneDrive - ...\\Elena Rossi's files - Lab_Docs\\Weekly Update Slides\\Standup backups",
//   "keepDays": 120
// }
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const configPath = new URL("../backup.config.json", import.meta.url);
if (!existsSync(configPath)) {
  console.error("Missing backup.config.json — create it from the example at the top of scripts/sync-onedrive.mjs (see docs/MAINTAINING.md, "Backups into OneDrive").");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
for (const k of ["url", "clientId", "clientSecret", "folder"]) {
  if (!cfg[k]) {
    console.error(`backup.config.json is missing "${k}".`);
    process.exit(2);
  }
}

const headers = { "CF-Access-Client-Id": cfg.clientId, "CF-Access-Client-Secret": cfg.clientSecret };
const res = await fetch(new URL("/api/export", cfg.url), { headers });
const text = await res.text();
if (!res.ok || !text.startsWith("{")) {
  console.error(`Export failed (${res.status}). First 200 chars:\n${text.slice(0, 200)}`);
  process.exit(1);
}
const data = JSON.parse(text);
if (data.app !== "team-standup") {
  console.error("Response is not a Standup export; check the url.");
  process.exit(1);
}

mkdirSync(cfg.folder, { recursive: true });
const stamp = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // SGT date
const pretty = JSON.stringify(data, null, 2);
writeFileSync(join(cfg.folder, `standup-backup-${stamp}.json`), pretty);
writeFileSync(join(cfg.folder, "standup-latest.json"), pretty);

// Prune dated backups older than keepDays (latest.json is always kept).
const keepMs = (cfg.keepDays ?? 120) * 86_400_000;
for (const f of readdirSync(cfg.folder)) {
  if (!/^standup-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f)) continue;
  const p = join(cfg.folder, f);
  if (Date.now() - statSync(p).mtimeMs > keepMs) unlinkSync(p);
}
// Figures go in as image files, fetched once each (a figure's bytes never change without a new updated_at).
const figDir = join(cfg.folder, "figures");
mkdirSync(figDir, { recursive: true });
let fetched = 0;
for (const f of data.tables.figures ?? []) {
  const name = `${f.project_id}_${f.meeting_date}_${f.member_id}.${f.mime.split("/")[1]}`;
  const target = join(figDir, name);
  if (existsSync(target) && statSync(target).mtimeMs >= Date.parse(f.updated_at)) continue;
  const img = await fetch(new URL(`/api/p/${f.project_id}/figures/${f.meeting_date}/${f.member_id}`, cfg.url), { headers });
  if (!img.ok) {
    console.warn(`Could not fetch figure ${name} (${img.status})`);
    continue;
  }
  writeFileSync(target, Buffer.from(await img.arrayBuffer()));
  fetched++;
}
const rows = Object.values(data.tables).reduce((n, t) => n + t.length, 0);
console.log(`Saved ${rows} rows to ${join(cfg.folder, `standup-backup-${stamp}.json`)} and ${fetched} new figure file(s).`);
