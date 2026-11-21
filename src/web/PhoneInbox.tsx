import { useCallback, useState } from 'react';
import type { Entry, WeekView } from '../shared/types.ts';
import { formatDuration, mondayOf } from '../shared/time.ts';
import { firstLine, habitsFor, itemMeta } from './block.ts';
import { api } from './api.ts';
import { ErrorBanner, browserNow, useErrors, useReloadOnShow, useSave } from './page.tsx';
import type { Save } from './page.tsx';

/** The phone's inbox: overdue tasks, today's habits and inbox tasks. Tap a box to tick a task. Placing them happens on the day page. */
export function PhoneInbox({ onAuthError }: { onAuthError: () => void }) {
  const [week, setWeek] = useState<WeekView | null>(null);
  const { message, fail, clear } = useErrors(onAuthError);

  const load = useCallback(() => api.week(mondayOf(browserNow())).then(setWeek, fail), [fail]);
  useReloadOnShow(load);
  const { save } = useSave(load, fail);

  const unfinished = week?.unfinished ?? [];
  const inbox = week?.inbox ?? [];
  const today = browserNow().slice(0, 10);
  const habits = habitsFor(week?.habits ?? [], today, today);

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
          <h2 className="sh">Overdue <span>{unfinished.length}</span></h2>
          <ul className="rows">{unfinished.map((e) => <InboxLine key={e.id} entry={e} unfinished save={save} />)}</ul>
        </section>
      )}
      {habits.length > 0 && (
        <section>
          <h2 className="sh">Habits <span>{habits.length}</span></h2>
          <ul className="rows">{habits.map((e) => <InboxLine key={e.id} entry={e} unfinished={false} today={today} save={save} />)}</ul>
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

function InboxLine({ entry, unfinished, today, save }: { entry: Entry; unfinished: boolean; today?: string; save: Save }) {
  const meta = itemMeta(entry, unfinished, today);
  return (
    <li className="line">
      <div className="line-main">
        <button
          type="button"
          className={unfinished ? 'tick overdue' : 'tick'}
          aria-label={`Tick ${entry.title}`}
          onClick={() => save(api.updateEntry(entry.id, { status: 'done' }))}
        >
          <span className="box" aria-hidden="true">•</span>
        </button>
        <span className="line-title">
          {entry.title}
          {meta && <span className={unfinished ? 'm overdue' : 'm'}>{meta}</span>}
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
