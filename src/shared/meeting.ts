import type { MeetingState } from "./types";

export const initialMeeting = (): MeetingState => ({
  phase: "lobby",
  current: null,
  order: [],
  started_at: null,
  closed: [],
  deep_done: [],
  timer_on: true,
  sound_on: false,
  present_min: 5,
  qna_min: 5,
  opened_at: null,
  wrapped_at: null,
});

export type MeetingAction =
  | { type: "open"; member_id: number }
  | { type: "close"; member_id: number }
  | { type: "reopen"; member_id: number }
  | { type: "deep_dive_done"; member_id: number }
  | { type: "phase"; phase: MeetingState["phase"] }
  | { type: "settings"; timer_on?: boolean; sound_on?: boolean; present_min?: number; qna_min?: number }
  | { type: "order"; order: number[] }
  | { type: "reset" };

const without = (xs: number[], x: number) => xs.filter((y) => y !== x);
const clampMin = (n: unknown, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(30, Math.max(1, Math.round(n))) : fallback;

/** Pure reducer so every laptop following the meeting converges on the same state. */
export function applyMeeting(s: MeetingState, a: MeetingAction, now: number): MeetingState {
  switch (a.type) {
    case "open":
      return {
        ...s,
        phase: s.phase === "lobby" ? "round" : s.phase,
        opened_at: s.opened_at ?? now,
        current: a.member_id,
        started_at: now,
      };
    case "close": {
      const inDeepDives = s.phase === "deep_dives";
      return {
        ...s,
        current: s.current === a.member_id ? null : s.current,
        started_at: s.current === a.member_id ? null : s.started_at,
        closed: inDeepDives || s.closed.includes(a.member_id) ? s.closed : [...s.closed, a.member_id],
        deep_done: inDeepDives && !s.deep_done.includes(a.member_id) ? [...s.deep_done, a.member_id] : s.deep_done,
      };
    }
    case "reopen":
      return { ...s, closed: without(s.closed, a.member_id), deep_done: without(s.deep_done, a.member_id) };
    case "deep_dive_done":
      return s.deep_done.includes(a.member_id) ? s : { ...s, deep_done: [...s.deep_done, a.member_id] };
    case "phase":
      return {
        ...s,
        phase: a.phase,
        current: null,
        started_at: null,
        opened_at: a.phase === "lobby" ? null : (s.opened_at ?? now),
        wrapped_at: a.phase === "wrap" ? now : null,
      };
    case "settings":
      return {
        ...s,
        timer_on: a.timer_on ?? s.timer_on,
        sound_on: a.sound_on ?? s.sound_on,
        present_min: a.present_min === undefined ? s.present_min : clampMin(a.present_min, s.present_min),
        qna_min: a.qna_min === undefined ? s.qna_min : clampMin(a.qna_min, s.qna_min),
      };
    case "order":
      return { ...s, order: Array.isArray(a.order) ? [...new Set(a.order.filter((x) => Number.isInteger(x)))].slice(0, 200) : s.order };
    case "reset":
      return { ...initialMeeting(), order: s.order };
  }
}

export type TimerStage = "present" | "qna" | "over";

/** Where the presenter is in their slot; drives the soft ring colour. */
export function timerStage(
  s: MeetingState,
  now: number,
  mins: { present: number; qna: number } = { present: s.present_min, qna: s.qna_min },
): { stage: TimerStage; elapsedMs: number; fraction: number } {
  if (s.started_at === null) return { stage: "present", elapsedMs: 0, fraction: 0 };
  const elapsedMs = Math.max(0, now - s.started_at);
  const presentMs = mins.present * 60_000;
  const totalMs = presentMs + mins.qna * 60_000;
  const stage: TimerStage = elapsedMs < presentMs ? "present" : elapsedMs < totalMs ? "qna" : "over";
  return { stage, elapsedMs, fraction: Math.min(1, elapsedMs / totalMs) };
}

/** People in presenting order: those in `order` first, as dragged, then everyone else in their usual order. */
export function inOrder<T extends { id: number }>(people: T[], order: number[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return people
    .map((p, i) => ({ p, k: rank.has(p.id) ? rank.get(p.id)! : order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);
}

/**
 * Fold a re-ordered slice of the list (one group, e.g. crew) back into the full order:
 * the slice keeps the positions its members held, so other groups don't move.
 */
export function mergeOrder(all: number[], slice: number[]): number[] {
  const inSlice = new Set(slice);
  let next = 0;
  return all.map((id) => (inSlice.has(id) ? slice[next++] : id));
}

/** Move one item from index `from` to index `to`, as a drag or an arrow key does. */
export function moveItem<T>(xs: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= xs.length) return xs;
  const out = [...xs];
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}

/** True when `day` falls inside any of the stretches (inclusive). */
export const isAwayOn = (stretches: { from_date: string; to_date: string }[], day: string) => stretches.some((a) => a.from_date <= day && day <= a.to_date);

/** A meeting's whiteboard is filed as a flight log once the meeting has wrapped or its day has passed. */
export const meetingOver = (date: string, today: string, phase: string | undefined) => date < today || phase === "wrap";
