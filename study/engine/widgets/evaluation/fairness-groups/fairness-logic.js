/**
 * Group fairness criteria from lec06 (p.40-42), computed from one confusion matrix per group.
 * lec06（第 40-42 页）的群体公平标准，由每个群体各自的四格表计算。
 *
 *   demographic parity  same selection rate (TP + FP) / N           人口统计均等：选中率相同
 *   predictive parity   same precision TP / (TP + FP)               预测均等：精确率相同
 *   equalized odds      same TPR TP / (TP + FN) AND FPR FP / (FP + TN)  均等几率：TPR 与 FPR 都相同
 *
 * Real data never matches exactly, so a criterion counts as satisfied when the largest gap
 * between groups is within a tolerance in percentage points. DOM-free.
 * 真实数据几乎不会完全相等，因此当组间最大差距不超过容差（百分点）时视为满足；不依赖 DOM。
 */
import { clampNumber, letterFor, toBi } from '../shared/config-utils.js';
import { roundTo } from '../shared/metric-format.js';
import {
  accuracy,
  actualPositiveRate,
  CELL_KEYS,
  falsePositiveRate,
  normalizeCounts,
  precision,
  selectionRate,
  totalOf,
  truePositiveRate,
} from '../shared/metrics.js';

export const DEFAULT_TOLERANCE = 5;
export const TOLERANCE_MIN = 0;
export const TOLERANCE_MAX = 20;
export const TOLERANCE_STEP = 0.5;
export const MAX_GROUPS = 6;

export const CRITERIA = Object.freeze([
  Object.freeze({ id: 'demographic-parity', metrics: Object.freeze(['selectionRate']) }),
  Object.freeze({ id: 'predictive-parity', metrics: Object.freeze(['precision']) }),
  Object.freeze({ id: 'equalized-odds', metrics: Object.freeze(['truePositiveRate', 'falsePositiveRate']) }),
]);

/**
 * Reads config.groups into [{ name: {zh, en}, counts }]; unnamed groups become "A 组 Group A".
 * 将 config.groups 读取为 [{ name, counts }]；未命名的群体记为“A 组 Group A”。
 */
export function normalizeGroups(config) {
  const list = Array.isArray(config?.groups) ? config.groups : [];
  return list
    .filter((group) => group && typeof group === 'object' && !Array.isArray(group))
    .slice(0, MAX_GROUPS)
    .map((group, index) => {
      const letter = letterFor(index);
      return {
        name: toBi(group.name, { zh: `${letter} 组`, en: `Group ${letter}` }),
        counts: normalizeCounts(group),
      };
    });
}

/** Clamps a tolerance to [0, 20] pp on the slider's 0.5 pp grid. 将容差限制在 0-20 个百分点，并对齐到 0.5 的步长。 */
export function normalizeTolerance(value) {
  const clamped = clampNumber(value, TOLERANCE_MIN, TOLERANCE_MAX, DEFAULT_TOLERANCE);
  return Math.round(clamped / TOLERANCE_STEP) * TOLERANCE_STEP;
}

export function groupMetrics(counts) {
  return {
    total: totalOf(counts),
    selectionRate: selectionRate(counts),
    precision: precision(counts),
    truePositiveRate: truePositiveRate(counts),
    falsePositiveRate: falsePositiveRate(counts),
    accuracy: accuracy(counts),
    actualPositiveRate: actualPositiveRate(counts),
  };
}

export function combineCounts(list) {
  const combined = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const counts of list) {
    for (const key of CELL_KEYS) combined[key] += counts[key];
  }
  return combined;
}

/**
 * Compares one rate (values in [0, 1] or null) across groups, in percentage points.
 * 以百分点比较各群体的同一个比例（取值 0-1，无法计算时为 null）。
 *
 * Each rate is first rounded to 0.1 pp, exactly as it is shown and as the Lab 5 model cards print it,
 * and the gaps are taken between those shown values: Model 2 gives 90.0% − 56.3% = +33.7 pp.
 * 每个比例先四舍五入到 0.1 个百分点（与界面显示、Lab 5 模型卡片一致），再用这些显示值相减：
 * 例如 Model 2 为 90.0% − 56.3% = +33.7 pp。
 *
 * Returns { defined, points, spread, gap, highIndex, lowIndex, within }:
 *   points - the rounded rates in percentage points
 *   spread - largest minus smallest of the rounded rates
 *   gap    - first minus second group (signed) when there are exactly two groups, else null
 *   within - spread <= tolerance, or null when some group's rate is undefined
 * points 为取整后的百分点；spread 为其中最大值减最小值；
 * gap 仅在恰好两组时给出（第一组减第二组，带符号）；within 表示是否在容差内。
 */
export function compareRates(values, tolerance = DEFAULT_TOLERANCE) {
  const points = values.map((value) => (value === null || value === undefined ? null : roundTo(value * 100, 1)));
  if (points.length < 2 || points.some((point) => point === null)) {
    return { defined: false, points, spread: null, gap: null, highIndex: -1, lowIndex: -1, within: null };
  }
  let highIndex = 0;
  let lowIndex = 0;
  points.forEach((point, index) => {
    if (point > points[highIndex]) highIndex = index;
    if (point < points[lowIndex]) lowIndex = index;
  });
  const spread = roundTo(points[highIndex] - points[lowIndex], 1);
  // Round the size, then reapply the sign, so |gap| always equals spread.
  // 先对差距的大小取整再加回符号，保证 |gap| 与 spread 完全一致。
  const gap = points.length === 2 ? Math.sign(points[0] - points[1]) * spread : null;
  return {
    defined: true,
    points,
    spread,
    gap: gap === 0 ? 0 : gap,
    highIndex,
    lowIndex,
    within: spread <= tolerance + 1e-9,
  };
}

/**
 * Evaluates every group criterion.
 * 判断每一条群体公平标准。
 *
 * status: 'pass' | 'fail' | 'unknown' (some rate divides by 0) | 'insufficient' (fewer than 2 groups).
 * status：满足 / 不满足 / 无法判断（某个比例分母为 0）/ 群体不足两个。
 */
export function evaluateFairness(groupCounts, tolerance = DEFAULT_TOLERANCE) {
  const metrics = groupCounts.map(groupMetrics);
  const enoughGroups = metrics.length >= 2;
  const criteria = CRITERIA.map((criterion) => {
    const parts = criterion.metrics.map((metricId) => ({
      metric: metricId,
      ...compareRates(metrics.map((entry) => entry[metricId].value), tolerance),
    }));
    let status;
    if (!enoughGroups) status = 'insufficient';
    else if (parts.some((part) => !part.defined)) status = 'unknown';
    else status = parts.every((part) => part.within) ? 'pass' : 'fail';
    return { id: criterion.id, status, parts };
  });
  return {
    tolerance,
    metrics,
    criteria,
    overallAccuracy: accuracy(combineCounts(groupCounts)),
  };
}

// Rates closer than this count as equal when choosing the trade-off explanation; it does not
// follow the slider, so the explanation stays mathematically true at any tolerance.
// 选择“取舍”解释时，相差不超过这个值的比例视为相等；它不随滑块变化，保证解释在任何容差下都成立。
export const SAME_RATE_POINTS = 0.5;

/**
 * Which explanation of the trade-off fits the current numbers (used for the outside-the-slides note):
 *   'unknown'   - fewer than two groups or an empty group
 *   'same-base' - every group has the same share of actual positives, so the criteria can agree
 *   'random'    - shares differ, but TPR equals FPR inside every group: picks ignore who is actually
 *                 positive, which is the only way demographic parity and equalized odds agree here
 *   'conflict'  - shares differ: the usual case where the criteria pull apart
 * 选择适合当前数字的“取舍”解释（用于课件外补充说明）：unknown 无法判断；same-base 各组实际为正的比例相同；
 * random 比例不同，但每组内 TPR 等于 FPR（选谁与是否真为正无关）；conflict 比例不同，各标准通常互相冲突。
 */
export function tradeoffCase(evaluation) {
  const { metrics } = evaluation;
  const baseRates = metrics.map((entry) => entry.actualPositiveRate.value);
  if (metrics.length < 2 || baseRates.some((value) => value === null)) return 'unknown';
  if ((Math.max(...baseRates) - Math.min(...baseRates)) * 100 <= SAME_RATE_POINTS) return 'same-base';
  const ignoresTruth = metrics.every((entry) => {
    const tpr = entry.truePositiveRate.value;
    const fpr = entry.falsePositiveRate.value;
    return tpr !== null && fpr !== null && Math.abs(tpr - fpr) * 100 <= SAME_RATE_POINTS;
  });
  return ignoresTruth ? 'random' : 'conflict';
}
