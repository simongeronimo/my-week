# my-week milestone 2 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use my-week away from the desktop. You get a phone Today page and Inbox page, a routines page, a calendar feed for iPhone Calendar's Up Next widget, and limited API access for the planner agent.

**Architecture:** Everything stays in the one container from milestone 1. The server gains a second token for the agent, a third token for a `/calendar.ics` feed that it writes by hand, and serves the agent guide at `/api/guide`. The React app becomes four pages chosen by URL path (`/`, `/routines`, `/today`, `/inbox`), linked with plain `<a href>` loads. The logic behind the phone pages lives in small `.ts` files, so `node --test` can test it without a browser.

**Tech Stack:** The same as milestone 1 (Node, Hono, `node:sqlite`, React 19, FullCalendar 6, Vite 8, TypeScript 5.9, `node --test`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-18-week-planner-design.md` (milestone 2 scope, the API, Tokens, Calendar feed, Agent, and the phone screens)

**Starting point:** branch `milestone-1`, with 24 passing tests. This plan is the last commit on it. Work on a new branch, `milestone-2`, cut from there.

**Verified before writing:** On 2026-11-18, every code block below came straight from a scratch copy where it ran. After each task, the test count matched its `Expected:` line (29, 33, 35, 39), `tsc` passed, and `vite build` passed. A curl smoke test against the running build passed too: `/today`, `/inbox`, `/routines` and the icon load, the agent can add a task but gets a `403` for a change, and the feed escapes a comma. Nobody has opened the pages in a browser yet, so Task 6 is a manual check on your devices.

## Global constraints

- Add no dependencies. Everything here uses what milestone 1 installed, plus Node built-ins.
- The milestone 1 rules still hold: erasable TypeScript only, relative imports ending in `.ts` or `.tsx`, `import type` for types, wall-clock time strings, and SQL column names only from the allowlists in `week.ts`.
- `APP_TOKEN`, `AGENT_TOKEN` and `FEED_TOKEN` must all differ, and the server refuses to start otherwise. `AGENT_TOKEN` and `FEED_TOKEN` are optional, and leaving one unset turns that feature off.
- The agent token can make exactly four kinds of request: `GET /api/week`, `GET /api/routines`, `GET /api/guide`, and `POST /api/entries` for a task without a start. Everything else gets a `403`.
- The feed token goes only in the `/calendar.ics` URL, and it can only read.
- Phone pages use touch targets of at least 44px and inputs at 16px, so iOS doesn't zoom in. Times show in 12-hour format, as before.
- UI text has no em dashes.

## Deviations from the spec, on purpose

- "Later today" on the phone hides ticked and cancelled entries, so the list shows only what is left to do.
- The home screen icon is a plain light bullet on ink, written by a short script instead of drawn in a design tool.
- The phone Today page reuses the desktop quick-add form with three duration chips: 15m, 30m and 1h.
- Routines have no edit button. You delete a routine and add it again, which is what the spec's rule 4 describes.

## Review focus

1. **The agent token reaching for more than it may.** A `PATCH`, a `DELETE`, a `POST` of an event or of a task with a start, and any routine change all get a `403`, and nothing changes. Tested in Task 1 (`agent.test.ts`).
2. **Two tokens with the same value.** The server refuses to start, because otherwise the agent or the feed would get full access. Tested in Task 1 (`startup.test.ts`).
3. **Feed requests without the right token.** A missing token, a wrong token, the app token, or a turned-off feed gets a `401` or `404`, never the calendar. Tested in Task 2 (`ics.test.ts`).
4. **Titles with commas, semicolons, accents or a lot of text.** The feed escapes them and folds long lines at 75 octets without splitting a character. Tested in Task 2.
5. **Now and next on the phone with overlapping entries, nothing left today, or ticked and cancelled entries.** "Now" is the latest-started entry still running, "next" can be tomorrow, and ticked and cancelled entries never appear. Tested in Task 4 (`today.test.ts`).

## How to apply a patch step

Some steps change an existing file with a `diff` block. Save the block to a file outside the repo, for example `/tmp/step.patch`, and run `git apply /tmp/step.patch` in the repo root. If `git apply` refuses, the file differs from what this plan expects, so stop and compare.

---

### Task 1: Agent token, limits and guide

**Files:**
- Create: `docs/agent-api.md`, `src/server/agent.test.ts`
- Replace: `src/server/app.ts`, `src/server/index.ts`, `src/server/startup.test.ts`

**Interfaces:**
- Consumes: everything `week.ts` exports, plus `isMonday`, `localNow` and `mondayOf` from milestone 1.
- Produces:
  - `AppOptions` gains `agentToken?: string`.
  - `createApp` returns `Hono<{ Variables: { who: 'me' | 'agent' } }>`.
  - `GET /api/guide` returns `docs/agent-api.md` as `text/markdown`.
  - `index.ts` reads `AGENT_TOKEN` and `FEED_TOKEN` and exits with code 1 if any two tokens match.

- [ ] **Step 1: Create the branch**

```bash
git switch -c milestone-2
```

- [ ] **Step 2: Write `docs/agent-api.md`**

````markdown
# my-week API guide for the planner agent

my-week is the user's week planner. You can read their week and add tasks to their inbox. The user places inbox tasks on the week themselves, usually on Sunday evening.

## Connecting

- Base URL: `http://my-week:3000`, the container name on the shared Docker network.
- Send `Authorization: Bearer $MY_WEEK_TOKEN` with every request.
- Request and response bodies are JSON. Errors look like `{"error": "..."}`.

## What you may do

| Request | What it does |
|---|---|
| `GET /api/week?monday=YYYY-MM-DD` | The week that starts on that Monday, as `{ monday, entries, inbox, unfinished }`. Without `monday` you get the current week. |
| `GET /api/routines` | The user's recurring blocks, such as work and dinner. |
| `GET /api/guide` | This guide. |
| `POST /api/entries` | Adds a task to the inbox. Send `{"kind": "task", "title": "...", "duration": 30}`, and optionally `"notes"`. |

Everything else gets a `403`: moving, ticking, editing or deleting entries, creating events, giving a task a start time, and changing routines. Those decisions belong to the user.

## Entries

| Field | Meaning |
|---|---|
| `id` | A number. |
| `kind` | `task` or `event`. Someone else fixed an event's time, like a dentist appointment. |
| `title` | Text. |
| `notes` | Text, or null. |
| `start` | A wall-clock time in the user's time zone, like `2026-11-25T19:30`. Null for inbox tasks. |
| `duration` | Minutes, from 5 to 1440. |
| `status` | `open`, `done`, or `cancelled`. |
| `migrations` | How often the user carried this task forward after its time passed. |
| `routine_id` | Set when the entry is a copy of a routine. |
| `created_by` | `me` or `agent`. |

`inbox` holds open tasks with no start. `unfinished` holds open tasks whose time has passed.

## Examples

```sh
curl -s -H "Authorization: Bearer $MY_WEEK_TOKEN" "http://my-week:3000/api/week?monday=2026-11-23"

curl -s -X POST http://my-week:3000/api/entries \
  -H "Authorization: Bearer $MY_WEEK_TOKEN" -H "Content-Type: application/json" \
  -d '{"kind": "task", "title": "Book a dentist appointment", "duration": 15}'
```

## Suggesting an arrangement

You can't place tasks yourself. To help the user plan:

1. Read the week and find the free time between entries.
2. Match inbox tasks to free slots by duration.
3. Tell the user in chat, for example "Fix bike brakes (45m) fits Tuesday at 7:00 pm". They drag it onto the week on the desktop.

Keep durations realistic, and add only the tasks the user asked for.
````

- [ ] **Step 3: Write the failing test `src/server/agent.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import type { Entry, WeekView } from '../shared/types.ts';

const APP = 'app-token';
const AGENT = 'agent-token';

function setup() {
  const app = createApp({ db: openDb(':memory:'), appToken: APP, agentToken: AGENT, timeZone: 'UTC', distDir: 'dist' });
  const as = (token: string) => (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { me: as(APP), agent: as(AGENT) };
}

test('the agent can read the week, the routines and its guide', async () => {
  const { agent } = setup();
  assert.equal((await agent('GET', '/api/week?monday=2026-11-23')).status, 200);
  assert.equal((await agent('GET', '/api/routines')).status, 200);
  const guide = await agent('GET', '/api/guide');
  assert.equal(guide.status, 200);
  assert.match(guide.headers.get('content-type') ?? '', /text\/markdown/);
  assert.match(await guide.text(), /add tasks to their inbox/);
});

test('the agent can add inbox tasks, marked as its own', async () => {
  const { agent } = setup();
  const res = await agent('POST', '/api/entries', { kind: 'task', title: 'Book dentist', duration: 15 });
  assert.equal(res.status, 201);
  assert.equal(((await res.json()) as Entry).created_by, 'agent');
});

test('the agent gets 403 for everything else, and nothing changes', async () => {
  const { me, agent } = setup();
  const mine = (await (await me('POST', '/api/entries', { kind: 'task', title: 'Mine', duration: 30 })).json()) as Entry;
  const forbidden: [string, string, unknown?][] = [
    ['POST', '/api/entries', { kind: 'task', title: 'X', duration: 30, start: '2026-11-26T18:00' }],
    ['POST', '/api/entries', { kind: 'event', title: 'X', duration: 30, start: '2026-11-26T18:00' }],
    ['PATCH', `/api/entries/${mine.id}`, { status: 'done' }],
    ['DELETE', `/api/entries/${mine.id}`],
    ['POST', '/api/routines', { kind: 'event', title: 'X', days: 'MTWTF..', at: '08:00', duration: 60 }],
    ['DELETE', '/api/routines/1'],
  ];
  for (const [method, path, body] of forbidden) {
    assert.equal((await agent(method, path, body)).status, 403, `${method} ${path}`);
  }
  const week = (await (await me('GET', '/api/week?monday=2026-11-23')).json()) as WeekView;
  assert.deepEqual(week.inbox.map((e) => [e.title, e.status]), [['Mine', 'open']]);
});

test('without AGENT_TOKEN set, the agent token is just a wrong token', async () => {
  const app = createApp({ db: openDb(':memory:'), appToken: APP, timeZone: 'UTC', distDir: 'dist' });
  assert.equal((await app.request('/api/week', { headers: { Authorization: `Bearer ${AGENT}` } })).status, 401);
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `node --test src/server/agent.test.ts`
Expected: tests 1 to 3 FAIL. Test 4 passes already, because today every unknown token gets a `401`.

- [ ] **Step 5: Replace `src/server/app.ts`**

```ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { HttpError, createEntry, createRoutine, deleteEntry, deleteRoutine, getWeek, listRoutines, updateEntry } from './week.ts';
import { isMonday, localNow, mondayOf } from '../shared/time.ts';

export type AppOptions = {
  db: DB;
  appToken: string;
  agentToken?: string; // the planner agent: may read, and add tasks to the inbox
  timeZone: string;
  distDir: string; // built frontend, relative to the working directory
};

type Env = { Variables: { who: 'me' | 'agent' } };

const GUIDE = readFileSync(join(import.meta.dirname, '../../docs/agent-api.md'), 'utf8');
const AGENT_READS = ['/api/week', '/api/routines', '/api/guide'];

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

function idParam(c: Context): number {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, `No item with id ${c.req.param('id')}`);
  return id;
}

/** The agent may only add inbox tasks: kind task, no start. */
function isInboxTask(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const { kind, start } = body as Record<string, unknown>;
  return kind === 'task' && (start === undefined || start === null);
}

export function createApp({ db, appToken, agentToken, timeZone, distDir }: AppOptions): Hono<Env> {
  const app = new Hono<Env>();
  const now = () => localNow(timeZone);

  app.use('/api/*', async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (sameToken(token, appToken)) {
      c.set('who', 'me');
    } else if (agentToken && sameToken(token, agentToken)) {
      const allowed =
        (c.req.method === 'GET' && AGENT_READS.includes(c.req.path)) || (c.req.method === 'POST' && c.req.path === '/api/entries');
      if (!allowed) return c.json({ error: 'The agent token can only read and add tasks to the inbox' }, 403);
      c.set('who', 'agent');
    } else {
      return c.json({ error: 'Missing or wrong token' }, 401);
    }
    await next();
  });

  app.get('/api/guide', (c) => c.body(GUIDE, 200, { 'Content-Type': 'text/markdown; charset=utf-8' }));
  app.get('/api/week', (c) => {
    const monday = c.req.query('monday') ?? mondayOf(now());
    if (!isMonday(monday)) throw new HttpError(400, 'monday must be a Monday date like 2026-11-23');
    return c.json(getWeek(db, monday, now()));
  });
  app.post('/api/entries', async (c) => {
    const body = await jsonBody(c);
    const who = c.get('who');
    if (who === 'agent' && !isInboxTask(body)) {
      throw new HttpError(403, 'The agent token can only add tasks without a start, which go to the inbox');
    }
    return c.json(createEntry(db, body, who), 201);
  });
  app.patch('/api/entries/:id', async (c) => c.json(updateEntry(db, idParam(c), await jsonBody(c), now())));
  app.delete('/api/entries/:id', (c) => {
    deleteEntry(db, idParam(c));
    return c.body(null, 204);
  });
  app.get('/api/routines', (c) => c.json(listRoutines(db)));
  app.post('/api/routines', async (c) => c.json(createRoutine(db, await jsonBody(c), now()), 201));
  app.delete('/api/routines/:id', (c) => {
    deleteRoutine(db, idParam(c), now());
    return c.body(null, 204);
  });
  app.all('/api/*', (c) => c.json({ error: 'No such route' }, 404));

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    // node:sqlite marks constraint failures (CHECK, NOT NULL, wrong type, foreign key) with result code 19
    const e = err as Error & { code?: string; errcode?: number };
    if (e.code === 'ERR_SQLITE_ERROR' && ((e.errcode ?? 0) & 0xff) === 19) return c.json({ error: e.message }, 400);
    console.error(err);
    return c.json({ error: 'Internal error' }, 500);
  });

  app.use('/*', serveStatic({ root: distDir }));
  app.get('*', serveStatic({ path: join(distDir, 'index.html') })); // /today, /inbox and so on load the app
  return app;
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: `# pass 28`, `# fail 0`.

- [ ] **Step 7: Replace `src/server/startup.test.ts` with a version that adds a same-token check**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Starts the real server with extra environment variables; a server that does start gets stopped after 5 s. */
function start(env: Record<string, string>) {
  return spawnSync(process.execPath, [join(import.meta.dirname, 'index.ts')], {
    env: { ...process.env, TZ: 'UTC', APP_TOKEN: 'x', PORT: '0', DATA_DIR: mkdtempSync(join(tmpdir(), 'my-week-')), ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
}

test('the server refuses to start with a misspelled TZ', () => {
  const result = start({ TZ: 'Europe/Berln' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TZ "Europe\/Berln"/);
});

test('the server refuses to start when two tokens are the same', () => {
  const result = start({ APP_TOKEN: 'same', AGENT_TOKEN: 'same' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must all be different/);
});
```

- [ ] **Step 8: Run it and watch the new test fail**

Run: `node --test src/server/startup.test.ts`
Expected: test 1 passes, and test 2 FAILS with `expected: 1, actual: 0`. The server started, and the timeout's SIGTERM made it exit cleanly with code 0.

- [ ] **Step 9: Replace `src/server/index.ts`**

```ts
import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { localNow } from '../shared/time.ts';

const appToken = process.env.APP_TOKEN;
if (!appToken) {
  console.error('APP_TOKEN is not set. Generate one with: openssl rand -hex 32');
  process.exit(1);
}
const agentToken = process.env.AGENT_TOKEN || undefined; // optional: the planner agent's access
const feedToken = process.env.FEED_TOKEN || undefined; // optional: the calendar feed
const tokens = [appToken, agentToken, feedToken].filter((token) => token !== undefined);
if (new Set(tokens).size !== tokens.length) {
  console.error('APP_TOKEN, AGENT_TOKEN and FEED_TOKEN must all be different. Generate each with: openssl rand -hex 32');
  process.exit(1);
}
const dataDir = process.env.DATA_DIR ?? './data';
const port = Number(process.env.PORT ?? 3000);
const timeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
try {
  localNow(timeZone); // a typo here would otherwise turn every API call into a 500
} catch {
  console.error(`TZ "${timeZone}" is not a time zone name this server knows. Use one like Europe/Berlin.`);
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });
const db = openDb(join(dataDir, 'my-week.db'));
const app = createApp({ db, appToken, agentToken, timeZone, distDir: 'dist' });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`my-week listening on port ${info.port}, time zone ${timeZone}`);
});

// Docker sends SIGTERM on stop. Node running as PID 1 ignores it unless we handle it.
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
```

- [ ] **Step 10: Run every check**

Run: `npm test && npm run typecheck`
Expected: `# pass 29`, `# fail 0`, and no output from `tsc`.

- [ ] **Step 11: Commit**

```bash
git add docs/agent-api.md src/server/agent.test.ts src/server/app.ts src/server/index.ts src/server/startup.test.ts
git commit -m "Add the agent token with read and inbox-only access, and serve the agent guide"
```

---

### Task 2: Calendar feed

**Files:**
- Create: `src/server/ics.ts`, `src/server/ics.test.ts`
- Modify: `src/server/app.ts`, `src/server/index.ts` (patch)

**Interfaces:**
- Consumes: `createApp` and `AppOptions` from Task 1, `getWeek` and `createEntry` from `week.ts`, and `addDays`, `addMinutes`, `localNow` and `mondayOf` from `time.ts`.
- Produces:
  - `toIcs(entries: Entry[], now: Date): string` and `fold(line: string): string` in `ics.ts`.
  - `AppOptions` gains `feedToken?: string`.
  - `GET /calendar.ics?token=` covers this week and the next three. It answers `200` with `text/calendar` for the right token, `401` for a missing or wrong one, and `404` when `FEED_TOKEN` is unset.

- [ ] **Step 1: Write the failing test `src/server/ics.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { createEntry } from './week.ts';
import { toIcs } from './ics.ts';
import { addDays, localNow, mondayOf } from '../shared/time.ts';
import type { Entry } from '../shared/types.ts';

const NOW = new Date('2026-11-18T12:00:00Z');
const entry = (over: Partial<Entry>): Entry => ({
  id: 1, kind: 'task', title: 'X', notes: null, start: '2026-11-25T19:30', duration: 60,
  status: 'open', migrations: 0, routine_id: null, created_by: 'me', ...over,
});

test('each entry becomes an event with floating times and its signifier', () => {
  const ics = toIcs([
    entry({ id: 7, title: 'Project report' }),
    entry({ id: 8, kind: 'event', title: 'Dentist', start: '2026-11-26T15:30', duration: 45 }),
    entry({ id: 9, title: 'Groceries', status: 'done', start: '2026-11-24T17:45', duration: 45 }),
  ], NOW);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('UID:entry-7@my-week\r\nDTSTAMP:20261118T120000Z\r\nDTSTART:20261125T193000\r\nDTEND:20261125T203000\r\nSUMMARY:• Project report\r\n'));
  assert.ok(ics.includes('SUMMARY:○ Dentist\r\n'));
  assert.ok(ics.includes('SUMMARY:× Groceries\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends in CRLF');
});

test('text is escaped and long lines fold without splitting a character', () => {
  const title = 'Groceries, then laundry; café ' + 'é'.repeat(60);
  const ics = toIcs([entry({ title })], NOW);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `${Buffer.byteLength(line)} octets: ${line}`);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes(`SUMMARY:• ${title.replace(',', '\\,').replace(';', '\\;')}\r\n`));
});

test('cancelled and unscheduled entries stay out of the feed', () => {
  const ics = toIcs([entry({ id: 1, status: 'cancelled' }), entry({ id: 2, start: null })], NOW);
  assert.ok(!ics.includes('BEGIN:VEVENT'));
});

test('the feed answers only to FEED_TOKEN in the URL', async () => {
  const db = openDb(':memory:');
  const wednesday = addDays(mondayOf(localNow('UTC')), 2);
  createEntry(db, { kind: 'event', title: 'Dentist', start: `${wednesday}T15:30`, duration: 45 });
  const app = createApp({ db, appToken: 'app', feedToken: 'feed', timeZone: 'UTC', distDir: 'dist' });
  assert.equal((await app.request('/calendar.ics')).status, 401);
  assert.equal((await app.request('/calendar.ics?token=wrong')).status, 401);
  assert.equal((await app.request('/calendar.ics?token=app')).status, 401); // the app token is not a feed token
  const res = await app.request('/calendar.ics?token=feed');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/calendar/);
  assert.match(await res.text(), /SUMMARY:○ Dentist/);
  const off = createApp({ db, appToken: 'app', timeZone: 'UTC', distDir: 'dist' });
  assert.equal((await off.request('/calendar.ics?token=feed')).status, 404);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test src/server/ics.test.ts`
Expected: FAIL with `Cannot find module '.../src/server/ics.ts'`.

- [ ] **Step 3: Write `src/server/ics.ts`**

```ts
import { addMinutes } from '../shared/time.ts';
import type { Entry } from '../shared/types.ts';

// The calendar feed in iCalendar format (RFC 5545), written by hand: it is plain text with three rules.

/** Backslash, semicolon, comma and newline need a backslash in front (RFC 5545, 3.3.11). */
const escapeText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** '2026-11-25T19:30' becomes '20261125T193000', a floating time that iPhone reads as local time. */
const icsTime = (time: string) => `${time.replace(/[-:]/g, '')}00`;

const signifier = (e: Entry) => (e.kind === 'event' ? '○' : e.status === 'done' ? '×' : '•');

/** Lines longer than 75 octets continue on the next line after a space, never inside a UTF-8 character (RFC 5545, 3.1). */
export function fold(line: string): string {
  const pieces: string[] = [];
  let piece = '';
  let octets = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    const limit = pieces.length === 0 ? 75 : 74; // continuation lines spend one octet on the leading space
    if (octets + size > limit) {
      pieces.push(piece);
      piece = '';
      octets = 0;
    }
    piece += char;
    octets += size;
  }
  pieces.push(piece);
  return pieces.join('\r\n ');
}

/** One VEVENT per scheduled entry. Cancelled entries and inbox tasks stay out. */
export function toIcs(entries: Entry[], now: Date): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//my-week//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:my-week'];
  for (const e of entries) {
    if (e.start === null || e.status === 'cancelled') continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:entry-${e.id}@my-week`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(e.start)}`,
      `DTEND:${icsTime(addMinutes(e.start, e.duration))}`,
      `SUMMARY:${escapeText(`${signifier(e)} ${e.title}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
```

- [ ] **Step 4: Add the feed route and option (patch)**

```diff
diff --git a/src/server/app.ts b/src/server/app.ts
index b107596..1a0a846 100644
--- a/src/server/app.ts
+++ b/src/server/app.ts
@@ -6,12 +6,14 @@ import { readFileSync } from 'node:fs';
 import { join } from 'node:path';
 import type { DB } from './db.ts';
 import { HttpError, createEntry, createRoutine, deleteEntry, deleteRoutine, getWeek, listRoutines, updateEntry } from './week.ts';
-import { isMonday, localNow, mondayOf } from '../shared/time.ts';
+import { toIcs } from './ics.ts';
+import { addDays, isMonday, localNow, mondayOf } from '../shared/time.ts';
 
 export type AppOptions = {
   db: DB;
   appToken: string;
   agentToken?: string; // the planner agent: may read, and add tasks to the inbox
+  feedToken?: string; // the calendar feed: read-only, sent in the URL
   timeZone: string;
   distDir: string; // built frontend, relative to the working directory
 };
@@ -48,7 +50,7 @@ function isInboxTask(body: unknown): boolean {
   return kind === 'task' && (start === undefined || start === null);
 }
 
-export function createApp({ db, appToken, agentToken, timeZone, distDir }: AppOptions): Hono<Env> {
+export function createApp({ db, appToken, agentToken, feedToken, timeZone, distDir }: AppOptions): Hono<Env> {
   const app = new Hono<Env>();
   const now = () => localNow(timeZone);
 
@@ -104,6 +106,15 @@ export function createApp({ db, appToken, agentToken, timeZone, distDir }: AppOp
     return c.json({ error: 'Internal error' }, 500);
   });
 
+  // iPhone Calendar can't send headers, so the feed token is part of the URL. It can only read.
+  app.get('/calendar.ics', (c) => {
+    if (!feedToken) return c.json({ error: 'The calendar feed is off. Set FEED_TOKEN to turn it on.' }, 404);
+    if (!sameToken(c.req.query('token') ?? '', feedToken)) return c.json({ error: 'Missing or wrong token' }, 401);
+    const monday = mondayOf(now());
+    const entries = [0, 7, 14, 21].flatMap((days) => getWeek(db, addDays(monday, days), now()).entries); // this week and the next three
+    return c.body(toIcs(entries, new Date()), 200, { 'Content-Type': 'text/calendar; charset=utf-8' });
+  });
+
   app.use('/*', serveStatic({ root: distDir }));
   app.get('*', serveStatic({ path: join(distDir, 'index.html') })); // /today, /inbox and so on load the app
   return app;
diff --git a/src/server/index.ts b/src/server/index.ts
index 12232ab..9c795d4 100644
--- a/src/server/index.ts
+++ b/src/server/index.ts
@@ -29,7 +29,7 @@ try {
 
 mkdirSync(dataDir, { recursive: true });
 const db = openDb(join(dataDir, 'my-week.db'));
-const app = createApp({ db, appToken, agentToken, timeZone, distDir: 'dist' });
+const app = createApp({ db, appToken, agentToken, feedToken, timeZone, distDir: 'dist' });
 
 serve({ fetch: app.fetch, port }, (info) => {
   console.log(`my-week listening on port ${info.port}, time zone ${timeZone}`);
```

- [ ] **Step 5: Run every check**

Run: `npm test && npm run typecheck`
Expected: `# pass 33`, `# fail 0`, and no output from `tsc`.

- [ ] **Step 6: Commit**

```bash
git add src/server/ics.ts src/server/ics.test.ts src/server/app.ts src/server/index.ts
git commit -m "Add the calendar feed at /calendar.ics behind FEED_TOKEN"
```

---

### Task 3: Routines page

**Files:**
- Create: `src/web/routines.ts`, `src/web/routines.test.ts`, `src/web/page.tsx`, `src/web/RoutinesPage.tsx`
- Modify: `src/shared/types.ts`, `src/web/api.ts`, `src/web/Planner.tsx`, `src/web/App.tsx`, `src/web/styles.css` (patch)

**Interfaces:**
- Consumes: `GET`, `POST` and `DELETE /api/routines` from milestone 1, and `formatTime` and `formatDuration`.
- Produces:
  - `DAY_LETTERS`, `DAY_NAMES`, `daysPattern(on: boolean[]): string` and `daysLabel(pattern: string): string` in `routines.ts`.
  - `browserNow()`, `useErrors(onAuthError)` (which returns `{ message, fail, clear }`), and `ErrorBanner({ message, onDismiss })` in `page.tsx`.
  - `api.routines()`, `api.createRoutine(routine)` and `api.deleteRoutine(id)`.
  - The type `NewRoutine = Omit<Routine, 'id'>`.
  - A `PAGES` map in `App.tsx` from path to page component.

- [ ] **Step 1: Write the failing test `src/web/routines.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysLabel, daysPattern } from './routines.ts';

test('seven day toggles become the days pattern the API expects', () => {
  assert.equal(daysPattern([true, true, true, true, true, false, false]), 'MTWTF..');
  assert.equal(daysPattern([false, false, true, false, false, false, false]), '..W....');
});

test('a days pattern reads as plain words', () => {
  assert.equal(daysLabel('MTWTFSS'), 'Every day');
  assert.equal(daysLabel('MTWTF..'), 'Mon to Fri');
  assert.equal(daysLabel('M.W.F..'), 'Mon, Wed, Fri');
  assert.equal(daysLabel('.....SS'), 'Sat, Sun');
  assert.equal(daysLabel('..W....'), 'Wed');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test src/web/routines.test.ts`
Expected: FAIL with `Cannot find module '.../src/web/routines.ts'`.

- [ ] **Step 3: Write `src/web/routines.ts`**

```ts
export const DAY_LETTERS = 'MTWTFSS';
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Seven toggles, Monday first, become 'MTWTF..': a letter for each day on, a dot for each day off. */
export function daysPattern(on: boolean[]): string {
  return on.map((day, i) => (day ? DAY_LETTERS[i] : '.')).join('');
}

/** 'MTWTFSS' becomes 'Every day', 'MTWTF..' becomes 'Mon to Fri', 'M.W.F..' becomes 'Mon, Wed, Fri'. */
export function daysLabel(pattern: string): string {
  if (pattern === 'MTWTFSS') return 'Every day';
  const on = [...pattern].flatMap((letter, i) => (letter === '.' ? [] : [i]));
  const inARow = on.length > 2 && on.every((day, k) => k === 0 || day === on[k - 1] + 1);
  if (inARow) return `${DAY_NAMES[on[0]]} to ${DAY_NAMES[on.at(-1)!]}`;
  return on.map((day) => DAY_NAMES[day]).join(', ');
}
```

- [ ] **Step 4: Run it**

Run: `node --test src/web/routines.test.ts`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Write `src/web/page.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { localNow } from '../shared/time.ts';
import { AuthError } from './api.ts';

/** The wall-clock time right now in this browser's time zone. */
export const browserNow = () => localNow(Intl.DateTimeFormat().resolvedOptions().timeZone);

/** Error handling shared by the pages: a 401 shows the token screen, anything else shows a banner. */
export function useErrors(onAuthError: () => void) {
  const [message, setMessage] = useState<string | null>(null);
  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof AuthError) onAuthError();
      else setMessage(err instanceof Error ? err.message : String(err));
    },
    [onAuthError],
  );
  return { message, fail, clear: () => setMessage(null) };
}

export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <p className="message" role="alert">
      {message}
      <button type="button" className="btn" onClick={onDismiss}>Dismiss</button>
    </p>
  );
}
```

- [ ] **Step 6: Write `src/web/RoutinesPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { Kind, NewRoutine, Routine } from '../shared/types.ts';
import { formatDuration, formatTime } from '../shared/time.ts';
import { api } from './api.ts';
import { DAY_LETTERS, DAY_NAMES, daysLabel, daysPattern } from './routines.ts';
import { ErrorBanner, useErrors } from './page.tsx';

export function RoutinesPage({ onAuthError }: { onAuthError: () => void }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const { message, fail, clear } = useErrors(onAuthError);
  const load = useCallback(() => api.routines().then(setRoutines, fail), [fail]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (change: Promise<unknown>) => {
    try {
      await change;
    } catch (err) {
      fail(err);
    }
    await load();
  };

  return (
    <div className="page">
      <header className="top">
        <div className="title"><h1>Routines</h1></div>
        <nav aria-label="Pages"><a className="btn" href="/">Week</a></nav>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />
      <p className="hint">Every week gets a copy of each routine, from today onward. To change a routine, delete it and add it again.</p>
      <ul className="list">
        {routines.map((r) => (
          <li key={r.id} className="item routine-row">
            <span className="sig" aria-hidden="true">{r.kind === 'event' ? '○' : '•'}</span>
            <span className="item-body">
              <span className="t">{r.title}</span>
              <span className="m">{daysLabel(r.days)}, {formatTime(r.at)}, {formatDuration(r.duration)}</span>
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (window.confirm(`Delete the routine "${r.title}"? Its future copies go too.`)) save(api.deleteRoutine(r.id));
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {routines.length === 0 && <p className="hint">No routines yet. Add work, meals and habits below.</p>}
      <RoutineForm onAdd={(routine) => save(api.createRoutine(routine))} />
    </div>
  );
}

function RoutineForm({ onAdd }: { onAdd: (routine: NewRoutine) => void }) {
  const [kind, setKind] = useState<Kind>('event');
  const [title, setTitle] = useState('');
  const [days, setDays] = useState([true, true, true, true, true, false, false]);
  const [at, setAt] = useState('08:00');
  const [duration, setDuration] = useState(60);

  return (
    <form
      className="quick-add routine-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || !days.some(Boolean)) return;
        onAdd({ kind, title: title.trim(), days: daysPattern(days), at, duration });
        setTitle('');
      }}
    >
      <h2>New routine</h2>
      <fieldset className="chips">
        <legend>Kind</legend>
        {(['event', 'task'] as const).map((k) => (
          <button key={k} type="button" className={k === kind ? 'chip on' : 'chip'} aria-pressed={k === kind} onClick={() => setKind(k)}>
            {k === 'event' ? '○ Event' : '• Task'}
          </button>
        ))}
      </fieldset>
      <p className="hint">Events have no checkbox, like work or dinner. Tasks can be ticked, like a daily habit.</p>
      <label htmlFor="routine-title">Title</label>
      <input id="routine-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Work" autoComplete="off" required />
      <fieldset className="chips">
        <legend>Days</legend>
        {[...DAY_LETTERS].map((letter, i) => (
          <button
            key={DAY_NAMES[i]}
            type="button"
            className={days[i] ? 'chip on' : 'chip'}
            aria-pressed={days[i]}
            aria-label={DAY_NAMES[i]}
            onClick={() => setDays(days.map((on, j) => (j === i ? !on : on)))}
          >
            {letter}
          </button>
        ))}
      </fieldset>
      <div className="row2">
        <div>
          <label htmlFor="routine-at">Time</label>
          <input id="routine-at" type="time" value={at} onChange={(e) => setAt(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="routine-duration">Minutes</label>
          <input id="routine-duration" type="number" min={5} max={1440} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} required />
        </div>
      </div>
      <button type="submit" className="btn primary">Add routine</button>
    </form>
  );
}
```

- [ ] **Step 7: Wire it in (patch)**

This adds the `NewRoutine` type, the three API calls, the Routines button on the week page, the `/routines` path, and the page styles.

```diff
diff --git a/src/shared/types.ts b/src/shared/types.ts
index da67b10..e91763f 100644
--- a/src/shared/types.ts
+++ b/src/shared/types.ts
@@ -38,4 +38,6 @@ export type NewEntry = {
   duration: number;
 };
 
+export type NewRoutine = Omit<Routine, 'id'>;
+
 export type EntryChanges = Partial<Pick<Entry, 'title' | 'notes' | 'start' | 'duration' | 'status'>>;
diff --git a/src/web/App.tsx b/src/web/App.tsx
index 1196014..cf35ae2 100644
--- a/src/web/App.tsx
+++ b/src/web/App.tsx
@@ -1,6 +1,13 @@
 import { useState } from 'react';
+import type { ComponentType } from 'react';
 import { getToken, setToken } from './api.ts';
 import { Planner } from './Planner.tsx';
+import { RoutinesPage } from './RoutinesPage.tsx';
+
+/** One page per path. Pages link with plain <a href> loads, so no router library is needed. */
+const PAGES: Record<string, ComponentType<{ onAuthError: () => void }>> = {
+  '/routines': RoutinesPage,
+};
 
 export function App() {
   const [hasToken, setHasToken] = useState(() => Boolean(getToken()));
@@ -14,7 +21,8 @@ export function App() {
       />
     );
   }
-  return <Planner onAuthError={() => setHasToken(false)} />;
+  const Page = PAGES[window.location.pathname] ?? Planner;
+  return <Page onAuthError={() => setHasToken(false)} />;
 }
 
 function TokenScreen({ onSave }: { onSave: (token: string) => void }) {
diff --git a/src/web/Planner.tsx b/src/web/Planner.tsx
index 8be6226..ebbe0ee 100644
--- a/src/web/Planner.tsx
+++ b/src/web/Planner.tsx
@@ -146,6 +146,7 @@ export function Planner({ onAuthError }: { onAuthError: () => void }) {
           <button type="button" className="btn" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}>←</button>
           <button type="button" className="btn" onClick={() => setMonday(mondayOf(browserNow()))}>Today</button>
           <button type="button" className="btn" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}>→</button>
+          <a className="btn" href="/routines">Routines</a>
         </nav>
       </header>
       {message && (
diff --git a/src/web/api.ts b/src/web/api.ts
index 3c863db..34decda 100644
--- a/src/web/api.ts
+++ b/src/web/api.ts
@@ -1,4 +1,4 @@
-import type { Entry, EntryChanges, NewEntry, WeekView } from '../shared/types.ts';
+import type { Entry, EntryChanges, NewEntry, NewRoutine, Routine, WeekView } from '../shared/types.ts';
 
 const TOKEN_KEY = 'my-week-token';
 
@@ -39,4 +39,7 @@ export const api = {
   createEntry: (entry: NewEntry) => request<Entry>('POST', '/api/entries', entry),
   updateEntry: (id: number, changes: EntryChanges) => request<Entry>('PATCH', `/api/entries/${id}`, changes),
   deleteEntry: (id: number) => request<void>('DELETE', `/api/entries/${id}`),
+  routines: () => request<Routine[]>('GET', '/api/routines'),
+  createRoutine: (routine: NewRoutine) => request<Routine>('POST', '/api/routines', routine),
+  deleteRoutine: (id: number) => request<void>('DELETE', `/api/routines/${id}`),
 };
diff --git a/src/web/styles.css b/src/web/styles.css
index 96dbdff..5170f42 100644
--- a/src/web/styles.css
+++ b/src/web/styles.css
@@ -116,3 +116,12 @@ label { font-size: 12px; font-weight: 600; }
 .token-screen { min-height: 100dvh; display: grid; place-items: center; }
 .token-screen form { width: min(360px, calc(100vw - 32px)); border: 1px solid var(--ink); border-radius: var(--radius); background: var(--paper); }
 .token-screen h1 { margin: 0 0 8px; font-size: 20px; }
+
+/* Routines page */
+a.btn { display: inline-flex; align-items: center; color: inherit; text-decoration: none; }
+fieldset { margin: 0; padding: 0; border: 0; }
+legend { width: 100%; margin-bottom: 6px; font-size: 12px; font-weight: 600; }
+.page { max-width: 640px; margin: 0 auto; padding: 16px 24px 40px; display: flex; flex-direction: column; gap: 16px; }
+.routine-row { align-items: center; cursor: default; }
+.routine-form h2 { margin: 0; font-size: 15px; }
+.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
```

- [ ] **Step 8: Run every check**

Run: `npm run typecheck && npm test && npm run build`
Expected: no output from `tsc`, `# pass 35`, and `✓ built`.

- [ ] **Step 9: Commit**

```bash
git add src/web/routines.ts src/web/routines.test.ts src/web/page.tsx src/web/RoutinesPage.tsx src/shared/types.ts src/web/api.ts src/web/Planner.tsx src/web/App.tsx src/web/styles.css
git commit -m "Add the routines page"
```

---

### Task 4: Phone pages

**Files:**
- Create: `src/web/today.ts`, `src/web/today.test.ts`, `src/web/MoveForm.tsx`, `src/web/Today.tsx`, `src/web/PhoneInbox.tsx`, `src/web/public/apple-touch-icon.png` (generated, Step 7)
- Modify: `src/shared/time.ts`, `src/shared/time.test.ts`, `src/web/InboxPanel.tsx`, `src/web/App.tsx`, `src/web/index.html`, `src/web/styles.css` (patches)

**Interfaces:**
- Consumes: `page.tsx` and the `PAGES` map from Task 3, `api.week`, `api.updateEntry`, `api.createEntry` and `api.deleteEntry`, and `todayView`'s input, `WeekView.entries`.
- Produces:
  - `todayView(entries: Entry[], now: string): { now, next, later }` and `until(from: string, to: string): string` in `today.ts`.
  - `formatDate(dateOrTime): string` in `time.ts`, which formats `'2026-11-25T14:10'` as `'Wed 25 Nov'`.
  - `QuickAdd` exported from `InboxPanel.tsx`, with an optional `durations` prop.
  - The `/today` and `/inbox` paths.

- [ ] **Step 1: Write the failing test `src/web/today.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayView, until } from './today.ts';
import type { Entry } from '../shared/types.ts';

const at = (id: number, start: string, duration: number, over: Partial<Entry> = {}): Entry => ({
  id, kind: 'event', title: `Entry ${id}`, notes: null, start, duration,
  status: 'open', migrations: 0, routine_id: null, created_by: 'me', ...over,
});

const wednesday = [
  at(1, '2026-11-25T08:00', 540), // work
  at(2, '2026-11-25T15:30', 45), // dentist, during work
  at(3, '2026-11-25T17:00', 30), // commute
  at(4, '2026-11-25T19:30', 60, { kind: 'task' }),
  at(5, '2026-11-26T08:00', 540), // Thursday's work
];

test('now is the latest-started entry still running; next and later follow', () => {
  const view = todayView(wednesday, '2026-11-25T15:40');
  assert.equal(view.now?.id, 2);
  assert.equal(view.next?.id, 3);
  assert.deepEqual(view.later.map((e) => e.id), [4]);
});

test('with nothing left today, next is the first entry tomorrow', () => {
  const view = todayView(wednesday, '2026-11-25T21:00');
  assert.equal(view.now, null);
  assert.equal(view.next?.id, 5);
  assert.deepEqual(view.later, []);
});

test('ticked and cancelled entries are never now, next or later', () => {
  const view = todayView([
    at(1, '2026-11-25T14:00', 60, { kind: 'task', status: 'done' }),
    at(2, '2026-11-25T16:00', 30, { status: 'cancelled' }),
    at(3, '2026-11-25T17:00', 30),
  ], '2026-11-25T14:10');
  assert.equal(view.now, null);
  assert.equal(view.next?.id, 3);
  assert.deepEqual(view.later, []);
});

test('until counts the minutes between two times', () => {
  assert.equal(until('2026-11-25T14:10', '2026-11-25T17:00'), '2h 50m');
  assert.equal(until('2026-11-25T23:50', '2026-11-26T00:05'), '15m');
  assert.equal(until('2026-11-25T14:10', '2026-11-25T14:10'), '0m');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test src/web/today.test.ts`
Expected: FAIL with `Cannot find module '.../src/web/today.ts'`.

- [ ] **Step 3: Write `src/web/today.ts`, then run the test**

```ts
import { addMinutes, formatDuration } from '../shared/time.ts';
import type { Entry } from '../shared/types.ts';

export type TodayView = { now: Entry | null; next: Entry | null; later: Entry[] };

/**
 * Splits scheduled entries around a wall-clock time:
 * `now` is the latest-started entry still running (the dentist, not the work block around it),
 * `next` is the first entry after now, tomorrow if nothing is left today,
 * and `later` is the rest of today. Ticked and cancelled entries are left out.
 */
export function todayView(entries: Entry[], now: string): TodayView {
  const open = entries
    .filter((e) => e.start !== null && e.status === 'open')
    .sort((a, b) => a.start!.localeCompare(b.start!));
  const running = open.filter((e) => e.start! <= now && addMinutes(e.start!, e.duration) > now);
  const upcoming = open.filter((e) => e.start! > now);
  return {
    now: running.at(-1) ?? null,
    next: upcoming[0] ?? null,
    later: upcoming.slice(1).filter((e) => e.start!.slice(0, 10) === now.slice(0, 10)),
  };
}

/** The time from one wall-clock time to another, like '2h 50m'. */
export function until(from: string, to: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 60_000));
  return formatDuration(minutes) || '0m';
}
```

Run: `node --test src/web/today.test.ts`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 4: Add a failing `formatDate` check to the time tests (patch), and watch it fail**

```diff
diff --git a/src/shared/time.test.ts b/src/shared/time.test.ts
index ad23739..869940b 100644
--- a/src/shared/time.test.ts
+++ b/src/shared/time.test.ts
@@ -1,6 +1,6 @@
 import { test } from 'node:test';
 import assert from 'node:assert/strict';
-import { addMinutes, formatDuration, formatTime, isMonday, isoWeek, localNow, mondayOf, weekLabel } from './time.ts';
+import { addMinutes, formatDate, formatDuration, formatTime, isMonday, isoWeek, localNow, mondayOf, weekLabel } from './time.ts';
 
 test('mondayOf finds the Monday, also across months and years', () => {
   assert.equal(mondayOf('2026-11-25T14:10'), '2026-11-23');
@@ -31,4 +31,5 @@ test('time math and labels', () => {
   assert.equal(formatTime('2026-11-25T19:30'), '7:30 pm');
   assert.equal(formatTime('00:15'), '12:15 am');
   assert.equal(formatDuration(90), '1h 30m');
+  assert.equal(formatDate('2026-11-25T14:10'), 'Wed 25 Nov');
 });
```

Run: `node --test src/shared/time.test.ts`
Expected: FAIL with `does not provide an export named 'formatDate'`.

- [ ] **Step 5: Add `formatDate` (patch), then run the time tests**

```diff
diff --git a/src/shared/time.ts b/src/shared/time.ts
index e9bb7be..da0d96d 100644
--- a/src/shared/time.ts
+++ b/src/shared/time.ts
@@ -77,6 +77,11 @@ export function formatDay(dateOrTime: string): string {
   return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(utc(dateOrTime));
 }
 
+/** '2026-11-25T14:10' becomes 'Wed 25 Nov'. */
+export function formatDate(dateOrTime: string): string {
+  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(dateOrTime));
+}
+
 /** '2026-11-23' becomes '23 to 29 Nov 2026'. */
 export function weekLabel(monday: string): string {
   const sunday = addDays(monday, 6);
```

Run: `node --test src/shared/time.test.ts`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 6: Write `src/web/MoveForm.tsx`, `src/web/Today.tsx` and `src/web/PhoneInbox.tsx`**

`src/web/MoveForm.tsx`:

```tsx
import { useState } from 'react';
import type { Entry } from '../shared/types.ts';

/** Moves an entry with the phone's own date and time picker. Its value has the app's time format already. */
export function MoveForm({ entry, onSave, onCancel }: { entry: Entry; onSave: (start: string) => void; onCancel: () => void }) {
  const [start, setStart] = useState(entry.start ?? '');
  return (
    <form
      className="move"
      onSubmit={(e) => {
        e.preventDefault();
        if (start) onSave(start.slice(0, 16));
      }}
    >
      <label htmlFor={`move-${entry.id}`}>Move "{entry.title}" to</label>
      <input id={`move-${entry.id}`} type="datetime-local" step={900} value={start} onChange={(e) => setStart(e.target.value)} required />
      <div className="actions end">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary">Move</button>
      </div>
    </form>
  );
}
```

`src/web/Today.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { Entry, WeekView } from '../shared/types.ts';
import { addDays, addMinutes, formatDate, formatTime, mondayOf } from '../shared/time.ts';
import { api } from './api.ts';
import { todayView, until } from './today.ts';
import { MoveForm } from './MoveForm.tsx';
import { QuickAdd } from './InboxPanel.tsx';
import { ErrorBanner, browserNow, useErrors } from './page.tsx';

type Save = (change: Promise<unknown>) => Promise<void>;

/** The phone's home screen: now, next, the rest of today, and a quick way to add to the inbox. */
export function Today({ onAuthError }: { onAuthError: () => void }) {
  const [weeks, setWeeks] = useState<WeekView[]>([]);
  const [now, setNow] = useState(browserNow);
  const [moving, setMoving] = useState<number | null>(null);
  const { message, fail, clear } = useErrors(onAuthError);

  const load = useCallback(() => {
    const current = browserNow();
    setNow(current);
    const monday = mondayOf(current);
    // On Sundays the next entry is usually Monday's, which lives in next week.
    const mondays = addDays(monday, 6) === current.slice(0, 10) ? [monday, addDays(monday, 7)] : [monday];
    return Promise.all(mondays.map((m) => api.week(m))).then(setWeeks, fail);
  }, [fail]);

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(browserNow()), 60_000);
    const onShow = () => {
      if (document.visibilityState === 'visible') load(); // the app comes back to the front
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load]);

  const save: Save = async (change) => {
    try {
      await change;
      setMoving(null);
    } catch (err) {
      fail(err);
    }
    await load();
  };

  const view = todayView(weeks.flatMap((w) => w.entries), now);
  const line = (entry: Entry, big = false) => (
    <Line
      key={entry.id}
      entry={entry}
      big={big}
      moving={moving === entry.id}
      onMove={(on) => setMoving(on ? entry.id : null)}
      save={save}
    />
  );

  return (
    <main className="phone">
      <header className="phone-top">
        <h1>{formatDate(now)}</h1>
        <span className="mono muted">{formatTime(now)}</span>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />
      <section>
        <h2 className="sh">Now {view.now && <span>ends in {until(now, addMinutes(view.now.start!, view.now.duration))}</span>}</h2>
        {view.now ? <ul className="rows">{line(view.now, true)}</ul> : <p className="hint">Nothing planned right now.</p>}
      </section>
      <section>
        <h2 className="sh">Next {view.next && <span>in {until(now, view.next.start!)}</span>}</h2>
        {view.next ? <ul className="rows">{line(view.next)}</ul> : <p className="hint">Nothing else planned this week.</p>}
      </section>
      {view.later.length > 0 && (
        <section>
          <h2 className="sh">Later today</h2>
          <ul className="rows">{view.later.map((e) => line(e))}</ul>
        </section>
      )}
      <div className="phone-links">
        <a className="btn" href="/inbox">Inbox ({weeks[0]?.inbox.length ?? 0})</a>
        <a className="btn" href="/inbox">Unfinished ({weeks[0]?.unfinished.length ?? 0})</a>
      </div>
      <QuickAdd durations={[15, 30, 60]} onAdd={(title, duration) => save(api.createEntry({ kind: 'task', title, duration }))} />
    </main>
  );
}

type LineProps = { entry: Entry; big: boolean; moving: boolean; onMove: (on: boolean) => void; save: Save };

/** One entry: time, tick button (tasks), title (tap to move), migration count and To inbox (tasks). */
function Line({ entry, big, moving, onMove, save }: LineProps) {
  const isTask = entry.kind === 'task';
  return (
    <li className={big ? 'line big' : 'line'}>
      <div className="line-main">
        <span className="time mono">{formatTime(entry.start!)}</span>
        {isTask ? (
          <button type="button" className="tick" aria-label={`Tick ${entry.title}`} onClick={() => save(api.updateEntry(entry.id, { status: 'done' }))}>•</button>
        ) : (
          <span className="ev" aria-hidden="true">○</span>
        )}
        <button type="button" className="line-title" aria-expanded={moving} onClick={() => onMove(!moving)}>{entry.title}</button>
        {entry.migrations > 0 && <span className="mig mono">&gt;{entry.migrations}</span>}
        {isTask && (
          <button type="button" className="mini" onClick={() => save(api.updateEntry(entry.id, { start: null }))}>To inbox</button>
        )}
      </div>
      {moving && <MoveForm entry={entry} onSave={(start) => save(api.updateEntry(entry.id, { start }))} onCancel={() => onMove(false)} />}
    </li>
  );
}
```

`src/web/PhoneInbox.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { Entry, WeekView } from '../shared/types.ts';
import { formatDay, formatDuration, formatTime, mondayOf } from '../shared/time.ts';
import { api } from './api.ts';
import { MoveForm } from './MoveForm.tsx';
import { ErrorBanner, browserNow, useErrors } from './page.tsx';

type Save = (change: Promise<unknown>) => Promise<void>;

/** The phone's inbox: unfinished tasks and inbox tasks, each with Move, Strike and Delete. */
export function PhoneInbox({ onAuthError }: { onAuthError: () => void }) {
  const [week, setWeek] = useState<WeekView | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const { message, fail, clear } = useErrors(onAuthError);

  const load = useCallback(() => api.week(mondayOf(browserNow())).then(setWeek, fail), [fail]);

  useEffect(() => {
    load();
    const onShow = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  const save: Save = async (change) => {
    try {
      await change;
      setMoving(null);
    } catch (err) {
      fail(err);
    }
    await load();
  };

  const unfinished = week?.unfinished ?? [];
  const inbox = week?.inbox ?? [];
  const line = (entry: Entry, isUnfinished: boolean) => (
    <InboxLine
      key={entry.id}
      entry={entry}
      unfinished={isUnfinished}
      moving={moving === entry.id}
      onMove={(on) => setMoving(on ? entry.id : null)}
      save={save}
    />
  );

  return (
    <main className="phone">
      <header className="phone-top">
        <h1>Inbox</h1>
        <a className="btn" href="/today">Today</a>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />
      {unfinished.length > 0 && (
        <section>
          <h2 className="sh">Unfinished <span>{unfinished.length}</span></h2>
          <ul className="rows">{unfinished.map((e) => line(e, true))}</ul>
        </section>
      )}
      <section>
        <h2 className="sh">Inbox <span>{inbox.length}</span></h2>
        {inbox.length === 0 && <p className="hint">Empty. Add tasks on the Today page.</p>}
        <ul className="rows">{inbox.map((e) => line(e, false))}</ul>
      </section>
    </main>
  );
}

type LineProps = { entry: Entry; unfinished: boolean; moving: boolean; onMove: (on: boolean) => void; save: Save };

function InboxLine({ entry, unfinished, moving, onMove, save }: LineProps) {
  const meta = unfinished && entry.start ? `was ${formatDay(entry.start)} ${formatTime(entry.start)}` : '';
  return (
    <li className="line">
      <div className="line-main">
        <span className={unfinished ? 'sig over' : 'sig'} aria-hidden="true">•</span>
        <span className="line-title">
          {entry.title}
          {meta && <span className="m">{meta}</span>}
        </span>
        <span className="r mono">{formatDuration(entry.duration)}</span>
      </div>
      <div className="actions">
        <button type="button" className="btn" aria-expanded={moving} onClick={() => onMove(!moving)}>Move</button>
        <button type="button" className="btn" onClick={() => save(api.updateEntry(entry.id, { status: 'cancelled' }))}>Strike</button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (window.confirm(`Delete "${entry.title}" for good?`)) save(api.deleteEntry(entry.id));
          }}
        >
          Delete
        </button>
      </div>
      {moving && <MoveForm entry={entry} onSave={(start) => save(api.updateEntry(entry.id, { start }))} onCancel={() => onMove(false)} />}
    </li>
  );
}
```

- [ ] **Step 7: Generate the home screen icon**

Save this script outside the repo, for example as `/tmp/make-icon.mjs`, and run `mkdir -p src/web/public && node /tmp/make-icon.mjs src/web/public/apple-touch-icon.png`.

```js
// Writes a 180x180 PNG for "Add to Home Screen": a paper-colored bullet on ink. No image library needed.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 180;
const INK = [0x1c, 0x1c, 0x1f];
const PAPER = [0xfb, 0xfb, 0xf9];
const rows = [];
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 3); // first byte 0 = no filter
  for (let x = 0; x < SIZE; x++) {
    const inBullet = Math.hypot(x - (SIZE - 1) / 2, y - (SIZE - 1) / 2) < 34;
    row.set(inBullet ? PAPER : INK, 1 + x * 3);
  }
  rows.push(row);
}
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // 8 bits per channel
header[9] = 2; // RGB
writeFileSync(process.argv[2], Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.concat(rows))),
  chunk('IEND', Buffer.alloc(0)),
]));
```

Expected: `src/web/public/apple-touch-icon.png` is a 773-byte 180 by 180 PNG showing a light dot on a dark square. Vite copies everything in `src/web/public` to the root of `dist`.

- [ ] **Step 8: Wire in the pages (patch)**

This exports `QuickAdd` with a `durations` prop, adds the `/today` and `/inbox` paths, adds the home screen tags and icon link, and adds the phone styles.

```diff
diff --git a/src/web/App.tsx b/src/web/App.tsx
index cf35ae2..7bb1373 100644
--- a/src/web/App.tsx
+++ b/src/web/App.tsx
@@ -3,10 +3,14 @@ import type { ComponentType } from 'react';
 import { getToken, setToken } from './api.ts';
 import { Planner } from './Planner.tsx';
 import { RoutinesPage } from './RoutinesPage.tsx';
+import { Today } from './Today.tsx';
+import { PhoneInbox } from './PhoneInbox.tsx';
 
 /** One page per path. Pages link with plain <a href> loads, so no router library is needed. */
 const PAGES: Record<string, ComponentType<{ onAuthError: () => void }>> = {
   '/routines': RoutinesPage,
+  '/today': Today,
+  '/inbox': PhoneInbox,
 };
 
 export function App() {
diff --git a/src/web/InboxPanel.tsx b/src/web/InboxPanel.tsx
index c2fa260..df0b97d 100644
--- a/src/web/InboxPanel.tsx
+++ b/src/web/InboxPanel.tsx
@@ -66,7 +66,7 @@ function Item({ entry, unfinished = false, onOpen }: { entry: Entry; unfinished?
   );
 }
 
-function QuickAdd({ onAdd }: { onAdd: (title: string, duration: number) => void }) {
+export function QuickAdd({ onAdd, durations = DURATIONS }: { onAdd: (title: string, duration: number) => void; durations?: number[] }) {
   const [title, setTitle] = useState('');
   const [duration, setDuration] = useState(30);
   return (
@@ -83,7 +83,7 @@ function QuickAdd({ onAdd }: { onAdd: (title: string, duration: number) => void
       <label htmlFor="new-task">New task</label>
       <input id="new-task" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix bike brakes" autoComplete="off" required />
       <div className="chips" role="group" aria-label="Duration">
-        {DURATIONS.map((d) => (
+        {durations.map((d) => (
           <button key={d} type="button" className={d === duration ? 'chip on' : 'chip'} aria-pressed={d === duration} onClick={() => setDuration(d)}>
             {formatDuration(d)}
           </button>
diff --git a/src/web/index.html b/src/web/index.html
index 0dda239..90b4205 100644
--- a/src/web/index.html
+++ b/src/web/index.html
@@ -3,6 +3,11 @@
   <head>
     <meta charset="utf-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1" />
+    <meta name="apple-mobile-web-app-capable" content="yes" />
+    <meta name="mobile-web-app-capable" content="yes" />
+    <meta name="apple-mobile-web-app-title" content="my-week" />
+    <meta name="theme-color" content="#F3F3F0" />
+    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
     <title>my-week</title>
   </head>
   <body>
diff --git a/src/web/styles.css b/src/web/styles.css
index 5170f42..2aa6ce6 100644
--- a/src/web/styles.css
+++ b/src/web/styles.css
@@ -125,3 +125,32 @@ legend { width: 100%; margin-bottom: 6px; font-size: 12px; font-weight: 600; }
 .routine-row { align-items: center; cursor: default; }
 .routine-form h2 { margin: 0; font-size: 15px; }
 .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
+
+/* Phone pages: 44px touch targets, and 16px inputs so iOS doesn't zoom in */
+.phone { max-width: 480px; margin: 0 auto; padding: 20px 16px 32px; display: flex; flex-direction: column; gap: 18px; }
+.phone-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
+.phone-top h1 { margin: 0; font-size: 20px; font-weight: 600; }
+.phone section { display: flex; flex-direction: column; gap: 6px; }
+.sh { margin: 0; display: flex; align-items: baseline; justify-content: space-between; font-size: 13px; font-weight: 600; }
+.sh span { font: 400 12px var(--mono); color: var(--muted); }
+.phone .btn, .phone .chip { height: 44px; }
+.phone input { height: 44px; font-size: 16px; }
+.phone-links { display: flex; gap: 8px; }
+.phone-links .btn { flex: 1; justify-content: center; border-color: var(--line); background: transparent; }
+.rows { list-style: none; margin: 0; padding: 0; }
+.line { padding: 2px 0; border-bottom: 1px solid var(--line); }
+.line:last-child { border-bottom: 0; }
+.line-main { display: flex; align-items: center; gap: 4px; min-height: 44px; }
+.line .time { width: 70px; flex: none; font-size: 12px; color: var(--muted); }
+.tick { width: 40px; height: 44px; flex: none; padding: 0; border: 0; background: none; font: 500 18px var(--mono); cursor: pointer; }
+.ev, .phone .sig { width: 40px; flex: none; text-align: center; font: 500 14px var(--mono); color: var(--muted); }
+.phone .sig.over { color: var(--over); }
+.line-title { flex: 1; min-width: 0; min-height: 44px; display: flex; flex-direction: column; justify-content: center; padding: 0; border: 0; background: none; text-align: left; font-size: 15px; font-weight: 500; cursor: pointer; }
+.line-title .m { font: 400 11px var(--mono); color: var(--over); }
+.line .mig, .line .r { font-size: 12px; color: var(--muted); }
+.mini { height: 32px; padding: 0 10px; border: 1px solid var(--ink); border-radius: var(--radius); background: var(--paper); color: var(--ink); font-size: 12px; font-weight: 500; cursor: pointer; }
+.line .actions { margin: 0 0 8px 44px; }
+.line.big { padding: 6px 10px; border: 1px solid var(--ink); border-radius: var(--radius); background: var(--ink); color: var(--paper); }
+.line.big .line-title { font-size: 22px; font-weight: 600; }
+.line.big .time, .line.big .ev, .line.big .mig { color: inherit; opacity: 0.75; }
+.move { display: flex; flex-direction: column; gap: 6px; padding: 8px 0 10px; }
```

- [ ] **Step 9: Run every check**

Run: `npm run typecheck && npm test && npm run build && ls dist`
Expected: no output from `tsc`, `# pass 39`, `✓ built`, and `apple-touch-icon.png` listed in `dist`.

- [ ] **Step 10: Smoke-test the new routes**

Run, in one terminal: `APP_TOKEN=app AGENT_TOKEN=agent FEED_TOKEN=feed TZ=UTC PORT=3919 npm start`

Run, in a second terminal:

```bash
for p in /today /inbox /routines /apple-touch-icon.png; do curl -s -o /dev/null -w "$p %{http_code} %{content_type}\n" http://localhost:3919$p; done
curl -s -X POST http://localhost:3919/api/routines -H 'Authorization: Bearer app' -H 'Content-Type: application/json' \
  -d '{"kind":"event","title":"Dinner, with family","days":"MTWTFSS","at":"18:30","duration":45}' > /dev/null
curl -s "http://localhost:3919/calendar.ics?token=feed" | grep SUMMARY
```

Expected: each path answers `200`, the HTML pages as `text/html` and the icon as `image/png`, and the feed shows `SUMMARY:○ Dinner\, with family`. Stop the server with Ctrl+C, then delete the test database with `rm -rf data`.

- [ ] **Step 11: Commit**

```bash
git add src/web/today.ts src/web/today.test.ts src/web/MoveForm.tsx src/web/Today.tsx src/web/PhoneInbox.tsx src/web/public/apple-touch-icon.png src/shared/time.ts src/shared/time.test.ts src/web/InboxPanel.tsx src/web/App.tsx src/web/index.html src/web/styles.css
git commit -m "Add the phone Today and Inbox pages with a home screen icon"
```

---

### Task 5: Deploy files and docs

**Files:**
- Modify: `Dockerfile`, `compose.example.yaml`, `package.json` (patch), `package-lock.json` (generated)
- Replace: `README.md`

**Interfaces:**
- Consumes: the `AGENT_TOKEN` and `FEED_TOKEN` environment variables from Tasks 1 and 2, and `docs/agent-api.md`, which `app.ts` reads at startup.
- Produces: an image tagged `0.2.0` that contains the agent guide, plus a compose example with all three tokens.

- [ ] **Step 1: Update the Dockerfile, the compose example and the version (patch)**

The Dockerfile has to copy `docs/agent-api.md`, because `app.ts` reads it at startup and the server won't start without it.

```diff
diff --git a/Dockerfile b/Dockerfile
index a36a531..b3a25a0 100644
--- a/Dockerfile
+++ b/Dockerfile
@@ -16,5 +16,6 @@ COPY --from=build /app/dist ./dist
 COPY src/server ./src/server
 COPY src/shared ./src/shared
 COPY migrations ./migrations
+COPY docs/agent-api.md ./docs/agent-api.md
 EXPOSE 3000
 CMD ["node", "src/server/index.ts"]
diff --git a/compose.example.yaml b/compose.example.yaml
index 3638ae7..03ec741 100644
--- a/compose.example.yaml
+++ b/compose.example.yaml
@@ -1,17 +1,19 @@
-# Dockge stack for my-week. Put APP_TOKEN in the stack's .env file.
+# Dockge stack for my-week. Put APP_TOKEN, AGENT_TOKEN and FEED_TOKEN in the stack's .env file.
 services:
   my-week:
-    image: my-week:0.1.0
+    image: my-week:0.2.0
     container_name: my-week
     restart: unless-stopped
     user: "568:568"             # TrueNAS apps user; must own the data folder
     environment:
       TZ: Etc/UTC               # replace with your zone, for example Europe/Berlin
       APP_TOKEN: ${APP_TOKEN}
+      AGENT_TOKEN: ${AGENT_TOKEN}     # leave unset to keep the agent out
+      FEED_TOKEN: ${FEED_TOKEN}       # leave unset to turn the calendar feed off
     volumes:
       - /mnt/tank/apps/my-week:/data   # your TrueNAS dataset
     networks:
       - apps
 networks:
   apps:
-    external: true              # shared with Nginx Proxy Manager (and the planner agent in milestone 2)
+    external: true              # shared with Nginx Proxy Manager and the planner agent
diff --git a/package.json b/package.json
index 4d29783..1740a59 100644
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "my-week",
-  "version": "0.1.0",
+  "version": "0.2.0",
   "private": true,
   "type": "module",
   "engines": {
```

- [ ] **Step 2: Bump the lockfile's version without touching node_modules**

Run: `npm install --package-lock-only && git diff --stat package-lock.json`
Expected: `package-lock.json | 4 ++--`. Only the two `"version"` lines change.

- [ ] **Step 3: Replace `README.md`**

````markdown
# my-week

A self-hosted week planner. Every Sunday you drag tasks from an inbox onto a Monday to Sunday grid. The design is in `docs/superpowers/specs/2026-11-18-week-planner-design.md`.

## Develop

Needs Node 22.18 or newer.

```sh
npm install
npm test                                 # server, time and page-logic tests
npm run typecheck
APP_TOKEN=dev npm run dev:server         # API on http://localhost:3000
npm run dev:web                          # UI on http://localhost:5173, sends /api to port 3000
```

## Deploy on TrueNAS with Dockge

1. Build the image on the server, and tag the same commit in git:
   ```sh
   docker build -t my-week:0.2.0 .
   git tag v0.2.0
   ```
2. Create a dataset for the data, for example `/mnt/tank/apps/my-week`, owned by user and group 568.
3. In Dockge, create a stack from `compose.example.yaml` and set `TZ`. Put three different tokens in the stack's `.env`, each made with `openssl rand -hex 32`:
   ```sh
   APP_TOKEN=...      # you, in the browser and on the phone
   AGENT_TOKEN=...    # the planner agent
   FEED_TOKEN=...     # the calendar feed
   ```
4. In Nginx Proxy Manager, add a proxy host for your subdomain that points at `http://my-week:3000`, with a Let's Encrypt certificate.
5. Open the subdomain and paste your `APP_TOKEN`.

To upgrade, take a snapshot of the dataset, build a new tag, change the tag in Dockge, and redeploy. Copying `/data` by hand while the app runs can catch a half-written file, so stop the container first if you copy by hand.

## Routines

Open `/routines` (the Routines button on the week page) to add and delete routines. `days` is seven letters from Monday to Sunday, with a dot for days off: `MTWTF..` means weekdays.

You can also use curl:

```sh
TOKEN=...                                # your APP_TOKEN
URL=https://my-week.example.com          # your subdomain

curl -s -X POST "$URL/api/routines" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"kind":"event","title":"Work","days":"MTWTF..","at":"08:00","duration":540}'
curl -s "$URL/api/routines" -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE "$URL/api/routines/<id>" -H "Authorization: Bearer $TOKEN"
```

## iPhone

1. In Safari, open `https://<subdomain>/today` and paste your `APP_TOKEN`. Then tap Share and Add to Home Screen. The page opens like an app, and keeps its own copy of the token.
2. Subscribe to the calendar on the iPhone itself: Settings, Apps, Calendar, Calendar Accounts, Add Account, Other, Add Subscribed Calendar. Enter `https://<subdomain>/calendar.ics?token=<FEED_TOKEN>`. Don't add it through iCloud on a Mac, because Apple's servers would fetch it and they can't reach a Tailscale-only address.
3. In the Tailscale app, turn on VPN On Demand, so the phone can reach the feed whenever iOS refreshes it.
4. Add Calendar's Up Next widget to the home screen.

iOS decides when to refresh a subscribed calendar, so the widget can be up to an hour behind. The Today page is always current.

## Planner agent

1. Put the agent's container on the same Docker network as my-week (`apps` in the compose example).
2. Add `MY_WEEK_TOKEN=<your AGENT_TOKEN>` to the agent's environment.
3. Add this to the agent's CLAUDE.md:
   ```md
   ## Week planner
   Before using the week planner, read its guide:
   curl -s -H "Authorization: Bearer $MY_WEEK_TOKEN" http://my-week:3000/api/guide
   ```

The agent token can read weeks and routines and add tasks to the inbox. Everything else gets a `403`. The guide it reads is `docs/agent-api.md`.
````

- [ ] **Step 4: Run every check**

Run: `npm run typecheck && npm test && npm run build`
Expected: no output from `tsc`, `# pass 39`, and `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile compose.example.yaml package.json package-lock.json README.md
git commit -m "Ship the agent guide in the image, add the new tokens to the compose example, document phone and agent setup"
```

---

### Task 6: Deploy and check on your devices (you)

- [ ] **Step 1: Deploy 0.2.0.** On the server, build with `docker build -t my-week:0.2.0 .` and tag `git tag v0.2.0`. Add `AGENT_TOKEN` and `FEED_TOKEN` (each from `openssl rand -hex 32`) to the stack's `.env`, change the image tag in Dockge, and redeploy.
- [ ] **Step 2: Check the routines page.** On the PC, open Routines from the week page. Add a routine, check that the week shows its copies from today onward, then delete it.
- [ ] **Step 3: Set up the phone.** Follow the README's iPhone section: add `/today` to the home screen, subscribe to the feed on the phone itself, turn on Tailscale's VPN On Demand, and add the Up Next widget.
- [ ] **Step 4: Check the phone pages.**
  1. Today shows Now and Next with the right "ends in" and "in" times.
  2. Tick a task. Tap a task's title and move it with the picker.
  3. Send a task to the inbox, and add a task with quick add.
  4. On the Inbox page, move, strike and delete a task.
- [ ] **Step 5: Set up the agent.** Follow the README's planner agent section. Ask the agent to read this week and add one task to your inbox. The task appears in the inbox marked "added by planner agent".
