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
