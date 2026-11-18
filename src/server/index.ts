import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { createApp } from './app.ts';

const appToken = process.env.APP_TOKEN;
if (!appToken) {
  console.error('APP_TOKEN is not set. Generate one with: openssl rand -hex 32');
  process.exit(1);
}
const dataDir = process.env.DATA_DIR ?? './data';
const port = Number(process.env.PORT ?? 3000);
const timeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

mkdirSync(dataDir, { recursive: true });
const db = openDb(join(dataDir, 'my-week.db'));
const app = createApp({ db, appToken, timeZone, distDir: 'dist' });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`my-week listening on port ${info.port}, time zone ${timeZone}`);
});

// Docker sends SIGTERM on stop. Node running as PID 1 ignores it unless we handle it.
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
