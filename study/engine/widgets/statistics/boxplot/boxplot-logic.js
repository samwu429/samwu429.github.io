/**
 * Logic of the "boxplot" widget (STA220 Module 4): reads the config and computes every number, construction step,
 * drawing stage and sentence the widget shows. DOM-free.
 * “箱线图”组件的逻辑（STA220 第 4 单元）：读取配置，计算组件显示的每一个数字、作图步骤、作图阶段和句子；不依赖 DOM。
 *
 * Course conventions (M4 p.5-24):
 * - Five-number summary Min, Q1, Median, Q3, Max. Q1 and Q3 come by hand (the median of each half; for an odd n the
 *   median is left out of both halves, the slides only show an even n) or as R prints them (quantile type 7), which
 *   the slides say may differ from the hand result (p.6).
 * - IQR = Q3 − Q1; inner fences Q1 − 1.5 × IQR and Q3 + 1.5 × IQR; outer fences Q1 − 3 × IQR and Q3 + 3 × IQR (p.12).
 *   Beyond an inner fence but not an outer one is a suspect outlier, beyond an outer fence a highly suspect outlier;
 *   a value exactly on a fence counts as inside (p.14 draws the whisker to "a value ≥ 108.75").
 * - Whiskers run from the box to the most extreme data values within the inner fences; values outside them are
 *   plotted individually as circles (p.8, p.14).
 * A group is raw data (4-200 values) or a given summary (R output) with optional whisker ends, outliers and n, the
 * two shapes study/tools/validate_content.py accepts. A group of a single observation (n = 1, like "Other" on M4
 * p.22-24) is left out of the comparisons, as on p.24.
 * 课程约定（第 4 单元第 5-24 页）：
 * - 五数概括：最小值、Q1、中位数、Q3、最大值。Q1 和 Q3 可以手算（每一半的中位数；n 为奇数时中位数不放进任何一半，
 *   课件只举了 n 为偶数的例子），也可以按 R 的输出（quantile type 7），课件说它可能和手算结果不同（第 6 页）。
 * - IQR = Q3 − Q1；内栅栏 Q1 − 1.5 × IQR 与 Q3 + 1.5 × IQR；外栅栏 Q1 − 3 × IQR 与 Q3 + 3 × IQR（第 12 页）。
 *   超出内栅栏但没有超出外栅栏是可疑离群值，超出外栅栏是高度可疑离群值；恰好等于栅栏的值算在栅栏以内
 *   （第 14 页把须线画到“≥ 108.75 的值”）。
 * - 须线从箱子画到内栅栏以内最极端的数据值；内栅栏以外的值用小圆圈单独画出（第 8、14 页）。
 * 每一组要么是原始数据（4-200 个数），要么是给定的五数概括（R 输出），可附带须线端点、离群值和 n，
 * 这正是 study/tools/validate_content.py 接受的两种写法。只有一个观测值的组（n = 1，例如第 4 单元第 22-24 页的“Other”）
 * 和第 24 页一样不参加比较。
 */
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { decimalsOf, niceExtent, toBi, toNumber } from '../../machine-learning/shared/ml-math.js';
import {
  MINUS, TIMES, formatOperand, formatTrim, nameInSentence, ordinal, relationSign,
} from '../shared/stat-format.js';
import {
  QUARTILE_METHODS, boxplotStats, fences, finiteNumbers, outlierLevel, quartiles,
} from '../shared/stats-math.js';

/**
 * Size limits, the same as the content validator's (content-spec section 5.4): 1-4 groups, raw data with 4-200 values.
 * The given outliers of a summary group are clamped as well.
 * 大小限制，与内容校验器一致（content-spec 第 5.4 节）：1-4 组，原始数据 4-200 个数。给定的离群值个数也有上限。
 */
export const BOXPLOT_LIMITS = Object.freeze({
  groups: 4,
  minValues: 4,
  maxValues: 200,
  maxGivenPoints: 200,
});

export const ORIENTATIONS = Object.freeze(['horizontal', 'vertical']);

// Names of the two quartile methods, shown on the method toggle and in the steps.
// 两种四分位数方法的名称，用于方法切换按钮和作图步骤。
export const METHOD_NAMES = Object.freeze({
  hand: Object.freeze({ zh: '手算：每一半的中位数', en: 'By hand: median of each half' }),
  r7: Object.freeze({ zh: 'R 的结果：summary()、favstats()', en: "R's output: summary(), favstats()" }),
});

// M3 p.5 and M4 p.6: calories of the 30 Tim Hortons donuts (2014), in the order R prints them. Shown when the
// config has no usable group.
// 第 3 单元第 5 页、第 4 单元第 6 页：30 个 Tim Hortons 甜甜圈（2014 年）的热量，按 R 打印的顺序。配置里没有可用的组时显示。
const DONUT_CALORIES = Object.freeze([
  180, 190, 190, 190, 210, 250, 290, 300, 210, 220, 250, 270, 270, 270, 280,
  280, 300, 340, 250, 200, 200, 210, 220, 230, 230, 250, 270, 270, 400, 310,
]);

const DEFAULT_EXAMPLE = Object.freeze({
  title: Object.freeze({ zh: 'Tim Hortons 甜甜圈的热量', en: 'Calories in Tim Hortons donuts' }),
  variable: Object.freeze({ zh: '热量', en: 'Calories' }),
  unit: 'kcal',
  groups: Object.freeze([{ name: { zh: '30 个甜甜圈', en: 'All 30 donuts' }, data: DONUT_CALORIES }]),
});

const DEFAULT_TITLE = Object.freeze({ zh: '箱线图', en: 'Boxplot' });
const DEFAULT_VARIABLE = Object.freeze({ zh: '数值', en: 'Value' });
const SUMMARY_KEYS = Object.freeze(['min', 'q1', 'median', 'q3', 'max']);

// Results print with the data's own decimals plus three: R's quartiles add up to two decimals and 1.5 × IQR one
// more, so every fence is written exactly (101.25, 108.75, 2.925). Data shown with more decimals are rare.
// 结果的小数位数 = 数据本身的小数位数 + 3：R 的四分位数最多多出两位，1.5 × IQR 再多一位，所以每个栅栏都能精确写出
// （101.25、108.75、2.925）。小数更多的数据很少见。
const MAX_DATA_DIGITS = 3;
const MAX_RESULT_DIGITS = 6;
const SAME = 1e-9;
// Short lists in sentences; longer ones end with "and 5 more".
// 句子里的列表最多写出这么多个，更多时以“等”结尾。
const LIST_LIMIT = 8;
// Template sentences written out for at most this many outliers in the classification step.
// 判断离群值的步骤中，最多为这么多个点写出模板句。
const SENTENCE_LIMIT = 4;

// Currency signs go before the number ($250); a percent sign follows it directly (5.2%); other units follow a space.
// 货币符号写在数字前面（$250）；百分号紧跟数字（5.2%）；其他单位前面空一格。
const PREFIX_UNITS = new Set(['$', '€', '£', '¥', 'US$', 'C$', 'CA$']);

const sameValue = (a, b) => Math.abs(a - b) <= SAME * Math.max(1, Math.abs(a), Math.abs(b));

function clampIndex(value, length) {
  const index = Math.round(Number(value));
  if (!Number.isFinite(index)) return length - 1;
  return Math.min(length - 1, Math.max(0, index));
}

function joinEn(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function joinZh(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join('、')}和${items[items.length - 1]}`;
}

function listEn(items) {
  if (items.length > LIST_LIMIT) return `${items.slice(0, LIST_LIMIT).join(', ')} and ${items.length - LIST_LIMIT} more`;
  return joinEn(items);
}

function listZh(items) {
  if (items.length > LIST_LIMIT) return `${items.slice(0, LIST_LIMIT).join('、')}等 ${items.length} 个`;
  return items.join('、');
}

function capitalize(text) {
  const chars = Array.from(text);
  return chars.length ? `${chars[0].toUpperCase()}${chars.slice(1).join('')}` : text;
}

/* ---------- Reading the config 读取配置 ---------- */

// The unit is kept whole, as the validator accepts any string; the chart never prints it, only HTML text does.
// 单位原样完整保留（校验器接受任何字符串）；图里不印单位，只有会换行的 HTML 文字里才有。
function readUnit(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// The five numbers of a given summary, or null unless all five are numbers with Min ≤ Q1 ≤ Median ≤ Q3 ≤ Max.
// 给定五数概括的五个数；五个数不全是数字或者不满足 Min ≤ Q1 ≤ 中位数 ≤ Q3 ≤ Max 时返回 null。
function readSummary(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const numbers = SUMMARY_KEYS.map((key) => toNumber(raw[key]));
  if (numbers.some((value) => value === null)) return null;
  if (numbers.some((value, index) => index > 0 && value < numbers[index - 1])) return null;
  return Object.fromEntries(SUMMARY_KEYS.map((key, index) => [key, numbers[index]]));
}

// Given whisker ends [low, high], kept only when Min ≤ low ≤ Q1 and Q3 ≤ high ≤ Max, as the validator checks.
// 给定的须线端点 [low, high]；只有满足 Min ≤ low ≤ Q1 且 Q3 ≤ high ≤ Max（与校验器相同）时才保留。
function readWhiskers(raw, summary) {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const low = toNumber(raw[0]);
  const high = toNumber(raw[1]);
  if (low === null || high === null) return null;
  if (low < summary.min || low > summary.q1 || high < summary.q3 || high > summary.max) return null;
  return [low, high];
}

// The number of observations behind a given summary (favstats prints it as n), or null. A whole number from 1 is
// kept; n = 1 with Min below Max cannot be, so it is dropped.
// 给定五数概括背后的观测个数（favstats 输出中的 n），没有时为 null。保留从 1 起的整数；n = 1 而最小值小于最大值是不可能的，丢弃。
function readCount(raw, summary) {
  const n = toNumber(raw);
  if (n === null || !Number.isInteger(n) || n < 1) return null;
  return n === 1 && !sameValue(summary.min, summary.max) ? null : n;
}

// One group of the config: raw data when it has at least 4 numbers (the first 200 are kept), otherwise a valid
// summary (with an optional n), otherwise nothing. Raw data wins when both are given, as in the validator.
// 配置中的一组：至少有 4 个数时按原始数据读取（最多保留前 200 个），否则读取有效的五数概括（可附带 n），都没有则跳过。
// 两者都给出时以原始数据为准，与校验器一致。
function readGroup(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = toBi(raw.name, { zh: `第 ${index + 1} 组`, en: `Group ${index + 1}` });
  const values = finiteNumbers(raw.data).slice(0, BOXPLOT_LIMITS.maxValues);
  if (values.length >= BOXPLOT_LIMITS.minValues) return { index, name, kind: 'data', values };
  const summary = readSummary(raw.summary);
  if (!summary) return null;
  return {
    index,
    name,
    kind: 'summary',
    summary,
    n: readCount(raw.n, summary),
    whiskers: readWhiskers(raw.whiskers, summary),
    outliers: finiteNumbers(raw.outliers).slice(0, BOXPLOT_LIMITS.maxGivenPoints).sort((a, b) => a - b),
  };
}

function readGroups(list) {
  if (!Array.isArray(list)) return [];
  const groups = [];
  for (const raw of list) {
    if (groups.length >= BOXPLOT_LIMITS.groups) break;
    const group = readGroup(raw, groups.length);
    if (group) groups.push(group);
  }
  return groups;
}

/**
 * Reads a content config defensively: { title, variable, unit, quartiles, groups, usedDefault }. Each group is
 * { index, name, kind: "data", values } or { index, name, kind: "summary", summary, n (the optional count of
 * observations, or null), whiskers ([low, high] or null), outliers }. Bad groups are skipped and at most 4 are kept;
 * without any usable group the M4 donut example is shown (usedDefault). `quartiles` is "hand" unless the config
 * says "r7".
 * 防御性读取内容配置。给定五数概括的组可以带 n（可选的观测个数，没有时为 null）。无效的组被跳过，最多保留 4 组；
 * 一组可用的都没有时显示第 4 单元的甜甜圈例子（usedDefault）。除非配置写了 "r7"，quartiles 都是 "hand"。
 */
export function normalizeBoxplotConfig(config) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const quartileMethod = QUARTILE_METHODS.includes(source.quartiles) ? source.quartiles : 'hand';
  const groups = readGroups(source.groups);
  if (!groups.length) {
    return {
      title: { ...DEFAULT_EXAMPLE.title },
      variable: { ...DEFAULT_EXAMPLE.variable },
      unit: DEFAULT_EXAMPLE.unit,
      quartiles: quartileMethod,
      groups: readGroups(DEFAULT_EXAMPLE.groups),
      usedDefault: true,
    };
  }
  return {
    title: toBi(source.title, DEFAULT_TITLE),
    variable: toBi(source.variable, DEFAULT_VARIABLE),
    unit: readUnit(source.unit),
    quartiles: quartileMethod,
    groups,
    usedDefault: false,
  };
}

/** True when at least one group has raw data, so the hand / R toggle matters. 至少有一组是原始数据时为真，此时手算 / R 的切换才有意义。 */
export function hasRawData(groups) {
  return Array.isArray(groups) && groups.some((group) => group?.kind === 'data');
}

/**
 * Starting orientation: one boxplot lies horizontally like M4 p.8-14, several stand side by side vertically like R's
 * ggplot output on M4 p.22.
 * 起始方向：一个箱线图横放（第 4 单元第 8-14 页），多个箱线图竖着并排（第 22 页 R 的 ggplot 输出）。
 */
export function defaultOrientation(groups) {
  return Array.isArray(groups) && groups.length > 1 ? 'vertical' : 'horizontal';
}

/* ---------- One group's boxplot 一组的箱线图 ---------- */

// Decimals that print every result of these numbers exactly (see MAX_DATA_DIGITS).
// 能把这些数的所有计算结果精确写出的小数位数（见 MAX_DATA_DIGITS）。
function resultDigits(numbers) {
  const decimals = numbers.filter(Number.isFinite).map((value) => decimalsOf(value));
  return Math.min(MAX_RESULT_DIGITS, Math.min(MAX_DATA_DIGITS, Math.max(0, ...decimals)) + 3);
}

function dataModel(group, method) {
  const stats = boxplotStats(group.values, method);
  const info = stats.quartiles;
  return {
    index: group.index,
    name: group.name,
    kind: 'data',
    method: stats.method,
    n: stats.n,
    values: group.values,
    sorted: info.sorted,
    quartiles: info,
    min: stats.min,
    q1: stats.q1,
    median: stats.median,
    q3: stats.q3,
    max: stats.max,
    iqr: stats.iqr,
    range: stats.max - stats.min,
    fences: stats.fences,
    whiskers: { lower: stats.whiskers.lower, upper: stats.whiskers.upper, lowerFrom: 'data', upperFrom: 'data' },
    points: stats.outliers.map(({ value, level, side }) => ({ value, level, side, source: 'data' })),
    digits: resultDigits(info.sorted),
  };
}

// A given summary: the fences come from its Q1 and Q3. Whisker ends are the given ones, otherwise Min or Max when
// they lie inside the inner fences, otherwise unknown. Plotted points are the given outliers, plus Min or Max when
// a whisker does not reach them.
// 给定的五数概括：栅栏由它的 Q1、Q3 算出。须线端点用题目给出的；没有给出时，Min 或 Max 在内栅栏以内就画到它，否则未知。
// 单独画出的点是题目给出的离群值，再加上须线够不到的 Min 或 Max。
function summaryModel(group) {
  const { min, q1, median, q3, max } = group.summary;
  const fenceSet = fences(q1, q3);
  const inside = (value) => outlierLevel(value, fenceSet) === 'none';
  let lower;
  let upper;
  let lowerFrom;
  let upperFrom;
  if (group.whiskers) {
    [lower, upper] = group.whiskers;
    lowerFrom = 'given';
    upperFrom = 'given';
  } else {
    lowerFrom = inside(min) ? 'min' : 'unknown';
    upperFrom = inside(max) ? 'max' : 'unknown';
    lower = lowerFrom === 'min' ? min : NaN;
    upper = upperFrom === 'max' ? max : NaN;
  }
  const entries = group.outliers.map((value) => ({ value, source: 'given' }));
  const missing = (value) => !entries.some((entry) => sameValue(entry.value, value));
  if ((lowerFrom === 'unknown' || min < lower) && missing(min)) entries.push({ value: min, source: 'min' });
  if ((upperFrom === 'unknown' || max > upper) && missing(max)) entries.push({ value: max, source: 'max' });
  entries.sort((a, b) => a.value - b.value);
  return {
    index: group.index,
    name: group.name,
    kind: 'summary',
    method: 'given',
    n: Number.isInteger(group.n) ? group.n : null,
    values: null,
    sorted: null,
    quartiles: null,
    min,
    q1,
    median,
    q3,
    max,
    iqr: fenceSet.iqr,
    range: max - min,
    fences: fenceSet,
    whiskers: { lower, upper, lowerFrom, upperFrom },
    points: entries.map(({ value, source }) => ({
      value, level: outlierLevel(value, fenceSet), side: value < median ? 'low' : 'high', source,
    })),
    digits: resultDigits([min, q1, median, q3, max, ...(group.whiskers || []), ...group.outliers]),
  };
}

/**
 * Everything one group's boxplot needs: { index, name, kind, method, n, values, sorted, quartiles (the shared
 * quartiles() result for raw data), min, q1, median, q3, max, iqr, range, fences, whiskers: { lower, upper, lowerFrom,
 * upperFrom }, points: [{ value, level, side, source }], digits }. `points` are the values plotted individually,
 * ascending; a whisker end that cannot be known from a summary is NaN with `lowerFrom` / `upperFrom` "unknown".
 * `n` is null for a summary that does not give it.
 * 一组箱线图所需的全部数据。points 是单独画出的值（由小到大）；只有五数概括、无法确定的须线端点为 NaN，来源标为 "unknown"。
 * 五数概括没有给出 n 时，n 为 null。
 */
export function groupModel(group, method = 'hand') {
  return group?.kind === 'summary' ? summaryModel(group) : dataModel(group, method);
}

/**
 * True when every observation of the group is the same value (Min = Max), like the single "Other" donut of M4
 * p.22-24: the box, the whiskers and the fences shrink to one line, so there is no spread to describe.
 * 这一组的每个观测值都相同（最小值 = 最大值）时为真，例如第 4 单元第 22-24 页唯一的“Other”甜甜圈：箱子、须线和栅栏都缩成一条线，
 * 没有离散程度可以描述。
 */
export function isSingleValued(model) {
  return Boolean(model) && sameValue(model.min, model.max);
}

/**
 * True when a group is left out of the comparison of medians, IQRs and ranges (M4 p.24: "except for the other
 * category"): it has a single observation (n = 1), or it is a summary with Min = Max whose n is not given, which
 * may be a single observation. Raw data always have n ≥ 4, so they always take part.
 * 这一组不参加中位数、IQR 和全距的比较时为真（第 4 单元第 24 页：“except for the other category”）：它只有一个观测值（n = 1），
 * 或者是没有给出 n、最小值 = 最大值的五数概括（可能只有一个观测值）。原始数据至少有 4 个值，所以总是参加比较。
 */
export function isSetAside(model) {
  if (!model) return false;
  return Number.isInteger(model.n) ? model.n < 2 : isSingleValued(model);
}

/** The models of all groups for one quartile method. 用一种四分位数方法算出所有组的模型。 */
export function buildModels(groups, method = 'hand') {
  return (Array.isArray(groups) ? groups : []).map((group) => groupModel(group, method));
}

/* ---------- Axis and drawing helpers 坐标轴与作图辅助 ---------- */

/**
 * Values the shared value axis must show: every group's five numbers, inner fences, whisker ends and plotted points.
 * Outer fences are left out, so they cannot squash the boxes; fenceMarks() says when one lies off the axis.
 * 共享数值轴必须显示的值：各组的五数概括、内栅栏、须线端点和单独画出的点。外栅栏不计入，避免把箱子压扁；
 * 外栅栏落在轴外时由 fenceMarks() 标明。
 */
export function axisValues(models) {
  const values = [];
  for (const model of Array.isArray(models) ? models : []) {
    values.push(
      model.min, model.max, model.q1, model.median, model.q3,
      model.fences.lowerInner, model.fences.upperInner,
      model.whiskers.lower, model.whiskers.upper,
      ...model.points.map((point) => point.value),
    );
  }
  return values.filter(Number.isFinite);
}

/**
 * The shared value axis { min, max, step, ticks }. It does not start at 0 unless the data reach it, because a
 * boxplot only needs the stretch the data and fences cover.
 * 共享数值轴 { min, max, step, ticks }。除非数据本身到达 0，否则不从 0 开始，因为箱线图只需要数据和栅栏覆盖的那一段。
 */
export function boxplotExtent(models, { targetTicks = 6 } = {}) {
  return niceExtent(axisValues(models), { targetTicks, padRatio: 0.04, anchorZero: false });
}

/**
 * The four fences of a group with where they are: [{ kind: "inner" | "outer", side: "low" | "high", value, inside }],
 * where `inside` says whether the value lies on the axis `extent`.
 * 一组的四条栅栏及其位置；inside 表示它是否落在数值轴 extent 的范围以内。
 */
export function fenceMarks(model, extent) {
  const slack = SAME * Math.max(1, Math.abs(extent?.max ?? 0), Math.abs(extent?.min ?? 0));
  const onAxis = (value) => Boolean(extent) && Number.isFinite(value)
    && value >= extent.min - slack && value <= extent.max + slack;
  const { lowerInner, upperInner, lowerOuter, upperOuter } = model.fences;
  return [
    { kind: 'inner', side: 'low', value: lowerInner, inside: onAxis(lowerInner) },
    { kind: 'inner', side: 'high', value: upperInner, inside: onAxis(upperInner) },
    { kind: 'outer', side: 'low', value: lowerOuter, inside: onAxis(lowerOuter) },
    { kind: 'outer', side: 'high', value: upperOuter, inside: onAxis(upperOuter) },
  ];
}

/**
 * Tied values stacked like a dotplot: [{ value, slot, count }] ascending, where `count` equal values get slots 0 to
 * count − 1, so two donuts of 400 calories show as two circles instead of one.
 * 像点图一样把相同的值堆叠起来：count 个相同的值依次占位 0 到 count − 1，例如两个 400 热量的甜甜圈画成两个圆圈而不是一个。
 */
export function dotStacks(values) {
  const sorted = finiteNumbers(values).sort((a, b) => a - b);
  const stacks = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start + 1;
    while (end < sorted.length && sameValue(sorted[end], sorted[start])) end += 1;
    for (let index = start; index < end; index += 1) stacks.push({ value: sorted[index], slot: index - start, count: end - start });
    start = end;
  }
  return stacks;
}

/**
 * Band position of group `index` on the category axis, where category p fills [p, p + 1]: vertical boxplots run
 * from left to right in config order, horizontal ones from top to bottom (the first group on top).
 * 第 index 组在类别轴上的位置（第 p 类占 [p, p + 1]）：竖放时按配置顺序从左到右，横放时从上到下（第一组在最上面）。
 */
export function bandPosition(index, count, orientation) {
  return orientation === 'vertical' ? index : count - 1 - index;
}

/** The group whose band contains `value` on the category axis, or −1. 类别轴上包含 value 的那一组，没有则为 −1。 */
export function groupAtBand(value, count, orientation) {
  if (!Number.isFinite(value) || !(count > 0) || value < 0 || value > count) return -1;
  const band = Math.min(count - 1, Math.floor(value));
  return orientation === 'vertical' ? band : count - 1 - band;
}

/* ---------- Text helpers 文本工具 ---------- */

/**
 * A number with its unit: "250 kcal", "$250", "−$5", "5.2%"; no unit leaves the number alone.
 * 带单位的数：“250 kcal”“$250”“−$5”“5.2%”；没有单位时只写数字。
 */
export function withUnit(text, unit) {
  const label = readUnit(unit);
  if (!label) return text;
  if (label === '%') return `${text}%`;
  if (PREFIX_UNITS.has(label)) return text.startsWith(MINUS) ? `${MINUS}${label}${text.slice(1)}` : `${label}${text}`;
  return `${text} ${label}`;
}

/** Title of the value axis: "热量（kcal）" / "Calories (kcal)". 数值轴的名称。 */
export function axisTitle(labels) {
  const unit = readUnit(labels?.unit);
  const zh = typeof labels?.variable?.zh === 'string' ? labels.variable.zh.trim() : '';
  const en = typeof labels?.variable?.en === 'string' ? labels.variable.en.trim() : '';
  return { zh: zh && unit ? `${zh}（${unit}）` : zh, en: en && unit ? `${en} (${unit})` : en };
}

// Number writers of one group: plain, as a later operand ("(−0.275)") and as the end of a step ("= 70").
// 一组的数字写法：普通写法、作为后面的运算数（“(−0.275)”）、作为一步计算的结尾（“= 70”）。
function textKit(model) {
  const digits = model.digits;
  const num = (value) => formatTrim(value, digits);
  return {
    num,
    op: (value) => formatOperand(value, digits),
    eq: (value) => `${relationSign(value, digits)} ${num(value)}`,
  };
}

function nameOf(model) {
  return { zh: model.name.zh || model.name.en, en: model.name.en || model.name.zh };
}

// Whisker ends as "180 – 340"; an end a summary cannot give is written as a word, { zh: "未知 – 340", en: "unknown – 340" }.
// 须线端点写成“180 – 340”；五数概括给不出的端点写成文字。
function whiskerText(model, kit) {
  const { lower, upper } = model.whiskers;
  if (Number.isFinite(lower) && Number.isFinite(upper)) return `${kit.num(lower)} – ${kit.num(upper)}`;
  const end = (value, word) => (Number.isFinite(value) ? kit.num(value) : word);
  return { zh: `${end(lower, '未知')} – ${end(upper, '未知')}`, en: `${end(lower, 'unknown')} – ${end(upper, 'unknown')}` };
}

// The variable for sentences; its English name reads as inside a sentence ("Calories" becomes "calories", while
// "GPA" and "R output" keep their capitals; shared nameInSentence).
// 句子里用的变量名；英文名按句中写法给出（“Calories”写成“calories”，“GPA”“R output”保持大写；共用的 nameInSentence）。
function variableOf(labels) {
  const zh = labels?.variable?.zh || labels?.variable?.en || DEFAULT_VARIABLE.zh;
  const en = labels?.variable?.en || labels?.variable?.zh || DEFAULT_VARIABLE.en;
  return { zh, en: nameInSentence(en) };
}

const teach = (zh, en) => ({ type: 'teach', zh, en });
const math = (text) => ({ type: 'math', text });
const extra = (zh, en) => ({ type: 'extra', zh: `补充（课件外）：${zh}`, en: `Not on the slides: ${en}` });

/* ---------- Construction steps 作图步骤 ---------- */

function sortStep(model) {
  return {
    id: 'sort',
    title: { zh: '从小到大排序', en: 'Sort the data' },
    lines: [teach(
      `把 n = ${model.n} 个数从小到大排好（R 里用 sort()）。在“排序后的数据”里，每个数前面的小数字是它的位置（第几个）。`,
      `Sort the n = ${model.n} values from smallest to largest (sort() in R). In the sorted data, the small number before each value is its position.`,
    )],
  };
}

function medianStep(model, kit) {
  const { n, sorted, median } = model;
  const rank = model.quartiles.medianRank;
  const [first, second] = model.quartiles.positions.median;
  const lines = [math(`Position = 0.5 ${TIMES} (n + 1) = 0.5 ${TIMES} (${n} + 1) = ${kit.num(rank)}`)];
  if (second === undefined) {
    lines.push(teach(
      `${kit.num(rank)} 是整数，所以中位数就是第 ${first} 个数。`,
      `${kit.num(rank)} is a whole number, so the median is the ${ordinal(first)} value.`,
    ));
    lines.push(math(`Median = ${ordinal(first)} value ${kit.eq(median)}`));
  } else {
    lines.push(teach(
      `${kit.num(rank)} 不是整数，所以取第 ${first} 个和第 ${second} 个数的平均。`,
      `${kit.num(rank)} is not a whole number, so average the ${ordinal(first)} and ${ordinal(second)} values.`,
    ));
    lines.push(math(`Median = (${kit.num(sorted[first - 1])} + ${kit.op(sorted[second - 1])}) / 2 ${kit.eq(median)}`));
  }
  return { id: 'median', title: { zh: '中位数', en: 'Median (Q2)' }, lines };
}

// "Q3 = 8th value of the upper half (23rd overall) = 280", or the average of two values for a half of even size.
// “Q3 = 后一半的第 8 个数（全体第 23 个）= 280”；一半的个数为偶数时写成两个数的平均。
function halfLine(label, halfName, half, kit) {
  const offset = half.from - 1;
  const [first, second] = half.positions;
  const overall = offset > 0
    ? ` (${ordinal(first + offset)}${second === undefined ? '' : ` and ${ordinal(second + offset)}`} overall)`
    : '';
  if (second === undefined) return `${label} = ${ordinal(first)} value of the ${halfName} half${overall} ${kit.eq(half.value)}`;
  return `${label} = average of the ${ordinal(first)} and ${ordinal(second)} values of the ${halfName} half${overall} `
    + `= (${kit.num(half.values[first - 1])} + ${kit.op(half.values[second - 1])}) / 2 ${kit.eq(half.value)}`;
}

// "Q1 = 8th value + 0.25 × (9th value − 8th value) = 210 + 0.25 × (210 − 210) = 210" (R's type 7).
// R 的 type 7：在第 ⌊h⌋ 个数和下一个数之间按比例取值。
function r7Line(label, rank, positions, value, sorted, kit) {
  const [base, next] = positions;
  if (next === undefined) return `${label} = ${ordinal(base)} value ${kit.eq(value)}`;
  const fraction = formatTrim(rank - base, 4);
  return `${label} = ${ordinal(base)} value + ${fraction} ${TIMES} (${ordinal(next)} value ${MINUS} ${ordinal(base)} value) `
    + `= ${kit.num(sorted[base - 1])} + ${fraction} ${TIMES} (${kit.num(sorted[next - 1])} ${MINUS} ${kit.op(sorted[base - 1])}) `
    + `${kit.eq(value)}`;
}

function otherMethodLine(model, kit) {
  const other = quartiles(model.values, model.method === 'r7' ? 'hand' : 'r7');
  const same = sameValue(other.q1, model.q1) && sameValue(other.q3, model.q3);
  const numbers = `Q1 = ${kit.num(other.q1)}，Q3 = ${kit.num(other.q3)}（IQR = ${kit.num(other.iqr)}）`;
  const numbersEn = `Q1 = ${kit.num(other.q1)}, Q3 = ${kit.num(other.q3)} (IQR = ${kit.num(other.iqr)})`;
  if (model.method === 'r7') {
    return same
      ? teach(`对照：手算（每一半的中位数）也得到 ${numbers}，这组数据两种方法一样。`, `For comparison, the hand method gives the same ${numbersEn} for these data.`)
      : teach(`对照：手算（每一半的中位数）得到 ${numbers}。两种方法的数字可以不一样。`, `For comparison, the hand method gives ${numbersEn}. The two methods can give different numbers.`);
  }
  return same
    ? teach(`对照：R 的 summary() 也给出 ${numbers}，这组数据两种方法一样。`, `For comparison, R's summary() gives the same ${numbersEn} for these data.`)
    : teach(`对照：R 的 summary() 给出 ${numbers}。两种方法的数字可以不一样。`, `For comparison, R's summary() gives ${numbersEn}. The two methods can give different numbers.`);
}

function handQuartileStep(model, kit) {
  const info = model.quartiles;
  const { lowerHalf, upperHalf } = info;
  const size = lowerHalf.values.length;
  const lines = [teach(
    `从中位数处把数据分成两半：前一半是第 ${lowerHalf.from}–${lowerHalf.to} 个数，后一半是第 ${upperHalf.from}–${upperHalf.to} 个数，每一半有 ${size} 个数。`,
    `Split the data at the median: the lower half is the ${ordinal(lowerHalf.from)} to ${ordinal(lowerHalf.to)} values and the upper half the ${ordinal(upperHalf.from)} to ${ordinal(upperHalf.to)} values (${size} values each).`,
  )];
  if (info.medianExcluded) {
    const middle = info.positions.median[0];
    lines.push(teach(
      `n = ${model.n} 是奇数：中位数（第 ${middle} 个数）不放进任何一半。课件只举了 n 为偶数的例子。`,
      `n = ${model.n} is odd: the median (the ${ordinal(middle)} value) is not included in either half. The slides only show an even n.`,
    ));
  }
  lines.push(teach(
    `每一半的中位数在这一半里的位置：0.5 × (${size} + 1) = ${kit.num(lowerHalf.rank)}。`,
    `Within each half, the median sits at position 0.5 × (${size} + 1) = ${kit.num(lowerHalf.rank)}.`,
  ));
  lines.push(math(halfLine('Q1', 'lower', lowerHalf, kit)));
  lines.push(math(halfLine('Q3', 'upper', upperHalf, kit)));
  if (info.medianExcluded) {
    lines.push(extra(
      'R 的 boxplot() 画箱子时，n 为奇数会把中位数同时放进两半，所以它画出的箱子边可能和这里略有不同。',
      "R's boxplot() puts the median in both halves when n is odd, so the box it draws can differ slightly from this one.",
    ));
  }
  lines.push(otherMethodLine(model, kit));
  return { id: 'quartiles', title: { zh: 'Q1 和 Q3（手算：每一半的中位数）', en: 'Q1 and Q3 by hand (median of each half)' }, lines };
}

function r7QuartileStep(model, kit) {
  const info = model.quartiles;
  const lines = [
    teach(
      '课程用 R 的输出（summary()、favstats()）得到 Q1、Q3。R 用另一种算法，所以它的数可能和手算的不一样（第 4 单元第 6 页）。',
      "The course gets Q1 and Q3 from R's output (summary(), favstats()). R uses a different algorithm, so its numbers can differ from a hand calculation (M4 p.6).",
    ),
    extra(
      'R 默认的规则（type 7，不用背）：第 p 个分位数在位置 h = (n − 1) × p + 1；h 不是整数时，就在相邻两个数之间按比例取值。',
      "R's default rule (type 7, not required): the p quantile sits at position h = (n − 1) × p + 1; when h is not a whole number, R goes that fraction of the way between the two neighbouring values.",
    ),
    math(`Q1 position: h = (${model.n} ${MINUS} 1) ${TIMES} 0.25 + 1 = ${formatTrim(info.ranks.q1, 4)}`),
    math(r7Line('Q1', info.ranks.q1, info.positions.q1, model.q1, model.sorted, kit)),
    math(`Q3 position: h = (${model.n} ${MINUS} 1) ${TIMES} 0.75 + 1 = ${formatTrim(info.ranks.q3, 4)}`),
    math(r7Line('Q3', info.ranks.q3, info.positions.q3, model.q3, model.sorted, kit)),
    otherMethodLine(model, kit),
  ];
  return { id: 'quartiles', title: { zh: 'Q1 和 Q3（R 的结果）', en: "Q1 and Q3 from R's output" }, lines };
}

function fiveLine(model, kit) {
  return math(`Min = ${kit.num(model.min)}, Q1 = ${kit.num(model.q1)}, Median = ${kit.num(model.median)}, Q3 = ${kit.num(model.q3)}, Max = ${kit.num(model.max)}`);
}

function fiveStep(model, kit) {
  return {
    id: 'five',
    title: { zh: '五数概括', en: 'Five-number summary' },
    lines: [
      fiveLine(model, kit),
      teach(
        '最小值 Min 和最大值 Max 是排好序后的第一个和最后一个数。箱子从 Q1 画到 Q3，箱子里的线是中位数。',
        'Min and Max are the first and the last sorted values. The box runs from Q1 to Q3, with a line at the median.',
      ),
    ],
  };
}

function givenStep(model, kit) {
  return {
    id: 'given',
    title: { zh: '五数概括（已给出）', en: 'Five-number summary (given)' },
    lines: [
      fiveLine(model, kit),
      teach(
        '这一组只给出了五数概括（比如 R 的 favstats() 输出），直接读出五个数，不用排序。箱子从 Q1 画到 Q3，箱子里的线是中位数。',
        "Only the five-number summary is given (for example R's favstats() output), so read the five numbers directly. The box runs from Q1 to Q3, with a line at the median.",
      ),
    ],
  };
}

function iqrStep(model, kit) {
  const lines = [
    math(`IQR = Q3 ${MINUS} Q1 = ${kit.num(model.q3)} ${MINUS} ${kit.op(model.q1)} ${kit.eq(model.iqr)}`),
    teach(
      `IQR 就是箱子的宽度：中间 50% 的数据落在 Q1 = ${kit.num(model.q1)} 和 Q3 = ${kit.num(model.q3)} 之间。`,
      `The IQR is the width of the box: the middle 50% of the data lie between Q1 = ${kit.num(model.q1)} and Q3 = ${kit.num(model.q3)}.`,
    ),
  ];
  if (isSingleValued(model)) {
    const value = kit.num(model.min);
    lines.push(teach(
      `最小值 = 最大值 = ${value}：每个观测值都一样，所以箱子、须线和栅栏都缩成 ${value} 处的一条线，没有离散程度可以描述。`,
      `Min = Max = ${value}: every observation is the same, so the box, the whiskers and the fences all shrink to one line at ${value}, and there is no spread to describe.`,
    ));
  }
  return { id: 'iqr', title: { zh: '四分位距', en: 'Interquartile range (IQR)' }, lines };
}

function innerStepStep(model, kit) {
  return {
    id: 'step',
    title: { zh: '1.5 倍的 IQR', en: '1.5 × IQR' },
    lines: [
      math(`1.5 ${TIMES} IQR = 1.5 ${TIMES} ${kit.op(model.iqr)} ${kit.eq(model.fences.innerStep)}`),
      teach('从箱子两端各往外量 1.5 × IQR，就到了内栅栏。', 'Measure 1.5 × IQR out from each end of the box to reach the inner fences.'),
    ],
  };
}

function innerFenceStep(model, kit) {
  const f = model.fences;
  const interval = `(${kit.num(f.lowerInner)}, ${kit.num(f.upperInner)})`;
  return {
    id: 'inner',
    title: { zh: '内栅栏', en: 'Inner fences' },
    lines: [
      math(`Lower inner fence = Q1 ${MINUS} 1.5 ${TIMES} IQR = ${kit.num(model.q1)} ${MINUS} ${kit.op(f.innerStep)} ${kit.eq(f.lowerInner)}`),
      math(`Upper inner fence = Q3 + 1.5 ${TIMES} IQR = ${kit.num(model.q3)} + ${kit.op(f.innerStep)} ${kit.eq(f.upperInner)}`),
      teach(
        `落在 ${interval} 之外的数是可疑离群值（**suspect outlier**），下一步再看它们是不是高度可疑。正好等于栅栏的数算在栅栏以内（第 4 单元第 14 页用的是 ≥ 和 ≤）。`,
        `Values outside ${interval} are suspect outliers; the next step checks whether they are highly suspect. A value exactly on a fence counts as inside (M4 p.14 uses ≥ and ≤).`,
      ),
    ],
  };
}

function outerFenceStep(model, kit) {
  const f = model.fences;
  const interval = `(${kit.num(f.lowerOuter)}, ${kit.num(f.upperOuter)})`;
  return {
    id: 'outer',
    title: { zh: '外栅栏', en: 'Outer fences' },
    lines: [
      math(`3 ${TIMES} IQR = 3 ${TIMES} ${kit.op(model.iqr)} ${kit.eq(f.outerStep)}`),
      math(`Lower outer fence = Q1 ${MINUS} 3 ${TIMES} IQR = ${kit.num(model.q1)} ${MINUS} ${kit.op(f.outerStep)} ${kit.eq(f.lowerOuter)}`),
      math(`Upper outer fence = Q3 + 3 ${TIMES} IQR = ${kit.num(model.q3)} + ${kit.op(f.outerStep)} ${kit.eq(f.upperOuter)}`),
      teach(
        `落在 ${interval} 之外的数是高度可疑离群值（**highly suspect outlier**）。`,
        `Values outside ${interval} are highly suspect outliers.`,
      ),
    ],
  };
}

// The instructor's sentence for one outlier (M4 practice Q2C): "9.3 is a suspect outlier since it is not above 11.125
// but it is between 8.725 and 11.125."
// 老师判断一个离群值时用的句子（第 4 单元练习 Q2C）。
function classifyLine(point, model, kit) {
  const f = model.fences;
  const v = kit.num(point.value);
  if (point.level === 'none') {
    return teach(
      `${v} 在给出的箱线图里被单独画出，但按这里的 Q1 和 Q3，它在内栅栏以内（画图时用的四分位数可能略有不同）。`,
      `${v} is plotted individually in the given boxplot, but with these Q1 and Q3 it is inside the inner fences (the plot may use slightly different quartiles).`,
    );
  }
  if (point.side === 'high') {
    return point.level === 'highly-suspect'
      ? teach(`${v} 是高度可疑离群值：它大于上外栅栏 ${kit.num(f.upperOuter)}。`, `${v} is a highly suspect outlier since it is above ${kit.num(f.upperOuter)} (the upper outer fence).`)
      : teach(
        `${v} 是可疑离群值：它大于上内栅栏 ${kit.num(f.upperInner)}，但没有超过上外栅栏 ${kit.num(f.upperOuter)}。`,
        `${v} is a suspect outlier since it is not above ${kit.num(f.upperOuter)} but it is between ${kit.num(f.upperInner)} and ${kit.num(f.upperOuter)}.`,
      );
  }
  return point.level === 'highly-suspect'
    ? teach(`${v} 是高度可疑离群值：它小于下外栅栏 ${kit.num(f.lowerOuter)}。`, `${v} is a highly suspect outlier since it is below ${kit.num(f.lowerOuter)} (the lower outer fence).`)
    : teach(
      `${v} 是可疑离群值：它小于下内栅栏 ${kit.num(f.lowerInner)}，但没有低于下外栅栏 ${kit.num(f.lowerOuter)}。`,
      `${v} is a suspect outlier since it is not below ${kit.num(f.lowerOuter)} but it is between ${kit.num(f.lowerOuter)} and ${kit.num(f.lowerInner)}.`,
    );
}

function outlierStep(model, kit) {
  const f = model.fences;
  const lines = [];
  const valuesAt = (level) => model.points.filter((point) => point.level === level).map((point) => kit.num(point.value));
  if (!model.points.length) {
    lines.push(teach(
      `没有数落在内栅栏 (${kit.num(f.lowerInner)}, ${kit.num(f.upperInner)}) 之外：没有离群值，也就没有要单独画的点。`,
      `No value lies outside the inner fences (${kit.num(f.lowerInner)}, ${kit.num(f.upperInner)}), so there are no outliers to plot individually.`,
    ));
  } else {
    const suspect = valuesAt('suspect');
    const highly = valuesAt('highly-suspect');
    lines.push(math(`Suspect outliers: ${suspect.length ? listEn(suspect) : 'none'}`));
    lines.push(math(`Highly suspect outliers: ${highly.length ? listEn(highly) : 'none'}`));
    model.points.slice(0, SENTENCE_LIMIT).forEach((point) => lines.push(classifyLine(point, model, kit)));
    const rest = model.points.length - SENTENCE_LIMIT;
    if (rest > 0) lines.push(teach(`其余 ${rest} 个点的判断方法相同。`, `The other ${rest} points are classified the same way.`));
  }
  if (model.kind === 'summary') {
    lines.push(teach(
      '只有五数概括时看不到全部数据：这里检查题目给出的点，以及最小值和最大值。',
      'With only a summary we cannot see every value, so we check the given points and the Min and Max.',
    ));
  }
  return { id: 'outliers', title: { zh: '找出离群值', en: 'Classify the outliers' }, lines };
}

function whiskerLine(side, model, kit) {
  const low = side === 'low';
  const f = model.fences;
  const fence = kit.num(low ? f.lowerInner : f.upperInner);
  const quartile = low ? `Q1 = ${kit.num(model.q1)}` : `Q3 = ${kit.num(model.q3)}`;
  const end = low ? model.whiskers.lower : model.whiskers.upper;
  const from = low ? model.whiskers.lowerFrom : model.whiskers.upperFrom;
  const extreme = kit.num(low ? model.min : model.max);
  const zhName = low ? '下须线' : '上须线';
  const enName = low ? 'Lower whisker' : 'Upper whisker';
  if (from === 'data') {
    return low
      ? teach(`下须线：从 ${quartile} 画到 ≥ ${fence} 的最小数据值，也就是 ${kit.num(end)}。`, `Lower whisker: from ${quartile} to the smallest value ≥ ${fence}, which is ${kit.num(end)}.`)
      : teach(`上须线：从 ${quartile} 画到 ≤ ${fence} 的最大数据值，也就是 ${kit.num(end)}。`, `Upper whisker: from ${quartile} to the largest value ≤ ${fence}, which is ${kit.num(end)}.`);
  }
  if (from === 'given') {
    return teach(`${zhName}：从 ${quartile} 画到题目给出的 ${kit.num(end)}。`, `${enName}: from ${quartile} to ${kit.num(end)} (given).`);
  }
  if (from === 'min' || from === 'max') {
    return low
      ? teach(`下须线：最小值 ${extreme} 没有低于下内栅栏 ${fence}，所以须线画到最小值 ${extreme}。`, `Lower whisker: Min = ${extreme} is not below the lower inner fence ${fence}, so the whisker goes to the Min, ${extreme}.`)
      : teach(`上须线：最大值 ${extreme} 没有超过上内栅栏 ${fence}，所以须线画到最大值 ${extreme}。`, `Upper whisker: Max = ${extreme} is not above the upper inner fence ${fence}, so the whisker goes to the Max, ${extreme}.`);
  }
  return low
    ? teach(
      `下须线：最小值 ${extreme} 低于下内栅栏 ${fence}，但题目没有给出 ≥ ${fence} 的最小数据值，所以这条须线的终点无法确定。`,
      `Lower whisker: Min = ${extreme} is below the lower inner fence ${fence}, and the smallest value ≥ ${fence} is not given, so this whisker end is unknown.`,
    )
    : teach(
      `上须线：最大值 ${extreme} 超过了上内栅栏 ${fence}，但题目没有给出 ≤ ${fence} 的最大数据值，所以这条须线的终点无法确定。`,
      `Upper whisker: Max = ${extreme} is above the upper inner fence ${fence}, and the largest value ≤ ${fence} is not given, so this whisker end is unknown.`,
    );
}

function whiskerStep(model, kit) {
  const lines = [
    teach(
      '须线从箱子画到内栅栏以内最极端的数据值，而不是画到栅栏本身。',
      'Each whisker connects the box to the most extreme data value within the inner fences, not to the fence itself.',
    ),
    whiskerLine('low', model, kit),
    whiskerLine('high', model, kit),
  ];
  const beyond = model.points.filter((point) => point.level !== 'none').map((point) => kit.num(point.value));
  if (beyond.length) {
    lines.push(teach(
      `${listZh(beyond)} 在内栅栏以外，不连在须线上，要单独画成小圆圈。`,
      `${listEn(beyond)} ${beyond.length === 1 ? 'is' : 'are'} beyond the inner fences, so ${beyond.length === 1 ? 'it is' : 'they are'} not on a whisker but plotted individually as ${beyond.length === 1 ? 'a circle' : 'circles'}.`,
    ));
  }
  return { id: 'whiskers', title: { zh: '须线', en: 'Whiskers' }, lines };
}

function drawStep(model) {
  const lines = [teach(
    '箱子从 Q1 画到 Q3，箱子里的线是中位数；两条须线画到上一步找到的值；离群值用小圆圈单独画出（R 的默认画法）。',
    "Draw the box from Q1 to Q3 with a line at the median, draw the whiskers to the values found above, and plot each outlier individually as a circle (R's default).",
  )];
  if (model.points.length) {
    lines.push(teach(
      '离群值不能直接删掉：先查它是不是录入错误；如果数据没错，就要解释它（第 4 单元第 11 页）。',
      'Do not simply remove outliers: first check for a wrong input; if the value is correct, explain it (M4 p.11).',
    ));
  }
  return { id: 'draw', title: { zh: '画出箱线图', en: 'Draw the boxplot' }, lines };
}

/**
 * The construction steps of one group in the order of M4 p.14, each { id, title: { zh, en }, lines }, where a line
 * is { type: "teach", zh, en }, { type: "math", text } (a formula with the numbers substituted) or { type: "extra",
 * zh, en } (beyond the slides, already prefixed). Raw data: sort, median, quartiles, five, iqr, step, inner, outer,
 * outliers, whiskers, draw. A given summary starts with "given" instead of the first four.
 * 一组的作图步骤，顺序与第 4 单元第 14 页一致。每一行是讲解（teach）、代入数字的算式（math）或课件外补充（extra，已加前缀）。
 * 原始数据从排序开始；给定五数概括的组用 "given" 代替前四步。
 */
export function constructionSteps(model) {
  if (!model) return [];
  const kit = textKit(model);
  const opening = model.kind === 'data'
    ? [sortStep(model), medianStep(model, kit), model.method === 'r7' ? r7QuartileStep(model, kit) : handQuartileStep(model, kit), fiveStep(model, kit)]
    : [givenStep(model, kit)];
  return [
    ...opening,
    iqrStep(model, kit),
    innerStepStep(model, kit),
    innerFenceStep(model, kit),
    outerFenceStep(model, kit),
    outlierStep(model, kit),
    whiskerStep(model, kit),
    drawStep(model),
  ];
}

/* ---------- Drawing stages 作图阶段 ---------- */

const PART_NAMES = Object.freeze([
  'dots', 'median', 'quartileLines', 'minmax', 'box', 'iqrBracket', 'stepBrackets', 'innerFences', 'outerFences',
  'points', 'whiskers',
]);

// What each step adds to the drawing. "keep" parts stay for the later steps, "flash" parts show only on their own step.
// 每一步给图加上什么：keep 的部分在后面的步骤中一直保留，flash 的部分只在这一步显示。
const STEP_PARTS = Object.freeze({
  sort: { keep: ['dots'] },
  median: { keep: ['median'] },
  quartiles: { keep: ['quartileLines'] },
  five: { keep: ['minmax', 'box'] },
  given: { keep: ['minmax', 'box', 'median'] },
  iqr: { flash: ['iqrBracket'] },
  step: { flash: ['stepBrackets'] },
  inner: { keep: ['innerFences'] },
  outer: { keep: ['outerFences'] },
  outliers: { keep: ['points'] },
  whiskers: { keep: ['whiskers'] },
});

/** The finished boxplot as R draws it: box, median, whiskers and the outliers as circles. 画好的箱线图（与 R 一样）。 */
export const FINISHED_PARTS = Object.freeze(Object.fromEntries(PART_NAMES.map((name) => [
  name, ['box', 'median', 'whiskers', 'points'].includes(name),
])));

/**
 * Which parts of the selected group are drawn at step `stage` (0-based): { dots, median, quartileLines, minmax, box,
 * iqrBracket, stepBrackets, innerFences, outerFences, points, whiskers }. The last step ("draw") is the clean
 * finished boxplot, without the helper marks; an out-of-range stage counts as the last one.
 * 选中的组在第 stage 步（从 0 开始）画出哪些部分。最后一步（"draw"）是干净的完整箱线图，不带辅助标记；超出范围的 stage 按最后一步处理。
 */
export function partsAt(steps, stage) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return { ...FINISHED_PARTS };
  const current = clampIndex(stage, list.length);
  if (list[current].id === 'draw') return { ...FINISHED_PARTS };
  const parts = Object.fromEntries(PART_NAMES.map((name) => [name, false]));
  list.slice(0, current + 1).forEach((step, index) => {
    const rule = STEP_PARTS[step.id] || {};
    (rule.keep || []).forEach((name) => { parts[name] = true; });
    if (index === current) (rule.flash || []).forEach((name) => { parts[name] = true; });
  });
  return parts;
}

/**
 * The stage to show after the steps were rebuilt (another group or quartile method): the same step when the new
 * list has it, otherwise the finished boxplot.
 * 步骤重建以后（换了组或四分位数方法）显示的阶段：新步骤里有同一步就停在那一步，否则显示完整的箱线图。
 */
export function stageAfterChange(previousSteps, stage, nextSteps) {
  const next = Array.isArray(nextSteps) ? nextSteps : [];
  if (!next.length) return 0;
  const previous = Array.isArray(previousSteps) ? previousSteps : [];
  const id = previous.length ? previous[clampIndex(stage, previous.length)].id : null;
  const index = next.findIndex((step) => step.id === id);
  return index >= 0 ? index : next.length - 1;
}

/**
 * The step at `stage` for the status line: { number, total, title, detail, zh, en }, where `detail` is the step's
 * first formula ("1.5 × IQR = 1.5 × 70 = 105") or "".
 * 状态行显示的当前步骤；detail 是这一步的第一条算式，没有算式时为空字符串。
 */
export function stepStatus(steps, stage) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return null;
  const index = clampIndex(stage, list.length);
  const step = list[index];
  return {
    number: index + 1,
    total: list.length,
    title: step.title,
    detail: step.lines.find((line) => line.type === 'math')?.text ?? '',
    zh: `第 ${index + 1} 步（共 ${list.length} 步）：${step.title.zh}`,
    en: `Step ${index + 1} of ${list.length}: ${step.title.en}`,
  };
}

const READOUT_ORDER = Object.freeze([
  'n', 'min', 'q1', 'median', 'q3', 'max', 'iqr', 'innerStep', 'innerFences', 'outerFences', 'suspect', 'highly', 'whiskers',
]);

// The numbers each step has found so far, shown under the chart.
// 每一步找出的数，显示在图的下方。
const STEP_READOUT = Object.freeze({
  sort: ['n'],
  median: ['median'],
  quartiles: ['q1', 'q3'],
  five: ['min', 'q1', 'median', 'q3', 'max'],
  given: ['min', 'q1', 'median', 'q3', 'max'],
  iqr: ['iqr'],
  step: ['innerStep'],
  inner: ['innerFences'],
  outer: ['outerFences'],
  outliers: ['suspect', 'highly'],
  whiskers: ['whiskers'],
});

/**
 * The numbers found up to step `stage`, in a fixed order: [{ id, label: { zh, en }, value, note }], where `value` is
 * a string or a { zh, en } word ("none") and `note` flags an outer fence that lies off the value axis `extent`.
 * 到第 stage 步为止已经找出的数，按固定顺序排列。value 是字符串或双语词（如“无 none”）；note 标出落在数值轴以外的外栅栏。
 */
export function readoutAt(model, steps, stage, extent) {
  const list = Array.isArray(steps) ? steps : [];
  if (!model || !list.length) return [];
  const kit = textKit(model);
  const found = new Set();
  list.slice(0, clampIndex(stage, list.length) + 1).forEach((step) => (STEP_READOUT[step.id] || []).forEach((id) => found.add(id)));
  const f = model.fences;
  const none = { zh: '无', en: 'none' };
  const levelValues = (level) => {
    const values = model.points.filter((point) => point.level === level).map((point) => kit.num(point.value));
    return values.length ? listEn(values) : none;
  };
  const offAxis = extent ? fenceMarks(model, extent).some((mark) => mark.kind === 'outer' && !mark.inside) : false;
  const items = {
    n: { label: { zh: '个数', en: 'n' }, value: String(model.n) },
    min: { label: { zh: '最小值', en: 'Min' }, value: kit.num(model.min) },
    q1: { label: { zh: '第一四分位数', en: 'Q1' }, value: kit.num(model.q1) },
    median: { label: { zh: '中位数', en: 'Median' }, value: kit.num(model.median) },
    q3: { label: { zh: '第三四分位数', en: 'Q3' }, value: kit.num(model.q3) },
    max: { label: { zh: '最大值', en: 'Max' }, value: kit.num(model.max) },
    iqr: { label: { zh: '四分位距', en: 'IQR' }, value: kit.num(model.iqr) },
    innerStep: { label: { zh: '', en: `1.5 ${TIMES} IQR` }, value: kit.num(f.innerStep) },
    innerFences: { label: { zh: '内栅栏', en: 'Inner fences' }, value: `${kit.num(f.lowerInner)}, ${kit.num(f.upperInner)}` },
    outerFences: {
      label: { zh: '外栅栏', en: 'Outer fences' },
      value: `${kit.num(f.lowerOuter)}, ${kit.num(f.upperOuter)}`,
      note: offAxis ? { zh: '超出图的范围', en: 'beyond the axis' } : null,
    },
    suspect: { label: { zh: '可疑离群值', en: 'Suspect outliers' }, value: levelValues('suspect') },
    highly: { label: { zh: '高度可疑离群值', en: 'Highly suspect outliers' }, value: levelValues('highly-suspect') },
    whiskers: { label: { zh: '须线', en: 'Whiskers' }, value: whiskerText(model, kit) },
  };
  return READOUT_ORDER.filter((id) => found.has(id)).map((id) => ({ id, note: null, ...items[id] }));
}

/**
 * The sorted values of a raw-data group as chips: [{ position, value, text, half, marks, level, split }], where
 * `half` is "lower", "upper" or null (hand method), `marks` lists "q1", "median" and "q3" at the positions those
 * numbers use, `level` is the outlier level and `split` marks the first value of the upper half when n is even
 * (the red bar of M4 p.6). A summary group has no chips.
 * 原始数据排序后的小方块。half 为前一半、后一半或 null（手算方法）；marks 标出 Q1、中位数、Q3 用到的位置；
 * level 是离群级别；n 为偶数时 split 标出后一半的第一个数（第 4 单元第 6 页的红线）。给定五数概括的组没有小方块。
 */
export function sortedCells(model) {
  if (!model || model.kind !== 'data') return [];
  const info = model.quartiles;
  const kit = textKit(model);
  const holds = (list, position) => Array.isArray(list) && list.includes(position);
  const within = (half, position) => Boolean(half) && half.values.length > 0 && position >= half.from && position <= half.to;
  return info.sorted.map((value, index) => {
    const position = index + 1;
    let half = null;
    if (within(info.lowerHalf, position)) half = 'lower';
    else if (within(info.upperHalf, position)) half = 'upper';
    const marks = [];
    if (holds(info.positions.q1, position)) marks.push('q1');
    if (holds(info.positions.median, position)) marks.push('median');
    if (holds(info.positions.q3, position)) marks.push('q3');
    return {
      position,
      value,
      text: kit.num(value),
      half,
      marks,
      level: outlierLevel(value, model.fences),
      split: half === 'upper' && !info.medianExcluded && position === info.upperHalf.from,
    };
  });
}

/* ---------- Sentences 句子 ---------- */

// A group whose observations are all one value: the 50% and middle-50% templates would be false (no observation is
// more than the median), so one sentence says what there is.
// 所有观测值都是同一个值的组：50% 和中间 50% 的句型都不成立（没有观测值大于中位数），所以只用一句话说明实际情况。
function singleValueSentence(model, at, lead, name) {
  const value = at(model.min);
  const zhLead = lead ? `${name.zh}：` : '';
  const all = `Min, Q1, the median, Q3 and Max are all ${value}`;
  const allZh = `最小值、Q1、中位数、Q3 和最大值都是 ${value}`;
  if (model.n === 1) {
    return {
      id: 'single',
      en: `${lead ? `For ${name.en}, there` : 'There'} is only one observation, ${value}, so there is no spread to describe: ${all}.`,
      zh: `${zhLead}只有一个观测值 ${value}，没有离散程度可以描述：${allZh}。`,
    };
  }
  return {
    id: 'single',
    en: `${lead ? `For ${name.en}, every` : 'Every'} observation is ${value}, so there is no spread to describe: ${all}.`,
    zh: `${zhLead}每个观测值都是 ${value}，没有离散程度可以描述：${allZh}。`,
  };
}

/**
 * Exam sentences for one group in the instructor's style (M4 p.17 and the M4 practice boxplot table): centre,
 * spread and the points plotted individually, each { id, zh, en }. With several groups each sentence names its group.
 * A group whose observations are all one value (isSingleValued) gets a single sentence instead.
 * 按老师的写法给一组写出考试用句（第 4 单元第 17 页与练习中的箱线图表格）：中心、离散程度和单独画出的点。多组时每句都写出组名。
 * 所有观测值都是同一个值的组（isSingleValued）只有一句说明。
 */
export function describeSentences(model, labels, { groupCount = 1 } = {}) {
  if (!model) return [];
  const kit = textKit(model);
  const unit = labels?.unit;
  const at = (value) => withUnit(kit.num(value), unit);
  const variable = variableOf(labels);
  const name = nameOf(model);
  const lead = groupCount > 1;
  if (isSingleValued(model)) return [singleValueSentence(model, at, lead, name)];
  const zhLead = lead ? `${name.zh}：` : '';
  const sentences = [
    {
      id: 'centre',
      en: `${lead ? `For ${name.en}, the` : 'The'} median ${variable.en} was ${at(model.median)}. This means that 50% of the observations were at most ${at(model.median)} (${at(model.median)} or less), whereas 50% were more than ${at(model.median)}.`,
      zh: `${zhLead}${variable.zh}的中位数是 ${at(model.median)}。也就是说，50% 的观测值不超过 ${at(model.median)}（小于或等于），另外 50% 大于 ${at(model.median)}。`,
    },
    {
      id: 'spread',
      en: `${lead ? `For ${name.en}, ${variable.en}` : capitalize(variable.en)} ranged from ${at(model.min)} to ${at(model.max)}. The middle 50% of the observations were between ${at(model.q1)} and ${at(model.q3)} (IQR = Q3 ${MINUS} Q1 = ${at(model.iqr)}).`,
      zh: `${zhLead}${variable.zh}从 ${at(model.min)} 到 ${at(model.max)}。中间 50% 的观测值在 ${at(model.q1)} 和 ${at(model.q3)} 之间（IQR = Q3 ${MINUS} Q1 = ${at(model.iqr)}）。`,
    },
  ];
  const count = model.points.length;
  if (!count) {
    sentences.push({
      id: 'outliers',
      en: `${lead ? `For ${name.en}, no` : 'No'} observations were plotted individually: no value is beyond the inner fences.`,
      zh: `${zhLead}没有单独画出的点：没有数超出内栅栏。`,
    });
    return sentences;
  }
  const levels = [
    { level: 'suspect', en: ['suspect outlier', 'suspect outliers'], zh: '可疑离群值' },
    { level: 'highly-suspect', en: ['highly suspect outlier', 'highly suspect outliers'], zh: '高度可疑离群值' },
    { level: 'none', en: ['plotted in the given boxplot', 'plotted in the given boxplot'], zh: '在给出的图中单独画出' },
  ];
  const parts = levels
    .map((entry) => ({ ...entry, values: model.points.filter((point) => point.level === entry.level).map((point) => at(point.value)) }))
    .filter((entry) => entry.values.length);
  sentences.push({
    id: 'outliers',
    en: `${lead ? `For ${name.en}, ` : ''}${count} observation${count === 1 ? ' was' : 's were'} plotted individually: `
      + `${parts.map((entry) => `${listEn(entry.values)} (${entry.en[entry.values.length === 1 ? 0 : 1]})`).join('; ')}.`,
    zh: `${zhLead}有 ${count} 个观测值被单独画出：${parts.map((entry) => `${listZh(entry.values)}（${entry.zh}）`).join('；')}。`,
  });
  return sentences;
}

/**
 * The lengths a student compares to judge the shape from a boxplot, with no verdict (the slides judge the whole
 * picture): { lowerBox, upperBox, lowerWhisker, upperWhisker, low, high, zh, en }, where low and high count the points
 * plotted individually on each side. An unknown whisker length is NaN.
 * 从箱线图判断形状时要比较的长度，不直接给结论（课件看整个图来判断）。low 和 high 是两侧单独画出的点数；未知的须线长度为 NaN。
 */
export function shapeClues(model) {
  if (!model) return null;
  const kit = textKit(model);
  const lowerBox = model.median - model.q1;
  const upperBox = model.q3 - model.median;
  const lowerWhisker = model.q1 - model.whiskers.lower;
  const upperWhisker = model.whiskers.upper - model.q3;
  const low = model.points.filter((point) => point.side === 'low').length;
  const high = model.points.length - low;
  const length = (value, zh) => (Number.isFinite(value) ? kit.num(value) : (zh ? '未知' : 'unknown'));
  return {
    lowerBox,
    upperBox,
    lowerWhisker,
    upperWhisker,
    low,
    high,
    zh: `箱子下半段（Q1 到中位数）长 ${length(lowerBox, true)}，上半段（中位数到 Q3）长 ${length(upperBox, true)}；`
      + `下须线长 ${length(lowerWhisker, true)}，上须线长 ${length(upperWhisker, true)}；单独画出的点：较小一侧 ${low} 个，较大一侧 ${high} 个。`,
    en: `Q1 to median: ${length(lowerBox)}; median to Q3: ${length(upperBox)}; lower whisker: ${length(lowerWhisker)}; `
      + `upper whisker: ${length(upperWhisker)}; plotted individually: ${low} low, ${high} high.`,
  };
}

// Highest and lowest value of one measure across groups, with every group that ties for it.
// 各组某个量的最大值和最小值，以及并列的所有组。
function extremes(models, key) {
  const values = models.map((model) => model[key]);
  const high = Math.max(...values);
  const low = Math.min(...values);
  const named = (target) => models.filter((model) => sameValue(model[key], target)).map(nameOf);
  return { high, low, highNames: named(high), lowNames: named(low), allSame: sameValue(high, low) };
}

// Two groups, in the instructor's comparative wording (M4 practice Q2B): "The median job loss for Female is higher
// (5.45%) than for Male (5.15%). The middle 50% of job loss varies less in Female (IQR = 1.6%) than in Male (IQR = 2.25%)."
// 两组时用老师的比较句式（第 4 单元练习 Q2B）。
function pairSentences(models, at, variable) {
  const [first, second] = models;
  const one = nameOf(first);
  const two = nameOf(second);
  const sentences = [];
  if (sameValue(first.median, second.median)) {
    sentences.push({ id: 'median', en: `The median ${variable.en} is the same for ${one.en} and ${two.en} (${at(first.median)}).`, zh: `${one.zh}和${two.zh}的${variable.zh}中位数相同（${at(first.median)}）。` });
  } else {
    const [high, low] = first.median > second.median ? [first, second] : [second, first];
    sentences.push({
      id: 'median',
      en: `The median ${variable.en} for ${nameOf(high).en} is higher (${at(high.median)}) than for ${nameOf(low).en} (${at(low.median)}).`,
      zh: `${nameOf(high).zh}的${variable.zh}中位数（${at(high.median)}）比${nameOf(low).zh}（${at(low.median)}）高。`,
    });
  }
  if (sameValue(first.iqr, second.iqr)) {
    sentences.push({ id: 'iqr', en: `${one.en} and ${two.en} have the same IQR (${at(first.iqr)}).`, zh: `${one.zh}和${two.zh}的 IQR 相同（${at(first.iqr)}）。` });
  } else {
    const [less, more] = first.iqr < second.iqr ? [first, second] : [second, first];
    sentences.push({
      id: 'iqr',
      en: `The middle 50% of ${variable.en} varies less in ${nameOf(less).en} (IQR = ${at(less.iqr)}) than in ${nameOf(more).en} (IQR = ${at(more.iqr)}).`,
      zh: `${nameOf(less).zh}中间 50% 的${variable.zh}比${nameOf(more).zh}更集中：IQR = ${at(less.iqr)}，比 ${at(more.iqr)} 小。`,
    });
  }
  if (sameValue(first.range, second.range)) {
    sentences.push({ id: 'range', en: `${one.en} and ${two.en} have the same range (${at(first.range)}).`, zh: `${one.zh}和${two.zh}的全距相同（${at(first.range)}）。` });
  } else {
    const [less, more] = first.range < second.range ? [first, second] : [second, first];
    sentences.push({
      id: 'range',
      en: `${nameOf(less).en} has a smaller range (${at(less.range)}) than ${nameOf(more).en} (${at(more.range)}).`,
      zh: `${nameOf(less).zh}的全距（${at(less.range)}）比${nameOf(more).zh}（${at(more.range)}）小。`,
    });
  }
  return sentences;
}

// Three or four groups (M4 p.18): which group has the highest and the lowest median, the smallest and the largest
// IQR and range, naming every group that ties. `scoped` (a group was set aside) opens each sentence with "Among A, B
// and C, ", the way the M4 p.24 lesson writes it, so a sentence still holds when copied on its own.
// 三到四组（第 4 单元第 18 页）：哪一组的中位数最高、最低，IQR 和全距最小、最大；并列时写出所有并列的组。scoped（有组被放在一边）
// 时每句都以“Among A, B and C, ”开头，与第 4 单元第 24 页讲义的写法一致，单独抄出一句也成立。
function manySentences(models, at, variable, { scoped = false } = {}) {
  const en = (list) => joinEn(list.map((name) => name.en));
  const zh = (list) => joinZh(list.map((name) => name.zh));
  const has = (list) => (list.length === 1 ? 'has' : 'have');
  const names = models.map(nameOf);
  // "The median ..." and "All groups ..." continue in small letters after the scope; a group name keeps its capital.
  // “The median …”“All groups …”接在范围后面时改成小写；组名保持大写。
  const scope = (sentence) => (scoped
    ? {
      ...sentence,
      en: `Among ${en(names)}, ${sentence.en.replace(/^(The|All) /, (word) => word.toLowerCase())}`,
      zh: `在${zh(names)}中，${sentence.zh}`,
    }
    : sentence);
  const sentences = [];

  const median = extremes(models, 'median');
  sentences.push(scope(median.allSame
    ? { id: 'median', en: `All groups have the same median ${variable.en} (${at(median.high)}).`, zh: `各组${variable.zh}的中位数相同（${at(median.high)}）。` }
    : {
      id: 'median',
      en: `The median ${variable.en} is highest for ${en(median.highNames)} (${at(median.high)}) and lowest for ${en(median.lowNames)} (${at(median.low)}).`,
      zh: `${variable.zh}的中位数：${zh(median.highNames)}最高（${at(median.high)}），${zh(median.lowNames)}最低（${at(median.low)}）。`,
    }));

  const spread = extremes(models, 'iqr');
  sentences.push(scope(spread.allSame
    ? { id: 'iqr', en: `All groups have the same IQR (${at(spread.high)}).`, zh: `各组的 IQR 相同（${at(spread.high)}）。` }
    : {
      id: 'iqr',
      en: `${en(spread.lowNames)} ${has(spread.lowNames)} the smallest IQR (${at(spread.low)}), so the middle 50% varies least there; `
        + `${en(spread.highNames)} ${has(spread.highNames)} the largest IQR (${at(spread.high)}).`,
      zh: `${zh(spread.lowNames)}的 IQR 最小（${at(spread.low)}），中间 50% 的数据最集中；${zh(spread.highNames)}的 IQR 最大（${at(spread.high)}）。`,
    }));

  const range = extremes(models, 'range');
  sentences.push(scope(range.allSame
    ? { id: 'range', en: `All groups have the same range (${at(range.high)}).`, zh: `各组的全距相同（${at(range.high)}）。` }
    : {
      id: 'range',
      en: `${en(range.lowNames)} ${has(range.lowNames)} the smallest range (${at(range.low)}); `
        + `${en(range.highNames)} ${has(range.highNames)} the largest range (${at(range.high)}).`,
      zh: `${zh(range.lowNames)}的全距最小（${at(range.low)}），${zh(range.highNames)}的全距最大（${at(range.high)}）。`,
    }));
  return sentences;
}

// A group left out of the comparison (isSetAside), with the reason. 不参加比较的组及其原因。
function setAsideSentence(model, at) {
  const name = nameOf(model);
  const value = at(model.min);
  return model.n === 1
    ? {
      id: 'set-aside',
      en: `${name.en} is left out of the comparison: it has only one observation (${value}), so it has no box or spread to compare.`,
      zh: `${name.zh}不参加比较：它只有一个观测值（${value}），没有箱子，也没有离散程度可以比较。`,
    }
    : {
      id: 'set-aside',
      en: `${name.en} is left out of the comparison: all of its observations are ${value} (Min = Max), so it has no box or spread to compare.`,
      zh: `${name.zh}不参加比较：它的观测值都是 ${value}（最小值 = 最大值），没有箱子，也没有离散程度可以比较。`,
    };
}

// Groups that are set aside (one observation, M4 p.24) are named first and left out of the highest / lowest median,
// IQR and range; the others are compared in pairs or as a set. The plotted points list every group.
// 被放在一边的组（只有一个观测值，第 4 单元第 24 页）先单独说明，不参加中位数、IQR、全距的最高最低比较；其余的组两两比较或一起比较。
// 单独画出的点列出所有组。
function comparisonSentences(models, labels) {
  const digits = Math.max(...models.map((model) => model.digits));
  const at = (value) => withUnit(formatTrim(value, digits), labels?.unit);
  const variable = variableOf(labels);
  const kept = models.filter((model) => !isSetAside(model));
  const sentences = models.filter(isSetAside).map((model) => setAsideSentence(model, at));
  if (kept.length === 2) sentences.push(...pairSentences(kept, at, variable));
  else if (kept.length > 2) sentences.push(...manySentences(kept, at, variable, { scoped: kept.length < models.length }));
  const plotted = models.map((model) => {
    const kit = textKit(model);
    return { name: nameOf(model), values: model.points.map((point) => kit.num(point.value)) };
  });
  sentences.push({
    id: 'outliers',
    en: `Plotted individually: ${plotted.map(({ name, values }) => `${name.en} ${values.length ? listEn(values) : 'none'}`).join('; ')}.`,
    zh: `单独画出的点：${plotted.map(({ name, values }) => `${name.zh} ${values.length ? listZh(values) : '无'}`).join('；')}。`,
  });
  return sentences;
}

/**
 * The comparison table and sentences of side-by-side boxplots (M4 p.18: which group has the higher median, the
 * smaller IQR and the smaller range, and its outliers): { rows, sentences }. Each row holds the printed numbers of a
 * group ("—" when n is not given or a list is empty; `whiskers` is { zh, en } when an end is unknown); the sentences
 * ({ id, zh, en }) need at least two groups. Two groups are compared with "higher than", more with "highest". A group
 * that is set aside (isSetAside: a single observation, like "Other" on M4 p.22-24) is named in its own sentence and
 * left out of the highest and lowest median, IQR and range.
 * 并排箱线图的对比表和句子（第 4 单元第 18 页：哪一组中位数更高、IQR 更小、全距更小，以及离群值）。
 * 每行是一组已经排好版的数字（n 未给出或列表为空时写“—”；须线端点未知时 whiskers 为双语值）；至少两组时才有句子。
 * 两组时用“比……高”，更多组时用“最高”。被放在一边的组（isSetAside：只有一个观测值，例如第 4 单元第 22-24 页的“Other”）
 * 用单独一句说明，不参加中位数、IQR 和全距的最高最低比较。
 */
export function compareGroups(models, labels) {
  const list = Array.isArray(models) ? models : [];
  const rows = list.map((model) => {
    const kit = textKit(model);
    const at = (level) => model.points.filter((point) => point.level === level).map((point) => kit.num(point.value)).join(', ') || '—';
    return {
      index: model.index,
      name: model.name,
      given: model.kind === 'summary',
      n: Number.isInteger(model.n) ? String(model.n) : '—',
      min: kit.num(model.min),
      q1: kit.num(model.q1),
      median: kit.num(model.median),
      q3: kit.num(model.q3),
      max: kit.num(model.max),
      iqr: kit.num(model.iqr),
      range: kit.num(model.range),
      whiskers: whiskerText(model, kit),
      suspect: at('suspect'),
      highlySuspect: at('highly-suspect'),
    };
  });
  return { rows, sentences: list.length > 1 ? comparisonSentences(list, labels) : [] };
}

/**
 * Text alternative of the chart: every group's five-number summary, whisker ends and plotted points, plus the
 * construction step while one is in progress.
 * 图的文字说明：各组的五数概括、须线端点和单独画出的点；正在一步步作图时再加上当前步骤。
 */
export function chartDescription(models, labels, { steps, stage, selected = 0 } = {}) {
  const list = Array.isArray(models) ? models : [];
  const title = axisTitle(labels);
  const subject = title.en || title.zh;
  const head = list.length > 1
    ? `并排箱线图 Side-by-side boxplots${subject ? ` of ${subject}` : ''}`
    : `箱线图 Boxplot${subject ? ` of ${subject}` : ''}`;
  const groups = list.map((model) => {
    const kit = textKit(model);
    const points = model.points.length
      ? `plotted individually: ${model.points.map((point) => kit.num(point.value)).join(', ')}`
      : 'no outliers';
    const whiskers = whiskerText(model, kit);
    return `${nameOf(model).en}: Min ${kit.num(model.min)}, Q1 ${kit.num(model.q1)}, Median ${kit.num(model.median)}, `
      + `Q3 ${kit.num(model.q3)}, Max ${kit.num(model.max)}, whiskers ${typeof whiskers === 'string' ? whiskers : whiskers.en}, ${points}`;
  });
  const status = stepStatus(steps, stage);
  const drawing = status && status.number < status.total && list[selected]
    ? ` 作图中 Drawing ${nameOf(list[selected]).en}: ${status.en}.`
    : '';
  return `${head}. ${groups.join('. ')}.${drawing}`;
}

/* ---------- Chart labels 图中标签 ---------- */

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/u;

// Rough width in pixels of 12 px label text: Chinese characters are about square, Latin ones about half as wide.
// 12 px 标签文字的大致像素宽度：汉字接近正方形，拉丁字母大约一半宽。
function labelWidth(text) {
  let width = 0;
  for (const char of text) width += CJK.test(char) ? 12.5 : 7;
  return width;
}

/**
 * A group name that fits `maxWidth` pixels under a vertical boxplot: both languages when they fit, otherwise English
 * only, Chinese only, or a shortened name ending in "…". Returns { zh, en }, either of which may be "". The name is
 * drawn as plain SVG text, so the inline markup the content may use (**bold**, `code`) is dropped.
 * 竖放箱线图下方放得下的组名：两种语言都放得下就都写，否则只写英文或只写中文，再不行就截短并以“…”结尾。
 * 返回 { zh, en }，其中一个可以为空字符串。组名画成纯 SVG 文字，所以去掉内容里可能用到的行内标记（**粗体**、`代码`）。
 */
export function fitLabel(name, maxWidth) {
  const plain = (text) => (typeof text === 'string' ? stripMarkup(text).trim() : '');
  const en = plain(name?.en);
  const given = plain(name?.zh);
  // A name written the same in both languages ("B" and "B") is shown once. 两种语言写法相同的组名只显示一次。
  const zh = given === en ? '' : given;
  if (!zh && !en) return { zh: '', en: '' };
  const options = [{ zh, en }, { zh: '', en }, { zh, en: '' }].filter((option) => option.zh || option.en);
  for (const option of options) {
    if (labelWidth([option.zh, option.en].filter(Boolean).join(' ')) <= maxWidth) return option;
  }
  const chars = Array.from(en || zh);
  while (chars.length > 1 && labelWidth(`${chars.join('')}…`) > maxWidth) chars.pop();
  const short = `${chars.join('').trimEnd()}…`;
  return en ? { zh: '', en: short } : { zh: short, en: '' };
}
