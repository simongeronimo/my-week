import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstLine, itemMeta, withinOneDay } from './block.ts';
import type { Entry } from '../shared/types.ts';

test('a selection on the grid must stay within one day', () => {
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute); // local time
  assert.equal(withinOneDay(at(25, 20), at(25, 21)), true);
  assert.equal(withinOneDay(at(25, 23, 30), at(26, 0)), true); // the end is exclusive, so midnight still counts
  assert.equal(withinOneDay(at(25, 20), at(26, 9)), false); // a diagonal drag into the next day
});

test('an inbox item notes where it came from', () => {
  const base: Entry = {
    id: 1, kind: 'task', title: 'Call the bank', notes: null, start: '2026-11-23T19:30', duration: 30,
    status: 'open', migrations: 0, routine_id: null, created_by: 'me',
  };
  assert.equal(itemMeta(base, true), 'was Mon 7:30 pm');
  assert.equal(itemMeta({ ...base, start: null, migrations: 2 }, false), '>2 carried forward');
  assert.equal(itemMeta({ ...base, start: null, created_by: 'agent' }, false), 'added by planner agent');
  assert.equal(itemMeta({ ...base, start: null }, false), '');
});

test('a description shows its first line that has text', () => {
  assert.equal(firstLine('Call the shop\nask about pads'), 'Call the shop');
  assert.equal(firstLine('\n   \n  Bring the receipt  '), 'Bring the receipt');
});

test('no description shows nothing', () => {
  assert.equal(firstLine(null), '');
  assert.equal(firstLine('  \n '), '');
});
