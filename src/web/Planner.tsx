import { useCallback, useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DropArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import type { CalendarOptions, DateSelectArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core';
import type { Entry, WeekView } from '../shared/types.ts';
import {
  USE_12_HOUR, addDays, addMinutes, formatDay, formatDuration, formatTime, fromDate, isoWeek, localNow,
  minutesBetween, mondayOf, weekLabel,
} from '../shared/time.ts';
import { AuthError, api } from './api.ts';
import { InboxPanel } from './InboxPanel.tsx';
import { blockParts, withinOneDay } from './block.ts';
import { EntryDialog } from './EntryDialog.tsx';

export type Save = (change: Promise<unknown>, revert?: () => void) => Promise<void>;

const browserNow = () => localNow(Intl.DateTimeFormat().resolvedOptions().timeZone);

/** This week, or next week on Sundays, because Sunday is planning day. */
function startingMonday(): string {
  const today = browserNow().slice(0, 10);
  const monday = mondayOf(today);
  return addDays(monday, 6) === today ? addDays(monday, 7) : monday;
}

function blockClasses(entry: Entry): string[] {
  const past = addMinutes(entry.start!, entry.duration) <= browserNow();
  const overdue = past && entry.kind === 'task' && entry.status === 'open';
  return [
    `k-${entry.kind}`,
    entry.routine_id === null ? '' : 'routine',
    entry.status === 'done' ? 'done' : '',
    overdue ? 'overdue' : past ? 'past' : '',
  ].filter(Boolean);
}

/** Entries as FullCalendar events, each carrying its entry for the block and the click handler. */
export function toEvents(entries: Entry[]): EventInput[] {
  return entries.map((entry) => ({
    id: String(entry.id),
    title: entry.title,
    start: entry.start!,
    end: addMinutes(entry.start!, entry.duration),
    classNames: blockClasses(entry),
    extendedProps: { entry },
  }));
}

/** Saves a block dragged to a new time or resized, and puts it back if the save fails. */
export function moveOrResize(save: Save, info: EventDropArg | EventResizeDoneArg) {
  const { event } = info;
  const entry = event.extendedProps.entry as Entry;
  const changes = { start: fromDate(event.start!), duration: minutesBetween(event.start!, event.end!) };
  save(api.updateEntry(entry.id, changes), info.revert);
}

/** Saves an inbox task dropped on the grid, starting where it landed. */
export function placeDropped(save: Save, info: DropArg) {
  save(api.updateEntry(Number(info.draggedEl.dataset.id), { start: fromDate(info.date) }));
}

/** Grid settings shared by the week page and the phone's day page. */
export const gridOptions: CalendarOptions = {
  plugins: [timeGridPlugin, interactionPlugin],
  headerToolbar: false,
  allDaySlot: false,
  slotDuration: '00:30:00',
  snapDuration: '00:15:00',
  slotMinTime: '06:00:00',
  slotMaxTime: '24:00:00',
  height: '100%',
  nowIndicator: true,
  editable: true,
  slotLabelFormat: { hour: 'numeric', minute: '2-digit', omitZeroMinute: true, hour12: USE_12_HOUR },
  eventContent: (arg) => <Block arg={arg} />,
};

function Block({ arg }: { arg: EventContentArg }) {
  const { sig, title, migrations } = blockParts(arg.event.extendedProps.entry as Entry | undefined, arg.event.title);
  const start = arg.event.start!;
  const end = arg.event.end ?? start;
  return (
    <div className="blk">
      <div className="r1">
        <span className="sig">{sig}</span>
        <span className="ttl">{title}</span>
        {migrations > 0 && <span className="mig">&gt;{migrations}</span>}
      </div>
      <div className="tm">
        {formatTime(fromDate(start))} · {formatDuration(minutesBetween(start, end))}
      </div>
    </div>
  );
}

export function Planner({ onAuthError }: { onAuthError: () => void }) {
  const [monday, setMonday] = useState(startingMonday);
  const [week, setWeek] = useState<WeekView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof AuthError) onAuthError();
      else setMessage(err instanceof Error ? err.message : String(err));
    },
    [onAuthError],
  );

  // Clicking next week twice quickly sends two requests; drop any answer for a week no longer on screen.
  const shownMonday = useRef(monday);
  shownMonday.current = monday;
  const load = useCallback(
    () => api.week(monday).then((w) => { if (w.monday === shownMonday.current) setWeek(w); }, fail),
    [monday, fail],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    calendarRef.current?.getApi().gotoDate(monday);
  }, [monday]);

  useEffect(() => {
    window.addEventListener('focus', load); // picks up changes made on the phone or by the agent
    return () => window.removeEventListener('focus', load);
  }, [load]);

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

  function onSelect(info: DateSelectArg) {
    info.view.calendar.unselect();
    const title = window.prompt('New event')?.trim();
    if (!title) return;
    save(api.createEntry({ kind: 'event', title, start: fromDate(info.start), duration: minutesBetween(info.start, info.end) }));
  }

  function onClick(info: EventClickArg) {
    setOpenEntry(info.event.extendedProps.entry as Entry);
  }

  return (
    <div className="planner">
      <header className="top">
        <div className="title">
          <h1>Week {isoWeek(monday)}</h1>
          <span className="mono muted">{weekLabel(monday)}</span>
        </div>
        <nav aria-label="Week navigation">
          <button type="button" className="btn" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}>←</button>
          <button type="button" className="btn" onClick={() => setMonday(mondayOf(browserNow()))}>Today</button>
          <button type="button" className="btn" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}>→</button>
          <a className="btn" href="/routines">Routines</a>
        </nav>
      </header>
      {message && (
        <p className="message" role="alert">
          {message}
          <button type="button" className="btn" onClick={() => setMessage(null)}>Dismiss</button>
        </p>
      )}
      <div className="body">
        <InboxPanel week={week} save={save} onOpen={setOpenEntry} />
        <main className="grid">
          <FullCalendar
            ref={calendarRef}
            {...gridOptions}
            initialView="timeGridWeek"
            initialDate={monday}
            firstDay={1}
            scrollTime="07:00:00"
            selectable
            selectMinDistance={5}
            selectAllow={(span) => withinOneDay(span.start, span.end)}
            droppable
            dayHeaderContent={(arg) => `${formatDay(fromDate(arg.date))} ${arg.date.getDate()}`}
            events={toEvents(week?.entries ?? [])}
            drop={(info) => placeDropped(save, info)}
            eventDrop={(info) => moveOrResize(save, info)}
            eventResize={(info) => moveOrResize(save, info)}
            select={onSelect}
            eventClick={onClick}
          />
        </main>
      </div>
      {openEntry && <EntryDialog entry={openEntry} save={save} onClose={() => setOpenEntry(null)} />}
    </div>
  );
}
