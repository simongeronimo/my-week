import { Lexer } from 'marked';
import type { Entry } from '../shared/types.ts';
import { formatDay, formatTime, fromDate } from '../shared/time.ts';

/** The small note under an inbox item: when an unfinished task was planned, a carried habit's day, migrations, and who added it. */
export function itemMeta(entry: Entry, unfinished: boolean, today = ''): string {
  return [
    unfinished && entry.start ? `was ${formatDay(entry.start)} ${formatTime(entry.start)}` : '',
    entry.day && entry.day < today ? `from ${formatDay(entry.day)}` : '',
    entry.migrations > 0 ? `>${entry.migrations} carried forward` : '',
    entry.created_by === 'agent' ? 'added by planner agent' : '',
  ].filter(Boolean).join(', ');
}

/** The habit copies to offer on a day: that day's, plus the carried ones when the day is today. */
export function habitsFor(habits: Entry[], day: string, today: string): Entry[] {
  return habits.filter((e) => e.day === day || (day === today && e.day! < today));
}

/** A selection must stay within one day. Its end is exclusive, so a slot ending at midnight still counts. */
export function withinOneDay(start: Date, end: Date): boolean {
  return fromDate(start).slice(0, 10) === fromDate(new Date(end.getTime() - 1)).slice(0, 10);
}

/**
 * Parses a description's Markdown. A single line break stays a line break, as people typed it in the old plain text box.
 * The options replace marked's defaults rather than add to them, so gfm must be set again.
 */
export const lexNotes = (notes: string) => Lexer.lex(notes, { gfm: true, breaks: true });

type Tok = { type: string; text?: string; tokens?: Tok[]; items?: { tokens: Tok[] }[] };
const blocks = (tokens: Tok[]): string => tokens.map(block).filter(Boolean).join('\n');
const block = (t: Tok): string =>
  t.items ? t.items.map((item) => blocks(item.tokens)).join('\n')
  : t.type === 'blockquote' ? blocks(t.tokens!)
  : t.tokens ? inline(t.tokens)
  : t.text ?? ''; // code and raw HTML keep their text, and boxes, rules and blank lines have none
const inline = (tokens: Tok[]): string => tokens.map((t) => (t.type === 'br' ? '\n' : t.tokens ? inline(t.tokens) : t.text ?? '')).join('');

/** A description's text without its Markdown symbols, one line per paragraph line, heading or list item. */
export function plainText(notes: string | null): string {
  return notes ? blocks(lexNotes(notes) as Tok[]) : '';
}

/** The first line of a description that has any text, for the one-line preview in lists. */
export function firstLine(notes: string | null): string {
  return plainText(notes).split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

// A list item that starts with a box, using marked's rule that a space and some text follow the box
const TASK = /^(\s*(?:>\s*)*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])(?=\][ \t]+\S)/;

/**
 * Ticks or unticks the description's checklist box at index, counting boxes from the top as the dialog renders them.
 * ponytail: counts by line, so a box line inside an indented code block or raw HTML would shift the count.
 */
export function toggleTask(notes: string, index: number): string {
  let fenced = false;
  let seen = 0;
  return notes
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced || !TASK.test(line) || seen++ !== index) return line;
      return line.replace(TASK, (_, before: string, mark: string) => before + (mark === ' ' ? 'x' : ' '));
    })
    .join('\n');
}

/** Only web and mail links open from a description, because the agent can write descriptions too. */
export const isSafeLink = (href: string) => /^(https?|mailto):/i.test(href);
