import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockParts } from './block.ts';
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

test('a saved entry shows its own signifier, title and migration count', () => {
  const entry: Entry = {
    id: 1, kind: 'task', title: 'Call the bank', notes: null, start: '2026-11-23T19:30', duration: 30,
    status: 'done', migrations: 2, routine_id: null, created_by: 'me',
  };
  assert.deepEqual(blockParts(entry, 'ignored'), { sig: '×', title: 'Call the bank', migrations: 2 });
});
