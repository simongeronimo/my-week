import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayRows, lanes, lineTime, scrollTimeFor, shiftStart, timelineMinute, todayView } from './today.ts';
import type { DayRow } from './today.ts';
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

test('a line names the day when it is not today', () => {
  assert.equal(lineTime('2026-11-25T19:30', '2026-11-25T14:10'), '7:30 pm');
  assert.equal(lineTime('2026-11-26T08:00', '2026-11-25T21:00'), 'Thu 8:00 am');
});

test('the day grid opens an hour before now on today, and at 7 am on other days', () => {
  assert.equal(scrollTimeFor('2026-11-25', '2026-11-25T14:10'), '13:00:00');
  assert.equal(scrollTimeFor('2026-11-25', '2026-11-25T00:20'), '00:00:00'); // just after midnight
  assert.equal(scrollTimeFor('2026-11-26', '2026-11-25T21:00'), '07:00:00'); // arranging tomorrow
});

const show = (row: DayRow) => (row.type === 'entry' ? `entry ${row.entry.id}` : row.type === 'free' ? `free ${row.minutes}${row.past ? ' past' : ''}` : 'now');

test('the day lists today in time order, with free time between entries and a now line', () => {
  const rows = dayRows([
    at(1, '2026-11-25T07:30', 60, { kind: 'task', status: 'done' }), // gym, ends 8:30
    at(2, '2026-11-25T09:00', 480), // work, running now
    at(3, '2026-11-25T12:30', 15, { kind: 'task' }), // during work, so no free time before it
    at(4, '2026-11-25T18:30', 45, { kind: 'task' }),
    at(5, '2026-11-26T08:00', 540), // tomorrow
    at(6, '2026-11-25T10:00', 30, { status: 'cancelled' }),
  ], '2026-11-25T11:42');
  assert.deepEqual(rows.map(show), ['entry 1', 'free 30 past', 'entry 2', 'now', 'entry 3', 'free 90', 'entry 4']);
});

test('free time that has already started counts from now', () => {
  const rows = dayRows([at(1, '2026-11-25T08:00', 60), at(2, '2026-11-25T12:00', 60)], '2026-11-25T10:00');
  assert.deepEqual(rows.map(show), ['entry 1', 'now', 'free 120', 'entry 2']);
});

test('free time under 30 minutes is left out', () => {
  const rows = dayRows([at(1, '2026-11-25T08:00', 60), at(2, '2026-11-25T09:15', 30), at(3, '2026-11-25T11:00', 60)], '2026-11-25T10:45');
  assert.deepEqual(rows.map(show), ['entry 1', 'entry 2', 'now', 'entry 3']); // 9:00 to 9:15 is short, and only 15m of 9:45 to 11:00 is left
});

test('the now line goes first or last when nothing is before or after it', () => {
  assert.deepEqual(dayRows([at(1, '2026-11-25T08:00', 60)], '2026-11-25T07:00').map(show), ['now', 'entry 1']);
  assert.deepEqual(dayRows([at(1, '2026-11-25T08:00', 60)], '2026-11-25T21:00').map(show), ['entry 1', 'now']);
  assert.deepEqual(dayRows([], '2026-11-25T21:00'), []);
});

test('an entry from last night that is still running shows up today', () => {
  const rows = dayRows([at(1, '2026-11-24T23:00', 480), at(2, '2026-11-24T20:00', 60)], '2026-11-25T06:00');
  assert.deepEqual(rows.map(show), ['entry 1', 'now']);
});

test('overlapping entries sit side by side, and the rest get the whole width', () => {
  const lane = lanes([
    at(1, '2026-11-25T09:00', 480), // work
    at(2, '2026-11-25T12:30', 15), // during work
    at(3, '2026-11-25T14:00', 60), // during work, after 2
    at(4, '2026-11-25T18:30', 45),
  ]);
  assert.deepEqual(lane.get(1), { col: 0, cols: 2 });
  assert.deepEqual(lane.get(2), { col: 1, cols: 2 });
  assert.deepEqual(lane.get(3), { col: 1, cols: 2 });
  assert.deepEqual(lane.get(4), { col: 0, cols: 1 });
});

test('three entries at once get three columns', () => {
  const lane = lanes([at(1, '2026-11-25T09:00', 60), at(2, '2026-11-25T09:00', 30), at(3, '2026-11-25T09:15', 30)]);
  assert.deepEqual([1, 2, 3].map((id) => lane.get(id)), [{ col: 0, cols: 3 }, { col: 1, cols: 3 }, { col: 2, cols: 3 }]);
});

test('a drag moves a start in 15-minute steps and keeps its odd minutes', () => {
  assert.equal(shiftStart('2026-11-25T12:30', 15, 52), '2026-11-25T13:15');
  assert.equal(shiftStart('2026-11-25T09:05', 30, 7), '2026-11-25T09:05'); // too small to count
  assert.equal(shiftStart('2026-11-25T09:05', 30, -8), '2026-11-25T08:50');
});

test('a drag stops at 6 am and at midnight', () => {
  assert.equal(shiftStart('2026-11-25T07:00', 60, -300), '2026-11-25T06:00');
  assert.equal(shiftStart('2026-11-25T22:00', 90, 300), '2026-11-25T22:30');
});

test('the timeline counts minutes from 6 am to midnight', () => {
  assert.equal(timelineMinute('2026-11-25T06:00', '2026-11-25'), 0);
  assert.equal(timelineMinute('2026-11-25T11:42', '2026-11-25'), 342);
  assert.equal(timelineMinute('2026-11-25T05:00', '2026-11-25'), 0); // before 6 am
  assert.equal(timelineMinute('2026-11-26T00:30', '2026-11-25'), 1080); // after midnight
  assert.equal(timelineMinute('2026-11-24T23:00', '2026-11-25'), 0); // last night
});
