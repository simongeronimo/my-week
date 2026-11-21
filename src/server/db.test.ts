import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { all, migrate, one, openDb, run } from './db.ts';
import type { DB } from './db.ts';

const MIGRATIONS = join(import.meta.dirname, '../../migrations');
const LATEST = Number(readdirSync(MIGRATIONS).sort().at(-1)!.slice(0, 3));
const version = (db: DB) => one<{ user_version: number }>(db, 'PRAGMA user_version')!.user_version;

test('schema upgrades run once and record the version', () => {
  const db = openDb(':memory:');
  assert.equal(version(db), LATEST);
  migrate(db, MIGRATIONS); // would throw "table already exists" if it ran again
  assert.equal(version(db), LATEST);
});

test('rebuilding routines for habits keeps every routine copy linked to its routine', () => {
  const v1 = mkdtempSync(join(tmpdir(), 'my-week-v1-'));
  copyFileSync(join(MIGRATIONS, '001_init.sql'), join(v1, '001_init.sql'));
  const db = openDb(':memory:', v1); // a database as it was before 002, with foreign keys on like the server's
  run(db, "INSERT INTO routines (id, kind, title, days, at, duration) VALUES (1, 'event', 'Work', 'MTWTF..', '08:00', 540)");
  run(db, "INSERT INTO routines (id, kind, title, days, at, duration) VALUES (2, 'task', 'Read', 'MTWTFSS', '22:30', 20)");
  run(db, "INSERT INTO entries (kind, title, start, duration, routine_id) VALUES ('event', 'Work', '2026-11-23T08:00', 540, 1)");
  run(db, "INSERT INTO entries (kind, title, start, duration, routine_id, status) VALUES ('task', 'Read', '2026-11-23T22:30', 20, 2, 'done')");
  run(db, "INSERT INTO entries (kind, title, start, duration) VALUES ('task', 'Not a copy', '2026-11-24T18:00', 30)");

  migrate(db, MIGRATIONS);

  assert.equal(version(db), LATEST);
  assert.deepEqual(all(db, 'SELECT title, routine_id FROM entries ORDER BY id').map((r) => ({ ...r })), [
    { title: 'Work', routine_id: 1 },
    { title: 'Read', routine_id: 2 },
    { title: 'Not a copy', routine_id: null },
  ]);
  assert.deepEqual(all(db, 'SELECT id, at, carry FROM routines ORDER BY id').map((r) => ({ ...r })), [
    { id: 1, at: '08:00', carry: 0 },
    { id: 2, at: '22:30', carry: 0 },
  ]);
  assert.equal(one<{ foreign_keys: number }>(db, 'PRAGMA foreign_keys')!.foreign_keys, 1);
  // the foreign key now points at the rebuilt table: deleting a routine still unlinks its copies
  run(db, 'DELETE FROM routines WHERE id = 1');
  assert.equal(one<{ routine_id: null }>(db, "SELECT routine_id FROM entries WHERE title = 'Work'")!.routine_id, null);
  // and the rebuilt table kept its checks
  const routine = (values: string) => () => run(db, `INSERT INTO routines (kind, title, days, at, duration) VALUES (${values})`);
  assert.throws(routine("'event', 'X', 'MTWTF..', NULL, 30"), /CHECK constraint failed/); // only a task can have no time
  assert.throws(routine("'task', 'X', 'MTWTF..', '24:00', 30"), /CHECK constraint failed/);
  assert.throws(routine("'task', 'X', '.......', NULL, 30"), /CHECK constraint failed/);
  assert.throws(routine("'task', '', 'MTWTF..', NULL, 30"), /CHECK constraint failed/);
  assert.throws(routine("'task', 'X', 'MTWTF..', NULL, 0"), /CHECK constraint failed/);
  assert.throws(routine("'meal', 'X', 'MTWTF..', '08:00', 30"), /CHECK constraint failed/);
  routine("'task', 'Gaming', 'MTWTFSS', NULL, 60")();
});

test('an upgrade that breaks a foreign key rolls back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'my-week-migrations-'));
  writeFileSync(join(dir, '001_good.sql'), 'CREATE TABLE a (id INTEGER PRIMARY KEY); CREATE TABLE b (a_id INTEGER REFERENCES a(id));');
  writeFileSync(join(dir, '002_orphan.sql'), 'INSERT INTO b (a_id) VALUES (7);');
  const db = new DatabaseSync(':memory:');
  assert.throws(() => migrate(db, dir), /foreign key/);
  assert.equal(version(db), 0);
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
