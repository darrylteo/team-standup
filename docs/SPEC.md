# Team Standup — Spec

Working name: **Standup**. Status: 1.0.0 on a trial database since 2026-10-26; launch on a fresh database is planned
for 8 Nov 2026. This file records the decisions in force. Superseded ones live in git history.

## Problem

The Harbour Lab weekly meeting is booked for 1 hour and sometimes runs to 3. Updates travel as 1-slide pptx files that
rarely get used; people share screens and scroll through Word docs and code. The slides never record who someone
is waiting on or long-range deadlines (final report, INFORMS), which live only as verbal reminders. One person's
deep dive (e.g. a 17-slide results deck) can consume the hour, so later presenters get a tired room.

## Target audience and user profile

| Who | Count | Needs |
|---|---|---|
| Researchers (Alex, Priya, Casey, Ravi, Mei, Omar, Leo) | 7 | Post an update in under 5 minutes; see who they block and who blocks them; present from their own laptop. |
| Professors (Elena, Hugo) | 2 | Skim everyone before the meeting; see bottlenecks and deadlines at a glance; award fun badges. |
| Meeting host (Alex or anyone) | 1 screen | Run the round: avatars on screen, open a card, soft timer, close the card when done. |

All are technical (optimisation, ML, simulation). They value low friction over features. Professors must
remain present until the end, so the app never suggests that anyone leave.

## Decisions

### Meeting

| Topic | Decision |
|---|---|
| Format | Async-first. Check-ins are due the evening before. A round of about 5 min presenting + 5 min Q&A per person, then deep dives. |
| Board | One Board tab for the list and the meeting. Start meeting switches every open screen to the live view. The cabin door opens at the start, 👏 floats on commends and a plane takes off at wrap-up; all are skipped with reduced motion. |
| Timer | A soft ring around the presenter's avatar, counted on each screen's own clock. Toggleable; sound off by default. |
| Presenting order | Dragged with a ☰ handle (or arrow keys) on the Boarding tab, or shuffled. It is stored in the meeting state so every screen follows. |
| Deep dives | Ticked on the card with a topic, a length (5–45 min, which the timer uses) and who should stay. They run after the round. There is no in-app "leave" action. |
| Whiteboard | Each meeting has a shared whiteboard below the board. Notes are separate records so several people type at once; whoever is typing holds a 20-second soft lock that others see as "… is typing". Anyone edits; only the author or an admin removes a note with text. |
| Flight log | Once a meeting has wrapped or its day has passed, its notes appear on the Calendar as a luggage-tag flight log. |

### Check-ins

| Topic | Decision |
|---|---|
| Fields | Flight conditions (weather), done, issues, waiting on, next, In-flight extras, a files note, a figure and a deep-dive request. Last week's "next" items are offered as suggestions. |
| Saving | My check-in and My profile autosave. A check-in is a draft until Submit, and requests on it notify people only once it's submitted. |
| Holding pattern | Each waiting item shows both names and is Team or Private (private items reach only the two people, rule S4). The person asked marks it cleared and only the person waiting confirms. "Waiting on you" shows on My profile, at the top of My check-in and as a count on the avatar. |
| Figure of the week | One image and caption per person per meeting, resized in the browser to ≤1600 px. |
| Files | Cards hold notes pointing to team OneDrive files. The only uploads are an avatar photo (≤1 MB) and the figure, checked by magic bytes and stored in D1 (rule S3). |
| Away | People mark away stretches (first and last day, optional reason) on the Calendar. Away belongs to the person, so every project they're in sees it. On those days they show as Away, sit out the round unless they checked in, and get no reminder. |
| Calendar | Month view of meetings, milestone due dates, away stretches and flight logs, with day details at the side (stacked on phones). |
| Milestones | Anyone can add or edit; every change is logged (who, when, diff). Countdowns sit in the header. |

### People and projects

| Topic | Decision |
|---|---|
| Identity | One profile per email address, shared across projects: name, @handle, photo or drawn avatar, up to 3 coloured flairs. Light or dark is saved on the account. |
| Avatars | Our own drawing in a pastel, sports-game style: male and female (differing in eyes, brows, lips, jaw, neck and shoulders), aviation uniforms, 2 dogs, 2 cats, a cow and a rabbit (animals have no neck). Pilots start in a captain's uniform and crew in cabin crew. Photos and GIFs sit in a rounded-square frame and are shown only to people who share a project. |
| Roles | Professors are Pilots and researchers are Crew, per project (a flair, not a forced picture). Admin is a separate flag. Badges are the only role difference. |
| Projects | One app hosts many projects. Each has a title, subtitle, theme, invite code, members, admins and its own calendar, check-ins, milestones, badges and notifications. Harbour Lab Weekly / Team Standup is project 1. |
| Joining | Anyone with an SUTD email can sign in. They see a project after an admin adds them or they join with its 8-character code or `/join/<code>` link. A newcomer with no project sees join or create. |
| Admins | The creator is admin. Admins make or remove other admins (never the last one, and never themselves), rename, re-theme and renew the code. Anyone can leave; the only admin hands over first. Removed members sit below active ones and can be deleted for good, keeping only their check-ins. |
| Closing | The last person leaving is warned, offered an export and types the name. The project then closes for good (closed_at set, invite code retired). |
| Schedule | Admin calendar in Outlook wording: meeting series (starts, ends by, repeat every) and single meetings, with optional times and cancellations. |

### Fun

| Topic | Decision |
|---|---|
| Pokes and commends | Pokes are unlimited. Commends are one per teammate per calendar week and anonymous: the API sends a count per person and whether you gave one, never the giver. |
| Badges | Pilots award them from five presets or a custom name and emoji. Ranking words are refused (rule F1). |
| Garden | A full-screen overlay from My profile, loaded only when opened, with no server state. It is 2.5D (perspective, depth scaling, shadows) with chibi figures: the avatar's head on a small body per outfit. Figures face their direction of travel (front, three-quarter or back). Five click actions (snack, toy, bonk, hello, paper plane), double-click shows the boarding pass and Esc goes back. |
| Garden motion | Everything eased and slow: idle moments, neighbour chats at most every 10–20 s, people who are away queueing with luggage by the tower. Butterflies by day, fireflies at night and a plane departing every minute or so. Still in reduced motion. |
| Garden scenes | Ten places chosen from a menu in the garden's top bar, remembered per browser. The meadow is the default. Landmarks are flat drawings on the horizon with evening colours in dark mode. |

### Platform

| Topic | Decision |
|---|---|
| Hosting | Cloudflare Workers (static assets + API) and D1. Free, and never pauses. |
| Auth | Cloudflare Access (free for ≤50 users) with an email one-time PIN for any @example.edu address. The Worker verifies the Access JWT; project membership decides what each person sees (rule S6). Self-registration with passwords was rejected on 2026-10-26, as it needs an email domain, password storage and a reset flow. |
| Time zone | Fixed Singapore time (UTC+8) for every project, worked out on the server. A per-project zone waits until a project meets elsewhere. |
| Themes | Night Terminal (default), Sky Lounge, Runway, Lab Notebook and Cozy Studio. Themes are tokens only over the same components, stored in projects.palette (migration 0003). |
| Controls | Our own date picker, time list, tooltips and dialogs drawn from theme tokens. No native confirm/prompt/alert (rule U2), which some browsers suppress silently. |
| Notifications | In-app panel only. Email is deferred (it needs a domain or Brevo). |
| Backup | `GET /api/export` returns full JSON, and `scripts/sync-onedrive.mjs` writes it daily into the OneDrive "Weekly Update Slides" folder. Admins can also export their own project. Every week is kept and browsable. |
| Releases | CHANGELOG.md is the single source of patch notes and the app version; `npm run release` numbers releases and the footer shows "What's new". Runbook: docs/MAINTAINING.md. |
| Test data | Browser tests run on their own server (port 5174) and database (.wrangler/e2e), reset every run. |

## Data model (D1)

`away` (per person) · `meeting_notes` (per project and meeting) · `projects` · `memberships` (role, admin, active,
order per project) · `members` (people, shared profile) · `updates` (one per member per meeting date) · `milestones`
+ `milestone_history` · `pokes` · `commends` · `badges` (awarded) · `notifications` · `meeting_state` ·
`avatar_images` · `figures` · `meeting_dates` + `schedule_series` · `admin_log`.

## Tickets

Each ticket: goal → success → failure → evals.

- **T1 Scaffold.** Vite+React+TS client, Hono Worker, D1, one `npm run dev`. ✔ dev server serves UI and `/api/health`. ✘ two servers or manual DB setup. Eval: integration test hits `/api/health`.
- **T2 Auth.** Resolve the caller from the Access JWT (prod) or `DEV_USER` (dev). ✔ unknown email → 403; spoofed header without valid JWT → 401. ✘ any write possible without identity. Eval: unit tests on `auth.ts`.
- **T3 Weekly update.** Create or edit your own card for a meeting date; last week's "next week" items are offered as suggestions. ✔ others' cards are read-only; carry-over works. ✘ editing someone else's card. Eval: integration tests.
- **T4 Board.** All cards for a week, colour-coded, with missing submissions shown. ✔ 9 avatars, missing ones flagged. Eval: e2e.
- **T5 Meeting mode.** Avatar stage, open a card, soft timer, close → the card leaves the stage, deep dives afterwards, whiteboard. State is shared via the server so other laptops follow along. ✔ refreshing keeps state. Eval: e2e.
- **T6 Waiting-on map.** Per person: how many people are blocked on them, and on what. ✔ counts match the cards. Eval: unit test on aggregation.
- **T7 Milestones.** CRUD with owners, due date, status and history. Countdown chips in the header. ✔ every edit appears in history. Eval: integration.
- **T8 Social.** Unlimited pokes, commends (one per teammate per week), notification panel, badges (professors only). ✔ a second commend in a week → 409; a researcher awarding a badge → 403. Eval: integration + e2e.
- **T9 Avatars and profile.** Build a drawn avatar or upload a photo/GIF (cropped square client-side; GIFs ≤1 MB keep animation). ✔ SVG/HTML disguised as an image → 415. Eval: integration + e2e.
- **T10 Backup.** Export JSON and the sync script. ✔ the file appears in the OneDrive folder with a dated name; restoring via `scripts/restore.mjs` round-trips. Eval: integration.
- **T11 Deploy.** `npm run deploy` plus the Access steps in docs/MAINTAINING.md. Alex performs the account steps.
- **T12 Projects.** Create, join by code, switch, leave, admin hand-over, per-project theme. ✔ a non-member gets 403 on every project route; the last admin can't leave or be demoted. ✘ any data crossing projects. Eval: integration + e2e.
- **T13 Releases.** CHANGELOG-driven versions, What's new, release script, runbook. ✔ package.json matches the latest release (M1). Eval: unit.
- **T14 Calendar, away and whiteboard.** ✔ away people aren't counted missing; a note being typed in can't be overwritten (409); notes and away dates never cross projects. Eval: integration + e2e.

## Backlog from market research (2026-10-26)

Compared against monday.com, Asana, Linear, Jira, ClickUp, Notion, Trello and the async check-in tools Geekbot,
Standuply, Range, Status Hero, DailyBot, Fellow and 15Five, from vendor pages and help centres. Range is the closest
match (check-ins with mood and flags that feed the agenda, a presenter spinner, action items). It has no named
blockers with private items, no figure of the week, no deep-dive queue and no shared live stage. Standalone standup
tools have been fragile (Friday.app closed in 2022), which argues for owning this one. None of the candidates below is
adopted until Alex picks.

| # | Candidate | Seen in | Size | Constraint |
|---|---|---|---|---|
| 1 | Action items and decisions captured in the meeting, with owner and due date; open ones open the next meeting | Range, Fellow, Notion | M | Fine |
| 2 | Tick off last week's plan: each carried "next" item becomes done, rolled over or dropped | Range, 15Five, Status Hero | S | Per card, never a team completion rate (F1) |
| 3 | "Since last meeting" brief for professors: new and cleared blockers, milestones due in 14 days, deep dives, who is away | Fellow, Geekbot | S | In-app only |
| 4 | Milestone health note with a "stale" marker after N untouched weeks | Linear, Asana | S | Fine |
| 5 | Replies on a check-in item before the meeting | Geekbot, Range | M | Tie replies to items so it doesn't become chat |
| 6 | Calendar feed (.ics) plus one in-app nudge the day before check-ins are due | Linear, Range | S | One gentle nudge only (F3) |
| 7 | Per-project check-in template (rename or hide fields), optional rotating question | Geekbot, Range | M | Cap the fields to keep the 5-minute rule |

Rejected: Gantt charts and dependencies (milestones cover nine people), time tracking (reads as surveillance), OKRs
(a second routine), GitHub/Jira import (the work lives in Overleaf and OneDrive), Slack or Teams bots (double the
maintenance), video updates (breaks S3), AI summaries (unpublished results would leave the team), mood dashboards and
participation reports (monitoring and rankings, F1), sprint rituals, auto-advancing topic countdowns (F3), meeting
ratings and email digests.

## Evaluation (graded, target ≥95%)

Unit + integration (Vitest in the Workers runtime) + e2e (Playwright). Persona walkthroughs (researcher posting
at 11pm on a phone; professor skimming; host running a meeting). Design judged on quality, originality, craft and
functionality, as set out in prompts.txt.
