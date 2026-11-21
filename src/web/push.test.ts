import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocksBehind } from './push.ts';
import type { Entry } from '../shared/types.ts';

const at = (id: number, start: string | null, duration = 30, more: Partial<Entry> = {}): Entry => ({
  id, kind: 'task', title: `Block ${id}`, notes: null, start, duration,
  status: 'open', migrations: 0, routine_id: null, created_by: 'me', ...more,
});
const ids = (entries: Entry[]) => entries.map((e) => e.id);
const moved = at(1, '2026-11-23T09:00');

test('a moved block pushes the ones that follow it back to back, up to the first gap', () => {
  const week = [moved, at(2, '2026-11-23T09:30', 60, { kind: 'event' }), at(3, '2026-11-23T10:30', 15), at(4, '2026-11-23T11:00')];
  assert.deepEqual(ids(blocksBehind(week, moved, '2026-11-23T09:00')), [2, 3]);
});

test('the chain follows the old place, even when the entry already has its new start', () => {
  const dropped = at(1, '2026-11-23T14:00');
  assert.deepEqual(ids(blocksBehind([dropped, at(2, '2026-11-23T09:30')], dropped, '2026-11-23T09:00')), [2]);
});

test('a gap right after the block pushes nothing', () => {
  assert.deepEqual(blocksBehind([moved, at(2, '2026-11-23T09:45')], moved, '2026-11-23T09:00'), []);
});

test('the chain stays on the old day', () => {
  const late = at(1, '2026-11-23T23:00', 60);
  assert.deepEqual(blocksBehind([late, at(2, '2026-11-24T00:00')], late, '2026-11-23T23:00'), []);
});

test('cancelled and unplaced entries never count, so they leave a gap', () => {
  const week = [moved, at(2, '2026-11-23T09:30', 30, { status: 'cancelled' }), at(3, '2026-11-23T10:00'), at(4, null)];
  assert.deepEqual(blocksBehind(week, moved, '2026-11-23T09:00'), []);
});

test('every block that starts where a pushed one ends counts', () => {
  const week = [moved, at(3, '2026-11-23T09:30', 60), at(4, '2026-11-23T10:30'), at(2, '2026-11-23T09:30', 30)];
  assert.deepEqual(ids(blocksBehind(week, moved, '2026-11-23T09:00')), [3, 2, 4]);
});
