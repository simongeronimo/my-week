import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import { ListBulletsIcon } from '@phosphor-icons/react';
import type { Entry, WeekView } from '../shared/types.ts';
import { addDays, formatDate, mondayOf } from '../shared/time.ts';
import { api } from './api.ts';
import { gridOptions, toEvents, useGridExtras } from './Planner.tsx';
import { InboxPanel } from './InboxPanel.tsx';
import { EntryDialog } from './EntryDialog.tsx';
import { HOLD_MS } from './gestures.ts';
import { habitsFor } from './block.ts';
import { DayPopover, dayItems } from './DayList.tsx';
import { ErrorBanner, browserNow, useErrors, useReloadOnShow, useSave } from './page.tsx';
import { scrollTimeFor } from './today.ts';

/** The phone's arrange screen: one day of the grid, and a side panel of tasks to drag onto it. */
export function Day({ onAuthError }: { onAuthError: () => void }) {
  const [day, setDay] = useState(() => browserNow().slice(0, 10));
  const [week, setWeek] = useState<WeekView | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [listAt, setListAt] = useState<DOMRect | null>(null); // the day list button, while its dropdown is open
  const closeList = useCallback(() => setListAt(null), []);
  const { message, fail, clear } = useErrors(onAuthError);
  const calendarRef = useRef<FullCalendar>(null);
  const scrollTime = useMemo(() => scrollTimeFor(day, browserNow()), [day]); // fixed per day, so the grid never jumps

  // Stepping across weeks quickly sends several requests; drop any answer for a week no longer on screen.
  const monday = mondayOf(day);
  const shownDay = useRef(day);
  shownDay.current = day;
  const load = useCallback(
    () => api.week(monday).then((w) => { if (w.monday === mondayOf(shownDay.current)) setWeek(w); }, fail),
    [monday, fail],
  );
  useReloadOnShow(load);

  useEffect(() => {
    calendarRef.current?.getApi().gotoDate(day);
  }, [day]);

  const { save, undo } = useSave(load, fail);
  const { calendarProps, overlays } = useGridExtras(save, undo, setWeek, setOpenEntry, week?.habits ?? []);
  const events = useMemo(() => toEvents(week?.entries ?? []), [week]);

  const today = browserNow().slice(0, 10);
  const toPlace = week ? week.unfinished.length + habitsFor(week.habits, today, today).length + week.inbox.length : 0;
  const anyTime = dayItems(week, day, today).length;

  return (
    <main className="phone day">
      <header className="phone-top">
        <h1>{formatDate(day)}</h1>
        <nav aria-label="Day navigation">
          <button type="button" className="btn" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>←</button>
          <button type="button" className="btn" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}>→</button>
          {day >= today && (
            <button
              type="button"
              className={anyTime > 0 ? 'btn day-btn has' : 'btn day-btn'}
              aria-label={`Any time this day${anyTime > 0 ? `, ${anyTime}` : ''}`}
              aria-expanded={listAt !== null}
              onClick={(e) => setListAt(listAt ? null : e.currentTarget.getBoundingClientRect())}
            >
              <ListBulletsIcon size={18} aria-hidden="true" />
              {anyTime > 0 && <span>{anyTime}</span>}
            </button>
          )}
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
          eventLongPressDelay={HOLD_MS}
          events={events}
          {...calendarProps}
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
      {listAt && (
        <DayPopover day={day} week={week} today={today} anchor={listAt} save={save} onOpen={(e) => { setListAt(null); setOpenEntry(e); }} onClose={closeList} />
      )}
      {openEntry && <EntryDialog entry={openEntry} save={save} onClose={() => setOpenEntry(null)} />}
      {overlays}
    </main>
  );
}
