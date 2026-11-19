import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import type { DateClickArg } from '@fullcalendar/interaction';
import type { Entry, WeekView } from '../shared/types.ts';
import { addDays, formatDate, formatDuration, fromDate, mondayOf } from '../shared/time.ts';
import { api } from './api.ts';
import { gridOptions, moveOrResize, toEvents } from './Planner.tsx';
import type { Save } from './Planner.tsx';
import { EntryDialog } from './EntryDialog.tsx';
import { ErrorBanner, browserNow, useErrors } from './page.tsx';
import { scrollTimeFor } from './today.ts';

/** The phone's arrange screen: one day of the grid, with inbox and unfinished tasks to tap into place. */
export function Day({ onAuthError }: { onAuthError: () => void }) {
  const [day, setDay] = useState(() => browserNow().slice(0, 10));
  const [week, setWeek] = useState<WeekView | null>(null); // null until the first load arrives
  const [picked, setPicked] = useState<Entry | null>(null);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const { message, fail, clear } = useErrors(onAuthError);
  const calendarRef = useRef<FullCalendar>(null);
  const scrollTime = useMemo(() => scrollTimeFor(day, browserNow()), [day]); // fixed per day, so the grid never jumps

  // Stepping days quickly sends several requests; drop any answer for a week no longer on screen.
  const shownDay = useRef(day);
  shownDay.current = day;
  const load = useCallback(
    () => api.week(mondayOf(day)).then((w) => { if (w.monday === mondayOf(shownDay.current)) setWeek(w); }, fail),
    [day, fail],
  );

  useEffect(() => {
    load();
    const onShow = () => {
      if (document.visibilityState === 'visible') load(); // the app comes back to the front
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);

  useEffect(() => {
    calendarRef.current?.getApi().gotoDate(day);
  }, [day]);

  /** Sends a change, puts the block back if it fails, and reloads the week either way. */
  const save: Save = useCallback(
    async (change, revert) => {
      try {
        await change;
      } catch (err) {
        revert?.();
        fail(err);
      }
      await load();
    },
    [fail, load],
  );

  function onDateClick(info: DateClickArg) {
    if (!picked) return;
    setPicked(null);
    save(api.updateEntry(picked.id, { start: fromDate(info.date) }));
  }

  const unfinished = week?.unfinished ?? [];
  const inbox = week?.inbox ?? [];
  const chip = (entry: Entry, over: boolean) => (
    <li key={entry.id}>
      <button type="button" className={over ? 'chip over' : 'chip'} onClick={() => setPicked(entry)}>
        {entry.title} <span>{formatDuration(entry.duration)}</span>
      </button>
    </li>
  );

  return (
    <main className="phone day">
      <header className="phone-top">
        <h1>{formatDate(day)}</h1>
        <nav aria-label="Day navigation">
          <button type="button" className="btn" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>←</button>
          <button type="button" className="btn" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}>→</button>
          <a className="btn" href="/today">Back</a>
        </nav>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />
      <div className={picked ? 'day-grid placing' : 'day-grid'}>
        <FullCalendar
          ref={calendarRef}
          {...gridOptions}
          initialView="timeGridDay"
          initialDate={day}
          scrollTime={scrollTime}
          dayHeaders={false}
          eventLongPressDelay={400}
          events={toEvents(week?.entries ?? [])}
          dateClick={onDateClick}
          eventDrop={(info) => moveOrResize(save, info)}
          eventResize={(info) => moveOrResize(save, info)}
          eventClick={(info) => setOpenEntry(info.event.extendedProps.entry as Entry)}
        />
      </div>
      <footer className="tray" aria-label="Tasks to place">
        {picked ? (
          <div className="tray-pick">
            <span>Tap a time for <strong>{picked.title}</strong></span>
            <button type="button" className="btn" onClick={() => setPicked(null)}>Cancel</button>
          </div>
        ) : week === null ? (
          <p className="hint">Loading the week.</p>
        ) : unfinished.length + inbox.length === 0 ? (
          <p className="hint">Nothing to place. Add tasks from Today.</p>
        ) : (
          <>
            <p className="hint">Tap a task, then a time. Long-press a block to move it.</p>
            <ul className="tray-chips">
              {unfinished.map((e) => chip(e, true))}
              {inbox.map((e) => chip(e, false))}
            </ul>
          </>
        )}
      </footer>
      {openEntry && <EntryDialog entry={openEntry} save={save} onClose={() => setOpenEntry(null)} />}
    </main>
  );
}
