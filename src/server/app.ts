import { Hono } from 'hono';
import type { Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { HttpError, createEntry, createRoutine, deleteEntry, deleteRoutine, getWeek, listRoutines, updateEntry } from './week.ts';
import { toIcs } from './ics.ts';
import { addDays, isMonday, localNow, mondayOf } from '../shared/time.ts';

export type AppOptions = {
  db: DB;
  appToken: string;
  agentToken?: string; // the planner agent: may read, and add tasks to the inbox
  feedToken?: string; // the calendar feed: read-only, sent in the URL
  timeZone: string;
  distDir: string; // built frontend, relative to the working directory
};

type Env = { Variables: { who: 'me' | 'agent' } };

const GUIDE = readFileSync(join(import.meta.dirname, '../../docs/agent-api.md'), 'utf8');
const AGENT_READS = ['/api/week', '/api/routines', '/api/guide'];

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

/** The agent may only add inbox tasks: kind task, no start. */
function isInboxTask(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const { kind, start } = body as Record<string, unknown>;
  return kind === 'task' && (start === undefined || start === null);
}

export function createApp({ db, appToken, agentToken, feedToken, timeZone, distDir }: AppOptions): Hono<Env> {
  const app = new Hono<Env>();
  const now = () => localNow(timeZone);

  app.use('/api/*', async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (sameToken(token, appToken)) {
      c.set('who', 'me');
    } else if (agentToken && sameToken(token, agentToken)) {
      const allowed =
        (c.req.method === 'GET' && AGENT_READS.includes(c.req.path)) || (c.req.method === 'POST' && c.req.path === '/api/entries');
      if (!allowed) return c.json({ error: 'The agent token can only read and add tasks to the inbox' }, 403);
      c.set('who', 'agent');
    } else {
      return c.json({ error: 'Missing or wrong token' }, 401);
    }
    await next();
  });

  app.get('/api/guide', (c) => c.body(GUIDE, 200, { 'Content-Type': 'text/markdown; charset=utf-8' }));
  app.get('/api/week', (c) => {
    const monday = c.req.query('monday') ?? mondayOf(now());
    if (!isMonday(monday)) throw new HttpError(400, 'monday must be a Monday date like 2026-11-23');
    return c.json(getWeek(db, monday, now()));
  });
  app.post('/api/entries', async (c) => {
    const body = await jsonBody(c);
    const who = c.get('who');
    if (who === 'agent' && !isInboxTask(body)) {
      throw new HttpError(403, 'The agent token can only add tasks without a start, which go to the inbox');
    }
    return c.json(createEntry(db, body, who), 201);
  });
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

  // iPhone Calendar can't send headers, so the feed token is part of the URL. It can only read.
  app.get('/calendar.ics', (c) => {
    if (!feedToken) return c.json({ error: 'The calendar feed is off. Set FEED_TOKEN to turn it on.' }, 404);
    if (!sameToken(c.req.query('token') ?? '', feedToken)) return c.json({ error: 'Missing or wrong token' }, 401);
    const monday = mondayOf(now());
    const entries = [0, 7, 14, 21].flatMap((days) => getWeek(db, addDays(monday, days), now()).entries); // this week and the next three
    return c.body(toIcs(entries, new Date()), 200, { 'Content-Type': 'text/calendar; charset=utf-8' });
  });

  app.use('/*', serveStatic({ root: distDir }));
  app.get('*', serveStatic({ path: join(distDir, 'index.html') })); // /today, /inbox and so on load the app
  return app;
}
