export type TeamFile = {
  project: { title: string; subtitle: string; theme: string };
  members: { name: string; email: string; role: string; avatar: unknown; admin?: boolean; handle?: string | null }[];
};
export function seedStatements(team: TeamFile, inviteCode: string): string[];
