import { useEffect, useId, useRef, useState } from 'react';
import { Draggable } from '@fullcalendar/interaction';
import type { Entry, WeekView } from '../shared/types.ts';
import { formatDuration, parseDuration } from '../shared/time.ts';
import { firstLine, itemMeta } from './block.ts';
import { addEntry } from './page.tsx';
import type { Save } from './page.tsx';

const DURATIONS = [15, 30, 45, 60, 90, 120];

type Props = { week: WeekView | null; save: Save; onOpen: (entry: Entry) => void };

export function InboxPanel({ week, save, onOpen }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    // Any .item in this panel can be dropped on the grid; the grid's `drop` callback saves the new start.
    const draggable = new Draggable(ref.current!, {
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
        onAdd={(title, duration, notes) => addEntry(save, { kind: 'task', title, duration, notes })}
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
    <li className={unfinished ? 'item overdue' : 'item'} data-id={entry.id} data-title={entry.title} data-duration={entry.duration} data-start={entry.start ?? ''}>
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
      <LengthPicker value={duration} onChange={setDuration} />
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

type LengthPickerProps = { value: number; onChange: (minutes: number) => void; legend?: string };

/** The length chips, and a box for any other length, like '1h 15m'. The form won't submit while the box holds something unreadable. */
export function LengthPicker({ value, onChange, legend }: LengthPickerProps) {
  const [text, setText] = useState(DURATIONS.includes(value) ? '' : formatDuration(value));
  return (
    <fieldset className="chips" aria-label={legend ? undefined : 'Length'}>
      {legend && <legend>{legend}</legend>}
      {DURATIONS.map((d) => (
        <button
          key={d}
          type="button"
          className={d === value ? 'chip on' : 'chip'}
          aria-pressed={d === value}
          onClick={() => {
            setText('');
            onChange(d);
          }}
        >
          {formatDuration(d)}
        </button>
      ))}
      <input
        aria-label="Other length"
        placeholder="Other: 1h 15m"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          const minutes = parseDuration(e.target.value);
          setText(e.target.value);
          e.target.setCustomValidity(minutes === null && e.target.value.trim() ? 'Type a length from 5m to 24h, like 1h 15m.' : '');
          if (minutes !== null) onChange(minutes);
        }}
      />
    </fieldset>
  );
}
