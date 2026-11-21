import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysLabel, daysPattern, minutesUntil, routineLabel } from './routines.ts';

test('seven day toggles become the days pattern the API expects', () => {
  assert.equal(daysPattern([true, true, true, true, true, false, false]), 'MTWTF..');
  assert.equal(daysPattern([false, false, true, false, false, false, false]), '..W....');
});

test('a days pattern reads as plain words', () => {
  assert.equal(daysLabel('MTWTFSS'), 'Every day');
  assert.equal(daysLabel('MTWTF..'), 'Mon to Fri');
  assert.equal(daysLabel('M.W.F..'), 'Mon, Wed, Fri');
  assert.equal(daysLabel('.....SS'), 'Sat, Sun');
  assert.equal(daysLabel('..W....'), 'Wed');
});

test('an end time becomes the minutes from the start', () => {
  assert.equal(minutesUntil('09:00', '17:00'), 480);
  assert.equal(minutesUntil('08:15', '08:45'), 30);
});

test('an end time before the start means the next morning', () => {
  assert.equal(minutesUntil('23:00', '07:00'), 480);
});

test('an end time equal to the start gives no length', () => {
  assert.equal(minutesUntil('08:00', '08:00'), 0);
});

test('a routine reads as its days, time and length, and a habit as any time', () => {
  const routine = { days: 'MTWTF..', at: '08:00', duration: 540, carry: 0 } as const;
  assert.equal(routineLabel(routine), 'Mon to Fri, 8:00 am, 9h');
  assert.equal(routineLabel({ ...routine, days: 'MTWTFSS', at: null, duration: 60, carry: 1 }), 'Every day, any time, 1h, carries over');
  assert.equal(routineLabel({ ...routine, at: null, duration: 20 }), 'Mon to Fri, any time, 20m');
});
