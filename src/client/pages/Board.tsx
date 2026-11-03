import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BADGE_CHOICES, BADGES, cleanCustomBadge } from "../../shared/catalog";
import { inOrder, meetingOver, mergeOrder, type MeetingAction } from "../../shared/meeting";
import { DragRow, useDragOrder } from "../components/Reorder";
import type { Away, Bottleneck, CalendarResponse, Commend, MeetingDate, MeetingState, Member, Update } from "../../shared/types";
import { api, useApi } from "../api";
import { Face } from "../components/Avatar";
import { Flap } from "../components/Flap";
import { DeepDives, Holding } from "../components/Panels";
import { PokeButton } from "../components/PokeButton";
import { CommendButton, Sections, WhoBlock } from "../components/UpdateCard";
import { Whiteboard } from "../components/Whiteboard";
import { fmtAgo, fmtDate } from "../format";
import { useTeam } from "../state";
import { Live, MeetingEffects } from "./Live";

export interface WeekResponse {
  date: string;
  updates: Update[];
  commends: Commend[];
  bottlenecks: Bottleneck[];
}
export interface StateResponse {
  state: MeetingState;
  version: number;
  now: number;
}
interface ScheduleResponse {
  next: { date: string; time: string };
  dates: MeetingDate[];
}

function rowStatus(u: Update | undefined, away?: Away) {
  if (!u && away) return { label: "Away", cls: "st-away", small: "" };
  if (!u) return { label: "Not checked in", cls: "st-miss", small: "" };
  if (!u.submitted_at) return { label: "Draft", cls: "st-next", small: fmtAgo(u.updated_at) };
  return { label: "Checked in", cls: "st-ok", small: fmtAgo(u.submitted_at) };
}

/** The detail after the status on a row's second line ("" when there is nothing to add). */
function rowMeta(u: Update | undefined, byId: Map<number, Member>, away?: Away) {
  if (!u) return away?.note ?? "";
  if (u.deep_dive) return `⏱ Deep dive · ${u.deep_dive.minutes} min`;
  const w = u.waiting.find((x) => x.state !== "resolved");
  if (w) return `Needs input from ${w.member_id ? byId.get(w.member_id)?.name : w.who}`;
  if (u.issues.length) return `⚠ ${u.issues.length} issue${u.issues.length > 1 ? "s" : ""} to raise`;
  return `${u.done.length} done`;
}

/** A board row's second line: the status, then any details. It sits under the name so long names have room. */
export function RowLine({ status, cls, details = [] }: { status: string; cls: string; details?: (string | false | undefined)[] }) {
  return (
    <div className="meta">
      <span className={`status ${cls}`}>{status}</span>
      {details.filter(Boolean).map((d, i) => (
        <span key={i}> · {d}</span>
      ))}
    </div>
  );
}

/** One group of the departures list (crew or pilots), in presenting order, with ☰ handles to drag. */
function DepartureGroup({ people, all, onOrder, row }: { people: Member[]; all: number[]; onOrder: (order: number[]) => void; row: (m: Member) => ReactNode }) {
  const ids = people.map((m) => m.id);
  const { order, dragging, listRef, handle } = useDragOrder(ids, (next) => onOrder(mergeOrder(all, next)));
  const byId = new Map(people.map((m) => [m.id, m]));
  return (
    <div ref={listRef} className={dragging ? "dragging-list" : ""}>
      {order.map((id) => (
        <DragRow key={id} id={id} dragging={dragging === id} grip={handle(id, byId.get(id)!.name)}>
          {row(byId.get(id)!)}
        </DragRow>
      ))}
    </div>
  );
}

export function Departures({
  updates,
  selected,
  onSelect,
  order,
  onOrder,
  away,
}: {
  updates: Update[];
  selected: number | null;
  onSelect: (id: number) => void;
  order: number[];
  onOrder: (order: number[]) => void;
  away: Map<number, Away>;
}) {
  const { members, byId } = useTeam();
  const by = new Map(updates.map((u) => [u.member_id, u]));
  const ordered = inOrder(members, order);
  const crew = ordered.filter((m) => m.role === "researcher");
  const pilots = ordered.filter((m) => m.role === "prof");
  const all = ordered.map((m) => m.id);
  const checkedIn = crew.filter((m) => by.get(m.id)?.submitted_at).length;
  // People away who didn't check in aren't expected, so they don't count against the total.
  const expected = crew.filter((m) => by.get(m.id)?.submitted_at || !away.has(m.id)).length;
  const row = (m: Member) => {
    const u = by.get(m.id);
    const st = rowStatus(u, away.get(m.id));
    return (
      <button className={`row ${selected === m.id ? "sel" : ""}`} onClick={() => onSelect(m.id)} aria-pressed={selected === m.id}>
        <Face member={m} sleep={!u} />
        <div style={{ minWidth: 0 }}>
          <Flap text={m.name} tone={m.role === "prof" ? "white" : "amber"} />
          <RowLine status={st.label} cls={st.cls} details={[st.small, rowMeta(u, byId, away.get(m.id))]} />
        </div>
      </button>
    );
  };
  return (
    <section className="panel board" aria-label="Departures" data-focus="departures">
      <div className="ph cond">
        <b>Departures</b>
        <span>
          {checkedIn} / {expected} crew checked in
        </span>
      </div>
      <div className="order-tools">
        <span>☰ Drag to reorder</span>
        <span className="chips">
          <button className="x" onClick={() => onOrder(shuffled(all))} title="Random presenting order">
            🔀 shuffle
          </button>
        </span>
      </div>
      <div className="group cond">🧳 Crew</div>
      <DepartureGroup people={crew} all={all} onOrder={onOrder} row={row} />
      {pilots.length > 0 && <div className="group cond">✈ Pilots</div>}
      <DepartureGroup people={pilots} all={all} onOrder={onOrder} row={row} />
    </section>
  );
}

/** Fisher–Yates: a fair random order, so nobody always goes first. */
function shuffled<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function AwardBadge({ member }: { member: Member }) {
  const { toast, reloadBadges } = useTeam();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("");
  const custom = key === "custom";
  return (
    <span className="chips award">
      <select value={key} onChange={(e) => setKey(e.target.value)} aria-label={`Badge for ${member.name}`} style={{ width: "auto" }}>
        <option value="">🏅 Award a badge…</option>
        {BADGES.filter((b) => BADGE_CHOICES.includes(b.key)).map((b) => (
          <option key={b.key} value={b.key}>
            {b.icon} {b.label}
          </option>
        ))}
        <option value="custom">✏️ Custom badge…</option>
      </select>
      {custom && (
        <>
          <input type="text" className="badge-icon" value={icon} maxLength={8} placeholder="🏅" onChange={(e) => setIcon(e.target.value)} aria-label="Badge emoji (optional)" />
          <input type="text" className="badge-label" value={label} maxLength={24} placeholder="e.g. Plot Artist" onChange={(e) => setLabel(e.target.value)} aria-label="Badge name" />
        </>
      )}
      <button
        className="btn"
        disabled={!key || (custom && label.trim().length < 2)}
        onClick={async () => {
          // Same check as the server, so a ranking-style name is caught before anything is sent.
          const look = custom ? cleanCustomBadge(label, icon) : null;
          if (typeof look === "string") return toast(look);
          try {
            await api("/badges", { body: { member_id: member.id, badge_key: key, ...(look ?? {}) } });
            await reloadBadges();
            setKey("");
            setLabel("");
            setIcon("");
            toast(`🏅 Badge sent to ${member.name}`);
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      >
        Award
      </button>
    </span>
  );
}

function Browse({
  date,
  week,
  onStart,
  initialSelect,
  order,
  onOrder,
  away,
}: {
  date: string;
  week: ReturnType<typeof useApi<WeekResponse>>;
  onStart: () => void;
  initialSelect: number | null;
  order: number[];
  onOrder: (order: number[]) => void;
  away: Map<number, Away>;
}) {
  const { byId, me, meeting, project } = useTeam();
  // The card you opened stays open when you come back from another tab (until the browser tab closes).
  const memoryKey = `standup.board.${project.id}.${date}`;
  const [selected, setSelectedState] = useState<number | null>(() => {
    if (initialSelect) return initialSelect;
    try {
      return Number(sessionStorage.getItem(memoryKey)) || null;
    } catch {
      return null;
    }
  });
  const setSelected = (id: number) => {
    setSelectedState(id);
    try {
      sessionStorage.setItem(memoryKey, String(id));
    } catch {
      /* private mode: just not remembered */
    }
  };
  const updates = week.data?.updates ?? [];
  const commends = week.data?.commends ?? [];
  const selId = selected ?? updates.find((u) => u.submitted_at)?.member_id ?? me.id;
  const member = byId.get(selId) ?? me;
  const u = updates.find((x) => x.member_id === selId) ?? null;
  return (
    <main className="grid">
      <Departures updates={updates} selected={selId} onSelect={setSelected} order={order} onOrder={onOrder} away={away} />
      <article key={selId} className="pass solo card-in" aria-label={`${member.name}'s check-in`}>
        <div className="pmain">
          <div className="ptop cond">
            <span>{project.title} · {fmtDate(date, true)}</span>
            <span>{u?.submitted_at ? `Checked in ${fmtAgo(u.submitted_at)}` : u ? "Draft" : "No check-in yet"}</span>
          </div>
          <WhoBlock member={member} u={u} commends={commends} />
          {u ? (
            <Sections u={u} onWaitingAction={week.reload} />
          ) : away.has(member.id) ? (
            <p className="muted">🧳 {member.name} is away for this meeting{away.get(member.id)!.note ? ` (${away.get(member.id)!.note})` : ""}.</p>
          ) : (
            <p className="muted">{member.name} hasn't checked in for this meeting yet.</p>
          )}
          <div className="actions">
            {member.id === me.id ? (
              <Link className="btn primary" to={date === meeting.date ? "/checkin" : `/checkin?date=${date}`}>
                ✎ {u ? "Edit my check-in" : "Check in now"}
              </Link>
            ) : (
              <>
                <CommendButton to={member} date={date} commends={commends} onChange={week.reload} />
                <PokeButton to={member} className="btn" note={u?.submitted_at ? "" : "check-in reminder"} />
                {me.role === "prof" && <AwardBadge member={member} />}
              </>
            )}
            <span style={{ flex: 1 }} />
            <button className="btn primary" onClick={onStart}>
              ▶ Start meeting
            </button>
          </div>
        </div>
      </article>
      <div className="side">
        <Holding updates={updates.filter((x) => x.submitted_at)} bottlenecks={week.data?.bottlenecks ?? []} onChange={week.reload} />
        <DeepDives updates={updates} />
      </div>
    </main>
  );
}

export function Board() {
  const { meeting, toast, today } = useTeam();
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? meeting.date;
  const schedule = useApi<ScheduleResponse>("/schedule", 120_000);
  // Poll faster while the meeting is live, and keep polling then even if nobody touches the screen. An idle tab
  // still checks once a minute, so a Board on the meeting-room screen switches to the live view when someone starts.
  // The timer counts down on each screen's own clock, so 5 s only decides how soon others see the next presenter.
  // The request budget behind these numbers is in docs/MAINTAINING.md ("If the request count worries you").
  const [liveNow, setLiveNow] = useState(false);
  const live = useApi<StateResponse>(`/meetings/${date}/state`, liveNow ? 5_000 : 10_000, { idleMs: liveNow ? 5_000 : 60_000 });
  const isLive = live.data?.state.phase === "round" || live.data?.state.phase === "deep_dives";
  useEffect(() => setLiveNow(isLive), [isLive]);
  const week = useApi<WeekResponse>(`/updates?date=${date}`, isLive ? 10_000 : 20_000, { idleMs: isLive ? 10_000 : undefined });
  const cal = useApi<CalendarResponse>(`/calendar?from=${date}&to=${date}`, 120_000);
  const away = new Map((cal.data?.away ?? []).map((a) => [a.member_id, a]));

  const act = async (a: MeetingAction) => {
    // A dragged order shows at once, so the row doesn't jump back while the server confirms it.
    if (a.type === "order") live.setData((d) => d && { ...d, state: { ...d.state, order: a.order } });
    try {
      live.setData(await api<StateResponse>(`/meetings/${date}/actions`, { body: a }));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const dates = (schedule.data?.dates ?? []).filter((d) => !d.cancelled || d.date === date);
  const thisDate = dates.find((d) => d.date === date);
  const wrapped = live.data?.state.phase === "wrap";

  return (
    <>
      <div className="boardbar">
        <label className="lbl" htmlFor="week">
          Meeting
        </label>
        <select id="week" value={date} onChange={(e) => setParams(e.target.value === meeting.date ? {} : { date: e.target.value })} style={{ width: "auto" }} aria-label="Meeting date">
          {dates.map((d) => (
            <option key={d.date} value={d.date}>
              {fmtDate(d.date, true)}
              {d.time ? ` · ${d.time}` : ""}
              {d.date === meeting.date ? " · next" : ""}
              {d.cancelled ? " · cancelled" : ""}
            </option>
          ))}
        </select>
        {thisDate?.note && <span className="flair plain">{thisDate.note}</span>}
        {isLive && <span className="livebadge">● Live meeting</span>}
        {wrapped && (
          <span className="flair plain">
            Meeting wrapped ✈{" "}
            <button className="x" onClick={() => act({ type: "reset" })} title="Clear the meeting so it can run again">
              reset
            </button>
          </span>
        )}
      </div>
      {live.data && <MeetingEffects state={live.data.state} serverNow={live.data.now} date={date} commends={week.data ? week.data.commends : null} />}
      {isLive && live.data ? (
        <Live date={date} live={live.data} week={week} act={act} away={away} />
      ) : (
        <Browse
          key={params.get("select") ?? ""}
          date={date}
          week={week}
          initialSelect={Number(params.get("select")) || null}
          onStart={() => act({ type: "phase", phase: "round" })}
          order={live.data?.state.order ?? []}
          onOrder={(order) => act({ type: "order", order })}
          away={away}
        />
      )}
      <Whiteboard date={date} live={isLive} over={meetingOver(date, today, live.data?.state.phase)} />
    </>
  );
}
