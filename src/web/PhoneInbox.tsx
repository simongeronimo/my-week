import { useCallback, useEffect, useState } from 'react';
import type { Entry, WeekView } from '../shared/types.ts';
import { formatDuration, mondayOf } from '../shared/time.ts';
import { itemMeta } from './block.ts';
import { api } from './api.ts';
import { MoveForm } from './MoveForm.tsx';
import { ErrorBanner, browserNow, useErrors } from './page.tsx';

type Save = (change: Promise<unknown>) => Promise<void>;

/** The phone's inbox: unfinished tasks and inbox tasks, each with Move, Strike and Delete. */
export function PhoneInbox({ onAuthError }: { onAuthError: () => void }) {
  const [week, setWeek] = useState<WeekView | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const { message, fail, clear } = useErrors(onAuthError);

  const load = useCallback(() => api.week(mondayOf(browserNow())).then(setWeek, fail), [fail]);

  useEffect(() => {
    load();
    const onShow = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  const save: Save = async (change) => {
    try {
      await change;
      setMoving(null);
    } catch (err) {
      fail(err);
    }
    await load();
  };

  const unfinished = week?.unfinished ?? [];
  const inbox = week?.inbox ?? [];
  const line = (entry: Entry, isUnfinished: boolean) => (
    <InboxLine
      key={entry.id}
      entry={entry}
      unfinished={isUnfinished}
      moving={moving === entry.id}
      onMove={(on) => setMoving(on ? entry.id : null)}
      save={save}
    />
  );

  return (
    <main className="phone">
      <header className="phone-top">
        <h1>Inbox</h1>
        <a className="btn" href="/today">Today</a>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />
      {unfinished.length > 0 && (
        <section>
          <h2 className="sh">Unfinished <span>{unfinished.length}</span></h2>
          <ul className="rows">{unfinished.map((e) => line(e, true))}</ul>
        </section>
      )}
      <section>
        <h2 className="sh">Inbox <span>{inbox.length}</span></h2>
        {week === null && <p className="hint">Loading the inbox.</p>}
        {week !== null && inbox.length === 0 && <p className="hint">Empty. Add tasks on the Today page.</p>}
        <ul className="rows">{inbox.map((e) => line(e, false))}</ul>
      </section>
    </main>
  );
}

type LineProps = { entry: Entry; unfinished: boolean; moving: boolean; onMove: (on: boolean) => void; save: Save };

function InboxLine({ entry, unfinished, moving, onMove, save }: LineProps) {
  const meta = itemMeta(entry, unfinished);
  return (
    <li className="line">
      <div className="line-main">
        <span className={unfinished ? 'sig over' : 'sig'} aria-hidden="true">•</span>
        <span className="line-title">
          {entry.title}
          {meta && <span className={unfinished ? 'm over' : 'm'}>{meta}</span>}
        </span>
        <span className="r mono">{formatDuration(entry.duration)}</span>
      </div>
      <div className="actions">
        <button type="button" className="btn" aria-expanded={moving} onClick={() => onMove(!moving)}>Move</button>
        <button type="button" className="btn" onClick={() => save(api.updateEntry(entry.id, { status: 'cancelled' }))}>Strike</button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (window.confirm(`Delete "${entry.title}" for good?`)) save(api.deleteEntry(entry.id));
          }}
        >
          Delete
        </button>
      </div>
      {moving && <MoveForm entry={entry} onSave={(start) => save(api.updateEntry(entry.id, { start }))} onCancel={() => onMove(false)} />}
    </li>
  );
}
