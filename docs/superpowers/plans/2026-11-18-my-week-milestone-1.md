# my-week milestone 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A desktop week planner you can use on Sunday 22 November 2026. It has an inbox, an unfinished list, a draggable Monday to Sunday grid with routine copies, and token auth, running as one Docker container on TrueNAS.

**Architecture:** A Hono server on Node keeps everything in one SQLite file through the built-in `node:sqlite`. It serves a JSON API under `/api` and the built React app for every other path. The React app uses FullCalendar's week view for the grid and FullCalendar's `Draggable` for the inbox panel. All dates are wall-clock strings, so no time zone math happens in the database.

**Tech Stack:** Node 24 (22.18 or newer for local development), Hono 4, `node:sqlite`, React 19, FullCalendar 6, Vite 8, TypeScript 5.9 (type checking only), and `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-week-planner-design.md`

**Verified before writing:** On 2026-11-18, all code below ran in a scratch copy on Node 22.23.4. All 16 tests passed, `tsc` passed, `vite build` passed, and a curl smoke test against the running server passed. Nobody has opened the UI in a browser yet, so Task 5 ends with a manual check.

## Global constraints

- Node 22.18 or newer runs the TypeScript server directly, with no build step. The Docker image uses `node:24`, pinned to an exact version in Task 6.
- Dependencies use exact versions. Runtime: `hono@4.13.19` and `@hono/node-server@2.1.9`. Development: `react@19.3.1`, `react-dom@19.3.1`, `@fullcalendar/core@6.1.22`, `@fullcalendar/react@6.1.22`, `@fullcalendar/timegrid@6.1.22`, `@fullcalendar/interaction@6.1.22`, `vite@8.3.8`, `@vitejs/plugin-react@6.3.0`, `typescript@5.9.3`, `@types/node@24.19.2`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`. Add no other packages.
- TypeScript must be erasable. That means no `enum`, no `namespace`, and no constructor parameter properties. Relative imports end in `.ts` or `.tsx`, and type-only imports use `import type`.
- Times are `'YYYY-MM-DDTHH:MM'` wall-clock strings in the `TZ` time zone, and dates are `'YYYY-MM-DD'`. End times are never stored.
- SQL column names come only from the allowlists in `src/server/week.ts`, never straight from a request.
- The UI shows times in 12-hour format through `USE_12_HOUR` in `src/shared/time.ts`.
- The UI uses direction A's color tokens from the spec, light mode only, a 3px radius, and self-hosted Geist and Geist Mono. UI text has no em dashes.
- Data lives in `DATA_DIR` (`./data` locally, `/data` in Docker). The server listens on `PORT` (default 3000) and refuses to start without `APP_TOKEN`.
- Milestone 1 only. The calendar feed, agent token, agent guide, phone pages and routines page come in milestone 2.

## Deviations from the spec, on purpose

- The grid uses FullCalendar's `drop` callback with `create: false` instead of `eventReceive`. FullCalendar then never adds a temporary event that would need removing after the reload.
- The block actions open in the browser's own `<dialog>`, not a custom popover. Escape, focus handling and the backdrop come with it.
- A new event's title comes from `window.prompt`.
- Entry functions live in `src/server/week.ts` next to the week and routine rules. Shared types live in `src/shared/types.ts`.
- `db.test.ts` and `time.test.ts` add checks for the upgrade runner's rollback and for the date math. `api.test.ts` covers `APP_TOKEN`. The agent token's tests come with the agent in milestone 2.

## Review focus

These are the inputs most likely to bite that the happy path never touches. Each one has a test in the task that owns the code.

1. **Fields a client must not set.** Sending `id`, `migrations`, `routine_id`, `created_by` or an unknown key gets a `400` that names the field. Tested in Task 3 (`migration.test.ts`).
2. **Wrong value types.** A boolean, an object, or text in a number column gets a `400`, never a `500`. Tested in Task 3.
3. **Impossible changes.** Sending an event to the inbox or ticking an event gets a `400` with SQLite's constraint text. Tested in Task 3.
4. **Week dates that aren't Mondays or aren't real dates.** `2026-11-24`, `2026-02-30` and `abc` all get a `400`. Tested in Task 2 (`isMonday`) and Task 4 (`api.test.ts`).
5. **Malformed requests.** Invalid JSON, an array or an empty object as the body, an unknown id, and an unknown route each get a JSON `400` or `404`. Tested in Task 4.

---

### Task 1: Project setup and database

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `migrations/001_init.sql`, `src/server/db.ts`
- Test: `src/server/db.test.ts`
- Generated: `package-lock.json`

**Interfaces:**
- Produces: `type DB` (a `DatabaseSync`), `openDb(file: string, migrationsDir?: string): DB`, `migrate(db: DB, dir: string): void`, `transaction<T>(db: DB, fn: () => T): T`, `all<T>(db, sql, params?): T[]`, `one<T>(db, sql, params?): T | undefined`, and `run(db, sql, params?): number`, which returns the number of changed rows. `params` is either an array for `?` placeholders or an object for `:name` placeholders.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "my-week",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.18"
  },
  "scripts": {
    "dev:server": "node --watch src/server/index.ts",
    "dev:web": "vite",
    "build": "vite build",
    "start": "node src/server/index.ts",
    "test": "node --test \"src/**/*.test.ts\"",
    "typecheck": "tsc"
  },
  "dependencies": {
    "@hono/node-server": "2.1.9",
    "hono": "4.13.19"
  },
  "devDependencies": {
    "@fullcalendar/core": "6.1.22",
    "@fullcalendar/interaction": "6.1.22",
    "@fullcalendar/react": "6.1.22",
    "@fullcalendar/timegrid": "6.1.22",
    "@types/node": "24.19.2",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.3.0",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "typescript": "5.9.3",
    "vite": "8.3.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json` and `.gitignore`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2023", "dom", "dom.iterable"],
    "types": ["node"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`.gitignore`:

```
node_modules/
dist/
data/
```

- [ ] **Step 3: Install**

Run: `npm install`
Expected: it finishes without errors and creates `package-lock.json`.

- [ ] **Step 4: Create `migrations/001_init.sql`**

```sql
CREATE TABLE routines (
  id        INTEGER PRIMARY KEY,
  kind      TEXT NOT NULL CHECK (kind IN ('task', 'event')),
  title     TEXT NOT NULL CHECK (title <> ''),
  days      TEXT NOT NULL CHECK (days GLOB '[M.][T.][W.][T.][F.][S.][S.]' AND days <> '.......'),
  at        TEXT NOT NULL CHECK (at GLOB '[0-9][0-9]:[0-9][0-9]' AND time(at) IS NOT NULL),
  duration  INTEGER NOT NULL CHECK (duration BETWEEN 5 AND 1440)
) STRICT;

CREATE TABLE entries (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('task', 'event')),
  title       TEXT NOT NULL CHECK (title <> ''),
  notes       TEXT,
  start       TEXT CHECK (start IS NULL OR (start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]' AND datetime(start) IS NOT NULL)),
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

- [ ] **Step 5: Write the failing test `src/server/db.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { all, migrate, one, openDb } from './db.ts';
import type { DB } from './db.ts';

const version = (db: DB) => one<{ user_version: number }>(db, 'PRAGMA user_version')!.user_version;

test('schema upgrades run once and record the version', () => {
  const db = openDb(':memory:');
  assert.equal(version(db), 1);
  migrate(db, join(import.meta.dirname, '../../migrations')); // would throw "table already exists" if it ran again
  assert.equal(version(db), 1);
});

test('a failing upgrade rolls back every step', () => {
  const dir = mkdtempSync(join(tmpdir(), 'my-week-migrations-'));
  writeFileSync(join(dir, '001_good.sql'), 'CREATE TABLE a (x INTEGER);');
  writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE b (x INTEGER); THIS IS NOT SQL;');
  const db = new DatabaseSync(':memory:');
  assert.throws(() => migrate(db, dir));
  assert.equal(version(db), 0);
  assert.deepEqual(all(db, "SELECT name FROM sqlite_master WHERE type = 'table'"), []);
});
```

- [ ] **Step 6: Run the test and watch it fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/server/db.ts'`.

- [ ] **Step 7: Write `src/server/db.ts`**

```ts
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type DB = DatabaseSync;
type Params = SQLInputValue[] | Record<string, SQLInputValue>;

const MIGRATIONS_DIR = join(import.meta.dirname, '../../migrations');

/** Opens (or creates) the database file and brings its schema up to date. */
export function openDb(file: string, migrationsDir = MIGRATIONS_DIR): DB {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db, migrationsDir);
  return db;
}

/** Runs every migrations/NNN_*.sql file numbered above PRAGMA user_version, all in one transaction. */
export function migrate(db: DB, dir: string): void {
  const current = one<{ user_version: number }>(db, 'PRAGMA user_version')!.user_version;
  const pending = readdirSync(dir)
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .sort()
    .filter((file) => Number(file.slice(0, 3)) > current);
  if (pending.length === 0) return;
  transaction(db, () => {
    for (const file of pending) db.exec(readFileSync(join(dir, file), 'utf8'));
    db.exec(`PRAGMA user_version = ${Number(pending.at(-1)!.slice(0, 3))}`);
  });
}

/** Runs fn inside BEGIN/COMMIT, and rolls everything back if it throws. */
export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function all<T>(db: DB, sql: string, params: Params = []): T[] {
  const stmt = db.prepare(sql);
  return (Array.isArray(params) ? stmt.all(...params) : stmt.all(params)) as unknown as T[];
}

export function one<T>(db: DB, sql: string, params: Params = []): T | undefined {
  const stmt = db.prepare(sql);
  return (Array.isArray(params) ? stmt.get(...params) : stmt.get(params)) as unknown as T | undefined;
}

/** Runs a write and returns how many rows it changed. */
export function run(db: DB, sql: string, params: Params = []): number {
  const stmt = db.prepare(sql);
  return Number((Array.isArray(params) ? stmt.run(...params) : stmt.run(params)).changes);
}
```

- [ ] **Step 8: Run the tests and the type check**

Run: `npm test && npm run typecheck`
Expected: `# pass 2`, `# fail 0`, and no output from `tsc`. One `ExperimentalWarning: SQLite is an experimental feature` line is normal.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore migrations src/server/db.ts src/server/db.test.ts
git commit -m "Set up project and SQLite schema with upgrade runner"
```

---

### Task 2: Shared types and time helpers

**Files:**
- Create: `src/shared/types.ts`, `src/shared/time.ts`
- Test: `src/shared/time.test.ts`

**Interfaces:**
- Produces, from `types.ts`: `Kind`, `Status`, `Entry`, `Routine`, `WeekView { monday, entries, inbox, unfinished }`, `NewEntry`, `EntryChanges`.
- Produces, from `time.ts`: `USE_12_HOUR`, `localNow(timeZone, now?)`, `addDays(date, days)`, `addMinutes(time, minutes)`, `mondayOf(dateOrTime)`, `isMonday(date)`, `fromDate(d: Date)`, `minutesBetween(from: Date, to: Date)`, `formatTime(time)`, `formatDuration(minutes)`, `formatDay(dateOrTime)`, `weekLabel(monday)`, `isoWeek(monday)`. All of them take and return strings in the formats from the global constraints, except `minutesBetween` and `isoWeek`, which return numbers.

- [ ] **Step 1: Write `src/shared/types.ts`**

```ts
export type Kind = 'task' | 'event';
export type Status = 'open' | 'done' | 'cancelled';

export type Entry = {
  id: number;
  kind: Kind;
  title: string;
  notes: string | null;
  start: string | null; // '2026-11-23T09:00', null while the task is in the inbox
  duration: number; // minutes
  status: Status;
  migrations: number;
  routine_id: number | null;
  created_by: 'me' | 'agent';
};

export type Routine = {
  id: number;
  kind: Kind;
  title: string;
  days: string; // 'MTWTF..' = Monday to Friday
  at: string; // '08:00'
  duration: number;
};

export type WeekView = {
  monday: string;
  entries: Entry[];
  inbox: Entry[];
  unfinished: Entry[];
};

export type NewEntry = {
  kind: Kind;
  title: string;
  notes?: string | null;
  start?: string | null;
  duration: number;
};

export type EntryChanges = Partial<Pick<Entry, 'title' | 'notes' | 'start' | 'duration' | 'status'>>;
```

- [ ] **Step 2: Write the failing test `src/shared/time.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMinutes, formatDuration, formatTime, isMonday, isoWeek, localNow, mondayOf, weekLabel } from './time.ts';

test('mondayOf finds the Monday, also across months and years', () => {
  assert.equal(mondayOf('2026-11-25T14:10'), '2026-11-23');
  assert.equal(mondayOf('2026-11-29'), '2026-11-23'); // Sunday belongs to the week before it
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
});

test('isMonday rejects other days and impossible dates', () => {
  assert.equal(isMonday('2026-11-23'), true);
  // 2026-02-30 would roll over to Monday 2 March if we didn't check the round trip
  for (const bad of ['2026-11-24', '2026-02-30', 'abc', '2026-11-23T00:00', '']) {
    assert.equal(isMonday(bad), false, bad);
  }
});

test('localNow reads the wall clock in a time zone', () => {
  const instant = new Date('2026-11-25T13:10:00Z');
  assert.equal(localNow('Europe/Berlin', instant), '2026-11-25T14:10');
  assert.equal(localNow('America/New_York', instant), '2026-11-25T08:10');
});

test('time math and labels', () => {
  assert.equal(addMinutes('2026-11-23T23:30', 60), '2026-11-24T00:30');
  assert.equal(isoWeek('2026-11-23'), 48);
  assert.equal(isoWeek('2026-12-28'), 53);
  assert.equal(weekLabel('2026-11-23'), '23 to 29 Nov 2026');
  assert.equal(weekLabel('2026-11-30'), '30 Nov to 6 Dec 2026');
  assert.equal(formatTime('2026-11-25T19:30'), '7:30 pm');
  assert.equal(formatTime('00:15'), '12:15 am');
  assert.equal(formatDuration(90), '1h 30m');
});
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/shared/time.ts'`.

- [ ] **Step 4: Write `src/shared/time.ts`**

```ts
// Times are wall-clock strings in the app's time zone, like '2026-11-23T09:00'.
// Dates are '2026-11-23'. Date math runs in UTC, so clock changes never shift a day.

export const USE_12_HOUR = true;

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (dateOrTime: string) => new Date(`${dateOrTime.slice(0, 10)}T00:00:00Z`);

/** The wall-clock time right now in an IANA time zone, like '2026-11-25T14:10'. */
export function localNow(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function addDays(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** addMinutes('2026-11-23T23:30', 60) === '2026-11-24T00:30' */
export function addMinutes(time: string, minutes: number): string {
  const d = new Date(`${time}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
}

/** The Monday of the week that contains a date or time. */
export function mondayOf(dateOrTime: string): string {
  const daysSinceMonday = (utc(dateOrTime).getUTCDay() + 6) % 7;
  return addDays(dateOrTime, -daysSinceMonday);
}

/** True only for a real calendar date, written 'YYYY-MM-DD', that falls on a Monday. */
export function isMonday(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = utc(date);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return false;
  return d.getUTCDay() === 1;
}

/** A Date in the browser's local time as a wall-clock string. */
export function fromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

/** '19:30' or '2026-11-25T19:30' becomes '7:30 pm', or '19:30' when USE_12_HOUR is false. */
export function formatTime(time: string): string {
  const hhmm = time.slice(-5);
  if (!USE_12_HOUR) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
}

/** 90 becomes '1h 30m'. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

/** '2026-11-23T19:30' becomes 'Mon'. */
export function formatDay(dateOrTime: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(utc(dateOrTime));
}

/** '2026-11-23' becomes '23 to 29 Nov 2026'. */
export function weekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(utc(date));
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  const from = fmt(monday, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${from} to ${fmt(sunday, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** The ISO week number of the week that starts on this Monday. */
export function isoWeek(monday: string): number {
  const thursday = utc(addDays(monday, 3));
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test && npm run typecheck`
Expected: `# pass 6`, `# fail 0`, and no output from `tsc`.

- [ ] **Step 6: Commit**

```bash
git add src/shared
git commit -m "Add shared types and wall-clock time helpers"
```

---

### Task 3: Weeks, routines and entries

**Files:**
- Create: `src/server/week.ts`
- Test: `src/server/week.test.ts`, `src/server/migration.test.ts`

**Interfaces:**
- Consumes: `DB`, `all`, `one`, `run` and `transaction` from Task 1. `addDays`, `addMinutes` and `mondayOf` from Task 2. `Entry`, `Routine` and `WeekView` from Task 2.
- Produces:
  - `class HttpError extends Error { status: 400 | 401 | 403 | 404 }`
  - `fillWeek(db, monday): void`
  - `getWeek(db, monday, now): WeekView`
  - `listRoutines(db): Routine[]`
  - `createRoutine(db, body: unknown, now): Routine`
  - `deleteRoutine(db, id, now): void`
  - `createEntry(db, body: unknown, createdBy?: 'me' | 'agent'): Entry`
  - `updateEntry(db, id, body: unknown, now): Entry`
  - `deleteEntry(db, id): void`

  `now` is always a wall-clock string like `'2026-11-25T14:10'`. Bad input throws either `HttpError` or a `node:sqlite` error with `code === 'ERR_SQLITE_ERROR'`.

- [ ] **Step 1: Write the failing test `src/server/week.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import type { DB } from './db.ts';
import { createRoutine, deleteEntry, deleteRoutine, getWeek } from './week.ts';

const MONDAY = '2026-11-23';
const WEDNESDAY_AFTERNOON = '2026-11-25T14:10';
const LAST_FRIDAY = '2026-11-20T09:00';
const work = { kind: 'event', title: 'Work', days: 'MTWTF..', at: '08:00', duration: 540 };

const starts = (db: DB, title: string) =>
  getWeek(db, MONDAY, WEDNESDAY_AFTERNOON).entries.filter((e) => e.title === title).map((e) => e.start);

test('a week gets one copy of each routine on its days, once', () => {
  const db = openDb(':memory:');
  createRoutine(db, work, LAST_FRIDAY);
  const expected = ['2026-11-23T08:00', '2026-11-24T08:00', '2026-11-25T08:00', '2026-11-26T08:00', '2026-11-27T08:00'];
  assert.deepEqual(starts(db, 'Work'), expected);
  assert.deepEqual(starts(db, 'Work'), expected); // reading the week again adds nothing
});

test('a deleted copy stays deleted', () => {
  const db = openDb(':memory:');
  createRoutine(db, work, LAST_FRIDAY);
  const mondayCopy = getWeek(db, MONDAY, WEDNESDAY_AFTERNOON).entries[0];
  deleteEntry(db, mondayCopy.id);
  assert.equal(starts(db, 'Work').length, 4);
});

test('a new routine reaches filled weeks only from now on', () => {
  const db = openDb(':memory:');
  getWeek(db, MONDAY, WEDNESDAY_AFTERNOON); // fills the week while there are no routines yet
  createRoutine(db, { kind: 'event', title: 'Dinner', days: 'MTWTFSS', at: '18:30', duration: 45 }, WEDNESDAY_AFTERNOON);
  assert.deepEqual(starts(db, 'Dinner'), [
    '2026-11-25T18:30', '2026-11-26T18:30', '2026-11-27T18:30', '2026-11-28T18:30', '2026-11-29T18:30',
  ]);
});

test('deleting a routine removes future copies and keeps past ones', () => {
  const db = openDb(':memory:');
  const routine = createRoutine(db, work, LAST_FRIDAY);
  getWeek(db, MONDAY, WEDNESDAY_AFTERNOON);
  deleteRoutine(db, routine.id, WEDNESDAY_AFTERNOON);
  const left = getWeek(db, MONDAY, WEDNESDAY_AFTERNOON).entries;
  assert.deepEqual(left.map((e) => e.start), ['2026-11-23T08:00', '2026-11-24T08:00', '2026-11-25T08:00']);
  assert.ok(left.every((e) => e.routine_id === null));
  assert.throws(() => deleteRoutine(db, routine.id, WEDNESDAY_AFTERNOON), { status: 404 });
});
```

- [ ] **Step 2: Write the failing test `src/server/migration.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { createEntry, updateEntry } from './week.ts';

const NOW = '2026-11-25T14:10'; // Wednesday afternoon

test('moving a task after its time passed counts a migration', () => {
  const db = openDb(':memory:');
  const task = createEntry(db, { kind: 'task', title: 'Call the bank', start: '2026-11-23T19:30', duration: 30 });
  assert.equal(updateEntry(db, task.id, { start: '2026-11-26T19:30' }, NOW).migrations, 1);
  // Thursday 7:30 pm has passed by Friday morning, so sending it back to the inbox counts too
  assert.equal(updateEntry(db, task.id, { start: null }, '2026-11-27T09:00').migrations, 2);
});

test('planning ahead is not a migration', () => {
  const db = openDb(':memory:');
  const task = createEntry(db, { kind: 'task', title: 'Fix bike brakes', duration: 45 });
  assert.equal(updateEntry(db, task.id, { start: '2026-11-26T18:00' }, NOW).migrations, 0); // inbox to week
  assert.equal(updateEntry(db, task.id, { start: '2026-11-27T18:00' }, NOW).migrations, 0); // future task moved
  assert.equal(updateEntry(db, task.id, { duration: 60 }, '2026-11-28T09:00').migrations, 0); // resized, same start
});

test('writes reject read-only fields, wrong types and impossible changes', () => {
  const db = openDb(':memory:');
  const event = createEntry(db, { kind: 'event', title: 'Dentist', start: '2026-11-25T15:30', duration: 45 });
  assert.throws(() => updateEntry(db, event.id, { created_by: 'agent' }, NOW), { status: 400, message: /created_by/ });
  assert.throws(() => updateEntry(db, event.id, { migrations: 9 }, NOW), { status: 400 });
  assert.throws(() => createEntry(db, { kind: 'task', title: 'X', duration: true }), { status: 400 });
  assert.throws(() => createEntry(db, { kind: 'task', title: 'X', duration: 'abc' }), /cannot store TEXT/);
  assert.throws(() => updateEntry(db, event.id, { start: null }, NOW), /kind = 'task' OR start IS NOT NULL/);
  assert.throws(() => updateEntry(db, event.id, { status: 'done' }, NOW), /kind = 'task' OR status <> 'done'/);
  assert.throws(() => updateEntry(db, 999, { title: 'X' }, NOW), { status: 404 });
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/server/week.ts'` in both new files.

- [ ] **Step 4: Write `src/server/week.ts`**

```ts
import { all, one, run, transaction } from './db.ts';
import type { DB } from './db.ts';
import { addDays, addMinutes, mondayOf } from '../shared/time.ts';
import type { Entry, Routine, WeekView } from '../shared/types.ts';

export class HttpError extends Error {
  status: 400 | 401 | 403 | 404;
  constructor(status: 400 | 401 | 403 | 404, message: string) {
    super(message);
    this.status = status;
  }
}

type Row = Record<string, string | number | null>;

/** Checks that a request body is an object with only allowed keys and plain values. */
function pick(body: unknown, allowed: readonly string[]): Row {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Body must be a JSON object');
  }
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.includes(key)) throw new HttpError(400, `Unknown or read-only field: ${key}`);
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
      throw new HttpError(400, `Field ${key} must be a string, a number or null`);
    }
  }
  return body as Row;
}

/** INSERT ... RETURNING *. Column names come from an allowlist, never straight from the request. */
function insert<T>(db: DB, table: string, row: Row): T {
  const cols = Object.keys(row);
  if (cols.length === 0) throw new HttpError(400, 'Body is empty');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `:${c}`).join(', ')}) RETURNING *`;
  return one<T>(db, sql, row)!;
}

// Weeks

/** Rule 1: the first read of a week copies every routine into it. */
export function fillWeek(db: DB, monday: string): void {
  // ponytail: a GET request writes here on a week's first read. Fine for one user; a nightly job is the upgrade path.
  if (one(db, 'SELECT 1 FROM filled_weeks WHERE monday = ?', [monday])) return;
  transaction(db, () => {
    for (const routine of all<Routine>(db, 'SELECT * FROM routines')) insertCopies(db, routine, monday);
    run(db, 'INSERT INTO filled_weeks (monday) VALUES (?)', [monday]);
  });
}

/** Adds a routine's copies to one week, skipping days that start before `from` when given. */
function insertCopies(db: DB, routine: Routine, monday: string, from?: string): void {
  for (let i = 0; i < 7; i++) {
    if (routine.days[i] === '.') continue;
    const start = `${addDays(monday, i)}T${routine.at}`;
    if (from && start < from) continue;
    run(db, 'INSERT INTO entries (kind, title, start, duration, routine_id) VALUES (?, ?, ?, ?, ?)', [
      routine.kind, routine.title, start, routine.duration, routine.id,
    ]);
  }
}

export function getWeek(db: DB, monday: string, now: string): WeekView {
  fillWeek(db, monday);
  return {
    monday,
    entries: all<Entry>(
      db,
      "SELECT * FROM entries WHERE start >= ? AND start < ? AND status <> 'cancelled' ORDER BY start",
      [monday, addDays(monday, 7)],
    ),
    inbox: all<Entry>(db, "SELECT * FROM entries WHERE kind = 'task' AND status = 'open' AND start IS NULL ORDER BY id"),
    unfinished: all<Entry>(
      db,
      `SELECT * FROM entries
       WHERE kind = 'task' AND status = 'open' AND start IS NOT NULL
         AND strftime('%Y-%m-%dT%H:%M', start, '+' || duration || ' minutes') <= ?
       ORDER BY start`,
      [now],
    ),
  };
}

// Routines

const ROUTINE_FIELDS = ['kind', 'title', 'days', 'at', 'duration'];

export function listRoutines(db: DB): Routine[] {
  return all<Routine>(db, 'SELECT * FROM routines ORDER BY at, id');
}

/** Rule 2: a new routine also lands in weeks that are already filled, from now on. */
export function createRoutine(db: DB, body: unknown, now: string): Routine {
  const row = pick(body, ROUTINE_FIELDS);
  return transaction(db, () => {
    const routine = insert<Routine>(db, 'routines', row);
    const weeks = all<{ monday: string }>(db, 'SELECT monday FROM filled_weeks WHERE monday >= ?', [mondayOf(now)]);
    for (const week of weeks) insertCopies(db, routine, week.monday, now);
    return routine;
  });
}

/** Rule 3: future open copies go; past copies stay, and ON DELETE SET NULL clears their routine_id. */
export function deleteRoutine(db: DB, id: number, now: string): void {
  transaction(db, () => {
    run(db, "DELETE FROM entries WHERE routine_id = ? AND status = 'open' AND start > ?", [id, now]);
    if (run(db, 'DELETE FROM routines WHERE id = ?', [id]) === 0) throw new HttpError(404, `No routine with id ${id}`);
  });
}

// Entries

const CREATE_FIELDS = ['kind', 'title', 'notes', 'start', 'duration'];
const UPDATE_FIELDS = ['title', 'notes', 'start', 'duration', 'status'];

export function createEntry(db: DB, body: unknown, createdBy: 'me' | 'agent' = 'me'): Entry {
  return insert<Entry>(db, 'entries', { ...pick(body, CREATE_FIELDS), created_by: createdBy });
}

export function updateEntry(db: DB, id: number, body: unknown, now: string): Entry {
  const changes: Row = { ...pick(body, UPDATE_FIELDS) };
  const old = one<Entry>(db, 'SELECT * FROM entries WHERE id = ?', [id]);
  if (!old) throw new HttpError(404, `No entry with id ${id}`);
  if (Object.keys(changes).length === 0) return old;
  // Rule 5: moving a task whose time had already passed counts as a migration.
  const moved = 'start' in changes && changes.start !== old.start;
  if (moved && old.kind === 'task' && old.start !== null && addMinutes(old.start, old.duration) <= now) {
    changes.migrations = old.migrations + 1;
  }
  const sets = Object.keys(changes).map((c) => `${c} = :${c}`).join(', ');
  return one<Entry>(db, `UPDATE entries SET ${sets} WHERE id = :id RETURNING *`, { ...changes, id })!;
}

export function deleteEntry(db: DB, id: number): void {
  if (run(db, 'DELETE FROM entries WHERE id = ?', [id]) === 0) throw new HttpError(404, `No entry with id ${id}`);
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test && npm run typecheck`
Expected: `# pass 13`, `# fail 0`, and no output from `tsc`.

- [ ] **Step 6: Commit**

```bash
git add src/server/week.ts src/server/week.test.ts src/server/migration.test.ts
git commit -m "Add week filling, routines, entries and the migration rule"
```

---

### Task 4: HTTP API and server

**Files:**
- Create: `src/server/app.ts`, `src/server/index.ts`
- Test: `src/server/api.test.ts`

**Interfaces:**
- Consumes: everything `week.ts` exports (Task 3), `openDb` (Task 1), and `isMonday`, `localNow` and `mondayOf` (Task 2).
- Produces: `createApp({ db, appToken, timeZone, distDir }): Hono` and these routes:

  | Route | Body | Returns |
  |---|---|---|
  | `GET /api/week?monday=` | | `WeekView` |
  | `POST /api/entries` | `NewEntry` | `201` with an `Entry` |
  | `PATCH /api/entries/:id` | `EntryChanges` | an `Entry` |
  | `DELETE /api/entries/:id` | | `204` |
  | `GET /api/routines` | | `Routine[]` |
  | `POST /api/routines` | `{ kind, title, days, at, duration }` | `201` with a `Routine` |
  | `DELETE /api/routines/:id` | | `204` |

  Every error body is `{ error: string }`. `index.ts` reads `APP_TOKEN`, `DATA_DIR`, `PORT` and `TZ`.

- [ ] **Step 1: Write the failing test `src/server/api.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import type { Entry, WeekView } from '../shared/types.ts';

const TOKEN = 'test-token';
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

function setup() {
  const app = createApp({ db: openDb(':memory:'), appToken: TOKEN, timeZone: 'UTC', distDir: 'dist' });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers, body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body) });
  return { app, send };
}

test('every API route needs the right token', async () => {
  const { app } = setup();
  assert.equal((await app.request('/api/week')).status, 401);
  assert.equal((await app.request('/api/week', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await app.request('/api/week', { headers })).status, 200);
});

test('a task goes from the inbox onto the week', async () => {
  const { send } = setup();
  const task = (await (await send('POST', '/api/entries', { kind: 'task', title: 'Fix bike brakes', duration: 45 })).json()) as Entry;
  let week = (await (await send('GET', '/api/week?monday=2026-11-23')).json()) as WeekView;
  assert.deepEqual(week.inbox.map((e) => e.title), ['Fix bike brakes']);
  await send('PATCH', `/api/entries/${task.id}`, { start: '2026-11-26T18:00' });
  week = (await (await send('GET', '/api/week?monday=2026-11-23')).json()) as WeekView;
  assert.deepEqual(week.inbox, []);
  assert.deepEqual(week.entries.map((e) => e.start), ['2026-11-26T18:00']);
});

test('bad requests get a JSON error with the right status', async () => {
  const { send } = setup();
  for (const monday of ['2026-11-24', '2026-02-30', 'abc']) {
    assert.equal((await send('GET', `/api/week?monday=${monday}`)).status, 400, monday);
  }
  const bad = await send('POST', '/api/entries', { kind: 'task', title: 'X', duration: 0 });
  assert.equal(bad.status, 400);
  assert.match(((await bad.json()) as { error: string }).error, /duration BETWEEN 5 AND 1440/);
  assert.equal((await send('POST', '/api/entries', '{not json')).status, 400);
  assert.equal((await send('POST', '/api/entries', '[1, 2]')).status, 400);
  assert.equal((await send('POST', '/api/routines', {})).status, 400);
  assert.equal((await send('PATCH', '/api/entries/999', { title: 'X' })).status, 404);
  assert.equal((await send('DELETE', '/api/entries/abc')).status, 404);
  assert.equal((await send('GET', '/api/nope')).status, 404);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../src/server/app.ts'`.

- [ ] **Step 3: Write `src/server/app.ts`**

```ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { HttpError, createEntry, createRoutine, deleteEntry, deleteRoutine, getWeek, listRoutines, updateEntry } from './week.ts';
import { isMonday, localNow, mondayOf } from '../shared/time.ts';

export type AppOptions = {
  db: DB;
  appToken: string;
  timeZone: string;
  distDir: string; // built frontend, relative to the working directory
};

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

export function createApp({ db, appToken, timeZone, distDir }: AppOptions): Hono {
  const app = new Hono();
  const now = () => localNow(timeZone);

  app.use('/api/*', async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    if (!header.startsWith('Bearer ') || !sameToken(header.slice(7), appToken)) {
      return c.json({ error: 'Missing or wrong token' }, 401);
    }
    await next();
  });

  app.get('/api/week', (c) => {
    const monday = c.req.query('monday') ?? mondayOf(now());
    if (!isMonday(monday)) throw new HttpError(400, 'monday must be a Monday date like 2026-11-23');
    return c.json(getWeek(db, monday, now()));
  });
  app.post('/api/entries', async (c) => c.json(createEntry(db, await jsonBody(c)), 201));
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

- [ ] **Step 4: Write `src/server/index.ts`**

```ts
import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';

const appToken = process.env.APP_TOKEN;
if (!appToken) {
  console.error('APP_TOKEN is not set. Generate one with: openssl rand -hex 32');
  process.exit(1);
}
const dataDir = process.env.DATA_DIR ?? './data';
const port = Number(process.env.PORT ?? 3000);
const timeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

mkdirSync(dataDir, { recursive: true });
const db = openDb(join(dataDir, 'my-week.db'));
const app = createApp({ db, appToken, timeZone, distDir: 'dist' });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`my-week listening on port ${info.port}, time zone ${timeZone}`);
});

// Docker sends SIGTERM on stop. Node running as PID 1 ignores it unless we handle it.
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test && npm run typecheck`
Expected: `# pass 16`, `# fail 0`, and no output from `tsc`.

- [ ] **Step 6: Smoke-test the real server**

Run, in one terminal: `APP_TOKEN=dev TZ=Europe/Berlin PORT=3917 npm start`
Expected: `my-week listening on port 3917, time zone Europe/Berlin`.

Run, in a second terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3917/api/week
curl -s -X POST http://localhost:3917/api/routines -H 'Authorization: Bearer dev' -H 'Content-Type: application/json' \
  -d '{"kind":"event","title":"Work","days":"MTWTF..","at":"08:00","duration":540}'
curl -s 'http://localhost:3917/api/week?monday=2026-11-23' -H 'Authorization: Bearer dev'
```

Expected: `401`, then the routine as JSON with `"id":1`, then a week whose `entries` holds five Work copies. Stop the server with Ctrl+C, then delete the test database with `rm -rf data`.

- [ ] **Step 7: Commit**

```bash
git add src/server/app.ts src/server/index.ts src/server/api.test.ts
git commit -m "Add the JSON API with token auth and the server entry point"
```

---

### Task 5: Desktop planner UI

**Files:**
- Create: `vite.config.ts`, `src/web/index.html`, `src/web/main.tsx`, `src/web/api.ts`, `src/web/App.tsx`, `src/web/Planner.tsx`, `src/web/InboxPanel.tsx`, `src/web/EntryDialog.tsx`, `src/web/styles.css`
- Create: `src/web/fonts/Geist-Variable.woff2`, `src/web/fonts/GeistMono-Variable.woff2`, `src/web/fonts/OFL.txt` (copied, Step 1)

**Interfaces:**
- Consumes: the API routes from Task 4, the types and time helpers from Task 2.
- Produces:
  - `api.week`, `api.createEntry`, `api.updateEntry` and `api.deleteEntry` in `api.ts`, plus `AuthError`, `getToken` and `setToken`.
  - `type Save = (change: Promise<unknown>, revert?: () => void) => Promise<void>` in `Planner.tsx`. `InboxPanel` and `EntryDialog` call it.

There are no automated UI tests in v1. This task ends with a manual check in a browser.

- [ ] **Step 1: Copy the fonts and their license**

```bash
mkdir -p src/web/fonts
npm install --no-save geist@1.9.2
cp node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2 node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2 src/web/fonts/
cp node_modules/geist/LICENSE.txt src/web/fonts/OFL.txt
npm prune
```

Expected: `src/web/fonts` holds two `.woff2` files of about 70 KB each, plus `OFL.txt`. `npm prune` removes the `geist` package again.

- [ ] **Step 2: Write `vite.config.ts` and `src/web/index.html`**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  build: { outDir: '../../dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```

`src/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>my-week</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write `src/web/main.tsx`, `src/web/api.ts` and `src/web/App.tsx`**

`src/web/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/web/api.ts`:

```ts
import type { Entry, EntryChanges, NewEntry, WeekView } from '../shared/types.ts';

const TOKEN_KEY = 'my-week-token';

/** Thrown on a 401, so the app can show the token screen again. */
export class AuthError extends Error {}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${getToken() ?? ''}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new AuthError('Missing or wrong token');
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  week: (monday: string) => request<WeekView>('GET', `/api/week?monday=${monday}`),
  createEntry: (entry: NewEntry) => request<Entry>('POST', '/api/entries', entry),
  updateEntry: (id: number, changes: EntryChanges) => request<Entry>('PATCH', `/api/entries/${id}`, changes),
  deleteEntry: (id: number) => request<void>('DELETE', `/api/entries/${id}`),
};
```

`src/web/App.tsx`:

```tsx
import { useState } from 'react';
import { getToken, setToken } from './api.ts';
import { Planner } from './Planner.tsx';

export function App() {
  const [hasToken, setHasToken] = useState(() => Boolean(getToken()));
  if (!hasToken) {
    return (
      <TokenScreen
        onSave={(token) => {
          setToken(token);
          setHasToken(true);
        }}
      />
    );
  }
  return <Planner onAuthError={() => setHasToken(false)} />;
}

function TokenScreen({ onSave }: { onSave: (token: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <main className="token-screen">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
      >
        <h1>my-week</h1>
        <label htmlFor="token">Paste your token</label>
        <input id="token" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} required />
        <button type="submit" className="btn primary">Save</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Write `src/web/Planner.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DropArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import type { DateSelectArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core';
import type { Entry, WeekView } from '../shared/types.ts';
import {
  USE_12_HOUR, addDays, addMinutes, formatDay, formatDuration, formatTime, fromDate, isoWeek, localNow,
  minutesBetween, mondayOf, weekLabel,
} from '../shared/time.ts';
import { AuthError, api } from './api.ts';
import { InboxPanel } from './InboxPanel.tsx';
import { EntryDialog } from './EntryDialog.tsx';

export type Save = (change: Promise<unknown>, revert?: () => void) => Promise<void>;

const browserNow = () => localNow(Intl.DateTimeFormat().resolvedOptions().timeZone);

/** This week, or next week on Sundays, because Sunday is planning day. */
function startingMonday(): string {
  const today = browserNow().slice(0, 10);
  const monday = mondayOf(today);
  return addDays(monday, 6) === today ? addDays(monday, 7) : monday;
}

function blockClasses(entry: Entry): string[] {
  const past = addMinutes(entry.start!, entry.duration) <= browserNow();
  const overdue = past && entry.kind === 'task' && entry.status === 'open';
  return [
    `k-${entry.kind}`,
    entry.routine_id === null ? '' : 'routine',
    entry.status === 'done' ? 'done' : '',
    overdue ? 'overdue' : past ? 'past' : '',
  ].filter(Boolean);
}

function Block({ arg }: { arg: EventContentArg }) {
  const entry = arg.event.extendedProps.entry as Entry;
  const start = arg.event.start!;
  const end = arg.event.end ?? start;
  const sig = entry.kind === 'event' ? '○' : entry.status === 'done' ? '×' : '•';
  return (
    <div className="blk">
      <div className="r1">
        <span className="sig">{sig}</span>
        <span className="ttl">{entry.title}</span>
        {entry.migrations > 0 && <span className="mig">&gt;{entry.migrations}</span>}
      </div>
      <div className="tm">
        {formatTime(fromDate(start))} · {formatDuration(minutesBetween(start, end))}
      </div>
    </div>
  );
}

export function Planner({ onAuthError }: { onAuthError: () => void }) {
  const [monday, setMonday] = useState(startingMonday);
  const [week, setWeek] = useState<WeekView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof AuthError) onAuthError();
      else setMessage(err instanceof Error ? err.message : String(err));
    },
    [onAuthError],
  );

  const load = useCallback(() => api.week(monday).then(setWeek, fail), [monday, fail]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    calendarRef.current?.getApi().gotoDate(monday);
  }, [monday]);

  useEffect(() => {
    window.addEventListener('focus', load); // picks up changes made on the phone or by the agent
    return () => window.removeEventListener('focus', load);
  }, [load]);

  /** Sends a change, puts the block back if it fails, and reloads the week either way. */
  const save: Save = useCallback(
    async (change, revert) => {
      try {
        await change;
      } catch (err) {
        revert?.();
        fail(err);
      }
      await load();
    },
    [fail, load],
  );

  const events: EventInput[] = (week?.entries ?? []).map((entry) => ({
    id: String(entry.id),
    title: entry.title,
    start: entry.start!,
    end: addMinutes(entry.start!, entry.duration),
    classNames: blockClasses(entry),
    extendedProps: { entry },
  }));

  function onDrop(info: DropArg) {
    save(api.updateEntry(Number(info.draggedEl.dataset.id), { start: fromDate(info.date) }));
  }

  function onMoveOrResize(info: EventDropArg | EventResizeDoneArg) {
    const { event } = info;
    const entry = event.extendedProps.entry as Entry;
    const changes = { start: fromDate(event.start!), duration: minutesBetween(event.start!, event.end!) };
    save(api.updateEntry(entry.id, changes), info.revert);
  }

  function onSelect(info: DateSelectArg) {
    info.view.calendar.unselect();
    const title = window.prompt('New event')?.trim();
    if (!title) return;
    save(api.createEntry({ kind: 'event', title, start: fromDate(info.start), duration: minutesBetween(info.start, info.end) }));
  }

  function onClick(info: EventClickArg) {
    setOpenEntry(info.event.extendedProps.entry as Entry);
  }

  return (
    <div className="planner">
      <header className="top">
        <div className="title">
          <h1>Week {isoWeek(monday)}</h1>
          <span className="mono muted">{weekLabel(monday)}</span>
        </div>
        <nav aria-label="Week navigation">
          <button type="button" className="btn" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}>←</button>
          <button type="button" className="btn" onClick={() => setMonday(mondayOf(browserNow()))}>Today</button>
          <button type="button" className="btn" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}>→</button>
        </nav>
      </header>
      {message && (
        <p className="message" role="alert">
          {message}
          <button type="button" className="btn" onClick={() => setMessage(null)}>Dismiss</button>
        </p>
      )}
      <div className="body">
        <InboxPanel week={week} save={save} onOpen={setOpenEntry} />
        <main className="grid">
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            initialDate={monday}
            headerToolbar={false}
            firstDay={1}
            allDaySlot={false}
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            slotMinTime="06:00:00"
            slotMaxTime="24:00:00"
            scrollTime="07:00:00"
            height="100%"
            nowIndicator
            editable
            selectable
            droppable
            dayHeaderContent={(arg) => `${formatDay(fromDate(arg.date))} ${arg.date.getDate()}`}
            slotLabelFormat={{ hour: 'numeric', minute: '2-digit', omitZeroMinute: true, hour12: USE_12_HOUR }}
            events={events}
            eventContent={(arg) => <Block arg={arg} />}
            drop={onDrop}
            eventDrop={onMoveOrResize}
            eventResize={onMoveOrResize}
            select={onSelect}
            eventClick={onClick}
          />
        </main>
      </div>
      {openEntry && <EntryDialog entry={openEntry} save={save} onClose={() => setOpenEntry(null)} />}
    </div>
  );
}
```

- [ ] **Step 5: Write `src/web/InboxPanel.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import type { Entry, WeekView } from '../shared/types.ts';
import { formatDay, formatDuration, formatTime } from '../shared/time.ts';
import { api } from './api.ts';
import type { Save } from './Planner.tsx';

const DURATIONS = [15, 30, 45, 60, 90, 120];

type Props = { week: WeekView | null; save: Save; onOpen: (entry: Entry) => void };

export function InboxPanel({ week, save, onOpen }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Any .item in this panel can be dropped on the grid; the grid's `drop` callback saves the new start.
    const draggable = new Draggable(ref.current, {
      itemSelector: '.item',
      eventData: (el) => ({ title: el.dataset.title, duration: { minutes: Number(el.dataset.duration) }, create: false }),
    });
    return () => draggable.destroy();
  }, []);

  const unfinished = week?.unfinished ?? [];
  const inbox = week?.inbox ?? [];

  return (
    <aside className="inbox" ref={ref} aria-label="Inbox">
      <QuickAdd onAdd={(title, duration) => save(api.createEntry({ kind: 'task', title, duration }))} />
      {unfinished.length > 0 && (
        <section>
          <h2>Unfinished <span className="count">{unfinished.length}</span></h2>
          <p className="hint">Time passed without a tick. Place it again, keep it, or strike it.</p>
          <ul className="list">
            {unfinished.map((entry) => <Item key={entry.id} entry={entry} unfinished onOpen={onOpen} />)}
          </ul>
        </section>
      )}
      <section>
        <h2>Inbox <span className="count">{inbox.length}</span></h2>
        <p className="hint">{inbox.length > 0 ? 'Drag a task onto the week to schedule it.' : 'Empty. Add a task above.'}</p>
        <ul className="list">
          {inbox.map((entry) => <Item key={entry.id} entry={entry} onOpen={onOpen} />)}
        </ul>
      </section>
    </aside>
  );
}

function Item({ entry, unfinished = false, onOpen }: { entry: Entry; unfinished?: boolean; onOpen: (entry: Entry) => void }) {
  const meta = [
    unfinished && entry.start ? `was ${formatDay(entry.start)} ${formatTime(entry.start)}` : '',
    entry.migrations > 0 ? `>${entry.migrations} carried forward` : '',
    entry.created_by === 'agent' ? 'added by planner agent' : '',
  ].filter(Boolean).join(', ');
  return (
    <li className={unfinished ? 'item unf' : 'item'} data-id={entry.id} data-title={entry.title} data-duration={entry.duration}>
      <span className="sig" aria-hidden="true">•</span>
      <button type="button" className="item-body" onClick={() => onOpen(entry)}>
        <span className="t">{entry.title}</span>
        {meta && <span className="m">{meta}</span>}
      </button>
      <span className="r">{formatDuration(entry.duration)}</span>
    </li>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string, duration: number) => void }) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        onAdd(trimmed, duration);
        setTitle('');
      }}
    >
      <label htmlFor="new-task">New task</label>
      <input id="new-task" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix bike brakes" autoComplete="off" required />
      <div className="chips" role="group" aria-label="Duration">
        {DURATIONS.map((d) => (
          <button key={d} type="button" className={d === duration ? 'chip on' : 'chip'} aria-pressed={d === duration} onClick={() => setDuration(d)}>
            {formatDuration(d)}
          </button>
        ))}
      </div>
      <button type="submit" className="btn primary">Add to inbox</button>
    </form>
  );
}
```

- [ ] **Step 6: Write `src/web/EntryDialog.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../shared/types.ts';
import { api } from './api.ts';
import type { Save } from './Planner.tsx';

type Props = { entry: Entry; save: Save; onClose: () => void };

/** Actions for one entry, in the browser's own <dialog>, so Escape and focus handling come for free. */
export function EntryDialog({ entry, save, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(entry.title);
  const [notes, setNotes] = useState(entry.notes ?? '');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const act = (change: Promise<unknown>) => {
    onClose();
    save(change);
  };
  const isTask = entry.kind === 'task';
  const done = entry.status === 'done';

  return (
    <dialog ref={ref} className="entry-dialog" onClose={onClose} aria-labelledby="entry-dialog-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(api.updateEntry(entry.id, { title: title.trim(), notes: notes.trim() || null }));
        }}
      >
        <h2 id="entry-dialog-title">{isTask ? 'Task' : 'Event'}</h2>
        <label htmlFor="entry-title">Title</label>
        <input id="entry-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label htmlFor="entry-notes">Notes</label>
        <textarea id="entry-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="actions">
          {isTask && (
            <button type="button" className="btn" onClick={() => act(api.updateEntry(entry.id, { status: done ? 'open' : 'done' }))}>
              {done ? 'Untick' : 'Tick'}
            </button>
          )}
          {isTask && entry.start && (
            <button type="button" className="btn" onClick={() => act(api.updateEntry(entry.id, { start: null }))}>Back to inbox</button>
          )}
          <button type="button" className="btn" onClick={() => act(api.updateEntry(entry.id, { status: 'cancelled' }))}>Strike</button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (window.confirm(`Delete "${entry.title}" for good?`)) act(api.deleteEntry(entry.id));
            }}
          >
            Delete
          </button>
        </div>
        <div className="actions end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Save</button>
        </div>
      </form>
    </dialog>
  );
}
```

- [ ] **Step 7: Write `src/web/styles.css`**

```css
@font-face {
  font-family: 'Geist';
  src: url('./fonts/Geist-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: 'Geist Mono';
  src: url('./fonts/GeistMono-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

/* Direction A, "Dot grid". Light mode only in v1. */
:root {
  --bg: #F3F3F0;
  --paper: #FBFBF9;
  --ink: #1C1C1F;
  --muted: #66666C;
  --line: #D9D9D3;
  --dot: #C4C4BD;
  --accent: #2D4BD0;
  --on-accent: #F7F8FF;
  --over: #B3261E;
  --routine: #E8E8E3;
  --radius: 3px;
  --mono: 'Geist Mono', ui-monospace, monospace;

  /* FullCalendar reads these */
  --fc-border-color: var(--line);
  --fc-page-bg-color: var(--bg);
  --fc-today-bg-color: transparent;
  --fc-now-indicator-color: var(--accent);
  --fc-highlight-color: rgb(45 75 208 / 0.12);
  color-scheme: light;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.4 'Geist', system-ui, sans-serif; }
button, input, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.mono { font-family: var(--mono); }
.muted { color: var(--muted); }

.btn { height: 36px; padding: 0 14px; border: 1px solid var(--ink); border-radius: var(--radius); background: var(--paper); font-weight: 500; cursor: pointer; }
.btn:active { transform: translateY(1px); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
input, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--ink); border-radius: var(--radius); background: var(--paper); }
input::placeholder, textarea::placeholder { color: var(--muted); }
label { font-size: 12px; font-weight: 600; }

/* Page layout */
.planner { height: 100dvh; display: flex; flex-direction: column; gap: 12px; padding: 16px 24px 20px; }
.top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
.top .title { display: flex; align-items: baseline; gap: 12px; }
.top h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.top nav { display: flex; gap: 8px; }
.message { margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border: 1.5px solid var(--over); border-radius: var(--radius); background: var(--paper); color: var(--over); }
.body { flex: 1; min-height: 0; display: flex; gap: 24px; }
.grid { flex: 1; min-width: 0; }

/* Inbox panel */
.inbox { width: 300px; flex: none; display: flex; flex-direction: column; gap: 22px; overflow-y: auto; }
.inbox h2 { margin: 0; display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; }
.count { font: 400 12px var(--mono); color: var(--muted); }
.hint { margin: 4px 0 8px; font-size: 12px; color: var(--muted); }
.quick-add { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--ink); border-radius: var(--radius); background: var(--paper); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { height: 30px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--radius); background: transparent; font: 500 12px var(--mono); cursor: pointer; }
.chip.on { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.item { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border: 1px solid var(--ink); border-radius: var(--radius); background: var(--paper); cursor: grab; }
.item.unf { border: 1.5px solid var(--over); }
.item .sig { width: 10px; flex: none; font: 500 14px/18px var(--mono); }
.item.unf .sig, .item.unf .m { color: var(--over); }
.item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; }
.item .t { font-size: 13px; font-weight: 500; line-height: 18px; }
.item .m { font: 400 11px/16px var(--mono); color: var(--muted); }
.item .r { font: 400 12px/18px var(--mono); color: var(--muted); white-space: nowrap; }

/* Week grid: FullCalendar overrides */
.fc .fc-col-header-cell-cushion { padding: 0 6px 8px; font-weight: 600; color: var(--ink); text-decoration: none; }
.fc .fc-day-past .fc-col-header-cell-cushion { color: var(--muted); font-weight: 500; }
.fc .fc-day-today .fc-col-header-cell-cushion { color: var(--accent); }
.fc .fc-timegrid-slot { height: 24px; border-color: transparent; }
.fc .fc-timegrid-slot-label-cushion { font: 400 11px var(--mono); color: var(--muted); }
.fc .fc-timegrid-col { background-image: radial-gradient(circle, var(--dot) 1px, transparent 1.5px); background-size: 24px 24px; background-position: -12px -12px; }
.fc .fc-timegrid-now-indicator-line { border-width: 2px 0 0; }

/* Blocks */
.fc .fc-v-event { border-radius: var(--radius); box-shadow: none; }
.fc .fc-v-event .fc-event-main { padding: 0; color: inherit; }
.fc .k-task { background: var(--paper); border: 1px solid var(--ink); color: var(--ink); }
.fc .k-event { background: var(--ink); border: 1px solid var(--ink); color: var(--paper); }
.fc .routine { background: var(--routine); border-color: var(--routine); color: var(--muted); }
.fc .k-task.routine { background: transparent; border: 1px dashed var(--muted); color: var(--ink); }
.fc .done .ttl { text-decoration: line-through; }
.fc .done, .fc .past { opacity: 0.55; }
.fc .overdue { border: 1.5px solid var(--over); }
.fc .overdue .sig, .fc .overdue .ttl { color: var(--over); }
.blk { height: 100%; overflow: hidden; padding: 3px 6px; }
.blk .r1 { display: flex; align-items: baseline; gap: 5px; font-size: 12px; font-weight: 500; line-height: 15px; }
.blk .sig { flex: none; font-family: var(--mono); }
.blk .ttl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.blk .mig, .blk .tm { font: 400 11px/15px var(--mono); opacity: 0.75; }
.fc-timegrid-event-short .blk { padding-block: 0; }
.fc-timegrid-event-short .blk .tm { display: none; }

/* Entry dialog and token screen */
.entry-dialog { width: min(420px, calc(100vw - 32px)); padding: 0; border: 1px solid var(--ink); border-radius: var(--radius); background: var(--paper); color: var(--ink); }
.entry-dialog::backdrop { background: rgb(28 28 31 / 0.25); }
.entry-dialog form, .token-screen form { display: flex; flex-direction: column; gap: 8px; padding: 18px; }
.entry-dialog h2 { margin: 0 0 4px; font-size: 15px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.actions.end { justify-content: flex-end; }
.token-screen { min-height: 100dvh; display: grid; place-items: center; }
.token-screen form { width: min(360px, calc(100vw - 32px)); border: 1px solid var(--ink); border-radius: var(--radius); background: var(--paper); }
.token-screen h1 { margin: 0 0 8px; font-size: 20px; }
```

- [ ] **Step 8: Type-check, test and build**

Run: `npm run typecheck && npm test && npm run build`
Expected: no output from `tsc`, `# pass 16`, and Vite printing `dist/index.html`, two `.woff2` files, one `.css` file and one `.js` file of about 490 KB, ending with `✓ built`.

- [ ] **Step 9: Check the UI in a browser**

Run: `npm run build && APP_TOKEN=dev npm start`, then open `http://<this machine>:3000`.

If your browser can't reach this machine, do this step after Task 7 on the deployed app instead. You can also point a temporary Nginx Proxy Manager host at this container's port 3000.

Check:
1. The token screen appears. Paste `dev` and the week appears.
2. Add three tasks with different durations. They show up in the inbox.
3. Drag one onto Wednesday afternoon. Move it, then stretch it. Each change survives a reload.
4. Drag across an empty slot and type a title. An event appears as a solid ink block.
5. Click the task, press Tick, and it shows `×` with a line through it. Click it again and press Back to inbox.
6. Place a task in the past, for example earlier today. It turns red and appears under Unfinished. Drag it from Unfinished onto tomorrow, and it shows `>1`.
7. The previous, Today and next buttons change the week, and the header updates.

Stop the server with Ctrl+C, then delete the test database with `rm -rf data`.

- [ ] **Step 10: Commit**

```bash
git add vite.config.ts src/web
git commit -m "Add the desktop planner: inbox, week grid, entry dialog and token screen"
```

---

### Task 6: Docker image and deploy files

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `compose.example.yaml`, `README.md`

**Interfaces:**
- Consumes: the `build` and `start` scripts from Task 1, and the server's environment variables from Task 4.
- Produces: an image that listens on port 3000, keeps everything in `/data`, and needs `APP_TOKEN` and `TZ`.

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
# Build stage: install everything and build the frontend into dist/
FROM node:24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: the server, its two runtime dependencies and the built frontend
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY migrations ./migrations
EXPOSE 3000
CMD ["node", "src/server/index.ts"]
```

- [ ] **Step 2: Write `.dockerignore`**

```
node_modules
dist
data
.git
src/**/*.test.ts
```

- [ ] **Step 3: Write `compose.example.yaml`**

```yaml
# Dockge stack for my-week. Put APP_TOKEN in the stack's .env file.
services:
  my-week:
    image: my-week:0.1.0
    container_name: my-week
    restart: unless-stopped
    user: "568:568"             # TrueNAS apps user; must own the data folder
    environment:
      TZ: Etc/UTC               # replace with your zone, for example Europe/Berlin
      APP_TOKEN: ${APP_TOKEN}
    volumes:
      - /mnt/tank/apps/my-week:/data   # your TrueNAS dataset
    networks:
      - apps
networks:
  apps:
    external: true              # shared with Nginx Proxy Manager (and the planner agent in milestone 2)
```

- [ ] **Step 4: Write `README.md`**

````markdown
# my-week

A self-hosted week planner. Every Sunday you drag tasks from an inbox onto a Monday to Sunday grid. The design is in `docs/superpowers/specs/2026-11-18-week-planner-design.md`.

## Develop

Needs Node 22.18 or newer.

```sh
npm install
npm test                                 # server and time tests
npm run typecheck
APP_TOKEN=dev npm run dev:server         # API on http://localhost:3000
npm run dev:web                          # UI on http://localhost:5173, sends /api to port 3000
```

## Deploy on TrueNAS with Dockge

1. Build the image on the server, and tag the same commit in git:
   ```sh
   docker build -t my-week:0.1.0 .
   git tag v0.1.0
   ```
2. Create a dataset for the data, for example `/mnt/tank/apps/my-week`, owned by user and group 568.
3. In Dockge, create a stack from `compose.example.yaml`. Put `APP_TOKEN=<output of openssl rand -hex 32>` in the stack's `.env` and set `TZ`.
4. In Nginx Proxy Manager, add a proxy host for your subdomain that points at `http://my-week:3000`, with a Let's Encrypt certificate.
5. Open the subdomain and paste your token.

To upgrade, take a snapshot of the dataset, build a new tag, change the tag in Dockge, and redeploy. Copying `/data` by hand while the app runs can catch a half-written file, so stop the container first if you copy by hand.

## Routines

There's no routines page until milestone 2. Create your routines once with curl, using your real times:

```sh
TOKEN=...                                # your APP_TOKEN
URL=https://my-week.example.com          # your subdomain

add() { curl -s -X POST "$URL/api/routines" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$1"; echo; }

add '{"kind":"event","title":"Commute","days":"MTWTF..","at":"07:30","duration":30}'
add '{"kind":"event","title":"Work","days":"MTWTF..","at":"08:00","duration":540}'
add '{"kind":"event","title":"Commute","days":"MTWTF..","at":"17:00","duration":30}'
add '{"kind":"event","title":"Dinner","days":"MTWTFSS","at":"18:30","duration":45}'
add '{"kind":"event","title":"Gaming","days":"M.W.F..","at":"21:00","duration":90}'
add '{"kind":"task","title":"Read 20 min","days":"MTWTFSS","at":"22:30","duration":20}'
```

`days` is seven letters from Monday to Sunday, with a dot for days off. List routines with `curl -s "$URL/api/routines" -H "Authorization: Bearer $TOKEN"`, and remove one with `curl -s -X DELETE "$URL/api/routines/<id>" -H "Authorization: Bearer $TOKEN"`.
````

- [ ] **Step 5: Run every check one more time**

Run: `npm run typecheck && npm test && npm run build`
Expected: no output from `tsc`, `# pass 16`, and `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore compose.example.yaml README.md
git commit -m "Add Dockerfile, Dockge compose example and README"
```

---

### Task 7: Deploy and run the Sunday checklist (you)

These steps happen on your server and in your browser. The repo has to reach the TrueNAS host, so push it first (`git push -u origin main`) and clone it there.

- [ ] **Step 1: Build and pin the image.** On the TrueNAS shell, inside the cloned repo, run `docker run --rm node:24-slim node --version`. Replace both `node:24` tags in the `Dockerfile` with that exact version, for example `node:24.11.1`, and commit. Then run `docker build -t my-week:0.1.0 .` and `git tag v0.1.0`.
- [ ] **Step 2: Create the dataset.** Create `/mnt/<pool>/apps/my-week`, owned by user and group 568.
- [ ] **Step 3: Start the stack.** In Dockge, create a `my-week` stack from `compose.example.yaml`. Fix the dataset path and `TZ`, and put `APP_TOKEN` (from `openssl rand -hex 32`) in `.env`. Deploy it. The log should say `my-week listening on port 3000`.
- [ ] **Step 4: Add the proxy host.** In Nginx Proxy Manager, add your subdomain, pointing at `http://my-week:3000`, with a Let's Encrypt certificate.
- [ ] **Step 5: Create your routines** with the curl commands in the README, using your real times.
- [ ] **Step 6: Run the acceptance checklist** from the spec:
  1. Open the planner on the PC. It shows the week of 23 November with routine copies.
  2. Add five tasks to the inbox and drag each one onto the grid. Resize one and move one.
  3. Create an event by dragging across an empty slot.
  4. Tick a task, send one back to the inbox, and strike one.
  5. Reload the page, then restart the container in Dockge. Everything is still where you left it.
