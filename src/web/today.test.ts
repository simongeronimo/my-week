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
