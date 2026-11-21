import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';
import { PlusIcon, SquaresFourIcon, TrayIcon } from '@phosphor-icons/react';
import type { Entry, EntryChanges, WeekView } from '../shared/types.ts';
import { addDays, addMinutes, formatDate, formatDay, formatDuration, formatTime, mondayOf } from '../shared/time.ts';
import { api } from './api.ts';
import { STEP, TIMELINE_FROM, TIMELINE_MINUTES, dayRows, lanes, nextEntry, shiftStart, timelineMinute } from './today.ts';
import { QuickAdd } from './InboxPanel.tsx';
import { EntryDialog } from './EntryDialog.tsx';
import { useHoldDrag } from './gestures.ts';
import { firstLine } from './block.ts';
import { ErrorBanner, addEntry, browserNow, saveUpdate, useErrors, useModal, useReloadOnShow, useSave } from './page.tsx';
import type { Save } from './page.tsx';

/** Row heights in px. They're fixed, so the list and the timeline are both plain positions the browser can animate between. */
const ROW = { entry: 52, free: 24, now: 22 };
const ROW_GAP = 2;
/** Width in px of the list's time column, and of the hour labels in the timeline. */
const AXIS = 62;
/** The shortest block in the timeline, in px, so a 15-minute task still shows its title. */
const MIN_BLOCK = 20;
/** The timeline's hour labels, in minutes from 6 am: every two hours. */
const HOURS = Array.from({ length: TIMELINE_MINUTES / 120 + 1 }, (_, i) => i * 120);

/**
 * A row being held and dragged. delta is how far it has moved, in minutes. origin is where 6 am sits
 * in the list, in px from its top, scale is px per minute, and height is the timeline's height in px.
 */
type Drag = { id: number; delta: number; origin: number; scale: number; height: number };

/** The phone's home screen: today as a compact list. Hold a row to drag it, and the list turns into a timeline until you let go. */
export function Today({ onAuthError }: { onAuthError: () => void }) {
  const [weeks, setWeeks] = useState<WeekView[] | null>(null);
  const [now, setNow] = useState(browserNow);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null); // the same drag, for touch handlers that run before React renders again
  const listRef = useRef<HTMLOListElement>(null);
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

  useReloadOnShow(load);
  useEffect(() => {
    const tick = setInterval(() => {
      const current = browserNow();
      setNow(current);
      if (current.slice(0, 10) !== loadedDay.current) load(); // a page left open past midnight fetches the new day
    }, 15_000);
    return () => clearInterval(tick);
  }, [load]);

  const { save } = useSave(load, fail);

  const entries = weeks?.flatMap((w) => w.entries) ?? [];
  const today = now.slice(0, 10);
  const rows = dayRows(entries, now);
  const next = nextEntry(entries, now);
  const inbox = weeks?.[0].inbox.length ?? 0;
  const overdue = weeks?.[0].unfinished.length ?? 0;

  /** Changes an entry on screen at once, then saves it. */
  function change(entry: Entry, changes: EntryChanges) {
    setWeeks((ws) => ws && ws.map((w) => ({ ...w, entries: w.entries.map((e) => (e.id === entry.id ? { ...e, ...changes } : e)) })));
    saveUpdate(save, entry, changes);
  }

  const setDragNow = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const hold = useHoldDrag({
    start: (id) => {
      const box = listRef.current!.getBoundingClientRect();
      const top = Math.max(box.top, 12); // the timeline fills the screen from the list's top down, even when scrolled
      const height = window.innerHeight - top - 24;
      setDragNow({ id, delta: 0, origin: top - box.top, scale: height / TIMELINE_MINUTES, height });
      navigator.vibrate?.(10);
    },
    move: (dy) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = Math.round(dy / d.scale / STEP) * STEP; // only redraw when it moves a whole step
      if (delta !== d.delta) setDragNow({ ...d, delta });
    },
    end: (drop) => {
      const d = dragRef.current;
      setDragNow(null);
      const entry = entries.find((e) => e.id === d?.id);
      if (!drop || !d || !entry) return;
      const start = shiftStart(entry.start!, entry.duration, d.delta);
      if (start !== entry.start) change(entry, { start });
    },
  });

  // Where each row sits: stacked in the list, or by its time in the timeline while a row is dragged.
  let listY = 0;
  const tops = rows.map((row) => {
    const top = listY;
    listY += ROW[row.type] + ROW_GAP;
    return top;
  });
  const listHeight = Math.max(0, listY - ROW_GAP);
  const lane = drag && lanes(rows.flatMap((row) => (row.type === 'entry' ? [row.entry] : [])));
  const lifted = drag && entries.find((e) => e.id === drag.id);
  const liftedStart = drag && lifted ? shiftStart(lifted.start!, lifted.duration, drag.delta) : null;
  const y = (minute: number) => drag!.origin + minute * drag!.scale;

  function place(entry: Entry, i: number): CSSProperties {
    if (!drag) return { top: tops[i], height: ROW.entry, left: 0, width: '100%' };
    const isLifted = entry.id === drag.id;
    const start = isLifted ? liftedStart! : entry.start!;
    const from = timelineMinute(start, today);
    const to = timelineMinute(addMinutes(start, entry.duration), today);
    const { col, cols } = isLifted ? { col: 0, cols: 1 } : lane!.get(entry.id)!;
    return {
      top: y(from),
      height: Math.max(MIN_BLOCK, (to - from) * drag.scale),
      left: `calc(${AXIS}px + (100% - ${AXIS}px) * ${col / cols})`,
      width: `calc((100% - ${AXIS}px) / ${cols} - 2px)`,
    };
  }

  return (
    <main className="phone today">
      <header className="phone-top today-top">
        <div className="when">
          <h1>{formatDate(now)}</h1>
          <span className="mono muted">{formatTime(now)}</span>
        </div>
        <nav aria-label="Pages">
          <a className="icon-btn" href="/day" aria-label="Arrange day" title="Arrange day">
            <SquaresFourIcon size={22} aria-hidden="true" />
          </a>
          <a className="icon-btn" href="/inbox" aria-label={`Inbox, ${inbox + overdue} tasks${overdue ? `, ${overdue} overdue` : ''}`} title="Inbox">
            <TrayIcon size={22} aria-hidden="true" />
            {inbox + overdue > 0 && <span className={overdue ? 'badge overdue' : 'badge'}>{inbox + overdue}</span>}
          </a>
        </nav>
      </header>
      <ErrorBanner message={message} onDismiss={clear} />

      <ol
        ref={listRef}
        className={drag ? 'day-list timeline' : 'day-list'}
        aria-label="Today"
        style={{ height: drag ? Math.max(listHeight, drag.origin + drag.height) : listHeight }}
      >
        {drag && HOURS.map((minute) => (
          <li key={`hour-${minute}`} className="hour" aria-hidden="true" style={{ top: y(minute) }}>
            <span className="mono">{formatTime(addMinutes(`${today}T00:00`, TIMELINE_FROM + minute)).replace(':00', '')}</span>
          </li>
        ))}
        {rows.map((row, i) => {
          if (row.type === 'free') {
            return <li key={`free-${i}`} className={row.past ? 'free-row past' : 'free-row'} style={{ top: tops[i], height: ROW.free }}>{formatDuration(row.minutes)} free</li>;
          }
          if (row.type === 'now') {
            return (
              <li key="now" className="now-row" aria-label={`Now, ${formatTime(now)}`} style={{ top: drag ? y(timelineMinute(now, today)) - ROW.now / 2 : tops[i], height: ROW.now }}>
                <span className="mono">{formatTime(now).replace(/ [ap]m$/, '')}</span>
                <span className="bar" />
              </li>
            );
          }
          const { entry } = row;
          return (
            <EntryRow
              key={entry.id}
              entry={entry}
              now={now}
              style={place(entry, i)}
              lifted={drag?.id === entry.id}
              hold={entry.start!.slice(0, 10) === today ? hold(entry.id) : {}} // last night's entries stay put
              onTick={() => change(entry, { status: entry.status === 'done' ? 'open' : 'done' })}
              onOpen={() => setOpenEntry(entry)}
            />
          );
        })}
        {liftedStart && (
          <li className="drag-time mono" aria-hidden="true" style={{ top: y(timelineMinute(liftedStart, today)) }}>{formatTime(liftedStart)}</li>
        )}
      </ol>

      {weeks === null && <p className="hint">Loading the day.</p>}
      {weeks !== null && rows.length === 0 && <p className="hint">Nothing planned today.</p>}
      {next && next.start!.slice(0, 10) !== today && <p className="hint">Next: {formatDay(next.start!)} {formatTime(next.start!)}, {next.title}</p>}

      {!drag && (
        <button type="button" className="fab" aria-label="Add a task" onClick={() => setAdding(true)}>
          <PlusIcon size={26} aria-hidden="true" />
        </button>
      )}
      {adding && <AddSheet save={save} onClose={() => setAdding(false)} />}
      {openEntry && <EntryDialog entry={openEntry} save={save} onClose={() => setOpenEntry(null)} />}
    </main>
  );
}

type RowProps = {
  entry: Entry;
  now: string;
  style: CSSProperties;
  lifted: boolean;
  hold: HTMLAttributes<HTMLLIElement>;
  onTick: () => void;
  onOpen: () => void;
};

/** One entry: time, a tick box for tasks (○ for events), the title that opens the dialog, and its length. */
function EntryRow({ entry, now, style, lifted, hold, onTick, onOpen }: RowProps) {
  const end = addMinutes(entry.start!, entry.duration);
  const running = entry.start! <= now && end > now;
  const past = end <= now;
  const done = entry.status === 'done';
  const isTask = entry.kind === 'task';
  const classes = [
    'entry', `k-${entry.kind}`, entry.routine_id !== null && 'routine', running && 'running', past && 'past',
    done && 'done', past && isTask && !done && 'overdue', lifted && 'lifted',
  ];
  return (
    <li className={classes.filter(Boolean).join(' ')} style={style} {...hold}>
      <span className="time mono">{formatTime(entry.start!)}</span>
      {isTask ? (
        <button type="button" className="tick" aria-label={`${done ? 'Untick' : 'Tick'} ${entry.title}`} onClick={onTick}>
          <span className="box" aria-hidden="true">{done ? '×' : '•'}</span>
        </button>
      ) : (
        <span className="ev" aria-hidden="true">○</span>
      )}
      <button type="button" className="what" onClick={onOpen}>
        <span className="ttl">{entry.title}</span>
        {running ? <span className="sub now-sub">now, until {formatTime(end)}</span> : entry.notes && <span className="sub">{firstLine(entry.notes)}</span>}
      </button>
      <span className="len mono">
        {entry.migrations > 0 && <span className="mig">&gt;{entry.migrations} </span>}
        {formatDuration(entry.duration)}
      </span>
    </li>
  );
}

/** The + button's form, as a sheet from the bottom of the screen. Tap outside it or press Escape to close it. */
function AddSheet({ save, onClose }: { save: Save; onClose: () => void }) {
  const ref = useModal();
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label="New task"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // a tap on the dimmed backdrop lands on the dialog itself
      }}
    >
      <QuickAdd
        onCancel={onClose}
        onAdd={(title, duration, notes) => {
          onClose();
          addEntry(save, { kind: 'task', title, duration, notes });
        }}
      />
    </dialog>
  );
}
