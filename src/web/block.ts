import type { Entry } from '../shared/types.ts';

/**
 * What a block on the grid shows: signifier, title and migration count.
 * `entry` is missing for the preview FullCalendar draws while an inbox item is dragged over the grid.
 */
export function blockParts(entry: Entry | undefined, title: string): { sig: string; title: string; migrations: number } {
  if (!entry) return { sig: '•', title, migrations: 0 };
  const sig = entry.kind === 'event' ? '○' : entry.status === 'done' ? '×' : '•';
  return { sig, title: entry.title, migrations: entry.migrations };
}
