import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the server refuses to start with a misspelled TZ', () => {
  const result = spawnSync(process.execPath, [join(import.meta.dirname, 'index.ts')], {
    env: { ...process.env, TZ: 'Europe/Berln', APP_TOKEN: 'x', PORT: '0', DATA_DIR: mkdtempSync(join(tmpdir(), 'my-week-')) },
    encoding: 'utf8',
    timeout: 5000, // without the check the server starts and keeps running until this kills it
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TZ "Europe\/Berln"/);
});
