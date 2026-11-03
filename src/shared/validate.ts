import { DEEP_DIVE_MINUTES, FLAIR_COLORS, WEATHER } from "./catalog";
import type { Flair, UpdateBody, WaitingItem, WaitingState } from "./types";

// Hand-rolled validation keeps the Worker bundle small; limits stop one card from swallowing the meeting.
export const LIMITS = { items: 12, itemChars: 400, freeText: 600, flairs: 3, flairChars: 24 } as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => str(x, LIMITS.itemChars)).filter(Boolean).slice(0, LIMITS.items) : [];
const STATES: WaitingState[] = ["open", "clear_requested", "resolved"];
const newId = () => Math.random().toString(36).slice(2, 10);

export function cleanUpdateBody(raw: unknown, memberIds: Set<number>): UpdateBody {
  const r = (raw ?? {}) as Record<string, unknown>;
  const waiting: WaitingItem[] = Array.isArray(r.waiting)
    ? r.waiting
        .map((w) => {
          const o = (w ?? {}) as Record<string, unknown>;
          const id = typeof o.member_id === "number" && memberIds.has(o.member_id) ? o.member_id : null;
          return {
            id: typeof o.id === "string" && /^[a-z0-9]{4,16}$/.test(o.id) ? o.id : newId(),
            member_id: id,
            who: id === null ? str(o.who, 80) : "",
            text: str(o.text, LIMITS.itemChars),
            private: o.private === true,
            state: STATES.includes(o.state as WaitingState) ? (o.state as WaitingState) : "open",
          };
        })
        .filter((w) => w.text && (w.member_id !== null || w.who))
        .slice(0, LIMITS.items)
    : [];
  const dd = r.deep_dive as Record<string, unknown> | null | undefined;
  const minutes = Number(dd?.minutes);
  const deep_dive =
    dd && str(dd.topic, 200)
      ? {
          topic: str(dd.topic, 200),
          minutes: (DEEP_DIVE_MINUTES as readonly number[]).includes(minutes) ? minutes : 15,
          with: Array.isArray(dd.with) ? [...new Set(dd.with.filter((x): x is number => typeof x === "number" && memberIds.has(x)))] : [],
        }
      : null;
  return {
    weather: WEATHER.some((w) => w.key === r.weather) ? (r.weather as string) : "",
    done: list(r.done),
    issues: list(r.issues),
    waiting,
    next: list(r.next),
    fun: str(r.fun, LIMITS.freeText),
    files: str(r.files, LIMITS.freeText),
    figure_caption: str(r.figure_caption, 200),
    deep_dive,
  };
}

export function cleanFlairs(raw: unknown): Flair[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      const o = (f ?? {}) as Record<string, unknown>;
      return { text: str(o.text, LIMITS.flairChars), color: (FLAIR_COLORS as readonly string[]).includes(o.color as string) ? (o.color as string) : "slate" };
    })
    .filter((f) => f.text)
    .slice(0, LIMITS.flairs);
}

export const HANDLE_RE = /^[a-z0-9_]{2,20}$/;

/** Project title (required when creating) and subtitle; only the fields present are returned. */
export function cleanProjectText(raw: Record<string, unknown>): { title?: string; subtitle?: string } | string {
  const out: { title?: string; subtitle?: string } = {};
  if ("title" in raw) {
    const t = str(raw.title, 60);
    if (!t) return "Give the project a title";
    out.title = t;
  }
  if ("subtitle" in raw) out.subtitle = str(raw.subtitle, 60);
  return out;
}

export const emptyUpdate = (): UpdateBody => ({
  weather: "",
  done: [],
  issues: [],
  waiting: [],
  next: [],
  fun: "",
  files: "",
  figure_caption: "",
  deep_dive: null,
});
