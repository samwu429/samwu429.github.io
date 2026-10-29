import test from 'node:test';
import assert from 'node:assert/strict';

import { shuffleWith } from '../../../engine/core/util/random.js';
import { createRng, randomSeed } from '../../../engine/views/practice/logic/rng.js';

test('createRng: same seed, same sequence, values in [0, 1)', () => {
  const a = createRng(123);
  const b = createRng(123);
  const first = Array.from({ length: 50 }, () => a());
  const second = Array.from({ length: 50 }, () => b());
  assert.deepEqual(first, second);
  for (const value of first) assert.ok(value >= 0 && value < 1);
  const other = createRng(124);
  assert.notDeepEqual(Array.from({ length: 5 }, () => other()), first.slice(0, 5));
});

test('createRng: unusual seeds still work', () => {
  for (const seed of [0, -1, 2 ** 40, '17', Number.NaN]) {
    const next = createRng(seed);
    const value = next();
    assert.ok(value >= 0 && value < 1);
  }
  const seed = randomSeed();
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
});

test('shuffleWith: permutation of a copy, reproducible with a seed', () => {
  const items = Array.from({ length: 30 }, (_, index) => index);
  const shuffled = shuffleWith(items, createRng(9));
  assert.deepEqual([...shuffled].sort((x, y) => x - y), items);
  assert.deepEqual(items, Array.from({ length: 30 }, (_, index) => index));
  assert.deepEqual(shuffleWith(items, createRng(9)), shuffled);
  assert.deepEqual(shuffleWith([], createRng(1)), []);
});
