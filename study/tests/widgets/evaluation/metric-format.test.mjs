import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDecimal,
  formatPercent,
  formatPoints,
  formatRatio,
  formulaLines,
  relationSign,
  roundTo,
} from '../../../engine/widgets/evaluation/shared/metric-format.js';
import { accuracy, precision } from '../../../engine/widgets/evaluation/shared/metrics.js';

const MODEL_1 = { tp: 28, fp: 12, fn: 2, tn: 18 };
const MODEL_2 = { tp: 18, fp: 2, fn: 12, tn: 28 };

test('roundTo never returns negative zero', () => {
  assert.equal(roundTo(76.666, 1), 76.7);
  assert.ok(Object.is(roundTo(-0.04, 1), 0));
});

test('formatPercent trims whole numbers like the slides, or keeps one decimal like the lab cards', () => {
  assert.equal(formatPercent(0.7), '70%');
  assert.equal(formatPercent(46 / 60), '76.7%');
  assert.equal(formatPercent(28 / 30), '93.3%');
  assert.equal(formatPercent(0.8, { trim: false }), '80.0%');
  assert.equal(formatPercent(240 / 380, { trim: false }), '63.2%');
  assert.equal(formatPercent(1), '100%');
  assert.equal(formatPercent(null), '—');
  assert.equal(formatPercent(Number.NaN), '—');
});

test('relationSign uses "=" for exact and "≈" for rounded percentages', () => {
  assert.equal(relationSign(0.7), '=');
  assert.equal(relationSign(0.6), '=');
  assert.equal(relationSign(46 / 60), '≈');
  assert.equal(relationSign(28 / 30), '≈');
  assert.equal(relationSign(0.125), '=');
  assert.equal(relationSign(0.1234), '≈');
  assert.equal(relationSign(0.1234, { digits: 2 }), '=');
  assert.equal(relationSign(null), '=');
});

test('formatDecimal keeps two or three places', () => {
  assert.equal(formatDecimal(0.7), '0.70');
  assert.equal(formatDecimal(28 / 30), '0.933');
  assert.equal(formatDecimal(0.125), '0.125');
  assert.equal(formatDecimal(1), '1.00');
  assert.equal(formatDecimal(0), '0.00');
  assert.equal(formatDecimal(null), '—');
});

test('formatPoints shows signed percentage-point gaps', () => {
  assert.equal(formatPoints(12), '+12.0 pp');
  assert.equal(formatPoints(16.842), '+16.8 pp');
  assert.equal(formatPoints(-40), '−40.0 pp');
  assert.equal(formatPoints(0), '+0.0 pp');
  assert.equal(formatPoints(-0.04), '+0.0 pp');
  assert.equal(formatPoints(12, { signed: false }), '12.0 pp');
  assert.equal(formatPoints(null), '—');
});

test('formatRatio prints the fraction, the relation and the percentage', () => {
  assert.equal(formatRatio(precision(MODEL_1)), '28 / 40 = 70%');
  assert.equal(formatRatio(accuracy(MODEL_1)), '46 / 60 ≈ 76.7%');
  assert.equal(formatRatio(precision({ tp: 0, fp: 0, fn: 1, tn: 1 })), '0 / 0');
});

test('formulaLines substitutes the slide example exactly', () => {
  const lines = formulaLines(MODEL_1);
  assert.equal(lines.accuracy, 'Accuracy = (28 + 18) / (28 + 18 + 12 + 2) = 46 / 60 ≈ 76.7%');
  assert.equal(lines.precision, 'Precision = 28 / (28 + 12) = 28 / 40 = 70%');
  assert.equal(lines.recall, 'Recall = 28 / (28 + 2) = 28 / 30 ≈ 93.3%');
  assert.equal(lines.f1, 'F1 = 2 × 0.70 × 0.933 / (0.70 + 0.933) = 80%');

  const second = formulaLines(MODEL_2);
  assert.equal(second.precision, 'Precision = 18 / (18 + 2) = 18 / 20 = 90%');
  assert.equal(second.recall, 'Recall = 18 / (18 + 12) = 18 / 30 = 60%');
  assert.equal(second.f1, 'F1 = 2 × 0.90 × 0.60 / (0.90 + 0.60) = 72%');
});

test('formulaLines handles division by zero', () => {
  const empty = formulaLines({ tp: 0, fp: 0, fn: 0, tn: 0 });
  assert.equal(empty.accuracy, 'Accuracy = (0 + 0) / (0 + 0 + 0 + 0) = 0 / 0');
  assert.equal(empty.precision, 'Precision = 0 / (0 + 0) = 0 / 0');
  assert.equal(empty.f1, null);

  const zeroSum = formulaLines({ tp: 0, fp: 5, fn: 5, tn: 10 });
  assert.equal(zeroSum.f1, 'F1 = 2 × 0.00 × 0.00 / (0.00 + 0.00) = 0 / 0');
});

test('formulaLines can keep one decimal for every percentage', () => {
  const lines = formulaLines(MODEL_1, { trim: false });
  assert.equal(lines.precision, 'Precision = 28 / (28 + 12) = 28 / 40 = 70.0%');
});
