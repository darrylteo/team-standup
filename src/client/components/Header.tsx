import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { daysBetween } from "../../shared/dates";
import { flightCode, fmtDate, milestoneTone } from "../format";
import { api, download } from "../api";
import { useAsk } from "../ask";
import { applyMode, useSession } from "../session";
import { useTeam } from "../state";
import { Face } from "./Avatar";
import { ProjectSwitcher } from "./Projects";

/** Flip light/dark at once, then save it on the account so every device follows. */
function useTheme() {
  const { reload, toast } = useSession();
  return async () => {
    const current = document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = current === "dark" ? "light" : "dark";
    applyMode(next);
    try {
      await api("/account/profile", { method: "PATCH", body: { theme: next } });
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const time = new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" }).format(now);
  const day = new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore" }).format(now);
  return (
    <div className="clock">
      <div className="kicker cond">{day} · SGT</div>
      <div className="time mono">{time}</div>
    </div>
  );
}

export function Header({ onBell }: { onBell: () => void }) {
  const { milestones, today, unread, byId, me, waiting_on_me, project, toast } = useTeam();
  const session = useSession();
  const navigate = useNavigate();
  const toggleTheme = useTheme();
  const ask = useAsk();
  const leave = async () => {
    const last = session.current?.members === 1;
    if (last) {
      // The last person closes the project for good: warn, offer an export, and make them type its name.
      const typed = await ask({
        title: `You're the last person in ${project.title}`,
        body: (
          <>
            <p>Leaving closes the project for good. Nobody can open it or join it again, and its invite code stops working.</p>
            <p>
              Keep a copy first:{" "}
              <button type="button" className="mini" onClick={() => void download("/project/export", "standup-project.json").catch((e: Error) => toast(e.message))}>
                ⬇ Export the project's data
              </button>
            </p>
          </>
        ),
        input: { label: `Type “${project.title}” to close it`, placeholder: project.title },
        confirm: "Leave and close the project",
        danger: true,
      });
      if (typed === null) return;
      if (typed.trim().toLowerCase() !== project.title.trim().toLowerCase()) return toast("The name didn't match, so the project is still open.");
    } else if ((await ask({ title: `Leave ${project.title}?`, body: "Your past check-ins stay, and you can rejoin with an invite code.", confirm: "Leave project", danger: true })) === null) return;
    try {
      await api("/leave", { body: { close: last } });
      toast(last ? `${project.title} is closed` : `You left ${project.title}`);
      await session.reload();
      navigate("/");
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const upcoming = milestones.filter((m) => m.status !== "done").slice(0, 3);
  return (
    <header className="top">
      <ProjectSwitcher leave={leave} />
      <nav className="milestones" aria-label="Upcoming milestones">
        {upcoming.map((m) => {
          const tone = milestoneTone(m, today);
          const who = m.owners.length > 2 || !m.owners.length ? "All" : m.owners.map((id) => byId.get(id)?.name).join(", ");
          return (
            <Link key={m.id} to={`/timeline?focus=milestone-${m.id}`} className="ms" title={`${m.title} · due ${fmtDate(m.due_date, true)}`}>
              <span className="code mono">
                {flightCode(m.id)} · {who}
              </span>
              <span className={`st cond ${tone.cls}`}>{tone.label}</span>
              <span className="what">{m.title}</span>
              <span className="eta">
                <b>{Math.abs(daysBetween(today, m.due_date))}</b> {tone.days < 0 ? "days late" : "days"}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="tools">
        <Clock />
        <button className="iconbtn" onClick={onBell} aria-label={`Notifications, ${unread} unread`} title="Notifications">
          🔔{unread > 0 && <span className="dot">{unread}</span>}
        </button>
        <button className="iconbtn" onClick={() => void toggleTheme()} aria-label="Switch light or dark theme" title="Light / dark">
          ◐
        </button>
        <Link
          to={waiting_on_me ? "/profile?focus=waiting-on-me" : "/profile"}
          className="me-btn"
          aria-label={`My profile${waiting_on_me ? `, ${waiting_on_me} ${waiting_on_me === 1 ? "teammate needs" : "teammates need"} your input` : ""}`}
          title={waiting_on_me ? `${waiting_on_me} waiting on your input · open My profile` : "My profile"}
        >
          <Face member={byId.get(me.id) ?? me} />
          <span className="me-name">{me.name}</span>
          {waiting_on_me > 0 && <span className="dot">{waiting_on_me}</span>}
        </Link>
      </div>
    </header>
  );
}

export function Nav() {
  const { meeting, me } = useTeam();
  const tabs: [string, string][] = [
    ["/", "Boarding"],
    ["/checkin", "My check-in"],
    ["/timeline", "Timeline"],
    ["/calendar", "Calendar"],
  ];
  if (me.is_admin) tabs.push(["/admin", "Admin"]);
  return (
    <nav className="nav" aria-label="Sections">
      {tabs.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
          {label}
        </NavLink>
      ))}
      <span className="due">
        Next meeting <b>{fmtDate(meeting.date)}</b>
        {meeting.time && ` · ${meeting.time}`} · check-ins due the evening before
      </span>
    </nav>
  );
}
