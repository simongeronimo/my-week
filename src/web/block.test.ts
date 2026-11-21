import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstLine, isSafeLink, itemMeta, lexNotes, plainText, toggleTask, withinOneDay } from './block.ts';
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
