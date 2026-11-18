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
