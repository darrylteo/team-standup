// Upsert the first project and its team from scripts/members.json. `--demo` also loads sample data (local, or a trial database).
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { executeSql, target } from "./lib.mjs";
import { seedStatements } from "./seed-statements.mjs";

const where = target(process.argv);
const team = JSON.parse(readFileSync(new URL("./members.json", import.meta.url), "utf8"));
const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const code = Array.from({ length: 8 }, () => abc[randomInt(abc.length)]).join("");
const stmts = seedStatements(team, code);

if (process.argv.includes("--demo")) {
  // Remotely, demo data may only go into a trial database (one whose name ends in -trial), never the real one.
  const dbName = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").match(/"database_name":\s*"([^"]+)"/)?.[1] ?? "";
  if (where === "--remote" && !dbName.endsWith("-trial")) {
    console.error(`Demo data is for local dev or a trial database; wrangler.jsonc points at "${dbName}".`);
    process.exit(2);
  }
  const { demoStatements } = await import("./demo-data.mjs");
  stmts.push(...demoStatements());
}
executeSql(stmts, where);
console.log(`Seeded "${team.project.title}" with ${team.members.length} members (${where.slice(2)}).`);
