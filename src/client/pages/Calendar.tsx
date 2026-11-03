import { useState } from "react";
import { Link } from "react-router-dom";
import { addDays, weekday } from "../../shared/dates";
import { isAwayOn } from "../../shared/meeting";
import type { Away, CalendarResponse, MeetingNote } from "../../shared/types";
import { api, useApi } from "../api";
import { Face } from "../components/Avatar";
import { DateField } from "../components/Pickers";
import { fmtDate } from "../format";
import { useTeam } from "../state";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH = new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric", timeZone: "UTC" });

/** Six Monday-first weeks covering the month that contains `month` (YYYY-MM). */
function gridFor(month: string) {
  const first = `${month}-01`;
  const from = addDays(first, -((weekday(first) + 6) % 7));
  return { from, to: addDays(from, 41), days: Array.from({ length: 42 }, (_, i) => addDays(from, i)) };
}
const shiftMonth = (month: string, by: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

export function Calendar() {
  const { today, byId } = useTeam();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const grid = gridFor(month);
  const cal = useApi<CalendarResponse>(`/calendar?from=${grid.from}&to=${grid.to}`, 60_000);
  const c = cal.data;
  const meetingOn = new Map((c?.meetings ?? []).map((m) => [m.date, m]));
  const logOn = new Map((c?.logs ?? []).map((l) => [l.date, l]));
  const awayOn = (d: string) => (c?.away ?? []).filter((a) => isAwayOn([a], d));
  const msOn = (d: string) => (c?.milestones ?? []).filter((m) => m.due_date === d);

  return (
    <main className="two calendar-page">
      <section className="panel" aria-label="Calendar">
        <div className="ph cond">
          <b>{MONTH.format(new Date(`${month}-01T00:00:00Z`))}</b>
          <span className="chips">
            <button className="mini" style={{ marginTop: 0 }} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
              ‹
            </button>
            <button
              className="mini"
              style={{ marginTop: 0 }}
              onClick={() => {
                setMonth(today.slice(0, 7));
                setSelected(today);
              }}
            >
              Today
            </button>
            <button className="mini" style={{ marginTop: 0 }} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
              ›
            </button>
          </span>
        </div>
        <div className="cal-legend">
          <span>✈ meeting</span>
          <span className="tag-luggage small">📒 flight log</span>
          <span>🧳 away</span>
          <span>🏁 milestone due</span>
        </div>
        <div className="cal-grid" role="grid" aria-label="Month">
          {DOW.map((d) => (
            <div key={d} className="cal-dow cond" role="columnheader">
              {d}
            </div>
          ))}
          {grid.days.map((d) => {
            const m = meetingOn.get(d);
            const log = logOn.get(d);
            const away = awayOn(d);
            const ms = msOn(d);
            return (
              <button
                key={d}
                role="gridcell"
                aria-selected={selected === d}
                aria-label={`${fmtDate(d, true)}${m ? (m.cancelled ? ", meeting cancelled" : ", meeting") : ""}${log ? `, flight log with ${log.count} notes` : ""}${away.length ? `, ${away.length} away` : ""}`}
                className={`cal-day ${d.slice(0, 7) !== month ? "other" : ""} ${d === today ? "today" : ""} ${selected === d ? "sel" : ""} ${m && !m.cancelled ? "has-meet" : ""}`}
                onClick={() => setSelected(d)}
              >
                <span className="num">{Number(d.slice(8))}</span>
                {m && <span className={`cal-meet ${m.cancelled ? "cancelled" : ""}`}>✈ {m.cancelled ? "cancelled" : m.time || "meeting"}</span>}
                {log && (
                  <span className="tag-luggage" title={log.preview}>
                    📒 {log.count}
                  </span>
                )}
                {ms.map((x) => (
                  <span key={x.id} className="cal-ms" title={x.title}>
                    🏁 <span className="lbl-long">{x.title}</span>
                  </span>
                ))}
                {away.length > 0 && (
                  <span className="cal-away" title={away.map((a) => `${byId.get(a.member_id)?.name} away${a.note ? ` (${a.note})` : ""}`).join("\n")}>
                    {away.slice(0, 3).map((a) => {
                      const who = byId.get(a.member_id);
                      return who ? <Face key={a.id} member={who} as="span" /> : null;
                    })}
                    {away.length > 3 && <span className="more">+{away.length - 3}</span>}
                    <span className="dot-away" aria-hidden="true">🧳{away.length}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
      <div className="side">
        <DayDetail date={selected} cal={c} onChange={cal.reload} />
        <AwayPanel onChange={cal.reload} />
      </div>
    </main>
  );
}

function DayDetail({ date, cal, onChange }: { date: string; cal: CalendarResponse | null; onChange: () => void }) {
  const { byId, me, toast, meeting: next } = useTeam();
  const m = cal?.meetings.find((x) => x.date === date);
  const log = cal?.logs.find((l) => l.date === date);
  const notes = useApi<MeetingNote[]>(log ? `/notes/${date}` : null);
  const away = (cal?.away ?? []).filter((a) => isAwayOn([a], date));
  const ms = (cal?.milestones ?? []).filter((x) => x.due_date === date);
  const iAmAway = away.some((a) => a.member_id === me.id);
  const boardLink = (focus: string) => (date === next.date ? `/?focus=${focus}` : `/?date=${date}&focus=${focus}`);
  return (
    <section className="panel" aria-label="Selected day">
      <div className="ph cond">
        <b>{fmtDate(date, true)}</b>
        {m && !m.cancelled && <Link to={boardLink("departures")}>Open on Boarding →</Link>}
      </div>
      <div className="pmain day-detail">
        {!m && !log && away.length === 0 && ms.length === 0 && <p className="muted">Nothing on this day.</p>}
        {m && (
          <p>
            ✈ {m.cancelled ? <s>Meeting</s> : "Meeting"}
            {m.time && ` at ${m.time}`}
            {m.cancelled && ` · cancelled${m.note ? `: ${m.note}` : ""}`}
            {!m.cancelled && !iAmAway && (
              <button
                className="mini"
                onClick={async () => {
                  try {
                    await api("/account/away", { body: { from_date: date, to_date: date, note: "" } });
                    toast("Marked away for this meeting 🧳");
                    onChange();
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                🧳 I'll be away
              </button>
            )}
          </p>
        )}
        {log && (
          <div className="logbook">
            <div className="tag-luggage">📒 Flight log · {log.count} note{log.count > 1 ? "s" : ""}</div>
            {notes.data?.filter((n) => n.text.trim()).map((n) => (
              <div key={n.id} className="log-note" style={{ background: `var(--flair-${n.color}-bg)`, color: `var(--flair-${n.color}-fg)` }}>
                <p>{n.text}</p>
                <small>{byId.get(n.author_id)?.name}</small>
              </div>
            ))}
            <Link className="mini" to={boardLink("whiteboard")}>
              Open the whiteboard
            </Link>
          </div>
        )}
        {away.length > 0 && (
          <div>
            <span className="k">Away</span>
            {away.map((a) => {
              const who = byId.get(a.member_id);
              return (
                who && (
                  <div key={a.id} className="pair away-row">
                    <Face member={who} />
                    <b>{who.name}</b>
                    <span className="muted">
                      {a.from_date === a.to_date ? fmtDate(a.from_date) : `${fmtDate(a.from_date)} – ${fmtDate(a.to_date)}`}
                      {a.note && ` · ${a.note}`}
                    </span>
                  </div>
                )
              );
            })}
          </div>
        )}
        {ms.length > 0 && (
          <div>
            <span className="k">Milestones due</span>
            {ms.map((x) => (
              <p key={x.id}>
                🏁 <Link to={`/timeline?focus=milestone-${x.id}`}>{x.title}</Link>
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** My own away stretches. They show in every project I'm in. */
function AwayPanel({ onChange }: { onChange: () => void }) {
  const { today, toast } = useTeam();
  const mine = useApi<Away[]>("/account/away");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const refresh = async () => {
    await mine.reload();
    onChange();
  };
  return (
    <section className="panel" aria-label="I'm away">
      <div className="ph cond">
        <b>I'm away</b>
        <span>every project you're in sees this</span>
      </div>
      <form
        className="pmain form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/account/away", { body: { from_date: from, to_date: to || from, note } });
            setFrom("");
            setTo("");
            setNote("");
            toast("Away dates saved 🧳");
            await refresh();
          } catch (err) {
            toast((err as Error).message);
          }
        }}
      >
        <div className="away-dates">
          <div className="field">
            <label htmlFor="away-from">First day</label>
            <DateField id="away-from" required min={today} today={today} value={from} onChange={setFrom} />
          </div>
          <div className="field">
            <label htmlFor="away-to">Last day</label>
            <DateField id="away-to" min={from || today} today={today} value={to} onChange={setTo} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="away-note">Where or why (optional)</label>
          <input id="away-note" type="text" maxLength={80} value={note} placeholder="e.g. INFORMS in Atlanta" onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn primary" type="submit" disabled={!from}>
          🧳 Add away dates
        </button>
        <p className="hint">You won't be counted as missing a check-in or called in the round on those days, and the check-in reminder stays quiet.</p>
      </form>
      {mine.data && mine.data.length > 0 && (
        <div className="away-list">
          {mine.data.map((a) => (
            <div key={a.id} className="log sched-item">
              <span>
                <b>{a.from_date === a.to_date ? fmtDate(a.from_date, true) : `${fmtDate(a.from_date)} – ${fmtDate(a.to_date, true)}`}</b>
                {a.note && <span className="muted"> · {a.note}</span>}
              </span>
              <button
                className="x"
                aria-label={`Remove away dates from ${a.from_date}`}
                onClick={async () => {
                  await api(`/account/away/${a.id}`, { method: "DELETE" });
                  await refresh();
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
