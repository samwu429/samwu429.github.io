import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CANDIDATES,
  appendToken,
  applyTemperature,
  clampTemperature,
  createSeededRandom,
  formatPercent,
  joinParts,
  normalizeCandidates,
  sampleCounts,
  sampleIndex,
  temperatureRegime,
} from '../../../engine/widgets/language-models/temperature-sampler/temperature-logic.js';

const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const sum = (values) => values.reduce((total, value) => total + value, 0);

test('normalizeCandidates rescales, sorts and cleans', () => {
  const { items, rawSum, rescaled } = normalizeCandidates([
    { token: 'floor', prob: 0.2 },
    { token: 'mat', prob: 0.5 },
    { token: '', prob: 0.1 },
    { token: 'bed', prob: -1 },
    { token: 'sofa', prob: 0.1 },
  ]);
  assert.deepEqual(items.map((item) => item.token), ['mat', 'floor', 'sofa']);
  close(rawSum, 0.8);
  assert.equal(rescaled, true);
  close(sum(items.map((item) => item.prob)), 1);
  close(items[0].prob, 0.625);
});

test('normalizeCandidates falls back to the lecture example and to a uniform split', () => {
  const fallback = normalizeCandidates(undefined);
  assert.equal(fallback.usedDefault, true);
  assert.deepEqual(fallback.items.map((item) => item.token), DEFAULT_CANDIDATES.map((item) => item.token));
  const zeros = normalizeCandidates([{ token: 'a', prob: 0 }, { token: 'b', prob: 0 }]);
  assert.deepEqual(zeros.items.map((item) => item.prob), [0.5, 0.5]);
});

test('temperature 1 keeps the distribution unchanged', () => {
  const probs = [0.5, 0.3, 0.2];
  applyTemperature(probs, 1).forEach((value, index) => close(value, probs[index]));
});

test('low temperature sharpens, high temperature flattens', () => {
  const probs = normalizeCandidates(DEFAULT_CANDIDATES).items.map((item) => item.prob);
  const cold = applyTemperature(probs, 0.5);
  const hot = applyTemperature(probs, 2);
  assert.ok(cold[0] > probs[0]);
  assert.ok(cold.at(-1) < probs.at(-1));
  assert.ok(hot[0] < probs[0]);
  assert.ok(hot.at(-1) > probs.at(-1));
  close(sum(cold), 1);
  close(sum(hot), 1);
  assert.ok(applyTemperature(probs, 0.1)[0] > 0.85);
  // p^(1/T) with T = 0.5 is p squared, rescaled. T = 0.5 时就是 p 的平方再归一化。
  close(applyTemperature([0.6, 0.4], 0.5)[0], 0.36 / 0.52);
});

test('zero probabilities stay zero and the temperature is clamped', () => {
  const result = applyTemperature([0.7, 0, 0.3], 2);
  assert.equal(result[1], 0);
  close(sum(result), 1);
  assert.equal(clampTemperature(0), 0.1);
  assert.equal(clampTemperature(9), 2);
  assert.equal(clampTemperature('abc'), 1);
  assert.deepEqual(applyTemperature([0, 0], 1), [0.5, 0.5]);
});

test('sampleIndex walks the cumulative distribution', () => {
  const probs = [0.5, 0, 0.3, 0.2];
  assert.equal(sampleIndex(probs, () => 0), 0);
  assert.equal(sampleIndex(probs, () => 0.49), 0);
  assert.equal(sampleIndex(probs, () => 0.5), 2);
  assert.equal(sampleIndex(probs, () => 0.79), 2);
  assert.equal(sampleIndex(probs, () => 0.8), 3);
  assert.equal(sampleIndex(probs, () => 0.999999), 3);
  assert.equal(sampleIndex([0, 0], () => 0.5), -1);
});

test('seeded sampling is reproducible and roughly follows the probabilities', () => {
  const probs = [0.6, 0.3, 0.1];
  const first = sampleCounts(probs, 1000, createSeededRandom(42));
  const second = sampleCounts(probs, 1000, createSeededRandom(42));
  assert.deepEqual(first, second);
  assert.equal(sum(first), 1000);
  assert.ok(first[0] > 520 && first[0] < 680, `top count ${first[0]}`);
  assert.ok(first[2] > 50 && first[2] < 160, `bottom count ${first[2]}`);
  const random = createSeededRandom(7);
  for (let index = 0; index < 100; index += 1) {
    const value = random();
    assert.ok(value >= 0 && value < 1);
  }
});

test('appending a token to the context', () => {
  assert.equal(appendToken("For lunch, let's order", 'pizza'), "For lunch, let's order pizza");
  assert.equal(appendToken('The cat sat on the mat', '.'), 'The cat sat on the mat.');
  assert.equal(appendToken('Hello  ', ' world'), 'Hello world');
  assert.deepEqual(joinParts('', 'mat'), { base: '', separator: '', token: 'mat' });
});

test('percent formatting and temperature zones', () => {
  assert.equal(formatPercent(0.2512), '25.1%');
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(0.0000001), '<0.1%');
  assert.equal(temperatureRegime(0.2, 0.9), 'greedy');
  assert.equal(temperatureRegime(0.2, 0.56), 'low');
  assert.equal(temperatureRegime(0.6), 'low');
  assert.equal(temperatureRegime(1.2, 0.95), 'high');
  assert.equal(temperatureRegime(1), 'neutral');
  assert.equal(temperatureRegime(1.6), 'high');
});
