import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, openDb } from './db.ts';
import type { DB } from './db.ts';
import { createRoutine, deleteEntry, deleteRoutine, getWeek, updateEntry } from './week.ts';
import type { Entry, WeekView } from '../shared/types.ts';

const MONDAY = '2026-11-23';
const WEDNESDAY_AFTERNOON = '2026-11-25T14:10';
const LAST_FRIDAY = '2026-11-20T09:00';
const work = { kind: 'event', title: 'Work', days: 'MTWTF..', at: '08:00', duration: 540 };

const starts = (db: DB, title: string) =>
  getWeek(db, MONDAY, WEDNESDAY_AFTERNOON).entries.filter((e) => e.title === title).map((e) => e.start);

test('a week gets one copy of each routine on its days, once', () => {
  const db = openDb(':memory:');
  createRoutine(db, work, LAST_FRIDAY);
  getWeek(db, MONDAY, LAST_FRIDAY); // first read before the week starts, so every day gets a copy
  const expected = ['2026-11-23T08:00', '2026-11-24T08:00', '2026-11-25T08:00', '2026-11-26T08:00', '2026-11-27T08:00'];
  assert.deepEqual(starts(db, 'Work'), expected);
  assert.deepEqual(starts(db, 'Work'), expected); // reading the week again adds nothing
});

test('a deleted copy stays deleted', () => {
  const db = openDb(':memory:');
  createRoutine(db, work, LAST_FRIDAY);
  const mondayCopy = getWeek(db, MONDAY, LAST_FRIDAY).entries[0];
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

test('browsing a past week adds no routine copies, so Unfinished stays clean', () => {
  const db = openDb(':memory:');
  createRoutine(db, { kind: 'task', title: 'Read 20 min', days: 'MTWTFSS', at: '22:30', duration: 20 }, LAST_FRIDAY);
  const lastWeek = getWeek(db, '2026-11-16', WEDNESDAY_AFTERNOON);
  assert.deepEqual(lastWeek.entries, []);
  assert.deepEqual(lastWeek.unfinished, []);
  // this week only gets copies from now on: Wednesday evening to Sunday
  assert.deepEqual(starts(db, 'Read 20 min'), [
    '2026-11-25T22:30', '2026-11-26T22:30', '2026-11-27T22:30', '2026-11-28T22:30', '2026-11-29T22:30',
  ]);
});

test('deleting a routine removes future copies and keeps past ones', () => {
  const db = openDb(':memory:');
  const routine = createRoutine(db, work, LAST_FRIDAY);
  getWeek(db, MONDAY, LAST_FRIDAY); // filled before the week started, so Monday to Wednesday have copies
  deleteRoutine(db, routine.id, WEDNESDAY_AFTERNOON);
  const left = getWeek(db, MONDAY, WEDNESDAY_AFTERNOON).entries;
  assert.deepEqual(left.map((e) => e.start), ['2026-11-23T08:00', '2026-11-24T08:00', '2026-11-25T08:00']);
  assert.ok(left.every((e) => e.routine_id === null));
  assert.throws(() => deleteRoutine(db, routine.id, WEDNESDAY_AFTERNOON), { status: 404 });
});

// Habits: routines with no time, copied as tasks with no start and a day

const NEXT_MONDAY = '2026-11-30';
const habit = (title: string, carry: 0 | 1) => ({ kind: 'task', title, days: 'MTWTFSS', at: null, duration: 60, carry });
const habitDays = (week: WeekView) => week.habits.map((e) => `${e.title} ${e.day}`);

test('a habit gets a task with no start for each of its days, from today on, outside the inbox', () => {
  const db = openDb(':memory:');
  const gaming = createRoutine(db, habit('Gaming', 1), WEDNESDAY_AFTERNOON);
  assert.equal(gaming.at, null);
  assert.equal(gaming.carry, 1);
  const week = getWeek(db, MONDAY, WEDNESDAY_AFTERNOON);
  assert.deepEqual(habitDays(week), ['Gaming 2026-11-25', 'Gaming 2026-11-26', 'Gaming 2026-11-27', 'Gaming 2026-11-28', 'Gaming 2026-11-29']);
  assert.ok(week.habits.every((e) => e.kind === 'task' && e.start === null && e.routine_id === gaming.id));
  assert.deepEqual(week.inbox, []);
  assert.deepEqual(week.entries, []);
  assert.throws(() => createRoutine(db, { ...habit('Dinner', 0), kind: 'event' }, WEDNESDAY_AFTERNOON), /CHECK constraint failed/);
});

test('a new habit reaches weeks filled before it existed, from today on', () => {
  const db = openDb(':memory:');
  getWeek(db, MONDAY, LAST_FRIDAY);
  getWeek(db, NEXT_MONDAY, LAST_FRIDAY);
  createRoutine(db, { ...habit('Stretch', 0), days: 'M.W.F..' }, WEDNESDAY_AFTERNOON);
  assert.deepEqual(habitDays(getWeek(db, NEXT_MONDAY, WEDNESDAY_AFTERNOON)), [
    'Stretch 2026-11-25', 'Stretch 2026-11-27', 'Stretch 2026-11-30', 'Stretch 2026-12-02', 'Stretch 2026-12-04',
  ]);
});

test('a missed copy shows on later days of its week only when its habit carries over', () => {
  const db = openDb(':memory:');
  createRoutine(db, habit('Gaming', 1), LAST_FRIDAY);
  createRoutine(db, habit('Stretch', 0), LAST_FRIDAY);
  getWeek(db, MONDAY, LAST_FRIDAY); // filled before the week starts, so Monday has copies
  const tuesday = getWeek(db, MONDAY, '2026-11-24T09:00').habits.filter((e) => e.day! <= '2026-11-24');
  assert.deepEqual(tuesday.map((e) => `${e.title} ${e.day}`), ['Gaming 2026-11-23', 'Gaming 2026-11-24', 'Stretch 2026-11-24']);
  // a new week starts clean: last week's carried copies stay behind
  assert.ok(getWeek(db, NEXT_MONDAY, '2026-11-30T09:00').habits.every((e) => e.day! >= NEXT_MONDAY));
});

test('the habits list runs from this Monday to the end of the shown week, or to today for a past week', () => {
  const db = openDb(':memory:');
  createRoutine(db, habit('Read', 0), LAST_FRIDAY);
  const thisWeek = ['Read 2026-11-25', 'Read 2026-11-26', 'Read 2026-11-27', 'Read 2026-11-28', 'Read 2026-11-29'];
  // the planner opens next week on Sundays, and its inbox still needs this week's habits
  assert.deepEqual(habitDays(getWeek(db, NEXT_MONDAY, WEDNESDAY_AFTERNOON)), [
    ...thisWeek, 'Read 2026-11-30', 'Read 2026-12-01', 'Read 2026-12-02', 'Read 2026-12-03', 'Read 2026-12-04', 'Read 2026-12-05', 'Read 2026-12-06',
  ]);
  assert.deepEqual(habitDays(getWeek(db, MONDAY, WEDNESDAY_AFTERNOON)), thisWeek);
  assert.deepEqual(habitDays(getWeek(db, '2026-11-16', WEDNESDAY_AFTERNOON)), ['Read 2026-11-25']);
});

test('a placed habit leaves the list, goes overdue like a task, and comes back with the inbox button', () => {
  const db = openDb(':memory:');
  createRoutine(db, habit('Gaming', 0), WEDNESDAY_AFTERNOON);
  const copy = getWeek(db, MONDAY, WEDNESDAY_AFTERNOON).habits[0];
  updateEntry(db, copy.id, { start: '2026-11-25T21:00' }, WEDNESDAY_AFTERNOON);
  let week = getWeek(db, MONDAY, WEDNESDAY_AFTERNOON);
  assert.ok(!week.habits.some((e) => e.id === copy.id));
  assert.deepEqual(week.entries.map((e) => [e.title, e.routine_id]), [['Gaming', copy.routine_id]]);
  assert.deepEqual(getWeek(db, MONDAY, '2026-11-25T22:30').unfinished.map((e) => e.id), [copy.id]);
  updateEntry(db, copy.id, { start: null }, WEDNESDAY_AFTERNOON);
  week = getWeek(db, MONDAY, WEDNESDAY_AFTERNOON);
  assert.equal(week.habits[0].id, copy.id);
  assert.deepEqual(week.inbox, []);
});

test('deleting a habit removes its unplaced and future copies, and keeps the rest', () => {
  const db = openDb(':memory:');
  const gaming = createRoutine(db, habit('Gaming', 1), LAST_FRIDAY);
  const copies = getWeek(db, MONDAY, LAST_FRIDAY).habits.filter((e) => e.day! >= MONDAY); // Monday to Sunday
  updateEntry(db, copies[0].id, { start: '2026-11-23T21:00' }, LAST_FRIDAY); // played on Monday
  updateEntry(db, copies[1].id, { status: 'done' }, LAST_FRIDAY); // ticked on Tuesday without a time
  updateEntry(db, copies[3].id, { start: '2026-11-26T21:00' }, LAST_FRIDAY); // planned for Thursday
  deleteRoutine(db, gaming.id, WEDNESDAY_AFTERNOON);
  const left = all<Entry>(db, 'SELECT * FROM entries ORDER BY id');
  assert.deepEqual(left.map((e) => [e.id, e.routine_id, e.day]), [
    [copies[0].id, null, '2026-11-23'],
    [copies[1].id, null, '2026-11-24'],
  ]);
  assert.deepEqual(getWeek(db, MONDAY, WEDNESDAY_AFTERNOON).habits, []);
});
