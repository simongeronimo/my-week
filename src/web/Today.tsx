import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entry, WeekView } from '../shared/types.ts';
import { addDays, addMinutes, formatDate, formatTime, mondayOf } from '../shared/time.ts';
import { api } from './api.ts';
import { lineTime, timeRange, todayView, until } from './today.ts';
import { MoveForm } from './MoveForm.tsx';
import { QuickAdd } from './InboxPanel.tsx';
import { ErrorBanner, browserNow, useErrors } from './page.tsx';

type Save = (change: Promise<unknown>) => Promise<void>;

/** The phone's home screen: now, next, the rest of today, and a quick way to add to the inbox. */
export function Today({ onAuthError }: { onAuthError: () => void }) {
  const [weeks, setWeeks] = useState<WeekView[] | null>(null); // null until the first load arrives
  const [now, setNow] = useState(browserNow);
  const [moving, setMoving] = useState<number | null>(null);
  const { message, fail, clear } = useErrors(onAuthError);
  const loadedDay = useRef('');

  const load = useCallback(() => {
    const current = browserNow();
    setNow(current);
    const today = current.slice(0, 10);
    const monday = mondayOf(current);
    const mondays = [monday];
    if (today === monday) mondays.unshift(addDays(monday, -7)); // a Sunday-night entry can still be running on Monday
    if (today === addDays(monday, 6)) mondays.push(addDays(monday, 7)); // on Sundays the next entry usually lives in next week
    loadedDay.current = today;
    return Promise.all(mondays.map((m) => api.week(m))).then(setWeeks, fail);
  }, [fail]);

  useEffect(() => {
    load();
    const tick = setInterval(() => {
      const current = browserNow();
      setNow(current);
      if (current.slice(0, 10) !== loadedDay.current) load(); // a page left open past midnight fetches the new day
    }, 15_000);
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

  const view = weeks === null ? null : todayView(weeks.flatMap((w) => w.entries), now);
  const line = (entry: Entry, big = false) => (
    <Line
      key={entry.id}
      entry={entry}
      big={big}
      now={now}
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
        <h2 className="sh">Now {view?.now && <span>ends in {until(now, addMinutes(view.now.start!, view.now.duration))}</span>}</h2>
        {view === null ? <p className="hint">Loading the week.</p> : view.now ? <ul className="rows">{line(view.now, true)}</ul> : <p className="hint">Nothing planned right now.</p>}
      </section>
      <section>
        <h2 className="sh">Next {view?.next && <span>in {until(now, view.next.start!)}</span>}</h2>
        {view === null ? null : view.next ? <ul className="rows">{line(view.next)}</ul> : <p className="hint">Nothing else planned this week.</p>}
      </section>
      {view !== null && view.later.length > 0 && (
        <section>
          <h2 className="sh">Later today</h2>
          <ul className="rows">{view.later.map((e) => line(e))}</ul>
        </section>
      )}
      <a className="btn primary arrange" href="/day">Arrange day</a>
      <div className="phone-links">
        <a className="btn" href="/inbox">Inbox ({weeks?.[0]?.inbox.length ?? 0})</a>
        <a className="btn" href="/inbox">Unfinished ({weeks?.[0]?.unfinished.length ?? 0})</a>
      </div>
      <QuickAdd durations={[15, 30, 60]} onAdd={(title, duration) => save(api.createEntry({ kind: 'task', title, duration }))} />
    </main>
  );
}

type LineProps = { entry: Entry; big: boolean; now: string; moving: boolean; onMove: (on: boolean) => void; save: Save };

/** One entry: time, tick button (tasks), title (tap to move), migration count and To inbox (tasks). */
function Line({ entry, big, now, moving, onMove, save }: LineProps) {
  const isTask = entry.kind === 'task';
  return (
    <li className={big ? 'line big' : 'line'}>
      <div className="line-main">
        <span className="time mono">{big ? timeRange(entry.start!, entry.duration) : lineTime(entry.start!, now)}</span>
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
