import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import type { Entry, WeekView } from '../shared/types.ts';
import { addDays, formatDate, mondayOf } from '../shared/time.ts';
import { api } from './api.ts';
import { gridOptions, moveOrResize, placeDropped, toEvents } from './Planner.tsx';
import type { Save } from './Planner.tsx';
import { InboxPanel } from './InboxPanel.tsx';
import { EntryDialog } from './EntryDialog.tsx';
import { ErrorBanner, browserNow, useErrors } from './page.tsx';
import { scrollTimeFor } from './today.ts';

/** The phone's arrange screen: one day of the grid, and a side panel of tasks to drag onto it. */
export function Day({ onAuthError }: { onAuthError: () => void }) {
  const [day, setDay] = useState(() => browserNow().slice(0, 10));
  const [week, setWeek] = useState<WeekView | null>(null); // null until the first load arrives
  const [panelOpen, setPanelOpen] = useState(false);
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

  const toPlace = week ? week.unfinished.length + week.inbox.length : 0;

  return (
    <main className="phone day">
      <header className="phone-top">
        <h1>{formatDate(day)}</h1>
        <nav aria-label="Day navigation">
          <button type="button" className="btn" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>←</button>
          <button type="button" className="btn" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}>→</button>
          <button type="button" className="btn primary" aria-expanded={panelOpen} aria-controls="day-tasks" onClick={() => setPanelOpen(!panelOpen)}>
            Tasks {toPlace}
          </button>
          <a className="btn" href="/today">Back</a>
        </nav>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />
      <div className="day-grid">
        <FullCalendar
          ref={calendarRef}
          {...gridOptions}
          initialView="timeGridDay"
          initialDate={day}
          scrollTime={scrollTime}
          dayHeaders={false}
          eventLongPressDelay={400}
          droppable
          events={toEvents(week?.entries ?? [])}
          drop={(info) => placeDropped(save, info)}
          eventDrop={(info) => moveOrResize(save, info)}
          eventResize={(info) => moveOrResize(save, info)}
          eventClick={(info) => setOpenEntry(info.event.extendedProps.entry as Entry)}
        />
      </div>
      {panelOpen && <div className="drawer-backdrop" aria-hidden="true" onClick={() => setPanelOpen(false)} />}
      {/* Always mounted, so the panel's drag setup survives closing it; CSS slides it in and out. */}
      <div id="day-tasks" className={panelOpen ? 'drawer open' : 'drawer'}>
        <div className="drawer-top">
          <h2>Tasks</h2>
          <button type="button" className="btn" onClick={() => setPanelOpen(false)}>Close</button>
        </div>
        <InboxPanel week={week} save={save} onOpen={setOpenEntry} />
      </div>
      {openEntry && <EntryDialog entry={openEntry} save={save} onClose={() => setOpenEntry(null)} />}
    </main>
  );
}
