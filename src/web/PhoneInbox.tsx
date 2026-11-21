import { useCallback, useEffect, useState } from 'react';
import type { Entry, WeekView } from '../shared/types.ts';
import { formatDuration, mondayOf } from '../shared/time.ts';
import { firstLine, itemMeta } from './block.ts';
import { api } from './api.ts';
import { ErrorBanner, browserNow, useErrors } from './page.tsx';

type Save = (change: Promise<unknown>) => Promise<void>;

/** The phone's inbox: unfinished tasks and inbox tasks. Tap a bullet to tick a task. Placing them happens on the day page. */
export function PhoneInbox({ onAuthError }: { onAuthError: () => void }) {
  const [week, setWeek] = useState<WeekView | null>(null);
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
    } catch (err) {
      fail(err);
    }
    await load();
  };

  const unfinished = week?.unfinished ?? [];
  const inbox = week?.inbox ?? [];

  return (
    <main className="phone">
      <header className="phone-top">
        <h1>Inbox</h1>
        <nav aria-label="Pages">
          <a className="btn primary" href="/day">Arrange day</a>
          <a className="btn" href="/today">Today</a>
        </nav>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />
      {unfinished.length > 0 && (
        <section>
          <h2 className="sh">Unfinished <span>{unfinished.length}</span></h2>
          <ul className="rows">{unfinished.map((e) => <InboxLine key={e.id} entry={e} unfinished save={save} />)}</ul>
        </section>
      )}
      <section>
        <h2 className="sh">Inbox <span>{inbox.length}</span></h2>
        {week === null && <p className="hint">Loading the inbox.</p>}
        {week !== null && inbox.length === 0 && <p className="hint">Empty. Add tasks on the Today page.</p>}
        <ul className="rows">{inbox.map((e) => <InboxLine key={e.id} entry={e} unfinished={false} save={save} />)}</ul>
      </section>
    </main>
  );
}

function InboxLine({ entry, unfinished, save }: { entry: Entry; unfinished: boolean; save: Save }) {
  const meta = itemMeta(entry, unfinished);
  return (
    <li className="line">
      <div className="line-main">
        <button
          type="button"
          className={unfinished ? 'tick over' : 'tick'}
          aria-label={`Tick ${entry.title}`}
          onClick={() => save(api.updateEntry(entry.id, { status: 'done' }))}
        >
          •
        </button>
        <span className="line-title">
          {entry.title}
          {meta && <span className={unfinished ? 'm over' : 'm'}>{meta}</span>}
          {entry.notes && <span className="desc">{firstLine(entry.notes)}</span>}
        </span>
        <span className="r mono">{formatDuration(entry.duration)}</span>
        <button
          type="button"
          className="mini"
          onClick={() => {
            if (window.confirm(`Delete "${entry.title}" for good?`)) save(api.deleteEntry(entry.id));
          }}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
