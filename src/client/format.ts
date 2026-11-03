import { daysBetween } from "../shared/dates";
import type { Milestone } from "../shared/types";

const DAY = new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const DAY_YEAR = new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const fmtDate = (d: string, withYear = false) => (withYear ? DAY_YEAR : DAY).format(new Date(`${d}T00:00:00Z`));

export function fmtAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const STATUS_LABEL: Record<Milestone["status"], string> = {
  planned: "Scheduled",
  in_progress: "Boarding",
  at_risk: "Delayed",
  done: "Departed",
};

/** Departure-board status for a milestone, from its own status and how close it is. */
export function milestoneTone(m: Milestone, today: string): { label: string; cls: string; days: number } {
  const days = daysBetween(today, m.due_date);
  if (m.status === "done") return { label: STATUS_LABEL.done, cls: "ok", days };
  if (m.status === "at_risk" || days < 0) return { label: days < 0 ? "Overdue" : STATUS_LABEL.at_risk, cls: "risk", days };
  if (days <= 10) return { label: "Boarding soon", cls: "soon", days };
  return { label: "On time", cls: "ok", days };
}

export const flightCode = (id: number) => `MS-${String(id).padStart(2, "0")}`;
