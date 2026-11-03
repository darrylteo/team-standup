import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DEEP_DIVE_MINUTES, WEATHER } from "../../shared/catalog";
import type { Update, UpdateBody, WaitingItem } from "../../shared/types";
import { emptyUpdate } from "../../shared/validate";
import { api, apiUpload, useApi } from "../api";
import { Sections, WhoBlock } from "../components/UpdateCard";
import { WaitingOnMe } from "../components/WaitingOnMe";
import { fmtAgo, fmtDate } from "../format";
import { saveLabel, useAutosave, useUnsavedGuard } from "../hooks";
import { prepareFigure } from "../photo";
import { useTeam } from "../state";

interface MineResponse {
  date: string;
  update: Update | null;
  suggestions: { done: string[]; waiting: WaitingItem[]; from_date: string | null };
}

const newId = () => Math.random().toString(36).slice(2, 10);

function ListEditor({ id, label, hint, items, onChange }: { id: string; label: string; hint: string; items: string[]; onChange: (v: string[]) => void }) {
  const rows = items.length ? items : [""];
  const set = (i: number, v: string) => onChange(rows.map((x, j) => (j === i ? v : x)));
  return (
    <div className="field">
      <label htmlFor={`${id}-0`}>{label}</label>
      <div className="items">
        {rows.map((v, i) => (
          <div className="item" key={i}>
            <input
              id={`${id}-${i}`}
              type="text"
              value={v}
              placeholder={i === 0 ? hint : ""}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (v.trim()) {
                    onChange([...rows.slice(0, i + 1), "", ...rows.slice(i + 1)]);
                    setTimeout(() => document.getElementById(`${id}-${i + 1}`)?.focus());
                  }
                }
              }}
              aria-label={`${label} item ${i + 1}`}
            />
            <button type="button" className="x" aria-label={`Remove ${label} item ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="add" onClick={() => onChange([...rows, ""])}>
          + add line
        </button>
      </div>
    </div>
  );
}

function WaitingEditor({ items, onChange }: { items: WaitingItem[]; onChange: (v: WaitingItem[]) => void }) {
  const { members, me } = useTeam();
  const set = (i: number, patch: Partial<WaitingItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const shown = items.filter((w) => w.state !== "resolved");
  return (
    <div className="field">
      <span className="lbl">Needs input from</span>
      <div className="items">
        {items.map((w, i) =>
          w.state === "resolved" ? null : (
            <div className="item wait" key={w.id}>
              <select
                value={w.member_id ?? "other"}
                onChange={(e) => set(i, e.target.value === "other" ? { member_id: null } : { member_id: Number(e.target.value), who: "" })}
                aria-label={`Who you need input from, item ${i + 1}`}
              >
                {members
                  .filter((m) => m.id !== me.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      @{m.handle ?? m.name}
                    </option>
                  ))}
                <option value="other">Someone else…</option>
              </select>
              <div style={{ display: "grid", gap: 6 }}>
                {w.member_id === null && <input type="text" value={w.who} placeholder="Who? e.g. Partner data team" onChange={(e) => set(i, { who: e.target.value })} aria-label="Who, outside the team" />}
                <input type="text" value={w.text} placeholder="What for? e.g. crew roster for December" onChange={(e) => set(i, { text: e.target.value })} aria-label={`What you need, item ${i + 1}`} />
                <span className="chips">
                  <button type="button" className="chip" aria-pressed={!w.private} onClick={() => set(i, { private: false })}>
                    👥 Team
                  </button>
                  <button type="button" className="chip" aria-pressed={w.private} onClick={() => set(i, { private: true })} title="Only you and them see it">
                    🔒 Private
                  </button>
                  {w.state === "clear_requested" && (
                    <>
                      <span className="flair plain small">They marked this cleared</span>
                      <button type="button" className="chip" onClick={() => set(i, { state: "resolved" })}>
                        ✓ Confirm
                      </button>
                    </>
                  )}
                </span>
              </div>
              <button type="button" className="x" aria-label={`Remove request ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ),
        )}
        {shown.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Nobody — great. Add someone if you're held up.</span>}
        <button
          type="button"
          className="add"
          onClick={() => onChange([...items, { id: newId(), member_id: members.find((m) => m.id !== me.id)?.id ?? null, who: "", text: "", private: false, state: "open" }])}
        >
          + I need input from someone
        </button>
      </div>
    </div>
  );
}

const tidy = (b: UpdateBody): UpdateBody => ({
  ...b,
  done: b.done.filter((x) => x.trim()),
  issues: b.issues.filter((x) => x.trim()),
  next: b.next.filter((x) => x.trim()),
  waiting: b.waiting.filter((w) => w.text.trim()),
});

export function CheckIn() {
  const { meeting, me, members, toast, byId } = useTeam();
  const [params] = useSearchParams();
  const date = params.get("date") ?? meeting.date;
  const mine = useApi<MineResponse>(`/updates/mine?date=${date}`);
  const [body, setBody] = useState<UpdateBody>(emptyUpdate());
  const [saved, setSaved] = useState<Update | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const figRef = useRef<HTMLInputElement>(null);

  // Every change saves itself a moment later: as a draft until submitted, then straight onto the card.
  // Nobody is notified about requests until the card is submitted (the server holds those back for drafts).
  const auto = useAutosave(
    tidy(body),
    async (b) => {
      try {
        setSaved(await api<Update>(`/updates/${date}`, { method: "PUT", body: { ...b, submit: false } }));
      } catch (e) {
        toast((e as Error).message);
        throw e;
      }
    },
    { enabled: loaded },
  );

  // A reload (e.g. after adding a figure) refreshes what's saved but never overwrites unsaved typing.
  const dirtyRef = useRef(false);
  dirtyRef.current = auto.dirty;
  useEffect(() => {
    if (!mine.data) return;
    const { update } = mine.data;
    setSaved(update);
    setLoaded(true);
    if (dirtyRef.current) return;
    const fresh = update ? { ...emptyUpdate(), ...update } : emptyUpdate();
    auto.reset(tidy(fresh));
    setBody(fresh);
  }, [mine.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching tabs finishes saving first; only a failed save asks before leaving.
  useUnsavedGuard(auto.dirty, auto.flush);

  const patch = (p: Partial<UpdateBody>) => setBody((b) => ({ ...b, ...p }));

  const submit = async () => {
    setBusy(true);
    try {
      const u = await api<Update>(`/updates/${date}`, { method: "PUT", body: { ...tidy(body), submit: true } });
      auto.reset(tidy(body));
      setSaved(u);
      toast("✈ Checked in. See you at the gate!");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploadFigure = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      // The figure hangs off the check-in, so make sure one exists (as a draft) first.
      if (!saved) setSaved(await api<Update>(`/updates/${date}`, { method: "PUT", body: { ...tidy(body), submit: false } }));
      await apiUpload(`/figures/${date}`, await prepareFigure(file));
      await mine.reload();
      toast("Figure added 📈");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      if (figRef.current) figRef.current.value = "";
    }
  };

  if (!mine.data) return <div className="empty">{mine.error ?? "Loading your boarding pass…"}</div>;
  const sugg = mine.data.suggestions.done.filter((s) => !body.done.includes(s) && !body.next.includes(s));
  const carry = mine.data.suggestions.waiting.filter((w) => !body.waiting.some((x) => x.id === w.id));
  const preview: Update = {
    ...(saved ?? { id: 0, member_id: me.id, meeting_date: date, submitted_at: null, updated_at: "", figure: null }),
    ...tidy(body),
  };
  const others = members.filter((m) => m.id !== me.id);

  return (
    <main className="two">
      <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
        <WaitingOnMe compact />
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="ph cond">
            <b>Check-in · {fmtDate(date, true)}</b>
            <span>{saved?.submitted_at ? `submitted ${fmtAgo(saved.submitted_at)}` : saved ? "draft" : "not started"}</span>
          </div>
          <div className="pmain">
            {(sugg.length > 0 || carry.length > 0) && (
              <div className="suggest">
                <div style={{ marginBottom: 6 }}>
                  From your check-in for <b>{fmtDate(mine.data.suggestions.from_date!)}</b>:
                </div>
                <div className="chips stagger">
                  {sugg.map((s) => (
                    <button type="button" key={s} className="chip" onClick={() => patch({ done: [...body.done.filter((x) => x.trim()), s] })}>
                      ✓ {s}
                    </button>
                  ))}
                  {sugg.length > 0 && (
                    <button type="button" className="chip" onClick={() => patch({ next: [...body.next.filter((x) => x.trim()), ...sugg] })}>
                      ↻ carry the rest to next week
                    </button>
                  )}
                  {carry.length > 0 && (
                    <button type="button" className="chip" onClick={() => patch({ waiting: [...body.waiting, ...carry] })}>
                      ⏳ still need input on {carry.length} thing{carry.length > 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="field">
              <span className="lbl">Flight conditions · how is the work going?</span>
              <div className="chips stagger" role="group" aria-label="Flight conditions">
                {WEATHER.map((w) => (
                  <button type="button" key={w.key} className="chip" aria-pressed={body.weather === w.key} onClick={() => patch({ weather: body.weather === w.key ? "" : w.key })}>
                    {w.icon} {w.label}
                  </button>
                ))}
              </div>
            </div>

            <ListEditor id="done" label="Done this week" hint="e.g. Added greedy insertion heuristic" items={body.done} onChange={(done) => patch({ done })} />
            <ListEditor id="issues" label="Issues to raise" hint="Decisions or help you need from the group" items={body.issues} onChange={(issues) => patch({ issues })} />
            <WaitingEditor items={body.waiting} onChange={(waiting) => patch({ waiting })} />
            <ListEditor id="next" label="Next week" hint="Becomes next week's suggestions" items={body.next} onChange={(next) => patch({ next })} />

            <div className="field">
              <span className="lbl">Figure of the week (optional)</span>
              <div className="chips" style={{ alignItems: "center" }}>
                <label className="btn" style={{ cursor: busy ? "default" : "pointer" }}>
                  📈 {saved?.figure ? "Replace figure" : "Add one image"}
                  <input ref={figRef} type="file" accept="image/*" className="sr" disabled={busy} aria-label="Upload figure of the week" onChange={(e) => uploadFigure(e.target.files?.[0])} />
                </label>
                {saved?.figure && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={async () => {
                      await api(`/figures/${date}`, { method: "DELETE" });
                      await mine.reload();
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input type="text" value={body.figure_caption} maxLength={200} placeholder="Caption, e.g. Deadhead vs STT deviation across 15 days" onChange={(e) => patch({ figure_caption: e.target.value })} aria-label="Figure caption" />
            </div>

            <div className="field">
              <label htmlFor="fun">In-flight extras (optional)</label>
              <textarea
                id="fun"
                rows={2}
                value={body.fun}
                placeholder="Anything else worth sharing: a paper, a talk, a tool, an event, a photo…"
                onChange={(e) => patch({ fun: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="files">Where are your files?</label>
              <input id="files" type="text" value={body.files} placeholder="e.g. OneDrive › Weekly Update Slides › Priya › 20261029_priya.pptx" onChange={(e) => patch({ files: e.target.value })} />
            </div>

            <div className="field">
              <label style={{ display: "flex", gap: 8, alignItems: "center", textTransform: "none", letterSpacing: 0, fontFamily: "Inter", fontSize: 15, color: "var(--ink)" }}>
                <input type="checkbox" checked={!!body.deep_dive} onChange={(e) => patch({ deep_dive: e.target.checked ? { topic: "", minutes: 15, with: [] } : null })} />I need a deep dive after the round
              </label>
              {body.deep_dive && (
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    type="text"
                    value={body.deep_dive.topic}
                    placeholder="Topic, e.g. real-time tow scheduling results"
                    onChange={(e) => patch({ deep_dive: { ...body.deep_dive!, topic: e.target.value } })}
                    aria-label="Deep dive topic"
                  />
                  <span className="k">How long do you need?</span>
                  <div className="chips" role="group" aria-label="Deep dive length">
                    {DEEP_DIVE_MINUTES.map((n) => (
                      <button type="button" key={n} className="chip" aria-pressed={body.deep_dive!.minutes === n} onClick={() => patch({ deep_dive: { ...body.deep_dive!, minutes: n } })}>
                        {n} min
                      </button>
                    ))}
                  </div>
                  <span className="k">Most relevant to</span>
                  <div className="chips">
                    {others.map((m) => {
                      const on = body.deep_dive!.with.includes(m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          className="chip"
                          aria-pressed={on}
                          onClick={() => patch({ deep_dive: { ...body.deep_dive!, with: on ? body.deep_dive!.with.filter((x) => x !== m.id) : [...body.deep_dive!.with, m.id] } })}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="actions sticky-actions">
              {saved?.submitted_at ? (
                <span className="flair k-done-flair">✈ Checked in · changes save automatically</span>
              ) : (
                <button className="btn primary" type="submit" disabled={busy} data-focus="submit-checkin">
                  ✈ Submit check-in
                </button>
              )}
              <span className={auto.state === "error" ? "err" : "saved"} aria-live="polite">
                {saved || auto.dirty ? saveLabel(auto.state) : "Your draft saves as you type"}
              </span>
            </div>
          </div>
        </form>
      </div>

      <aside className="side" style={{ position: "sticky", top: 16 }}>
        <article className="pass solo" aria-label="Preview">
          <div className="pmain">
            <div className="ptop cond">
              <span>Preview · how the team sees it</span>
            </div>
            <WhoBlock member={byId.get(me.id) ?? me} u={preview} />
            <Sections u={preview} />
          </div>
        </article>
      </aside>
    </main>
  );
}
