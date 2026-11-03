#!/usr/bin/env node
// Project guard for Claude Code Write/Edit tool calls. Rule IDs match CLAUDE.md.
//   node guard.mjs pre   → PreToolUse: blocks the edit (exit 2) before it happens
//   node guard.mjs post  → PostToolUse: reports a violation in the edited file (exit 2) so it gets fixed
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

const phase = process.argv[2];
const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);
const abs = isAbsolute(filePath) ? filePath : resolve(root, filePath);
const rel = relative(root, abs).replaceAll("\\", "/");
if (rel.startsWith("..") || rel.startsWith("node_modules/")) process.exit(0);

const fail = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
};

const tracked = (p) => {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", p], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

if (phase === "pre") {
  // C2: migrations are append-only once committed.
  if (/^migrations\/\d{4}_.+\.sql$/.test(rel) && existsSync(abs) && tracked(rel)) {
    fail(
      `C2: ${rel} is already committed, so editing it would desync databases that already ran it. ` +
        `Create migrations/${String(Number(rel.slice(11, 15)) + 1).padStart(4, "0")}_<what>.sql with the change instead.`,
    );
  }
  // C4: keep the project folder clean; scratch work goes to the session scratchpad.
  if (/(^|\/)(scratch|tmp|temp)[^/]*$|\.(bak|orig|tmp|log)$|(^|\/)debug[-_][^/]*$/i.test(rel)) {
    fail(`C4: "${rel}" looks like a scratch file. Write it to the session scratchpad directory instead of the project, or give it a real name and place.`);
  }
}

if (phase === "post" && existsSync(abs)) {
  const text = readFileSync(abs, "utf8");

  // C1: CLAUDE.md hard limit.
  if (basename(rel) === "CLAUDE.md") {
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words > 350) fail(`C1: CLAUDE.md is ${words} words; the limit is 350. Cut ${words - 350} words — move detail into docs/ and link it.`);
  }

  // C3: colours come from design tokens so light/dark themes stay consistent.
  if (/^src\/client\/.+\.(tsx?|css)$/.test(rel) && rel !== "src/client/styles/tokens.css") {
    const lines = text.split("\n");
    const hits = lines
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /#[0-9a-fA-F]{3,8}\b(?![-\w])|\brgba?\(|\bhsla?\(|\boklch\(/.test(l) && !/c3-ok/.test(l));
    if (hits.length) {
      const where = hits.slice(0, 3).map(([n, l]) => `  line ${n}: ${l.trim().slice(0, 90)}`).join("\n");
      fail(`C3: raw colour in ${rel}. Add a token to src/client/styles/tokens.css (light + dark) and use var(--token):\n${where}`);
    }
  }

  // U2: native confirm/prompt/alert are suppressed by some browsers and webviews (they return "no" without
  // showing anything), which silently broke Remove/Cancel buttons. Use the in-app dialog from src/client/ask.tsx.
  if (/^src\/client\/.+\.tsx?$/.test(rel)) {
    const hits = text
      .split("\n")
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => !/^\s*(\/\/|\*|\/\*)/.test(l) && /(^|[^\w.])(window\.)?(confirm|prompt|alert)\(/.test(l));
    if (hits.length) {
      fail(`U2: ${rel} ${hits.map(([n]) => `line ${n}`).join(", ")} calls the browser's confirm/prompt/alert, which some browsers silently suppress. Use const ask = useAsk() from src/client/ask.tsx, e.g. if ((await ask({ title, confirm: "Remove", danger: true })) === null) return;`);
    }
  }

  // S1: the dev identity must never be configured for deployed environments.
  if (rel === "wrangler.jsonc" && /DEV_USER/.test(text)) {
    fail("S1: DEV_USER found in wrangler.jsonc. It belongs only in .dev.vars (local dev). Remove it from wrangler.jsonc.");
  }
}
process.exit(0);
