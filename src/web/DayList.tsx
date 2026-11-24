import { useEffect, useRef } from 'react';
import { ArrowRightIcon, ListBulletsIcon } from '@phosphor-icons/react';
import type { Entry, WeekView } from '../shared/types.ts';
import { addDays, formatDay } from '../shared/time.ts';
import { dayDrop, habitsFor } from './block.ts';
import { Item, QuickAdd, useItemDrag } from './InboxPanel.tsx';
import { addEntry, saveUpdate } from './page.tsx';
import type { Save } from './page.tsx';

/** A day's things without a time: its unplaced habits, then its day tasks. */
export function dayItems(week: WeekView | null, day: string, today: string): Entry[] {
  if (!week) return [];
  return [...habitsFor(week.habits, day, today), ...week.dayTasks.filter((e) => e.day === day)];
}

type Props = {
  day: string;
  week: WeekView | null;
  today: string;
  anchor: DOMRect; // the day label's list button, which the dropdown hangs from
  save: Save;
  onOpen: (entry: Entry) => void;
  onClose: () => void;
};

const WIDTH = 300;

/**
 * The dropdown under a day label. Its items drag onto the grid like inbox tasks, and it hides while one is
 * dragged, so the whole grid is free to drop on. Escape or a press outside it closes it.
 */
export function DayPopover({ day, week, today, anchor, save, onOpen, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useItemDrag(ref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!ref.current!.contains(target) && !target.closest('.day-btn, dialog')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const items = dayItems(week, day, today);
  const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
  return (
    <div ref={ref} className="day-pop" role="dialog" aria-label={`${formatDay(day)}, any time`} style={{ top: anchor.bottom + 6, left, width: WIDTH, maxHeight: window.innerHeight - anchor.bottom - 22 }}>
      {items.length > 0 ? (
        <ul className="list">
          {items.map((entry) => <Item key={entry.id} entry={entry} today={today} onOpen={onOpen} />)}
        </ul>
      ) : (
        <p className="hint">Nothing yet. Add what you want to do this day, and place it once you know when.</p>
      )}
      <QuickAdd
        label={`New task for ${formatDay(day)}`}
        submit={`Add to ${formatDay(day)}`}
        onAdd={(title, duration, notes) => addEntry(save, { kind: 'task', title, duration, notes, day })}
      />
    </div>
  );
}

type HeaderProps = {
  day: string;
  today: string;
  count: number;
  copies: number; // habits the → button would place on the next day
  onList: (day: string, anchor: DOMRect) => void;
  onCopy: (day: string) => void;
};

/** A day label on the week grid: the list button with its count, and the → button on the line to the next day. */
export function DayHeader({ day, today, count, copies, onList, onCopy }: HeaderProps) {
  const next = formatDay(addDays(day, 1));
  return (
    <span className="day-head">
      {formatDay(day)} {Number(day.slice(8))}
      {day >= today && (
        <button
          type="button"
          className={count > 0 ? 'day-btn has' : 'day-btn'}
          aria-label={`${formatDay(day)}, any time${count > 0 ? `, ${count}` : ''}`}
          title="Things for this day without a time"
          onClick={(e) => onList(day, e.currentTarget.getBoundingClientRect())}
        >
          <ListBulletsIcon size={14} aria-hidden="true" />
          {count > 0 && <span>{count}</span>}
        </button>
      )}
      {copies > 0 && (
        <button type="button" className="copy-fwd" aria-label={`Place habits on ${next} at the same times`} title={`Same habit times on ${next}`} onClick={() => onCopy(day)}>
          <span><ArrowRightIcon size={12} weight="bold" aria-hidden="true" /></span>
        </button>
      )}
    </span>
  );
}

/**
 * On the computer, an inbox or day list item dropped on a day label gets that day, and a day task dropped on
 * the inbox panel loses its day. The grid's own drop handles times; this only looks at where the mouse lets go.
 */
export function useDayDrop(find: (id: number) => Entry | undefined, save: Save) {
  useEffect(() => {
    let press: { x: number; y: number; id: number } | null = null;
    let target: Element | null = null;
    const targetAt = (x: number, y: number) => {
      for (const el of document.elementsFromPoint(x, y)) {
        const hit = el.closest('.fc-col-header-cell[data-date], .body > .inbox');
        if (hit) return hit;
      }
      return null;
    };
    const mark = (hit: Element | null) => {
      if (hit === target) return;
      target?.classList.remove('drop-here');
      hit?.classList.add('drop-here');
      target = hit;
    };
    const down = (e: MouseEvent) => {
      const item = (e.target as Element).closest<HTMLElement>('.item[data-id]');
      press = e.button === 0 && item ? { x: e.clientX, y: e.clientY, id: Number(item.dataset.id) } : null;
    };
    const changeFor = (hit: Element | null) => {
      const entry = press && hit ? find(press.id) : undefined;
      const changes = entry && dayDrop(entry, hit!.matches('.inbox') ? null : hit!.getAttribute('data-date'));
      return entry && changes ? { entry, changes } : null;
    };
    const move = (e: MouseEvent) => {
      if (!press) return;
      const hit = Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5 ? targetAt(e.clientX, e.clientY) : null;
      mark(changeFor(hit) ? hit : null); // only where the drop would change something, so a habit copy marks nothing
    };
    const up = () => {
      const drop = changeFor(target);
      if (drop) saveUpdate(save, drop.entry, drop.changes);
      mark(null);
      press = null;
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [find, save]);
}
