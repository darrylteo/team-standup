import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { NOTE_COLORS, NOTE_LIMITS } from "../../shared/catalog";
import type { MeetingNote } from "../../shared/types";
import { api, ApiError, useApi } from "../api";
import { useAsk } from "../ask";
import { fmtAgo } from "../format";
import { useTeam } from "../state";
import { Face } from "./Avatar";

const NOTE_W = 230; // px on a wide board
const NOTE_H = 150; // typical height, for finding a free spot
const GAP = 14;
const PAD = 14; // margin inside the board
const SAVE_MS = 500; // typing pause before saving
const HEARTBEAT_MS = 8_000; // keeps the "is typing" lock while the note has focus

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** The first spot, in reading order, that no note covers. Positions are stored as x = fraction of the free width. */
function freeSpot(notes: MeetingNote[], width: number): { x: number; y: number } {
  const span = Math.max(1, width - NOTE_W - 2 * PAD);
  const cols = Math.max(1, Math.floor((width - 2 * PAD + GAP) / (NOTE_W + GAP)));
  for (let i = 0; i < 200; i++) {
    const left = (i % cols) * (NOTE_W + GAP);
    const y = Math.floor(i / cols) * (NOTE_H + GAP) + GAP;
    const taken = notes.some((n) => Math.abs(n.x * span - left) < NOTE_W - 20 && Math.abs(n.y - y) < NOTE_H - 20);
    if (!taken) return { x: Math.min(1, left / span), y };
  }
  return { x: 0, y: notes.length * (NOTE_H + GAP) };
}

/**
 * The meeting's shared whiteboard. Anyone in the project adds sticky notes and types in them at the same time;
 * each note is saved on its own, and a note someone is typing in is read-only for everyone else until they stop.
 * When the meeting is over the notes are filed on the Calendar as the meeting's flight log.
 */
export function Whiteboard({ date, live, over }: { date: string; live: boolean; over: boolean }) {
  const { toast } = useTeam();
  const [focused, setFocused] = useState<number | null>(null);
  // Fastest while you're typing in a note, so you see others' notes move as you work.
  const notes = useApi<MeetingNote[]>(`/notes/${date}`, focused !== null ? 2_500 : live ? 5_000 : 10_000, { idleMs: live ? 5_000 : undefined });
  const boardRef = useRef<HTMLDivElement>(null);
  const width = useWidth(boardRef);
  const wide = width >= 600;
  const [fresh, setFresh] = useState<number | null>(null); // a note just added, to focus once it renders
  const list = notes.data ?? [];

  const replace = (n: MeetingNote) => notes.setData((xs) => (xs ? xs.map((x) => (x.id === n.id ? n : x)) : xs));
  const add = async (at?: { x: number; y: number }) => {
    try {
      const n = await api<MeetingNote>(`/notes/${date}`, { body: at ?? freeSpot(list, width) });
      notes.setData((xs) => [...(xs ?? []), n]);
      setFresh(n.id);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const height = wide ? Math.max(260, ...list.map((n) => n.y + NOTE_H + 70)) : undefined;

  return (
    <section className="panel whiteboard" aria-label="Whiteboard" data-focus="whiteboard">
      <div className="ph cond">
        <b>Whiteboard</b>
        <span>{over ? (list.some((n) => n.text.trim()) ? "📒 filed in the flight log" : "meeting over") : "shared meeting notes · filed on the calendar afterwards"}</span>
      </div>
      <div className="wb-tools">
        <button className="btn" onClick={() => add()} disabled={list.length >= NOTE_LIMITS.perMeeting}>
          ＋ Add a note
        </button>
        <span className="muted">
          {wide ? "Drag a note by its top strip. Double-click the board to add one there. " : ""}Everyone sees changes within a few seconds.
        </span>
      </div>
      <div
        ref={boardRef}
        className={`wb-board ${wide ? "" : "stack"}`}
        style={{ height }}
        onDoubleClick={(e) => {
          if (!wide || e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          const span = Math.max(1, width - NOTE_W - 2 * PAD);
          void add({ x: Math.min(1, Math.max(0, (e.clientX - r.left - PAD - NOTE_W / 2) / span)), y: Math.max(0, Math.round(e.clientY - r.top - 20)) });
        }}
      >
        {notes.data === null && <div className="empty">Loading the whiteboard…</div>}
        {notes.data?.length === 0 && (
          <div className="wb-empty">
            <div aria-hidden="true">📝</div>
            Nothing on the board yet. Add decisions, follow-ups and anything worth remembering from the meeting.
          </div>
        )}
        {list.map((n) => (
          <Note
            key={n.id}
            note={n}
            wide={wide}
            span={Math.max(1, width - NOTE_W - 2 * PAD)}
            date={date}
            autoFocus={fresh === n.id}
            onFocusChange={(on) => setFocused(on ? n.id : (f) => (f === n.id ? null : f))}
            onSaved={replace}
            onRemoved={() => notes.setData((xs) => (xs ? xs.filter((x) => x.id !== n.id) : xs))}
          />
        ))}
      </div>
    </section>
  );
}

function Note({
  note,
  wide,
  span,
  date,
  autoFocus,
  onFocusChange,
  onSaved,
  onRemoved,
}: {
  note: MeetingNote;
  wide: boolean;
  span: number;
  date: string;
  autoFocus: boolean;
  onFocusChange: (on: boolean) => void;
  onSaved: (n: MeetingNote) => void;
  onRemoved: () => void;
}) {
  const { me, byId, toast } = useTeam();
  const ask = useAsk();
  const [text, setText] = useState(note.text);
  const [focused, setFocused] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number; x: number; y: number } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const lockedBy = note.editing_by && note.editing_by !== me.id ? byId.get(note.editing_by) : undefined;
  const author = byId.get(note.author_id);
  const editor = note.updated_by && note.updated_by !== note.author_id ? byId.get(note.updated_by) : undefined;
  const path = `/notes/${date}/${note.id}`;

  // Other people's edits arrive by polling; they never replace what I'm typing.
  useEffect(() => {
    if (!focused) setText(note.text);
  }, [note.text, focused]);

  useEffect(() => {
    if (autoFocus) area.current?.focus();
  }, [autoFocus]);

  // Keep the lock while focused, in case I pause typing for a while.
  useEffect(() => {
    if (!focused) return;
    const t = window.setInterval(() => void api(`${path}/lock`, { body: { on: true } }).catch(() => {}), HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [focused, path]);

  const save = async () => {
    window.clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value === null) return;
    try {
      onSaved(await api<MeetingNote>(path, { method: "PATCH", body: { text: value } }));
    } catch (e) {
      toast((e as Error).message);
      if (e instanceof ApiError && e.status === 409) area.current?.blur();
    }
  };

  const remove = async () => {
    if (text.trim() && (await ask({ title: "Remove this note?", body: text.slice(0, 140), confirm: "Remove", danger: true })) === null) return;
    try {
      await api(path, { method: "DELETE" });
      onRemoved();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!wide || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    setDrag({ dx: e.clientX, dy: e.clientY, x: note.x, y: note.y });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag({ ...drag, x: Math.min(1, Math.max(0, note.x + (e.clientX - drag.dx) / span)), y: Math.max(0, note.y + e.clientY - drag.dy) });
  };
  const onPointerUp = async () => {
    if (!drag) return;
    const { x, y } = drag;
    onSaved({ ...note, x, y }); // stay where it was dropped while the server confirms
    setDrag(null);
    if (x !== note.x || y !== note.y) {
      try {
        onSaved(await api<MeetingNote>(path, { method: "PATCH", body: { x, y } }));
      } catch (e) {
        toast((e as Error).message);
      }
    }
  };

  const x = drag?.x ?? note.x;
  const y = drag?.y ?? note.y;
  const canRemove = note.author_id === me.id || me.is_admin || !text.trim();
  return (
    <div
      className={`wb-note ${drag ? "dragging" : ""} ${lockedBy ? "locked" : ""}`}
      style={{
        background: `var(--flair-${note.color}-bg)`,
        color: `var(--flair-${note.color}-fg)`,
        ...(wide ? { left: PAD + x * span, top: y, width: NOTE_W } : {}),
      }}
      data-note-id={note.id}
    >
      <div className="wb-strip" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
        {author && <Face member={author} />}
        <span className="wb-who">{author?.name ?? "Someone"}</span>
        <button
          className="x"
          title="Change colour"
          aria-label="Change note colour"
          onClick={async () => {
            const next = NOTE_COLORS[(NOTE_COLORS.indexOf(note.color as (typeof NOTE_COLORS)[number]) + 1) % NOTE_COLORS.length];
            onSaved({ ...note, color: next });
            await api<MeetingNote>(path, { method: "PATCH", body: { color: next } }).then(onSaved, (e: Error) => toast(e.message));
          }}
        >
          ◐
        </button>
        {canRemove && (
          <button className="x" aria-label="Remove note" title="Remove note" onClick={remove}>
            ✕
          </button>
        )}
      </div>
      <textarea
        ref={area}
        value={text}
        rows={4}
        maxLength={NOTE_LIMITS.chars}
        readOnly={!!lockedBy}
        placeholder={lockedBy ? "" : "Type a note…"}
        aria-label={`Note by ${author?.name ?? "someone"}`}
        onFocus={async () => {
          if (lockedBy) return;
          setFocused(true);
          onFocusChange(true);
          try {
            await api(`${path}/lock`, { body: { on: true } });
          } catch (e) {
            toast((e as Error).message);
            area.current?.blur();
          }
        }}
        onChange={(e) => {
          setText(e.target.value);
          pending.current = e.target.value;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(save, SAVE_MS);
        }}
        onBlur={async () => {
          await save();
          setFocused(false);
          onFocusChange(false);
          // An empty note I just made goes away again instead of cluttering the board.
          if (!area.current?.value.trim() && note.author_id === me.id) {
            await api(path, { method: "DELETE" }).catch(() => {});
            onRemoved();
            return;
          }
          void api(`${path}/lock`, { body: { on: false } }).catch(() => {});
        }}
      />
      <div className="wb-foot">
        {lockedBy ? <span className="typing">✎ {lockedBy.name} is typing…</span> : editor ? `edited by ${editor.name} · ${fmtAgo(note.updated_at)}` : fmtAgo(note.updated_at)}
      </div>
    </div>
  );
}
