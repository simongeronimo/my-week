# my-week v1 design

- Date: 2026-11-18
- Status: draft for review
- Target: milestone 1 in use on Sunday 22 November 2026
- Mockups: https://claude.ai/artifact/38HYXUpAydck7RRTMhP8eZ (private link, direction A is the top row)

`my-week` is the working name. Candidates are listed under "Open items".

## The idea

Every Sunday evening you open a tray of blocks. It holds everything you need to do next week, and each block has a length. Next to it is the week as a time grid. You drag blocks from the tray onto the week until the tray is empty or the week is full. During the week you move blocks around based on what you got done, and you tick tasks off when you finish them.

The app borrows from the bullet journal method. Everything is an entry. A signifier in front of an entry tells you what kind it is. Carrying an unfinished task forward is a deliberate act, and the entry keeps count of how often it happened.

It has three users:

- You, in a desktop browser on Linux, for the Sunday session.
- You, on an iPhone, to see now and next, add tasks to the inbox, tick tasks, and make small moves.
- The "planner" agent (Claude Code in another container), to read the week and add tasks to the inbox.

## Constraints

- The app runs on a TrueNAS home server as a Docker app managed by Dockge. Nginx Proxy Manager sits in front of it at its own subdomain. Only Tailscale can reach it.
- It ships as one Docker image with version tags, listens on one port inside the container, and keeps all data in one folder.
- It has one user and one time zone, set with the `TZ` environment variable.
- AI writes most of the code and a junior developer directs it. Every choice favors code that is easy to read and few moving parts.

## Key decisions

| Decision | Choice | Reason |
|---|---|---|
| Stack | TypeScript everywhere. A React frontend with FullCalendar, and a Hono server on Node. | FullCalendar already handles dragging on a time grid, including dragging in from a side list. One language runs end to end. |
| Database | SQLite through Node's built-in `node:sqlite`, one file in `/data` | No database server and no native module to compile. A backup is a snapshot of one folder. |
| Data shape | One `entries` table with a `kind` column, plus `routines` and `filled_weeks` | A placed task and an event have the same fields. Two tables would double every query and every action. |
| Validation | SQLite `STRICT` tables and `CHECK` constraints, plus an allowlist of writable columns | The database rejects bad input, so no validation library is needed. |
| Phone widget | A subscribed .ics feed in iPhone Calendar | You get the native Up Next widget, the lock screen, and the Apple Watch for about 25 lines of code. |
| Agent access | The same JSON API with its own token, limited to reading and adding inbox tasks | The server enforces the limits, so they don't depend on the agent obeying. |
| MCP | Not in v1 | One agent can call the API from its shell. See "Agent". |
| Look | Direction A, "Dot grid" | It puts bullet journal signifiers on screen, and the signifiers show the data model. |
| Rust | No | Speed doesn't matter for one user, and you need to be able to read the code. A Rust rewrite of the server is on the later list as a learning project. |

## Scope

### Milestone 1: desktop planning, ready by Sunday 22 November

1. An inbox panel with a quick-add form. You type a title and pick a duration chip: 15m, 30m, 45m, 1h, 1h 30m, or 2h.
2. An "Overdue" section above the inbox that lists open tasks whose time has passed.
3. A Monday to Sunday week grid in 15-minute steps. You drag from the inbox or Overdue onto the grid, move blocks, and resize them.
4. Clicking a block offers Tick, Back to inbox, and Delete, plus editing the title and description. (Strike was taken out of the app on 20 November. It hid a task everywhere with no way back. The API still accepts `cancelled`.)
5. You create an event by dragging across an empty slot and typing a title. A double click on an empty slot opens a dialog that adds a task there.
6. Routine copies appear on every week. You create the routines once with curl (see "Routines in milestone 1").
7. Buttons for previous week, next week, and today. On Sundays the planner opens on next week.
8. A token screen that asks for `APP_TOKEN` once per browser.
9. A Docker image built on the server and running behind Nginx Proxy Manager.

### Milestone 2: phone, widget, and agent, during the week of 23 November

1. A phone today page at `/today` showing now, next, and later today. It lets you tick a task, send it back to the inbox, move it with the phone's own date and time picker, and quick-add a task.
2. Phone inbox and overdue lists at `/inbox`.
3. A routines page at `/routines` with a list and a form. Editing a routine deletes it and creates it again.
4. The calendar feed at `/calendar.ics`.
5. The agent token and the agent guide at `/api/guide`.

### Added on 20 and 21 November

1. Letting go of a block while still moving it fast throws it away. It flies off, an undo bar shows for 5 seconds, and the entry is kept as cancelled so undo can bring it back.
2. Ctrl+Z or Cmd+Z undoes grid changes one at a time (moves, resizes, throws, adds, ticks, and edits from the dialog) until the page reloads. There is no redo.
3. Dark mode follows the device's light or dark setting.
4. Tasks have a description, stored in the `notes` column. Every add-task form has an Add description button, the block dialog edits it, lists show its first line, and grid blocks show it when they are tall enough. The calendar feed leaves it out.
5. A task's signifier is a small box on grid blocks and a 24px box in phone lists. Tapping the box ticks the task, and tapping it again unticks it. Tapping the rest of a block opens the dialog.
6. The Unfinished list is called Overdue on screen.
7. The phone today page was redesigned. See its section below.

### Added on 21 November, second round

All six ship together as 0.7.0.

1. **Short blocks no longer overlap.** FullCalendar never draws a block shorter than `eventMinHeight` (15px), and it uses that drawn height to decide which blocks clash. On the desktop a 15-minute block was 12px, so it clashed with the block right after it, and FullCalendar pushed that one onto the right half. The desktop's 30-minute rows grow from 24px to 32px, so a 15-minute block is 16px. The dot grid follows the new row height.
2. **Times are easier to read on the grid.** A faint line marks every full hour across all days. Blocks too short for their time line show the start time before the title, like "2:15 Read". While you drag or resize a block, a small dark tag on it shows the day and the exact start and end, like "Thu 2:15 – 3:00 pm", and it updates as you move.
3. **Any length.** Next to the length chips, a small box takes a typed length: "75", "45m", "1h", "1h 15m" or "1:15". Lengths run from 5 minutes to 24 hours, like the database allows. Every add-task form gets it, and the entry dialog gets the same chips and box, so you can change the length of an inbox task, or of any entry on the phone, where blocks can't be resized.
4. **Habits.** A habit is a routine with no time: something to do on certain days at whatever time suits you. See "Habits" below.
5. **Descriptions are Markdown.** Opening an entry shows its description formatted, with bold, italics, lists, links and headings, and an Edit button that turns it back into the text box. Checklist lines like `- [ ] milk` become boxes you can tick right there, and ticking saves at once and can be undone. Raw HTML in a description is never rendered, because the agent can write descriptions too. Lists, phone rows and grid blocks keep showing plain text, with the Markdown symbols taken out.
6. **Pushing the blocks behind.** On the desktop week grid and the phone day page, pressing a block and holding it still for 1 second before moving switches the drag to push mode, and the block and the blocks it will push get marked. On the phone this is the same press that starts a drag after 0.4 seconds, held a little longer. When you let go, the blocks that followed the moved block back to back on its old day move by the same amount. Back to back means each one starts exactly when the one before it ends, and the first gap ends the chain. One Ctrl+Z, or the undo bar, puts them all back. Resizing never pushes.

#### Habits

- **Setting one up.** The routines page form gets an "Any time" choice next to the time field. A routine with no time is a habit, and it is always a task. Habits also get a "Carry over" switch. The list shows them as "Every day, any time, 1h", with "carries over" when it is on.
- **Copies.** For each day a habit applies, the server creates a real task with no start time, as rule 1 does for routines: on a week's first read, and for already filled weeks when the habit is created, from today onward. The copy remembers its day in a new `day` column. Placing a copy, ticking it, throwing it away and undoing all work as for any task.
- **Which ones show.** A copy shows while it is open and unplaced, on its own day. With carry over on, it also shows on later days of the same week, so a missed hour of gaming waits until Sunday night. Without it, the copy is gone after its day. Copies of a deleted habit stop showing.
- **Inbox.** The desktop panel, the phone day page's panel and the phone inbox get a Habits section between Overdue and Inbox. It lists today's copies and carried copies, oldest first. You drag them onto the grid like inbox tasks. The phone today page's inbox count includes them.
- **Double-click.** The new task dialog that a double-click or double tap opens lists the habits for that day as one-click choices above the form, plus the carried ones when the day is today. Choosing one places that copy at the clicked time.
- **Placed habits** look like routine tasks: a dashed outline. If the time passes without a tick, they go to Overdue like any task.
- **Data.** `routines.at` becomes optional, with a check that only tasks may leave it empty, and `routines` gets `carry INTEGER NOT NULL DEFAULT 0`. `entries` gets `day TEXT`, set only on habit copies. SQLite can't change `at` in place, so migration `002` rebuilds `routines`. Foreign keys must be off during the rebuild, because dropping the old table with them on would clear `routine_id` on every routine copy.
- **Rules.** Rule 1 creates habit copies with `start` empty and `day` set. Rule 3 also deletes a habit's unplaced copies. The inbox query skips copies with a `day`. `GET /api/week` returns a new `habits` list: open, unplaced habit copies dated from this week's Monday up to the end of the shown week, or up to today if the shown week is in the past. It leaves out copies dated before today unless their habit carries over. The inbox section shows the ones dated today or earlier, and the double-click dialog picks by day. `POST /api/routines` accepts `at: null` and `carry`. The agent guide explains habits.

### Later list (left out on purpose)

- All-day events, yearly repeats, and events that span several days
- Importing other calendars
- The agent placing blocks or proposing a whole week's arrangement
- An MCP server at `/mcp`
- Inbox tasks that come back every week, like meal prep
- Groups (bullet journal collections), deadlines, priorities, and notes as their own entries
- A future log (entries with a date but no time) and a month view
- Ticking habits with streaks and stats
- Using the phone offline
- Calendar alerts in the feed
- A Scriptable widget, if the calendar widget feels cluttered
- Detecting conflicting edits from two devices
- Choosing colours: one per routine, or one per project for tasks (projects would be new)
- A health check endpoint
- Rewriting the server in Rust

## Concepts

| Term | Meaning | Bullet journal |
|---|---|---|
| Entry | Anything in the inbox or on the grid | a bullet |
| Kind | `task` or `event`. A task has a checkbox, can go overdue, and can go back to the inbox. An event does none of these. | • and ○ |
| Status | `open`, `done`, or `cancelled` | •, ×, struck out |
| Inbox | Open tasks with no start | |
| Overdue | Open tasks whose end has passed. The API calls the list `unfinished`. | |
| Migration | Moving a task whose time has passed. The block shows the count, like `>2`. | > |
| Routine | A pattern (kind, title, days, time, duration) that the server copies into each week | |
| Routine copy | An ordinary entry created from a routine, with `routine_id` set | |
| Filled week | A week whose routine copies exist, recorded in `filled_weeks` | |

## Data model

### Schema (`migrations/001_init.sql`)

```sql
CREATE TABLE routines (
  id        INTEGER PRIMARY KEY,
  kind      TEXT NOT NULL CHECK (kind IN ('task', 'event')),
  title     TEXT NOT NULL CHECK (title <> ''),
  days      TEXT NOT NULL CHECK (days GLOB '[M.][T.][W.][T.][F.][S.][S.]' AND days <> '.......'),
  at        TEXT NOT NULL CHECK (at GLOB '[0-9][0-9]:[0-9][0-9]' AND time(at) IS NOT NULL AND at < '24:00'),
  duration  INTEGER NOT NULL CHECK (duration BETWEEN 5 AND 1440)
) STRICT;

CREATE TABLE entries (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('task', 'event')),
  title       TEXT NOT NULL CHECK (title <> ''),
  notes       TEXT,
  start       TEXT CHECK (start IS NULL OR (start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]' AND datetime(start) IS NOT NULL AND date(start) = substr(start, 1, 10) AND substr(start, 12) < '24:00')),
  duration    INTEGER NOT NULL CHECK (duration BETWEEN 5 AND 1440),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  migrations  INTEGER NOT NULL DEFAULT 0,
  routine_id  INTEGER REFERENCES routines(id) ON DELETE SET NULL,
  created_by  TEXT NOT NULL DEFAULT 'me' CHECK (created_by IN ('me', 'agent')),
  CHECK (kind = 'task' OR start IS NOT NULL),  -- an event always has a time
  CHECK (kind = 'task' OR status <> 'done')    -- events are never ticked
) STRICT;

CREATE TABLE filled_weeks (
  monday TEXT PRIMARY KEY  -- '2026-11-23'
) STRICT;
```

Notes:

- Times are wall-clock strings in the `TZ` time zone, like `2026-11-23T09:00`. The format is fixed, so plain string comparison sorts them correctly, and `start >= '2026-11-23' AND start < '2026-11-30'` selects one week.
- `days` is a seven-letter pattern from Monday to Sunday with a dot for days off. `MTWTF..` means weekdays, `MTWTFSS` means every day, and `..W....` means Wednesdays.
- The end time is never stored. It is always `start` plus `duration`.
- SQLite turns foreign keys off by default. When the server opens the database it runs `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`.
- The database keeps its schema version in `PRAGMA user_version`. On startup the server runs every `migrations/NNN_*.sql` file numbered above that version inside one transaction, then sets the new version. If a step fails, the transaction rolls back, and the server logs the error and exits.

### Queries

```sql
-- Inbox
SELECT * FROM entries
WHERE kind = 'task' AND status = 'open' AND start IS NULL
ORDER BY id;

-- Unfinished. :now is the current local time, like '2026-11-25T14:10'.
SELECT * FROM entries
WHERE kind = 'task' AND status = 'open' AND start IS NOT NULL
  AND strftime('%Y-%m-%dT%H:%M', start, '+' || duration || ' minutes') <= :now
ORDER BY start;

-- One week. Cancelled entries stay in the database but leave the grid and the feed.
SELECT * FROM entries
WHERE start >= :monday AND start < :next_monday AND status <> 'cancelled'
ORDER BY start;
```

### Rules

1. **Filling a week.** Any request that reads week W (the week view, the feed, the agent) checks `filled_weeks` first. If W is missing, one transaction inserts a copy of every routine on each matching day of W from now onward, then inserts W into `filled_weeks`. Past days get no copies, so browsing an old week never fills Overdue with routine tasks. A copy you delete later stays deleted, because W is already marked as filled. The code has a `ponytail:` comment saying that a GET request writes to the database here.
2. **Creating a routine.** The server inserts the routine, then adds its copies to every filled week, but only for days from now onward.
3. **Deleting a routine.** The server deletes the routine's open copies that start after now. Past copies stay, and `ON DELETE SET NULL` clears their `routine_id`.
4. **Editing a routine.** Editing means deleting the routine and creating it again, so it follows rules 2 and 3.
5. **Migration.** When a `PATCH` changes the `start` of an open (unticked) task (to a new time, or to empty for "back to inbox"), and that task's old end had already passed, the server adds 1 to `migrations`. The server applies the rule, so the desktop, the phone, and the agent all count the same way.
6. **Back to inbox.** This sets `start` to empty and keeps `duration`. A ticked task also goes back to `open`, because otherwise it would match no list and vanish. Only tasks can do it. For an event, the `CHECK` constraint rejects the change with a `400`.
7. **Overdue.** Overdue isn't stored. A task is overdue when it shows up in the `unfinished` query.

## Screens

### Visual direction A, "Dot grid"

- **Fonts.** Geist for text and Geist Mono for times and signifiers. Both are self-hosted as woff2 files in `src/web/fonts` under the SIL Open Font License, so the app never calls Google Fonts.
- **Colors.** Light mode only in v1. These are CSS variables on `:root`.

  | Token | Value | Use |
  |---|---|---|
  | `--bg` | `#F3F3F0` | page background |
  | `--paper` | `#FBFBF9` | task boxes, panels, inputs |
  | `--ink` | `#1C1C1F` | text, borders, event blocks |
  | `--muted` | `#66666C` | secondary text, routine text |
  | `--line` | `#D9D9D3` | grid lines, quiet borders |
  | `--dot` | `#C4C4BD` | dot grid |
  | `--accent` | `#2D4BD0` | now line, today label, primary button |
  | `--on-accent` | `#F7F8FF` | text on the accent |
  | `--over` | `#B3261E` | overdue |
  | `--routine` | `#E8E8E3` | routine block fill |

- **Shape.** A 3px corner radius on everything.
- **Signifiers.** `•` is an open task, `×` a done task, `○` an event, and `>2` a task carried forward twice. Struck-out tasks leave the grid.
- **Blocks.** Tasks are paper boxes with an ink outline. Events are solid ink with paper-colored text. Routine copies are faint gray, and routine tasks get a dashed outline. Done and past blocks drop to 55% opacity. Overdue tasks get a red outline and red text.
- **Grid background.** A dot every half hour, lined up with the time grid.
- **Times.** 12-hour format, like "7:30 pm". One constant in `src/shared/time.ts` switches to 24-hour.

### Desktop planner (`/`)

The inbox panel sits on the left, about 300px wide. It holds the quick-add form, then Overdue, then Inbox. The week grid fills the rest. The header shows the week number and date range, plus buttons for previous week, today, and next week. The Routines button arrives in milestone 2.

FullCalendar settings:

- Week view (`timeGridWeek`) with `firstDay: 1` (Monday) and `allDaySlot: false`
- 30-minute rows (`slotDuration: '00:30:00'`) that snap to 15 minutes (`snapDuration: '00:15:00'`)
- Visible hours from 6 am to midnight (`slotMinTime: '06:00'`, `slotMaxTime: '24:00'`), scrolled to 7 am on load (`scrollTime: '07:00'`)
- `nowIndicator: true`, `editable: true`, `selectable: true`, and `droppable: true`
- The inbox and Overdue lists use FullCalendar's `Draggable`. A drop fires `eventReceive`, which sends a `PATCH` with the new start.
- `eventDrop` and `eventResize` send a `PATCH`. If the save fails, they call `info.revert()` and show a short message.
- `select` opens a small title input and sends a `POST` for an event.
- `eventClick` opens a small popover with Tick, Back to inbox, Delete, and the title and notes fields.
- `eventContent` draws the signifier, the title, the time, and the migration count.

### Token screen

When any API call returns `401`, the page shows a single "Paste your token" field. It stores the token in `localStorage` and sends it as `Authorization: Bearer <token>` from then on. A home screen app on the iPhone has its own storage, so you paste the token once there too.

### Phone today page (`/today`, milestone 2)

The page has a top bar and the day as a compact list. The top bar shows the date and the current time, an Arrange day icon that links to `/day`, and an Inbox icon that links to `/inbox`. The Inbox icon carries the number of inbox and overdue tasks, and the number turns red when anything is overdue.

The list shows every entry that touches today in time order, ticked ones included. Each row has the start time, a tick box for tasks or ○ for events, the title with the first line of its description, and the length. Past rows and ticked rows are dimmed, ticked titles are crossed out, and a past task that is still open turns red. The running entry is tinted and says "now, until 5:00 pm". A blue line marks now. A grey line like "1h 30m free" sits between entries when nothing is planned for 30 minutes or more, and free time that has started counts from now. If nothing is left today, a line names the first entry tomorrow.

Tapping a box ticks or unticks the task. Tapping a title opens the same dialog as the grid. Holding a row for 0.4 seconds lifts it, and the list turns into a timeline of the day from 6 am to midnight, scaled to fit the screen, with blocks as tall as they are long and overlaps side by side. Dragging moves the held block in 15-minute steps and shows its new time. Letting go saves the move and turns the timeline back into the list. Ctrl+Z undoes the move on a computer. The + button in the bottom right corner opens a sheet with the quick-add form, which adds to the inbox. Every touch target is at least 44px. A `<meta name="apple-mobile-web-app-capable">` tag and an `apple-touch-icon` let "Add to Home Screen" open the page without Safari's toolbar. The page gets its data from `GET /api/week` and works out now and next itself. If nothing is left today, "Next" shows the first entry tomorrow, and on Sundays the page also fetches next week for that.

### Phone inbox (`/inbox`, milestone 2)

This page shows the same Overdue and Inbox lists as the desktop panel. Tapping a task's box ticks it, and each task has a Delete button. The header links to the day page as Arrange day, which is where tasks get a time.

### Phone day page (`/day`, added 19 November)

The Today and Inbox pages link here as Arrange day. It is for planning the day in the morning and reshuffling it during the day. The header shows the date, with ← and → to step one day at a time, a Tasks button with the number of tasks to place, and a Back link to `/today`. Below it is one day of the desktop grid, which opens an hour before now on today and at 7 am on other days. Its 30-minute rows are 48px tall, twice the desktop's, so a 15-minute block has room for its title.

Tasks opens a panel that slides over the grid from the right. It is the desktop's inbox panel, with quick add, Overdue and Inbox. Holding a task for 0.3 seconds starts a drag, and the panel slides out of the way until the drop, so the whole grid is free to drop on. A long press of 0.4 seconds drags a block, and after the long press its bottom edge resizes it. Tapping a block opens the same dialog as on the desktop. A double tap on an empty time opens the new task dialog. Creating events by dragging across empty time stays on the desktop. Throwing a block away works as on the desktop.

The app has a web manifest with scope `/`, so the home screen app keeps every page inside the app. Without it, iOS opened pages other than the one added in a browser window inside the app.

### Routines page (`/routines`, milestone 2)

This page lists routines, each with a Delete button, above a form for kind, title, days (seven toggles), time, and duration. Edit means delete and create.

### Routines in milestone 1

Create routines once with curl. The times below are placeholders, so replace them with your real ones.

```sh
TOKEN=...   # your APP_TOKEN
URL=https://my-week.example.com   # your subdomain

add() { curl -s -X POST "$URL/api/routines" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$1"; echo; }

add '{"kind":"event","title":"Commute","days":"MTWTF..","at":"07:30","duration":30}'
add '{"kind":"event","title":"Work","days":"MTWTF..","at":"08:00","duration":540}'
add '{"kind":"event","title":"Commute","days":"MTWTF..","at":"17:00","duration":30}'
add '{"kind":"event","title":"Dinner","days":"MTWTFSS","at":"18:30","duration":45}'
add '{"kind":"event","title":"Gaming","days":"M.W.F..","at":"21:00","duration":90}'
add '{"kind":"task","title":"Read 20 min","days":"MTWTFSS","at":"22:30","duration":20}'
```

The same commands go in the README.

## API

Every route under `/api` requires `Authorization: Bearer <token>`. Request and response bodies are JSON.

| Route | What it does |
|---|---|
| `GET /api/week?monday=2026-11-23` | Fills the week if needed, then returns `{ entries, inbox, unfinished }`. Without `monday` it returns the current week. On Sundays the planner page asks for next week itself. A date that isn't a Monday gets a `400`. |
| `POST /api/entries` | Takes `{ kind, title, notes?, start?, duration }` and returns `201` with the entry. A task without `start` goes to the inbox. |
| `PATCH /api/entries/:id` | Takes any of `title`, `notes`, `start`, `duration`, `status` and returns `200` with the entry. Applies the migration rule. |
| `DELETE /api/entries/:id` | Returns `204`. |
| `GET /api/routines` | Returns all routines. |
| `POST /api/routines` | Takes `{ kind, title, days, at, duration }`, fills copies (rule 2), and returns `201`. |
| `DELETE /api/routines/:id` | Removes future open copies (rule 3) and returns `204`. |
| `GET /api/guide` | Returns `docs/agent-api.md` as `text/markdown`. |
| `GET /calendar.ics?token=…` | Returns the feed. It uses `FEED_TOKEN` in the URL instead of a header. |

Every other path serves the built frontend from `dist/`, with `index.html` as the fallback for `/today`, `/inbox`, `/day`, and `/routines`.

**Writes.** The server builds SQL only from an allowlist of columns. `POST /api/entries` accepts `kind`, `title`, `notes`, `start`, and `duration`. `PATCH` accepts `title`, `notes`, `start`, `duration`, and `status`. The server sets `id`, `migrations`, `routine_id`, and `created_by` itself. A key outside the allowlist gets a `400` that names the key.

**Errors.** Every error body is `{ "error": "<message>" }`.

| Status | When |
|---|---|
| `400` | Bad JSON, a key outside the allowlist, or a failed `CHECK` constraint. The message includes SQLite's constraint text, for example `CHECK constraint failed: duration BETWEEN 5 AND 1440`. |
| `401` | The token is missing or wrong. |
| `403` | The agent token tried something it isn't allowed to do. |
| `404` | No entry or routine has that id. |

### Tokens

| Variable | Who uses it | What it can do |
|---|---|---|
| `APP_TOKEN` | You, in the browser and on the phone | Everything. Entries get `created_by = 'me'`. |
| `AGENT_TOKEN` | The planner agent | `GET /api/week`, `GET /api/routines`, `GET /api/guide`, and `POST /api/entries` for a task without `start`. Anything else gets a `403`. Entries get `created_by = 'agent'`. |
| `FEED_TOKEN` | iPhone Calendar | Only `GET /calendar.ics`. Because it sits in a URL, it can read and nothing else. |

Generate each token with `openssl rand -hex 32`. The server compares tokens with `crypto.timingSafeEqual`.

## Calendar feed

`GET /calendar.ics?token=FEED_TOKEN` returns `text/calendar`. It fills and includes this week plus the next three.

- **Entries.** Each scheduled entry with status `open` or `done` becomes one `VEVENT`. The feed leaves out cancelled entries and inbox tasks.
- **Fields.** `UID` is `entry-<id>@my-week`. `DTSTAMP` is the current time in UTC. `DTSTART` and `DTEND` are floating times with no time zone, like `20261125T193000`, which iPhone reads as local time.
- **Titles.** `SUMMARY` starts with the signifier, as in `• Project report`, `× Groceries`, or `○ Dentist`.
- **Format rules.** Lines end in CRLF. The generator escapes backslash, semicolon, comma, and newline, and folds lines longer than 75 octets without splitting a UTF-8 character.
- **Left out.** No alarms and no notes in v1.

The feed is about 25 lines of hand-written code in `src/server/ics.ts`, with no library.

iPhone setup:

1. In Nginx Proxy Manager, give the subdomain a valid certificate, for example Let's Encrypt with a DNS challenge. iOS rejects self-signed certificates for subscriptions.
2. On the iPhone itself, open Calendar settings, then Add Subscribed Calendar, and enter `https://<subdomain>/calendar.ics?token=<FEED_TOKEN>`. Don't subscribe through iCloud on a Mac. Then Apple's servers would fetch the feed, and they can't reach a Tailscale-only address.
3. Turn on Tailscale's VPN On Demand, so the phone can reach the feed whenever iOS refreshes it.
4. Add the Calendar app's Up Next widget to the home screen.

iOS decides when to refresh a subscribed calendar, and the server can't push changes to it. Treat the widget as up to an hour behind. The today page is always current.

## Agent

The planner agent reaches the app by container name over a shared Docker network, at `http://my-week:3000`. Its CLAUDE.md gets a short instruction like this:

```md
## Week planner
Before using the week planner, read its guide:
curl -s -H "Authorization: Bearer $MY_WEEK_TOKEN" http://my-week:3000/api/guide
```

`docs/agent-api.md` (served at `/api/guide`) covers:

- the base URL and the auth header
- what the agent may do: read any week, read routines, and add tasks to the inbox
- what it may not do (`403`): move, tick, edit, or delete anything, or create events
- the entry fields and the time format, with curl examples for reading a week and adding an inbox task
- how to suggest an arrangement: read the week, find free time, and describe the placements to the user in chat, who drags them on the desktop

**Why there's no MCP server in v1.** Claude Code can already call the API from its shell by following the guide. An MCP server would be a second description of the same routes to keep in sync, and with one agent it adds little. Add it when the agent keeps getting calls wrong, or when you want the planner inside Claude Desktop. The app can then serve MCP at `/mcp` from the same container with the official TypeScript MCP SDK.

## Project layout

```
my-week/
  src/server/index.ts       Hono app, routes, auth, static files
  src/server/db.ts          opens SQLite, runs schema upgrades, holds queries
  src/server/week.ts        filling weeks, routine rules, migration rule
  src/server/ics.ts         calendar feed text
  src/server/*.test.ts      tests for node --test
  src/web/                  React app built by Vite (planner, today, inbox, routines)
  src/web/fonts/            Geist and Geist Mono woff2 files
  src/shared/time.ts        date and time helpers shared by server and web
  migrations/001_init.sql
  docs/agent-api.md
  Dockerfile
  compose.example.yaml
  package.json
  README.md
```

## Stack and tooling

| Part | Choice |
|---|---|
| Runtime | Node, the current LTS (24 or newer), pinned to an exact version in the Dockerfile |
| Server | `hono` and `@hono/node-server`, the only runtime dependencies |
| Database | `node:sqlite`, built into Node. It prints an `ExperimentalWarning` once at startup, which is harmless. If it causes trouble, `better-sqlite3` has nearly the same API. The schema above was checked against `node:sqlite` on 2026-11-18, and every `CHECK` rejected its bad inputs. |
| Frontend | React, Vite, and FullCalendar's MIT packages (`@fullcalendar/react`, `core`, `timegrid`, `interaction`). These are dev dependencies, because Vite bundles them into `dist/`. |
| TypeScript | Node runs the server's `.ts` files directly by stripping types, so the server has no build step. This needs syntax TypeScript can erase: no `enum`, no `namespace`, no constructor parameter properties. Imports end in `.ts`. `tsconfig.json` sets `noEmit`, `allowImportingTsExtensions`, and `erasableSyntaxOnly`. `npx tsc --noEmit` checks types. |
| Tests | Node's built-in runner, `node --test "src/**/*.test.ts"` |

## Deployment

**Image.** Since 20 November (v0.4.1), pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`, which builds the image for linux/amd64 and pushes `ghcr.io/simongeronimo/my-week` tagged with the version and `stable`. Dockge pulls `:stable`. Before that, the image was built on the server:

```sh
docker build -t my-week:0.1.0 .
```

```dockerfile
FROM node:24 AS build          # pin an exact version, like node:24.x.y
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build              # Vite builds src/web into dist/

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY migrations ./migrations
COPY docs/agent-api.md ./docs/agent-api.md
EXPOSE 3000
CMD ["node", "src/server/index.ts"]
```

**Compose file for Dockge** (`compose.example.yaml`). Tokens go in Dockge's `.env` for the stack.

```yaml
services:
  my-week:
    image: my-week:0.1.0
    container_name: my-week
    restart: unless-stopped
    user: "568:568"             # TrueNAS apps user; must own the data folder
    environment:
      TZ: Etc/UTC               # replace with your zone, for example Europe/Berlin
      APP_TOKEN: ${APP_TOKEN}
      AGENT_TOKEN: ${AGENT_TOKEN}
      FEED_TOKEN: ${FEED_TOKEN}
    volumes:
      - /mnt/tank/apps/my-week:/data   # your TrueNAS dataset
    networks:
      - apps
networks:
  apps:
    external: true              # shared with Nginx Proxy Manager and the planner agent
```

- **Network.** Nginx Proxy Manager, my-week, and the planner agent all join the external `apps` network. The proxy host for the subdomain points at `http://my-week:3000`, so the container publishes no ports. If your network has another name, use that.
- **Base path.** Pages and API calls use relative URLs, so the app needs no base-path setting behind the proxy.
- **Backups.** A TrueNAS periodic snapshot task on the dataset is enough. SQLite in WAL mode survives a sudden stop, so a snapshot is safe while the app runs. Copying the folder by hand while the app runs can catch a half-written file, so stop the container before a manual copy.
- **Upgrades.** Build a new tag, take a snapshot, change the tag in Dockge, and redeploy. Schema upgrades run on startup. An old image may not run on a database a newer version has upgraded, so a rollback means restoring the snapshot and the old tag together.

## Error handling

- **Bad input.** Constraint failures become a `400` with SQLite's message, so the agent can see what it got wrong.
- **Failed saves on the grid.** FullCalendar's `info.revert()` puts the block back, and a short message appears at the top of the page.
- **Two devices editing at once.** The last save wins. That's acceptable for one user, and conflict detection is on the later list.
- **Schema upgrade failure.** The transaction rolls back, and the server logs the error and exits. Dockge shows the crash and the log.
- **Logs.** Everything goes to stdout and stderr. There is no log file.

## Testing

Automated tests run with `node --test` against an in-memory database (`:memory:`). Each file covers one rule:

1. `week.test.ts` checks filling a week. Routines get copied onto the right days. A deleted copy stays deleted. Creating and deleting a routine only touches copies from now onward.
2. `migration.test.ts` checks that moving a task whose time has passed adds 1, and that moving a future task adds nothing.
3. `auth.test.ts` checks that the agent token can read and add inbox tasks, and gets a `403` for everything else. It also checks that a wrong token gets a `401`.
4. `ics.test.ts` checks one feed with an escaped comma, a long title with a non-ASCII character that gets folded, and CRLF line endings.

There are no UI tests in v1. This checklist is the acceptance test for milestone 1, run on Sunday:

1. Open the planner on the PC. It shows the week of 23 November with routine copies on it.
2. Add five tasks to the inbox and drag each one onto the grid. Resize one and move one.
3. Create an event by dragging across an empty slot.
4. Tick a task, send one back to the inbox, and delete one.
5. Reload the page, then restart the container. Everything is still where you left it.

## What to learn

- **SQL.** `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `WHERE`, `CHECK` constraints, and transactions. The whole data model is about 30 lines of SQL.
- **HTTP.** Methods, status codes (200, 201, 204, 400, 401, 403, 404), JSON bodies, and Bearer tokens.
- **FullCalendar.** Its event objects and the callbacks named under "Desktop planner". This is where the drag and drop lives.
- **Docker.** Multi-stage builds, volumes, networks, and environment variables.
- **Testing.** Node's built-in test runner and `assert`.

## Open items

- **Name.** `my-week` is the working name. The candidates are dotweek, slotted, migrate, and weekbox. The name ends up in the image tag, the container name, the agent's URL, and the subdomain, so pick one before the first deploy or keep `my-week`.
