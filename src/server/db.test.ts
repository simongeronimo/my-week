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
