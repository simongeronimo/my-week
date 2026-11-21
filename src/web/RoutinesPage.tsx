import { useCallback, useEffect, useState } from 'react';
import type { Kind, NewRoutine, Routine } from '../shared/types.ts';
import { formatDuration } from '../shared/time.ts';
import { api } from './api.ts';
import { DAY_LETTERS, DAY_NAMES, daysPattern, minutesUntil, routineLabel } from './routines.ts';
import { ErrorBanner, useErrors, useSave } from './page.tsx';

export function RoutinesPage({ onAuthError }: { onAuthError: () => void }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const { message, fail, clear } = useErrors(onAuthError);
  const load = useCallback(() => api.routines().then(setRoutines, fail), [fail]);

  useEffect(() => {
    load();
  }, [load]);
  const { save } = useSave(load, fail);

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
              <span className="m">{routineLabel(r)}</span>
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
  const [anyTime, setAnyTime] = useState(false); // a habit: always a task, placed by hand each day
  const [carry, setCarry] = useState(false);
  const [byEnd, setByEnd] = useState(false); // true: type an end time instead of minutes
  const [duration, setDuration] = useState(60);
  const [end, setEnd] = useState('17:00');
  const minutes = byEnd ? minutesUntil(at, end) : duration;

  return (
    <form
      className="quick-add routine-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() || !days.some(Boolean) || minutes === 0) return;
        const added = await onAdd({
          kind, title: title.trim(), days: daysPattern(days), at: anyTime ? null : at, duration: minutes, carry: anyTime && carry ? 1 : 0,
        });
        if (added) setTitle(''); // keep what you typed when the save fails
      }}
    >
      <h2>New routine</h2>
      <fieldset className="chips">
        <legend>Kind</legend>
        {(['event', 'task'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={k === kind ? 'chip on' : 'chip'}
            aria-pressed={k === kind}
            onClick={() => {
              setKind(k);
              if (k === 'event') setAnyTime(false);
            }}
          >
            {k === 'event' ? '○ Event' : '• Task'}
          </button>
        ))}
      </fieldset>
      <p className="hint">Events have no checkbox, like work or dinner. Tasks can be ticked. A task at any time is a habit, which waits in the inbox on its days until you drag it onto the week.</p>
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
      {!anyTime && (
        <fieldset className="chips">
          <legend>Length</legend>
          {[false, true].map((on) => (
            <button key={String(on)} type="button" className={on === byEnd ? 'chip on' : 'chip'} aria-pressed={on === byEnd} onClick={() => setByEnd(on)}>
              {on ? 'End time' : 'Minutes'}
            </button>
          ))}
        </fieldset>
      )}
      <div className="row2">
        <div>
          <label htmlFor="routine-at">Starts at</label>
          <div className="time-or-any">
            <input id="routine-at" type="time" value={anyTime ? '' : at} onChange={(e) => setAt(e.target.value)} disabled={anyTime} required={!anyTime} />
            <button
              type="button"
              className={anyTime ? 'chip on' : 'chip'}
              aria-pressed={anyTime}
              onClick={() => {
                setAnyTime(!anyTime);
                setKind('task'); // only a task can go without a time
                setByEnd(false); // and an end time needs a start
              }}
            >
              Any time
            </button>
          </div>
        </div>
        {byEnd ? (
          <div>
            <label htmlFor="routine-end">Ends at</label>
            <input id="routine-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        ) : (
          <div>
            <label htmlFor="routine-duration">Minutes</label>
            <input id="routine-duration" type="number" min={5} max={1440} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} required />
          </div>
        )}
      </div>
      {byEnd && (
        <p className="hint">
          {minutes === 0 ? 'The end time is the same as the start. Pick a different one.' : `Lasts ${formatDuration(minutes)}${end < at ? ', ending the next morning' : ''}.`}
        </p>
      )}
      {anyTime && (
        <>
          <fieldset className="chips">
            <legend>Carry over</legend>
            {[false, true].map((on) => (
              <button key={String(on)} type="button" className={on === carry ? 'chip on' : 'chip'} aria-pressed={on === carry} onClick={() => setCarry(on)}>
                {on ? 'On' : 'Off'}
              </button>
            ))}
          </fieldset>
          <p className="hint">{carry ? 'A day you miss stays in the inbox until Sunday.' : 'A day you miss leaves the inbox at midnight.'}</p>
        </>
      )}
      <button type="submit" className="btn primary">Add routine</button>
    </form>
  );
}
