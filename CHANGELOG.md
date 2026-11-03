# Patch notes

The app shows the newest entries under "What's new" at the bottom of every page. Write each line for the team,
not for developers: what changed for them and where to find it. Add lines under "Unreleased" as you work;
`npm run release -- patch` (or `minor`, `major`) turns them into a numbered release. See docs/MAINTAINING.md.

## Unreleased

- Date pickers, time lists and the project menu open leftwards or upwards when there's no room, so you never scroll sideways to reach them. Long tooltips near the edge stay on screen too.
- Fixed: the presenter timer jumped two seconds at a time. It now counts down every second on your own screen.
- Other screens follow the meeting every 5 s instead of every 2 s, which keeps a 10-person meeting well inside the free plan.
- Fixed: in the garden, the paper plane flew behind the person it circles.
- "Welcome aboard" is centred on wide screens, and "Wheels up · see you next week" is now as quick as the welcome.
- New Calendar tab: meetings, milestone due dates, who's away, and each past meeting's notes on one month view. Tap a day for the details.
- Mark yourself away (a conference, leave, fieldwork) on the Calendar. You show as "Away" instead of "Not checked in", sit out the round, and get no check-in reminder. Every project you're in sees it.
- Each meeting now has a shared whiteboard under the Boarding tab, replacing the Apron. Anyone can add sticky notes and type at the same time; a note someone is typing in shows "… is typing" for everyone else.
- When a meeting is over, its whiteboard is filed on the Calendar as a 📒 flight log.
- Fixed: Remove, Cancel meeting, Leave project and "leave without saving" did nothing in some browsers. They now use the app's own dialog.
- Pilots pick from five badges or name their own (with an emoji). Badge names that read as rankings are refused.
- Date pickers, dropdowns, checkboxes and scrollbars now follow the project's theme in light and dark.
- Links jump to the exact place and briefly outline it: the whiteboard from the Calendar, a milestone from the header, your open requests from the number on your avatar.
- The number on your avatar only counts requests still waiting for your answer, and identical notifications are merged.
- The Boarding tab remembers whose card you had open.
- My check-in and My profile save automatically as you type. A check-in stays a draft (nobody is notified) until you press Submit, which now stays in reach at the bottom of the screen.
- Date and time fields have their own calendar and time list in the project's theme, and tooltips match the theme too.
- Light or dark is now saved on your account, so it follows you to every computer and phone, and someone else's choice on a shared computer doesn't change yours.
- Profile backgrounds are gone, so your name and avatar have the card to themselves. Uploaded photos are only shown to people who share a project with you.
- Trial week only: the bar at the bottom of every page lets you view the app as any teammate, including the professors. It goes away at launch.
- On the Boarding list and in meeting mode, the status now sits under each name, so names up to about 10 letters show in full.
- A screen nobody has touched for 10 minutes refreshes less often until you move the mouse or tap, which keeps the app free to run. It still notices when a meeting starts, and never slows down during one.
- The meeting calendar uses Outlook's words: create a meeting series, or add a single meeting.
- Admins can delete a removed member for good; only their past check-ins stay. Removed members now sit below everyone active.
- The last person to leave a project is warned, offered an export, and types the project's name to close it for good.
- Admins can no longer take away their own admin rights.
- Fixed: dragging someone down the presenting order stopped after one row.
- Fixed: notification links for requests and badges now land on the request or the badge itself.
- Fuel and the status line are gone from check-ins; flight conditions and your flairs cover how the week is going.
- Two new project themes, Lab Notebook (graph paper and ink blue) and Cozy Studio (warm paper and terracotta). Admins pick them on the Admin page.
- Messages at the bottom of the screen fade away instead of vanishing.
- The "reset" link next to shuffle on Boarding is gone. The order it went back to was simply who joined first.
- Fixed: leaving the Admin page while it was still loading switched the project's theme off until you reloaded.
- Fixed: the team list on the Admin page ran off the side of a phone screen.
- New: the garden. Press Visit the garden on My profile and the whole team wanders a little airfield as chibi versions of their avatars. Pick where the airfield is from the menu at the top right, out of ten places (a meadow, the Alps, a beach, Mount Fuji, the Colosseum, the Eiffel Tower, the Pyramids, Marina Bay, Sydney Harbour or New York); your browser remembers it and the garden button shows it. Every place has an evening version in dark mode. Click someone for a surprise (a snack, a toy, a gentle bonk, a hello or a paper plane), or double-click for their boarding pass. People away for the next meeting queue with their luggage by the control tower. People face the way they walk: you see their back as they walk away and a three-quarter turn as they cross. Now and then a small airliner rolls away up the runway and takes off (people step off the runway first), and ships cross the sea in the beach and harbour scenes. Hover over someone to see their name. Press Esc to go back.
- Your name on the check-in preview no longer runs off the edge on wide screens: it moves below your avatar and shrinks to fit, and long names shrink everywhere else too.
- Male sideburns now grow out of the hair instead of floating below it.
- A pilot cap now covers the whole head, so tall hairstyles no longer leave a bald patch above it, and rabbit and cat ears come out through the middle of the cap.
- Male and female avatars now look clearly different: eyes, brows, lips, jaw, neck and shoulders, plus male cuts of the bun and ponytail.
- The head covering hairstyle is gone; avatars that used it now show their default hair, and you can pick another on My profile.
- Commends now show as a count ("👏 3 commends") and stay anonymous, including the notification.
- The cabin doors close over the meeting while the plane leaves at the end, like they open at the start.

## 1.0.0 · 2026-10-26 · First boarding

- Projects: one app for every team. Start a project from the menu at the top left, pick its title, subtitle and one of three themes, and invite people with a code or link.
- Admins can rename the project, change its theme, make or remove other admins, and make a new invite code. Anyone can leave a project from the same menu.
- The presenting order on the Boarding tab can be dragged with the ☰ handle, shuffled, or reset. Every open screen follows the new order.
- Check-ins have clearer labels and field borders, and "Fun share" is now "In-flight extras".
- Meetings can be scheduled without a set time.
- Animal avatars now sit properly in their uniforms.
- My check-in asks before you leave with unsaved changes, including when you switch tabs.
- Cards fade in softly and flair chips arrive one after another. Both are skipped if your device asks for reduced motion.
