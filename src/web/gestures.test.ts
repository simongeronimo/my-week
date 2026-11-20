import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDoubleTap, isUndoKey, throwVelocity } from './gestures.ts';

/** Pointer samples every 16 ms, moving `step` pixels to the right each time. */
const samples = (count: number, step: number) => Array.from({ length: count }, (_, i) => ({ x: i * step, y: 0, t: i * 16 }));

test('letting go while moving fast is a throw, in the direction of the movement', () => {
  const moving = samples(8, 30); // 30 px every 16 ms, about 1.9 px per ms
  const velocity = throwVelocity(moving, moving.at(-1)!.t + 8);
  assert.ok(velocity);
  assert.ok(velocity.vx > 1.2);
  assert.equal(velocity.vy, 0);
});

test('letting go during a slow drag is not a throw', () => {
  const moving = samples(8, 5); // 5 px every 16 ms, about 0.3 px per ms
  assert.equal(throwVelocity(moving, moving.at(-1)!.t + 8), null);
});

test('moving fast, then stopping before letting go, is not a throw', () => {
  const moving = samples(8, 30);
  assert.equal(throwVelocity(moving, moving.at(-1)!.t + 300), null);
});

test('a drag with too few samples is not a throw', () => {
  assert.equal(throwVelocity([], 100), null);
  assert.equal(throwVelocity([{ x: 0, y: 0, t: 90 }], 100), null);
});

test('two taps on the same time close together are a double tap', () => {
  assert.equal(isDoubleTap({ t: 1000, at: 5 }, { t: 1300, at: 5 }), true);
});

test('taps too far apart, on another time, or with no tap before are not a double tap', () => {
  assert.equal(isDoubleTap({ t: 1000, at: 5 }, { t: 1500, at: 5 }), false);
  assert.equal(isDoubleTap({ t: 1000, at: 5 }, { t: 1200, at: 6 }), false);
  assert.equal(isDoubleTap(null, { t: 1200, at: 5 }), false);
});

test('Ctrl+Z and Cmd+Z undo, but not while typing, and not with Shift', () => {
  const key = { key: 'z', ctrlKey: false, metaKey: false, shiftKey: false };
  assert.equal(isUndoKey({ ...key, ctrlKey: true }, false), true);
  assert.equal(isUndoKey({ ...key, metaKey: true }, false), true);
  assert.equal(isUndoKey({ ...key, key: 'Z', ctrlKey: true }, false), true); // Caps Lock on
  assert.equal(isUndoKey({ ...key, ctrlKey: true }, true), false);
  assert.equal(isUndoKey({ ...key, ctrlKey: true, shiftKey: true }, false), false);
  assert.equal(isUndoKey(key, false), false);
});
