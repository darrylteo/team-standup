# Maintaining Standup

This is the runbook for the person looking after the app (Alex for now). It covers setting it up on Cloudflare,
making a change safely, telling people what changed, undoing a bad release and keeping the free plan healthy.
Commands run from the project folder.

## Setting up from scratch

The app runs as one Cloudflare Worker that serves the pages and the API, with a D1 (SQLite) database. The free plan
allows about 100k requests a day and never pauses an idle project, whereas Supabase's free tier pauses after a week
without activity. Cloudflare Access gives free email sign-in for up to 50 people, so the app stores no passwords.

### First deploy (about 20 minutes, done once)

1. Create a free Cloudflare account with a personal email (not a work address that could be closed) and turn on
   two-factor login. Open Workers & Pages once and pick the account's `workers.dev` subdomain; ours is `<your-subdomain>`. Then
   run `npx wrangler login`.
2. Run `npx wrangler d1 create pm-trial --location apac`, and copy the printed `database_id` into `wrangler.jsonc`.
   The first week ran on this trial database, with the demo data loaded by `node scripts/seed.mjs --remote --demo`
   (refused unless the database's name ends in `-trial`). Launch day moves to a fresh one (see "Starting over on a
   fresh database").
3. Check the 9 addresses and the first project's title in `scripts/members.json`. Seeding creates that project with
   those people and never emails anyone.
4. Run `npm run deploy`, then `npm run db:seed:remote`. Wrangler prints the URL: the Worker is called `pm`, so it is
   `https://pm.<subdomain>.workers.dev`.

At this point the API refuses everyone, because sign-in is not configured yet. The app fails closed.

### Turn on sign-in (Cloudflare Access)

1. On the Workers & Pages page, click Set up Zero Trust and choose the Free plan (up to 50 users). It asks for a card
   and billing address and charges $0; the card covers seats beyond 50, so keep the sign-in rule narrow (step 3).
2. Open Workers & Pages → pm → Access → Protect this Worker behind Access. Pick the scope All traffic, which also
   covers preview URLs.
3. Add a policy. The Worker's dialog offers only Email domain (`example.edu`) and a session of up to 7 days, which is
   what we use. Anyone with an SUTD email can then sign in, but they only see a project once an admin adds them or
   they join with the project's invite code. A newcomer with neither sees a page to join with a code or start a
   project. Each person who signs in takes one of the 50 free seats. To limit sign-in to named people instead, edit
   the application under Zero Trust → Access → Applications. Cloudflare only emails a code when someone types their
   own address on the sign-in page.
4. The Access tab's Application values show the AUD tag and a JWKS link of the form
   `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`. In `wrangler.jsonc`, set `ACCESS_AUD` to the tag and
   `ACCESS_TEAM_DOMAIN` to `<team>.cloudflareaccess.com` (ours is `<your-team>`). Run `npm run deploy` again.
   Signed-out visitors are now sent to the sign-in page.
5. The sign-in page first offers only "Sign in with Cloudflare", which needs a Cloudflare account. In Zero Trust →
   Integrations → Identity providers, add One-time PIN. Then in Zero Trust → Access controls → Applications → pm →
   Login methods, tick One-time PIN, untick Cloudflare, and turn on Instant Auth if offered, so people go straight to
   the email box.

People then open the link, type their email, and paste the 6-digit code they receive. The Worker checks the signed
Access token on every request. Each project's data is served only to that project's members.

### Backups into OneDrive

The sync script saves a dated JSON file into the team's Weekly Update Slides folder, with each figure of the week as
its own image in a `figures` subfolder, and OneDrive syncs it. Set this up on launch day, once the data is real.
Cloudflare moves its menus around; if a name below doesn't match, look for Service Tokens under Access controls.

1. In Zero Trust, find Service Tokens (under Access controls in the 2026 layout, earlier Access → Service Auth) and
   create a token called `standup-backup`. Copy its secret straight away; Cloudflare shows it only once.
2. In Zero Trust → Access controls → Applications → pm → Policies, add a second policy with Action Service Auth,
   including that token. Put the token's Client ID into `BACKUP_CLIENT_ID` in `wrangler.jsonc`, then redeploy. That
   token can only read `/api/export`.
3. Create `backup.config.json` (gitignored) next to `package.json`, copying the example at the top of
   `scripts/sync-onedrive.mjs`, and fill in the URL, the token ID and secret, and the folder.
4. Run `npm run backup` once to check it works. Then schedule it daily from PowerShell in this folder.
   `-StartWhenAvailable` runs a missed backup as soon as the laptop wakes, if it was asleep at 18:00:

```powershell
$a = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c cd /d `"$PWD`" && npm run backup"
$t = New-ScheduledTaskTrigger -Daily -At 18:00
Register-ScheduledTask -TaskName "Team Standup backup" -Action $a -Trigger $t -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
```

To restore, run `node scripts/restore.mjs <backup.json> --remote --yes`. This replaces everything in the production
database. Project admins can also download their own project from Admin → Export this project.

## What lives outside the code

The repository can rebuild the app, but these settings exist only in Cloudflare's dashboard. If the account is lost
they must be set up again by hand ("Setting up from scratch" above). Check this list whenever one changes.

| What | Where | Ours |
|---|---|---|
| Cloudflare account | dash.cloudflare.com | dteo96@gmail.com, two-factor login on |
| `workers.dev` subdomain | Workers & Pages → Account details → Subdomain | `<your-subdomain>`, so the app is https://pm.<your-subdomain>.workers.dev |
| Zero Trust plan | Zero Trust → Settings → Cloudflare One plan | Free, 50 seats, $0. A card is on file and is only charged for seats beyond 50 |
| Team domain | Zero Trust → Settings → Team domain | `<your-team>.cloudflareaccess.com` (also in `wrangler.jsonc`) |
| Who may sign in | Workers & Pages → pm → Access, or Zero Trust → Access controls → Applications → pm → Policies | Email domain `example.edu`, scope All traffic (covers preview URLs) |
| Session length | Same policy | 7 days, the longest the Worker's dialog offers; people enter a new code weekly |
| Login method | Zero Trust → Integrations → Identity providers, and the application's Login methods | One-time PIN only |
| Backup token | Zero Trust → Service Tokens (under Access controls) | `standup-backup` (from launch day); its secret is only in `backup.config.json` |
| Code | a private GitHub repository | Private. Cloudflare's GitHub auto-deploy is deliberately not connected, so `npm run deploy` (checks first) is the only way in |
| Wrangler login | Alex's Windows profile (`npx wrangler login`) | Full control of the account; don't share that Windows login |

**Seats.** Zero Trust → Team & Resources → Users lists everyone who has signed in. Remove seat frees one and signs
the person out; it never touches their account or data in the app, and they take a seat again if they sign in again.
To keep someone out for good, add an Exclude rule for their email to the policy, or switch the policy from Email
domain to a list of Emails. Glance at the list weekly: a seat is used only when someone actually signs in.

## Running it week to week

The menu at the top left lists every project you are in. From it anyone can start a project (title, subtitle and a
theme), join one with an invite code, or leave one. Each project's admins (Alex, Elena and Hugo for ASI Weekly
Meeting) use the Admin page to rename it, change its theme, share or renew its invite code, add or remove people,
make others admin, and set the meeting calendar. The calendar takes repeating rules such as every Tue and Thu from
2 Oct to 18 Jan, with or without a set time, plus one-off dates and cancellations. Each meeting date gets its own
check-ins, due the evening before. The page also shows how much of the free 500 MB database is used.

During the meeting, anyone presses Start meeting on the Board and every open screen switches to the live view. Notes
go on the shared whiteboard under the board; once the meeting is over they appear on the Calendar as that day's
flight log. People mark conferences and leave on the Calendar, so they show as away instead of missing.

## The release loop

1. Run `npm run dev` and make the change. Switch persona and project with the dev bar at the bottom of the page.
2. Add a line under `## Unreleased` in [CHANGELOG.md](../CHANGELOG.md) for anything the team will notice. Write it
   for them ("The presenting order can be shuffled"), never for developers ("refactor useDragOrder").
3. Run `npm run check` (typecheck plus unit and API tests) and `npm run e2e` (browser walkthroughs on their own
   server and fresh database, desktop and phone). Look at the change in the browser at desktop and phone widths, in
   light and dark.
4. Run `npm run release -- patch` for fixes, `minor` for new features, or `major` for changes people must relearn.
   It runs the checks again, numbers the release, dates it and updates `package.json`. It never commits or deploys.
5. Commit, tag and deploy with the commands it prints. `npm run deploy` runs the checks a third time, applies any new
   database migrations, then uploads the Worker.
6. Open the app and check the footer shows the new version. Everyone who used an older version sees "✨ What's new"
   at the bottom of the page until they open the notes, so no announcement email is needed.

A unit test (rule M1) fails if `package.json` and the newest release in CHANGELOG.md disagree, or if a release has
no notes.

## Changing the database

Migrations in `migrations/` run in order, once, on every database. After a migration has been deployed it must
never change (rule C2; the hook blocks edits to committed migrations). To change the schema:

1. Add the next numbered file, for example `migrations/0005_<what>.sql`.
2. Prefer additive changes such as `CREATE TABLE`, `ALTER TABLE … ADD COLUMN … DEFAULT …` and `CREATE INDEX`. Old
   code keeps working with a new column, so a deploy and its migration can't break each other.
3. SQLite cannot drop or retype a column in place. When you must, create the new table, copy the rows with
   `INSERT INTO … SELECT`, drop the old one and rename, inside the same migration file. Start the file with
   `PRAGMA defer_foreign_keys = true;`, as D1 checks foreign keys.
4. Run `npm run db:reset:local` to replay every migration from scratch, then `npm test`. The API tests also build
   their database from the migrations, so a broken migration fails the tests.
5. Add the new table to `EXPORT_TABLES` in `src/worker/index.ts` and to the restore order in
   `scripts/restore.mjs`, so backups keep covering everything.

## Undoing a bad release

| What went wrong | What to do |
|---|---|
| The code is broken but the data is fine | `npx wrangler deployments list`, then `npx wrangler rollback <version-id>`. This takes seconds and leaves the database alone. |
| A migration damaged data | D1 Time Travel keeps about 7 days of history on the free plan (30 on paid); I could not confirm the current limit, so check the D1 docs. Run `npx wrangler d1 time-travel info DB` to find a bookmark from before the deploy, then `npx wrangler d1 time-travel restore DB --bookmark=<id>`. Roll the code back too. |
| Rolling back across a database change | A version only works with the database it was built for. Never roll back to a version from before launch day (it points at `pm-trial`) or before migration 0004 (it reads the dropped `banner_images` table). Fix forward with a new deploy instead. |
| Something older or bigger | Restore last night's OneDrive backup with `node scripts/restore.mjs <file.json> --remote --yes`. It replaces everything, so warn people first. |

## Starting over on a fresh database

Used once on launch day, to drop the trial week's data, and available later if a clean start is ever needed. The
link and sign-in stay the same. Everything in the old database goes, including avatars and profiles, so tell people
first and take a backup (`npm run backup`, or Admin → Export this project).

1. Run `npx wrangler d1 create pm --location apac` (or another new name).
2. In `wrangler.jsonc`, put the new name in `database_name` and the printed id in `database_id`, and set
   `TRIAL_SWITCHER` to `""` so nobody can act as someone else any more (a unit test, rule S7, refuses the deploy
   until you do). Scripts use the binding `DB`, so nothing else changes.
3. Run `npm run deploy` (it builds the new database's tables), then `npm run db:seed:remote`.
4. Open the app, check the project and its people are there, then commit `wrangler.jsonc`.
5. A week later, once nothing is missing, delete the old one with `npx wrangler d1 delete pm-trial`. Until then a
   `wrangler rollback` would point the app back at the old database, so roll back only during that week if needed.
6. Run `npm run db:reset:local`, because the local database is keyed by the database id.

Practise a restore into the local database every term (`--local` instead of `--remote`), so the backup is known to
work before it is needed.

## Launch day checklist

Planned for 8 Nov 2026 (moved from 1 Nov so the overseas team can explore the trial first), once the professors agree and the researchers' trial feedback is in.

1. Ship any fixes from the feedback through the release loop. Then run `npm run release -- minor` (1.1.0), commit and
   tag.
2. Tell the team the trial data goes: check-ins, whiteboards, avatars and photos. Anyone who wants their avatar back
   can note its settings first.
3. Check the addresses and admins in `scripts/members.json`.
4. Follow "Starting over on a fresh database" above, which also turns `TRIAL_SWITCHER` off (rule S7 refuses the
   deploy until it is). Seed with `npm run db:seed:remote` only; demo data is refused outside a trial database.
5. In a private window, sign in yourself. Check the 9 people and 3 admins are there, the board is empty, and there is
   no "Trial week · viewing as" bar.
6. Decide whether to keep the Email domain rule or switch to named Emails (see Seats above).
7. Set up the OneDrive backups ("Backups into OneDrive" above) and check the first file arrives.
8. Send the team the link and how to sign in: open https://pm.<your-subdomain>.workers.dev, type your SUTD email, paste the
   6-digit code (check Junk if it doesn't arrive), and expect a new code once a week.
9. A week later, once nothing is missing, run `npx wrangler d1 delete pm-trial`.

## Keeping it healthy

| How often | Task |
|---|---|
| Weekly | Glance at the Admin page storage bar. The free plan has 500 MB for all projects together; figures use about 3 MB a week per project. |
| Weekly | Check that the OneDrive folder has a new `standup-backup-<date>.json`. If not, run `npm run backup` and read its message. |
| Monthly | Run `npm outdated`. Update with `npm update`, then run the release loop as a patch. Read the release notes before a major version bump of React, Hono, Vite or Wrangler. |
| When someone reports a bug | Run `npx wrangler tail` while they repeat it to see server errors live, or open Workers → pm → Logs in the Cloudflare dashboard. |
| Each term | Clean up projects nobody uses. Projects are never deleted automatically. |
| If the request count worries you | The free plan allows 100k API requests a day and stops serving the API once they are used, until 08:00 Singapore time; the Cloudflare dashboard shows the daily count (page files don't count). Polls only run while the tab is visible. During a live meeting an open Boarding tab asks for the meeting state every 5 s, the whiteboard every 5 s (2.5 s while you type in a note) and the check-ins every 10 s, about 2,200 requests an hour, so 10 people in a 2-hour meeting use about 44k. Outside a meeting the state is checked every 10 s, the whiteboard every 10 s and check-ins every 20 s, about 1,300 an hour per tab. After 10 minutes with no mouse, touch or key input a tab stops polling except for a once-a-minute check for the meeting starting (about 60 an hour); polling never pauses during a live meeting (`src/client/api.ts`). The presenter timer counts down on each screen's own clock, so slower polling only delays who is shown as presenting. |

## Where things live

| To change | Edit |
|---|---|
| Colours or a theme | `src/client/styles/tokens.css`. Every colour needs light and dark values (rule C3). Themes are the `[data-palette]` blocks, listed in `THEMES` in `src/shared/catalog.ts`. |
| Badges, weather, avatar parts | `src/shared/catalog.ts`; the avatar drawing itself is `src/client/avatar/render.js`. Badges stay light-hearted skills, never rankings (rule F1). |
| Check-in fields | `UpdateBody` in `src/shared/types.ts`, `cleanUpdateBody` in `src/shared/validate.ts`, the form in `src/client/pages/CheckIn.tsx` and the card in `src/client/components/UpdateCard.tsx`. Check-ins are stored as JSON, so a new optional field needs no migration. |
| Who can do what | Project routes live under `/api/p/:pid` and only reach members of that project (`src/worker/index.ts`). Admin-only routes call `requireAdmin`. |

## Continuous checks

`.github/workflows/check.yml` runs the typecheck and tests on every push once the code is on GitHub. Keep the
repository private, because `scripts/members.json` lists the team's email addresses.

## Public repo and demo

The public copy lives in a separate repository with its own history, so the team's names and emails never reach it.
`node scripts/export-public.mjs ../PM-public` writes it: every tracked file, with the fictional team and demo data from
`scripts/public/` swapped in and real names, emails and account ids replaced. It stops with an error if any survive.
Commit and push from `../PM-public` afterwards.

The demo at https://team-standup-demo.<your-subdomain>.workers.dev is a static build (`npm run demo:build`) whose API runs inside the
page: `src/demo/boot.ts` loads the migrations and seed into SQLite compiled to WebAssembly and sends `/api` requests
to the Worker's own handler. It shows one meeting, on Thu 29 Oct 2026, and `src/demo/clock.ts` holds the page's clock
on that day so nothing drifts. Each tab keeps its copy in sessionStorage, so nothing is shared and nothing is stored
by Cloudflare. `wrangler.demo.jsonc` uploads it as static assets with no Worker script, and static requests are free
and unlimited, so the demo does not use the Workers request quota.
Deploy it from the public copy with `npm run demo:deploy` after an export, so it always shows the fictional team.
