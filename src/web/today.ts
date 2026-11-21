import { addDays, addMinutes } from '../shared/time.ts';
import type { Entry } from '../shared/types.ts';

/** The first open entry that starts after now, tomorrow or later if nothing is left today. */
export function nextEntry(entries: Entry[], now: string): Entry | undefined {
  return entries
    .filter((e) => e.start !== null && e.status === 'open' && e.start > now)
    .sort((a, b) => a.start!.localeCompare(b.start!))[0];
}

export type DayRow = { type: 'entry'; entry: Entry } | { type: 'free'; minutes: number; past: boolean } | { type: 'now' };

/** Free time shorter than this, in minutes, gets no line. */
const MIN_FREE = 30;

const minutesFrom = (from: string, to: string) => (Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 60_000;

/**
 * Today's list on the phone: every entry that touches today in time order (ticked ones too, cancelled ones not),
 * a line for free time between them, and a line where now is. Free time only counts when nothing is planned,
 * so the hours inside a work block aren't free, and free time that has started counts from now.
 */
export function dayRows(entries: Entry[], now: string): DayRow[] {
  const day = now.slice(0, 10);
  const dayStart = `${day}T00:00`;
  const dayEnd = `${addDays(day, 1)}T00:00`;
  const items = entries
    .filter((e) => e.start !== null && e.status !== 'cancelled' && e.start < dayEnd && addMinutes(e.start, e.duration) > dayStart)
    .sort((a, b) => a.start!.localeCompare(b.start!));

  const rows: DayRow[] = [];
  const free = (from: string, to: string, past: boolean) => {
    const minutes = minutesFrom(from, to);
    if (minutes >= MIN_FREE) rows.push({ type: 'free', minutes, past });
  };
  let busyUntil: string | null = null; // the latest end so far
  let nowPlaced = false;
  for (const entry of items) {
    const start = entry.start!;
    const gap = busyUntil !== null && busyUntil < start;
    if (!nowPlaced && start > now) {
      nowPlaced = true;
      rows.push({ type: 'now' });
      if (gap) free(busyUntil! > now ? busyUntil! : now, start, false);
    } else if (gap) {
      free(busyUntil!, start, start <= now);
    }
    rows.push({ type: 'entry', entry });
    const end = addMinutes(start, entry.duration);
    if (busyUntil === null || end > busyUntil) busyUntil = end;
  }
  if (items.length > 0 && !nowPlaced) rows.push({ type: 'now' });
  return rows;
}

/**
 * Columns for entries that overlap, like the dentist during work: each entry gets a column,
 * and every entry in a group of overlapping ones knows how many columns the group needs.
 */
export function lanes(entries: Entry[]): Map<number, { col: number; cols: number }> {
  const result = new Map<number, { col: number; cols: number }>();
  let group: Array<{ id: number; col: number }> = [];
  let columnEnds: string[] = []; // when the last entry in each column of the group ends
  let groupEnd = '';
  const closeGroup = () => {
    for (const { id, col } of group) result.set(id, { col, cols: columnEnds.length });
    group = [];
    columnEnds = [];
  };
  for (const entry of [...entries].sort((a, b) => a.start!.localeCompare(b.start!))) {
    const start = entry.start!;
    const end = addMinutes(start, entry.duration);
    if (start >= groupEnd) closeGroup();
    let col = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (col === -1) col = columnEnds.length;
    columnEnds[col] = end;
    group.push({ id: entry.id, col });
    if (end > groupEnd) groupEnd = end;
  }
  closeGroup();
  return result;
}

/** The grid's hours in minutes, 6 am to midnight. The timeline you see while dragging on the phone covers the same. */
export const TIMELINE_FROM = 6 * 60;
export const TIMELINE_TO = 24 * 60;
export const TIMELINE_MINUTES = TIMELINE_TO - TIMELINE_FROM;
/** A drag moves a start in steps of this many minutes, like the grid. */
export const STEP = 15;

/** Minutes from 6 am on day to a time, held between 0 and the end of the timeline at midnight. */
export function timelineMinute(time: string, day: string): number {
  return Math.min(TIMELINE_TO, Math.max(TIMELINE_FROM, minutesFrom(`${day}T00:00`, time))) - TIMELINE_FROM;
}

/** A start moved by a drag of some minutes: in 15-minute steps, and kept between 6 am and midnight. */
export function shiftStart(start: string, duration: number, minutes: number): string {
  const day = start.slice(0, 10);
  const moved = minutesFrom(`${day}T00:00`, start) + Math.round(minutes / STEP) * STEP;
  const latest = Math.max(TIMELINE_FROM, TIMELINE_TO - duration);
  return addMinutes(`${day}T00:00`, Math.min(latest, Math.max(TIMELINE_FROM, moved)));
}

/** Where the day grid opens: an hour before now on today, so what's coming is in view, and 7 am on other days. */
export function scrollTimeFor(day: string, now: string): string {
  if (day !== now.slice(0, 10)) return '07:00:00';
  const hour = Math.max(0, Number(now.slice(11, 13)) - 1);
  return `${String(hour).padStart(2, '0')}:00:00`;
}
