// Helpers shared by the seed, restore and backup scripts.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export { sql } from "./sql.mjs";

export function target(argv) {
  if (argv.includes("--remote")) return "--remote";
  if (argv.includes("--local")) return "--local";
  console.error("Pass --local (dev database) or --remote (production database).");
  process.exit(2);
}

/** The local database folder: .wrangler/state for dev, or STANDUP_STATE (the browser tests use their own). */
export const localState = () => process.env.STANDUP_STATE || ".wrangler/state";

/** Run a SQL script against D1 through wrangler, via a temp file outside the project. */
export function executeSql(statements, where) {
  const dir = mkdtempSync(join(tmpdir(), "standup-"));
  const file = join(dir, "run.sql");
  writeFileSync(file, statements.join("\n"));
  try {
    const persist = where === "--local" ? ["--persist-to", `"${localState()}"`] : [];
    const r = spawnSync("npx", ["wrangler", "d1", "execute", "DB", where, ...persist, "--file", `"${file}"`, "--yes"], { stdio: "inherit", shell: true });
    if (r.status !== 0) process.exit(r.status ?? 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
