// Times are wall-clock strings in the app's time zone, like '2026-11-23T09:00'.
// Dates are '2026-11-23'. Date math runs in UTC, so clock changes never shift a day.

export const USE_12_HOUR = true;

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (dateOrTime: string) => new Date(`${dateOrTime.slice(0, 10)}T00:00:00Z`);

/** The wall-clock time right now in an IANA time zone, like '2026-11-25T14:10'. */
export function localNow(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function addDays(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** addMinutes('2026-11-23T23:30', 60) === '2026-11-24T00:30' */
export function addMinutes(time: string, minutes: number): string {
  const d = new Date(`${time}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
}

/** The Monday of the week that contains a date or time. */
export function mondayOf(dateOrTime: string): string {
  const daysSinceMonday = (utc(dateOrTime).getUTCDay() + 6) % 7;
  return addDays(dateOrTime, -daysSinceMonday);
}

/** True only for a real calendar date, written 'YYYY-MM-DD', that falls on a Monday. */
export function isMonday(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = utc(date);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return false;
  return d.getUTCDay() === 1;
}

/** A Date in the browser's local time as a wall-clock string. */
export function fromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

/** '19:30' or '2026-11-25T19:30' becomes '7:30 pm', or '7:30' without the suffix, or '19:30' when USE_12_HOUR is false. */
export function formatTime(time: string, suffix = true): string {
  const hhmm = time.slice(-5);
  if (!USE_12_HOUR) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const clock = `${h % 12 || 12}:${pad(m)}`;
  return suffix ? `${clock} ${h < 12 ? 'am' : 'pm'}` : clock;
}

/** '2026-11-26T14:15' and '2026-11-26T15:00' become 'Thu 2:15 to 3:00 pm'. */
export function formatSpan(start: string, end: string): string {
  const sameHalf = (start.slice(-5) < '12:00') === (end.slice(-5) < '12:00');
  return `${formatDay(start)} ${formatTime(start, !sameHalf)} to ${formatTime(end)}`;
}

/** 90 becomes '1h 30m'. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

/** A typed length in minutes: '75', '45m', '1h', '1h 15m', '1h15' or '1:15'. Null for anything else, or outside 5 minutes to 24 hours. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  const hours = t.match(/^(\d+)\s*h\s*(?:([0-5]?\d)\s*m?)?$/) ?? t.match(/^(\d+):([0-5]\d)$/);
  const minutes = hours ? Number(hours[1]) * 60 + Number(hours[2] ?? 0) : Number(t.match(/^(\d+)\s*m?$/)?.[1]);
  return minutes >= 5 && minutes <= 1440 ? minutes : null; // NaN, from no match, fails this too
}

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** '2026-11-23T19:30' becomes 'Mon'. */
export function formatDay(dateOrTime: string): string {
  return DAY.format(utc(dateOrTime));
}

/** '2026-11-25T14:10' becomes 'Wed 25 Nov'. */
export function formatDate(dateOrTime: string): string {
  return DATE.format(utc(dateOrTime));
}

/** '2026-11-23' becomes '23 to 29 Nov 2026'. */
export function weekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(utc(date));
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  const from = fmt(monday, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${from} to ${fmt(sunday, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** The ISO week number of the week that starts on this Monday. */
export function isoWeek(monday: string): number {
  const thursday = utc(addDays(monday, 3));
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
}
