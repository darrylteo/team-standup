import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { badgeLook } from "../../shared/catalog";
import type { Member, Notification } from "../../shared/types";
import { api, useApi } from "../api";
import { fmtAgo, fmtDate } from "../format";
import { useTeam } from "../state";
import { Face } from "./Avatar";
import { WaitingOnMe } from "./WaitingOnMe";

type P = Record<string, string | number | undefined>;

function text(n: Notification, actor: string) {
  const p = n.payload as P;
  switch (n.kind) {
    case "poke":
      return (
        <>
          <b>{actor}</b> poked you{p.note ? ` about “${p.note}”` : ""} 👉
        </>
      );
    case "commend":
      return (
        <>
          Someone commended you this week 👏
        </>
      );
    case "badge": {
      const b = badgeLook({ badge_key: String(p.badge_key), label: p.label as string, icon: p.icon as string });
      return (
        <>
          <b>{actor}</b> awarded you {b?.icon} <b>{b?.label}</b>
          {p.note ? ` — “${p.note}”` : ""}
        </>
      );
    }
    case "waiting":
      return (
        <>
          <b>{actor}</b> needs your input{p.text ? `: “${p.text}”` : ""}
        </>
      );
    case "clear_requested":
      return (
        <>
          <b>{actor}</b> says “{p.text}” is done. <b>Confirm to close it.</b>
        </>
      );
    case "reminder":
      return (
        <>
          Your check-in for <b>{fmtDate(String(p.date))}</b> isn't in yet.
        </>
      );
    case "joined":
      return (
        <>
          <b>{actor}</b> joined the project with the invite code 🛬
        </>
      );
  }
}

/** Where each notification takes you, and which element to flash when you get there. */
function target(n: Notification, me: Member): string {
  const p = n.payload as P;
  const q = (params: P) =>
    "?" +
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
  switch (n.kind) {
    case "waiting":
      // The request itself, or the whole "Waiting on you" panel if it was already answered or replaced.
      return `/profile${q({ focus: p.update_id ? `clear-${p.update_id}-${p.item_id}|waiting-on-me` : "waiting-on-me" })}`;
    case "clear_requested":
      return `/${q({ date: p.date, focus: `confirm-${p.update_id}-${p.item_id}|holding` })}`;
    case "commend":
      return `/${q({ date: p.date, select: me.id, focus: "commended" })}`;
    case "badge":
      return `/profile${q({ focus: `badge-${badgeLook({ badge_key: String(p.badge_key), label: p.label as string, icon: p.icon as string }).key}|profile-card` })}`;
    case "joined":
      return `/admin${q({ focus: "team" })}`;
    case "reminder":
    case "poke":
      return `/checkin${q({ date: p.date, focus: "submit-checkin" })}`;
  }
}

/** Identical notifications (same kind, person and text) show once, with a count, newest first. */
function collapse(list: Notification[]): { n: Notification; times: number }[] {
  const out = new Map<string, { n: Notification; times: number }>();
  for (const n of list) {
    const k = `${n.kind}|${n.actor_id}|${JSON.stringify(n.payload)}`.replace(/"(update_id|item_id)":[^,}]*,?/g, "");
    const cur = out.get(k);
    if (cur) cur.times++;
    else out.set(k, { n, times: 1 });
  }
  return [...out.values()];
}

export function NotificationsDrawer({ onClose }: { onClose: () => void }) {
  const { byId, reloadMe, me } = useTeam();
  const navigate = useNavigate();
  const { data } = useApi<Notification[]>("/notifications");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Opening the drawer marks everything read; unread rows keep their highlight until it closes.
  useEffect(() => {
    void api("/notifications/read", { body: {} }).then(reloadMe);
  }, [reloadMe]);

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Notifications">
        <div className="ph cond">
          <b>Notifications</b>
          <button className="x" onClick={onClose} aria-label="Close notifications">
            ✕
          </button>
        </div>
        <div className="list">
          <div className="drawer-section">
            <WaitingOnMe compact />
          </div>
          {data === null && <div className="empty">Loading…</div>}
          {data?.length === 0 && <div className="empty">Nothing yet. Pokes, commends and badges land here.</div>}
          {collapse(data ?? []).map(({ n, times }) => {
            const actor = n.actor_id ? byId.get(n.actor_id) : undefined;
            return (
              <button key={`${n.kind}-${n.id}`} className={`notif ${n.read_at ? "" : "unread"}`} onClick={() => go(target(n, me))}>
                {actor ? <Face member={actor} /> : <div className="av">⏰</div>}
                <div>
                  <div>{text(n, actor?.name ?? "Someone")}</div>
                  <div className="when">
                    {fmtAgo(n.at)}
                    {times > 1 && ` · ×${times}`} · <span className="go">Open →</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
