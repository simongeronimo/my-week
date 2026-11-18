import { useState } from 'react';
import { getToken, setToken } from './api.ts';
import { Planner } from './Planner.tsx';

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
  return <Planner onAuthError={() => setHasToken(false)} />;
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
