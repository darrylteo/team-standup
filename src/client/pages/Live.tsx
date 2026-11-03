import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MeetingAction } from "../../shared/meeting";
import { inOrder, mergeOrder, timerStage } from "../../shared/meeting";
import type { Away, Commend, MeetingState, Member, Update } from "../../shared/types";
import type { useApi } from "../api";
import { Face } from "../components/Avatar";
import { Flap } from "../components/Flap";
import { DragRow, useDragOrder } from "../components/Reorder";
import { DeepDives, Holding } from "../components/Panels";
import { CommendButton, Sections, WhoBlock } from "../components/UpdateCard";
import { fmtClock, fmtDate } from "../format";
import { useTeam } from "../state";
import { RowLine, type StateResponse, type WeekResponse } from "./Board";

const R = 68;
const C = 2 * Math.PI * R;

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A soft two-note chime; only plays when the host has switched sound on. */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1);
    });
    setTimeout(() => void ctx.close(), 1600);
  } catch {
    /* audio unavailable */
  }
}

/**
 * Meeting moments, shown on every screen that's open: the cabin door opens when the meeting starts,
 * 👏 floats up when someone commends, and the plane takes off at wrap-up. Each plays once, briefly.
 */
// Shown once per browser session: commends, door and takeoff never replay when you revisit the Boarding tab.
const shown = new Set<string>();
// Other screens notice a start or wrap-up on their next poll (Board polls every 10 s before a meeting), so the door
// and takeoff still play if it happened this long ago.
const NOTICE_MS = 15_000;

export function MeetingEffects({ state, serverNow, date, commends }: { state: MeetingState; serverNow: number; date: string; commends: Commend[] | null }) {
  const { byId } = useTeam();
  const [door, setDoor] = useState(false);
  const [takeoff, setTakeoff] = useState(false);
  const [claps, setClaps] = useState<{ id: string; text: string; x: number }[]>([]);
  const skew = serverNow - Date.now();
  const live = state.phase === "round" || state.phase === "deep_dives";

  useEffect(() => {
    const k = `door:${date}:${state.opened_at}`;
    if (state.opened_at && !shown.has(k) && Date.now() + skew - state.opened_at < NOTICE_MS && !reducedMotion()) {
      shown.add(k);
      setDoor(true);
      const t = setTimeout(() => setDoor(false), 1900);
      return () => clearTimeout(t);
    }
  }, [state.opened_at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = `takeoff:${date}:${state.wrapped_at}`;
    if (state.wrapped_at && !shown.has(k) && Date.now() + skew - state.wrapped_at < NOTICE_MS && !reducedMotion()) {
      shown.add(k);
      setTakeoff(true);
      const t = setTimeout(() => setTakeoff(false), 1900); // doors close, plane leaves, message, fade: as long as the door
      return () => clearTimeout(t);
    }
  }, [state.wrapped_at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!commends) return; // still loading: don't mistake old commends for new ones
    const fresh = commends.filter((c) => !shown.has(`clap:${date}:${c.id}`));
    // Commends that already existed when the page loaded are marked seen without a burst.
    const first = !shown.has(`claps-loaded:${date}`);
    shown.add(`claps-loaded:${date}`);
    fresh.forEach((c) => shown.add(`clap:${date}:${c.id}`));
    if (first || !live || !fresh.length || reducedMotion()) return;
    const add = fresh.map((c, i) => ({
      id: `${c.id}>${Date.now()}`,
      text: `👏 for ${byId.get(c.to_id)?.name}`, // anonymous: who gave it isn't shown
      x: 20 + ((c.id * 37 + i * 23) % 60),
    }));
    setClaps((xs) => [...xs, ...add]);
    setTimeout(() => setClaps((xs) => xs.filter((x) => !add.includes(x))), 2600);
  }, [commends, byId, date, live]);

  return (
    <>
      {door && (
        <div className="fx-door" aria-hidden="true">
          <div className="leaf left" />
          <div className="leaf right" />
          <div className="hello">
            <Flap text="Welcome aboard" />
          </div>
        </div>
      )}
      {takeoff && (
        <div className="fx-takeoff" aria-hidden="true">
          {/* The cabin doors close over the meeting, mirroring how they open at the start. */}
          <div className="leaf left" />
          <div className="leaf right" />
          <span className="plane">✈</span>
          <span className="msg">
            <Flap text="Wheels up · see you next week" />
          </span>
        </div>
      )}
      <div className="fx-claps" aria-live="polite">
        {claps.map((c) => (
          <span key={c.id} className="clap" style={{ left: `${c.x}%` }}>
            {c.text}
          </span>
        ))}
      </div>
    </>
  );
}

export function Live({
  date,
  live,
  week,
  act,
  away,
}: {
  date: string;
  live: StateResponse;
  week: ReturnType<typeof useApi<WeekResponse>>;
  act: (a: MeetingAction) => Promise<void>;
  away: Map<number, Away>;
}) {
  const { members, byId } = useTeam();
  // The server's clock minus ours, taken once per poll. The timer then ticks every second on this screen's own clock
  // and needs the server only for who is presenting and when they started.
  const skew = useMemo(() => live.now - Date.now(), [live.now]);
  const now = useNow(1000) + skew;
  const s = live.state;
  const updates = week.data?.updates ?? [];
  const commends = week.data?.commends ?? [];
  const by = new Map(updates.map((u) => [u.member_id, u]));
  // Everyone presents in the round: crew always, pilots only if they checked in. The order is dragged on the Boarding tab.
  const presenters = inOrder(
    // People away for this meeting sit out the round unless they checked in anyway.
    members.filter((m) => (m.role === "researcher" && !away.has(m.id)) || by.get(m.id)?.submitted_at),
    s.order,
  );
  const rank = new Map(presenters.map((m, i) => [m.id, i]));
  const divers = updates
    .filter((u) => u.deep_dive && u.submitted_at)
    .map((u) => u.member_id)
    .sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
  const drag = useDragOrder(
    presenters.map((m) => m.id),
    (order) =>
      act({
        type: "order",
        order: mergeOrder(
          inOrder(members, s.order).map((m) => m.id),
          order,
        ),
      }),
  );
  const inDeep = s.phase === "deep_dives";
  const currentUpdate = s.current ? by.get(s.current) : undefined;
  const mins = inDeep && currentUpdate?.deep_dive ? { present: currentUpdate.deep_dive.minutes, qna: 0 } : { present: s.present_min, qna: s.qna_min };
  const timer = timerStage(s, now, mins);

  // Chime once when the presenter crosses into Q&A, and again when time is up.
  const lastStage = useRef<string | null>(null);
  useEffect(() => {
    const key = s.current ? `${s.current}:${s.started_at}:${timer.stage}` : null;
    if (key && lastStage.current && key !== lastStage.current && key.split(":")[0] === lastStage.current.split(":")[0] && s.sound_on && s.timer_on) {
      if (document.visibilityState === "visible") chime();
    }
    lastStage.current = key;
  }, [s.current, s.started_at, s.sound_on, s.timer_on, timer.stage]);

  const remaining = inDeep ? divers.filter((id) => !s.deep_done.includes(id)) : presenters.map((m) => m.id).filter((id) => !s.closed.includes(id));
  const queue = remaining.filter((id) => id !== s.current);
  const current = s.current ? byId.get(s.current) : undefined;
  const nextUp = queue[0] ? byId.get(queue[0]) : undefined;
  const totalMs = (mins.present + mins.qna) * 60_000;
  const presentFrac = mins.present / (mins.present + mins.qna);

  const departures = (
    <section className="panel board" aria-label="Presenting order" data-focus="departures">
      <div className="ph cond">
        <b>{inDeep ? "Deep dives" : "Departures"}</b>
        <span>{inDeep ? `${s.deep_done.length} / ${divers.length} done` : `${s.closed.length} / ${presenters.length} boarded`}</span>
      </div>
      <div className="order-tools">
        <span>☰ Drag to reorder</span>
      </div>
      <div ref={drag.listRef} className={drag.dragging ? "dragging-list" : ""}>
        {drag.order.map((id) => {
          const m = byId.get(id)!;
          const closed = s.closed.includes(m.id) && !inDeep;
          const now_ = s.current === m.id;
          const isNext = !now_ && nextUp?.id === m.id;
          const u = by.get(m.id);
          return (
            <DragRow key={m.id} id={m.id} dragging={drag.dragging === m.id} grip={drag.handle(m.id, m.name)}>
              <button
                className={`row ${closed ? "closed" : ""} ${now_ ? "now" : ""}`}
                onClick={() => act(closed ? { type: "reopen", member_id: m.id } : { type: "open", member_id: m.id })}
                title={closed ? "Reopen this card" : "Open this card"}
              >
                <Face member={m} sleep={closed} />
                <div style={{ minWidth: 0 }}>
                  <Flap text={m.name} tone={closed ? "dim" : m.role === "prof" ? "white" : "amber"} />
                  <RowLine
                    status={now_ ? "Now presenting" : closed ? "Boarded" : isNext ? "Next" : "On time"}
                    cls={now_ ? "blink" : isNext ? "st-next" : closed ? "" : "st-ok"}
                    details={[closed && "✓ card closed", u?.submitted_at ? (u.deep_dive ? `⏱ Deep dive · ${u.deep_dive.minutes} min` : `${u.done.length} done · ${u.issues.length} issues`) : "No check-in"]}
                  />
                </div>
              </button>
            </DragRow>
          );
        })}
      </div>
      {members
        .filter((m) => m.role === "prof" && !presenters.includes(m) && !away.has(m.id))
        .map((m) => (
          <div key={m.id} className="row">
            <Face member={m} />
            <div style={{ minWidth: 0 }}>
              <Flap text={m.name} tone="white" />
              <RowLine status="In the cockpit" cls="st-crew" details={["✈ Pilot · can award badges"]} />
            </div>
          </div>
        ))}
      {members
        .filter((m) => away.has(m.id) && !presenters.includes(m))
        .map((m) => (
          <div key={m.id} className="row">
            <Face member={m} sleep />
            <div style={{ minWidth: 0 }}>
              <Flap text={m.name} tone="dim" />
              <RowLine status="Away" cls="st-away" details={[away.get(m.id)!.note]} />
            </div>
          </div>
        ))}
    </section>
  );

  let centre: ReactNode;
  if (current) {
    const u = by.get(current.id) ?? null;
    const left = timer.stage === "present" ? mins.present * 60_000 - timer.elapsedMs : totalMs - timer.elapsedMs;
    const warn = left <= 60_000 && timer.stage !== "over";
    centre = (
      <article key={current.id} className="pass card-in" aria-label="Current presenter">
        <div className="pmain">
          <div className="ptop cond">
            <span>{inDeep ? `Deep dive · ${u?.deep_dive?.topic ?? ""}` : `Boarding pass ${presenters.findIndex((m) => m.id === current.id) + 1} / ${presenters.length}`}</span>
            <span className="live blink">● Now presenting</span>
          </div>
          <WhoBlock
            member={current}
            u={u}
            commends={commends}
            ring={
              s.timer_on && (
                <svg className="ring" viewBox="0 0 150 150" aria-hidden="true">
                  <circle className="tr" cx="75" cy="75" r={R} />
                  {mins.qna > 0 && <circle className="qa" cx="75" cy="75" r={R} style={{ strokeDasharray: `0 ${C * presentFrac} ${C * (1 - presentFrac)} 0` }} />}
                  <circle className={`pg ${timer.stage === "over" ? "over" : warn ? "warn" : ""}`} cx="75" cy="75" r={R} style={{ strokeDasharray: `${C * timer.fraction} ${C}` }} />
                </svg>
              )
            }
          />
          {u ? <Sections u={u} onWaitingAction={week.reload} /> : <p className="muted">No check-in this week — present from your laptop and park anything that needs a follow-up.</p>}
          <div className="actions">
            <button className="btn primary" onClick={() => act({ type: "close", member_id: current.id })}>
              ✓ Close card
            </button>
            {nextUp && (
              <button
                className="btn"
                onClick={async () => {
                  await act({ type: "close", member_id: current.id });
                  await act({ type: "open", member_id: nextUp.id });
                }}
              >
                Close & call {nextUp.name} →
              </button>
            )}
            <CommendButton to={current} date={date} commends={commends} onChange={week.reload} />
          </div>
        </div>
        <aside className="stub" aria-label="Timer">
          {s.timer_on ? (
            <>
              <div>
                <div className="k">Segment</div>
                <div className="v">{timer.stage === "over" ? "Overtime" : timer.stage === "qna" ? "Q&A" : inDeep ? "Deep dive" : "Present"}</div>
              </div>
              <div>
                <div className={`big ${timer.stage === "over" ? "over" : ""}`}>{timer.stage === "over" ? `+${fmtClock(timer.elapsedMs - totalMs)}` : fmtClock(left)}</div>
                <div className="k">
                  {timer.stage === "present"
                    ? mins.qna
                      ? `left of ${mins.present}:00 · then ${mins.qna}:00 Q&A`
                      : `left of ${mins.present}:00`
                    : timer.stage === "qna"
                      ? `left of ${mins.qna}:00 Q&A`
                      : "past the slot · no rush"}
                </div>
              </div>
            </>
          ) : (
            <div>
              <div className="k">Timer</div>
              <div className="v">Off</div>
            </div>
          )}
          <button className="toggle" onClick={() => act({ type: "settings", timer_on: !s.timer_on })} aria-pressed={s.timer_on}>
            {s.timer_on ? "⏱ Timer on" : "⏱ Timer off"}
          </button>
          <button className="toggle" onClick={() => act({ type: "settings", sound_on: !s.sound_on })} aria-pressed={s.sound_on}>
            {s.sound_on ? "🔔 Chime on" : "🔇 Chime off"}
          </button>
          <div>
            <div className="k">Next at gate</div>
            <div className="v">{nextUp?.name ?? "—"}</div>
          </div>
          <div className="barcode" aria-hidden="true" />
        </aside>
      </article>
    );
  } else {
    centre = (
      <Stage
        title={inDeep ? "Deep dives" : "Gate is open"}
        sub={inDeep ? "Tap a teammate to start their deep dive." : `Meeting for ${fmtDate(date, true)}. Tap whoever goes next — closed cards leave the stage.`}
        people={remaining.map((id) => byId.get(id)!).filter(Boolean)}
        updates={by}
        onOpen={(id) => act({ type: "open", member_id: id })}
        footer={
          <>
            {!inDeep && remaining.length === 0 && divers.length > 0 && (
              <button className="btn primary" onClick={() => act({ type: "phase", phase: "deep_dives" })}>
                Start deep dives ({divers.length}) →
              </button>
            )}
            {((inDeep && remaining.length === 0) || (!inDeep && remaining.length === 0 && divers.length === 0)) && (
              <button className="btn primary" onClick={() => act({ type: "phase", phase: "wrap" })}>
                Wrap up meeting ✓
              </button>
            )}
            {inDeep && (
              <button className="btn ghost" onClick={() => act({ type: "phase", phase: "round" })}>
                ← Back to the round
              </button>
            )}
            {!inDeep && <TimerSettings s={s} onChange={(p) => act({ type: "settings", ...p })} />}
            <span style={{ flex: 1 }} />
            <button className="btn ghost" onClick={() => act({ type: "phase", phase: "wrap" })}>
              End meeting
            </button>
          </>
        }
      />
    );
  }

  return (
    <main className="grid">
      {departures}
      {centre}
      <div className="side">
        <Holding updates={updates.filter((u) => u.submitted_at)} bottlenecks={week.data?.bottlenecks ?? []} onChange={week.reload} />
        <DeepDives updates={updates} done={s.deep_done} onOpen={inDeep ? (id) => act({ type: "open", member_id: id }) : undefined} />
      </div>
    </main>
  );
}

function TimerSettings({ s, onChange }: { s: MeetingState; onChange: (p: { present_min?: number; qna_min?: number }) => void }) {
  const opts = [3, 4, 5, 6, 8, 10];
  return (
    <span className="chips" style={{ alignItems: "center" }}>
      <span className="k">Slot</span>
      <select value={s.present_min} onChange={(e) => onChange({ present_min: Number(e.target.value) })} aria-label="Minutes to present" style={{ width: "auto" }}>
        {opts.map((n) => (
          <option key={n} value={n}>
            {n} min present
          </option>
        ))}
      </select>
      <select value={s.qna_min} onChange={(e) => onChange({ qna_min: Number(e.target.value) })} aria-label="Minutes of Q&A" style={{ width: "auto" }}>
        {opts.map((n) => (
          <option key={n} value={n}>
            {n} min Q&A
          </option>
        ))}
      </select>
    </span>
  );
}

function Stage({ title, sub, people, updates, onOpen, footer }: { title: string; sub: string; people: Member[]; updates: Map<number, Update>; onOpen: (id: number) => void; footer: ReactNode }) {
  return (
    <section className="panel stage" aria-label="Stage">
      <div className="pmain">
        <div className="ptop cond">
          <span>{title}</span>
          <span>{people.length} waiting at the gate</span>
        </div>
        <p className="sub" style={{ marginTop: 6 }}>
          {sub}
        </p>
        {people.length === 0 ? (
          <div className="stage-empty">
            <div style={{ fontSize: 48 }} aria-hidden="true">
              🛫
            </div>
            <Flap text="All boarded" />
          </div>
        ) : (
          <div className="stage-grid">
            {people.map((m) => {
              const u = updates.get(m.id);
              return (
                <button key={m.id} className="seat" onClick={() => onOpen(m.id)}>
                  <Face member={m} className="face" as="span" />
                  <Flap text={m.name} tone={m.role === "prof" ? "white" : "amber"} />
                  <span className="tags">
                    {u?.issues.length ? <span className="tag k-issue">⚠ {u.issues.length}</span> : null}
                    {u?.waiting.some((w) => w.state !== "resolved") ? <span className="tag k-wait">⏳ {u.waiting.filter((w) => w.state !== "resolved").length}</span> : null}
                    {u?.deep_dive ? <span className="tag k-next">⏱ {u.deep_dive.minutes}′</span> : null}
                    {!u?.submitted_at && <span className="tag k-miss">no check-in</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="actions">{footer}</div>
      </div>
    </section>
  );
}
