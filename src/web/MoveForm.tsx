import { useState } from 'react';
import type { Entry } from '../shared/types.ts';

/** Moves an entry with the phone's own date and time picker. Its value has the app's time format already. */
export function MoveForm({ entry, onSave, onCancel }: { entry: Entry; onSave: (start: string) => void; onCancel: () => void }) {
  const [start, setStart] = useState(entry.start ?? '');
  return (
    <form
      className="move"
      onSubmit={(e) => {
        e.preventDefault();
        if (start) onSave(start.slice(0, 16));
      }}
    >
      <label htmlFor={`move-${entry.id}`}>Move "{entry.title}" to</label>
      <input id={`move-${entry.id}`} type="datetime-local" step={900} value={start} onChange={(e) => setStart(e.target.value)} required />
      <div className="actions end">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary">Move</button>
      </div>
    </form>
  );
}
