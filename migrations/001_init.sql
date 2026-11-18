CREATE TABLE routines (
  id        INTEGER PRIMARY KEY,
  kind      TEXT NOT NULL CHECK (kind IN ('task', 'event')),
  title     TEXT NOT NULL CHECK (title <> ''),
  days      TEXT NOT NULL CHECK (days GLOB '[M.][T.][W.][T.][F.][S.][S.]' AND days <> '.......'),
  at        TEXT NOT NULL CHECK (at GLOB '[0-9][0-9]:[0-9][0-9]' AND time(at) IS NOT NULL),
  duration  INTEGER NOT NULL CHECK (duration BETWEEN 5 AND 1440)
) STRICT;

CREATE TABLE entries (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('task', 'event')),
  title       TEXT NOT NULL CHECK (title <> ''),
  notes       TEXT,
  start       TEXT CHECK (start IS NULL OR (start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]' AND datetime(start) IS NOT NULL)),
  duration    INTEGER NOT NULL CHECK (duration BETWEEN 5 AND 1440),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  migrations  INTEGER NOT NULL DEFAULT 0,
  routine_id  INTEGER REFERENCES routines(id) ON DELETE SET NULL,
  created_by  TEXT NOT NULL DEFAULT 'me' CHECK (created_by IN ('me', 'agent')),
  CHECK (kind = 'task' OR start IS NOT NULL),  -- an event always has a time
  CHECK (kind = 'task' OR status <> 'done')    -- events are never ticked
) STRICT;

CREATE TABLE filled_weeks (
  monday TEXT PRIMARY KEY  -- '2026-11-23'
) STRICT;
