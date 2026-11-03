// Restore a Standup JSON backup into D1. Replaces ALL data in the target database.
//   node scripts/restore.mjs <backup.json> --local|--remote --yes
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { executeSql, sql, target } from "./lib.mjs";

const file = process.argv[2];
const where = target(process.argv);
if (!file || file.startsWith("--")) {
  console.error("Usage: node scripts/restore.mjs <backup.json> --local|--remote --yes");
  process.exit(2);
}
if (!process.argv.includes("--yes")) {
  console.error(`This wipes the ${where.slice(2)} database and loads ${file}. Re-run with --yes to confirm.`);
  process.exit(2);
}
const data = JSON.parse(readFileSync(file, "utf8"));
if (data.app !== "team-standup") {
  console.error("Not a Standup backup file.");
  process.exit(1);
}

// Children first when deleting, parents first when inserting.
const order = [
  "members",
  "projects",
  "memberships",
  "schedule_series",
  "meeting_dates",
  "updates",
  "figures",
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
];
// Figures are listed in the export without bytes; their files sit in figures/ next to the backup JSON.
const figDir = join(dirname(file), "figures");
data.tables.figures = (data.tables.figures ?? []).flatMap((f) => {
  const name = `${f.project_id}_${f.meeting_date}_${f.member_id}.${f.mime.split("/")[1]}`;
  if (!existsSync(join(figDir, name))) {
    console.warn(`Skipping figure ${name}: file not found in ${figDir}`);
    return [];
  }
  return [{ ...f, data: readFileSync(join(figDir, name)).toString("base64") }];
});
const stmts = ["PRAGMA defer_foreign_keys = true;", ...[...order].reverse().map((t) => `DELETE FROM ${t};`)];
// D1 caps one SQL statement at ~100 KB, so long values (avatar photos) are inserted empty and appended in chunks.
const CHUNK = 60_000;
let rows = 0;
for (const t of order) {
  for (const row of data.tables[t] ?? []) {
    const cols = Object.keys(row);
    const long = cols.filter((c) => typeof row[c] === "string" && row[c].length > CHUNK);
    stmts.push(`INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map((c) => sql(long.includes(c) ? "" : row[c])).join(", ")});`);
    for (const c of long) {
      for (let i = 0; i < row[c].length; i += CHUNK) {
        stmts.push(`UPDATE ${t} SET ${c} = ${c} || ${sql(row[c].slice(i, i + CHUNK))} WHERE rowid = last_insert_rowid();`);
      }
    }
    rows++;
  }
}
executeSql(stmts, where);
console.log(`Restored ${rows} rows into ${where.slice(2)} database.`);
