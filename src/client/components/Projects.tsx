import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { THEMES } from "../../shared/catalog";
import type { ThemeKey } from "../../shared/types";
import { api } from "../api";
import { useOnScreen } from "../hooks";
import { useSession } from "../session";
import { Flap } from "./Flap";

/** One palette card per theme; each shows the theme's own colours (tokens --tp-<theme>-*) whatever the current theme is. */
export function ThemePicker({ value, onPick }: { value: ThemeKey; onPick: (t: ThemeKey) => void }) {
  return (
    <div className="theme-pick" role="radiogroup" aria-label="Design theme">
      {THEMES.map((t) => (
        <button key={t.key} type="button" role="radio" aria-checked={value === t.key} className={`theme-card tp-${t.key}`} onClick={() => onPick(t.key)}>
          <span className="tp-preview" aria-hidden="true">
            <span className="tp-bar" />
            <span className="tp-chip" />
            <span className="tp-line" />
          </span>
          <b>{t.label}</b>
          <span className="muted">{t.blurb}</span>
        </button>
      ))}
    </div>
  );
}

function CreateProjectForm({ onDone }: { onDone: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [theme, setTheme] = useState<ThemeKey>("terminal");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api<{ id: number }>("/projects", { body: { title, subtitle, theme } });
          onDone(r.id);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="np-title">Project title</label>
        <input id="np-title" type="text" required maxLength={60} value={title} placeholder="e.g. Harbour Lab Weekly" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="np-sub">Subtitle (optional)</label>
        <input id="np-sub" type="text" maxLength={60} value={subtitle} placeholder="e.g. Team Standup" onChange={(e) => setSubtitle(e.target.value)} />
      </div>
      <div className="field">
        <span className="lbl">Design theme</span>
        <ThemePicker value={theme} onPick={setTheme} />
      </div>
      <p className="hint">You'll be the project's admin. You can change all of this later on the Admin page, and invite people with a code.</p>
      {error && <p className="err">{error}</p>}
      <div className="actions">
        <button className="btn primary" type="submit" disabled={busy || !title.trim()}>
          ✈ Create project
        </button>
      </div>
    </form>
  );
}

function JoinProjectForm({ onDone }: { onDone: (id: number) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api<{ id: number }>("/projects/join", { body: { code } });
          onDone(r.id);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="jp-code">Invite code</label>
        <input
          id="jp-code"
          type="text"
          required
          className="mono code-input"
          autoComplete="off"
          spellCheck={false}
          value={code}
          placeholder="e.g. K7QM-3XPA"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </div>
      <p className="hint">Ask a project admin for the code. It's on their Admin page.</p>
      {error && <p className="err">{error}</p>}
      <div className="actions">
        <button className="btn primary" type="submit" disabled={busy || code.replace(/[\s-]/g, "").length < 6}>
          Join project
        </button>
      </div>
    </form>
  );
}

/** A centred dialog for the switcher's "new" and "join" forms. Escape or the backdrop closes it. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <div className="dialog panel" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="ph cond">
          <b>{title}</b>
          <button className="x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="pmain">{children}</div>
      </div>
    </>
  );
}

/** After creating or joining: refresh the project list, then open the project. */
function useOpenProject() {
  const { reload, switchTo } = useSession();
  const navigate = useNavigate();
  return async (id: number) => {
    await reload();
    switchTo(id);
    navigate("/");
  };
}

/** Top-left: the current project's title, opening a list of all my projects plus new / join / leave. */
export function ProjectSwitcher({ leave }: { leave: () => void }) {
  const { projects, current, switchTo } = useSession();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"new" | "join" | null>(null);
  const openProject = useOpenProject();
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const elsewhere = projects.filter((p) => p.id !== current?.id).reduce((n, p) => n + p.unread, 0);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  useOnScreen(menu, open);

  return (
    <div className="switcher" ref={ref}>
      <button className="brand" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label={`${current?.title ?? "Projects"}: switch project`}>
        <div className="logo" aria-hidden="true">
          ✈{elsewhere > 0 && <span className="dot" title={`${elsewhere} unread in your other projects`} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="kicker cond">
            {current?.title} <span aria-hidden="true">▾</span>
          </div>
          {current?.subtitle ? <Flap text={current.subtitle} /> : <Flap text={current?.title ?? ""} />}
        </div>
      </button>
      {open && (
        <div className="switch-menu panel" role="menu" aria-label="Your projects" ref={menu}>
          <div className="ph cond">
            <b>Your projects</b>
            <span>{projects.length}</span>
          </div>
          {projects.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={p.id === current?.id}
              className={`switch-item ${p.id === current?.id ? "on" : ""}`}
              onClick={() => {
                setOpen(false);
                if (p.id !== current?.id) {
                  switchTo(p.id);
                  navigate("/");
                }
              }}
            >
              <span className={`tp-dot tp-${p.theme}`} aria-hidden="true" />
              <span style={{ minWidth: 0 }}>
                <b>{p.title}</b>
                <span className="muted">
                  {p.subtitle ? `${p.subtitle} · ` : ""}
                  {p.members} {p.members === 1 ? "person" : "people"}
                  {p.is_admin ? " · admin" : ""}
                </span>
              </span>
              {p.unread > 0 && p.id !== current?.id && <span className="count">{p.unread}</span>}
              {p.id === current?.id && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          <div className="switch-actions">
            <button role="menuitem" className="mini" onClick={() => (setOpen(false), setDialog("new"))}>
              ＋ New project
            </button>
            <button role="menuitem" className="mini" onClick={() => (setOpen(false), setDialog("join"))}>
              Join with a code
            </button>
            {current && (
              <button role="menuitem" className="mini danger" onClick={() => (setOpen(false), leave())}>
                Leave {current.title}
              </button>
            )}
          </div>
        </div>
      )}
      {dialog === "new" && (
        <Dialog title="New project" onClose={() => setDialog(null)}>
          <CreateProjectForm onDone={(id) => (setDialog(null), void openProject(id))} />
        </Dialog>
      )}
      {dialog === "join" && (
        <Dialog title="Join a project" onClose={() => setDialog(null)}>
          <JoinProjectForm onDone={(id) => (setDialog(null), void openProject(id))} />
        </Dialog>
      )}
    </div>
  );
}

/** First visit, or after leaving every project: join with a code or start one. */
export function Welcome() {
  const { account } = useSession();
  const openProject = useOpenProject();
  return (
    <div className="wrap welcome">
      <div className="welcome-head">
        <div className="logo" aria-hidden="true">
          ✈
        </div>
        <div>
          <div className="kicker cond">Welcome aboard</div>
          <Flap text={account.name} />
        </div>
      </div>
      <p className="muted">You're signed in as {account.email} but not in any project yet. Join your team with the invite code an admin gave you, or start a new project.</p>
      <div className="welcome-grid">
        <section className="panel" aria-label="Join a project">
          <div className="ph cond">
            <b>Join with a code</b>
          </div>
          <div className="pmain">
            <JoinProjectForm onDone={openProject} />
          </div>
        </section>
        <section className="panel" aria-label="Start a project">
          <div className="ph cond">
            <b>Start a project</b>
          </div>
          <div className="pmain">
            <CreateProjectForm onDone={openProject} />
          </div>
        </section>
      </div>
    </div>
  );
}

/** /join/<code>: the link admins share. Joins, then opens the project. */
export function JoinLink() {
  const { code } = useParams();
  const openProject = useOpenProject();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<{ id: number }>("/projects/join", { body: { code } })
      .then((r) => openProject(r.id))
      .catch((e) => setError((e as Error).message));
  }, [code, openProject]);
  return (
    <div className="wrap" style={{ display: "grid", placeItems: "center", minHeight: "70vh", textAlign: "center" }}>
      <div>
        <div className="logo" style={{ margin: "0 auto 16px" }} aria-hidden="true">
          ✈
        </div>
        {error ? (
          <>
            <p className="v">Gate closed</p>
            <p className="muted">{error}</p>
            <a className="btn" href="/">
              Go to my projects
            </a>
          </>
        ) : (
          <p className="muted">Joining the project…</p>
        )}
      </div>
    </div>
  );
}
