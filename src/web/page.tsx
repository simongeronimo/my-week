import { useCallback, useEffect, useRef, useState } from 'react';
import type { Entry, EntryChanges, NewEntry } from '../shared/types.ts';
import { localNow } from '../shared/time.ts';
import { AuthError, api } from './api.ts';
import { isUndoKey } from './gestures.ts';

/** The wall-clock time right now in this browser's time zone. */
export const browserNow = () => localNow(Intl.DateTimeFormat().resolvedOptions().timeZone);

/** Error handling shared by the pages: a 401 shows the token screen, anything else shows a banner. */
export function useErrors(onAuthError: () => void) {
  const [message, setMessage] = useState<string | null>(null);
  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof AuthError) onAuthError();
      else setMessage(err instanceof Error ? err.message : String(err));
    },
    [onAuthError],
  );
  return { message, fail, clear: () => setMessage(null) };
}

export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <p className="message" role="alert">
      {message}
      <button type="button" className="btn" onClick={onDismiss}>Dismiss</button>
    </p>
  );
}

/** Loads a page's data now, and again whenever the app comes back to the front. */
export function useReloadOnShow(load: () => unknown) {
  useEffect(() => {
    load();
    const onShow = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [load]);
}

/** A ref for a <dialog> that opens as a modal when it mounts, so Escape and focus handling come for free. */
export function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return ref;
}

/**
 * Sends a change and resolves to whether it worked. revert puts the grid back if it fails;
 * reverse, if given, is how Ctrl+Z undoes it.
 */
export type Save = (change: Promise<unknown>, revert?: () => void, reverse?: () => Promise<unknown>) => Promise<boolean>;

/**
 * Saving for every page: sends a change, puts the grid back if it fails, reloads,
 * and remembers how to reverse it. Ctrl+Z or Cmd+Z reverses the last change, then the one before.
 */
export function useSave(load: () => Promise<unknown>, fail: (err: unknown) => void) {
  const steps = useRef<Array<() => Promise<unknown>>>([]); // ponytail: forgotten on reload, and no redo; add redo if you miss it
  const save: Save = useCallback(
    async (change, revert, reverse) => {
      let ok = true;
      try {
        await change;
        if (reverse) steps.current.push(reverse);
      } catch (err) {
        ok = false;
        revert?.();
        fail(err);
      }
      await load();
      return ok;
    },
    [fail, load],
  );
  const undo = useCallback(() => {
    const step = steps.current.pop();
    if (step) save(step());
  }, [save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]') !== null;
      if (!isUndoKey(e, typing)) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  return { save, undo };
}

/** Creates an entry. Undo deletes it again. */
export function addEntry(save: Save, entry: NewEntry) {
  const created = api.createEntry(entry);
  return save(created, undefined, async () => api.deleteEntry((await created).id));
}

/** Changes an entry. Undo puts back the fields it had, or `before` when the server changes more than was sent. */
export function saveUpdate(save: Save, entry: Entry, changes: EntryChanges, before = fieldsOf(entry, changes)) {
  return save(api.updateEntry(entry.id, changes), undefined, () => api.updateEntry(entry.id, before));
}

const fieldsOf = (entry: Entry, changes: EntryChanges) =>
  Object.fromEntries(Object.keys(changes).map((key) => [key, entry[key as keyof EntryChanges]])) as EntryChanges;
