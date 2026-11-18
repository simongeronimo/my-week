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
};

export type Routine = {
  id: number;
  kind: Kind;
  title: string;
  days: string; // 'MTWTF..' = Monday to Friday
  at: string; // '08:00'
  duration: number;
};

export type WeekView = {
  monday: string;
  entries: Entry[];
  inbox: Entry[];
  unfinished: Entry[];
};

export type NewEntry = {
  kind: Kind;
  title: string;
  notes?: string | null;
  start?: string | null;
  duration: number;
};

export type NewRoutine = Omit<Routine, 'id'>;

export type EntryChanges = Partial<Pick<Entry, 'title' | 'notes' | 'start' | 'duration' | 'status'>>;
