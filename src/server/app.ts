import { Hono } from 'hono';
import type { Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { HttpError, createEntry, createRoutine, deleteEntry, deleteRoutine, getWeek, listRoutines, updateEntry } from './week.ts';
import { isMonday, localNow, mondayOf } from '../shared/time.ts';

export type AppOptions = {
  db: DB;
  appToken: string;
  timeZone: string;
  distDir: string; // built frontend, relative to the working directory
};

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

function idParam(c: Context): number {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, `No item with id ${c.req.param('id')}`);
  return id;
}

export function createApp({ db, appToken, timeZone, distDir }: AppOptions): Hono {
  const app = new Hono();
  const now = () => localNow(timeZone);

  app.use('/api/*', async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    if (!header.startsWith('Bearer ') || !sameToken(header.slice(7), appToken)) {
      return c.json({ error: 'Missing or wrong token' }, 401);
    }
    await next();
  });

  app.get('/api/week', (c) => {
    const monday = c.req.query('monday') ?? mondayOf(now());
    if (!isMonday(monday)) throw new HttpError(400, 'monday must be a Monday date like 2026-11-23');
    return c.json(getWeek(db, monday, now()));
  });
  app.post('/api/entries', async (c) => c.json(createEntry(db, await jsonBody(c)), 201));
  app.patch('/api/entries/:id', async (c) => c.json(updateEntry(db, idParam(c), await jsonBody(c), now())));
  app.delete('/api/entries/:id', (c) => {
    deleteEntry(db, idParam(c));
    return c.body(null, 204);
  });
  app.get('/api/routines', (c) => c.json(listRoutines(db)));
  app.post('/api/routines', async (c) => c.json(createRoutine(db, await jsonBody(c), now()), 201));
  app.delete('/api/routines/:id', (c) => {
    deleteRoutine(db, idParam(c), now());
    return c.body(null, 204);
  });
  app.all('/api/*', (c) => c.json({ error: 'No such route' }, 404));

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    // node:sqlite marks constraint failures (CHECK, NOT NULL, wrong type, foreign key) with result code 19
    const e = err as Error & { code?: string; errcode?: number };
    if (e.code === 'ERR_SQLITE_ERROR' && ((e.errcode ?? 0) & 0xff) === 19) return c.json({ error: e.message }, 400);
    console.error(err);
    return c.json({ error: 'Internal error' }, 500);
  });

  app.use('/*', serveStatic({ root: distDir }));
  app.get('*', serveStatic({ path: join(distDir, 'index.html') })); // /today, /inbox and so on load the app
  return app;
}
