/**
 * Scatterplot and correlation (STA220 Module 5) for the "scatter-correlation" widget: the config reader, r with
 * the z-score product table, the worked steps, the course's direction and strength wording, the plot view, and
 * the outlier, curved-pattern and change-of-units demos. Every number and sentence the widget shows is made here.
 * DOM-free.
 * 散点图与相关系数（STA220 第 5 单元），供 scatter-correlation 组件使用：读取配置、用 z 分数乘积表计算 r、解题步骤、
 * 课程的方向与强度用语、绘图范围，以及离群值、弯曲图案和换单位三个演示。组件显示的每个数字和句子都在这里生成；不依赖 DOM。
 *
 * Course conventions kept here:
 * - r = Σ z_x z_y / (n − 1) with z_x = (x − x̄) / s_x and z_y = (y − ȳ) / s_y, where both standard deviations
 *   divide by n − 1 (p.42-43). The same r is S_xy / (s_x s_y) = SS_xy / √(SS_xx × SS_yy) (p.29-30, p.40).
 * - r is printed with 4 decimals like the hand working on p.40 (0.9037), and the direction and strength words
 *   are read from that printed r, so the words always match the number on the screen.
 * - Strength on |r| (p.32): strong ≥ 0.8, moderate to strong 0.5 to < 0.8, moderate 0.3 to < 0.5, weak < 0.3.
 * - Sentences follow the instructor's templates (M5 practice solutions): "There appears to be a <strength>
 *   <direction> linear association between <y> and <x>.", "As <x> increases, <y> tends to increase.", and r in
 *   standard-deviation units "... is estimated to be |r| standard deviation above the mean, on average."
 * - r has no unit (p.27-28): the points keep the config's units, and the change-of-units demo multiplies x by a
 *   factor only for what is shown, so going back to factor 1 gives the original numbers again.
 * 课程约定：
 * - r = Σ z_x z_y / (n − 1)，其中 z_x = (x − x̄) / s_x，z_y = (y − ȳ) / s_y，两个标准差都除以 n − 1（第 42-43 页）。
 *   同一个 r 也等于 S_xy / (s_x s_y) = SS_xy / √(SS_xx × SS_yy)（第 29-30、40 页）。
 * - r 与第 40 页的手算一样保留 4 位小数（0.9037）；方向和强度用显示出来的 r 判断，文字与屏幕上的数字始终一致。
 * - 按 |r| 判断强度（第 32 页）：≥ 0.8 强，0.5 到 < 0.8 中等到强，0.3 到 < 0.5 中等，< 0.3 弱。
 * - 句子沿用老师在练习答案中的模板：“There appears to be a <强度> <方向> linear association between <y> and <x>.”、
 *   “As <x> increases, <y> tends to increase.”，以及用标准差单位解释 r 的句子。
 * - r 没有单位（第 27-28 页）：数据点保持配置里的单位，换单位演示只在显示时把 x 乘以倍数，回到倍数 1 就是原来的数字。
 */
import { clamp, decimalsOf, niceExtent, toBi } from '../../machine-learning/shared/ml-math.js';
import {
  STAT_DIGITS, TIMES, formatFixed, formatOperand, formatResult, formatTerms, formatTrim, nameInSentence, relationSign,
  roundTo,
} from '../shared/stat-format.js';
import {
  correlation, correlationDirection, correlationStrength, finitePoints, sum,
} from '../shared/stats-math.js';

// The validator asks a config for 4-30 points (tools/validate_content.py, check_statistics_widget). The widget
// also keeps 3, so a learner can remove one point of a 4-point config; longer lists are cut to 30.
// 内容校验器要求配置有 4-30 个点（tools/validate_content.py 的 check_statistics_widget）。组件最少保留 3 个点，
// 这样 4 个点的配置也能删掉一个点；更长的列表截到 30 个。
export const MIN_POINTS = 3;
export const MAX_POINTS = 30;

// Coordinates, means, sums and standard deviations are written with up to 4 decimals; z-scores, their products
// and r with exactly 4, as in the course's check tables (z_x = −1.2649, z_x z_y = 1.0328, r = 0.9037).
// 坐标、平均数、平方和与标准差最多写 4 位小数；z 分数、乘积和 r 固定写 4 位，与课程核对表一致（−1.2649、1.0328、0.9037）。
export const DIGITS = Object.freeze({ value: 4, z: 4, r: STAT_DIGITS.r });

// Factors of the change-of-units demo: 2.54 turns inches into centimetres (M5 p.23-24), 60 turns minutes into
// seconds (the time example of p.27); 10 and 0.1 are plain rescalings.
// 换单位演示的倍数：2.54 把英寸换成厘米（第 5 单元第 23-24 页），60 把分钟换成秒（第 27 页的时间例子）；10 和 0.1 是单纯的缩放。
export const UNIT_FACTORS = Object.freeze([1, 2.54, 10, 0.1, 60]);

// M5 p.37: % drug amount (x) and reaction time in seconds (y) of five subjects; r = 7 / √60 = 0.9037 (p.40-43).
// 第 5 单元第 37 页：5 名受试者的药物含量百分比 (x) 与反应时间（秒）(y)；r = 7 / √60 = 0.9037（第 40-43 页）。
export const DEFAULT_POINTS = Object.freeze([[1, 1], [2, 1], [3, 2], [4, 2], [5, 4]]);

// Labels of the default data: the axis titles of the R plot on p.38 and the variable names of the p.39 sentence.
// 默认数据的标签：第 38 页 R 图的坐标轴标题，以及第 39 页句子里的变量名。
const DRUG_TEXT = Object.freeze({
  title: { zh: '药物含量与反应时间：散点图和相关系数 r', en: 'Drug amount and reaction time: scatterplot and correlation r' },
  xLabel: { zh: '药物含量（%）', en: '% Drug Amount' },
  yLabel: { zh: '反应时间（秒）', en: 'Reaction Time (in seconds)' },
  xName: { zh: '药物含量（%）', en: 'drug amount (in %)' },
  yName: { zh: '反应时间（秒）', en: 'reaction time (in seconds)' },
});

// Labels for a config that brings its own points but leaves a label out.
// 配置自带数据点、但没有写某个标签时使用的标签。
const GENERIC_TEXT = Object.freeze({
  title: { zh: '散点图和相关系数 r', en: 'Scatterplot and correlation r' },
  xLabel: { zh: '解释变量 x', en: 'Explanatory variable x' },
  yLabel: { zh: '响应变量 y', en: 'Response variable y' },
});

// The M5 p.32 scale, from the strongest level down; `label` is the slide's wording.
// 第 5 单元第 32 页的强度表，从强到弱；label 为课件原文。
export const STRENGTH_SCALE = Object.freeze([
  Object.freeze({ level: 'strong', word: { zh: '强', en: 'strong' }, label: { zh: '强相关', en: 'Strong correlations' }, rule: '|r| ≥ 0.8' }),
  Object.freeze({
    level: 'moderate-to-strong',
    word: { zh: '中等到强', en: 'moderate to strong' },
    label: { zh: '中等到强相关', en: 'Moderate to strong correlations' },
    rule: '0.5 ≤ |r| < 0.8',
  }),
  Object.freeze({ level: 'moderate', word: { zh: '中等', en: 'moderate' }, label: { zh: '中等相关', en: 'Moderate correlations' }, rule: '0.3 ≤ |r| < 0.5' }),
  Object.freeze({ level: 'weak', word: { zh: '弱', en: 'weak' }, label: { zh: '弱相关', en: 'Weak correlations' }, rule: '|r| < 0.3' }),
]);

const STRENGTH_BY_LEVEL = Object.fromEntries(STRENGTH_SCALE.map((item) => [item.level, item]));

// Direction words of M5 p.7 ("upward trend (positive direction)") and the verbs of the sentence templates.
// 方向用语来自第 5 单元第 7 页（“upward trend (positive direction)”），动词来自句子模板。
const DIRECTIONS = Object.freeze({
  positive: Object.freeze({
    word: { zh: '正', en: 'positive' },
    trend: { zh: '上升趋势', en: 'upward trend' },
    verb: { zh: '越大', en: 'increase' },
    side: { zh: '高', en: 'above' },
  }),
  negative: Object.freeze({
    word: { zh: '负', en: 'negative' },
    trend: { zh: '下降趋势', en: 'downward trend' },
    verb: { zh: '越小', en: 'decrease' },
    side: { zh: '低', en: 'below' },
  }),
});

// Where a point lies around (x̄, ȳ), named by the signs of z_x and z_y.
// 点相对 (x̄, ȳ) 的位置，由 z_x 和 z_y 的正负决定。
const QUADRANTS = Object.freeze({
  'upper-right': { zh: '右上方', en: 'above and to the right of' },
  'upper-left': { zh: '左上方', en: 'above and to the left of' },
  'lower-left': { zh: '左下方', en: 'below and to the left of' },
  'lower-right': { zh: '右下方', en: 'below and to the right of' },
});

// Share of the data range added on each side of the plot, so a point can be dragged a little past the data.
// 绘图范围在数据两侧各多留的比例，让点可以被拖到数据范围外一点。
const VIEW_PAD = 0.1;
// The curved demo has 2 × CURVE_HALF + 1 points on an upside-down U (M5 p.32, panel f).
// 弯曲图案演示在倒 U 形上放 2 × CURVE_HALF + 1 个点（第 5 单元第 32 页的图 f）。
const CURVE_HALF = 4;
// The outlier is placed this share of the x range to the right of the largest x.
// 离群值放在最大 x 右边、距离为 x 全距这个比例的位置。
const OUTLIER_REACH = 0.5;

// Arrow keys as steps in data space; "up" means a larger y, as on the plot.
// 方向键对应数据空间里的移动；“上”表示 y 变大，与图上一致。
const KEY_MOVES = Object.freeze({
  ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
});

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const isPositiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

function hasSpread(points, key) {
  return points.some((point) => point[key] !== points[0][key]);
}

/* ---------- Config 配置 ---------- */

// The forms a config can declare: "linear" (the default) or "curved", for data that bend like M5 p.10 and p.18.
// 配置可以声明的形状：linear（默认）或 curved（像第 5 单元第 10、18 页那样弯曲的数据）。
export const FORMS = Object.freeze(['linear', 'curved']);

// A variable name for the sentences: the given name, else the axis label as it reads inside a sentence
// ("Reaction Time (in seconds)" becomes "reaction time (in seconds)"), and the letter when both are empty.
// 句子里的变量名：优先用给定的名字，否则用坐标轴标签在句中的写法（“Reaction Time (in seconds)”写成
// “reaction time (in seconds)”）；都没有时用字母。
function nameFor(value, label, letter) {
  const derived = {
    zh: hasText(label.zh) ? label.zh.trim() : (hasText(label.en) ? label.en.trim() : letter),
    en: hasText(label.en) ? nameInSentence(label.en) : letter,
  };
  const given = toBi(value, derived);
  return { zh: hasText(given.zh) ? given.zh : derived.zh, en: hasText(given.en) ? given.en : derived.en };
}

function copyBi(value) {
  return { zh: value.zh, en: value.en };
}

/**
 * Reads a content config defensively: { title, xLabel, yLabel, xName, yName, form, points, usesDefaultData }.
 * Points may be [x, y] pairs or { x, y } objects (numeric strings count); at most MAX_POINTS are kept. With fewer
 * than MIN_POINTS usable points, or when every x (or every y) is the same, r could not be shown, so the widget
 * uses the drug example of M5 p.37 with its own labels instead. xName and yName (optional, as for
 * least-squares-line) name the variables inside sentences; by default they come from the axis labels. `form`
 * (optional) is "curved" for data whose scatterplot bends, so the sentences describe a nonlinear relationship
 * instead of a linear one; anything else is "linear".
 * 防御性读取内容配置，返回 { title, xLabel, yLabel, xName, yName, form, points, usesDefaultData }。数据点可写成 [x, y] 或
 * { x, y }（数字字符串也算），最多保留 MAX_POINTS 个。可用的点少于 MIN_POINTS 个、或所有 x（或所有 y）都相同时，
 * r 无法显示，组件改用第 5 单元第 37 页的药物例子及其标签。xName、yName（可选，与 least-squares-line 相同）是句子里的变量名，
 * 默认取自坐标轴标签。form（可选）为 "curved" 时表示散点图是弯曲的，句子改为描述非线性关系；其他值一律为 "linear"。
 */
export function normalizeScatterConfig(config) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const points = finitePoints(source.points).slice(0, MAX_POINTS);
  if (points.length < MIN_POINTS || !hasSpread(points, 'x') || !hasSpread(points, 'y')) {
    return {
      title: copyBi(DRUG_TEXT.title),
      xLabel: copyBi(DRUG_TEXT.xLabel),
      yLabel: copyBi(DRUG_TEXT.yLabel),
      xName: copyBi(DRUG_TEXT.xName),
      yName: copyBi(DRUG_TEXT.yName),
      form: 'linear',
      points: DEFAULT_POINTS.map(([x, y]) => ({ x, y })),
      usesDefaultData: true,
    };
  }
  const xLabel = toBi(source.xLabel, GENERIC_TEXT.xLabel);
  const yLabel = toBi(source.yLabel, GENERIC_TEXT.yLabel);
  return {
    title: toBi(source.title, GENERIC_TEXT.title),
    xLabel,
    yLabel,
    xName: nameFor(source.xName, xLabel, 'x'),
    yName: nameFor(source.yName, yLabel, 'y'),
    form: FORMS.includes(source.form) ? source.form : 'linear',
    points,
    usesDefaultData: false,
  };
}

/** One of UNIT_FACTORS (a select's string value is read too); anything else is 1. 换单位的倍数；其他值一律为 1。 */
export function normalizeFactor(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return UNIT_FACTORS.includes(number) ? number : 1;
}

/* ---------- Numbers 数字 ---------- */

/** r with 4 decimals and a real minus sign, or "—" when it cannot be computed. r 保留 4 位小数；无法计算时为“—”。 */
export function formatR(value) {
  return formatFixed(value, DIGITS.r);
}

/** "r ≈ 0.9037", "r = 1.0000", or "r = —" when r cannot be computed. r 的完整写法。 */
export function rText(analysis) {
  return analysis?.defined ? `r ${relationSign(analysis.r, DIGITS.r)} ${formatR(analysis.r)}` : 'r = —';
}

/**
 * A value for an <input type="number">: an ASCII minus sign and at most 4 decimals ("-3", "7.62"), so the
 * field shows what the table shows.
 * 数字输入框里的值：用 ASCII 减号，最多 4 位小数（“-3”“7.62”），与表格显示的一致。
 */
export function inputValue(value) {
  return Number.isFinite(value) ? String(roundTo(value, DIGITS.value)) : '';
}

/** A coordinate as shown in the table and labels: up to 4 decimals. 表格和标签中的坐标：最多 4 位小数。 */
export function formatCoordinate(value) {
  return formatTrim(value, DIGITS.value);
}

/** A unit factor as written in the demo: 2.54, 0.1, 60. 换单位倍数的写法。 */
export function formatFactor(value) {
  return formatTrim(value, DIGITS.value);
}

/** A point in the units shown: x multiplied by the factor. 按显示单位表示的点：x 乘以倍数。 */
export function scalePoint(point, factor = 1) {
  return { x: point.x * factor, y: point.y };
}

/**
 * An x in the units shown, back in the config's units. The binary noise of the division (7.62 / 2.54 =
 * 3.0000000000000004) is removed by keeping 12 significant digits, which leaves very small or very large data intact.
 * 把按显示单位表示的 x 换回配置单位。保留 12 位有效数字，去掉除法产生的二进制误差（7.62 / 2.54 = 3.0000000000000004），
 * 很小或很大的数据也不受影响。
 */
export function unscaleX(value, factor = 1) {
  if (!isPositiveNumber(factor) || factor === 1) return value;
  return Number((value / factor).toPrecision(12));
}

/* ---------- Correlation 相关系数 ---------- */

/**
 * Everything the widget shows about r for the points, with x multiplied by `factor` (positive; anything else
 * counts as 1). Returns the shared correlation() result ({ xbar, ybar, sx, sy, ssxx, ssyy, ssxy, covariance,
 * sumZProducts, rows }) plus { n, factor, points (as shown), sumX, sumY, sumZx, sumZy, r, rShown (r rounded to
 * 4 decimals), defined, reason, direction, strength }. `reason` is null, "too-few", "same-x", "same-y" or
 * "out-of-range". A variable whose values are all the same has s = 0 exactly here (its z-scores are NaN), even
 * when binary noise in its mean would give a tiny positive s: all x equal to 0.1 has a mean of 0.10000000000000002.
 * "out-of-range" covers values so large or so small that the sums of squares overflow or vanish (1e200 squared is
 * Infinity), where the shared formula would print a wrong r instead of none.
 * 返回组件显示 r 所需的全部内容（x 先乘以 factor；factor 必须是正数，否则按 1 处理）：共享函数 correlation() 的结果，
 * 再加上 n、倍数、显示用的点、Σx、Σy、Σz_x、Σz_y、r、rShown（保留 4 位小数的 r）、能否计算、原因、方向与强度。
 * reason 为 null、"too-few"、"same-x"、"same-y" 或 "out-of-range"。一个变量的值全部相同时，这里的 s 严格为 0
 * （z 分数为 NaN），即使平均数的二进制误差会算出极小的正数 s：例如全是 0.1 的 x，平均数是 0.10000000000000002。
 * "out-of-range" 指数值大到平方和溢出、或小到平方和变成 0（1e200 的平方是 Infinity），这时共享公式会给出错误的 r，而不是没有 r。
 */
export function analyzeScatter(points, factor = 1) {
  const scale = isPositiveNumber(factor) ? factor : 1;
  const shown = finitePoints(points).map((point) => scalePoint(point, scale));
  const n = shown.length;
  const stats = correlation(shown);
  const xSpread = n > 1 && hasSpread(shown, 'x');
  const ySpread = n > 1 && hasSpread(shown, 'y');
  const representable = [stats.ssxx, stats.ssyy, stats.ssxy].every(Number.isFinite) && stats.ssxx > 0 && stats.ssyy > 0;
  let reason = null;
  if (n < 2) reason = 'too-few';
  else if (!xSpread) reason = 'same-x';
  else if (!ySpread) reason = 'same-y';
  else if (!representable || !Number.isFinite(stats.r)) reason = 'out-of-range';
  const defined = reason === null;
  const r = defined ? stats.r : NaN;
  const rShown = defined ? roundTo(r, DIGITS.r) : NaN;
  const zxKnown = xSpread && reason !== 'out-of-range';
  const zyKnown = ySpread && reason !== 'out-of-range';
  const rows = stats.rows.map((row) => ({
    ...row,
    zx: zxKnown ? row.zx : NaN,
    zy: zyKnown ? row.zy : NaN,
    zxzy: defined ? row.zxzy : NaN,
  }));
  const spread = (ok, value) => {
    if (n < 2) return NaN;
    return ok ? value : 0;
  };
  return {
    ...stats,
    n,
    factor: scale,
    points: shown,
    rows,
    sumX: sum(shown.map((point) => point.x)),
    sumY: sum(shown.map((point) => point.y)),
    ssxx: xSpread ? stats.ssxx : 0,
    ssyy: ySpread ? stats.ssyy : 0,
    ssxy: xSpread && ySpread ? stats.ssxy : 0,
    sx: spread(xSpread, stats.sx),
    sy: spread(ySpread, stats.sy),
    covariance: spread(xSpread && ySpread, stats.covariance),
    sumZx: zxKnown ? sum(rows.map((row) => row.zx)) : NaN,
    sumZy: zyKnown ? sum(rows.map((row) => row.zy)) : NaN,
    sumZProducts: defined ? stats.sumZProducts : NaN,
    r,
    rShown,
    defined,
    reason,
    direction: defined ? correlationDirection(rShown) : null,
    strength: defined ? correlationStrength(rShown) : null,
  };
}

/** "positive", "negative" or "zero" for a product as printed with 4 decimals; null when it is not a number. 乘积的正负。 */
export function productSign(value) {
  if (!Number.isFinite(value)) return null;
  const shown = roundTo(value, DIGITS.z);
  if (shown > 0) return 'positive';
  return shown < 0 ? 'negative' : 'zero';
}

/**
 * Why r cannot be computed, as { zh, en }, or null when it can.
 * r 无法计算的原因 { zh, en }；可以计算时为 null。
 */
export function reasonText(analysis) {
  if (!analysis || analysis.defined) return null;
  if (analysis.reason === 'same-x') {
    return {
      zh: '所有点的 x 都一样，所以 s_x = 0。z_x = (x − x̄) / s_x 要除以 0，算不出来，所以 r 也无法计算。把一个点左右移动一下试试。',
      en: 'Every x value is the same, so s_x = 0. Each z_x = (x − x̄) / s_x would divide by 0, so r cannot be computed. Move a point left or right.',
    };
  }
  if (analysis.reason === 'same-y') {
    return {
      zh: '所有点的 y 都一样，所以 s_y = 0。z_y = (y − ȳ) / s_y 要除以 0，算不出来，所以 r 也无法计算。把一个点上下移动一下试试。',
      en: 'Every y value is the same, so s_y = 0. Each z_y = (y − ȳ) / s_y would divide by 0, so r cannot be computed. Move a point up or down.',
    };
  }
  if (analysis.reason === 'out-of-range') {
    return {
      zh: '这些数太大或太小，超出了电脑能精确计算的范围，r 算不准。换一个单位，让数字大小普通一些。',
      en: 'The values are too large or too small to compute r reliably. Change the units so the numbers have an ordinary size.',
    };
  }
  return { zh: '至少需要 2 个点才能计算 r。', en: 'r needs at least 2 points.' };
}

/* ---------- Worked steps and the product table 解题步骤与乘积表 ---------- */

const writeValue = (value) => formatTrim(value, DIGITS.value);
const endValue = (value) => formatResult(value, DIGITS.value);
// Σ z_x z_y and r keep exactly 4 decimals, like the z columns of the table (9.3410, not 9.341).
// Σ z_x z_y 与 r 固定 4 位小数，与表格中的 z 列一致（写 9.3410，而不是 9.341）。
const writeZSum = (value) => formatFixed(value, DIGITS.z);
const endZSum = (value) => formatResult(value, DIGITS.z, { fixed: true });
const endR = (value) => formatResult(value, DIGITS.r, { fixed: true });

function clampIndex(index, count) {
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

// The three lines of one point's z-scores and their product (M5 p.42 handwriting: z_x = (x − x̄) / S_x).
// 一个点的 z 分数及其乘积的三行算式（第 5 单元第 42 页手写：z_x = (x − x̄) / S_x）。
function zLines(analysis, row) {
  return [
    `z_x = (x − x̄) / s_x = (${writeValue(row.x)} − ${formatOperand(analysis.xbar, DIGITS.value)}) / ${writeValue(analysis.sx)} ${formatResult(row.zx, DIGITS.z)}`,
    `z_y = (y − ȳ) / s_y = (${writeValue(row.y)} − ${formatOperand(analysis.ybar, DIGITS.value)}) / ${writeValue(analysis.sy)} ${formatResult(row.zy, DIGITS.z)}`,
    `z_x · z_y = ${formatOperand(row.zx, DIGITS.z)} ${TIMES} ${formatOperand(row.zy, DIGITS.z)} ${formatResult(row.zxzy, DIGITS.z)}`,
  ];
}

/**
 * The worked steps of r = Σ z_x z_y / (n − 1) with the numbers substituted (M5 p.40-43), as
 * [{ key, title: { zh, en }, lines: [formula], note? }]. Step 3 writes out the z-scores of point `focus`
 * (0-based; the first point when it is missing). The last step checks r with the covariance and SS form of
 * p.29-30. When r cannot be computed the list stops with the reason. Formulas use the notes' subscript notation
 * ("s_x", "S_xy"), which the widget draws as subscripts.
 * 代入数字后的 r = Σ z_x z_y / (n − 1) 解题步骤（第 5 单元第 40-43 页）：[{ key, title, lines, note? }]。第 3 步写出第 focus 个点
 * （从 0 开始；缺省时为第一个点）的 z 分数。最后一步用第 29-30 页的协方差与 SS 公式验算 r。r 无法计算时，步骤在原因处停止。
 * 公式沿用笔记的下标写法（“s_x”“S_xy”），组件把它们画成下标。
 */
export function correlationSteps(analysis, focus = 0) {
  const n = analysis.n;
  const steps = [
    {
      key: 'means',
      title: { zh: '第 1 步：求 x 和 y 的平均数', en: 'Step 1: the means of x and y' },
      lines: [
        `x̄ = Σx / n = ${writeValue(analysis.sumX)} / ${n} ${endValue(analysis.xbar)}`,
        `ȳ = Σy / n = ${writeValue(analysis.sumY)} / ${n} ${endValue(analysis.ybar)}`,
      ],
    },
    {
      key: 'sd',
      title: { zh: '第 2 步：求 x 和 y 的标准差（除以 n − 1）', en: 'Step 2: the standard deviations of x and y (divide by n − 1)' },
      lines: [
        `s_x = √(Σ(x − x̄)² / (n − 1)) = √(${writeValue(analysis.ssxx)} / ${n - 1}) ${endValue(analysis.sx)}`,
        `s_y = √(Σ(y − ȳ)² / (n − 1)) = √(${writeValue(analysis.ssyy)} / ${n - 1}) ${endValue(analysis.sy)}`,
      ],
    },
  ];
  if (!analysis.defined) {
    steps.push({
      key: 'stop',
      title: { zh: '第 3 步：算不下去了', en: 'Step 3: cannot continue' },
      lines: [],
      note: reasonText(analysis),
    });
    return steps;
  }
  const row = analysis.rows[clampIndex(focus, n)];
  const products = analysis.rows.map((item) => item.zxzy);
  steps.push(
    {
      key: 'z',
      title: {
        zh: `第 3 步：每个点的 z 分数和它们的乘积（这里写出点 ${row.index + 1}）`,
        en: `Step 3: each point's z-scores and their product (point ${row.index + 1} shown)`,
      },
      lines: zLines(analysis, row),
    },
    {
      key: 'sum',
      title: { zh: '第 4 步：把所有乘积加起来', en: 'Step 4: add up all the products' },
      lines: [`Σ z_x z_y = ${formatTerms(products, { digits: DIGITS.z })} ${endZSum(analysis.sumZProducts)}`],
    },
    {
      key: 'r',
      title: { zh: '第 5 步：除以 n − 1', en: 'Step 5: divide by n − 1' },
      lines: [`r = Σ z_x z_y / (n − 1) = ${writeZSum(analysis.sumZProducts)} / ${n - 1} ${endR(analysis.r)}`],
    },
    {
      key: 'check',
      title: { zh: '验算：协方差公式得到同一个 r（第 40 页）', en: 'Check: the covariance formula gives the same r (p.40)' },
      lines: [
        `S_xy = Σ(x − x̄)(y − ȳ) / (n − 1) = ${writeValue(analysis.ssxy)} / ${n - 1} ${endValue(analysis.covariance)}`,
        `r = S_xy / (s_x s_y) = SS_xy / √(SS_xx ${TIMES} SS_yy) = ${writeValue(analysis.ssxy)} / √(${writeValue(analysis.ssxx)} ${TIMES} ${writeValue(analysis.ssyy)}) ${endR(analysis.r)}`,
      ],
    },
  );
  return steps;
}

/**
 * The z-score product table as printed text: rows { index, number, x, y, zx, zy, product, sign } in data order,
 * the sums { zx, zy, product } (Σ z_x and Σ z_y are always 0, M5 practice Q2), and the last line
 * "3.6148 / 4 ≈ 0.9037" of r = Σ z_x z_y / (n − 1). Values that cannot be computed print "—".
 * 以文本形式给出 z 分数乘积表：按数据顺序的各行、各列之和（Σ z_x 与 Σ z_y 总是 0，见第 5 单元练习 Q2），
 * 以及 r = Σ z_x z_y / (n − 1) 的最后一行“3.6148 / 4 ≈ 0.9037”。无法计算的值显示“—”。
 */
export function productTable(analysis) {
  const z = (value) => formatFixed(value, DIGITS.z);
  return {
    rows: analysis.rows.map((row) => ({
      index: row.index,
      number: row.index + 1,
      x: formatCoordinate(row.x),
      y: formatCoordinate(row.y),
      zx: z(row.zx),
      zy: z(row.zy),
      product: z(row.zxzy),
      sign: productSign(row.zxzy),
    })),
    sums: { zx: z(analysis.sumZx), zy: z(analysis.sumZy), product: z(analysis.sumZProducts) },
    rLine: analysis.defined ? `${writeZSum(analysis.sumZProducts)} / ${analysis.n - 1} ${endR(analysis.r)}` : '—',
  };
}

/* ---------- Words and sentences 文字与句子 ---------- */

/** The M5 p.32 scale with the current level marked: [{ level, word, label, rule, active }]. 标出当前级别的强度表。 */
export function strengthRows(analysis) {
  return STRENGTH_SCALE.map((item) => ({ ...item, active: Boolean(analysis?.defined) && analysis.strength === item.level }));
}

/**
 * Direction and strength in the course's words, as short { zh, en } labels: { direction, strength }. r = 0 has
 * "no direction"; when r cannot be computed both are null.
 * 用课程用语给出方向与强度的简短标签 { direction, strength }。r = 0 时方向为“无方向”；r 无法计算时两者都是 null。
 */
export function associationWords(analysis) {
  if (!analysis?.defined) return { direction: null, strength: null };
  const direction = DIRECTIONS[analysis.direction];
  return {
    direction: direction
      ? { zh: `${direction.word.zh}向`, en: direction.word.en }
      : { zh: '无方向', en: 'no direction' },
    strength: { ...STRENGTH_BY_LEVEL[analysis.strength].word },
  };
}

// The sentences for data the config marks as curved (M5 p.10, p.18 and the 2025 midterm Q18: "Non-linear
// relationship", "increase in a curvilinear manner"). r measures linear association only (p.25), so neither its
// strength word nor the linear templates describe these data; the direction still follows the sign of r.
// 配置标为弯曲的数据所用的句子（第 5 单元第 10、18 页与 2025 年期中第 18 题：“Non-linear relationship”、
// “increase in a curvilinear manner”）。r 只衡量线性关系（第 25 页），所以它的强度用语和线性句型都不能描述这些数据；
// 方向仍然看 r 的正负。
function curvedDescription(analysis, x, y, sign, r) {
  const summary = {
    zh: `r ${sign} ${r}。这组数据的散点图是弯曲的（非线性，nonlinear）：r 只衡量线性关系（第 25 页），所以就算 |r| 很大，`
      + '也不能用 r 的强度来描述它。强弱要看点离那条曲线有多近。',
    en: `r ${sign} ${r}. The scatterplot of these data bends, so the form is nonlinear: r measures linear association only `
      + '(p.25), so even a large |r| does not describe this relationship. Judge the strength by how closely the points follow the curve.',
  };
  if (analysis.direction === 'none') {
    return {
      kind: 'curved',
      summary,
      sentences: [
        {
          en: `There appears to be a nonlinear (curved) relationship between ${y.en} and ${x.en}.`,
          zh: `${y.zh}和${x.zh}之间看起来有非线性（弯曲）的关系。`,
        },
        {
          en: `A low correlation does not necessarily imply that ${x.en} and ${y.en} are unrelated, only that they are not strongly linearly related.`,
          zh: `相关系数低，并不一定说明${x.zh}和${y.zh}没有关系，只说明它们之间没有很强的线性关系。`,
        },
      ],
    };
  }
  const direction = DIRECTIONS[analysis.direction];
  return {
    kind: 'curved',
    summary,
    sentences: [
      {
        en: `There appears to be a ${direction.word.en} nonlinear (curved) relationship between ${y.en} and ${x.en}.`,
        zh: `${y.zh}和${x.zh}之间看起来有${direction.word.zh}向的非线性（弯曲）关系。`,
      },
      {
        en: `As ${x.en} increases, ${y.en} tends to ${direction.verb.en} in a curvilinear manner.`,
        zh: `${x.zh}越大，${y.zh}往往${direction.verb.zh}，但不是沿着一条直线变化。`,
      },
      {
        en: 'r measures linear association only, so it should not be used to describe this relationship.',
        zh: 'r 只衡量线性关系，所以不能用 r 来描述这种弯曲的关系。',
      },
    ],
  };
}

/**
 * What r says, in the instructor's words: { kind, summary, sentences }. `kind` is "association", "none" (r rounds
 * to 0), "curved" (the config marks the data as curved) or "undefined". `summary` explains how direction and
 * strength were read from r; `sentences` are the exam sentences ({ en, zh }) with the variable names `xName` and
 * `yName` ({ zh, en }). With `form` "curved" the sentences describe a nonlinear relationship and leave r's strength
 * word out.
 * 用老师的说法解释 r：{ kind, summary, sentences }。kind 为 "association"、"none"（r 四舍五入后为 0）、"curved"（配置把数据标为弯曲）
 * 或 "undefined"。summary 说明怎样从 r 读出方向和强度；sentences 是考试句子（{ en, zh }），变量名取自 xName 与 yName。
 * form 为 "curved" 时，句子描述非线性关系，不用 r 的强度用语。
 */
export function describeAssociation(analysis, { xName, yName, form } = {}) {
  const x = { zh: xName?.zh || 'x', en: xName?.en || 'x' };
  const y = { zh: yName?.zh || 'y', en: yName?.en || 'y' };
  if (!analysis?.defined) return { kind: 'undefined', summary: reasonText(analysis), sentences: [] };
  const sign = relationSign(analysis.r, DIGITS.r);
  const r = formatR(analysis.rShown);
  const size = formatR(Math.abs(analysis.rShown));
  if (form === 'curved') return curvedDescription(analysis, x, y, sign, r);
  if (analysis.direction === 'none') {
    return {
      kind: 'none',
      summary: {
        zh: `r ${sign} ${r}，基本是 0：说明没有线性关系（第 31 页：r = 0 表示没有线性关系）。`,
        en: `r ${sign} ${r}, which is 0 to 4 decimals: there is no linear association (p.31).`,
      },
      sentences: [
        {
          en: `There appears to be no linear association between ${y.en} and ${x.en}.`,
          zh: `${y.zh}和${x.zh}之间看起来没有线性关系。`,
        },
        {
          en: `A low correlation does not necessarily imply that ${x.en} and ${y.en} are unrelated, only that they are not strongly linearly related.`,
          zh: `相关系数低，并不一定说明${x.zh}和${y.zh}没有关系，只说明它们之间没有很强的线性关系（可能是弯曲的关系）。`,
        },
      ],
    };
  }
  const direction = DIRECTIONS[analysis.direction];
  const strength = STRENGTH_BY_LEVEL[analysis.strength];
  return {
    kind: 'association',
    summary: {
      zh: `r ${sign} ${r}。方向：r 是${direction.word.zh}数，所以是${direction.word.zh}向（${direction.trend.zh}）。`
        + `强度：|r| = ${size}，满足 ${strength.rule}，按第 32 页的标准是“${strength.word.zh}”（${strength.word.en}）。`,
      en: `r ${sign} ${r}. Direction: ${direction.word.en} (${direction.trend.en}). `
        + `Strength: |r| = ${size} and ${strength.rule}, so it is ${strength.word.en} (p.32).`,
    },
    sentences: [
      {
        en: `There appears to be a ${strength.word.en} ${direction.word.en} linear association between ${y.en} and ${x.en}.`,
        zh: `${y.zh}和${x.zh}之间看起来有${strength.word.zh}的${direction.word.zh}向线性关系。`,
      },
      {
        en: `As ${x.en} increases, ${y.en} tends to ${direction.verb.en}.`,
        zh: `${x.zh}越大，${y.zh}往往${direction.verb.zh}。`,
      },
      {
        en: `If ${x.en} is 1 standard deviation above its mean, ${y.en} is estimated to be ${size} standard deviation ${direction.side.en} its mean, on average.`,
        zh: `如果${x.zh}比它的平均数高 1 个标准差，那么${y.zh}平均估计比它的平均数${direction.side.zh} ${size} 个标准差。`,
      },
    ],
  };
}

/**
 * The selected point's part in r: { number, values, sign, quadrant, text }. `values` is the one-line summary
 * "z_x ≈ …, z_y ≈ …, z_x · z_y ≈ …" and `text` ({ zh, en }) says on which side of (x̄, ȳ) the point lies and
 * whether its product raises or lowers Σ z_x z_y (M5 p.42). Null for an index that does not exist.
 * 选中的点对 r 的贡献：{ number, values, sign, quadrant, text }。values 是一行概括“z_x ≈ …, z_y ≈ …, z_x · z_y ≈ …”；
 * text 说明这个点在 (x̄, ȳ) 的哪一侧，以及它的乘积让 Σ z_x z_y 变大还是变小（第 5 单元第 42 页）。下标不存在时为 null。
 */
export function pointInsight(analysis, index) {
  const row = analysis?.rows?.[index];
  if (!row) return null;
  const number = index + 1;
  if (!analysis.defined) return { number, values: '', sign: null, quadrant: null, text: reasonText(analysis) };
  const values = `z_x ${formatResult(row.zx, DIGITS.z, { fixed: true })}, z_y ${formatResult(row.zy, DIGITS.z, { fixed: true })}, `
    + `z_x · z_y ${formatResult(row.zxzy, DIGITS.z, { fixed: true })}`;
  const sign = productSign(row.zxzy);
  if (sign === 'zero') {
    return {
      number,
      values,
      sign,
      quadrant: null,
      text: {
        zh: `点 ${number} 落在一条平均线上（z_x 或 z_y 是 0），乘积是 0，对 Σ z_x z_y 没有贡献。`,
        en: `Point ${number} sits on a mean line (z_x or z_y is 0), so its product is 0 and it adds nothing to Σ z_x z_y.`,
      },
    };
  }
  const right = row.zx > 0;
  const above = row.zy > 0;
  const quadrant = `${above ? 'upper' : 'lower'}-${right ? 'right' : 'left'}`;
  const place = QUADRANTS[quadrant];
  const text = sign === 'positive'
    ? {
      zh: `点 ${number} 在 (x̄, ȳ) 的${place.zh}：z_x 和 z_y 同号，乘积是正数，让 Σ z_x z_y 变大（r 往 +1 的方向走）。离中心越远，乘积越大。`,
      en: `Point ${number} lies ${place.en} (x̄, ȳ): z_x and z_y have the same sign, so the product is positive and adds to Σ z_x z_y. Points farther from the centre contribute more.`,
    }
    : {
      zh: `点 ${number} 在 (x̄, ȳ) 的${place.zh}：z_x 和 z_y 异号，乘积是负数，让 Σ z_x z_y 变小（r 往 −1 的方向走）。离中心越远，乘积越大。`,
      en: `Point ${number} lies ${place.en} (x̄, ȳ): z_x and z_y have opposite signs, so the product is negative and lowers Σ z_x z_y. Points farther from the centre contribute more.`,
    };
  return { number, values, sign, quadrant, text };
}

/**
 * Before and after multiplying every x by `factor` (M5 p.24, p.27-28): { factor, rows, text }. Each row
 * { key, symbol, name, original, converted, changed } compares x̄, s_x, the covariance S_xy, z_x of point `focus`
 * and r; x̄, s_x and S_xy are multiplied by the factor, z_x and r stay the same.
 * 每个 x 乘以 factor 前后的对比（第 5 单元第 24、27-28 页）：{ factor, rows, text }。每行比较 x̄、s_x、协方差 S_xy、
 * 第 focus 个点的 z_x 和 r：x̄、s_x、S_xy 都乘以倍数，z_x 和 r 不变。
 */
export function unitComparison(points, factor, focus = 0) {
  const scale = normalizeFactor(factor);
  const before = analyzeScatter(points, 1);
  const after = analyzeScatter(points, scale);
  const index = clampIndex(focus, before.n);
  const z = (value) => formatFixed(value, DIGITS.z);
  const rows = [
    { key: 'xbar', symbol: 'x̄', name: { zh: 'x 的平均数', en: 'mean of x' }, original: writeValue(before.xbar), converted: writeValue(after.xbar) },
    { key: 'sx', symbol: 's_x', name: { zh: 'x 的标准差', en: 'SD of x' }, original: writeValue(before.sx), converted: writeValue(after.sx) },
    {
      key: 'covariance', symbol: 'S_xy', name: { zh: '协方差', en: 'covariance' }, original: writeValue(before.covariance), converted: writeValue(after.covariance),
    },
    {
      key: 'zx',
      symbol: 'z_x',
      name: { zh: `点 ${index + 1} 的 z 分数`, en: `z-score of point ${index + 1}` },
      original: z(before.rows[index]?.zx),
      converted: z(after.rows[index]?.zx),
    },
    { key: 'r', symbol: 'r', name: { zh: '相关系数', en: 'correlation' }, original: formatR(before.r), converted: formatR(after.r) },
  ].map((row) => ({ ...row, changed: row.original !== row.converted }));
  const k = formatFactor(scale);
  let text;
  if (scale === 1) {
    text = {
      zh: '选一个倍数 k，比较换单位前后哪些数变了、哪些没变。',
      en: 'Pick a factor k and compare which numbers change and which stay the same.',
    };
  } else if (!after.defined) {
    text = reasonText(after);
  } else {
    text = {
      zh: `每个 x 都乘以 ${k}：x̄、s_x 和协方差 S_xy 也都乘以 ${k}，但每个 z_x 都没变，所以 r 还是 ${formatR(after.r)}。`
        + '协方差的大小跟着单位变；r 没有单位（r has no unit of measurement）。',
      en: `Every x is multiplied by ${k}: x̄, s_x and the covariance S_xy are multiplied by ${k} too, but every z_x stays the same, `
        + `so r is still ${formatR(after.r)}. The covariance depends on the units; r has no unit of measurement (p.27-28).`,
    };
  }
  return { factor: scale, rows, text };
}

/**
 * Status and screen-reader message after an action, as { zh, en }. `kind` is "move", "add", "remove", "outlier",
 * "curve", "reset", "units", "min", "max", "edge" or "invalid"; `before` and `after` are analyses, `point` is in
 * the units shown and `number` is 1-based. When r cannot be computed afterwards, the reason is added.
 * 操作之后的状态与读屏提示 { zh, en }。kind 为 "move"、"add"、"remove"、"outlier"、"curve"、"reset"、"units"、"min"、
 * "max"、"edge" 或 "invalid"；before、after 是分析结果，point 按显示单位，number 从 1 开始。操作后 r 无法计算时会补上原因。
 */
export function changeMessage(kind, {
  number, point, before, after, factor = 1,
} = {}) {
  const from = formatR(before?.r);
  const to = formatR(after?.r);
  const at = point ? `(${formatCoordinate(point.x)}, ${formatCoordinate(point.y)})` : '';
  const shift = { zh: `r：${from} → ${to}`, en: `r: ${from} → ${to}` };
  const now = rText(after);
  let message;
  switch (kind) {
    case 'move':
      message = { zh: `点 ${number} 移到 ${at}。${shift.zh}。`, en: `Point ${number} moved to ${at}. ${shift.en}.` };
      break;
    case 'add':
      message = {
        zh: `添加了点 ${number}，在 ${at}。${shift.zh}。拖动它或用方向键移动它。`,
        en: `Added point ${number} at ${at}. ${shift.en}. Drag it or move it with the arrow keys.`,
      };
      break;
    case 'remove':
      message = { zh: `删除了点 ${number}。${shift.zh}。`, en: `Removed point ${number}. ${shift.en}.` };
      break;
    case 'outlier':
      message = {
        zh: `加了一个离群值（outlier）：点 ${number}，在 ${at}。${shift.zh}。只多了一个极端的点，r 就变了很多。`,
        en: `Added an outlier, point ${number} at ${at}. ${shift.en}. One extreme point changed r a lot: r is sensitive to extreme outliers (p.28).`,
      };
      break;
    case 'curve':
      message = {
        zh: `换成了一个弯曲（倒 U 形）的图案：x 和 y 的关系很明显，但 ${now}。r 只衡量线性关系。`,
        en: `Loaded a curved (upside-down U) pattern: x and y are clearly related, but ${now}. r measures only linear association.`,
      };
      break;
    case 'reset':
      message = { zh: `已恢复原来的数据和单位。${now}。`, en: `Back to the original data and units. ${now}.` };
      break;
    case 'units':
      message = factor === 1
        ? { zh: `x 回到原来的单位。${now}，没有变。`, en: `x is back in its original units. ${now}, unchanged.` }
        : {
          zh: `每个 x 都乘以 ${formatFactor(factor)}：x̄、s_x 和 S_xy 都变了，但 ${now}，没有变。`,
          en: `Every x is multiplied by ${formatFactor(factor)}: x̄, s_x and S_xy change, but ${now}, unchanged.`,
        };
      break;
    case 'min':
      message = { zh: `至少要保留 ${MIN_POINTS} 个点，不能再删了。`, en: `At least ${MIN_POINTS} points must stay.` };
      break;
    case 'max':
      message = { zh: `最多 ${MAX_POINTS} 个点，不能再加了。`, en: `The plot holds at most ${MAX_POINTS} points.` };
      break;
    case 'edge':
      message = { zh: `点 ${number} 已经到图的边上了。`, en: `Point ${number} is already at the edge of the plot.` };
      break;
    default:
      message = { zh: '请输入一个数字。', en: 'Please enter a number.' };
  }
  const reason = after && !after.defined && kind !== 'min' && kind !== 'max' && kind !== 'invalid' ? reasonText(after) : null;
  return reason ? { zh: `${message.zh}${reason.zh}`, en: `${message.en} ${reason.en}` } : message;
}

/** Text alternative of one point for screen readers. 单个点的读屏文字。 */
export function pointDescription(analysis, index) {
  const row = analysis?.rows?.[index];
  if (!row) return '';
  const product = Number.isFinite(row.zxzy)
    ? `${relationSign(row.zxzy, DIGITS.z)} ${formatFixed(row.zxzy, DIGITS.z)}`
    : '= —';
  return `点 ${index + 1} Point ${index + 1}: x = ${formatCoordinate(row.x)}, y = ${formatCoordinate(row.y)}; `
    + `z 分数乘积 z-score product ${product}`;
}

/** Text alternative of the whole plot; `xLabel` and `yLabel` are plain strings. 整张散点图的读屏文字。 */
export function plotDescription(analysis, { xLabel = '', yLabel = '' } = {}) {
  let result = rText(analysis);
  if (analysis?.defined) {
    const words = associationWords(analysis);
    result += ` (${[words.strength, words.direction].map((word) => `${word.zh} ${word.en}`).join(', ')})`;
  }
  return `散点图 Scatterplot: ${analysis?.n ?? 0} 个点 points, ${result}. x: ${xLabel}; y: ${yLabel}.`;
}

/* ---------- Plot view and editing 绘图范围与编辑 ---------- */

// A tenth of the tick step: 0.1 for ticks every 1, 0.05 for every 0.5, 2 for every 20.
// 刻度间距的十分之一：每 1 一格时为 0.1，每 0.5 一格时为 0.05，每 20 一格时为 2。
function snapStep(step) {
  return roundTo(step / 10, decimalsOf(step) + 1);
}

/**
 * The plot window for the points, in the config's units: { x, y, snap: { x, y } }. x and y are axis extents
 * { min, max, step, ticks } with round ends and 10% room around the data (no forced 0, like R's plot()); `snap`
 * is the grid that dragged points land on and the arrow-key step.
 * 按配置单位给出的绘图窗口：{ x, y, snap: { x, y } }。x、y 是两端取整的坐标范围 { min, max, step, ticks }，
 * 数据两侧各留 10% 的空间（与 R 的 plot() 一样不强制从 0 开始）；snap 是拖动时点落在的网格，也是方向键的步长。
 */
export function fitView(points) {
  const clean = finitePoints(points);
  const options = { targetTicks: 6, padRatio: VIEW_PAD, anchorZero: false };
  const x = niceExtent(clean.map((point) => point.x), options);
  const y = niceExtent(clean.map((point) => point.y), options);
  return { x, y, snap: { x: snapStep(x.step), y: snapStep(y.step) } };
}

/** True when every point lies inside the view. 所有点都在绘图窗口内时为 true。 */
export function viewContains(view, points) {
  const inside = (value, extent) => value >= extent.min - 1e-9 * Math.max(1, Math.abs(extent.min))
    && value <= extent.max + 1e-9 * Math.max(1, Math.abs(extent.max));
  return finitePoints(points).every((point) => inside(point.x, view.x) && inside(point.y, view.y));
}

/**
 * An axis extent with every number multiplied by `factor`, for the x axis of the change-of-units demo: the grid
 * stays where it was and only the tick numbers change, so the picture is exactly the same (M5 p.24).
 * 把坐标范围的每个数乘以 factor，用于换单位演示的 x 轴：网格位置不变，只有刻度数字改变，所以图形完全一样（第 5 单元第 24 页）。
 */
export function scaleExtent(extent, factor = 1) {
  const scale = isPositiveNumber(factor) ? factor : 1;
  // Ticks are min + k × step, so they need at most the decimals of min or step, plus those of the factor.
  // 刻度是 min + k × step，所需小数位不超过 min 或 step 的小数位，再加上倍数的小数位。
  const digits = Math.min(10, Math.max(decimalsOf(extent.step), decimalsOf(extent.min)) + decimalsOf(scale));
  const times = (value) => roundTo(value * scale, digits);
  return { min: times(extent.min), max: times(extent.max), step: times(extent.step), ticks: extent.ticks.map(times) };
}

/** `value` on the grid of `step`: snapValue(2.37, 0.05) = 2.35. 把 value 吸附到步长 step 的网格上。 */
export function snapValue(value, step) {
  if (!isPositiveNumber(step)) return value;
  return roundTo(Math.round(value / step) * step, decimalsOf(step));
}

/** The point held inside the view. 把点限制在绘图窗口内。 */
export function clampToView(point, view) {
  return { x: clamp(point.x, view.x.min, view.x.max), y: clamp(point.y, view.y.min, view.y.max) };
}

/** Where a dragged point lands: on the snap grid and inside the view. 被拖动的点落下的位置：在网格上且在窗口内。 */
export function dragTarget(point, view) {
  return clampToView({ x: snapValue(point.x, view.snap.x), y: snapValue(point.y, view.snap.y) }, view);
}

/**
 * The point after an arrow key: one snap step (`large`: one tick step, for Shift) to the right, left, up or down,
 * kept inside the view. Null for any other key.
 * 按方向键之后的点：向右、左、上、下移动一个网格步长（large 时为一个刻度间距，对应 Shift），并保持在窗口内。其他按键返回 null。
 */
export function nudgePoint(point, key, view, { large = false } = {}) {
  const move = KEY_MOVES[key];
  if (!move) return null;
  const stepX = large ? view.x.step : view.snap.x;
  const stepY = large ? view.y.step : view.snap.y;
  const shift = (value, step, direction, extent) => roundTo(
    clamp(value + direction * step, extent.min, extent.max),
    Math.min(10, Math.max(decimalsOf(step), decimalsOf(value))),
  );
  return { x: shift(point.x, stepX, move[0], view.x), y: shift(point.y, stepY, move[1], view.y) };
}

// Grid offsets at Chebyshev distance `ring` from the centre, nearest first; ties keep the order "above, left,
// right, below", so the first spot after the centre is straight above it.
// 与中心的切比雪夫距离为 ring 的网格偏移，近的在前；距离相同时按“上、左、右、下”的顺序，所以中心之后第一个位置在正上方。
function ringOffsets(ring) {
  const offsets = [];
  for (let j = ring; j >= -ring; j -= 1) {
    for (let i = -ring; i <= ring; i += 1) {
      if (Math.max(Math.abs(i), Math.abs(j)) === ring) offsets.push([i, j]);
    }
  }
  return offsets.sort((a, b) => (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2));
}

/**
 * A free spot for a new point: the centre of the view, or the nearest spot around it, on a grid of half tick
 * steps, that no point already covers, so a new point is never hidden under an old one. Only when the whole
 * view is full does it fall back to the centre.
 * 新点的空位：窗口中心；中心被占用时，在半个刻度间距的网格上找离中心最近、还没有点的位置，新点不会被旧点挡住。
 * 只有整个窗口都满了才退回中心。
 */
export function placeNewPoint(points, view) {
  const clean = finitePoints(points);
  const centreX = (view.x.min + view.x.max) / 2;
  const centreY = (view.y.min + view.y.max) / 2;
  const halfX = view.x.step / 2;
  const halfY = view.y.step / 2;
  const covered = (spot) => clean.some((point) => Math.abs(point.x - spot.x) < halfX / 2 && Math.abs(point.y - spot.y) < halfY / 2);
  const inside = (spot) => spot.x >= view.x.min && spot.x <= view.x.max && spot.y >= view.y.min && spot.y <= view.y.max;
  const reach = Math.ceil(Math.max((view.x.max - view.x.min) / halfX, (view.y.max - view.y.min) / halfY) / 2);
  for (let ring = 0; ring <= reach; ring += 1) {
    for (const [i, j] of ringOffsets(ring)) {
      const spot = { x: snapValue(centreX + i * halfX, view.snap.x), y: snapValue(centreY + j * halfY, view.snap.y) };
      if (inside(spot) && !covered(spot)) return spot;
    }
  }
  return dragTarget({ x: centreX, y: centreY }, view);
}

/**
 * Where "add an outlier" puts its point, in the config's units: half the x range to the right of the largest x.
 * With a moderate or stronger trend (|r| ≥ 0.3) it goes against the trend (at the lowest y when r > 0, the
 * highest when r < 0), so r drops; with a weak or no trend it goes far up, so one point creates a positive r.
 * Drug data: (7, 1) takes r from 0.9037 to 0.2904.
 * “加一个离群值”放点的位置（配置单位）：最大 x 右边、x 全距一半处。趋势为中等或更强（|r| ≥ 0.3）时逆着趋势放
 * （r > 0 放在最低的 y，r < 0 放在最高的 y），r 会大幅下降；趋势弱或没有趋势时放到很高处，一个点就造出正的 r。
 * 药物数据：(7, 1) 让 r 从 0.9037 变成 0.2904。
 */
export function outlierPosition(points, view) {
  const clean = finitePoints(points);
  const xs = clean.map((point) => point.x);
  const ys = clean.map((point) => point.y);
  const maxX = xs.length ? Math.max(...xs) : view.x.max;
  const minY = ys.length ? Math.min(...ys) : view.y.min;
  const maxY = ys.length ? Math.max(...ys) : view.y.max;
  const spanX = xs.length ? maxX - Math.min(...xs) || view.x.step : view.x.step;
  const spanY = maxY - minY || view.y.step;
  const analysis = analyzeScatter(clean);
  let y = maxY + OUTLIER_REACH * spanY;
  if (analysis.defined && Math.abs(analysis.rShown) >= 0.3) y = analysis.rShown > 0 ? minY : maxY;
  return { x: snapValue(maxX + OUTLIER_REACH * spanX, view.snap.x), y: snapValue(y, view.snap.y) };
}

/**
 * Nine points on an upside-down U across the middle 80% of the view (M5 p.32, panel f). The pattern is symmetric,
 * so r = 0 although y clearly depends on x.
 * 在窗口中间 80% 的范围内画一个倒 U 形的 9 个点（第 5 单元第 32 页的图 f）。图形左右对称，所以虽然 y 明显随 x 变化，r 仍是 0。
 */
export function curvedPoints(view) {
  const middle = snapValue((view.x.min + view.x.max) / 2, view.snap.x);
  const gap = Math.max(view.snap.x, snapValue((view.x.max - view.x.min) / (2.5 * CURVE_HALF), view.snap.x));
  const spanY = view.y.max - view.y.min;
  const top = view.y.max - 0.15 * spanY;
  const bottom = view.y.min + 0.15 * spanY;
  const digits = decimalsOf(view.snap.x);
  const points = [];
  for (let k = -CURVE_HALF; k <= CURVE_HALF; k += 1) {
    points.push({
      x: roundTo(middle + k * gap, digits),
      y: snapValue(top - (top - bottom) * ((k * k) / (CURVE_HALF * CURVE_HALF)), view.snap.y),
    });
  }
  return points;
}

/** A copy of the points with point `index` replaced. 替换第 index 个点后的新数组。 */
export function replacePoint(points, index, point) {
  return points.map((item, position) => (position === index ? { x: point.x, y: point.y } : item));
}

/** The points with one more at the end, unless MAX_POINTS are already there. 末尾加一个点；已达上限时不变。 */
export function appendPoint(points, point) {
  return points.length >= MAX_POINTS ? points : [...points, { x: point.x, y: point.y }];
}

/** The points without point `index`, unless only MIN_POINTS are left. 删除第 index 个点；只剩下限个数时不变。 */
export function removePoint(points, index) {
  if (points.length <= MIN_POINTS || !Number.isInteger(index) || index < 0 || index >= points.length) return points;
  return points.filter((_, position) => position !== index);
}
