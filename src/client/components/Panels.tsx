import type { Bottleneck, Update } from "../../shared/types";
import { api } from "../api";
import { useTeam } from "../state";
import { Face } from "./Avatar";

/**
 * "Holding pattern": who needs input from whom, with both names. The person asked can mark an item cleared;
 * only the person waiting confirms it. Private items only reach this panel for the two people involved.
 */
export function Holding({ updates, bottlenecks, onChange }: { updates: Update[]; bottlenecks: Bottleneck[]; onChange: () => void }) {
  const { byId, me, toast, reloadMe } = useTeam();
  const external = updates.flatMap((u) => u.waiting.filter((w) => w.member_id === null && w.state !== "resolved").map((w) => ({ from: u.member_id, ...w })));
  const max = Math.max(1, ...bottlenecks.map((b) => b.waiting.length));
  const act = async (updateId: number, itemId: string, action: string, msg: string) => {
    try {
      await api(`/waiting/${updateId}/${itemId}`, { body: { action } });
      toast(msg);
      onChange();
      void reloadMe();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <section className="panel" aria-label="Holding pattern" data-focus="holding">
      <div className="ph cond">
        <b>Holding pattern</b>
        <span>who needs input from whom</span>
      </div>
      {bottlenecks.length === 0 && external.length === 0 ? (
        <div className="empty">Nobody is held up this week. ✨</div>
      ) : (
        <div className="hold">
          {bottlenecks.flatMap((b) =>
            b.waiting.map((w) => {
              const from = byId.get(w.from_id);
              const on = byId.get(b.member_id);
              if (!from || !on) return null;
              return (
                <div
                  className="hrow"
                  key={`${w.update_id}-${w.item_id}`}
                  data-focus={on.id === me.id && w.state === "open" ? `clear-${w.update_id}-${w.item_id}` : from.id === me.id && w.state === "clear_requested" ? `confirm-${w.update_id}-${w.item_id}` : undefined}
                >
                  <div className="pair">
                    <Face member={from} />
                    <b>{from.name}</b>
                    <span className="arr" aria-label="needs input from">
                      →
                    </span>
                    <Face member={on} />
                    <b>{on.name}</b>
                    {w.private && (
                      <span className="lock" title="Private: only you two can see this">
                        🔒
                      </span>
                    )}
                  </div>
                  <div className="why">
                    {w.text}
                    {w.state === "clear_requested" && <span className="flair plain small">{on.name} says cleared</span>}
                  </div>
                  {on.id === me.id && w.state === "open" && (
                    <button className="mini" onClick={() => act(w.update_id, w.item_id, "request_clear", `Told ${from.name} it's cleared`)}>
                      ✓ Mark cleared
                    </button>
                  )}
                  {from.id === me.id && w.state === "clear_requested" && (
                    <span className="chips">
                      <button className="mini" onClick={() => act(w.update_id, w.item_id, "confirm_clear", "Off the holding pattern ✈")}>
                        ✓ Confirm cleared
                      </button>
                      <button className="mini" onClick={() => act(w.update_id, w.item_id, "keep_open", "Kept open")}>
                        Keep open
                      </button>
                    </span>
                  )}
                </div>
              );
            }),
          )}
          {external.map((w) => {
            const from = byId.get(w.from);
            if (!from) return null;
            return (
              <div className="hrow" key={`ext-${w.from}-${w.id}`}>
                <div className="pair">
                  <Face member={from} />
                  <b>{from.name}</b>
                  <span className="arr">→</span>
                  <div className="av" aria-hidden="true">
                    🌐
                  </div>
                  <b>{w.who}</b>
                </div>
                <div className="why">{w.text}</div>
              </div>
            );
          })}
        </div>
      )}
      {bottlenecks.length > 0 && (
        <div className="counts">
          <div className="k">Most asked</div>
          {bottlenecks.slice(0, 5).map((b) => (
            <div className="bar" key={b.member_id}>
              <span>{byId.get(b.member_id)?.name}</span>
              <i style={{ width: `${(b.waiting.length / max) * 100}%` }} />
              <span className="mono">{b.waiting.length}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function DeepDives({ updates, done = [], onOpen }: { updates: Update[]; done?: number[]; onOpen?: (memberId: number) => void }) {
  const { byId } = useTeam();
  const dives = updates.filter((u) => u.deep_dive && u.submitted_at);
  const total = dives.reduce((n, u) => n + (u.deep_dive?.minutes ?? 0), 0);
  return (
    <section className="panel" aria-label="Deep dives">
      <div className="ph cond">
        <b>Deep dives</b>
        <span>after the round{total ? ` · ${total} min` : ""}</span>
      </div>
      {dives.length === 0 && <div className="empty">No deep dives requested.</div>}
      {dives.map((u, i) => {
        const who = byId.get(u.member_id);
        const landed = done.includes(u.member_id);
        return (
          <div className={`flight ${landed ? "landed" : ""}`} key={u.id}>
            <span className="no">{u.deep_dive!.minutes}′</span>
            <span className="t">
              {who?.name} · {u.deep_dive!.topic}
            </span>
            {onOpen && !landed ? (
              <button className="mini" style={{ marginTop: 0 }} onClick={() => onOpen(u.member_id)}>
                Start
              </button>
            ) : (
              <span className="k">{landed ? "Done" : `#${i + 1}`}</span>
            )}
            <span className="w">
              {u.deep_dive!.with.length ? `Most relevant to ${u.deep_dive!.with.map((id) => byId.get(id)?.name).join(", ")}` : "Whole team"}
            </span>
          </div>
        );
      })}
    </section>
  );
}
