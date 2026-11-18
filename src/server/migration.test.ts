import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { createEntry, createRoutine, getWeek, updateEntry } from './week.ts';

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

test('moving a ticked task is not a migration, even after its time passed', () => {
  const db = openDb(':memory:');
  const task = createEntry(db, { kind: 'task', title: 'Groceries', start: '2026-11-24T17:45', duration: 45 });
  updateEntry(db, task.id, { status: 'done' }, NOW);
  assert.equal(updateEntry(db, task.id, { start: '2026-11-24T18:30' }, NOW).migrations, 0);
});

test('sending a ticked task back to the inbox reopens it', () => {
  const db = openDb(':memory:');
  const task = createEntry(db, { kind: 'task', title: 'Groceries', start: '2026-11-24T17:45', duration: 45 });
  updateEntry(db, task.id, { status: 'done' }, NOW);
  const back = updateEntry(db, task.id, { start: null }, NOW);
  assert.equal(back.status, 'open');
  assert.deepEqual(getWeek(db, '2026-11-23', NOW).inbox.map((e) => e.title), ['Groceries']);
});

test('impossible dates and times are rejected', () => {
  const db = openDb(':memory:');
  const task = (start: string) => () => createEntry(db, { kind: 'task', title: 'X', start, duration: 30 });
  assert.throws(task('2026-02-30T09:00'), /CHECK constraint failed/); // 30 February
  assert.throws(task('2026-11-31T09:00'), /CHECK constraint failed/); // 31 November
  assert.throws(task('2026-11-25T24:00'), /CHECK constraint failed/);
  assert.throws(
    () => createRoutine(db, { kind: 'event', title: 'X', days: 'MTWTF..', at: '24:00', duration: 30 }, NOW),
    /CHECK constraint failed/,
  );
  assert.equal(task('2026-11-25T23:45')().start, '2026-11-25T23:45');
});

test('writes reject read-only fields, wrong types and impossible changes', () => {
  const db = openDb(':memory:');
  const event = createEntry(db, { kind: 'event', title: 'Dentist', start: '2026-11-25T15:30', duration: 45 });
  assert.throws(() => updateEntry(db, event.id, { created_by: 'agent' }, NOW), { status: 400, message: /created_by/ });
  assert.throws(() => updateEntry(db, event.id, { migrations: 9 }, NOW), { status: 400, message: /migrations/ });
  assert.throws(() => updateEntry(db, event.id, { id: 7 }, NOW), { status: 400, message: /\bid\b/ });
  assert.throws(() => updateEntry(db, event.id, { routine_id: 1 }, NOW), { status: 400, message: /routine_id/ });
  assert.throws(() => updateEntry(db, event.id, { colour: 'red' }, NOW), { status: 400, message: /colour/ });
  assert.throws(() => updateEntry(db, event.id, { title: { text: 'X' } }, NOW), { status: 400, message: /title/ });
  assert.throws(() => createEntry(db, { kind: 'task', title: 'X', duration: true }), { status: 400 });
  assert.throws(() => createEntry(db, { kind: 'task', title: 'X', duration: 'abc' }), /cannot store TEXT/);
  assert.throws(() => updateEntry(db, event.id, { start: null }, NOW), /kind = 'task' OR start IS NOT NULL/);
  assert.throws(() => updateEntry(db, event.id, { status: 'done' }, NOW), /kind = 'task' OR status <> 'done'/);
  assert.throws(() => updateEntry(db, 999, { title: 'X' }, NOW), { status: 404 });
});
