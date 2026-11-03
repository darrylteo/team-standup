import type { Bottleneck, Update } from "./types";

/** Group "waiting on" items by the teammate being waited on, most-blocking first. */
export function bottlenecks(updates: Pick<Update, "id" | "member_id" | "waiting">[]): Bottleneck[] {
  const byTarget = new Map<number, Bottleneck>();
  for (const u of updates) {
    for (const w of u.waiting) {
      if (w.member_id === null || w.member_id === u.member_id || w.state === "resolved") continue;
      const b = byTarget.get(w.member_id) ?? { member_id: w.member_id, waiting: [] };
      b.waiting.push({ from_id: u.member_id, update_id: u.id, item_id: w.id, text: w.text, private: w.private, state: w.state });
      byTarget.set(w.member_id, b);
    }
  }
  return [...byTarget.values()].sort((a, b) => b.waiting.length - a.waiting.length || a.member_id - b.member_id);
}
