import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  combineCounts,
  compareRates,
  DEFAULT_TOLERANCE,
  evaluateFairness,
  groupMetrics,
  MAX_GROUPS,
  normalizeGroups,
  normalizeTolerance,
  tradeoffCase,
} from '../../../engine/widgets/evaluation/fairness-groups/fairness-logic.js';

// Lab 5 model cards: Model 1 satisfies equalized odds only; Model 5 satisfies demographic parity and equalized odds.
// Lab 5 模型卡片：Model 1 只满足均等几率；Model 5 满足人口统计均等和均等几率。
const MODEL_1 = [
  { tp: 400, fp: 100, fn: 100, tn: 400 },
  { tp: 240, fp: 140, fn: 60, tn: 560 },
];
const MODEL_5 = [
  { tp: 200, fp: 200, fn: 300, tn: 300 },
  { tp: 120, fp: 280, fn: 180, tn: 420 },
];

const statusOf = (result) => Object.fromEntries(result.criteria.map((criterion) => [criterion.id, criterion.status]));

test('normalizeGroups names unnamed groups by letter and skips junk', () => {
  const groups = normalizeGroups({ groups: [{ tp: 1 }, null, { name: 'Women', tp: '2', fn: 3 }] });
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].name, { zh: 'A 组', en: 'Group A' });
  assert.deepEqual(groups[1].name, { zh: '', en: 'Women' });
  assert.deepEqual(groups[1].counts, { tp: 2, fp: 0, fn: 3, tn: 0 });
  assert.deepEqual(normalizeGroups(undefined), []);
  assert.deepEqual(normalizeGroups({ groups: {} }), []);
  assert.equal(normalizeGroups({ groups: Array.from({ length: 10 }, () => ({})) }).length, MAX_GROUPS);
});

test('normalizeTolerance clamps to the slider range and step', () => {
  assert.equal(normalizeTolerance(undefined), DEFAULT_TOLERANCE);
  assert.equal(normalizeTolerance(null), DEFAULT_TOLERANCE, 'a null tolerance is not 0 pp');
  assert.equal(normalizeTolerance(''), DEFAULT_TOLERANCE);
  assert.equal(normalizeTolerance('abc'), DEFAULT_TOLERANCE);
  assert.equal(normalizeTolerance('3'), 3);
  assert.equal(normalizeTolerance(7.3), 7.5);
  assert.equal(normalizeTolerance(-2), 0);
  assert.equal(normalizeTolerance(50), 20);
});

test('groupMetrics computes the four compared rates', () => {
  const metrics = groupMetrics(MODEL_1[1]);
  assert.equal(metrics.total, 1000);
  assert.equal(metrics.selectionRate.value, 0.38);
  assert.equal(metrics.precision.value, 240 / 380);
  assert.equal(metrics.truePositiveRate.value, 0.8);
  assert.equal(metrics.falsePositiveRate.value, 0.2);
  assert.equal(metrics.actualPositiveRate.value, 0.3);
});

test('Lab 5 Model 1: only equalized odds holds (gaps +12.0, +16.8, 0 and 0 pp)', () => {
  const result = evaluateFairness(MODEL_1, 5);
  assert.deepEqual(statusOf(result), {
    'demographic-parity': 'fail',
    'predictive-parity': 'fail',
    'equalized-odds': 'pass',
  });
  const gaps = result.criteria.flatMap((criterion) => criterion.parts.map((part) => part.gap));
  assert.deepEqual(gaps, [12, 16.8, 0, 0]);
  assert.equal(result.overallAccuracy.value, 0.8);
});

test('Lab 5 Model 5: demographic parity and equalized odds hold, predictive parity does not', () => {
  const result = evaluateFairness(MODEL_5, 5);
  assert.deepEqual(statusOf(result), {
    'demographic-parity': 'pass',
    'predictive-parity': 'fail',
    'equalized-odds': 'pass',
  });
  assert.equal(result.criteria[1].parts[0].gap, 20);
  assert.equal(result.overallAccuracy.value, 0.52);
});

test('gaps are taken between the rates as shown, like the Lab 5 model cards (Model 2 +33.7, Model 8 +23.7)', () => {
  const model2 = evaluateFairness([{ tp: 360, fp: 40, fn: 140, tn: 460 }, { tp: 225, fp: 175, fn: 75, tn: 525 }], 5);
  const precision2 = model2.criteria[1].parts[0];
  assert.deepEqual(precision2.points, [90, 56.3]);
  assert.equal(precision2.gap, 33.7);
  const model8 = evaluateFairness([{ tp: 320, fp: 80, fn: 180, tn: 420 }, { tp: 180, fp: 140, fn: 120, tn: 560 }], 5);
  assert.equal(model8.criteria[1].parts[0].gap, 23.7);
});

test('all eight Lab 5 model cards: hiring-rate, precision, TPR and FPR gaps', () => {
  const cards = [
    [[400, 100, 100, 400], [240, 140, 60, 560], [12, 16.8, 0, 0]],
    [[360, 40, 140, 460], [225, 175, 75, 525], [0, 33.7, -3, -17]],
    [[300, 100, 200, 400], [210, 70, 90, 630], [12, 0, -10, 10]],
    [[480, 20, 20, 480], [180, 28, 120, 672], [29.2, 9.5, 36, 0]],
    [[200, 200, 300, 300], [120, 280, 180, 420], [0, 20, 0, 0]],
    [[400, 50, 100, 450], [240, 350, 60, 350], [-14, 48.2, 0, -40]],
    [[270, 30, 230, 470], [63, 7, 237, 693], [23, 0, 33, 5]],
    [[320, 80, 180, 420], [180, 140, 120, 560], [8, 23.7, 4, -4]],
  ];
  const counts = ([tp, fp, fn, tn]) => ({ tp, fp, fn, tn });
  cards.forEach(([a, b, expected], index) => {
    const result = evaluateFairness([counts(a), counts(b)], 5);
    const gaps = result.criteria.flatMap((criterion) => criterion.parts.map((part) => part.gap));
    assert.deepEqual(gaps, expected, `Model ${index + 1}`);
  });
});

test('a large enough tolerance makes every group criterion hold', () => {
  assert.deepEqual(Object.values(statusOf(evaluateFairness(MODEL_1, 20))), ['pass', 'pass', 'pass']);
});

test('compareRates: the verdict agrees with the gap shown to one decimal', () => {
  const edge = compareRates([0.4, 0.35], 5);
  assert.equal(edge.spread, 5);
  assert.equal(edge.within, true);
  assert.equal(compareRates([0.4, 0.3499], 5).within, true);
  assert.equal(compareRates([0.4, 0.3494], 5).within, false);
  assert.equal(compareRates([0.3, 0.5], 5).gap, -20);
  assert.ok(Object.is(compareRates([0.5, 0.5004], 5).gap, 0));
});

test('compareRates with three groups reports the spread between highest and lowest', () => {
  const result = compareRates([0.5, 0.62, 0.45], 10);
  assert.equal(result.gap, null);
  assert.equal(result.spread, 17);
  assert.equal(result.highIndex, 1);
  assert.equal(result.lowIndex, 2);
  assert.equal(result.within, false);
});

test('an undefined rate makes the criterion undecidable', () => {
  const result = evaluateFairness([{ tp: 0, fp: 0, fn: 5, tn: 5 }, { tp: 5, fp: 5, fn: 5, tn: 5 }], 5);
  const status = statusOf(result);
  assert.equal(status['predictive-parity'], 'unknown');
  assert.equal(result.criteria[1].parts[0].defined, false);
  assert.equal(status['demographic-parity'], 'fail');
});

test('a single group cannot be compared', () => {
  const result = evaluateFairness([MODEL_1[0]], 5);
  assert.deepEqual(Object.values(statusOf(result)), ['insufficient', 'insufficient', 'insufficient']);
});

test('tradeoffCase picks the explanation that is true for the numbers, whatever the tolerance', () => {
  assert.equal(tradeoffCase(evaluateFairness(MODEL_1, 5)), 'conflict');
  assert.equal(tradeoffCase(evaluateFairness(MODEL_1, 20)), 'conflict');
  // Model 5 hires at random inside each group: TPR equals FPR.
  // Model 5 在每组内随机录用：TPR 等于 FPR。
  assert.equal(tradeoffCase(evaluateFairness(MODEL_5, 5)), 'random');
  const sameBase = [{ tp: 40, fp: 10, fn: 10, tn: 40 }, { tp: 20, fp: 5, fn: 5, tn: 20 }];
  assert.equal(tradeoffCase(evaluateFairness(sameBase, 0)), 'same-base');
  assert.equal(tradeoffCase(evaluateFairness([MODEL_1[0]], 5)), 'unknown');
  assert.equal(tradeoffCase(evaluateFairness([MODEL_1[0], { tp: 0, fp: 0, fn: 0, tn: 0 }], 5)), 'unknown');
});

test('combineCounts adds the groups cell by cell', () => {
  assert.deepEqual(combineCounts(MODEL_1), { tp: 640, fp: 240, fn: 160, tn: 960 });
  assert.deepEqual(combineCounts([]), { tp: 0, fp: 0, fn: 0, tn: 0 });
});
