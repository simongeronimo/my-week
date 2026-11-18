import { addMinutes } from '../shared/time.ts';
import type { Entry } from '../shared/types.ts';

// The calendar feed in iCalendar format (RFC 5545), written by hand: it is plain text with three rules.

/** Backslash, semicolon, comma and newline need a backslash in front (RFC 5545, 3.3.11). */
const escapeText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** '2026-11-25T19:30' becomes '20261125T193000', a floating time that iPhone reads as local time. */
const icsTime = (time: string) => `${time.replace(/[-:]/g, '')}00`;

const signifier = (e: Entry) => (e.kind === 'event' ? '○' : e.status === 'done' ? '×' : '•');

/** Lines longer than 75 octets continue on the next line after a space, never inside a UTF-8 character (RFC 5545, 3.1). */
export function fold(line: string): string {
  const pieces: string[] = [];
  let piece = '';
  let octets = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    const limit = pieces.length === 0 ? 75 : 74; // continuation lines spend one octet on the leading space
    if (octets + size > limit) {
      pieces.push(piece);
      piece = '';
      octets = 0;
    }
    piece += char;
    octets += size;
  }
  pieces.push(piece);
  return pieces.join('\r\n ');
}

/** One VEVENT per scheduled entry. Cancelled entries and inbox tasks stay out. */
export function toIcs(entries: Entry[], now: Date): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//my-week//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:my-week'];
  for (const e of entries) {
    if (e.start === null || e.status === 'cancelled') continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:entry-${e.id}@my-week`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(e.start)}`,
      `DTEND:${icsTime(addMinutes(e.start, e.duration))}`,
      `SUMMARY:${escapeText(`${signifier(e)} ${e.title}`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
