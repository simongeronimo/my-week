import { useState } from 'react';
import type { ComponentType } from 'react';
import { getToken, setToken } from './api.ts';
import { Planner } from './Planner.tsx';
import { RoutinesPage } from './RoutinesPage.tsx';

/** One page per path. Pages link with plain <a href> loads, so no router library is needed. */
const PAGES: Record<string, ComponentType<{ onAuthError: () => void }>> = {
  '/routines': RoutinesPage,
};

export function App() {
  const [hasToken, setHasToken] = useState(() => Boolean(getToken()));
  if (!hasToken) {
    return (
      <TokenScreen
        onSave={(token) => {
          setToken(token);
          setHasToken(true);
        }}
      />
    );
  }
  const Page = PAGES[window.location.pathname] ?? Planner;
  return <Page onAuthError={() => setHasToken(false)} />;
}

function TokenScreen({ onSave }: { onSave: (token: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <main className="token-screen">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
      >
        <h1>my-week</h1>
        <label htmlFor="token">Paste your token</label>
        <input id="token" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} required />
        <button type="submit" className="btn primary">Save</button>
      </form>
    </main>
  );
}
