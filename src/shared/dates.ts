// All dates are meeting-local (Singapore, UTC+8, no DST) and formatted YYYY-MM-DD.

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function sgtToday(now: Date = new Date()): string {
  return new Date(now.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return parse(date).getUTCDay(); // 0 = Sunday
}

/** The meeting this week's updates are for: today if it is meeting day, else the next one. */
export function upcomingMeeting(meetingWeekday: number, now: Date = new Date()): string {
  const today = sgtToday(now);
  const diff = (meetingWeekday - weekday(today) + 7) % 7;
  return addDays(today, diff);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

export function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime()) && parse(s).toISOString().startsWith(s);
}

/** Monday of the calendar week containing `date`; commends are limited per week. */
export function weekStart(date: string): string {
  return addDays(date, -((weekday(date) + 6) % 7));
}

export interface RepeatRule {
  from: string;
  to: string;
  weekdays: number[]; // 0 = Sunday … 6 = Saturday
  every: number; // 1 = every week, 2 = every other week
}

export const MAX_SERIES_DATES = 200;

/** Expand a repeat rule into concrete dates (inclusive), like a calendar's "repeat weekly on Tue, Thu". */
export function expandRule(r: RepeatRule): string[] {
  if (!isValidDate(r.from) || !isValidDate(r.to) || r.to < r.from) return [];
  const days = new Set(r.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  const every = Math.max(1, Math.min(4, Math.round(r.every) || 1));
  const anchor = weekStart(r.from);
  const out: string[] = [];
  for (let d = r.from; d <= r.to && out.length < MAX_SERIES_DATES; d = addDays(d, 1)) {
    const weeksIn = Math.floor(daysBetween(anchor, d) / 7);
    if (days.has(weekday(d)) && weeksIn % every === 0) out.push(d);
  }
  return out;
}
