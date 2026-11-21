import type { Entry } from '../shared/types.ts';
import { addMinutes } from '../shared/time.ts';

/**
 * The entries that followed a moved block back to back on its old day, which it pushes along.
 * Each one starts exactly where the block or an earlier one in the chain ends, so the first gap stops the chain.
 */
export function blocksBehind(entries: Entry[], moved: Entry, oldStart: string): Entry[] {
  const day = oldStart.slice(0, 10);
  const ends = new Set([addMinutes(oldStart, moved.duration)]);
  const chain: Entry[] = [];
  const sameDay = entries.filter((e) => e.id !== moved.id && e.status !== 'cancelled' && e.start?.startsWith(day));
  for (const entry of sameDay.sort((a, b) => a.start!.localeCompare(b.start!))) {
    if (!ends.has(entry.start!)) continue;
    chain.push(entry);
    ends.add(addMinutes(entry.start!, entry.duration));
  }
  return chain;
}
