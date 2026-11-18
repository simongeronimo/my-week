import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysLabel, daysPattern } from './routines.ts';

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
