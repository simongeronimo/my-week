import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMinutes, formatDate, formatDuration, formatTime, isMonday, isoWeek, localNow, mondayOf, weekLabel } from './time.ts';

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
  assert.equal(formatDate('2026-11-25T14:10'), 'Wed 25 Nov');
});
