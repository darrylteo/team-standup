import type { Account, Member, Project } from "../shared/types";

export interface Env {
  DB: D1Database;
  MEETING_WEEKDAY: string; // 0 = Sunday … 4 = Thursday
  ACCESS_TEAM_DOMAIN?: string; // e.g. lab.cloudflareaccess.com
  ACCESS_AUD?: string; // Access application audience tag
  BACKUP_CLIENT_ID?: string; // Access service token client id used by the OneDrive sync script
  EMAIL_DOMAIN?: string; // admins can only add emails at this domain, e.g. example.edu
  DEV_USER?: string; // local dev only, set in .dev.vars
  TRIAL_SWITCHER?: string; // "on": signed-in people may act as any teammate (trial database only, enforced by a unit test)
}

// account: the signed-in person (every route). me + project: set on /api/p/:pid/* routes once membership is checked.
export type AppEnv = { Bindings: Env; Variables: { account: Account | null; me: Member | null; project: Project | null; backup: boolean; signedInAs: string | null } };
