import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  accuracy,
  actualPositiveRate,
  countsEqual,
  f1Score,
  falsePositiveRate,
  MAX_COUNT,
  METRIC_CELLS,
  normalizeCounts,
  precision,
  recall,
  sanitizeCount,
  selectionRate,
  summarize,
  totalOf,
  truePositiveRate,
} from '../../../engine/widgets/evaluation/shared/metrics.js';

// lec06 p.29-31: same accuracy, different precision and recall.
// lec06 第 29-31 页：准确率相同，精确率和召回率不同。
const MODEL_1 = { tp: 28, fp: 12, fn: 2, tn: 18 };
const MODEL_2 = { tp: 18, fp: 2, fn: 12, tn: 28 };
const ZERO = { tp: 0, fp: 0, fn: 0, tn: 0 };

const close = (actual, expected, epsilon = 1e-12) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('sanitizeCount keeps whole non-negative counts and rejects junk', () => {
  assert.equal(sanitizeCount(12), 12);
  assert.equal(sanitizeCount('12'), 12);
  assert.equal(sanitizeCount(' 7 '), 7);
  assert.equal(sanitizeCount(4.9), 4);
  assert.equal(sanitizeCount(-3), 0);
  assert.equal(sanitizeCount(''), 0);
  assert.equal(sanitizeCount('abc'), 0);
  assert.equal(sanitizeCount(undefined), 0);
  assert.equal(sanitizeCount(null), 0);
  assert.equal(sanitizeCount(Number.NaN), 0);
  assert.equal(sanitizeCount(Infinity), 0);
  assert.equal(sanitizeCount(1e9), MAX_COUNT);
});

test('normalizeCounts fills missing cells and survives non-objects', () => {
  assert.deepEqual(normalizeCounts(null), ZERO);
  assert.deepEqual(normalizeCounts('x'), ZERO);
  assert.deepEqual(normalizeCounts({ tp: '5', fp: -1, fn: 2.5 }), { tp: 5, fp: 0, fn: 2, tn: 0 });
  assert.deepEqual(normalizeCounts({ ...MODEL_1, name: { en: 'ignored' } }), MODEL_1);
});

test('countsEqual compares the four cells only', () => {
  assert.equal(countsEqual(MODEL_1, { ...MODEL_1 }), true);
  assert.equal(countsEqual(MODEL_1, MODEL_2), false);
  assert.equal(countsEqual(MODEL_1, null), false);
});

test('slide Model 1: accuracy 46/60, precision 28/40 = 70%, recall 28/30, F1 = 80%', () => {
  assert.equal(totalOf(MODEL_1), 60);
  assert.deepEqual(accuracy(MODEL_1), { numerator: 46, denominator: 60, value: 46 / 60 });
  assert.deepEqual(precision(MODEL_1), { numerator: 28, denominator: 40, value: 0.7 });
  assert.deepEqual(recall(MODEL_1), { numerator: 28, denominator: 30, value: 28 / 30 });
  const f1 = f1Score(MODEL_1);
  assert.equal(f1.reason, null);
  close(f1.value, 0.8);
});

test('slide Model 2: precision 18/20 = 90%, recall 18/30 = 60%, F1 = 72%', () => {
  assert.equal(accuracy(MODEL_2).value, 46 / 60);
  assert.equal(precision(MODEL_2).value, 0.9);
  assert.equal(recall(MODEL_2).value, 0.6);
  close(f1Score(MODEL_2).value, 0.72);
});

test('rates used by the fairness criteria', () => {
  assert.deepEqual(falsePositiveRate(MODEL_1), { numerator: 12, denominator: 30, value: 0.4 });
  assert.deepEqual(selectionRate(MODEL_1), { numerator: 40, denominator: 60, value: 40 / 60 });
  assert.deepEqual(actualPositiveRate(MODEL_1), { numerator: 30, denominator: 60, value: 0.5 });
  assert.equal(truePositiveRate, recall);
});

test('division by zero yields null instead of NaN', () => {
  for (const compute of [accuracy, precision, recall, falsePositiveRate, selectionRate, actualPositiveRate]) {
    assert.equal(compute(ZERO).value, null);
  }
  assert.equal(precision({ tp: 0, fp: 0, fn: 3, tn: 4 }).value, null);
  assert.equal(recall({ tp: 0, fp: 3, fn: 0, tn: 4 }).value, null);
  assert.equal(falsePositiveRate({ tp: 3, fp: 0, fn: 1, tn: 0 }).value, null);
});

test('F1 explains why it is undefined', () => {
  assert.equal(f1Score({ tp: 0, fp: 0, fn: 5, tn: 5 }).reason, 'precision');
  assert.equal(f1Score({ tp: 0, fp: 5, fn: 0, tn: 5 }).reason, 'recall');
  const zeroSum = f1Score({ tp: 0, fp: 5, fn: 5, tn: 10 });
  assert.equal(zeroSum.reason, 'zero-sum');
  assert.equal(zeroSum.value, null);
  assert.equal(zeroSum.precision.value, 0);
  assert.equal(zeroSum.recall.value, 0);
});

test('summarize bundles every metric', () => {
  const summary = summarize(MODEL_1);
  assert.equal(summary.total, 60);
  assert.equal(summary.precision.value, 0.7);
  close(summary.f1.value, 0.8);
  assert.equal(summary.falsePositiveRate.value, 0.4);
});

test('metric cells match the slide formulas', () => {
  assert.deepEqual(METRIC_CELLS.precision, { numerator: ['tp'], denominator: ['tp', 'fp'] });
  assert.deepEqual(METRIC_CELLS.recall, { numerator: ['tp'], denominator: ['tp', 'fn'] });
  assert.deepEqual(METRIC_CELLS.accuracy.numerator, ['tp', 'tn']);
  assert.ok(!METRIC_CELLS.f1.denominator.includes('tn'));
});
