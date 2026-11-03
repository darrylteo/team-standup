// The public demo's D1 stand-in (src/demo/d1.ts) must answer like D1 for every call shape the Worker uses.
import { readdirSync, readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";
import { demoD1 } from "../../src/demo/d1";
import { demoStatements } from "../../scripts/demo-data.mjs";
import { seedStatements } from "../../scripts/seed-statements.mjs";

const SQL = await initSqlJs();
let db: InstanceType<typeof SQL.Database>;
let writes = 0;
let d1: ReturnType<typeof demoD1>;

beforeEach(() => {
  db = new SQL.Database();
  db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, ok INTEGER)");
  writes = 0;
  d1 = demoD1(db, () => writes++);
});

describe("demo D1", () => {
  it("binds values, reports changes and the new row id, and calls onWrite only for writes", async () => {
    const r = await d1.prepare("INSERT INTO t (name, ok) VALUES (?, ?)").bind("a", true).run();
    expect(r.meta).toMatchObject({ changes: 1, last_row_id: 1 });
    expect(await d1.prepare("SELECT ok FROM t WHERE name = ?").bind("a").first("ok")).toBe(1);
    expect(writes).toBe(1);
    expect((await d1.prepare("SELECT * FROM t").all()).meta.changes).toBe(0);
    expect(writes).toBe(1);
  });

  it("returns null from first() when nothing matches, and raw rows with column names", async () => {
    await d1.prepare("INSERT INTO t (name) VALUES (?1)").bind("b").run();
    expect(await d1.prepare("SELECT * FROM t WHERE name = ?").bind("zzz").first()).toBeNull();
    expect(await d1.prepare("SELECT id, name FROM t").raw({ columnNames: true })).toEqual([["id", "name"], [1, "b"]]);
  });

  it("runs a batch as one transaction and rolls it all back on error", async () => {
    const ins = (n: string) => d1.prepare("INSERT INTO t (name) VALUES (?)").bind(n);
    await expect(d1.batch([ins("c"), ins("c")])).rejects.toThrow();
    expect((await d1.prepare("SELECT COUNT(*) AS n FROM t").first<{ n: number }>())!.n).toBe(0);
    const out = await d1.batch([ins("d"), d1.prepare("SELECT name FROM t")]);
    expect(out[1].results).toEqual([{ name: "d" }]);
  });
});

describe("public demo data", () => {
  const seeded = (opts: Parameters<typeof demoStatements>[0]) => {
    const fresh = new SQL.Database();
    for (const f of readdirSync("migrations").sort()) fresh.exec(readFileSync(`migrations/${f}`, "utf8"));
    const team = JSON.parse(readFileSync("scripts/members.json", "utf8"));
    fresh.exec([...seedStatements(team, "DEMO2026"), ...demoStatements(opts)].join("\n"));
    return (q: string) => fresh.exec(q)[0]?.values ?? [];
  };

  it("applies on top of every migration and places the next meeting on the coming Thursday", () => {
    const q = seeded({ today: new Date(2027, 0, 4) });
    expect(q("SELECT MIN(date) FROM meeting_dates WHERE date >= '2027-01-04'")[0][0]).toBe("2027-01-07");
    expect(q("SELECT COUNT(*) FROM updates WHERE meeting_date = '2027-01-07'")[0][0]).toBeGreaterThan(5);
  });

  it("gives the hosted demo exactly one meeting, on 29 Oct 2026, with every check-in on it", () => {
    const q = seeded({ single: true });
    expect(q("SELECT date FROM meeting_dates")).toEqual([["2026-10-29"]]);
    expect(q("SELECT DISTINCT meeting_date FROM updates WHERE project_id = 1")).toEqual([["2026-10-29"]]);
    expect(q("SELECT COUNT(*) FROM meeting_notes")[0][0]).toBe(0);
  });
});
