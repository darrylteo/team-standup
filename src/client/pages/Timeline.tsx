import { useState } from "react";
import type { Milestone, MilestoneHistory, MilestoneStatus } from "../../shared/types";
import { api, useApi } from "../api";
import { useAsk } from "../ask";
import { Face } from "../components/Avatar";
import { DateField } from "../components/Pickers";
import { flightCode, fmtAgo, fmtDate, milestoneTone, STATUS_LABEL } from "../format";
import { useTeam } from "../state";

type Draft = Pick<Milestone, "title" | "due_date" | "owners" | "status" | "notes">;
const blank = (): Draft => ({ title: "", due_date: "", owners: [], status: "planned", notes: "" });

function MilestoneForm({ initial, onSave, onCancel, submitLabel }: { initial: Draft; onSave: (d: Draft) => Promise<void>; onCancel?: () => void; submitLabel: string }) {
  const { members, today } = useTeam();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="pmain"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave(d);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="ms-title">Milestone</label>
        <input id="ms-title" type="text" required value={d.title} placeholder="e.g. Final report to Partner" onChange={(e) => setD({ ...d, title: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div className="field">
          <label htmlFor="ms-due">Due</label>
          <DateField id="ms-due" required today={today} value={d.due_date} onChange={(due_date) => setD({ ...d, due_date })} />
        </div>
        <div className="field">
          <label htmlFor="ms-status">Status</label>
          <select id="ms-status" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as MilestoneStatus })}>
            {(Object.keys(STATUS_LABEL) as MilestoneStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <span className="lbl">Owners</span>
        <div className="chips">
          {members.map((m) => {
            const on = d.owners.includes(m.id);
            return (
              <button type="button" key={m.id} className="chip" aria-pressed={on} onClick={() => setD({ ...d, owners: on ? d.owners.filter((x) => x !== m.id) : [...d.owners, m.id] })}>
                {m.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="field">
        <label htmlFor="ms-notes">Notes</label>
        <textarea id="ms-notes" rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </div>
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="btn primary" type="submit" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function describe(h: MilestoneHistory, name: (id: number) => string) {
  const title = h.title;
  if (h.action === "create") return `added “${title}”`;
  if (h.action === "delete") return `removed “${title}”`;
  const parts = Object.entries(h.changes).map(([k, { from, to }]) => {
    if (k === "due_date") return `moved the date ${fmtDate(String(from))} → ${fmtDate(String(to))}`;
    if (k === "status") return `set status to ${STATUS_LABEL[to as MilestoneStatus]}`;
    if (k === "owners") return `changed owners to ${(to as number[]).map(name).join(", ") || "nobody"}`;
    if (k === "title") return `renamed it to “${to}”`;
    return "edited the notes";
  });
  return `${parts.join(", ")} on “${title}”`;
}

export function Timeline() {
  const { milestones, today, byId, reloadMilestones, toast } = useTeam();
  const ask = useAsk();
  const history = useApi<MilestoneHistory[]>("/milestones/history");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const name = (id: number) => byId.get(id)?.name ?? "?";

  const refresh = async () => {
    await Promise.all([reloadMilestones(), history.reload()]);
  };
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      await refresh();
      toast(msg);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <main className="two">
      <section className="panel" aria-label="Milestones">
        <div className="ph cond">
          <b>Long-haul flights</b>
          <span>anyone can edit · every change is logged</span>
        </div>
        {adding ? (
          <MilestoneForm
            initial={blank()}
            submitLabel="Add to the board"
            onCancel={() => setAdding(false)}
            onSave={(d) =>
              run(async () => {
                await api("/milestones", { body: d });
                setAdding(false);
              }, "Milestone added")
            }
          />
        ) : (
          <div className="pmain" style={{ paddingBottom: 0 }}>
            <button className="btn primary" onClick={() => setAdding(true)}>
              + Add milestone
            </button>
          </div>
        )}
        {milestones.length === 0 ? (
          <div className="empty">No milestones yet. Add the final report and any conference deadlines so nobody relies on verbal reminders.</div>
        ) : (
          <table className="fids">
            <thead>
              <tr>
                <th>Flight</th>
                <th>Milestone</th>
                <th>Crew</th>
                <th>Due</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) =>
                editing === m.id ? (
                  <tr key={m.id}>
                    <td colSpan={6}>
                      <MilestoneForm
                        initial={m}
                        submitLabel="Save changes"
                        onCancel={() => setEditing(null)}
                        onSave={(d) =>
                          run(async () => {
                            await api(`/milestones/${m.id}`, { method: "PATCH", body: d });
                            setEditing(null);
                          }, "Milestone updated")
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} data-focus={`milestone-${m.id}`}>
                    <td className="mono">{flightCode(m.id)}</td>
                    <td>
                      <b>{m.title}</b>
                      {m.notes && <div className="muted" style={{ fontSize: 13 }}>{m.notes}</div>}
                    </td>
                    <td>
                      <div className="owners">
                        {m.owners.length === 0 && <span className="muted">—</span>}
                        {m.owners.map((id) => {
                          const o = byId.get(id);
                          return o ? (
                            <Face key={id} member={o} as="span" title={o.name} />
                          ) : null;
                        })}
                      </div>
                    </td>
                    <td>
                      <div>{fmtDate(m.due_date, true)}</div>
                      <div className="eta">{(() => {
                        const t = milestoneTone(m, today);
                        return m.status === "done" ? "—" : t.days < 0 ? `${-t.days} d late` : `T-${t.days} d`;
                      })()}</div>
                    </td>
                    <td>
                      <span className={`pill ${milestoneTone(m, today).cls}`}>{milestoneTone(m, today).label}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="mini" style={{ marginTop: 0 }} onClick={() => setEditing(m.id)}>
                        Edit
                      </button>{" "}
                      <button
                        className="x"
                        aria-label={`Remove ${m.title}`}
                        onClick={async () =>
                          (await ask({ title: `Remove “${m.title}”?`, body: "It stays in the change log.", confirm: "Remove", danger: true })) !== null &&
                          run(() => api(`/milestones/${m.id}`, { method: "DELETE" }), "Milestone removed")
                        }
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>
      <section className="panel" aria-label="Change log">
        <details>
        <summary className="ph cond">
          <b>Change history</b>
          <span>who moved which deadline ▾</span>
        </summary>
        {history.data?.length === 0 && <div className="empty">No changes yet.</div>}
        {history.data?.map((h) => (
          <div className="log" key={h.id}>
            <b>{name(h.member_id)}</b> {describe(h, name)}
            <div className="when">{fmtAgo(h.at)}</div>
          </div>
        ))}
      </details>
      </section>
    </main>
  );
}
