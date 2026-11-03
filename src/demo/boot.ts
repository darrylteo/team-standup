// Public demo: the Worker API runs inside the page against an in-memory SQLite database, so the site is static files
// only (no Worker requests, nothing shared between visitors). Each tab keeps its own copy in sessionStorage, so
// switching persona (which reloads) keeps your edits; closing the tab or pressing Reset starts again from the seed.
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import team from "../../scripts/members.json";
import { demoStatements } from "../../scripts/demo-data.mjs";
import { seedStatements } from "../../scripts/seed-statements.mjs";
import type { Env } from "../worker/env";
import worker from "../worker/index";
import { demoD1 } from "./d1";

const STORE_KEY = "standup.demoDb";
const migrations = import.meta.glob("../../migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function load(): Uint8Array | null {
  try {
    const saved = sessionStorage.getItem(STORE_KEY);
    return saved ? Uint8Array.from(atob(saved), (ch) => ch.charCodeAt(0)) : null;
  } catch {
    return null;
  }
}

const SQL = await initSqlJs({ locateFile: () => wasmUrl });
const saved = load();
const db = saved ? new SQL.Database(saved) : new SQL.Database();
if (!saved) {
  for (const file of Object.keys(migrations).sort()) db.exec(migrations[file]);
  // One meeting, on Thu 29 Oct 2026; src/demo/clock.ts holds the page's clock on that day.
  db.exec([...seedStatements(team, "DEMO2026"), ...demoStatements({ single: true })].join("\n"));
}

let pending = 0;
function save() {
  // Batch the copies: one save per burst of writes.
  if (pending) return;
  pending = window.setTimeout(() => {
    pending = 0;
    try {
      let bin = "";
      for (const b of db.export()) bin += String.fromCharCode(b);
      sessionStorage.setItem(STORE_KEY, btoa(bin));
    } catch {
      /* storage full or blocked: the demo still works until the next reload */
    }
  }, 300);
}

/** Forget this tab's copy and start again from the seed. */
export function resetDemo() {
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
  location.reload();
}

const admin = team.members.find((m) => m.admin) ?? team.members[0];
const env = { DB: demoD1(db, save), MEETING_WEEKDAY: "4", DEV_USER: admin.email } as unknown as Env;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  // The Worker honours DEV_USER and the persona switcher's x-dev-user header only on local hosts, hence localhost.
  const local = new Request(`http://localhost${url.pathname}${url.search}`, { method: req.method, headers: req.headers, body });
  return worker.fetch(local, env, ctx);
};
