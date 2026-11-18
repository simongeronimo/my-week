import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Starts the real server with extra environment variables; a server that does start gets stopped after 5 s. */
function start(env: Record<string, string>) {
  return spawnSync(process.execPath, [join(import.meta.dirname, 'index.ts')], {
    env: { ...process.env, TZ: 'UTC', APP_TOKEN: 'x', PORT: '0', DATA_DIR: mkdtempSync(join(tmpdir(), 'my-week-')), ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
}

test('the server refuses to start with a misspelled TZ', () => {
  const result = start({ TZ: 'Europe/Berln' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TZ "Europe\/Berln"/);
});

test('the server refuses to start when any two tokens are the same', () => {
  const pairs = [
    { APP_TOKEN: 'same', AGENT_TOKEN: 'same' },
    { APP_TOKEN: 'same', FEED_TOKEN: 'same' },
    { AGENT_TOKEN: 'same', FEED_TOKEN: 'same' },
  ];
  for (const env of pairs) {
    const result = start(env);
    assert.equal(result.status, 1, Object.keys(env).join(' = '));
    assert.match(result.stderr, /must all be different/);
  }
});
