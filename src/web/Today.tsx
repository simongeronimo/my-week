import { useCallback, useEffect, useState } from 'react';
import type { Entry, WeekView } from '../shared/types.ts';
import { addDays, addMinutes, formatDate, formatTime, mondayOf } from '../shared/time.ts';
import { api } from './api.ts';
import { timeRange, todayView, until } from './today.ts';
import { MoveForm } from './MoveForm.tsx';
import { QuickAdd } from './InboxPanel.tsx';
import { ErrorBanner, browserNow, useErrors } from './page.tsx';

type Save = (change: Promise<unknown>) => Promise<void>;

/** The phone's home screen: now, next, the rest of today, and a quick way to add to the inbox. */
export function Today({ onAuthError }: { onAuthError: () => void }) {
  const [weeks, setWeeks] = useState<WeekView[]>([]);
  const [now, setNow] = useState(browserNow);
  const [moving, setMoving] = useState<number | null>(null);
  const { message, fail, clear } = useErrors(onAuthError);

  const load = useCallback(() => {
    const current = browserNow();
    setNow(current);
    const monday = mondayOf(current);
    // On Sundays the next entry is usually Monday's, which lives in next week.
    const mondays = addDays(monday, 6) === current.slice(0, 10) ? [monday, addDays(monday, 7)] : [monday];
    return Promise.all(mondays.map((m) => api.week(m))).then(setWeeks, fail);
  }, [fail]);

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(browserNow()), 60_000);
    const onShow = () => {
      if (document.visibilityState === 'visible') load(); // the app comes back to the front
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onShow);
    };
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

  const view = todayView(weeks.flatMap((w) => w.entries), now);
  const line = (entry: Entry, big = false) => (
    <Line
      key={entry.id}
      entry={entry}
      big={big}
      moving={moving === entry.id}
      onMove={(on) => setMoving(on ? entry.id : null)}
      save={save}
    />
  );

  return (
    <main className="phone">
      <header className="phone-top">
        <h1>{formatDate(now)}</h1>
        <span className="mono muted">{formatTime(now)}</span>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />
      <section>
        <h2 className="sh">Now {view.now && <span>ends in {until(now, addMinutes(view.now.start!, view.now.duration))}</span>}</h2>
        {view.now ? <ul className="rows">{line(view.now, true)}</ul> : <p className="hint">Nothing planned right now.</p>}
      </section>
      <section>
        <h2 className="sh">Next {view.next && <span>in {until(now, view.next.start!)}</span>}</h2>
        {view.next ? <ul className="rows">{line(view.next)}</ul> : <p className="hint">Nothing else planned this week.</p>}
      </section>
      {view.later.length > 0 && (
        <section>
          <h2 className="sh">Later today</h2>
          <ul className="rows">{view.later.map((e) => line(e))}</ul>
        </section>
      )}
      <div className="phone-links">
        <a className="btn" href="/inbox">Inbox ({weeks[0]?.inbox.length ?? 0})</a>
        <a className="btn" href="/inbox">Unfinished ({weeks[0]?.unfinished.length ?? 0})</a>
      </div>
      <QuickAdd durations={[15, 30, 60]} onAdd={(title, duration) => save(api.createEntry({ kind: 'task', title, duration }))} />
    </main>
  );
}

type LineProps = { entry: Entry; big: boolean; moving: boolean; onMove: (on: boolean) => void; save: Save };

/** One entry: time, tick button (tasks), title (tap to move), migration count and To inbox (tasks). */
function Line({ entry, big, moving, onMove, save }: LineProps) {
  const isTask = entry.kind === 'task';
  return (
    <li className={big ? 'line big' : 'line'}>
      <div className="line-main">
        <span className="time mono">{big ? timeRange(entry.start!, entry.duration) : formatTime(entry.start!)}</span>
        {isTask ? (
          <button type="button" className="tick" aria-label={`Tick ${entry.title}`} onClick={() => save(api.updateEntry(entry.id, { status: 'done' }))}>•</button>
        ) : (
          <span className="ev" aria-hidden="true">○</span>
        )}
        <button type="button" className="line-title" aria-expanded={moving} onClick={() => onMove(!moving)}>{entry.title}</button>
        {entry.migrations > 0 && <span className="mig mono">&gt;{entry.migrations}</span>}
        {isTask && (
          <button type="button" className="mini" onClick={() => save(api.updateEntry(entry.id, { start: null }))}>To inbox</button>
        )}
      </div>
      {moving && <MoveForm entry={entry} onSave={(start) => save(api.updateEntry(entry.id, { start }))} onCancel={() => onMove(false)} />}
    </li>
  );
}
