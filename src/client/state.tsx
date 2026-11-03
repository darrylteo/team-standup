import { createContext, useContext, useMemo, type ReactNode } from "react";
import { badgeLook } from "../shared/catalog";
import type { BadgeAward, Member, Milestone, Project } from "../shared/types";
import { useApi } from "./api";
import { useSession } from "./session";

interface MeResponse {
  me: Member;
  project: Project;
  unread: number;
  waiting_on_me: number;
  upcoming: string;
  meeting: { date: string; time: string; scheduled: boolean };
  today: string;
}

interface Team {
  me: Member;
  project: Project;
  unread: number;
  waiting_on_me: number;
  upcoming: string;
  meeting: MeResponse["meeting"];
  today: string;
  members: Member[]; // active teammates
  everyone: Member[]; // including deactivated, for names in history
  byId: Map<number, Member>;
  milestones: Milestone[];
  awards: BadgeAward[];
  badgesOf: (memberId: number) => { key: string; label: string; icon: string; count: number }[];
  reloadMe: () => Promise<void>;
  reloadMembers: () => Promise<void>;
  reloadMilestones: () => Promise<void>;
  reloadBadges: () => Promise<void>;
  toast: (msg: string) => void;
}

const TeamContext = createContext<Team | null>(null);

export function useTeam(): Team {
  const t = useContext(TeamContext);
  if (!t) throw new Error("useTeam outside TeamProvider");
  return t;
}

export function TeamProvider({ children, fallback }: { children: ReactNode; fallback: (error: string | null) => ReactNode }) {
  const me = useApi<MeResponse>("/me", 30_000);
  const members = useApi<Member[]>("/members");
  const milestones = useApi<Milestone[]>("/milestones", 60_000);
  const badges = useApi<{ awarded: BadgeAward[] }>("/badges", 60_000);
  // Toasts live on the session, so "You left …" survives the switch to another project.
  const { toast } = useSession();

  const value = useMemo<Team | null>(() => {
    if (!me.data || !members.data) return null;
    const awards = badges.data?.awarded ?? [];
    return {
      ...me.data,
      members: members.data.filter((m) => m.active),
      everyone: members.data,
      byId: new Map(members.data.map((m) => [m.id, m])),
      milestones: milestones.data ?? [],
      awards,
      badgesOf: (id) =>
        [
          ...awards
            .filter((a) => a.member_id === id)
            .reduce((m, a) => {
              const look = badgeLook(a);
              const cur = m.get(look.key);
              return m.set(look.key, { ...look, count: (cur?.count ?? 0) + 1 });
            }, new Map<string, { key: string; label: string; icon: string; count: number }>())
            .values(),
        ],
      reloadMe: me.reload,
      reloadMembers: members.reload,
      reloadMilestones: milestones.reload,
      reloadBadges: badges.reload,
      toast,
    };
  }, [me.data, members.data, milestones.data, badges.data, me.reload, members.reload, milestones.reload, badges.reload, toast]);

  if (!value) return <>{fallback(me.error ?? members.error)}</>;
  return (
    <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
  );
}
