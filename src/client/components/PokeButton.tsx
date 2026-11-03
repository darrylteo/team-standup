import { useState } from "react";
import type { Member } from "../../shared/types";
import { api } from "../api";
import { useTeam } from "../state";

export function PokeButton({ to, note = "", className = "mini" }: { to: Member; note?: string; className?: string }) {
  const { toast } = useTeam();
  const [sent, setSent] = useState(false);
  const poke = async () => {
    try {
      await api("/pokes", { body: { to: to.id, note } });
      setSent(true);
      toast(`👉 Poked ${to.name}`);
      // Pokes are unlimited; the short pause only stops accidental double-clicks.
      setTimeout(() => setSent(false), 4000);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <button className={className} onClick={poke} disabled={sent}>
      {sent ? `✓ Poked ${to.name}` : `👉 Poke ${to.name}`}
    </button>
  );
}
