import type { Entry, EntryChanges, NewEntry, NewRoutine, Routine, WeekView } from '../shared/types.ts';

const TOKEN_KEY = 'my-week-token';

/** Thrown on a 401, so the app can show the token screen again. */
export class AuthError extends Error {}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${getToken() ?? ''}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new AuthError('Missing or wrong token');
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (res.headers.get('Content-Type')?.includes('json') ? await res.json() : await res.text()) as T;
}

export const api = {
  week: (monday: string) => request<WeekView>('GET', `/api/week?monday=${monday}`),
  log: (day: string) => request<string>('GET', `/api/log?day=${day}`),
  createEntry: (entry: NewEntry) => request<Entry>('POST', '/api/entries', entry),
  updateEntry: (id: number, changes: EntryChanges) => request<Entry>('PATCH', `/api/entries/${id}`, changes),
  deleteEntry: (id: number) => request<void>('DELETE', `/api/entries/${id}`),
  routines: () => request<Routine[]>('GET', '/api/routines'),
  createRoutine: (routine: NewRoutine) => request<Routine>('POST', '/api/routines', routine),
  deleteRoutine: (id: number) => request<void>('DELETE', `/api/routines/${id}`),
};
