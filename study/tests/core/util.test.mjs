import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, formatDuration, optionLetter } from '../../engine/core/util/format.js';
import { ROUTE_ID_SOURCE, isRouteId } from '../../engine/core/util/ids.js';
import { shuffleWith } from '../../engine/core/util/random.js';

// Deterministic pseudo-random source (linear congruential generator).
// 可复现的伪随机数（线性同余生成器）。
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test('daysUntil counts whole local calendar days', () => {
  const now = new Date(2026, 9, 28, 23, 30);
  assert.equal(daysUntil('2026-11-10', now), 13);
  assert.equal(daysUntil('2026-10-28', now), 0);
  assert.equal(daysUntil('2026-10-06', now), -22);
  assert.equal(daysUntil('not-a-date', now), null);
});

test('formatDuration shows minutes and seconds and never goes negative', () => {
  assert.equal(formatDuration(3600), '60:00');
  assert.equal(formatDuration(75.9), '01:15');
  assert.equal(formatDuration(-5), '00:00');
});

test('optionLetter letters the first 26 options, numbers later ones and rejects non-indices', () => {
  assert.equal(optionLetter(0), 'A');
  assert.equal(optionLetter(5), 'F');
  assert.equal(optionLetter(25), 'Z');
  assert.equal(optionLetter(26), '27');
  assert.equal(optionLetter(-1), '?');
  assert.equal(optionLetter(1.5), '?');
  assert.equal(optionLetter('2'), '?');
});

test('isRouteId accepts lowercase kebab-case ids only', () => {
  for (const id of ['lec03', 's02-state-tree', 'f1', 'state-tree']) assert.equal(isRouteId(id), true, id);
  for (const id of ['Lec03', 'S03', 'a--b', 'a b', 'a/b', '-bad', 'three_in_a_row', '']) assert.equal(isRouteId(id), false, id);
  for (const value of [null, undefined, 3, {}]) assert.equal(isRouteId(value), false);
});

test('ROUTE_ID_SOURCE has no capture group, so routers can wrap it in their own', () => {
  const match = new RegExp(`^/learn/(${ROUTE_ID_SOURCE})$`).exec('/learn/s02-state-tree');
  assert.equal(match.length, 2);
  assert.equal(match[1], 's02-state-tree');
});

test('shuffleWith returns a permutation and leaves the input alone', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const output = shuffleWith(input, seeded(7));
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...output].sort((a, b) => a - b), input);
  assert.deepEqual(shuffleWith(input, seeded(7)), output);
  assert.equal(shuffleWith(input).length, input.length);
});

test('shuffleWith survives a broken random source', () => {
  assert.deepEqual(shuffleWith([1, 2, 3], () => Number.NaN).sort(), [1, 2, 3]);
  assert.deepEqual(shuffleWith([1, 2, 3], () => 1).sort(), [1, 2, 3]);
  assert.deepEqual(shuffleWith([1, 2, 3], () => -4).sort(), [1, 2, 3]);
  assert.deepEqual(shuffleWith([], seeded(1)), []);
});
