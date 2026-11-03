// A D1Database stand-in over sql.js (SQLite compiled to WebAssembly), so the Worker's routes run unchanged inside the
// browser for the public demo. It covers what the app uses: prepare/bind/first/all/run/raw, batch and exec.
import type { Database, SqlValue } from "sql.js";

type Row = Record<string, unknown>;
type Executed = { rows: Row[]; columns: string[]; arrays: SqlValue[][]; changes: number; lastRowId: number };

function toSql(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (typeof v === "number" || typeof v === "string" || v instanceof Uint8Array) return v;
  throw new TypeError(`Demo database: cannot bind a value of type ${typeof v}`);
}

const result = (r: Executed) => ({
  success: true as const,
  results: r.rows,
  meta: { changes: r.changes, last_row_id: r.lastRowId, rows_read: r.rows.length, rows_written: r.changes, changed_db: r.changes > 0, duration: 0 },
});

export class DemoStatement {
  constructor(
    private db: Database,
    private query: string,
    private params: SqlValue[] = [],
    private onWrite: () => void = () => {},
  ) {}

  bind(...values: unknown[]) {
    return new DemoStatement(this.db, this.query, values.map(toSql), this.onWrite);
  }

  execute(): Executed {
    const stmt = this.db.prepare(this.query);
    try {
      stmt.bind(this.params);
      const columns = stmt.getColumnNames();
      const arrays: SqlValue[][] = [];
      while (stmt.step()) arrays.push(stmt.get());
      const isRead = stmt.getSQL().trimStart().slice(0, 6).toUpperCase() === "SELECT";
      const changes = isRead ? 0 : this.db.getRowsModified();
      const lastRowId = Number(this.db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] ?? 0);
      if (changes > 0) this.onWrite();
      return { rows: arrays.map((a) => Object.fromEntries(columns.map((c, i) => [c, a[i]]))), columns, arrays, changes, lastRowId };
    } finally {
      stmt.free();
    }
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const row = this.execute().rows[0];
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all() {
    return result(this.execute());
  }

  async run() {
    return result(this.execute());
  }

  async raw(opts?: { columnNames?: boolean }) {
    const { arrays, columns } = this.execute();
    return opts?.columnNames ? [columns, ...arrays] : arrays;
  }
}

/** Wrap a sql.js database as D1. `onWrite` runs after any statement that changed rows (the demo saves the tab's copy). */
export function demoD1(db: Database, onWrite: () => void = () => {}) {
  return {
    prepare: (query: string) => new DemoStatement(db, query, [], onWrite),
    async batch(statements: DemoStatement[]) {
      db.run("BEGIN");
      try {
        const out = statements.map((s) => result(s.execute()));
        db.run("COMMIT");
        return out;
      } catch (err) {
        db.run("ROLLBACK");
        throw err;
      }
    },
    async exec(query: string) {
      db.exec(query);
      onWrite();
      return { count: 1, duration: 0 };
    },
  };
}
