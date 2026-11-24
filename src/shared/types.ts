export type Kind = 'task' | 'event';
export type Status = 'open' | 'done' | 'cancelled';

export type Entry = {
  id: number;
  kind: Kind;
  title: string;
  notes: string | null;
  start: string | null; // '2026-11-23T09:00', null while the task is in the inbox
  duration: number; // minutes
  status: Status;
  migrations: number;
  routine_id: number | null;
  created_by: 'me' | 'agent';
  day: string | null; // '2026-11-25' on a habit copy: the day it belongs to
};

export type Routine = {
  id: number;
  kind: Kind;
  title: string;
  days: string; // 'MTWTF..' = Monday to Friday
  at: string | null; // '08:00', or null for a habit, which you do at any time
  duration: number;
  carry: 0 | 1; // 1: a habit copy you miss shows on the later days of its week
};

export type WeekView = {
  monday: string;
  entries: Entry[];
  inbox: Entry[];
  unfinished: Entry[];
  habits: Entry[]; // open, unplaced habit copies; see getWeek on the server
  dayTasks: Entry[]; // open tasks with a day in the shown week but no time yet, from today on
};

export type NewEntry = {
  kind: Kind;
  title: string;
  notes?: string | null;
  start?: string | null;
  duration: number;
  day?: string | null; // a day task: a day but no time yet
};

export type NewRoutine = Omit<Routine, 'id'>;

export type EntryChanges = Partial<Pick<Entry, 'title' | 'notes' | 'start' | 'duration' | 'status' | 'day'>>;

/** The bullet journal signifier in front of an entry: ○ event, • open task, × done task. The app and the calendar feed share it. */
export const signifier = (e: Pick<Entry, 'kind' | 'status'>) => (e.kind === 'event' ? '○' : e.status === 'done' ? '×' : '•');
