import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareCounts,
  initialCounts,
  matchingPreset,
  MAX_PRESETS,
  normalizePresets,
  SLIDE_EXAMPLE,
} from '../../../engine/widgets/evaluation/confusion-matrix/confusion-logic.js';
import { toBi } from '../../../engine/widgets/evaluation/shared/config-utils.js';

const MODEL_1 = { tp: 28, fp: 12, fn: 2, tn: 18 };
const MODEL_2 = { tp: 18, fp: 2, fn: 12, tn: 28 };

const CONFIG = {
  presets: [
    { name: { zh: 'Lecture 6 的 Model 1', en: 'Lecture 6 Model 1' }, ...MODEL_1 },
    { name: { zh: 'Lecture 6 的 Model 2', en: 'Lecture 6 Model 2' }, ...MODEL_2 },
  ],
};

test('normalizePresets keeps names and cleans counts', () => {
  const presets = normalizePresets(CONFIG);
  assert.equal(presets.length, 2);
  assert.deepEqual(presets[0].name, { zh: 'Lecture 6 的 Model 1', en: 'Lecture 6 Model 1' });
  assert.deepEqual(presets[1].counts, MODEL_2);

  const messy = normalizePresets({ presets: [null, 5, [1, 2], { tp: '3', fp: -2 }] });
  assert.equal(messy.length, 1);
  assert.deepEqual(messy[0].counts, { tp: 3, fp: 0, fn: 0, tn: 0 });
  assert.deepEqual(messy[0].name, { zh: '预设 1', en: 'Preset 1' });
});

test('normalizePresets tolerates missing or malformed configs', () => {
  assert.deepEqual(normalizePresets(undefined), []);
  assert.deepEqual(normalizePresets(null), []);
  assert.deepEqual(normalizePresets({ presets: 'none' }), []);
  const many = normalizePresets({ presets: Array.from({ length: 20 }, () => ({ ...MODEL_1 })) });
  assert.equal(many.length, MAX_PRESETS);
});

test('toBi accepts plain strings and falls back when empty', () => {
  assert.deepEqual(toBi('Model A'), { zh: '', en: 'Model A' });
  assert.deepEqual(toBi('模型 A'), { zh: '模型 A', en: '' });
  assert.deepEqual(toBi({ zh: '  ', en: '' }, { zh: 'x', en: 'y' }), { zh: 'x', en: 'y' });
  assert.deepEqual(toBi(42, { zh: 'x', en: 'y' }), { zh: 'x', en: 'y' });
});

test('initialCounts starts from the first preset, or the slide example', () => {
  const presets = normalizePresets(CONFIG);
  assert.deepEqual(initialCounts(presets), MODEL_1);
  const fallback = initialCounts([]);
  assert.deepEqual(fallback, SLIDE_EXAMPLE);
  fallback.tp = 99;
  assert.equal(SLIDE_EXAMPLE.tp, 28);
});

test('matchingPreset finds the preset currently shown', () => {
  const presets = normalizePresets(CONFIG);
  assert.equal(matchingPreset(presets, { ...MODEL_2 }), 1);
  assert.equal(matchingPreset(presets, { tp: 1, fp: 1, fn: 1, tn: 1 }), -1);
});

test('compareCounts on the slide models: same accuracy, opposite strengths', () => {
  const result = compareCounts(MODEL_1, MODEL_2);
  assert.equal(result.sameAccuracy, true);
  const better = Object.fromEntries(result.rows.map((row) => [row.id, row.better]));
  assert.deepEqual(better, { accuracy: 'tie', precision: 'b', recall: 'a', f1: 'a' });
  assert.equal(result.moreFalsePositives, 'a');
  assert.equal(result.moreFalseNegatives, 'b');
});

test('compareCounts compares fractions exactly and handles undefined metrics', () => {
  assert.equal(compareCounts({ tp: 1, fp: 1, fn: 0, tn: 0 }, { tp: 2, fp: 2, fn: 0, tn: 0 }).sameAccuracy, true);
  assert.equal(compareCounts({ tp: 1, fp: 0, fn: 0, tn: 1 }, { tp: 2, fp: 1, fn: 1, tn: 2 }).sameAccuracy, false);
  const withZero = compareCounts({ tp: 0, fp: 0, fn: 0, tn: 0 }, MODEL_1);
  assert.equal(withZero.sameAccuracy, false);
  assert.ok(withZero.rows.every((row) => row.better === null));
  assert.equal(compareCounts(MODEL_1, MODEL_1).moreFalsePositives, null);
});
