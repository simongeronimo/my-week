import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../shared/types.ts';
import { api } from './api.ts';
import type { Save } from './Planner.tsx';

type Props = { entry: Entry; save: Save; onClose: () => void };

/** Actions for one entry, in the browser's own <dialog>, so Escape and focus handling come for free. */
export function EntryDialog({ entry, save, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(entry.title);
  const [notes, setNotes] = useState(entry.notes ?? '');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const act = (change: Promise<unknown>) => {
    onClose();
    save(change);
  };
  const isTask = entry.kind === 'task';
  const done = entry.status === 'done';

  return (
    <dialog ref={ref} className="entry-dialog" onClose={onClose} aria-labelledby="entry-dialog-title">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(api.updateEntry(entry.id, { title: title.trim(), notes: notes.trim() || null }));
        }}
      >
        <h2 id="entry-dialog-title">{isTask ? 'Task' : 'Event'}</h2>
        <label htmlFor="entry-title">Title</label>
        <input id="entry-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label htmlFor="entry-notes">Notes</label>
        <textarea id="entry-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="actions">
          {isTask && (
            <button type="button" className="btn" onClick={() => act(api.updateEntry(entry.id, { status: done ? 'open' : 'done' }))}>
              {done ? 'Untick' : 'Tick'}
            </button>
          )}
          {isTask && entry.start && (
            <button type="button" className="btn" onClick={() => act(api.updateEntry(entry.id, { start: null }))}>Back to inbox</button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (window.confirm(`Delete "${entry.title}" for good?`)) act(api.deleteEntry(entry.id));
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
