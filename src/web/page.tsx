import { useCallback, useState } from 'react';
import { localNow } from '../shared/time.ts';
import { AuthError } from './api.ts';

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
