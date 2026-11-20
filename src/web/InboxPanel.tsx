import { useEffect, useRef, useState } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import type { Entry, WeekView } from '../shared/types.ts';
import { formatDuration } from '../shared/time.ts';
import { itemMeta } from './block.ts';
import { api } from './api.ts';
import type { Save } from './Planner.tsx';

const DURATIONS = [15, 30, 45, 60, 90, 120];

type Props = { week: WeekView | null; save: Save; onOpen: (entry: Entry) => void };

export function InboxPanel({ week, save, onOpen }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Any .item in this panel can be dropped on the grid; the grid's `drop` callback saves the new start.
    const draggable = new Draggable(ref.current, {
      itemSelector: '.item',
      longPressDelay: 300, // on a phone, hold a task this long (ms) before it drags, so the list still scrolls
      eventData: (el) => ({ title: el.dataset.title, duration: { minutes: Number(el.dataset.duration) }, create: false }),
    });
    return () => draggable.destroy();
  }, []);

  const unfinished = week?.unfinished ?? [];
  const inbox = week?.inbox ?? [];

  return (
    <aside className="inbox" ref={ref} aria-label="Inbox">
      <QuickAdd onAdd={(title, duration) => save(api.createEntry({ kind: 'task', title, duration }))} />
      {unfinished.length > 0 && (
        <section>
          <h2>Unfinished <span className="count">{unfinished.length}</span></h2>
          <p className="hint">Time passed without a tick. Drag it to a new time, or open it to tick or delete it.</p>
          <ul className="list">
            {unfinished.map((entry) => <Item key={entry.id} entry={entry} unfinished onOpen={onOpen} />)}
          </ul>
        </section>
      )}
      <section>
        <h2>Inbox <span className="count">{inbox.length}</span></h2>
        <p className="hint">{inbox.length > 0 ? 'Hold a task, then drag it onto the grid.' : 'Empty. Add a task above.'}</p>
        <ul className="list">
          {inbox.map((entry) => <Item key={entry.id} entry={entry} onOpen={onOpen} />)}
        </ul>
      </section>
    </aside>
  );
}

function Item({ entry, unfinished = false, onOpen }: { entry: Entry; unfinished?: boolean; onOpen: (entry: Entry) => void }) {
  const meta = itemMeta(entry, unfinished);
  return (
    <li className={unfinished ? 'item unf' : 'item'} data-id={entry.id} data-title={entry.title} data-duration={entry.duration}>
      <span className="sig" aria-hidden="true">•</span>
      <button type="button" className="item-body" onClick={() => onOpen(entry)}>
        <span className="t">{entry.title}</span>
        {meta && <span className="m">{meta}</span>}
      </button>
      <span className="r">{formatDuration(entry.duration)}</span>
    </li>
  );
}

export function QuickAdd({ onAdd }: { onAdd: (title: string, duration: number) => void }) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        onAdd(trimmed, duration);
        setTitle('');
      }}
    >
      <label htmlFor="new-task">New task</label>
      <input id="new-task" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" required />
      <div className="chips" role="group" aria-label="Duration">
        {DURATIONS.map((d) => (
          <button key={d} type="button" className={d === duration ? 'chip on' : 'chip'} aria-pressed={d === duration} onClick={() => setDuration(d)}>
            {formatDuration(d)}
          </button>
        ))}
      </div>
      <button type="submit" className="btn primary">Add to inbox</button>
    </form>
  );
}
