import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';
import { localNow } from '../shared/time.ts';

const appToken = process.env.APP_TOKEN;
if (!appToken) {
  console.error('APP_TOKEN is not set. Generate one with: openssl rand -hex 32');
  process.exit(1);
}
const agentToken = process.env.AGENT_TOKEN || undefined; // optional: the planner agent's access
const feedToken = process.env.FEED_TOKEN || undefined; // optional: the calendar feed
const tokens = [appToken, agentToken, feedToken].filter((token) => token !== undefined);
if (new Set(tokens).size !== tokens.length) {
  console.error('APP_TOKEN, AGENT_TOKEN and FEED_TOKEN must all be different. Generate each with: openssl rand -hex 32');
  process.exit(1);
}
const dataDir = process.env.DATA_DIR ?? './data';
const port = Number(process.env.PORT ?? 3000);
const timeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
try {
  localNow(timeZone); // a typo here would otherwise turn every API call into a 500
} catch {
  console.error(`TZ "${timeZone}" is not a time zone name this server knows. Use one like Europe/Berlin.`);
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });
const db = openDb(join(dataDir, 'my-week.db'));
const app = createApp({ db, appToken, agentToken, timeZone, distDir: 'dist' });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`my-week listening on port ${info.port}, time zone ${timeZone}`);
});

// Docker sends SIGTERM on stop. Node running as PID 1 ignores it unless we handle it.
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
