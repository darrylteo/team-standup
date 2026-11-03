import { useState, type ReactNode } from "react";
import { WEATHER } from "../../shared/catalog";
import type { Commend, Member, Update } from "../../shared/types";
import { api } from "../api";
import { useTeam } from "../state";
import { Face } from "./Avatar";
import { Flap } from "./Flap";
import { PokeButton } from "./PokeButton";

function List({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

const roleLabel = (m: Member) => (m.role === "prof" ? "✈ Pilot" : "🧳 Crew");

/** Reddit-style flair chips: role, flight conditions, custom flairs, badges, commends. */
export function Flairs({ member, u, commends = [] }: { member: Member; u: Update | null; commends?: Commend[] }) {
  const { badgesOf } = useTeam();
  const weather = WEATHER.find((w) => w.key === u?.weather);
  const commended = commends.filter((c) => c.to_id === member.id).length;
  return (
    <div className="flairs">
      <span className={`flair role-${member.role}`}>{roleLabel(member)}</span>
      {member.handle && <span className="flair plain">@{member.handle}</span>}
      {weather && (
        <span className="flair k-weather" title="Flight conditions: how the work is going">
          {weather.icon} {weather.label}
        </span>
      )}
      {member.profile.flairs.map((f, i) => (
        <span key={i} className="flair custom" style={{ background: `var(--flair-${f.color}-bg)`, color: `var(--flair-${f.color}-fg)` }}>
          {f.text}
        </span>
      ))}
      {badgesOf(member.id).map((b) => (
        <span key={b.key} className="flair badge-chip" title={`Badge: ${b.label}`} data-focus={`badge-${b.key}`}>
          {b.icon} {b.label}
          {b.count > 1 && ` ×${b.count}`}
        </span>
      ))}
      {commended > 0 && (
        <span className="flair k-commend" data-focus="commended" title="Commends this week, anonymous">
          👏 {commended} {commended === 1 ? "commend" : "commends"}
        </span>
      )}
    </div>
  );
}

/** Colour-coded sections of a check-in. Empty sections are hidden. */
export function Sections({ u, onWaitingAction }: { u: Update; onWaitingAction?: () => void }) {
  const { byId, me } = useTeam();
  const [zoom, setZoom] = useState(false);
  const open = u.waiting.filter((w) => w.state !== "resolved");
  const blocks: [string, string, ReactNode, boolean][] = [
    ["k-done", "Done this week", <List items={u.done} />, u.done.length > 0],
    ["k-issue", "Issues to raise", <List items={u.issues} />, u.issues.length > 0],
    [
      "k-wait",
      "Needs input from",
      open.map((w) => {
        const target = w.member_id ? byId.get(w.member_id) : undefined;
        return (
          <div key={w.id} style={{ marginTop: 6 }}>
            <p>
              <span className="mention">@{target?.handle ?? target?.name ?? w.who}</span> · {w.text}
              {w.private && <span className="lock" title="Private: only you two can see this"> 🔒</span>}
              {w.state === "clear_requested" && <span className="flair plain small"> marked cleared</span>}
            </p>
            {target && target.id !== me.id && u.member_id === me.id && <PokeButton to={target} note={w.text} />}
            {target?.id === me.id && w.state === "open" && <ClearButton u={u} itemId={w.id} onDone={onWaitingAction} />}
          </div>
        );
      }),
      open.length > 0,
    ],
    ["k-next", "Next week", <List items={u.next} />, u.next.length > 0],
    ["k-fun", "In-flight extras", <p>{u.fun}</p>, !!u.fun],
    ["", "Files", <p className="path">{u.files}</p>, !!u.files],
  ];
  const shown = blocks.filter(([, , , has]) => has);
  return (
    <>
      {u.figure && (
        <figure className="figure">
          <button className="figure-img" onClick={() => setZoom(true)} aria-label="Enlarge figure of the week">
            <img src={u.figure} alt={u.figure_caption || "Figure of the week"} loading="lazy" />
          </button>
          <figcaption>
            <span className="k">Figure of the week</span> {u.figure_caption}
          </figcaption>
        </figure>
      )}
      {shown.length === 0 && !u.figure ? (
        <p className="muted">Nothing filled in yet.</p>
      ) : (
        <div className="secs">
          {shown.map(([cls, title, body]) => (
            <div key={title} className={`sec ${cls}`}>
              <h4>{title}</h4>
              {body}
            </div>
          ))}
        </div>
      )}
      {zoom && u.figure && (
        <div className="lightbox" role="dialog" aria-label="Figure of the week" onClick={() => setZoom(false)}>
          <img src={u.figure} alt={u.figure_caption || "Figure of the week"} />
          {u.figure_caption && <p>{u.figure_caption}</p>}
        </div>
      )}
    </>
  );
}

function ClearButton({ u, itemId, onDone }: { u: Update; itemId: string; onDone?: () => void }) {
  const { toast, byId, reloadMe } = useTeam();
  return (
    <button
      className="mini"
      onClick={async () => {
        try {
          await api(`/waiting/${u.id}/${itemId}`, { body: { action: "request_clear" } });
          toast(`Told ${byId.get(u.member_id)?.name} this is cleared`);
          onDone?.();
          void reloadMe();
        } catch (e) {
          toast((e as Error).message);
        }
      }}
    >
      ✓ Mark cleared
    </button>
  );
}

/** Commend a teammate: once per teammate per week, so everyone can commend everyone. */
export function CommendButton({ to, date, commends, onChange, className = "btn" }: { to: Member; date: string; commends: Commend[]; onChange: () => void; className?: string }) {
  const { me, toast } = useTeam();
  const [busy, setBusy] = useState(false);
  if (to.id === me.id) return null;
  const given = commends.some((c) => c.mine && c.to_id === to.id);
  const click = async () => {
    setBusy(true);
    try {
      await api(`/commends/${date}/${to.id}`, { method: given ? "DELETE" : "PUT" });
      if (!given) toast(`👏 You commended ${to.name}`);
      onChange();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className={className} onClick={click} disabled={busy} aria-pressed={given} title={given ? "Click to withdraw your commend" : "One commend per teammate per week"}>
      {given ? `✓ Commended ${to.name}` : `👏 Commend ${to.name}`}
    </button>
  );
}

export function WhoBlock({ member, u, ring, commends = [] }: { member: Member; u: Update | null; ring?: ReactNode; commends?: Commend[] }) {
  const { byId } = useTeam();
  return (
    <div className="who">
      <div className="tav">
        {ring}
        <Face member={member} className="face" />
      </div>
      <div className="who-name">
        <Flap text={member.name} tone="white" />
        {!u && <div className="sub">No check-in for this meeting</div>}
        {u && !u.submitted_at && <div className="sub">Draft</div>}
        <Flairs member={member} u={u} commends={commends} />
        {u?.deep_dive && (
          <div className="deep cond">
            ⏱ Deep dive · {u.deep_dive.minutes} min · {u.deep_dive.topic}
            {u.deep_dive.with.length > 0 && ` · with ${u.deep_dive.with.map((id) => byId.get(id)?.name).join(", ")}`}
          </div>
        )}
      </div>
    </div>
  );
}
