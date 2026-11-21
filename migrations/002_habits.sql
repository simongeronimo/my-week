-- Habits: a routine with no time. Each day it applies, its copy is a task with no start and a day.
-- SQLite can't change a column's constraints in place, so routines is rebuilt. The migration runner
-- turns foreign keys off around this, or dropping the old table would clear routine_id on every copy.
CREATE TABLE routines_new (
  id        INTEGER PRIMARY KEY,
  kind      TEXT NOT NULL CHECK (kind IN ('task', 'event')),
  title     TEXT NOT NULL CHECK (title <> ''),
  days      TEXT NOT NULL CHECK (days GLOB '[M.][T.][W.][T.][F.][S.][S.]' AND days <> '.......'),
  at        TEXT CHECK (at IS NULL OR (at GLOB '[0-9][0-9]:[0-9][0-9]' AND time(at) IS NOT NULL AND at < '24:00')),
  duration  INTEGER NOT NULL CHECK (duration BETWEEN 5 AND 1440),
  carry     INTEGER NOT NULL DEFAULT 0 CHECK (carry IN (0, 1)),  -- a missed habit copy shows on later days of its week
  CHECK (kind = 'task' OR at IS NOT NULL)  -- only a task can be a habit
) STRICT;
INSERT INTO routines_new (id, kind, title, days, at, duration) SELECT id, kind, title, days, at, duration FROM routines;
DROP TABLE routines;
ALTER TABLE routines_new RENAME TO routines;

ALTER TABLE entries ADD COLUMN day TEXT;  -- '2026-11-25' on a habit copy: the day it belongs to
