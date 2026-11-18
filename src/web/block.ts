import type { Entry } from '../shared/types.ts';
import { fromDate } from '../shared/time.ts';

/** A selection must stay within one day. Its end is exclusive, so a slot ending at midnight still counts. */
export function withinOneDay(start: Date, end: Date): boolean {
  return fromDate(start).slice(0, 10) === fromDate(new Date(end.getTime() - 1)).slice(0, 10);
}

/**
 * What a block on the grid shows: signifier, title and migration count.
 * `entry` is missing for the preview FullCalendar draws while an inbox item is dragged over the grid.
 */
export function blockParts(entry: Entry | undefined, title: string): { sig: string; title: string; migrations: number } {
  if (!entry) return { sig: '•', title, migrations: 0 };
  const sig = entry.kind === 'event' ? '○' : entry.status === 'done' ? '×' : '•';
  return { sig, title: entry.title, migrations: entry.migrations };
}
