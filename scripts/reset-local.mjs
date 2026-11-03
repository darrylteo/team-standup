// Wipe a local database, replay every migration and load the team plus demo data.
// STANDUP_STATE picks the folder: unset is your dev database (.wrangler/state); the browser tests use .wrangler/e2e,
// so test runs never leave their data in the app you click around in.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { localState } from "./lib.mjs";

const state = localState();
rmSync(state, { recursive: true, force: true });
const run = (cmd) => {
  const r = spawnSync(cmd, { stdio: "inherit", shell: true, env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(`npx wrangler d1 migrations apply DB --local --persist-to "${state}"`);
run("node scripts/seed.mjs --local --demo");
