/**
 * Config handling and comparison logic of the confusion-matrix widget. DOM-free.
 * 混淆矩阵组件的配置处理与对比逻辑，不依赖 DOM。
 */
import { toBi } from '../shared/config-utils.js';
import { accuracy, countsEqual, f1Score, normalizeCounts, precision, recall } from '../shared/metrics.js';

// lec06 p.29 Model 1, used when a config brings no presets.
// lec06 第 29 页的 Model 1，配置里没有预设时使用。
export const SLIDE_EXAMPLE = Object.freeze({ tp: 28, fp: 12, fn: 2, tn: 18 });
export const MAX_PRESETS = 8;

/**
 * Reads config.presets into [{ name: {zh, en}, counts }]; invalid entries are skipped.
 * 将 config.presets 读取为 [{ name, counts }]，无效项会被跳过。
 */
export function normalizePresets(config) {
  const list = Array.isArray(config?.presets) ? config.presets : [];
  return list
    .filter((preset) => preset && typeof preset === 'object' && !Array.isArray(preset))
    .slice(0, MAX_PRESETS)
    .map((preset, index) => ({
      name: toBi(preset.name, { zh: `预设 ${index + 1}`, en: `Preset ${index + 1}` }),
      counts: normalizeCounts(preset),
    }));
}

export function initialCounts(presets) {
  return { ...(presets.length ? presets[0].counts : SLIDE_EXAMPLE) };
}

/** Index of the preset whose counts equal `counts`, or -1. 与当前计数完全相同的预设下标，没有则为 -1。 */
export function matchingPreset(presets, counts) {
  return presets.findIndex((preset) => countsEqual(preset.counts, counts));
}

// Exact comparison of two fractions by cross-multiplication (all parts are integers).
// 用交叉相乘精确比较两个分数（分子分母都是整数）。
function sameFraction(a, b) {
  if (a.value === null || b.value === null) return false;
  return a.numerator * b.denominator === b.numerator * a.denominator;
}

function better(a, b) {
  if (a === null || b === null) return null;
  if (Math.abs(a - b) < 1e-12) return 'tie';
  return a > b ? 'a' : 'b';
}

/**
 * Compares two count sets metric by metric for the side-by-side view.
 * 逐项比较两组计数，供并排对比使用。
 *
 * Returns { rows: [{ id, a, b, better }], sameAccuracy, moreFalsePositives, moreFalseNegatives }.
 * `better` names the side with the higher value ('a' | 'b' | 'tie'), or null if either is undefined.
 * `moreFalsePositives` / `moreFalseNegatives` name the side with more FP / FN ('a' | 'b' | null).
 * better 表示数值更高的一方；任一方无法计算时为 null。另外两个字段指出 FP / FN 更多的一方。
 */
export function compareCounts(a, b) {
  const metrics = [
    ['accuracy', accuracy],
    ['precision', precision],
    ['recall', recall],
  ];
  const rows = metrics.map(([id, compute]) => {
    const left = compute(a);
    const right = compute(b);
    return { id, a: left, b: right, better: better(left.value, right.value) };
  });
  const f1Left = f1Score(a);
  const f1Right = f1Score(b);
  rows.push({ id: 'f1', a: f1Left, b: f1Right, better: better(f1Left.value, f1Right.value) });

  const side = (left, right) => {
    if (left === right) return null;
    return left > right ? 'a' : 'b';
  };

  return {
    rows,
    sameAccuracy: sameFraction(rows[0].a, rows[0].b),
    moreFalsePositives: side(a.fp, b.fp),
    moreFalseNegatives: side(a.fn, b.fn),
  };
}
