import { useEffect, useId, useRef, useState } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import type { Entry, WeekView } from '../shared/types.ts';
import { formatDuration } from '../shared/time.ts';
import { firstLine, itemMeta } from './block.ts';
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
      <QuickAdd
        onAdd={(title, duration, notes) => {
          const created = api.createEntry({ kind: 'task', title, duration, notes });
          save(created, undefined, async () => api.deleteEntry((await created).id));
        }}
      />
      {unfinished.length > 0 && (
        <section>
          <h2>Overdue <span className="count">{unfinished.length}</span></h2>
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
    <li className={unfinished ? 'item unf' : 'item'} data-id={entry.id} data-title={entry.title} data-duration={entry.duration} data-start={entry.start ?? ''}>
      <span className="sig" aria-hidden="true">•</span>
      <button type="button" className="item-body" onClick={() => onOpen(entry)}>
        <span className="t">{entry.title}</span>
        {meta && <span className="m">{meta}</span>}
        {entry.notes && <span className="desc">{firstLine(entry.notes)}</span>}
      </button>
      <span className="r">{formatDuration(entry.duration)}</span>
    </li>
  );
}

type QuickAddProps = {
  onAdd: (title: string, duration: number, notes: string | null) => void;
  label?: string;
  submit?: string;
  onCancel?: () => void;
};

export function QuickAdd({ onAdd, label = 'New task', submit = 'Add to inbox', onCancel }: QuickAddProps) {
  const id = useId(); // the week page can show two of these at once: the inbox's and the new task dialog's
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState<string | null>(null); // null while the description box is closed
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;
        onAdd(trimmed, duration, notes?.trim() || null);
        setTitle('');
        setNotes(null);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input id={id} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" required />
      {notes === null ? (
        <button type="button" className="add-desc" onClick={() => setNotes('')}>Add description</button>
      ) : (
        <>
          <label htmlFor={`${id}-notes`}>Description</label>
          <textarea id={`${id}-notes`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus />
        </>
      )}
      <div className="chips" role="group" aria-label="Duration">
        {DURATIONS.map((d) => (
          <button key={d} type="button" className={d === duration ? 'chip on' : 'chip'} aria-pressed={d === duration} onClick={() => setDuration(d)}>
            {formatDuration(d)}
          </button>
        ))}
      </div>
      {onCancel ? (
        <div className="actions end">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary">{submit}</button>
        </div>
      ) : (
        <button type="submit" className="btn primary">{submit}</button>
      )}
    </form>
  );
}
