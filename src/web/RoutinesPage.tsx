import { useCallback, useEffect, useState } from 'react';
import type { Kind, NewRoutine, Routine } from '../shared/types.ts';
import { formatDuration, formatTime } from '../shared/time.ts';
import { api } from './api.ts';
import { DAY_LETTERS, DAY_NAMES, daysLabel, daysPattern } from './routines.ts';
import { ErrorBanner, useErrors } from './page.tsx';

export function RoutinesPage({ onAuthError }: { onAuthError: () => void }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const { message, fail, clear } = useErrors(onAuthError);
  const load = useCallback(() => api.routines().then(setRoutines, fail), [fail]);

  useEffect(() => {
    load();
  }, [load]);

  /** Sends a change, reloads the list, and reports whether the change worked. */
  const save = async (change: Promise<unknown>): Promise<boolean> => {
    let ok = true;
    try {
      await change;
    } catch (err) {
      ok = false;
      fail(err);
    }
    await load();
    return ok;
  };

  return (
    <div className="page">
      <header className="top">
        <div className="title"><h1>Routines</h1></div>
        <nav aria-label="Pages"><a className="btn" href="/">Week</a></nav>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />
      <p className="hint">Every week gets a copy of each routine, from today onward. To change a routine, delete it and add it again.</p>
      <ul className="list">
        {routines.map((r) => (
          <li key={r.id} className="item routine-row">
            <span className="sig" aria-hidden="true">{r.kind === 'event' ? '○' : '•'}</span>
            <span className="item-body">
              <span className="t">{r.title}</span>
              <span className="m">{daysLabel(r.days)}, {formatTime(r.at)}, {formatDuration(r.duration)}</span>
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (window.confirm(`Delete the routine "${r.title}"? Its future copies go too.`)) save(api.deleteRoutine(r.id));
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {routines.length === 0 && <p className="hint">No routines yet. Add work, meals and habits below.</p>}
      <RoutineForm onAdd={(routine) => save(api.createRoutine(routine))} />
    </div>
  );
}

function RoutineForm({ onAdd }: { onAdd: (routine: NewRoutine) => Promise<boolean> }) {
  const [kind, setKind] = useState<Kind>('event');
  const [title, setTitle] = useState('');
  const [days, setDays] = useState([true, true, true, true, true, false, false]);
  const [at, setAt] = useState('08:00');
  const [duration, setDuration] = useState(60);

  return (
    <form
      className="quick-add routine-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || !days.some(Boolean)) return;
        const added = await onAdd({ kind, title: title.trim(), days: daysPattern(days), at, duration });
        if (added) setTitle(''); // keep what you typed when the save fails
      }}
    >
      <h2>New routine</h2>
      <fieldset className="chips">
        <legend>Kind</legend>
        {(['event', 'task'] as const).map((k) => (
          <button key={k} type="button" className={k === kind ? 'chip on' : 'chip'} aria-pressed={k === kind} onClick={() => setKind(k)}>
            {k === 'event' ? '○ Event' : '• Task'}
          </button>
        ))}
      </fieldset>
      <p className="hint">Events have no checkbox, like work or dinner. Tasks can be ticked, like a daily habit.</p>
      <label htmlFor="routine-title">Title</label>
      <input id="routine-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Work" autoComplete="off" required />
      <fieldset className="chips">
        <legend>Days</legend>
        {[...DAY_LETTERS].map((letter, i) => (
          <button
            key={DAY_NAMES[i]}
            type="button"
            className={days[i] ? 'chip on' : 'chip'}
            aria-pressed={days[i]}
            aria-label={DAY_NAMES[i]}
            onClick={() => setDays(days.map((on, j) => (j === i ? !on : on)))}
          >
            {letter}
          </button>
        ))}
      </fieldset>
      <div className="row2">
        <div>
          <label htmlFor="routine-at">Time</label>
          <input id="routine-at" type="time" value={at} onChange={(e) => setAt(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="routine-duration">Minutes</label>
          <input id="routine-duration" type="number" min={5} max={1440} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} required />
        </div>
      </div>
      <button type="submit" className="btn primary">Add routine</button>
    </form>
  );
}
