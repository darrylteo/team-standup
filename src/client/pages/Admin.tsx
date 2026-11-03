import { useEffect, useRef, useState } from "react";
import type { MeetingDate, Member, Project, ThemeKey } from "../../shared/types";
import { api, download, useApi } from "../api";
import { Face } from "../components/Avatar";
import { DateField, TimeField as TimePicker } from "../components/Pickers";
import { ThemePicker } from "../components/Projects";
import { fmtAgo, fmtDate } from "../format";
import { useAsk } from "../ask";
import { useUnsavedGuard } from "../hooks";
import { applyTheme, useSession } from "../session";
import { useTeam } from "../state";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** Title, subtitle and theme (previewed live), plus the invite code people join with. */
function ProjectAdmin() {
  const { toast, reloadMe } = useTeam();
  const ask = useAsk();
  const session = useSession();
  const project = useApi<Project>("/project");
  const p = project.data;
  const [draft, setDraft] = useState<{ title: string; subtitle: string; theme: ThemeKey } | null>(null);
  const d = draft ?? (p ? { title: p.title, subtitle: p.subtitle, theme: p.theme } : null);
  const dirty = !!(draft && p && (draft.title !== p.title || draft.subtitle !== p.subtitle || draft.theme !== p.theme));
  useUnsavedGuard(dirty);
  // Leaving with an unsaved theme preview puts the saved theme back. The session always knows it, even before
  // /project has loaded (reading it from /project wiped the theme when leaving early).
  const savedTheme = useRef(session.current?.theme ?? null);
  savedTheme.current = session.current?.theme ?? null;
  useEffect(() => () => applyTheme(savedTheme.current), []);
  if (!p || !d) return null;
  const link = `${location.origin}/join/${p.invite_code}`;
  const pretty = p.invite_code ? `${p.invite_code.slice(0, 4)}-${p.invite_code.slice(4)}` : "";
  const save = async () => {
    try {
      await api("/project", { method: "PATCH", body: d });
      await Promise.all([project.reload(), session.reload(), reloadMe()]);
      setDraft(null);
      toast("Project updated ✈");
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <section className="panel" aria-label="Project settings">
      <div className="ph cond">
        <b>Project</b>
        <span>{dirty ? "unsaved changes" : "only admins see this"}</span>
      </div>
      <div className="pmain form">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <div className="field">
            <label htmlFor="pj-title">Title</label>
            <input id="pj-title" type="text" maxLength={60} value={d.title} onChange={(e) => setDraft({ ...d, title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="pj-sub">Subtitle</label>
            <input id="pj-sub" type="text" maxLength={60} value={d.subtitle} onChange={(e) => setDraft({ ...d, subtitle: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <span className="lbl">Design theme · everyone in the project sees it</span>
          <ThemePicker
            value={d.theme}
            onPick={(theme) => {
              setDraft({ ...d, theme });
              applyTheme(theme); // preview straight away; Save makes it stick
            }}
          />
        </div>
        <div className="actions">
          <button className="btn primary" onClick={save} disabled={!dirty || !d.title.trim()}>
            Save project
          </button>
          {dirty && (
            <button
              className="btn ghost"
              onClick={() => {
                setDraft(null);
                applyTheme(p.theme);
              }}
            >
              Discard
            </button>
          )}
        </div>
        <div className="field invite" data-focus="invite">
          <span className="lbl">Invite people</span>
          <div className="invite-row">
            <span className="invite-code mono" aria-label="Invite code">
              {pretty}
            </span>
            <button className="btn" onClick={async () => toast((await copy(link)) ? "Invite link copied" : link)}>
              🔗 Copy link
            </button>
            <button className="btn ghost" onClick={async () => toast((await copy(pretty)) ? "Code copied" : pretty)}>
              Copy code
            </button>
          </div>
          <span className="hint">
            Anyone with an SUTD email who has the code or link can join as crew. Make someone an admin in the Team list below.{" "}
            <button
              className="x"
              onClick={async () => {
                if ((await ask({ title: "Make a new invite code?", body: "The current code and link stop working. People already in the project stay.", confirm: "Make a new code" })) === null) return;
                await api("/project/invite", { body: {} });
                await project.reload();
                toast("New invite code made");
              }}
            >
              Make a new code
            </button>
          </span>
        </div>
      </div>
    </section>
  );
}

function TeamAdmin() {
  const { everyone, me, reloadMembers, toast } = useTeam();
  const ask = useAsk();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"researcher" | "prof">("researcher");
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      await reloadMembers();
      toast(msg);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const patch = (m: Member, body: object, msg: string) => run(() => api(`/admin/members/${m.id}`, { method: "PATCH", body }), msg);
  return (
    <section className="panel" aria-label="Team" data-focus="team">
      <div className="ph cond">
        <b>Team</b>
        <span>{everyone.filter((m) => m.active).length} active</span>
      </div>
      <form
        className="pmain admin-add"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api("/admin/members", { body: { email, name, role } });
            setEmail("");
            setName("");
          }, `Added ${name || email}. They can sign in with their SUTD email and will see this project.`);
        }}
      >
        <input type="text" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="firstname_lastname@example.edu" aria-label="New member email" />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" aria-label="New member name" />
        <select value={role} onChange={(e) => setRole(e.target.value as "researcher" | "prof")} aria-label="New member role" style={{ width: "auto" }}>
          <option value="researcher">🧳 Crew (researcher)</option>
          <option value="prof">✈ Pilot (professor)</option>
        </select>
        <button className="btn primary" type="submit">
          + Add
        </button>
      </form>
      <table className="fids">
        <thead>
          <tr>
            <th>Person</th>
            <th>Role</th>
            <th>Admin</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {/* Active people first; removed ones sink below them. Deleted people are gone from the list for good. */}
          {[...everyone.filter((m) => m.active), ...everyone.filter((m) => !m.active && !m.deleted)].map((m) => (
            <tr key={m.id} className={m.active ? "" : "removed"}>
              <td>
                <div className="pair-cell">
                  <Face member={m} />
                  <div>
                    <b>{m.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {m.email}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <select value={m.role} disabled={!m.active} onChange={(e) => patch(m, { role: e.target.value }, `${m.name} is now ${e.target.value === "prof" ? "a pilot" : "crew"}`)} aria-label={`Role for ${m.name}`} style={{ width: "auto" }}>
                  <option value="researcher">🧳 Crew</option>
                  <option value="prof">✈ Pilot</option>
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={m.is_admin}
                  disabled={!m.active || (m.id === me.id && m.is_admin)}
                  title={m.id === me.id && m.is_admin ? "You can't remove your own admin rights. Another admin can." : undefined}
                  aria-label={`${m.name} is admin`}
                  onChange={(e) => patch(m, { is_admin: e.target.checked }, e.target.checked ? `${m.name} is now an admin` : `${m.name} is no longer an admin`)} />
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {m.active ? (
                  m.id !== me.id && (
                    <button className="mini" style={{ marginTop: 0 }} onClick={async () => {
                        if ((await ask({ title: `Remove ${m.name} from this project?`, body: "Their past check-ins stay, and you can restore them later.", confirm: "Remove", danger: true })) !== null)
                          await patch(m, { active: false }, `${m.name} removed`);
                      }}>
                      Remove
                    </button>
                  )
                ) : (
                  <span className="chips">
                    <button className="mini" style={{ marginTop: 0 }} onClick={() => patch(m, { active: true }, `${m.name} is back`)}>
                      Restore
                    </button>
                    <button
                      className="mini danger"
                      style={{ marginTop: 0 }}
                      onClick={async () => {
                        const ok = await ask({
                          title: `Delete ${m.name} from this project for good?`,
                          body: "Only their past check-ins stay, under their name. Their badges, commends and notifications here are removed, and they drop off milestone owners. This can't be undone, though they could rejoin later with an invite code.",
                          confirm: "Delete for good",
                          danger: true,
                        });
                        if (ok !== null) await run(() => api(`/admin/members/${m.id}`, { method: "DELETE" }), `${m.name} deleted from the project`);
                      }}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** "Set a time" checkbox; the time input only appears once it's ticked. */
function TimeField({ value, onChange, label }: { value: { time: string; timed: boolean }; onChange: (p: { time?: string; timed?: boolean }) => void; label: string }) {
  return (
    <span className="timefield">
      <label className="check">
        <input type="checkbox" checked={value.timed} onChange={(e) => onChange({ timed: e.target.checked })} /> Set a time
      </label>
      {value.timed && <TimePicker required value={value.time} onChange={(time) => onChange({ time })} label={label} />}
    </span>
  );
}

function ScheduleAdmin() {
  const { toast, reloadMe, today } = useTeam();
  const ask = useAsk();
  const sched = useApi<{ dates: MeetingDate[] }>("/schedule");
  // Meetings have a date and, only if "Set a time" is ticked, a time.
  const [single, setSingle] = useState({ date: "", time: "14:00", timed: false });
  const [rule, setRule] = useState({ from: today, to: "", weekdays: [4] as number[], every: 1, time: "14:00", timed: false });
  const timeOf = (x: { time: string; timed: boolean }) => (x.timed ? x.time : "");
  const [showPast, setShowPast] = useState(false);
  const refresh = () => Promise.all([sched.reload(), reloadMe()]);
  const run = async (fn: () => Promise<unknown>, msg: (r: any) => string) => {
    try {
      const r = await fn();
      await refresh();
      toast(msg(r));
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const dates = (sched.data?.dates ?? []).filter((d) => !d.unscheduled && (showPast || d.date >= today)).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="panel" aria-label="Meeting schedule">
      <div className="ph cond">
        <b>Meeting schedule</b>
        <span>check-ins are due the evening before each date</span>
      </div>
      <div className="pmain">
        <form
          className="sched-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api("/schedule/series", { body: { ...rule, time: timeOf(rule) } }), (r) => `Added ${r.added} meetings${r.skipped ? ` (${r.skipped} already existed)` : ""}`);
          }}
        >
          <span className="lbl">New meeting series</span>
          <span className="hint">Like a recurring meeting in Outlook: pick the days it repeats on.</span>
          <div className="chips" role="group" aria-label="Weekdays">
            {DAYS.map((d, i) => {
              const on = rule.weekdays.includes(i);
              return (
                <button type="button" key={d} className="chip" aria-pressed={on} onClick={() => setRule({ ...rule, weekdays: on ? rule.weekdays.filter((x) => x !== i) : [...rule.weekdays, i] })}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className="sched-row">
            <label>
              Starts <DateField required value={rule.from} today={today} onChange={(from) => setRule({ ...rule, from })} />
            </label>
            <label>
              Ends by <DateField required value={rule.to} min={rule.from} today={today} onChange={(to) => setRule({ ...rule, to })} />
            </label>
            <TimeField value={rule} onChange={(p) => setRule({ ...rule, ...p })} label="Series time" />
            <label>
              Repeat every
              <select value={rule.every} onChange={(e) => setRule({ ...rule, every: Number(e.target.value) })}>
                <option value={1}>1 week</option>
                <option value={2}>2 weeks</option>
              </select>
            </label>
            <button className="btn primary" type="submit" disabled={!rule.weekdays.length}>
              Create series
            </button>
          </div>
        </form>
        <form
          className="sched-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api("/schedule/dates", { body: { date: single.date, time: timeOf(single) } }), () => `Meeting added on ${fmtDate(single.date)}`);
          }}
        >
          <span className="lbl">Single meeting</span>
          <div className="sched-row">
            <DateField required value={single.date} today={today} onChange={(date) => setSingle({ ...single, date })} label="Meeting date" />
            <TimeField value={single} onChange={(p) => setSingle({ ...single, ...p })} label="One-off time" />
            <button className="btn" type="submit">
              Add meeting
            </button>
          </div>
        </form>
      </div>
      <div className="ph cond" style={{ borderTop: "1px solid var(--line)" }}>
        <b>{showPast ? "All dates" : "Upcoming"}</b>
        <button className="x" onClick={() => setShowPast(!showPast)}>
          {showPast ? "hide past" : "show past"}
        </button>
      </div>
      {dates.length === 0 && <div className="empty">No meetings scheduled. Add a series above (e.g. every Thu, 2 pm, until the end of term).</div>}
      {dates.map((d) => (
        <div key={d.date} className="log sched-item" style={{ opacity: d.cancelled ? 0.55 : 1 }}>
          <span>
            <b>{fmtDate(d.date, true)}</b> · {d.time || <span className="muted">no set time</span>}
            {d.series_id && <span className="muted"> · series</span>}
            {d.cancelled && <span className="flair plain small">cancelled{d.note ? `: ${d.note}` : ""}</span>}
          </span>
          <span className="chips">
            {d.cancelled ? (
              <button className="mini" style={{ marginTop: 0 }} onClick={() => run(() => api(`/schedule/dates/${d.date}`, { method: "PATCH", body: { cancelled: false } }), () => "Restored")}>
                Restore
              </button>
            ) : (
              <button
                className="mini"
                style={{ marginTop: 0 }}
                onClick={async () => {
                  const note = await ask({
                    title: `Cancel the meeting on ${fmtDate(d.date, true)}?`,
                    body: "Everyone sees it as cancelled. Check-ins already made stay.",
                    confirm: "Cancel meeting",
                    cancel: "Keep it",
                    danger: true,
                    input: { label: "Reason (optional)", placeholder: "e.g. Public holiday" },
                  });
                  if (note !== null) void run(() => api(`/schedule/dates/${d.date}`, { method: "PATCH", body: { cancelled: true, note } }), () => "Meeting cancelled");
                }}
              >
                Cancel
              </button>
            )}
            <button className="x" aria-label={`Delete ${d.date}`} onClick={async () =>
                (await ask({ title: `Delete ${fmtDate(d.date, true)} from the calendar?`, body: "Use Cancel instead if people should see it was called off.", confirm: "Delete", danger: true })) !== null &&
                run(() => api(`/schedule/dates/${d.date}`, { method: "DELETE" }), () => "Deleted")
              }>
              ✕
            </button>
            {d.series_id && (
              <button
                className="x"
                title="Delete the remaining dates in this series"
                onClick={async () =>
                  (await ask({ title: "Delete the rest of this series?", body: "Future dates in the series without check-ins are removed. Past dates stay.", confirm: "Delete series", danger: true })) !== null &&
                  run(() => api(`/schedule/series/${d.series_id}`, { method: "DELETE" }), (r) => `Removed ${r.removed} dates`)
                }
              >
                Delete series
              </button>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

function LogAndStorage() {
  const { byId } = useTeam();
  const log = useApi<{ id: number; actor_id: number; action: string; details: Record<string, unknown>; at: string }[]>("/admin/log");
  const storage = useApi<{ figures: number; figures_bytes: number; photo_bytes: number; db_bytes: number | null; limit_bytes: number }>("/admin/storage");
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  const { toast } = useTeam();
  const exportJson = () => download("/project/export", "standup-project.json").catch((e) => toast((e as Error).message));
  const s = storage.data;
  const used = s?.db_bytes ?? (s ? s.figures_bytes + s.photo_bytes : 0);
  return (
    <>
      <section className="panel" aria-label="Storage">
        <div className="ph cond">
          <b>Storage</b>
          <span>free plan · 500 MB shared by all projects</span>
        </div>
        {s && (
          <div className="pmain">
            <div className="bar" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <i style={{ width: `${Math.max(1, (used / s.limit_bytes) * 100)}%` }} />
              <span className="mono">{mb(used)}</span>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              {s.figures} figures ({mb(s.figures_bytes)}) · photos {mb(s.photo_bytes)}. At ~3 MB a week this lasts about {Math.max(0, Math.floor((s.limit_bytes - used) / (3 * 1024 * 1024)))} more weeks.
            </p>
            <button className="btn" onClick={exportJson}>
              ⬇ Export this project (JSON)
            </button>
          </div>
        )}
      </section>
      <section className="panel" aria-label="Admin log">
        <details>
          <summary className="ph cond">
            <b>Admin log</b>
            <span>who changed the project, team or schedule</span>
          </summary>
          {log.data?.map((l) => (
            <div className="log" key={l.id}>
              <b>{byId.get(l.actor_id)?.name}</b> {l.action.replaceAll("_", " ")} <span className="muted">{String(l.details.email ?? l.details.date ?? "")}</span>
              <div className="when">{fmtAgo(l.at)}</div>
            </div>
          ))}
        </details>
      </section>
    </>
  );
}

export function Admin() {
  const { me } = useTeam();
  if (!me.is_admin) return <div className="empty">Only admins can see this page.</div>;
  return (
    <main className="two">
      <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
        <ProjectAdmin />
        <ScheduleAdmin />
        <TeamAdmin />
      </div>
      <div className="side">
        <LogAndStorage />
      </div>
    </main>
  );
}
