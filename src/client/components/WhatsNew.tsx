import { useState } from "react";
import changelog from "../../../CHANGELOG.md?raw";
import { compareVersions, parseChangelog } from "../../shared/changelog";
import { fmtDate } from "../format";
import { Dialog } from "./Projects";

const RELEASES = parseChangelog(changelog);
const APP_VERSION = RELEASES[0]?.version ?? "0.0.0";
const SEEN_KEY = "standup.seenVersion";

function seen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Footer with the version and "What's new". After a deploy, people who used an older version see a
 * gentle "new" marker until they open the notes; a first-time visitor has nothing to catch up on.
 */
export function WhatsNew() {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState(() => {
    const v = seen();
    if (v === null) markSeen();
    return v ?? APP_VERSION;
  });
  const fresh = compareVersions(last, APP_VERSION) < 0;
  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, APP_VERSION);
    } catch {
      /* private mode: the marker just shows again next time */
    }
  }
  return (
    <footer className="foot">
      <span className="mono">v{APP_VERSION}</span>·
      <button
        className={fresh ? "new" : ""}
        onClick={() => {
          setOpen(true);
          markSeen();
          setLast(APP_VERSION);
        }}
      >
        {fresh ? "✨ What's new" : "What's new"}
      </button>
      {open && (
        <Dialog title="What's new" onClose={() => setOpen(false)}>
          <div className="notes">
            {RELEASES.slice(0, 5).map((r) => (
              <section key={r.version}>
                <h3>
                  {r.version}
                  {r.title && ` · ${r.title}`} <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>{fmtDate(r.date, true)}</span>
                </h3>
                <ul>
                  {r.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Dialog>
      )}
    </footer>
  );
}
