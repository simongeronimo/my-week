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
