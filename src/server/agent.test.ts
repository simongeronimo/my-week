import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import type { Entry, WeekView } from '../shared/types.ts';

const APP = 'app-token';
const AGENT = 'agent-token';

function setup() {
  const app = createApp({ db: openDb(':memory:'), appToken: APP, agentToken: AGENT, timeZone: 'UTC', distDir: 'dist' });
  const as = (token: string) => (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { me: as(APP), agent: as(AGENT) };
}

test('the agent can read the week, the routines and its guide', async () => {
  const { agent } = setup();
  assert.equal((await agent('GET', '/api/week?monday=2026-11-23')).status, 200);
  assert.equal((await agent('GET', '/api/routines')).status, 200);
  const guide = await agent('GET', '/api/guide');
  assert.equal(guide.status, 200);
  assert.match(guide.headers.get('content-type') ?? '', /text\/markdown/);
  assert.match(await guide.text(), /add tasks to their inbox/);
});

test('the agent can add inbox tasks, marked as its own', async () => {
  const { agent } = setup();
  const res = await agent('POST', '/api/entries', { kind: 'task', title: 'Book dentist', duration: 15 });
  assert.equal(res.status, 201);
  assert.equal(((await res.json()) as Entry).created_by, 'agent');
});

test('the agent gets 403 for everything else, and nothing changes', async () => {
  const { me, agent } = setup();
  const mine = (await (await me('POST', '/api/entries', { kind: 'task', title: 'Mine', duration: 30 })).json()) as Entry;
  const forbidden: [string, string, unknown?][] = [
    ['POST', '/api/entries', { kind: 'task', title: 'X', duration: 30, start: '2026-11-26T18:00' }],
    ['POST', '/api/entries', { kind: 'event', title: 'X', duration: 30, start: '2026-11-26T18:00' }],
    ['PATCH', `/api/entries/${mine.id}`, { status: 'done' }],
    ['DELETE', `/api/entries/${mine.id}`],
    ['POST', '/api/routines', { kind: 'event', title: 'X', days: 'MTWTF..', at: '08:00', duration: 60 }],
    ['DELETE', '/api/routines/1'],
  ];
  for (const [method, path, body] of forbidden) {
    assert.equal((await agent(method, path, body)).status, 403, `${method} ${path}`);
  }
  const week = (await (await me('GET', '/api/week?monday=2026-11-23')).json()) as WeekView;
  assert.deepEqual(week.inbox.map((e) => [e.title, e.status]), [['Mine', 'open']]);
});

test('without AGENT_TOKEN set, the agent token is just a wrong token', async () => {
  const app = createApp({ db: openDb(':memory:'), appToken: APP, timeZone: 'UTC', distDir: 'dist' });
  assert.equal((await app.request('/api/week', { headers: { Authorization: `Bearer ${AGENT}` } })).status, 401);
});
