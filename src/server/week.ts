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

/**
 * Rule 1: the first read of a week copies every routine into it, from now on.
 * Past days get no copies, so browsing an old week never fills Overdue with routine tasks.
 */
function fillWeek(db: DB, monday: string, now: string): void {
  // ponytail: a GET request writes here on a week's first read. Fine for one user; a nightly job is the upgrade path.
  if (one(db, 'SELECT 1 FROM filled_weeks WHERE monday = ?', [monday])) return;
  transaction(db, () => {
    for (const routine of all<Routine>(db, 'SELECT * FROM routines')) insertCopies(db, routine, monday, now);
    run(db, 'INSERT INTO filled_weeks (monday) VALUES (?)', [monday]);
  });
}

/** Adds a routine's copies to one week, skipping days that start before `from`. */
function insertCopies(db: DB, routine: Routine, monday: string, from: string): void {
  for (let i = 0; i < 7; i++) {
    if (routine.days[i] === '.') continue;
    const start = `${addDays(monday, i)}T${routine.at}`;
    if (start < from) continue;
    run(db, 'INSERT INTO entries (kind, title, start, duration, routine_id) VALUES (?, ?, ?, ?, ?)', [
      routine.kind, routine.title, start, routine.duration, routine.id,
    ]);
  }
}

export function getWeek(db: DB, monday: string, now: string): WeekView {
  fillWeek(db, monday, now);
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
  // Rule 6: back to the inbox means "not done yet", so a ticked task reopens instead of vanishing.
  if (changes.start === null && old.kind === 'task' && !('status' in changes)) changes.status = 'open';
  // Rule 5: moving an unfinished task whose time had already passed counts as a migration.
  const moved = 'start' in changes && changes.start !== old.start;
  const unfinished = old.kind === 'task' && old.status === 'open' && old.start !== null;
  if (moved && unfinished && addMinutes(old.start!, old.duration) <= now) {
    changes.migrations = old.migrations + 1;
  }
  const sets = Object.keys(changes).map((c) => `${c} = :${c}`).join(', ');
  return one<Entry>(db, `UPDATE entries SET ${sets} WHERE id = :id RETURNING *`, { ...changes, id })!;
}

export function deleteEntry(db: DB, id: number): void {
  if (run(db, 'DELETE FROM entries WHERE id = ?', [id]) === 0) throw new HttpError(404, `No entry with id ${id}`);
}
