import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { addDays, isValidDate, weekday } from "../../shared/dates";
import { useOnScreen } from "../hooks";

/*
 * Date and time fields drawn by the app, so their pop-ups follow the project's theme in light and dark.
 * The browser's own pickers ignore page styles in some browsers (white Windows calendars on a dark board).
 * Both still accept typing: dates as 2026-10-29, 29/10/2026 or 29 Oct 2026; times as 14:00 or 2pm.
 */

const LONG = new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-SG", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (n: number) => String(n).padStart(2, "0");
const show = (iso: string) => (isValidDate(iso) ? LONG.format(new Date(`${iso}T00:00:00Z`)) : "");

/** Read what someone typed as a date; null when it isn't one. */
function parseDate(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/^[a-z]{3},?\s+/, ""); // drop a leading weekday
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return check(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t); // day first, as in Singapore
  if (m) return check(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[2])) return check(+m[3], MONTHS.indexOf(m[2]) + 1, +m[1]);
  return null;
}
const check = (y: number, mo: number, d: number) => {
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  return isValidDate(iso) ? iso : null;
};

/** Read a typed time as HH:MM (24 h); null when it isn't one. */
function parseTime(text: string): string | null {
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/.exec(text.trim().toLowerCase());
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

/** Close a pop-up when clicking outside it or pressing Escape. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

export function DateField({
  id,
  value,
  onChange,
  min,
  required,
  label,
  today,
}: {
  id?: string;
  value: string; // YYYY-MM-DD or ""
  onChange: (iso: string) => void;
  min?: string;
  required?: boolean;
  label?: string; // aria-label when there's no <label for>
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const [cursor, setCursor] = useState(value || today); // the day the arrow keys move around
  const box = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useDismiss(open, box, () => setOpen(false));
  useOnScreen(pop, open);
  useEffect(() => {
    if (!focused) setText(show(value));
  }, [value, focused]);

  const pick = (iso: string) => {
    if (min && iso < min) return;
    onChange(iso);
    setText(show(iso));
    setOpen(false);
  };
  const openAt = (iso: string) => {
    setMonth(iso.slice(0, 7));
    setCursor(iso);
    setOpen(true);
  };
  const first = `${month}-01`;
  const start = addDays(first, -((weekday(first) + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const shift = (by: number) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + by);
    setMonth(d.toISOString().slice(0, 7));
  };
  const moveCursor = (by: number) => {
    const next = addDays(cursor, by);
    setCursor(next);
    setMonth(next.slice(0, 7));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!open && e.key === "ArrowDown") {
      e.preventDefault();
      return openAt(value || today);
    }
    if (open && e.key in moves) {
      e.preventDefault();
      return moveCursor(moves[e.key]);
    }
    if (e.key === "Enter") {
      const typed = parseDate(text);
      if (open && (!typed || typed === value)) {
        e.preventDefault();
        return pick(cursor);
      }
      if (typed) {
        e.preventDefault();
        pick(typed);
      }
    }
  };

  return (
    <span className="picker" ref={box}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        value={text}
        placeholder="Pick a date"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onFocus={() => setFocused(true)}
        onClick={() => !open && openAt(value || today)}
        onChange={(e) => {
          setText(e.target.value);
          const typed = parseDate(e.target.value);
          if (typed && (!min || typed >= min)) {
            onChange(typed);
            if (open) openAt(typed); // follow the typed date if the calendar is showing; don't pop it open
          } else if (!e.target.value.trim()) onChange("");
        }}
        onBlur={(e) => {
          setFocused(false);
          setText(show(value));
          if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
        onKeyDown={onKey}
      />
      <button type="button" className="picker-btn" tabIndex={-1} aria-label="Open calendar" onClick={() => (open ? setOpen(false) : openAt(value || today))}>
        📅
      </button>
      {open && (
        <div className="picker-pop panel" role="dialog" aria-label="Choose a date" ref={pop}>
          <div className="picker-head">
            <button type="button" className="x" aria-label="Previous month" onClick={() => shift(-1)}>
              ‹
            </button>
            <b>{MONTH.format(new Date(`${month}-01T00:00:00Z`))}</b>
            <button type="button" className="x" aria-label="Next month" onClick={() => shift(1)}>
              ›
            </button>
          </div>
          <div className="picker-grid" role="grid">
            {DOW.map((d) => (
              <span key={d} className="picker-dow">
                {d}
              </span>
            ))}
            {days.map((d) => (
              <button
                key={d}
                type="button"
                role="gridcell"
                tabIndex={-1}
                aria-selected={d === value}
                aria-label={show(d)}
                disabled={!!min && d < min}
                className={`picker-day ${d.slice(0, 7) !== month ? "other" : ""} ${d === today ? "today" : ""} ${d === cursor ? "cursor" : ""}`}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the text field
                onClick={() => pick(d)}
              >
                {Number(d.slice(8))}
              </button>
            ))}
          </div>
          <div className="picker-foot">
            <button type="button" className="x" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(today)} disabled={!!min && today < min}>
              Today
            </button>
            {!required && value && (
              <button
                type="button"
                className="x"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange("");
                  setText("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

const TIMES = Array.from({ length: (22 - 7) * 4 + 1 }, (_, i) => `${pad(7 + Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

/** A time field with a themed list of quarter hours from 07:00 to 22:00; any time can still be typed. */
export function TimeField({ value, onChange, label, required }: { value: string; onChange: (t: string) => void; label: string; required?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const box = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useDismiss(open, box, () => setOpen(false));
  useOnScreen(list, open);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "center" });
  }, [open]);
  return (
    <span className="picker time" ref={box}>
      <input
        type="text"
        autoComplete="off"
        required={required}
        value={text}
        placeholder="14:00"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          const t = parseTime(e.target.value);
          if (t) onChange(t);
        }}
        onBlur={(e) => {
          setText(value);
          if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setOpen(true);
          if (e.key === "Enter" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="picker-pop panel picker-times" role="listbox" aria-label={label} ref={list}>
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={t === value}
              className="picker-time"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
