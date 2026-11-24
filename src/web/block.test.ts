import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyForward, dayDrop, firstLine, habitsFor, isSafeLink, itemMeta, lexNotes, plainText, toggleTask, withinOneDay } from './block.ts';
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
    status: 'open', migrations: 0, routine_id: null, created_by: 'me', day: null,
  };
  assert.equal(itemMeta(base, true), 'was Mon 7:30 pm');
  assert.equal(itemMeta({ ...base, start: null, migrations: 2 }, false), '>2 carried forward');
  assert.equal(itemMeta({ ...base, start: null, created_by: 'agent' }, false), 'added by planner agent');
  assert.equal(itemMeta({ ...base, start: null }, false), '');
  // a habit copy carried over from an earlier day says which day it was
  assert.equal(itemMeta({ ...base, start: null, day: '2026-11-23' }, false, '2026-11-25'), 'from Mon');
  assert.equal(itemMeta({ ...base, start: null, day: '2026-11-25' }, false, '2026-11-25'), '');
});

test('a day offers its own habit copies, and today also offers the carried ones', () => {
  const copy = (id: number, day: string) => ({ id, day }) as Entry;
  const habits = [copy(1, '2026-11-23'), copy(2, '2026-11-25'), copy(3, '2026-11-26')];
  const ids = (day: string) => habitsFor(habits, day, '2026-11-25').map((e) => e.id);
  assert.deepEqual(ids('2026-11-25'), [1, 2]);
  assert.deepEqual(ids('2026-11-26'), [3]);
  assert.deepEqual(ids('2026-11-23'), [1]);
  assert.deepEqual(ids('2026-11-27'), []);
});

test('a description shows its first line that has text', () => {
  assert.equal(firstLine('Call the shop\nask about pads'), 'Call the shop');
  assert.equal(firstLine('\n   \n  Bring the receipt  '), 'Bring the receipt');
});

test('no description shows nothing', () => {
  assert.equal(firstLine(null), '');
  assert.equal(firstLine('  \n '), '');
});

test('a description shows as plain text without its Markdown symbols', () => {
  assert.equal(firstLine('# Shopping list\n- [ ] milk'), 'Shopping list');
  assert.equal(firstLine('- [x] **Call** the `bank`'), 'Call the bank');
  assert.equal(firstLine('[Agenda](https://example.com) for _Monday_'), 'Agenda for Monday');
  assert.equal(firstLine('1. Pack\n2. Go'), 'Pack');
  assert.equal(firstLine('> Quoted ~~not~~ yes'), 'Quoted not yes');
  assert.equal(firstLine('Rename snake_case_name, 2 * 3'), 'Rename snake_case_name, 2 * 3'); // not emphasis
  assert.equal(plainText('## Plan\n\n- [ ] milk\n  - [x] oat\n\nSee **notes**'), 'Plan\nmilk\noat\nSee notes');
  assert.equal(plainText(null), '');
});

test('raw HTML in a description stays as text', () => {
  assert.equal(firstLine('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
});

test('ticking a checklist box rewrites only that line', () => {
  assert.equal(toggleTask('- [ ] milk\n- [ ] eggs', 1), '- [ ] milk\n- [x] eggs');
  assert.equal(toggleTask('- [x] milk', 0), '- [ ] milk');
  assert.equal(toggleTask('* [X] milk', 0), '* [ ] milk');
  assert.equal(toggleTask('- [ ] check [ ] this', 0), '- [x] check [ ] this');
});

test('checklist boxes count like the rendered ones', () => {
  const notes = 'Shop\n  + [ ] nested\n1. [ ] first\n> - [ ] quoted';
  assert.equal(toggleTask(notes, 2), 'Shop\n  + [ ] nested\n1. [ ] first\n> - [x] quoted');
  // a box needs a space and text after it, and fenced code has no boxes
  const tricky = '- [ ]milk\n- [ ]\n```\n- [ ] code\n```\n- [ ] eggs';
  assert.equal(toggleTask(tricky, 0), '- [ ]milk\n- [ ]\n```\n- [ ] code\n```\n- [x] eggs');

  type Node = { type: string; tokens?: Node[]; items?: Node[] };
  const boxes = (tokens: Node[]): number =>
    tokens.reduce((n, t) => n + (t.type === 'checkbox' ? 1 : 0) + boxes(t.tokens ?? []) + boxes(t.items ?? []), 0);
  for (const sample of [notes, tricky]) {
    const count = boxes(lexNotes(sample) as Node[]);
    for (let i = 0; i < count; i++) assert.notEqual(toggleTask(sample, i), sample, `box ${i} of ${sample}`);
    assert.equal(toggleTask(sample, count), sample, `no box after the last in ${sample}`);
  }
});

test('only web and mail links become links', () => {
  for (const href of ['https://example.com', 'http://example.com', 'HTTPS://EXAMPLE.COM', 'mailto:me@example.com']) assert.equal(isSafeLink(href), true, href);
  for (const href of ['javascript:alert(1)', ' javascript:alert(1)', 'data:text/html,hi', 'vbscript:x', '/inbox', '']) assert.equal(isSafeLink(href), false, href);
});

const entry = (fields: Partial<Entry>): Entry => ({
  id: 1, kind: 'task', title: 'x', notes: null, start: null, duration: 30,
  status: 'open', migrations: 0, routine_id: null, created_by: 'me', day: null, ...fields,
});

test('copying a day forward places the next day\'s copies of its placed habits at the same times', () => {
  const placed = [
    entry({ id: 1, routine_id: 7, day: '2026-11-23', start: '2026-11-23T20:00' }), // Gaming, Monday 8 pm
    entry({ id: 2, routine_id: 8, day: '2026-11-23', start: '2026-11-23T22:30' }), // Skin care, Monday 10:30 pm
    entry({ id: 3, routine_id: 9, day: '2026-11-23', start: '2026-11-23T07:00' }), // a habit Tuesday doesn't have
    entry({ id: 4, routine_id: 5, day: null, start: '2026-11-23T08:00' }), // a timed routine, not a habit
    entry({ id: 5, routine_id: 7, day: '2026-11-24', start: '2026-11-24T09:00' }), // Tuesday's own Gaming, already placed
  ];
  const unplaced = [
    entry({ id: 11, routine_id: 7, day: '2026-11-25' }), // Wednesday's Gaming
    entry({ id: 12, routine_id: 8, day: '2026-11-24' }), // Tuesday's Skin care
  ];
  const moves = (day: string) => copyForward(placed, unplaced, day).map((m) => `${m.copy.id} ${m.start}`);
  assert.deepEqual(moves('2026-11-23'), ['12 2026-11-24T22:30']); // Tuesday's Gaming is placed already
  assert.deepEqual(moves('2026-11-24'), ['11 2026-11-25T09:00']);
  assert.deepEqual(moves('2026-11-26'), []);
});

test('dropping an item on a day label gives it that day, and on the inbox takes it away', () => {
  const inboxTask = entry({});
  const dayTask = entry({ day: '2026-11-25' });
  const overdue = entry({ start: '2026-11-23T09:00' });
  const habitCopy = entry({ routine_id: 7, day: '2026-11-25' });
  assert.deepEqual(dayDrop(inboxTask, '2026-11-26'), { day: '2026-11-26' });
  assert.deepEqual(dayDrop(dayTask, '2026-11-26'), { day: '2026-11-26' });
  assert.deepEqual(dayDrop(overdue, '2026-11-26'), { start: null, day: '2026-11-26' }); // its time is gone, the day is new
  assert.deepEqual(dayDrop(dayTask, null), { day: null });
  assert.deepEqual(dayDrop(overdue, null), { start: null });
  assert.deepEqual(dayDrop(entry({ start: '2026-11-23T09:00', day: '2026-11-23' }), null), { start: null, day: null }); // a placed day task, overdue
  assert.equal(dayDrop(dayTask, '2026-11-25'), null); // already there
  assert.equal(dayDrop(inboxTask, null), null);
  assert.equal(dayDrop(habitCopy, '2026-11-26'), null); // habit copies keep their day
});
