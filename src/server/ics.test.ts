import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { createEntry } from './week.ts';
import { toIcs } from './ics.ts';
import { addDays, localNow, mondayOf } from '../shared/time.ts';
import type { Entry } from '../shared/types.ts';

const NOW = new Date('2026-11-18T12:00:00Z');
const entry = (over: Partial<Entry>): Entry => ({
  id: 1, kind: 'task', title: 'X', notes: null, start: '2026-11-25T19:30', duration: 60,
  status: 'open', migrations: 0, routine_id: null, created_by: 'me', day: null, ...over,
});

test('each entry becomes an event with floating times and its signifier', () => {
  const ics = toIcs([
    entry({ id: 7, title: 'Project report' }),
    entry({ id: 8, kind: 'event', title: 'Dentist', start: '2026-11-26T15:30', duration: 45 }),
    entry({ id: 9, title: 'Groceries', status: 'done', start: '2026-11-24T17:45', duration: 45 }),
  ], NOW);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('UID:entry-7@my-week\r\nDTSTAMP:20261118T120000Z\r\nDTSTART:20261125T193000\r\nDTEND:20261125T203000\r\nSUMMARY:• Project report\r\n'));
  assert.ok(ics.includes('SUMMARY:○ Dentist\r\n'));
  assert.ok(ics.includes('SUMMARY:× Groceries\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends in CRLF');
});

test('text is escaped and long lines fold without splitting a character', () => {
  const title = 'Groceries, then laundry; café ' + 'é'.repeat(60);
  const ics = toIcs([entry({ title })], NOW);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `${Buffer.byteLength(line)} octets: ${line}`);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes(`SUMMARY:• ${title.replace(',', '\\,').replace(';', '\\;')}\r\n`));
});

test('control characters in a title cannot break or inject lines', () => {
  // the agent can send any title; a bare CR would start a new property line in the feed
  const ics = toIcs([entry({ title: 'a\rDTSTART:20300101T000000\u0007b' })], NOW);
  assert.ok(!/\r(?!\n)/.test(ics), 'no bare CR');
  assert.ok(!ics.includes('\u0007'), 'no control characters');
  assert.ok(ics.includes('SUMMARY:• a\\nDTSTART:20300101T000000b\r\n'));
});

test('cancelled and unscheduled entries stay out of the feed', () => {
  const ics = toIcs([entry({ id: 1, status: 'cancelled' }), entry({ id: 2, start: null })], NOW);
  assert.ok(!ics.includes('BEGIN:VEVENT'));
});

test('the feed answers only to FEED_TOKEN in the URL', async () => {
  const db = openDb(':memory:');
  const wednesday = addDays(mondayOf(localNow('UTC')), 2);
  createEntry(db, { kind: 'event', title: 'Dentist', start: `${wednesday}T15:30`, duration: 45 });
  const app = createApp({ db, appToken: 'app', feedToken: 'feed', timeZone: 'UTC', distDir: 'dist' });
  assert.equal((await app.request('/calendar.ics')).status, 401);
  assert.equal((await app.request('/calendar.ics?token=wrong')).status, 401);
  assert.equal((await app.request('/calendar.ics?token=app')).status, 401); // the app token is not a feed token
  const res = await app.request('/calendar.ics?token=feed');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/calendar/);
  assert.match(await res.text(), /SUMMARY:○ Dentist/);
  const off = createApp({ db, appToken: 'app', timeZone: 'UTC', distDir: 'dist' });
  assert.equal((await off.request('/calendar.ics?token=feed')).status, 404);
});
