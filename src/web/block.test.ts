import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockParts, withinOneDay } from './block.ts';
import type { Entry } from '../shared/types.ts';

test('the drag preview of an inbox item renders without an entry', () => {
  // While an inbox item is dragged over the grid, FullCalendar draws a preview event whose
  // extendedProps are empty, and it still renders that preview through eventContent.
  const previewProps: Record<string, unknown> = {};
  assert.deepEqual(blockParts(previewProps.entry as Entry | undefined, 'Fix bike brakes'), {
    sig: '•',
    title: 'Fix bike brakes',
    migrations: 0,
  });
});

test('a selection on the grid must stay within one day', () => {
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute); // local time
  assert.equal(withinOneDay(at(25, 20), at(25, 21)), true);
  assert.equal(withinOneDay(at(25, 23, 30), at(26, 0)), true); // the end is exclusive, so midnight still counts
  assert.equal(withinOneDay(at(25, 20), at(26, 9)), false); // a diagonal drag into the next day
});

test('a saved entry shows its own signifier, title and migration count', () => {
  const entry: Entry = {
    id: 1, kind: 'task', title: 'Call the bank', notes: null, start: '2026-11-23T19:30', duration: 30,
    status: 'done', migrations: 2, routine_id: null, created_by: 'me',
  };
  assert.deepEqual(blockParts(entry, 'ignored'), { sig: '×', title: 'Call the bank', migrations: 2 });
});
