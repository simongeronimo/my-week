import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import type { Entry, WeekView } from '../shared/types.ts';

const TOKEN = 'test-token';
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

function setup() {
  const app = createApp({ db: openDb(':memory:'), appToken: TOKEN, timeZone: 'UTC', distDir: 'dist' });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers, body: typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body) });
  return { app, send };
}

test('every API route needs the right token', async () => {
  const { app } = setup();
  assert.equal((await app.request('/api/week')).status, 401);
  assert.equal((await app.request('/api/week', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await app.request('/api/week', { headers })).status, 200);
});

test('a task goes from the inbox onto the week', async () => {
  const { send } = setup();
  const task = (await (await send('POST', '/api/entries', { kind: 'task', title: 'Fix bike brakes', duration: 45 })).json()) as Entry;
  let week = (await (await send('GET', '/api/week?monday=2026-11-23')).json()) as WeekView;
  assert.deepEqual(week.inbox.map((e) => e.title), ['Fix bike brakes']);
  await send('PATCH', `/api/entries/${task.id}`, { start: '2026-11-26T18:00' });
  week = (await (await send('GET', '/api/week?monday=2026-11-23')).json()) as WeekView;
  assert.deepEqual(week.inbox, []);
  assert.deepEqual(week.entries.map((e) => e.start), ['2026-11-26T18:00']);
});

test('bad requests get a JSON error with the right status', async () => {
  const { send } = setup();
  for (const monday of ['2026-11-24', '2026-02-30', 'abc']) {
    assert.equal((await send('GET', `/api/week?monday=${monday}`)).status, 400, monday);
  }
  const bad = await send('POST', '/api/entries', { kind: 'task', title: 'X', duration: 0 });
  assert.equal(bad.status, 400);
  assert.match(((await bad.json()) as { error: string }).error, /duration BETWEEN 5 AND 1440/);
  const wrongType = await send('POST', '/api/entries', { kind: 'task', title: 'X', duration: 'abc' });
  assert.equal(wrongType.status, 400); // SQLite's datatype error, not only CHECK failures, maps to 400
  assert.match(((await wrongType.json()) as { error: string }).error, /cannot store TEXT/);
  assert.equal((await send('POST', '/api/entries', '{not json')).status, 400);
  assert.equal((await send('POST', '/api/entries', '[1, 2]')).status, 400);
  assert.equal((await send('POST', '/api/routines', {})).status, 400);
  assert.equal((await send('PATCH', '/api/entries/999', { title: 'X' })).status, 404);
  assert.equal((await send('DELETE', '/api/entries/abc')).status, 404);
  assert.equal((await send('GET', '/api/nope')).status, 404);
});
