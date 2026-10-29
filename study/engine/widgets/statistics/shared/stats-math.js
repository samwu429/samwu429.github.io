/**
 * Descriptive statistics shared by the STA220 widgets, computed the way the course does them by hand. DOM-free.
 * STA220 统计类组件共用的描述统计，按课程的手算方法计算；不依赖 DOM。
 *
 * Conventions (STA220 Modules 2-5):
 * - Every function cleans its input first: only finite numbers and numeric strings count, so a widget can
 *   pass config data straight in.
 * - Positions are 1-based ranks in the data sorted from smallest to largest, as on the slides
 *   ("the average of the 15th and the 16th ordered values").
 * - The sample variance, standard deviation, covariance and correlation divide by n − 1.
 * - A result that cannot be computed (no data, n − 1 = 0, a standard deviation of 0) is NaN, so the
 *   formatters print a dash instead of a misleading number.
 * 约定（STA220 第 2-5 单元）：
 * - 每个函数先清理输入：只计入有限数字和数字字符串，组件可以直接传入配置里的数据。
 * - 位置是数据从小到大排序后从 1 开始的名次，与课件一致（“第 15 个和第 16 个有序值的平均”）。
 * - 样本方差、标准差、协方差和相关系数都除以 n − 1。
 * - 无法计算的结果（没有数据、n − 1 = 0、标准差为 0）为 NaN，格式化时显示破折号，而不是一个误导人的数字。
 */
import { decimalsOf, isFiniteNumber, niceStep, roundTo, toNumber } from '../../machine-learning/shared/ml-math.js';

// The keys these functions accept or return; widgets turn them into bilingual words.
// 这些函数接受或返回的键名；组件再把它们换成双语文字。
export const QUARTILE_METHODS = Object.freeze(['hand', 'r7']);
export const OUTLIER_LEVELS = Object.freeze(['none', 'suspect', 'highly-suspect']);
export const STRENGTH_LEVELS = Object.freeze(['strong', 'moderate-to-strong', 'moderate', 'weak']);

// More bins than this cannot be read on a phone; a width that would need more falls back to the default.
// 超过这个数目的组在手机上无法辨认；需要更多组的组距会退回默认组距。
export const MAX_BINS = 200;

// Relative tolerance for comparing computed numbers, wide enough to absorb binary noise such as
// 0.3 / 0.1 = 2.9999999999999996, far too narrow to merge values a student would call different.
// 比较计算结果时用的相对容差：足以吸收二进制误差（如 0.3 / 0.1 = 2.9999999999999996），
// 又远小于学生会认为不同的两个数之间的差距。
const EPSILON = 1e-9;
// Much tighter slack for r against the strength cut-offs: an r computed as 0.7999999999999999 is still 0.8.
// r 与强度分界值比较时用更小的容差：算出来是 0.7999999999999999 的 r 仍然算 0.8。
const R_TOLERANCE = 1e-12;

function nearlyEqual(a, b) {
  return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

function total(numbers) {
  let result = 0;
  for (const value of numbers) result += value;
  return result;
}

/* ---------- Cleaning and centre 清理数据与集中趋势 ---------- */

/** Finite numbers of a list, in their order; numeric strings are read, anything else is skipped. 列表中的有限数字（保持原顺序）；读取数字字符串，其余跳过。 */
export function finiteNumbers(values) {
  if (!Array.isArray(values)) return [];
  const numbers = [];
  for (const value of values) {
    const number = toNumber(value);
    if (number !== null) numbers.push(number);
  }
  return numbers;
}

/**
 * Points with finite coordinates as { x, y }; each point may be an [x, y] pair or an { x, y } object.
 * 坐标有限的数据点，统一为 { x, y }；每个点可以写成 [x, y] 或 { x, y }。
 */
export function finitePoints(points) {
  if (!Array.isArray(points)) return [];
  const clean = [];
  for (const raw of points) {
    const x = toNumber(Array.isArray(raw) ? raw[0] : raw?.x);
    const y = toNumber(Array.isArray(raw) ? raw[1] : raw?.y);
    if (x !== null && y !== null) clean.push({ x, y });
  }
  return clean;
}

/** Σx; 0 for an empty list. 求和；空列表为 0。 */
export function sum(values) {
  return total(finiteNumbers(values));
}

/** Sample mean x̄ = Σx / n (M3 p.29). 样本平均数 x̄ = Σx / n（第 3 单元第 29 页）。 */
export function mean(values) {
  const numbers = finiteNumbers(values);
  return numbers.length ? total(numbers) / numbers.length : NaN;
}

/** A new array of the finite values from smallest to largest. 由小到大排列的新数组。 */
export function sortAscending(values) {
  return finiteNumbers(values).sort((a, b) => a - b);
}

// Median of data that is already sorted: rank 0.5 × (n + 1); an even n averages the two middle values (M3 p.32).
// 已排序数据的中位数：名次 0.5 × (n + 1)；n 为偶数时取中间两个值的平均（第 3 单元第 32 页）。
function medianOfSorted(sorted) {
  const n = sorted.length;
  if (!n) return { n: 0, value: NaN, rank: NaN, positions: [], middle: [] };
  const rank = 0.5 * (n + 1);
  const positions = n % 2 ? [rank] : [n / 2, n / 2 + 1];
  const middle = positions.map((position) => sorted[position - 1]);
  return { n, value: total(middle) / middle.length, rank, positions, middle };
}

/**
 * Median with its working: { n, value, rank, positions, middle, sorted }. `rank` is 0.5 × (n + 1)
 * (15.5 for n = 30); `positions` are the 1-based positions averaged ([15, 16]) and `middle` their values.
 * 中位数及其步骤：{ n, value, rank, positions, middle, sorted }。rank 为 0.5 × (n + 1)（n = 30 时为 15.5）；
 * positions 是参与平均的位置（从 1 开始，如 [15, 16]），middle 是这些位置上的值。
 */
export function medianInfo(values) {
  const sorted = sortAscending(values);
  return { ...medianOfSorted(sorted), sorted };
}

/** Median value only. 只返回中位数的值。 */
export function median(values) {
  return medianOfSorted(sortAscending(values)).value;
}

/**
 * Values that occur most often, ascending, with how often: { values, count }. `values` is empty when every
 * value is unique; ties give several modes, as in M3 practice Q1d (8, 10 and 17).
 * 出现次数最多的值（由小到大）及其次数：{ values, count }。每个值都只出现一次时 values 为空；
 * 并列时有多个众数，与第 3 单元练习 Q1d（8、10、17）一致。
 */
export function modes(values) {
  const counts = valueCounts(values);
  const count = counts.reduce((highest, item) => Math.max(highest, item.count), 0);
  const peaks = count > 1 ? counts.filter((item) => item.count === count).map((item) => item.value) : [];
  return { values: peaks, count };
}

/** How often each distinct value occurs, ascending: [{ value, count }], like R's table(). 每个不同取值出现的次数（由小到大），与 R 的 table() 相同。 */
export function valueCounts(values) {
  const counts = [];
  for (const value of sortAscending(values)) {
    const last = counts[counts.length - 1];
    if (last && last.value === value) last.count += 1;
    else counts.push({ value, count: 1 });
  }
  return counts;
}

/* ---------- Position: quartiles, five-number summary, fences 位置：四分位数、五数概括、栅栏 ---------- */

// R's default quantile (type 7) of sorted data: rank h = (n − 1)p + 1, then linear interpolation between
// the value at position ⌊h⌋ and the next one.
// 已排序数据的 R 默认分位数（type 7）：名次 h = (n − 1)p + 1，再在第 ⌊h⌋ 个值与下一个值之间线性插值。
function quantileOfSorted(sorted, p) {
  const n = sorted.length;
  if (!n || !(p >= 0 && p <= 1)) return { value: NaN, rank: NaN, positions: [] };
  const rank = (n - 1) * p + 1;
  const base = Math.min(n, Math.floor(rank + EPSILON));
  const fraction = rank - base;
  if (fraction <= EPSILON || base === n) return { value: sorted[base - 1], rank, positions: [base] };
  const low = sorted[base - 1];
  return { value: low + fraction * (sorted[base] - low), rank, positions: [base, base + 1] };
}

/**
 * pth quantile by R's default rule (type 7): { value, rank, positions }, with rank h = (n − 1)p + 1 (1-based).
 * quantileR7([1, ..., 10], 0.25).value = 3.25, as R's quantile(1:10) prints.
 * 按 R 默认规则（type 7）求第 p 分位数：{ value, rank, positions }，名次 h = (n − 1)p + 1（从 1 开始）。
 */
export function quantileR7(values, p) {
  return quantileOfSorted(sortAscending(values), toNumber(p, NaN));
}

// One half of the sorted data for the hand method: its values, where it sits in the whole data (1-based
// `from`..`to`) and its own median (rank and positions counted inside the half).
// 手算方法中排序数据的一半：它的值、它在整组数据中的位置（从 1 开始的 from..to），以及它自己的中位数（名次与位置在这一半内计数）。
function halfOf(values, offset) {
  const middle = medianOfSorted(values);
  return {
    values,
    from: values.length ? offset + 1 : NaN,
    to: values.length ? offset + values.length : NaN,
    value: middle.value,
    rank: middle.rank,
    positions: middle.positions,
  };
}

/**
 * Q1, the median and Q3 with their working. Methods:
 * - "hand" (M4 p.3, p.5-6): Q1 is the median of the first half and Q3 the median of the second half
 *   (n = 30: the 8th of the first 15 values and the 8th of the last 15). The slides never show an odd n;
 *   here the median is then left out of both halves (`medianExcluded`). A single value has empty halves,
 *   so Q1 = Q3 = that value.
 * - "r7": R's quantile() and summary() (type 7), which the slides say may differ from the hand method.
 * Returns { method, n, sorted, q1, median, q3, iqr, medianRank, positions: { q1, median, q3 },
 * ranks (r7: { q1, q3 } = h; hand: null), lowerHalf and upperHalf (hand: { values, from, to, value,
 * rank, positions }, with rank and positions counted inside the half; r7: null), medianExcluded }.
 * Every position is 1-based in the sorted data unless it is a half's own.
 * 四分位数 Q1、中位数、Q3 及其步骤。方法：
 * - "hand"（第 4 单元第 3、5-6 页）：Q1 是前一半的中位数，Q3 是后一半的中位数（n = 30 时为前 15 个中的第 8 个、
 *   后 15 个中的第 8 个）。课件没有奇数 n 的例子；这里此时把中位数排除在两半之外（medianExcluded）。
 *   只有一个值时两半都是空的，Q1 = Q3 = 这个值。
 * - "r7"：R 的 quantile() 与 summary()（type 7），课件说明它可能与手算结果不同。
 * 返回值中 ranks 只用于 r7（即 h）；lowerHalf、upperHalf 只用于 hand，给出每一半的值、在整组数据中的起止位置及其中位数。
 * 除了每一半自己的位置以外，所有位置都是排序数据中从 1 开始的位置。
 */
export function quartiles(values, method = 'hand') {
  const sorted = sortAscending(values);
  const n = sorted.length;
  const middle = medianOfSorted(sorted);
  const common = { n, sorted, median: middle.value, medianRank: middle.rank };
  if (method === 'r7') {
    const q1 = quantileOfSorted(sorted, 0.25);
    const q3 = quantileOfSorted(sorted, 0.75);
    return {
      method: 'r7',
      ...common,
      q1: q1.value,
      q3: q3.value,
      iqr: q3.value - q1.value,
      positions: { q1: q1.positions, median: middle.positions, q3: q3.positions },
      ranks: { q1: q1.rank, q3: q3.rank },
      lowerHalf: null,
      upperHalf: null,
      medianExcluded: false,
    };
  }
  const upperStart = Math.ceil(n / 2);
  const lowerHalf = halfOf(sorted.slice(0, Math.floor(n / 2)), 0);
  const upperHalf = halfOf(sorted.slice(upperStart), upperStart);
  const single = !lowerHalf.values.length;
  const q1 = single ? middle.value : lowerHalf.value;
  const q3 = single ? middle.value : upperHalf.value;
  return {
    method: 'hand',
    ...common,
    q1,
    q3,
    iqr: q3 - q1,
    positions: {
      q1: single ? middle.positions : lowerHalf.positions,
      median: middle.positions,
      q3: single ? middle.positions : upperHalf.positions.map((position) => position + upperStart),
    },
    ranks: null,
    lowerHalf,
    upperHalf,
    medianExcluded: n % 2 === 1,
  };
}

/** { method, n, min, q1, median, q3, max } (M4 p.7). 五数概括（第 4 单元第 7 页）。 */
export function fiveNumberSummary(values, method = 'hand') {
  const info = quartiles(values, method);
  return {
    method: info.method,
    n: info.n,
    min: info.n ? info.sorted[0] : NaN,
    q1: info.q1,
    median: info.median,
    q3: info.q3,
    max: info.n ? info.sorted[info.n - 1] : NaN,
  };
}

/** IQR = Q3 − Q1 (M4 p.5). 四分位距 IQR = Q3 − Q1（第 4 单元第 5 页）。 */
export function iqr(values, method = 'hand') {
  return quartiles(values, method).iqr;
}

/** Range = Max − Min (M4 p.2). 全距 = 最大值 − 最小值（第 4 单元第 2 页）。 */
export function range(values) {
  const sorted = sortAscending(values);
  return sorted.length ? sorted[sorted.length - 1] - sorted[0] : NaN;
}

/**
 * Inner fences Q1 − 1.5 × IQR and Q3 + 1.5 × IQR, outer fences Q1 − 3 × IQR and Q3 + 3 × IQR (M4 p.12):
 * { q1, q3, iqr, innerStep, outerStep, lowerInner, upperInner, lowerOuter, upperOuter }.
 * 内栅栏 Q1 − 1.5 × IQR 与 Q3 + 1.5 × IQR，外栅栏 Q1 − 3 × IQR 与 Q3 + 3 × IQR（第 4 单元第 12 页）。
 */
export function fences(q1, q3) {
  const low = toNumber(q1, NaN);
  const high = toNumber(q3, NaN);
  const spread = high - low;
  const innerStep = 1.5 * spread;
  const outerStep = 3 * spread;
  return {
    q1: low,
    q3: high,
    iqr: spread,
    innerStep,
    outerStep,
    lowerInner: low - innerStep,
    upperInner: high + innerStep,
    lowerOuter: low - outerStep,
    upperOuter: high + outerStep,
  };
}

// Strictly beyond a fence: a value equal to the fence (up to binary noise) counts as inside.
// 严格超出栅栏：与栅栏相等（不计二进制误差）的值算作在栅栏以内。
const isBelow = (value, fence) => value < fence && !nearlyEqual(value, fence);
const isAbove = (value, fence) => value > fence && !nearlyEqual(value, fence);

/**
 * "none", "suspect" (beyond an inner fence but not an outer one) or "highly-suspect" (beyond an outer fence).
 * A value exactly on a fence is inside it: M4 p.14 draws the whisker to "a value ≥ 108.75 (greater than or
 * equal to 108.75)", and R's boxplot decides the same way. The two levels do not overlap, as in the M4
 * practice table (Turkey 9.3% is "suspect", Spain 18% is "highly suspect").
 * 返回 "none"、"suspect"（超出内栅栏但没有超出外栅栏）或 "highly-suspect"（超出外栅栏）。
 * 恰好落在栅栏上的值算在栅栏以内：第 4 单元第 14 页把须线画到“≥ 108.75 的值（大于或等于 108.75）”，
 * R 的箱线图也是这样判断。两个级别互不重叠，与第 4 单元练习的表格一致（土耳其 9.3% 为 suspect，西班牙 18% 为 highly suspect）。
 */
export function outlierLevel(value, fenceSet) {
  const x = toNumber(value);
  if (x === null || !fenceSet) return 'none';
  if (isBelow(x, fenceSet.lowerOuter) || isAbove(x, fenceSet.upperOuter)) return 'highly-suspect';
  if (isBelow(x, fenceSet.lowerInner) || isAbove(x, fenceSet.upperInner)) return 'suspect';
  return 'none';
}

/**
 * Every value beyond the inner fences, ascending: { outliers: [{ value, level, side }], suspect, highlySuspect },
 * where side is "low" or "high" and the last two list the values of each level.
 * 超出内栅栏的所有值（由小到大）：{ outliers: [{ value, level, side }], suspect, highlySuspect }；
 * side 为 "low" 或 "high"，后两项分别列出两个级别的值。
 */
export function classifyOutliers(values, fenceSet) {
  const outliers = [];
  for (const value of sortAscending(values)) {
    const level = outlierLevel(value, fenceSet);
    if (level !== 'none') outliers.push({ value, level, side: isBelow(value, fenceSet.lowerInner) ? 'low' : 'high' });
  }
  return {
    outliers,
    suspect: outliers.filter((item) => item.level === 'suspect').map((item) => item.value),
    highlySuspect: outliers.filter((item) => item.level === 'highly-suspect').map((item) => item.value),
  };
}

/**
 * Whisker ends { lower, upper }: the most extreme data values within the inner fences (M4 p.14: 180 and 340
 * for the donuts, while 400 is plotted on its own).
 * 须线端点 { lower, upper }：内栅栏以内最极端的数据值（第 4 单元第 14 页：甜甜圈为 180 和 340，400 单独画出）。
 */
export function whiskerEnds(values, fenceSet) {
  const inside = sortAscending(values).filter((value) => outlierLevel(value, fenceSet) === 'none');
  return inside.length ? { lower: inside[0], upper: inside[inside.length - 1] } : { lower: NaN, upper: NaN };
}

/**
 * Everything a boxplot needs, in the order of the construction steps: { method, n, min, q1, median, q3, max,
 * iqr, quartiles, fences, whiskers, outliers, suspect, highlySuspect }.
 * 画箱线图所需的全部数据，按作图步骤的顺序给出。
 */
export function boxplotStats(values, method = 'hand') {
  const info = quartiles(values, method);
  const fenceSet = fences(info.q1, info.q3);
  const { outliers, suspect, highlySuspect } = classifyOutliers(info.sorted, fenceSet);
  return {
    method: info.method,
    n: info.n,
    min: info.n ? info.sorted[0] : NaN,
    q1: info.q1,
    median: info.median,
    q3: info.q3,
    max: info.n ? info.sorted[info.n - 1] : NaN,
    iqr: info.iqr,
    quartiles: info,
    fences: fenceSet,
    whiskers: whiskerEnds(info.sorted, fenceSet),
    outliers,
    suspect,
    highlySuspect,
  };
}

/* ---------- Spread and standardizing 离散程度与标准化 ---------- */

/**
 * The hand table for s (M3 p.45-53): rows { index, x, deviation: x − x̄, squared: (x − x̄)² } in input order,
 * with { n, sum, mean, sumDeviation (always about 0), sumSquared, variance = Σ(x − x̄)² / (n − 1), sd }.
 * `index` counts the cleaned values.
 * 手算 s 的表格（第 3 单元第 45-53 页）：每行 { index, x, deviation: x − x̄, squared: (x − x̄)² }，保持输入顺序；
 * 另给出 n、Σx、x̄、偏差之和（总是约为 0）、平方和、方差 Σ(x − x̄)² / (n − 1) 与标准差。index 按清理后的数值计数。
 */
export function deviationTable(values) {
  const numbers = finiteNumbers(values);
  const n = numbers.length;
  const sumX = total(numbers);
  const average = n ? sumX / n : NaN;
  const rows = numbers.map((x, index) => {
    const deviation = x - average;
    return { index, x, deviation, squared: deviation * deviation };
  });
  const sumSquared = total(rows.map((row) => row.squared));
  const variance = n > 1 ? sumSquared / (n - 1) : NaN;
  return {
    n,
    sum: sumX,
    mean: average,
    rows,
    sumDeviation: total(rows.map((row) => row.deviation)),
    sumSquared,
    variance,
    sd: Math.sqrt(variance),
  };
}

/** Sample variance s² = Σ(x − x̄)² / (n − 1) (M3 p.46); NaN when n < 2. 样本方差；n < 2 时为 NaN。 */
export function sampleVariance(values) {
  return deviationTable(values).variance;
}

/** Sample standard deviation s = √s² (M3 p.51); NaN when n < 2. 样本标准差；n < 2 时为 NaN。 */
export function sampleSd(values) {
  return deviationTable(values).sd;
}

/** z = (x − x̄) / s (M4 p.25); NaN unless s > 0. z 分数；s 必须大于 0。 */
export function zScore(value, average, sd) {
  const x = toNumber(value);
  const centre = toNumber(average);
  const spread = toNumber(sd);
  return x !== null && centre !== null && spread !== null && spread > 0 ? (x - centre) / spread : NaN;
}

/** Observation from a z-score: y = x̄ + z × s (M4 p.37: 100 + 2.5 × 16 = 140). 由 z 分数还原观测值。 */
export function observationFromZ(z, average, sd) {
  const score = toNumber(z);
  const centre = toNumber(average);
  const spread = toNumber(sd);
  return score !== null && centre !== null && spread !== null && spread >= 0 ? centre + score * spread : NaN;
}

/* ---------- Two quantitative variables 两个定量变量 ---------- */

/**
 * Correlation with both hand methods of M5: the deviation table (p.40) and the z-score products (p.42-43).
 * r = Σ z_x z_y / (n − 1), which equals S_xy / (s_x s_y) = SS_xy / √(SS_xx SS_yy).
 * Returns { n, xbar, ybar, sx, sy, ssxx, ssyy, ssxy, covariance (S_xy), sumZProducts, r, rows }, where each row
 * is { index, x, y, dx: x − x̄, dy: y − ȳ, dxdy, dx2, dy2, zx, zy, zxzy } in input order. r is NaN when n < 2 or
 * when all x (or all y) are equal, and it is clamped to [−1, 1] against rounding noise.
 * 第 5 单元两种手算相关系数的方法：偏差表（第 40 页）与 z 分数乘积（第 42-43 页）。
 * r = Σ z_x z_y / (n − 1)，等于 S_xy / (s_x s_y) = SS_xy / √(SS_xx SS_yy)。
 * 返回 n、x̄、ȳ、s_x、s_y、SS_xx、SS_yy、SS_xy、协方差 S_xy、Σ z_x z_y、r，以及按输入顺序排列的逐行表格
 * （偏差、偏差乘积、偏差平方、z 分数及其乘积）。
 * n < 2 或所有 x（或所有 y）都相等时 r 为 NaN；r 会被限制在 [−1, 1] 内，以防舍入误差越界。
 */
export function correlation(points) {
  const clean = finitePoints(points);
  const n = clean.length;
  const xbar = n ? total(clean.map((point) => point.x)) / n : NaN;
  const ybar = n ? total(clean.map((point) => point.y)) / n : NaN;
  const deviations = clean.map(({ x, y }) => ({ x, y, dx: x - xbar, dy: y - ybar }));
  const ssxx = total(deviations.map((row) => row.dx * row.dx));
  const ssyy = total(deviations.map((row) => row.dy * row.dy));
  const ssxy = total(deviations.map((row) => row.dx * row.dy));
  const sx = n > 1 ? Math.sqrt(ssxx / (n - 1)) : NaN;
  const sy = n > 1 ? Math.sqrt(ssyy / (n - 1)) : NaN;
  const rows = deviations.map((row, index) => {
    const zx = sx > 0 ? row.dx / sx : NaN;
    const zy = sy > 0 ? row.dy / sy : NaN;
    return {
      index, ...row, dxdy: row.dx * row.dy, dx2: row.dx * row.dx, dy2: row.dy * row.dy, zx, zy, zxzy: zx * zy,
    };
  });
  const sumZProducts = total(rows.map((row) => row.zxzy));
  const defined = n > 1 && sx > 0 && sy > 0;
  return {
    n,
    xbar,
    ybar,
    sx,
    sy,
    ssxx,
    ssyy,
    ssxy,
    covariance: n > 1 ? ssxy / (n - 1) : NaN,
    sumZProducts: defined ? sumZProducts : NaN,
    r: defined ? Math.min(1, Math.max(-1, sumZProducts / (n - 1))) : NaN,
    rows,
  };
}

/**
 * Strength word of the M5 p.32 scale for |r|: "strong" (≥ 0.8), "moderate-to-strong" (0.5 to < 0.8),
 * "moderate" (0.3 to < 0.5) or "weak" (< 0.3); null when r is not a number. Pass the rounded r when the
 * widget shows a rounded r, so the word matches the printed number.
 * 第 5 单元第 32 页按 |r| 划分的强度：strong（≥ 0.8）、moderate-to-strong（0.5 至 < 0.8）、moderate（0.3 至 < 0.5）、
 * weak（< 0.3）；r 不是数字时为 null。组件显示四舍五入后的 r 时，传入同一个 r，使强度与显示的数字一致。
 */
export function correlationStrength(r) {
  const value = toNumber(r);
  if (value === null) return null;
  const size = Math.abs(value) + R_TOLERANCE;
  if (size >= 0.8) return 'strong';
  if (size >= 0.5) return 'moderate-to-strong';
  if (size >= 0.3) return 'moderate';
  return 'weak';
}

/** "positive", "negative" or "none" (r = 0); null when r is not a number. 方向；r 不是数字时为 null。 */
export function correlationDirection(r) {
  const value = toNumber(r);
  if (value === null) return null;
  if (value > R_TOLERANCE) return 'positive';
  if (value < -R_TOLERANCE) return 'negative';
  return 'none';
}

/** ŷ = b0 + b1x for a line { b0, b1 }; NaN when anything is missing. 直线 { b0, b1 } 的预测值 ŷ。 */
export function predict(line, x) {
  const b0 = toNumber(line?.b0);
  const b1 = toNumber(line?.b1);
  const input = toNumber(x);
  return b0 !== null && b1 !== null && input !== null ? b0 + b1 * input : NaN;
}

/** Residual e = y − ŷ (midterm 2025 Q24: 90 − 74.03 = 15.97). 残差 e = y − ŷ。 */
export function residual(line, x, y) {
  const observed = toNumber(y);
  return observed === null ? NaN : observed - predict(line, x);
}

/**
 * Predictions and residuals of any line { b0, b1 } for the points: { rows: [{ index, x, y, yHat, residual,
 * squared }], sse }, where sse = Σ(y − ŷ)². Used for the least-squares line and for a learner's own line.
 * 任意直线 { b0, b1 } 对各点的预测值与残差：{ rows, sse }，sse = Σ(y − ŷ)²。最小二乘直线和学生自己画的直线都用它。
 */
export function residualTable(line, points) {
  const rows = finitePoints(points).map(({ x, y }, index) => {
    const yHat = predict(line, x);
    const error = y - yHat;
    return { index, x, y, yHat, residual: error, squared: error * error };
  });
  return { rows, sse: total(rows.map((row) => row.squared)) };
}

/**
 * Least-squares line ŷ = b0 + b1x from data: b1 = r · s_y / s_x, b0 = ȳ − b1 · x̄, R² = r².
 * b1 is computed as SS_xy / SS_xx, the same number, which also gives the flat line b1 = 0 when every y is equal.
 * Returns { n, b0, b1, r, rSquared, xbar, ybar, sx, sy, xMin, xMax, residuals (rows of residualTable), sse,
 * correlation }; xMin and xMax bound the observed x range (predicting outside it is extrapolation).
 * b0 and b1 are NaN when fewer than two distinct x values exist.
 * 由数据求最小二乘直线 ŷ = b0 + b1x：b1 = r · s_y / s_x，b0 = ȳ − b1 · x̄，R² = r²。
 * b1 按 SS_xy / SS_xx 计算（数值相同），所有 y 都相等时也能得到水平线 b1 = 0。
 * 返回 b0、b1、r、R²、两个变量的平均数与标准差、残差表、残差平方和 sse 以及相关系数的全部步骤；
 * xMin 与 xMax 是观测到的 x 范围（在范围外预测属于外推）。不同的 x 少于两个时 b0、b1 为 NaN。
 */
export function leastSquares(points) {
  const corr = correlation(points);
  const b1 = corr.n > 1 && corr.ssxx > 0 ? corr.ssxy / corr.ssxx : NaN;
  const b0 = Number.isFinite(b1) ? corr.ybar - b1 * corr.xbar : NaN;
  const { rows, sse } = residualTable({ b0, b1 }, points);
  const xs = rows.map((row) => row.x);
  return {
    n: corr.n,
    b0,
    b1,
    r: corr.r,
    rSquared: corr.r * corr.r,
    xbar: corr.xbar,
    ybar: corr.ybar,
    sx: corr.sx,
    sy: corr.sy,
    xMin: xs.length ? Math.min(...xs) : NaN,
    xMax: xs.length ? Math.max(...xs) : NaN,
    residuals: rows,
    sse: Number.isFinite(b1) ? sse : NaN,
    correlation: corr,
  };
}

/**
 * Least-squares line from summary statistics, the exam style: { xbar, sx, ybar, sy, r } gives
 * { b0, b1, r, rSquared, xbar, sx, ybar, sy } with b1 = r · s_y / s_x and b0 = ȳ − b1 · x̄. Everything is NaN
 * unless s_x > 0, s_y ≥ 0 and −1 ≤ r ≤ 1.
 * 由概括统计量求最小二乘直线（考试题型）：b1 = r · s_y / s_x，b0 = ȳ − b1 · x̄。
 * 只有 s_x > 0、s_y ≥ 0 且 −1 ≤ r ≤ 1 时才有结果，否则全部为 NaN。
 */
export function lineFromSummary(summary) {
  const xbar = toNumber(summary?.xbar, NaN);
  const sx = toNumber(summary?.sx, NaN);
  const ybar = toNumber(summary?.ybar, NaN);
  const sy = toNumber(summary?.sy, NaN);
  const r = toNumber(summary?.r, NaN);
  const valid = Number.isFinite(xbar) && Number.isFinite(ybar) && sx > 0 && sy >= 0 && r >= -1 && r <= 1;
  if (!valid) return { b0: NaN, b1: NaN, r: NaN, rSquared: NaN, xbar, sx, ybar, sy };
  const b1 = (r * sy) / sx;
  return { b0: ybar - b1 * xbar, b1, r, rSquared: r * r, xbar, sx, ybar, sy };
}

/* ---------- Frequency tables and stem-and-leaf 频数表与茎叶图 ---------- */

/**
 * Default bin width: Sturges' rule (R's hist() default, about log2(n) + 1 bins) rounded to a nice width.
 * For the 30 donut calories this gives 50, the width of R's histogram on M3 p.9.
 * 默认组距：Sturges 规则（R 的 hist() 默认，约 log2(n) + 1 组），再取整为好读的组距。30 个甜甜圈热量得到 50，与第 3 单元第 9 页 R 的直方图一致。
 */
export function defaultBinWidth(values) {
  const sorted = sortAscending(values);
  if (!sorted.length) return 1;
  const span = sorted[sorted.length - 1] - sorted[0];
  if (span > 0) return niceStep(span, Math.ceil(Math.log2(sorted.length) + 1));
  return niceStep(Math.abs(sorted[0]) || 1, 5);
}

/**
 * Frequency table of equal-width bins starting at `start` (default: the multiple of the width at or below
 * the minimum, moved down by whole widths if the minimum lies below it).
 * - closed "right" (default, like R's hist()): bins (a, b], except that the first bin also contains its left
 *   end, [a, b], as R's include.lowest does. The donut calories with start 150 and width 50 give 6, 11, 10, 2, 1
 *   (M3 p.13-14: "at most 200" is the first bar).
 * - closed "left": bins [a, b); the last bin is the one whose interior holds the maximum, so a maximum on an edge
 *   opens a new bin. The donuts then give 4, 9, 12, 4, 0, 1, like the poster on M3 p.8.
 * Returns { n, start, width, closed, edges, bins: [{ index, lower, upper, leftClosed, rightClosed, count,
 * proportion, cumulative, cumulativeProportion, values }] }; empty bins stay in the table (gaps). When the
 * width and start would need more than MAX_BINS bins, both fall back to their defaults.
 * 从 start 开始的等宽分组频数表（默认 start 为不大于最小值的组距倍数；最小值比 start 还小时，start 按整组距往下移）。
 * - closed "right"（默认，与 R 的 hist() 相同）：组为 (a, b]，但第一组也包含左端点，即 [a, b]（R 的 include.lowest）。
 *   甜甜圈热量从 150 开始、组距 50 时为 6、11、10、2、1（第 3 单元第 13-14 页：“最多 200”就是第一根柱）。
 * - closed "left"：组为 [a, b)；最后一组是内部包含最大值的那一组，最大值恰在边界上时会多开一组。
 *   甜甜圈此时为 4、9、12、4、0、1，与第 3 单元第 8 页的海报一致。
 * 空组保留在表中（显示为缺口）。组距和起点需要超过 MAX_BINS 组时，两者都退回默认值。
 */
export function frequencyTable(values, options = {}) {
  const sorted = sortAscending(values);
  const closed = options?.closed === 'left' ? 'left' : 'right';
  const n = sorted.length;
  let width = toNumber(options?.width);
  if (!(width > 0)) width = defaultBinWidth(sorted);
  if (!n) return { n: 0, start: NaN, width, closed, edges: [], bins: [] };

  const min = sorted[0];
  const max = sorted[n - 1];
  const binsFor = (from, step) => (closed === 'right'
    ? Math.max(1, Math.ceil((max - from) / step - EPSILON))
    : Math.floor((max - from) / step + EPSILON) + 1);
  const startFor = (given, step) => {
    const from = given === null ? Math.floor(min / step + EPSILON) * step : given;
    const shift = from > min ? Math.ceil((from - min) / step - EPSILON) * step : 0;
    return roundTo(from - shift, Math.max(decimalsOf(from), decimalsOf(step)));
  };
  let start = startFor(toNumber(options?.start), width);
  if (binsFor(start, width) > MAX_BINS) {
    width = defaultBinWidth(sorted);
    start = startFor(null, width);
  }
  const count = binsFor(start, width);
  const digits = Math.max(decimalsOf(start), decimalsOf(width));
  const edges = Array.from({ length: count + 1 }, (_, index) => roundTo(start + index * width, digits));

  const members = Array.from({ length: count }, () => []);
  for (const value of sorted) {
    const offset = (value - start) / width;
    const index = closed === 'right' ? Math.ceil(offset - EPSILON) - 1 : Math.floor(offset + EPSILON);
    members[Math.min(count - 1, Math.max(0, index))].push(value);
  }

  let cumulative = 0;
  const bins = members.map((list, index) => {
    cumulative += list.length;
    return {
      index,
      lower: edges[index],
      upper: edges[index + 1],
      leftClosed: closed === 'left' || index === 0,
      rightClosed: closed === 'right',
      count: list.length,
      proportion: list.length / n,
      cumulative,
      cumulativeProportion: cumulative / n,
      values: list,
    };
  });
  return { n, start, width, closed, edges, bins };
}

// A positive power of ten (0.1, 1, 10, ...) written exactly, or null.
// 精确写出的正的 10 的整数次幂（0.1、1、10……），否则为 null。
function powerOfTen(value) {
  const number = toNumber(value);
  if (number === null || number <= 0) return null;
  const exponent = Math.round(Math.log10(number));
  const exact = 10 ** exponent;
  return nearlyEqual(number, exact) ? roundTo(exact, Math.max(0, -exponent)) : null;
}

/**
 * Default leaf unit: the digit one place below the leading digit of the range (10 for the donut calories,
 * so 180 is stem 1, leaf 8 as in R's stem() on M3 p.23), but never finer than the data's own decimals.
 * 默认叶单位：比全距最高位低一位的那一位（甜甜圈热量为 10，于是 180 的茎为 1、叶为 8，与第 3 单元第 23 页 R 的 stem() 一致），
 * 但不会比数据本身的小数位更细。
 */
export function defaultLeafUnit(values) {
  const sorted = sortAscending(values);
  if (!sorted.length) return 1;
  const span = sorted[sorted.length - 1] - sorted[0];
  const scale = span > 0 ? span : Math.abs(sorted[0]) || 1;
  const fromSpan = 10 ** (Math.floor(Math.log10(scale)) - 1);
  const resolution = 10 ** -Math.max(...sorted.map((value) => decimalsOf(value)));
  return powerOfTen(Math.max(fromSpan, resolution));
}

// Rounds each sorted value to the leaf unit and gives it a line "slot" along the number line: slot = stem ×
// linesPerStem + part for positive stems, mirrored below 0 for negative ones, so slots grow with the value.
// 把每个已排序的值按叶单位取整，并给它在数轴上的行号 slot：正的茎为 stem × linesPerStem + part，负的茎对称地排在 0 以下，
// 所以 slot 随数值增大而增大。
function placeLeaves(sorted, leafUnit, linesPerStem) {
  const leavesPerLine = 10 / linesPerStem;
  // Multiplying by an exact whole number keeps 1.25 / 0.1 from turning into 12.499999999999998.
  // 乘以精确的整数，避免 1.25 / 0.1 变成 12.499999999999998。
  const scaled = (value) => (leafUnit < 1 ? value * Math.round(1 / leafUnit) : value / leafUnit);
  let rounded = false;
  const items = sorted.map((value) => {
    const whole = roundTo(scaled(value), 0);
    if (!nearlyEqual(whole, scaled(value))) rounded = true;
    const size = Math.abs(whole);
    const stem = Math.floor(size / 10);
    const leaf = size % 10;
    const part = Math.floor(leaf / leavesPerLine);
    const slot = whole < 0 ? -(stem * linesPerStem + part) - 1 : stem * linesPerStem + part;
    return { value, leaf, slot };
  });
  const lineCount = items.length ? items[items.length - 1].slot - items[0].slot + 1 : 0;
  return { items, rounded, lineCount };
}

/**
 * Stem-and-leaf display (M3 p.23-25). Each value is first rounded to the leaf unit (half away from zero, as R's
 * stem() does); the leaf is the last digit and the stem the rest. With `split: true` each stem gets two lines, leaves
 * 0-4 then 5-9 (R's `stem(Calories, scale = 0.5)` output). Lines run from the line of the minimum to the line of
 * the maximum, empty lines included; negative stems ("−0", "−1") come first, their leaves in data order.
 * Returns { n, leafUnit, stemUnit, split, rounded, lines: [{ stem, negative, part, leaves, values }] }, where
 * stem is the stem's size (shown with a minus sign when negative), part is 0 or 1 (which half of a split stem)
 * and rounded says whether any value lost digits. A leaf unit that is not a power of ten, or that would need
 * more than MAX_BINS lines, is replaced by the default one.
 * 茎叶图（第 3 单元第 23-25 页）。每个值先按叶单位四舍五入（远离零，与 R 的 stem() 相同）；最后一位是叶，其余是茎。
 * split 为 true 时每个茎分成两行，先是叶 0-4，再是叶 5-9（即 R 的 stem(Calories, scale = 0.5) 输出）。
 * 各行从最小值所在行排到最大值所在行，空行保留；负的茎（“−0”“−1”）排在前面，叶按数据顺序排列。
 * stem 是茎的大小（为负时显示时加负号），part 为 0 或 1（拆分茎的哪一半），rounded 表示是否有值被舍入。
 * 叶单位不是 10 的整数次幂、或需要超过 MAX_BINS 行时，改用默认叶单位。
 */
export function stemAndLeaf(values, options = {}) {
  const sorted = sortAscending(values);
  const linesPerStem = options?.split === true ? 2 : 1;
  let leafUnit = powerOfTen(options?.leafUnit) ?? defaultLeafUnit(sorted);
  let placed = placeLeaves(sorted, leafUnit, linesPerStem);
  if (placed.lineCount > MAX_BINS) {
    leafUnit = defaultLeafUnit(sorted);
    placed = placeLeaves(sorted, leafUnit, linesPerStem);
  }
  const { items, rounded } = placed;

  const lines = [];
  if (items.length) {
    for (let slot = items[0].slot; slot <= items[items.length - 1].slot; slot += 1) {
      const negative = slot < 0;
      const order = negative ? -slot - 1 : slot;
      const members = items.filter((item) => item.slot === slot);
      lines.push({
        stem: Math.floor(order / linesPerStem),
        negative,
        part: order % linesPerStem,
        leaves: members.map((item) => item.leaf),
        values: members.map((item) => item.value),
      });
    }
  }
  return {
    n: sorted.length,
    leafUnit,
    stemUnit: roundTo(leafUnit * 10, Math.max(0, decimalsOf(leafUnit) - 1)),
    split: linesPerStem === 2,
    rounded,
    lines,
  };
}

/* ---------- Two categorical variables 两个分类变量 ---------- */

// A cell count: finite and not negative, otherwise 0.
// 单元格计数：有限且非负，否则为 0。
function cleanCount(value) {
  const number = toNumber(value);
  return number !== null && number > 0 ? number : 0;
}

/**
 * Two-way (contingency) table of counts (M2 p.21-35): rows are the categories of one variable, columns of the
 * other. Returns { rowCount, columnCount, counts, rowTotals, columnTotals, total, joint (cell / total),
 * rowProportions (cell / row total, each row adds to 1), columnProportions (cell / column total, each column
 * adds to 1), rowMarginal (row total / total), columnMarginal (column total / total) }. Missing or bad cells
 * count as 0, short rows are padded, and a proportion over a total of 0 is NaN.
 * 二维（列联）表的计数（第 2 单元第 21-35 页）：行是一个变量的类别，列是另一个变量的类别。
 * joint 为单元格 / 总数；rowProportions 为单元格 / 行合计（每行加起来为 1）；columnProportions 为单元格 / 列合计
 * （每列加起来为 1）；rowMarginal、columnMarginal 为行、列合计 / 总数。缺失或无效的单元格按 0 计，短行补齐，分母为 0 的比例为 NaN。
 */
export function contingency(counts) {
  const source = (Array.isArray(counts) ? counts : []).map((row) => (Array.isArray(row) ? row : []));
  const columnCount = source.reduce((widest, row) => Math.max(widest, row.length), 0);
  const cells = source.map((row) => Array.from({ length: columnCount }, (_, column) => cleanCount(row[column])));
  const rowTotals = cells.map(total);
  const columnTotals = Array.from({ length: columnCount }, (_, column) => total(cells.map((row) => row[column])));
  const grand = total(rowTotals);
  const share = (part, whole) => (whole > 0 ? part / whole : NaN);
  return {
    rowCount: cells.length,
    columnCount,
    counts: cells,
    rowTotals,
    columnTotals,
    total: grand,
    joint: cells.map((row) => row.map((cell) => share(cell, grand))),
    rowProportions: cells.map((row, index) => row.map((cell) => share(cell, rowTotals[index]))),
    columnProportions: cells.map((row) => row.map((cell, column) => share(cell, columnTotals[column]))),
    rowMarginal: rowTotals.map((value) => share(value, grand)),
    columnMarginal: columnTotals.map((value) => share(value, grand)),
  };
}

function fraction(numerator, denominator) {
  const top = toNumber(numerator, NaN);
  const bottom = toNumber(denominator, NaN);
  return { numerator: top, denominator: bottom, value: bottom > 0 ? top / bottom : NaN };
}

/**
 * The fraction behind one cell's proportion, { numerator, denominator, value }, for `kind` "joint"
 * (over the grand total), "row" (over its row total) or "column" (over its column total).
 * Midterm 2025 Q4: cellFraction(table, 0, 0, 'row') is 30 / 96 ≈ 0.313.
 * 某个单元格比例背后的分数 { numerator, denominator, value }；kind 为 "joint"（除以总数）、"row"（除以行合计）
 * 或 "column"（除以列合计）。
 */
export function cellFraction(table, row, column, kind = 'joint') {
  const numerator = table?.counts?.[row]?.[column];
  if (!isFiniteNumber(numerator)) return fraction(NaN, NaN);
  if (kind === 'row') return fraction(numerator, table.rowTotals[row]);
  if (kind === 'column') return fraction(numerator, table.columnTotals[column]);
  return fraction(numerator, table.total);
}

/**
 * The fraction behind a marginal proportion: `axis` "row" (row total / total) or "column" (column total / total).
 * Midterm 2025 Q3: marginalFraction(table, 'column', 0) is 118 / 1117 ≈ 0.106.
 * 边际比例背后的分数：axis 为 "row"（行合计 / 总数）或 "column"（列合计 / 总数）。
 */
export function marginalFraction(table, axis, index) {
  const totals = axis === 'column' ? table?.columnTotals : table?.rowTotals;
  return fraction(totals?.[index], table?.total);
}
