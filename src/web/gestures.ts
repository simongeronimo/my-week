import { useRef } from 'react';
import type { DateClickArg, EventDragStartArg } from '@fullcalendar/interaction';
import type { Entry } from '../shared/types.ts';

export type Sample = { x: number; y: number; t: number };
type Velocity = { vx: number; vy: number };

/** Pixels per millisecond the pointer must still be moving when you let go for a drag to count as a throw. Tune by feel. */
const THROW_SPEED = 1.2;
/** How far back, in ms, the speed at release is measured. */
const RELEASE_WINDOW = 100;
/** Two taps on the same time within this many ms are a double tap or double click. */
const DOUBLE_TAP_MS = 400;

/**
 * Pointer samples from a drag, and the moment it was let go, become the throw's speed and direction,
 * or null when the pointer was moving slowly or had stopped at release.
 */
export function throwVelocity(samples: Sample[], releasedAt: number): Velocity | null {
  const recent = samples.filter((s) => s.t >= releasedAt - RELEASE_WINDOW);
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent.at(-1)!;
  const elapsed = releasedAt - first.t; // runs to the release, so a pause before letting go slows the throw down
  if (elapsed <= 0) return null;
  const velocity = { vx: (last.x - first.x) / elapsed, vy: (last.y - first.y) / elapsed };
  return Math.hypot(velocity.vx, velocity.vy) >= THROW_SPEED ? velocity : null;
}

export type Tap = { t: number; at: number }; // when the tap happened, and the grid time it landed on, both in ms

/** True when a tap lands on the same grid time as the one before, soon enough to be a double tap. */
export function isDoubleTap(last: Tap | null, tap: Tap): boolean {
  return last !== null && last.at === tap.at && tap.t - last.t <= DOUBLE_TAP_MS;
}

type Key = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };

/** Ctrl+Z, or Cmd+Z on a Mac. Typing in a field keeps the browser's own text undo. */
export function isUndoKey(e: Key, typing: boolean): boolean {
  return !typing && e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey;
}

/** A grid dateClick handler that calls onDouble with the time when the same spot is clicked or tapped twice quickly. */
export function useDoubleTap(onDouble: (date: Date) => void) {
  const last = useRef<Tap | null>(null);
  return (info: DateClickArg) => {
    const tap = { t: info.jsEvent.timeStamp, at: info.date.getTime() };
    if (isDoubleTap(last.current, tap)) {
      last.current = null; // a third tap starts over instead of opening a second dialog
      onDouble(info.date);
    } else {
      last.current = tap;
    }
  };
}

type Pointer = MouseEvent | TouchEvent;
const pointOf = (e: Pointer) => ('touches' in e ? e.touches[0] ?? e.changedTouches[0] : e);

/**
 * Watches every block drag on the grid. A block let go while still moving fast flies off the screen
 * and goes to onThrow. FullCalendar only reports the end of a drag after its 500 ms snap-back,
 * so the release is caught here, on the document, as it happens.
 */
export function useThrowAway(onThrow: (entry: Entry) => void) {
  const thrownId = useRef<string | null>(null);
  const stopWatching = useRef(() => {});
  const latest = useRef(onThrow);
  latest.current = onThrow;

  function eventDragStart(info: EventDragStartArg) {
    thrownId.current = null;
    const box = info.el.getBoundingClientRect();
    const grab = pointOf(info.jsEvent as Pointer);
    const samples: Sample[] = [];
    const move = (e: Pointer) => {
      const p = pointOf(e);
      samples.push({ x: p.clientX, y: p.clientY, t: e.timeStamp });
      if (samples.length > 30) samples.shift();
    };
    const release = (e: Pointer) => {
      stopWatching.current();
      const velocity = throwVelocity(samples, e.timeStamp);
      if (!velocity) return;
      thrownId.current = info.event.id;
      const p = pointOf(e);
      flyAway(info.el, box, p.clientX - (grab.clientX - box.left), p.clientY - (grab.clientY - box.top), velocity);
      latest.current(info.event.extendedProps.entry as Entry);
    };
    const listeners = [['mousemove', move], ['touchmove', move], ['mouseup', release], ['touchend', release]] as const;
    const options = { capture: true, passive: true };
    for (const [type, fn] of listeners) document.addEventListener(type, fn as EventListener, options);
    stopWatching.current = () => {
      for (const [type, fn] of listeners) document.removeEventListener(type, fn as EventListener, options);
    };
  }

  return {
    eventDragStart,
    eventDragStop: () => stopWatching.current(), // covers a drag that ends without a release, like a cancelled touch
    /** True for the block just thrown, so the page skips saving its drop as a move. */
    wasThrown: (id: string) => thrownId.current === id,
  };
}

/** A copy of the block keeps going the way it was thrown and fades out. */
function flyAway(block: HTMLElement, box: DOMRect, left: number, top: number, { vx, vy }: Velocity) {
  const copy = block.cloneNode(true) as HTMLElement;
  copy.classList.remove('fc-event-dragging', 'fc-event-mirror', 'fc-event-selected');
  copy.classList.add('thrown');
  Object.assign(copy.style, { left: `${left}px`, top: `${top}px`, width: `${box.width}px`, height: `${box.height}px` });
  (block.closest('.fc') ?? document.body).append(copy); // inside the calendar, so the block colours still apply
  document.body.classList.add('throwing'); // hides FullCalendar's own drag copy while it snaps back
  setTimeout(() => document.body.classList.remove('throwing'), 600);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flight = copy.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: `translate(${vx * 200}px, ${vy * 200}px) rotate(${vx < 0 ? -15 : 15}deg)` },
    ],
    { duration: still ? 1 : 300, easing: 'ease-out' },
  );
  flight.onfinish = () => copy.remove();
}
