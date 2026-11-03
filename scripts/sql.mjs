// SQL literal quoting, kept free of Node imports so the in-browser demo can build the same seed statements.
export const sql = (v) =>
  v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(typeof v === "object" ? JSON.stringify(v) : v).replaceAll("'", "''")}'`;
