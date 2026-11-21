import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DropArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import type { CalendarOptions, DateSelectArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core';
import { signifier } from '../shared/types.ts';
import type { Entry, WeekView } from '../shared/types.ts';
import {
  USE_12_HOUR, addDays, addMinutes, formatDay, formatDuration, formatTime, fromDate, isoWeek, minutesBetween, mondayOf, weekLabel,
} from '../shared/time.ts';
import { api } from './api.ts';
import { InboxPanel } from './InboxPanel.tsx';
import { withinOneDay } from './block.ts';
import { EntryDialog, NewTaskDialog } from './EntryDialog.tsx';
import { useDoubleTap, useThrowAway } from './gestures.ts';
import { ErrorBanner, addEntry, browserNow, saveUpdate, useErrors, useSave } from './page.tsx';
import type { Save } from './page.tsx';
import { STEP, TIMELINE_FROM, TIMELINE_TO } from './today.ts';

/** This week, or next week on Sundays, because Sunday is planning day. */
function startingMonday(): string {
  const today = browserNow().slice(0, 10);
  const monday = mondayOf(today);
  return addDays(monday, 6) === today ? addDays(monday, 7) : monday;
}

function blockClasses(entry: Entry, now: string): string[] {
  const past = addMinutes(entry.start!, entry.duration) <= now;
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
  const now = browserNow();
  return entries.map((entry) => ({
    id: String(entry.id),
    title: entry.title,
    start: entry.start!,
    end: addMinutes(entry.start!, entry.duration),
    classNames: blockClasses(entry, now),
    extendedProps: { entry },
  }));
}

/** Saves a block dragged to a new time or resized, and puts it back if the save fails. */
function moveOrResize(save: Save, info: EventDropArg | EventResizeDoneArg) {
  const { event, oldEvent } = info;
  const entry = event.extendedProps.entry as Entry;
  const changes = { start: fromDate(event.start!), duration: minutesBetween(event.start!, event.end!) };
  const before = { start: fromDate(oldEvent.start!), duration: minutesBetween(oldEvent.start!, oldEvent.end!) };
  save(api.updateEntry(entry.id, changes), info.revert, () => api.updateEntry(entry.id, before));
}

/** Saves an inbox task dropped on the grid, starting where it landed. */
function placeDropped(save: Save, info: DropArg) {
  const { id, start } = info.draggedEl.dataset; // start is empty for an inbox task, a past time for an overdue one
  save(api.updateEntry(Number(id), { start: fromDate(info.date) }), undefined, () => api.updateEntry(Number(id), { start: start || null }));
}

/**
 * What the week page and the day page share on top of the grid: dropping inbox tasks on it, tapping
 * a task's box to tick it, tapping the rest of a block to open it, throwing a block away, double-click
 * or double-tap to add a task, and the undo bar after a throw. Spread calendarProps on FullCalendar and render overlays after it.
 */
export function useGridExtras(
  save: Save, undo: () => void, setWeek: Dispatch<SetStateAction<WeekView | null>>, onOpen: (entry: Entry) => void,
) {
  const [thrown, setThrown] = useState<{ title: string; at: number } | null>(null);
  const [newAt, setNewAt] = useState<Date | null>(null);

  const throwing = useThrowAway((entry) => {
    setWeek((w) => w && { ...w, entries: w.entries.filter((e) => e.id !== entry.id) }); // gone at once, not after the reload
    // Thrown blocks are hidden as cancelled, not erased, so undo can always bring them back.
    saveUpdate(save, entry, { status: 'cancelled' });
    setThrown({ title: entry.title, at: Date.now() });
  });
  const dateClick = useDoubleTap(setNewAt);

  const calendarProps = {
    droppable: true,
    drop: (info: DropArg) => placeDropped(save, info),
    eventDragStart: throwing.eventDragStart,
    eventDragStop: throwing.eventDragStop,
    eventDrop: (info: EventDropArg) => (throwing.wasThrown(info.event.id) ? info.event.remove() : moveOrResize(save, info)),
    eventResize: (info: EventResizeDoneArg) => moveOrResize(save, info),
    eventClick: (info: EventClickArg) => {
      const entry = info.event.extendedProps.entry as Entry;
      if (entry.kind === 'task' && (info.jsEvent.target as Element).closest('.sig')) {
        saveUpdate(save, entry, { status: entry.status === 'done' ? 'open' : 'done' });
      } else {
        onOpen(entry);
      }
    },
    dateClick,
  };
  const overlays = (
    <>
      {thrown && (
        // ponytail: Undo here reverses the last change, which is the throw unless you change something else within 5 seconds
        <UndoBar key={thrown.at} text={`Threw away "${thrown.title}"`} onUndo={() => { undo(); setThrown(null); }} onDone={() => setThrown(null)} />
      )}
      {newAt && <NewTaskDialog start={newAt} save={save} onClose={() => setNewAt(null)} />}
    </>
  );
  return { calendarProps, overlays };
}

/** A short-lived bar with an Undo button, for the phone, which has no Ctrl+Z. */
function UndoBar({ text, onUndo, onDone }: { text: string; onUndo: () => void; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 5000);
    return () => clearTimeout(timer);
  }, []); // once per bar: each throw remounts it through its key
  return (
    <div className="undo-bar" role="status">
      <span>{text}</span>
      <button type="button" className="btn" onClick={onUndo}>Undo</button>
    </div>
  );
}

/** Grid settings shared by the week page and the phone's day page. */
export const gridOptions: CalendarOptions = {
  plugins: [timeGridPlugin, interactionPlugin],
  headerToolbar: false,
  allDaySlot: false,
  slotDuration: '00:30:00',
  snapDuration: { minutes: STEP },
  slotMinTime: { minutes: TIMELINE_FROM },
  slotMaxTime: { minutes: TIMELINE_TO },
  height: '100%',
  nowIndicator: true,
  editable: true,
  slotLabelFormat: { hour: 'numeric', minute: '2-digit', omitZeroMinute: true, hour12: USE_12_HOUR },
  eventContent: (arg) => <Block arg={arg} />,
};

function Block({ arg }: { arg: EventContentArg }) {
  const entry = arg.event.extendedProps.entry as Entry | undefined; // missing on the preview FullCalendar draws while an inbox task is dragged over the grid
  const start = arg.event.start!;
  const end = arg.event.end ?? start;
  return (
    <div className="blk">
      <div className="r1">
        <span className={entry?.kind === 'task' ? 'sig box' : 'sig'}>{entry ? signifier(entry) : '•'}</span>
        <span className="ttl">{arg.event.title}</span>
        {entry && entry.migrations > 0 && <span className="mig">&gt;{entry.migrations}</span>}
      </div>
      <div className="tm">
        {formatTime(fromDate(start))} · {formatDuration(minutesBetween(start, end))}
      </div>
      {entry?.notes && <div className="desc">{entry.notes}</div>}
    </div>
  );
}

export function Planner({ onAuthError }: { onAuthError: () => void }) {
  const [monday, setMonday] = useState(startingMonday);
  const [week, setWeek] = useState<WeekView | null>(null);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const { message, fail, clear } = useErrors(onAuthError);
  const calendarRef = useRef<FullCalendar>(null);

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

  const { save, undo } = useSave(load, fail);
  const { calendarProps, overlays } = useGridExtras(save, undo, setWeek, setOpenEntry);
  const events = useMemo(() => toEvents(week?.entries ?? []), [week]); // a new array each render would make FullCalendar redraw every block

  function onSelect(info: DateSelectArg) {
    info.view.calendar.unselect();
    const title = window.prompt('New event')?.trim();
    if (!title) return;
    addEntry(save, { kind: 'event', title, start: fromDate(info.start), duration: minutesBetween(info.start, info.end) });
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
      <ErrorBanner message={message} onDismiss={clear} />
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
            dayHeaderContent={(arg) => `${formatDay(fromDate(arg.date))} ${arg.date.getDate()}`}
            events={events}
            {...calendarProps}
            select={onSelect}
          />
        </main>
      </div>
      {openEntry && <EntryDialog entry={openEntry} save={save} onClose={() => setOpenEntry(null)} />}
      {overlays}
    </div>
  );
}
