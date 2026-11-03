// Patch notes come from CHANGELOG.md, so the file in the repo and the app's "What's new" never disagree.

export interface Release {
  version: string; // semver, e.g. 1.2.0
  date: string; // YYYY-MM-DD
  title: string; // optional name after the date
  notes: string[];
}

const HEADING = /^## (\d+\.\d+\.\d+) · (\d{4}-\d{2}-\d{2})(?: · (.+))?$/;

/** Released entries, newest first. The "Unreleased" section and anything malformed are skipped. */
export function parseChangelog(md: string): Release[] {
  const out: Release[] = [];
  let cur: Release | null = null;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("## ")) {
      const m = HEADING.exec(line.trim());
      cur = m ? { version: m[1], date: m[2], title: m[3] ?? "", notes: [] } : null;
      if (cur) out.push(cur);
    } else if (cur && /^- /.test(line)) cur.notes.push(line.slice(2).trim());
  }
  return out;
}

/** Lines waiting under "## Unreleased". */
export function unreleased(md: string): string[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.trim() === "## Unreleased");
  if (start < 0) return [];
  const notes: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (l.startsWith("## ")) break;
    if (/^- /.test(l)) notes.push(l.slice(2).trim());
  }
  return notes;
}

/** Compare two x.y.z versions: negative if a is older. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export function bump(version: string, part: "patch" | "minor" | "major"): string {
  const [x, y, z] = version.split(".").map(Number);
  return part === "major" ? `${x + 1}.0.0` : part === "minor" ? `${x}.${y + 1}.0` : `${x}.${y}.${z + 1}`;
}
