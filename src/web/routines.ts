export const DAY_LETTERS = 'MTWTFSS';
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Seven toggles, Monday first, become 'MTWTF..': a letter for each day on, a dot for each day off. */
export function daysPattern(on: boolean[]): string {
  return on.map((day, i) => (day ? DAY_LETTERS[i] : '.')).join('');
}

/** 'MTWTFSS' becomes 'Every day', 'MTWTF..' becomes 'Mon to Fri', 'M.W.F..' becomes 'Mon, Wed, Fri'. */
export function daysLabel(pattern: string): string {
  if (pattern === 'MTWTFSS') return 'Every day';
  const on = [...pattern].flatMap((letter, i) => (letter === '.' ? [] : [i]));
  const inARow = on.length > 2 && on.every((day, k) => k === 0 || day === on[k - 1] + 1);
  if (inARow) return `${DAY_NAMES[on[0]]} to ${DAY_NAMES[on.at(-1)!]}`;
  return on.map((day) => DAY_NAMES[day]).join(', ');
}

/** Minutes from '09:00' to '17:00' (480). An end before the start means the next morning: '23:00' to '07:00' is 480. */
export function minutesUntil(at: string, end: string): number {
  const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return (toMinutes(end) - toMinutes(at) + 1440) % 1440;
}
