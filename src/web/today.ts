import { addMinutes, formatDay, formatDuration, formatTime } from '../shared/time.ts';
import type { Entry } from '../shared/types.ts';

export type TodayView = { now: Entry | null; next: Entry | null; later: Entry[] };

/**
 * Splits scheduled entries around a wall-clock time:
 * `now` is the latest-started entry still running (the dentist, not the work block around it),
 * `next` is the first entry after now, tomorrow if nothing is left today,
 * and `later` is the rest of today. Ticked and cancelled entries are left out.
 */
export function todayView(entries: Entry[], now: string): TodayView {
  const open = entries
    .filter((e) => e.start !== null && e.status === 'open')
    .sort((a, b) => a.start!.localeCompare(b.start!));
  const running = open.filter((e) => e.start! <= now && addMinutes(e.start!, e.duration) > now);
  const upcoming = open.filter((e) => e.start! > now);
  return {
    now: running.at(-1) ?? null,
    next: upcoming[0] ?? null,
    later: upcoming.slice(1).filter((e) => e.start!.slice(0, 10) === now.slice(0, 10)),
  };
}

/** A line's time, with the day in front when it isn't today: '7:30 pm' or 'Thu 8:00 am'. */
export function lineTime(start: string, now: string): string {
  return start.slice(0, 10) === now.slice(0, 10) ? formatTime(start) : `${formatDay(start)} ${formatTime(start)}`;
}

/** A start and duration as '3:30 pm to 4:15 pm', for the Now card. */
export function timeRange(start: string, duration: number): string {
  return `${formatTime(start)} to ${formatTime(addMinutes(start, duration))}`;
}

/** The time from one wall-clock time to another, like '2h 50m'. */
export function until(from: string, to: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(`${to}:00Z`) - Date.parse(`${from}:00Z`)) / 60_000));
  return formatDuration(minutes) || '0m';
}
