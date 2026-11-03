// Shapes shared by the Worker API and the React client.

export type Role = "researcher" | "prof";

/** Drawn avatar; every field is a key from AVATAR in catalog.ts. Missing fields fall back to role defaults. */
export interface Avatar {
  kind?: string;
  body?: string;
  skin?: string;
  hair?: string;
  hairColor?: string;
  eyes?: string;
  outfit?: string;
  outfitColor?: string;
  accessory?: string;
}

export interface Flair {
  text: string;
  color: string; // FLAIR_COLORS key
}

export interface Profile {
  flairs: Flair[]; // up to 3 custom flairs
  avatarBg: string; // AVATAR_BACKGROUNDS key: the colour behind a drawn avatar
  theme: "light" | "dark" | null; // the person's light/dark choice on every device; null follows the device
}

/** A person, independent of any project: their profile is shared across projects. */
export interface Account {
  id: number;
  email: string;
  name: string;
  handle: string | null; // @handle for mentions
  avatar: Avatar;
  photo: string | null; // URL of the uploaded avatar image in use, shown instead of the drawn avatar
  saved_photo: string | null; // last uploaded photo, kept even while the drawn avatar is in use
  profile: Profile;
}

/** A person as seen inside one project: their account plus that project's role, admin flag and order. */
export interface Member extends Account {
  role: Role;
  is_admin: boolean;
  active: boolean;
  deleted: boolean; // deleted from the project for good; kept only so old check-ins have a name
  sort: number;
}

export type ThemeKey = "terminal" | "lounge" | "runway" | "notebook" | "studio";

export interface Project {
  id: number;
  title: string;
  subtitle: string;
  theme: ThemeKey;
  invite_code?: string; // only sent to the project's admins
}

/** A project in the switcher, with my role in it and how much is unread there. */
export interface ProjectSummary extends Project {
  role: Role;
  is_admin: boolean;
  unread: number;
  members: number;
}

export type WaitingState = "open" | "clear_requested" | "resolved";

export interface WaitingItem {
  id: string; // stable id so the other person can mark it cleared
  member_id: number | null; // null = someone outside the team
  who: string; // free text when member_id is null (e.g. "Partner data team")
  text: string;
  private: boolean; // private items are visible only to the two people involved
  state: WaitingState;
}

export interface DeepDive {
  topic: string;
  minutes: number;
  with: number[]; // member ids most relevant to the topic
}

export interface UpdateBody {
  weather: string; // WEATHER key: how the work is going, may be ""
  done: string[];
  issues: string[];
  waiting: WaitingItem[];
  next: string[];
  fun: string;
  files: string; // where supporting files live in OneDrive
  figure_caption: string;
  deep_dive: DeepDive | null;
}

export interface Update extends UpdateBody {
  id: number;
  member_id: number;
  meeting_date: string; // YYYY-MM-DD
  submitted_at: string | null;
  updated_at: string;
  figure: string | null; // URL of the figure of the week
}

export interface MeetingDate {
  date: string;
  time: string; // HH:MM Singapore time, or "" when no time is set
  series_id: number | null;
  cancelled: boolean;
  note: string;
  unscheduled?: boolean; // listed because it has check-ins (or is the default weekday), not on the calendar
}

/** Commends are anonymous: the server never says who gave one, only whether it was you. */
export interface Commend {
  id: number; // opaque, so a screen can tell a new commend from one it has seen
  to_id: number;
  mine: boolean;
}

export type MilestoneStatus = "planned" | "in_progress" | "at_risk" | "done";

export interface Milestone {
  id: number;
  title: string;
  due_date: string; // YYYY-MM-DD
  owners: number[];
  status: MilestoneStatus;
  notes: string;
  created_by: number;
  updated_at: string;
}

export interface MilestoneHistory {
  id: number;
  milestone_id: number;
  title: string;
  member_id: number;
  action: "create" | "update" | "delete";
  changes: Record<string, { from: unknown; to: unknown }>;
  at: string;
}

export interface BadgeAward {
  id: number;
  member_id: number;
  badge_key: string; // a BADGES key, or "custom"
  label: string; // custom badges only
  icon: string; // custom badges only
  note: string;
  awarded_by: number;
  at: string;
}

export type NotificationKind = "poke" | "commend" | "badge" | "waiting" | "clear_requested" | "reminder" | "joined";

export interface Notification {
  id: number;
  member_id: number;
  kind: NotificationKind;
  actor_id: number | null;
  payload: Record<string, unknown>;
  at: string;
  read_at: string | null;
}

export type MeetingPhase = "lobby" | "round" | "deep_dives" | "wrap";

export interface MeetingState {
  phase: MeetingPhase;
  current: number | null; // member id presenting
  order: number[]; // presenting order set by dragging on the Boarding tab; people not listed go last
  started_at: number | null; // epoch ms when current presenter started
  closed: number[]; // members finished in the round
  deep_done: number[]; // members whose deep dive is finished
  timer_on: boolean;
  sound_on: boolean;
  present_min: number;
  qna_min: number;
  opened_at: number | null; // when the meeting started (drives the cabin-door animation on every screen)
  wrapped_at: number | null;
}

export interface Bottleneck {
  member_id: number; // the person others are waiting on
  waiting: { from_id: number; update_id: number; item_id: string; text: string; private: boolean; state: WaitingState }[];
}

/** A stretch of days someone is away (inclusive). Belongs to the person, so every project they're in sees it. */
export interface Away {
  id: number;
  member_id: number;
  from_date: string;
  to_date: string;
  note: string;
}

/** One note on a meeting's whiteboard. */
export interface MeetingNote {
  id: number;
  meeting_date: string;
  author_id: number;
  text: string;
  color: string; // NOTE_COLORS key
  x: number; // left edge, fraction of the board width
  y: number; // top edge, px
  updated_by: number | null;
  updated_at: string;
  editing_by: number | null; // someone typing in it right now (soft lock)
}

/** A meeting's notes, filed on the calendar once the meeting is over. */
export interface FlightLog {
  date: string;
  count: number;
  preview: string; // first line of the first note
}

export interface CalendarResponse {
  from: string;
  to: string;
  today: string;
  meetings: MeetingDate[];
  away: Away[];
  logs: FlightLog[];
  milestones: { id: number; title: string; due_date: string; status: MilestoneStatus }[];
}
