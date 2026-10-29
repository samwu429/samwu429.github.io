import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addSample,
  axisTicks,
  createHistogram,
  createRandom,
  distributionMean,
  distributionModes,
  expectedMax,
  histogramMean,
  histogramPeak,
  maxDistribution,
  normalizeDiceConfig,
  pipPositions,
  probabilityAbove,
  resetHistogram,
  rollDice,
  rollDie,
  runMaxExperiment,
  shareAbove,
  sumDistribution,
  sumWays,
} from '../../../engine/widgets/evaluation/dice-max/dice-logic.js';

const sum = (values) => values.reduce((total, value) => total + value, 0);

test('normalizeDiceConfig defaults to the slide activity and clamps values', () => {
  assert.deepEqual(normalizeDiceConfig(undefined), { dice: 8, sides: 6, rolls: 10 });
  assert.deepEqual(normalizeDiceConfig({}), { dice: 8, sides: 6, rolls: 10 });
  assert.deepEqual(normalizeDiceConfig({ dice: 100, sides: 1, rolls: '5' }), { dice: 12, sides: 2, rolls: 5 });
  assert.deepEqual(normalizeDiceConfig({ dice: 'x', sides: 7.6, rolls: 0 }), { dice: 8, sides: 8, rolls: 1 });
});

test('blank, null or non-numeric config fields fall back to the defaults, not the minimum', () => {
  assert.deepEqual(normalizeDiceConfig({ dice: null, sides: '', rolls: null }), { dice: 8, sides: 6, rolls: 10 });
  assert.deepEqual(normalizeDiceConfig({ dice: '  ', sides: false, rolls: [] }), { dice: 8, sides: 6, rolls: 10 });
  assert.deepEqual(normalizeDiceConfig({ dice: ' 4 ', sides: true, rolls: [3] }), { dice: 4, sides: 6, rolls: 10 });
});

test('8d6: 135954 of the 6^8 outcomes total 28, the most likely value', () => {
  const ways = sumWays(8, 6);
  assert.equal(ways.length, 41);
  assert.equal(sum(ways), 6 ** 8);
  assert.equal(ways[28 - 8], 135954);
  assert.deepEqual(ways, [...ways].reverse());

  const distribution = sumDistribution(8, 6);
  assert.equal(distribution.min, 8);
  assert.equal(distribution.max, 48);
  assert.ok(Math.abs(sum(distribution.probabilities) - 1) < 1e-12);
  assert.ok(Math.abs(distributionMean(distribution) - 28) < 1e-9);
  assert.deepEqual(distributionModes(distribution), [28]);
});

test('an even number of totals has two most likely values (3d6: 10 and 11)', () => {
  assert.deepEqual(distributionModes(sumDistribution(3, 6)), [10, 11]);
});

test('expected maximum of 10 rolls is about 35.4, as on slide 26', () => {
  const distribution = sumDistribution(8, 6);
  const maxima = maxDistribution(distribution, 10);
  assert.ok(Math.abs(sum(maxima.probabilities) - 1) < 1e-12);
  const expected = expectedMax(distribution, 10);
  assert.ok(Math.abs(expected - 35.395) < 1e-3, String(expected));
  assert.ok(Math.abs(expectedMax(distribution, 1) - 28) < 1e-9);
  // Almost every round's maximum lands above 28.
  // 几乎每一轮的最大值都高于 28。
  assert.ok(probabilityAbove(maxima, 28) > 0.997);
  assert.ok(Math.abs(probabilityAbove(distribution, 28) - (1 - distribution.probabilities[20]) / 2) < 1e-12);
});

test('createRandom is reproducible and stays in [0, 1)', () => {
  const first = createRandom(42);
  const second = createRandom(42);
  const values = Array.from({ length: 1000 }, () => first());
  assert.deepEqual(values.slice(0, 5), Array.from({ length: 5 }, () => second()));
  assert.ok(values.every((value) => value >= 0 && value < 1));
  assert.notDeepEqual(values.slice(0, 5), Array.from({ length: 5 }, createRandom(7)));
});

test('rollDie and rollDice stay within the faces even with an extreme generator', () => {
  assert.equal(rollDie(6, () => 0), 1);
  assert.equal(rollDie(6, () => 0.9999999), 6);
  assert.equal(rollDie(6, () => 1), 6);
  const faces = rollDice(8, 6, createRandom(3));
  assert.equal(faces.length, 8);
  assert.ok(faces.every((face) => Number.isInteger(face) && face >= 1 && face <= 6));
});

test('runMaxExperiment keeps the first roll that reaches the maximum', () => {
  const sequence = [0, 0.99, 0.99, 0.5];
  let index = 0;
  const scripted = () => sequence[index++ % sequence.length];
  const round = runMaxExperiment({ dice: 1, sides: 6, rolls: 4 }, scripted);
  assert.deepEqual(round.sums, [1, 6, 6, 4]);
  assert.equal(round.max, 6);
  assert.equal(round.maxIndex, 1);
});

test('simulated maxima sit near 35.4 while single rolls sit near 28', () => {
  const random = createRandom(2026);
  const singles = createHistogram(8, 48);
  const maxima = createHistogram(8, 48);
  for (let round = 0; round < 3000; round += 1) {
    const result = runMaxExperiment({ dice: 8, sides: 6, rolls: 10 }, random);
    result.sums.forEach((value) => addSample(singles, value));
    addSample(maxima, result.max);
  }
  assert.equal(singles.n, 30000);
  assert.equal(maxima.n, 3000);
  assert.ok(Math.abs(histogramMean(singles) - 28) < 0.1, String(histogramMean(singles)));
  assert.ok(Math.abs(histogramMean(maxima) - 35.395) < 0.25, String(histogramMean(maxima)));
  assert.ok(shareAbove(maxima, 28) > 0.99);
});

test('histogram helpers count, average and reset', () => {
  const histogram = createHistogram(8, 48);
  assert.equal(histogramMean(histogram), null);
  assert.equal(shareAbove(histogram, 28), null);
  assert.equal(addSample(histogram, 27), true);
  assert.equal(addSample(histogram, 30), true);
  assert.equal(addSample(histogram, 30), true);
  assert.equal(addSample(histogram, 7), false);
  assert.equal(addSample(histogram, 49), false);
  assert.equal(addSample(histogram, 28.5), false);
  assert.equal(histogram.n, 3);
  assert.equal(histogramMean(histogram), 29);
  assert.equal(histogramPeak(histogram), 2);
  assert.equal(shareAbove(histogram, 28), 2 / 3);
  resetHistogram(histogram);
  assert.equal(histogram.n, 0);
  assert.equal(histogramPeak(histogram), 0);
});

test('axisTicks picks a readable step', () => {
  assert.deepEqual(axisTicks(8, 48), [8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48]);
  assert.deepEqual(axisTicks(3, 18), [3, 5, 7, 9, 11, 13, 15, 17]);
  assert.deepEqual(axisTicks(1, 6), [1, 2, 3, 4, 5, 6]);
  assert.ok(axisTicks(12, 240).length <= 11);
});

test('pipPositions draws 1 to 6 pips and leaves larger faces to numbers', () => {
  for (let face = 1; face <= 6; face += 1) {
    const pips = pipPositions(face);
    assert.equal(pips.length, face);
    assert.ok(pips.every(([x, y]) => x > 0 && x < 100 && y > 0 && y < 100));
  }
  assert.equal(pipPositions(7), null);
  assert.equal(pipPositions(0), null);
});
