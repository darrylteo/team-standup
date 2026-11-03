import type { WaitingItem } from "../../shared/types";
import { api, useApi } from "../api";
import { fmtDate } from "../format";
import { useTeam } from "../state";
import { Face } from "./Avatar";

type Item = WaitingItem & { from_id: number; update_id: number; meeting_date: string };

/** Everything teammates currently need from me, with a one-tap "cleared" reply. */
export function WaitingOnMe({ compact = false }: { compact?: boolean }) {
  const { byId, toast, reloadMe } = useTeam();
  const { data, reload } = useApi<Item[]>("/waiting/me", 60_000);
  if (!data || (compact && data.length === 0)) return null;
  const open = data.filter((w) => w.state === "open").length;
  const clear = async (w: Item) => {
    try {
      await api(`/waiting/${w.update_id}/${w.id}`, { body: { action: "request_clear" } });
      toast(`Told ${byId.get(w.from_id)?.name} it's cleared`);
      await reload();
      await reloadMe();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <section className="panel" aria-label="Waiting on you" data-focus="waiting-on-me">
      <div className="ph cond">
        <b>Waiting on you</b>
        <span>{open ? `${open} to answer` : data.length ? "all answered" : "all clear"}</span>
      </div>
      {data.length === 0 && <div className="empty">Nobody is waiting on you. ✨</div>}
      {data.map((w) => {
        const from = byId.get(w.from_id);
        if (!from) return null;
        return (
          <div className="hrow" key={`${w.update_id}-${w.id}`} data-focus={`clear-${w.update_id}-${w.id}`}>
            <div className="pair">
              <Face member={from} />
              <b>{from.name}</b>
              <span className="muted">needs</span>
              {w.private && <span className="lock" title="Private: only you two can see this">🔒</span>}
              <span className="muted" style={{ fontSize: 12 }}>
                · {fmtDate(w.meeting_date)}
              </span>
            </div>
            <div className="why">{w.text}</div>
            {w.state === "open" ? (
              <button className="mini" onClick={() => clear(w)}>
                ✓ Mark cleared
              </button>
            ) : (
              <span className="flair plain small">You marked this cleared · waiting for {from.name} to confirm</span>
            )}
          </div>
        );
      })}
    </section>
  );
}
