import { useRef, useState } from 'react';
import type { Entry, EntryChanges } from '../shared/types.ts';
import { formatDay, formatDuration, formatTime, fromDate } from '../shared/time.ts';
import { api } from './api.ts';
import { habitsFor, itemMeta, toggleTask } from './block.ts';
import { addEntry, browserNow, saveUpdate, useModal } from './page.tsx';
import type { Save } from './page.tsx';
import { LengthPicker, QuickAdd } from './InboxPanel.tsx';
import { Markdown } from './Markdown.tsx';

type Props = { entry: Entry; save: Save; onClose: () => void };

/** Actions for one entry, in the browser's own <dialog>. */
export function EntryDialog({ entry, save, onClose }: Props) {
  const ref = useModal();
  const [title, setTitle] = useState(entry.title);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const hasNotes = Boolean(entry.notes?.trim());
  const [editing, setEditing] = useState(!hasNotes);
  const saved = useRef(entry); // ticking a box saves while the dialog stays open, so undoing Save must put back the ticked text
  const [duration, setDuration] = useState(entry.duration);

  const update = (changes: EntryChanges, before?: EntryChanges) => {
    onClose();
    saveUpdate(save, saved.current, changes, before);
  };
  const tick = async (index: number) => {
    const was = saved.current;
    const ticked = toggleTask(was.notes ?? '', index);
    saved.current = { ...was, notes: ticked };
    setNotes(ticked);
    if (!(await saveUpdate(save, was, { notes: ticked }))) {
      saved.current = was;
      setNotes(was.notes ?? '');
    }
  };
  const isTask = entry.kind === 'task';
  const done = entry.status === 'done';

  return (
    <dialog ref={ref} className="entry-dialog" onClose={onClose} aria-labelledby="entry-dialog-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ title: title.trim(), notes: notes.trim() || null, duration });
        }}
      >
        <h2 id="entry-dialog-title">{isTask ? 'Task' : 'Event'}</h2>
        <label htmlFor="entry-title">Title</label>
        <input id="entry-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label htmlFor="entry-notes">Description</label>
        {editing ? (
          <textarea id="entry-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus={hasNotes} />
        ) : (
          <>
            <Markdown source={notes} onToggle={tick} />
            <button type="button" className="add-desc" onClick={() => setEditing(true)}>Edit</button>
          </>
        )}
        <LengthPicker legend="Length" value={duration} onChange={setDuration} />
        <div className="actions">
          {isTask && (
            <button type="button" className="btn" onClick={() => update({ status: done ? 'open' : 'done' })}>
              {done ? 'Untick' : 'Tick'}
            </button>
          )}
          {isTask && entry.start && (
            // the server also reopens a ticked task that goes back to the inbox, so undo restores the status too
            <button type="button" className="btn" onClick={() => update({ start: null }, { start: entry.start, status: entry.status })}>
              Back to inbox
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!window.confirm(`Delete "${entry.title}" for good?`)) return;
              onClose();
              save(api.deleteEntry(entry.id));
            }}
          >
            Delete
          </button>
        </div>
        <div className="actions end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Save</button>
        </div>
      </form>
    </dialog>
  );
}

type NewTaskProps = { start: Date; habits: Entry[]; save: Save; onClose: () => void };

/** Adds a task at one time on the grid, or places one of that day's habits there. A double click or double tap on an empty spot opens it. */
export function NewTaskDialog({ start, habits, save, onClose }: NewTaskProps) {
  const ref = useModal();
  const at = fromDate(start);
  const today = browserNow().slice(0, 10);
  const choices = habitsFor(habits, at.slice(0, 10), today);

  return (
    <dialog ref={ref} className="entry-dialog" onClose={onClose} aria-label="New task">
      {choices.length > 0 && (
        <fieldset className="habit-picks">
          <legend>Place a habit, {formatDay(at)} {formatTime(at)}</legend>
          <ul className="list">
            {choices.map((habit) => {
              const meta = itemMeta(habit, false, today);
              return (
                <li key={habit.id}>
                  <button type="button" className="item habit" onClick={() => { onClose(); saveUpdate(save, habit, { start: at }); }}>
                    <span className="sig" aria-hidden="true">•</span>
                    <span className="item-body">
                      <span className="t">{habit.title}</span>
                      {meta && <span className="m">{meta}</span>}
                    </span>
                    <span className="r">{formatDuration(habit.duration)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      <QuickAdd
        label={`New task, ${formatDay(at)} ${formatTime(at)}`}
        submit="Add task"
        onCancel={onClose}
        onAdd={(title, duration, notes) => {
          onClose();
          addEntry(save, { kind: 'task', title, start: at, duration, notes });
        }}
      />
    </dialog>
  );
}
