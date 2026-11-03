// Cut a release: checks pass, the "Unreleased" patch notes become a numbered version, package.json follows.
//   npm run release -- patch "Optional title"     (also: minor, major)
// It never commits, tags or deploys; it prints those steps so you run them when ready (docs/MAINTAINING.md).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { bump, parseChangelog, unreleased } from "../src/shared/changelog.ts";

const [part, title = ""] = process.argv.slice(2);
if (!["patch", "minor", "major"].includes(part)) {
  console.error('Usage: npm run release -- patch|minor|major ["Optional title"]\n  patch = fixes, minor = new features, major = big changes people must relearn');
  process.exit(2);
}

const md = readFileSync("CHANGELOG.md", "utf8").replace(/\r\n/g, "\n");
const notes = unreleased(md);
if (!notes.length) {
  console.error('Nothing under "## Unreleased" in CHANGELOG.md. Add a line per change the team will notice, then run this again.');
  process.exit(1);
}

console.log("Running typecheck and tests first…");
const check = spawnSync("npm", ["run", "check"], { stdio: "inherit", shell: true });
if (check.status !== 0) {
  console.error("Checks failed, so nothing was released. Fix them and run this again.");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const latest = parseChangelog(md)[0]?.version ?? pkg.version;
const next = bump(latest, part);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
const heading = `## ${next} · ${today}${title ? ` · ${title}` : ""}`;
writeFileSync("CHANGELOG.md", md.replace("## Unreleased\n", `## Unreleased\n\n${heading}\n`).replace(/\n{3,}/g, "\n\n"));
pkg.version = next;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

console.log(`\nReleased ${next} with ${notes.length} note(s):\n${notes.map((n) => `  - ${n}`).join("\n")}`);
console.log(`\nNext:\n  git add -A && git commit -m "Release ${next}"\n  git tag v${next}\n  npm run deploy`);
