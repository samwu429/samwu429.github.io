/**
 * Histograms of one quantitative variable (STA220 Module 3 p.7-35) for the "histogram" widget: the config
 * reader, the bins and their frequency table, percentages read from the bars, the dotplot stacks, the
 * stem-and-leaf display, and every number, worked step and sentence the widget shows. DOM-free.
 * 一个定量变量的直方图（STA220 第 3 单元第 7-35 页），供 histogram 组件使用：读取配置，算出分组与频数表、
 * 从柱子读出的百分比、点图的叠放、茎叶图，以及组件显示的每个数字、解题步骤和句子；不依赖 DOM。
 *
 * Course conventions kept here:
 * - Bins are right-closed (a, b] unless the config says "left", like R's hist() on the slides, and the first bin
 *   also holds its left end, [a, b]. "At most b" and "more than a" can then be read from whole bars, while
 *   "at least a" and "less than b" need the raw data (p.13-20, 2025 midterm Q15, Module 3 practice Q3b).
 * - The first bin starts at the edge at or below the smallest value, as R's breaks do, so the first and the
 *   last bins are never empty and every empty bin is a gap inside the data (p.9).
 * - The one-variable notation of the slides: observations y, the sample mean ȳ = Σy / n (p.29-30) and the
 *   median at rank position 0.5 × (n + 1) (p.32-33).
 * - The shape is never named automatically: the course names it from the graph by its longer tail, and the
 *   mean against the median is only a hint (p.35, p.42).
 * 课程约定：
 * - 除非配置写 "left"，组都是右闭的 (a, b]，与课件里 R 的 hist() 一样，而且第一组还包含左端点，即 [a, b]。
 *   这样“最多 b”和“多于 a”可以用整根柱子读出来，“至少 a”和“少于 b”却要用原始数据
 *   （第 13-20 页、2025 年期中第 15 题、第 3 单元练习 Q3b）。
 * - 第一组从不大于最小值的那条边界开始，与 R 选的分组边界一样，所以第一组和最后一组都不会是空的，
 *   空组一定是数据中间的缺口（第 9 页）。
 * - 课件的单变量记号：观测值 y，样本平均数 ȳ = Σy / n（第 29-30 页），中位数在名次 0.5 × (n + 1)（第 32-33 页）。
 * - 形状从不自动判断：课程看图、按较长的尾巴命名形状，平均数和中位数的比较只作为提示（第 35、42 页）。
 */
import { decimalsOf, niceStep, toBi, toNumber } from '../../machine-learning/shared/ml-math.js';
import {
  MINUS, STAT_DIGITS, TIMES, formatFixed, formatFraction, formatInterval, formatOperand, formatPercent,
  formatStemLabel, formatTerms, formatTrim, nameInSentence, ordinal, relationSign, roundTo,
} from '../shared/stat-format.js';
import {
  defaultBinWidth, defaultLeafUnit, finiteNumbers, frequencyTable, medianInfo, sortAscending, stemAndLeaf,
  valueCounts,
} from '../shared/stats-math.js';

// The three displays of Module 3 that the content may list in `views` (content-spec 5.4).
// 内容可以在 views 里列出的第 3 单元三种图（内容规范 5.4）。
export const HISTOGRAM_VIEWS = Object.freeze(['histogram', 'dotplot', 'stemleaf']);

// Sizes the content validator accepts (tools/validate_content.py, check_statistics_widget): 5-200 values.
// A longer list is cut to the maximum; a shorter one is still drawn.
// 内容校验器接受的数量（tools/validate_content.py 的 check_statistics_widget）：5-200 个值。更长的列表截到上限，更短的照样画。
export const DATA_LIMITS = Object.freeze({ min: 5, max: 200 });

// The slides expect "usually between 5 to 30 bins" (M3 p.9). More bars than this are too thin to read or tap on
// a phone, so a configured bin width that needs more falls back to R's default width.
// 课件说组数“通常在 5 到 30 之间”（第 3 单元第 9 页）。柱子比这还多时，在手机上细得看不清、点不到，
// 所以需要更多组的配置组距会退回 R 的默认组距。
export const MAX_DISPLAY_BINS = 60;

// The most stem lines a configured leaf unit may need before the default leaf unit is used instead.
// 配置的叶单位最多允许多少行茎；超过就改用默认叶单位。
export const MAX_STEM_LINES = 60;

// When the default leaf unit puts more leaves than this on one line (large data sets), a leaf unit ten times
// finer is used instead if it fits.
// 默认叶单位让一行的叶子超过这么多时（数据很多的情况），如果放得下，就改用小十倍的叶单位。
export const MAX_LEAVES_PER_LINE = 40;

// Questions read from a histogram (M3 p.13-20): "at most" ≤, "more than" >, "at least" ≥, "less than" <.
// 从直方图读的问题（第 3 单元第 13-20 页）：“最多” ≤、“多于” >、“至少” ≥、“少于” <。
export const READING_RELATIONS = Object.freeze(['at-most', 'more-than', 'at-least', 'less-than']);

// A selected bar lists at most this many of its values; the rest are counted.
// 选中的柱子最多列出这么多个值，其余的只报个数。
export const MAX_LISTED_VALUES = 30;

// About this many dot columns fit across a phone-width dotplot. ggplot2's geom_dotplot on M3 p.26 uses
// binwidth 7 for a range of 220 calories, about 31 columns.
// 手机宽度的点图大约能并排放这么多列点。第 3 单元第 26 页 ggplot2 的 geom_dotplot 用 binwidth 7 画 220 卡路里的全距，约 31 列。
const DOT_COLUMNS = 40;

// The start control offers about 5 starting edges for a width, never more than 8.
// “起点”控件对一个组距大约给 5 个起点，最多 8 个。
const START_CHOICES = Object.freeze({ target: 5, max: 8 });

// Data decimals beyond this are not printed. 数据超过这么多位的小数不再显示。
const MAX_DECIMALS = 6;

// Relative tolerance for binary noise, as in stats-math: 0.30000000000000004 still counts as 0.3.
// 吸收二进制误差的相对容差，与 stats-math 一致：0.30000000000000004 仍算作 0.3。
const EPSILON = 1e-9;

/**
 * M3 p.5: the calories of the 30 Tim Hortons donuts (2014) in ID order, the course's running example. Shown
 * with its own labels and R's bins when a config has no usable data.
 * 第 3 单元第 5 页：30 个 Tim Hortons 甜甜圈（2014 年）的热量，按 ID 顺序，是课程一直用的例子。
 * 配置里没有可用数据时，连同它自己的标签和 R 的分组一起显示。
 */
export const SLIDE_EXAMPLE = Object.freeze({
  title: Object.freeze({ zh: 'Tim Hortons 甜甜圈的热量', en: 'Calories of Tim Hortons donuts' }),
  variable: Object.freeze({ zh: '热量', en: 'Calories' }),
  unit: 'kcal',
  data: Object.freeze([
    180, 190, 190, 190, 210, 250, 290, 300, 210, 220, 250, 270, 270, 270, 280,
    280, 300, 340, 250, 200, 200, 210, 220, 230, 230, 250, 270, 270, 400, 310,
  ]),
});

const FALLBACK_TITLE = Object.freeze({ zh: '直方图', en: 'Histogram' });
const FALLBACK_VARIABLE = Object.freeze({ zh: '数值', en: 'Value' });

// Placeholders of the instructor's sentence templates; the learner fills them in from the question.
// 老师句型里的占位词，由学习者按题目填写。
const CASES = Object.freeze({ zh: '[个案]', en: '[cases]' });
const UNITS = Object.freeze({ zh: '[单位]', en: '[units]' });

// Currency symbols go before the number ($43595.28); every other unit goes after it (251 kcal, 12%).
// 货币符号写在数字前面（$43595.28），其他单位写在后面（251 kcal、12%）。
const PREFIX_UNIT = /^(?:[A-Z]{0,3}\$|€|£|¥)$/;

const RELATION_WORDS = Object.freeze({
  'at-most': Object.freeze({ zh: '最多', en: 'at most', symbol: '≤', r: '<=' }),
  'more-than': Object.freeze({ zh: '多于', en: 'more than', symbol: '>', r: '>' }),
  'at-least': Object.freeze({ zh: '至少', en: 'at least', symbol: '≥', r: '>=' }),
  'less-than': Object.freeze({ zh: '少于', en: 'less than', symbol: '<', r: '<' }),
});

function nearlyEqual(a, b) {
  return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

/** True when two computed numbers are the same up to binary noise. 两个计算结果在二进制误差范围内相等时为 true。 */
export function sameValue(a, b) {
  const first = toNumber(a);
  const second = toNumber(b);
  return first !== null && second !== null && nearlyEqual(first, second);
}

const RELATION_TESTS = Object.freeze({
  'at-most': (value, cut) => value < cut || nearlyEqual(value, cut),
  'more-than': (value, cut) => value > cut && !nearlyEqual(value, cut),
  'at-least': (value, cut) => value > cut || nearlyEqual(value, cut),
  'less-than': (value, cut) => value < cut && !nearlyEqual(value, cut),
});

function positive(value) {
  const number = toNumber(value);
  return number !== null && number > 0 ? number : null;
}

// A positive power of ten written exactly (0.1, 1, 10), or null; stemAndLeaf only takes these as leaf units.
// 精确写出的正的 10 的整数次幂（0.1、1、10），否则为 null；stemAndLeaf 只接受这样的叶单位。
function powerOfTen(value) {
  const number = positive(value);
  if (number === null) return null;
  const exponent = Math.round(Math.log10(number));
  const exact = 10 ** exponent;
  return nearlyEqual(number, exact) ? roundTo(exact, Math.max(0, -exponent)) : null;
}

// Nice numbers {multipliers} x 10^k from a thousandth to a thousand times `base`, ascending.
// 从 base 的千分之一到一千倍之间、形如 {multipliers} x 10^k 的整齐数，由小到大。
function niceLadder(base, multipliers) {
  const power = Math.floor(Math.log10(base));
  const ladder = [];
  for (let exponent = power - 3; exponent <= power + 3; exponent += 1) {
    for (const multiplier of multipliers) ladder.push(roundTo(multiplier * 10 ** exponent, Math.max(0, 1 - exponent)));
  }
  return ladder;
}

const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;

// "a, b and c", the English way of listing a few items. 英文列举几项时的写法。
function listEn(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/* ---------- Reading the config 读取配置 ---------- */

/** Most decimals any value needs, at most 6 (0 for whole numbers). 数据里最多的小数位数，最多 6 位（整数为 0）。 */
export function dataDecimals(values) {
  return finiteNumbers(values).reduce((most, value) => Math.max(most, decimalsOf(value, MAX_DECIMALS)), 0);
}

/**
 * A number with its unit: "251 kcal", "$43595.28", "12%", or the number alone when there is no unit.
 * 带单位的数：“251 kcal”“$43595.28”“12%”；没有单位时只有数字。
 */
export function withUnit(text, unit) {
  const label = typeof unit === 'string' ? unit.trim() : '';
  const number = String(text);
  if (!label) return number;
  if (PREFIX_UNIT.test(label)) {
    return number.startsWith(MINUS) ? `${MINUS}${label}${number.slice(1)}` : `${label}${number}`;
  }
  return label === '%' ? `${number}%` : `${number} ${label}`;
}

// A configured width is used when it needs at most MAX_DISPLAY_BINS bins and, for data that vary, at least 2:
// a single bar hides the whole distribution.
// 配置的组距不超过 MAX_DISPLAY_BINS 组，并且（数据有变化时）至少 2 组，才会被采用：只有一根柱子就什么分布都看不出来。
function usableWidth(values, width, start, closed) {
  const sorted = sortAscending(values);
  const bins = binCountFor(sorted, { width, start, closed });
  return bins >= 1 && bins <= MAX_DISPLAY_BINS && (bins >= 2 || sorted[0] === sorted[sorted.length - 1]);
}

// A leaf unit is used when it is a power of ten whose display needs at most MAX_STEM_LINES lines and does not
// round every value to the same number (a leaf unit of a million would turn 180 and 400 into the same 0).
// 叶单位必须是 10 的整数次幂、茎叶图不超过 MAX_STEM_LINES 行，并且不会把所有值都取整成同一个数
// （叶单位为一百万时，180 和 400 都会变成 0），才会被采用。
function usableLeafUnit(values, leafUnit) {
  const unit = powerOfTen(leafUnit);
  if (unit === null) return null;
  const sorted = sortAscending(values);
  const display = stemAndLeaf(sorted, { leafUnit: unit });
  const distinct = new Set(sorted.map((value) => roundTo(value / unit, 0))).size;
  const varies = sorted.length > 1 && sorted[0] !== sorted[sorted.length - 1];
  const fits = nearlyEqual(display.leafUnit, unit) && display.lines.length <= MAX_STEM_LINES;
  return fits && (distinct > 1 || !varies) ? unit : null;
}

// The leaf unit when the config gives none: stats-math's default (10 for the donuts, as in R), or one ten
// times finer when the default crowds more than MAX_LEAVES_PER_LINE leaves on a line and the finer one fits.
// 配置没有给叶单位时用的叶单位：stats-math 的默认值（甜甜圈为 10，与 R 相同）；默认值让一行超过 MAX_LEAVES_PER_LINE 片叶子、
// 而小十倍的叶单位放得下时，改用小十倍的。
function defaultLeafFor(values) {
  const unit = defaultLeafUnit(values);
  const longest = stemAndLeaf(values, { leafUnit: unit }).lines.reduce((most, line) => Math.max(most, line.leaves.length), 0);
  if (longest <= MAX_LEAVES_PER_LINE) return unit;
  const finer = roundTo(unit / 10, decimalsOf(unit) + 1);
  const resolution = 10 ** -dataDecimals(values);
  return finer >= resolution * (1 - EPSILON) ? usableLeafUnit(values, finer) ?? unit : unit;
}

/**
 * Reads a content config defensively (content-spec 5.4): every config the validator accepts comes through,
 * and bad or missing fields fall back to safe defaults. Returns { title, variable, unit, data, usedDefault,
 * truncated, binWidth, widthAdjusted, start, closed, views, leafUnit, leafUnitAdjusted, split }:
 * - data: the finite values (numbers or numeric strings) in input order, at most 200. With no usable value the
 *   donut calories of M3 p.5 are shown with their own labels, R's bins and leaf unit (usedDefault).
 * - binWidth: the configured width when it needs at most MAX_DISPLAY_BINS bins (and at least 2 when the data
 *   vary), otherwise R's default width (Sturges' rule, 50 for the donuts); widthAdjusted says a configured
 *   width was replaced.
 * - start: the configured first edge or null (null starts at a multiple of the width, like R). Only the grid of
 *   edges it fixes matters; histogramLayout moves it by whole widths to the edge at or below the minimum.
 * - closed: "right" (bins (a, b], R's hist(), the default) or "left" (bins [a, b)).
 * - views: the known views in their configured order, without repeats; ["histogram"] when none is usable.
 * - leafUnit: the configured power of ten when its display fits, otherwise the default leaf unit (ten times finer
 *   when the default crowds a line, see MAX_LEAVES_PER_LINE); leafUnitAdjusted says a configured leaf unit was
 *   replaced. split: whether the stems start split.
 * 防御性读取内容配置（内容规范 5.4）：校验器接受的配置都能读进来，错误或缺失的字段退回安全的默认值。
 * - data：有限的数值（数字或数字字符串），保持输入顺序，最多 200 个。一个可用的值都没有时，显示第 3 单元第 5 页的甜甜圈热量，
 *   连同它自己的标签、R 的分组和叶单位（usedDefault）。
 * - binWidth：配置的组距不超过 MAX_DISPLAY_BINS 组（数据有变化时还要至少 2 组）就用它，否则用 R 的默认组距
 *   （Sturges 规则，甜甜圈为 50）；widthAdjusted 表示配置的组距被替换了。
 * - start：配置的第一条边界，或 null（null 从组距的整数倍开始，与 R 相同）。它只决定边界网格；
 *   histogramLayout 会按整组距把它移到不大于最小值的那条边界。
 * - closed："right"（组为 (a, b]，R 的 hist()，默认）或 "left"（组为 [a, b)）。
 * - views：可识别的视图，按配置顺序、去掉重复；一个都不能用时为 ["histogram"]。
 * - leafUnit：配置的 10 的整数次幂放得下时就用它，否则用默认叶单位（一行太挤时用小十倍的，见 MAX_LEAVES_PER_LINE）；
 *   leafUnitAdjusted 表示配置的叶单位被替换了。split：茎一开始是否拆成两行。
 */
export function normalizeHistogramConfig(config) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const given = finiteNumbers(source.data);
  const usedDefault = given.length === 0;
  const data = usedDefault ? [...SLIDE_EXAMPLE.data] : given.slice(0, DATA_LIMITS.max);
  const closed = source.closed === 'left' ? 'left' : 'right';
  // The width, start and leaf unit were chosen for the author's data, so they are not applied to the example.
  // 组距、起点和叶单位是为作者自己的数据选的，所以不用在课件例子上。
  const start = usedDefault ? null : toNumber(source.start);
  const configuredWidth = usedDefault ? null : positive(source.binWidth);
  const widthFits = configuredWidth !== null && usableWidth(data, configuredWidth, start, closed);
  const configuredLeaf = usedDefault ? null : positive(source.leafUnit);
  const leafFits = configuredLeaf === null ? null : usableLeafUnit(data, configuredLeaf);
  const leafUnit = leafFits ?? defaultLeafFor(data);
  const views = Array.isArray(source.views)
    ? source.views.filter((view, index, list) => HISTOGRAM_VIEWS.includes(view) && list.indexOf(view) === index)
    : [];
  // The unit is kept whole, as the validator accepts any string; it is only ever printed as HTML text, which wraps.
  // 单位原样完整保留（校验器接受任何字符串）；它只出现在会自动换行的 HTML 文字里。
  const unit = typeof source.unit === 'string' ? source.unit.trim() : '';
  return {
    title: usedDefault ? { ...SLIDE_EXAMPLE.title } : toBi(source.title, FALLBACK_TITLE),
    variable: usedDefault ? { ...SLIDE_EXAMPLE.variable } : toBi(source.variable, FALLBACK_VARIABLE),
    unit: usedDefault ? SLIDE_EXAMPLE.unit : unit,
    data,
    usedDefault,
    truncated: given.length > DATA_LIMITS.max,
    binWidth: widthFits ? configuredWidth : defaultBinWidth(data),
    widthAdjusted: configuredWidth !== null && !widthFits,
    start,
    closed,
    views: views.length ? views : ['histogram'],
    leafUnit,
    leafUnitAdjusted: configuredLeaf !== null && leafFits === null,
    split: defaultSplit(data, leafUnit),
  };
}

/* ---------- Bins and the frequency table 分组与频数表 ---------- */

/**
 * The first edge of the bins: the edge of the grid through `start` (every `width` apart; through 0 when start
 * is missing) that is at or below `min`. A start of 100 with width 50 and a minimum of 180 gives 150, so no
 * empty bar stands in front of the data.
 * 第一组的左边界：经过 start、间隔 width 的边界网格（没有 start 时经过 0）中，不大于 min 的那一条。
 * start 为 100、组距 50、最小值 180 时得到 150，所以数据前面不会多出空柱子。
 */
export function alignStart(start, width, min) {
  const step = toNumber(width);
  const low = toNumber(min);
  if (!(step > 0) || low === null) return NaN;
  const anchor = toNumber(start) ?? 0;
  const digits = Math.max(decimalsOf(anchor), decimalsOf(step));
  return roundTo(anchor + Math.floor((low - anchor) / step + EPSILON) * step, digits);
}

/**
 * How many bins histogramLayout draws for this width, start and boundary rule (0 without data or width).
 * histogramLayout 在这个组距、起点和区间规则下画多少组（没有数据或组距时为 0）。
 */
export function binCountFor(values, { width, start = null, closed = 'right' } = {}) {
  const sorted = sortAscending(values);
  const step = toNumber(width);
  if (!sorted.length || !(step > 0)) return 0;
  const span = (sorted[sorted.length - 1] - alignStart(start, step, sorted[0])) / step;
  // The same counts as frequencyTable in stats-math: a right-closed table ends at the edge holding the maximum,
  // and a left-closed one opens one more bin when the maximum sits on an edge.
  // 与 stats-math 的 frequencyTable 计数相同：右闭的表在包含最大值的边界结束；左闭的表在最大值正好落在边界上时再多开一组。
  return closed === 'left' ? Math.floor(span + EPSILON) + 1 : Math.max(1, Math.ceil(span - EPSILON));
}

/**
 * The bins for a width, start and boundary rule: frequencyTable's { n, start, width, closed, edges, bins } with
 * the start aligned by alignStart, plus maxCount, peaks (indexes of the tallest bars) and gaps (indexes of the
 * empty bins). The donuts with width 50 give 6, 11, 10, 2, 1 right-closed (M3 p.14) and 4, 9, 12, 4, 0, 1
 * left-closed (the poster on M3 p.8, with a gap at [350, 400)).
 * 按组距、起点和区间规则分组：返回 frequencyTable 的结果（起点先经 alignStart 对齐），再加上 maxCount、peaks（最高柱子的序号）
 * 和 gaps（空组的序号）。甜甜圈组距 50 时，右闭得到 6、11、10、2、1（第 3 单元第 14 页），
 * 左闭得到 4、9、12、4、0、1（第 3 单元第 8 页的海报，[350, 400) 是缺口）。
 */
export function histogramLayout(values, { width, start = null, closed = 'right' } = {}) {
  const sorted = sortAscending(values);
  const step = toNumber(width);
  const binWidth = step > 0 ? step : defaultBinWidth(sorted);
  const first = sorted.length ? alignStart(start, binWidth, sorted[0]) : null;
  const table = frequencyTable(sorted, { start: first, width: binWidth, closed: closed === 'left' ? 'left' : 'right' });
  const maxCount = table.bins.reduce((most, bin) => Math.max(most, bin.count), 0);
  return {
    ...table,
    maxCount,
    peaks: maxCount > 0 ? table.bins.filter((bin) => bin.count === maxCount).map((bin) => bin.index) : [],
    gaps: table.bins.filter((bin) => bin.count === 0).map((bin) => bin.index),
  };
}

/** Decimals needed to write every bin edge. 写出所有组边界所需的小数位数。 */
export function edgeDigits(layout) {
  return (layout?.edges ?? []).reduce((most, edge) => Math.max(most, decimalsOf(edge)), 0);
}

/**
 * A few sensible bin widths around `width` for the width control: up to two nice widths (1, 2, 5 x 10^k) below
 * it and two above, keeping at least 2 and at most MAX_DISPLAY_BINS bins and never going finer than the data's
 * own decimals. The donuts with width 50 get 10, 20, 50, 100 and 200: too many bars, too few, and R's choice.
 * 给“组距”控件的几个合理组距：在 width 下面和上面各取最多两个整齐的组距（1、2、5 x 10^k），
 * 保证至少 2 组、至多 MAX_DISPLAY_BINS 组，并且不比数据本身的小数位更细。甜甜圈组距 50 时得到 10、20、50、100、200：
 * 有太多柱子的、太少柱子的，也有 R 选的。
 */
export function binWidthOptions(values, width, { start = null, closed = 'right' } = {}) {
  const sorted = sortAscending(values);
  if (!sorted.length) return [];
  const step = toNumber(width);
  const base = step > 0 ? step : defaultBinWidth(sorted);
  if (sorted[sorted.length - 1] === sorted[0]) return [base];
  const resolution = 10 ** -dataDecimals(sorted);
  const bins = (candidate) => binCountFor(sorted, { width: candidate, start, closed });
  const ladder = niceLadder(base, [1, 2, 5]);
  const take = (candidates, keep) => {
    const chosen = [];
    for (const candidate of candidates) {
      if (chosen.length === 2 || !keep(candidate)) break;
      chosen.push(candidate);
    }
    return chosen;
  };
  const finer = take(
    ladder.filter((candidate) => candidate < base && !nearlyEqual(candidate, base)).reverse(),
    (candidate) => candidate >= resolution * (1 - EPSILON) && bins(candidate) <= MAX_DISPLAY_BINS,
  );
  const coarser = take(
    ladder.filter((candidate) => candidate > base && !nearlyEqual(candidate, base)),
    (candidate) => bins(candidate) >= 2,
  );
  return [...finer.reverse(), base, ...coarser];
}

// The step between start choices: a nice number (1, 2, 2.5, 5 x 10^k) that divides the width, is a whole
// multiple of the data's resolution and gives 2 to 8 choices, as close to 5 choices as possible.
// 起点选项之间的间隔：能整除组距、是数据精度整数倍、给出 2 到 8 个选项的整齐数（1、2、2.5、5 x 10^k），选项数尽量接近 5。
function startStep(width, resolution) {
  let best = null;
  for (const candidate of niceLadder(width, [1, 2, 2.5, 5])) {
    const choices = width / candidate;
    const multiple = candidate / resolution;
    const count = Math.round(choices);
    if (!nearlyEqual(choices, count) || !nearlyEqual(multiple, Math.round(multiple)) || multiple < 1 - EPSILON) continue;
    if (count < 2 || count > START_CHOICES.max) continue;
    if (!best || Math.abs(count - START_CHOICES.target) < Math.abs(best.count - START_CHOICES.target)) {
      best = { step: candidate, count };
    }
  }
  return best;
}

/**
 * First edges the start control offers for a width, ascending: every edge in (min − width, min] on a nice
 * grid, plus the aligned `start`. Data without negative values get no negative choices (a first bin from
 * −30000 dollars or −1 acts would only puzzle), apart from an aligned start the config asked for. The donuts
 * with width 50 get 140, 150, 160, 170 and 180; each one keeps the smallest value in the first bin, and each
 * one draws a different picture of the same data.
 * “起点”控件对一个组距给出的第一条边界（由小到大）：整齐网格上落在 (min − width, min] 里的每条边界，再加上对齐后的 start。
 * 没有负值的数据不给负的起点（从 −30000 美元或 −1 次开始的第一组只会让人困惑），配置要求的对齐起点除外。
 * 甜甜圈组距 50 时得到 140、150、160、170、180；每一个都让最小值留在第一组里，同一组数据却画出不同的图。
 */
export function startOptions(values, width, start = null) {
  const sorted = sortAscending(values);
  const step = toNumber(width);
  if (!sorted.length || !(step > 0)) return [];
  const min = sorted[0];
  const aligned = alignStart(start, step, min);
  const options = [aligned];
  const choice = startStep(step, 10 ** -dataDecimals(sorted));
  if (choice) {
    const digits = Math.max(decimalsOf(choice.step), decimalsOf(step));
    const highest = Math.floor(min / choice.step + EPSILON) * choice.step;
    for (let index = 0; index < choice.count; index += 1) options.push(roundTo(highest - index * choice.step, digits));
  }
  return options
    .filter((value) => Number.isFinite(value) && (value >= 0 || min < 0 || value === aligned))
    .sort((a, b) => a - b)
    .filter((value, index, list) => index === 0 || !nearlyEqual(value, list[index - 1]));
}

/**
 * The rows of the frequency table as text: { rows: [{ index, interval, count, relative, percent, cumulative,
 * gap }], total: { count, relative, percent } }. Relative frequencies are proportions with 3 decimals and
 * percentages carry %; the cumulative column is the cumulative relative frequency (2025 midterm Q13).
 * 频数表每一行的文字：区间、频数、相对频数（3 位小数的比例）、百分比和累积相对频数（2025 年期中第 13 题），以及合计行。
 */
export function frequencyRows(layout) {
  const digits = edgeDigits(layout);
  const rows = (layout?.bins ?? []).map((bin) => ({
    index: bin.index,
    interval: formatInterval(bin, digits),
    count: String(bin.count),
    relative: formatFixed(bin.proportion, STAT_DIGITS.proportion),
    percent: formatPercent(bin.proportion, STAT_DIGITS.percent),
    cumulative: formatFixed(bin.cumulativeProportion, STAT_DIGITS.proportion),
    gap: bin.count === 0,
  }));
  const n = layout?.n ?? 0;
  return {
    rows,
    total: {
      count: String(n),
      relative: n ? formatFixed(1, STAT_DIGITS.proportion) : '—',
      percent: n ? formatPercent(1, STAT_DIGITS.percent) : '—',
    },
  };
}

/**
 * What a bin's interval notation means: { zh, en, inequality }. "(200, 250]" is more than 200 and at most 250,
 * that is 200 < y ≤ 250; "[150, 200]" includes both ends; "[200, 250)" is at least 200 and less than 250.
 * 一个组的区间写法是什么意思：“(200, 250]”是多于 200 且最多 250，即 200 < y ≤ 250；
 * “[150, 200]”两端都包含；“[200, 250)”是至少 200 且少于 250。
 */
export function intervalMeaning(bin, digits) {
  const places = digits ?? Math.max(decimalsOf(bin?.lower), decimalsOf(bin?.upper));
  const low = formatTrim(bin?.lower, places);
  const high = formatTrim(bin?.upper, places);
  const lowWords = bin?.leftClosed ? RELATION_WORDS['at-least'] : RELATION_WORDS['more-than'];
  const highWords = bin?.rightClosed ? RELATION_WORDS['at-most'] : RELATION_WORDS['less-than'];
  return {
    zh: `${lowWords.zh} ${low}，并且${highWords.zh} ${high}`,
    en: `${lowWords.en} ${low} and ${highWords.en} ${high}`,
    inequality: `${low} ${bin?.leftClosed ? '≤' : '<'} y ${bin?.rightClosed ? '≤' : '<'} ${high}`,
  };
}

/**
 * Everything the widget says about a selected bar: { interval, inequality, meaning, frequency, values, hidden }.
 * `frequency` is "11 / 30 ≈ 0.367 (36.7%)"; `values` lists the bar's values (with `decimals`), at most
 * MAX_LISTED_VALUES of them, and `hidden` counts the rest.
 * 组件对选中柱子要说的全部内容：区间、不等式、含义、频数（如“11 / 30 ≈ 0.367 (36.7%)”）、柱子里的值
 * （按 decimals 位小数，最多 MAX_LISTED_VALUES 个），hidden 是没列出的个数。
 */
export function binDetail(bin, layout, { decimals = 0 } = {}) {
  const digits = edgeDigits(layout);
  const meaning = intervalMeaning(bin, digits);
  const n = layout?.n ?? 0;
  const part = { numerator: bin.count, denominator: n, value: n ? bin.count / n : NaN };
  const values = bin.values ?? [];
  return {
    interval: formatInterval(bin, digits),
    inequality: meaning.inequality,
    meaning: { zh: meaning.zh, en: meaning.en },
    frequency: `${formatFraction(part)} (${formatPercent(part.value, STAT_DIGITS.percent)})`,
    values: values.slice(0, MAX_LISTED_VALUES).map((value) => formatTrim(value, decimals)).join(', '),
    hidden: Math.max(0, values.length - MAX_LISTED_VALUES),
  };
}

/**
 * Plain facts about the bars, never a shape label: { peak, gaps } as bilingual sentences. `peak` names the
 * tallest bar (or bars); `gaps` lists the empty bins, which the slides call gaps (M3 p.9).
 * 关于柱子的客观事实（不给形状下结论）：peak 说出最高的柱子；gaps 列出空组，课件把它们叫作缺口（第 3 单元第 9 页）。
 */
export function binFacts(layout) {
  const digits = edgeDigits(layout);
  const interval = (index) => formatInterval(layout.bins[index], digits);
  const peaks = layout?.peaks ?? [];
  const gaps = layout?.gaps ?? [];
  let peak;
  if (!peaks.length) {
    peak = { zh: '没有数据。', en: 'No data.' };
  } else if (peaks.length === 1) {
    peak = {
      zh: `最高的柱子：${interval(peaks[0])}，有 ${layout.maxCount} 个个案。`,
      en: `Tallest bar: ${interval(peaks[0])} with ${plural(layout.maxCount, 'case')}.`,
    };
  } else {
    const names = peaks.map(interval);
    peak = {
      zh: `最高的柱子有 ${peaks.length} 根：${names.join('、')}，各有 ${layout.maxCount} 个个案。`,
      en: `Tallest bars: ${listEn(names)}, with ${plural(layout.maxCount, 'case')} each.`,
    };
  }
  const gapNames = gaps.map(interval);
  const gapText = gapNames.length
    ? {
      zh: `缺口（gap，没有个案的组）：${gapNames.join('、')}。`,
      en: `${gapNames.length === 1 ? 'Gap (a bin with no cases)' : 'Gaps (bins with no cases)'}: ${listEn(gapNames)}.`,
    }
    : {
      zh: '没有缺口（gap）：从最小值到最大值，每一组都至少有一个个案。',
      en: 'No gaps: every bin from the smallest to the largest value has at least one case.',
    };
  return { peak, gaps: gapText };
}

/**
 * What changed after the width, start or boundary rule moved, for the screen-reader announcement.
 * 组距、起点或区间规则改变后，给读屏软件播报的内容。
 */
export function layoutAnnouncement(layout) {
  const count = layout?.bins?.length ?? 0;
  if (!count) return { zh: '没有数据。', en: 'No data.' };
  const digits = edgeDigits(layout);
  const width = formatTrim(layout.width, decimalsOf(layout.width));
  const first = formatTrim(layout.edges[0], digits);
  const last = formatTrim(layout.edges[layout.edges.length - 1], digits);
  const tallest = formatInterval(layout.bins[layout.peaks[0]], digits);
  return {
    zh: `组距 ${width}：${count} 个组，从 ${first} 到 ${last}。最高的柱子是 ${tallest}（${layout.maxCount}）。`,
    en: `Bin width ${width}: ${plural(count, 'bin')} from ${first} to ${last}. Tallest bar ${tallest} (${layout.maxCount}).`,
  };
}

/**
 * Text alternative of the histogram picture: { zh, en }. Up to 12 bins are listed with their frequencies;
 * longer tables are left to the frequency table under the picture.
 * 直方图的文字替代：12 组以内逐组列出频数；组更多时请读者看图下面的频数表。
 */
export function histogramAltText(layout, variable) {
  const name = toBi(variable, FALLBACK_VARIABLE);
  const count = layout?.bins?.length ?? 0;
  const digits = edgeDigits(layout);
  const width = formatTrim(layout?.width, decimalsOf(layout?.width));
  const bars = count <= 12
    ? (layout?.bins ?? []).map((bin) => `${formatInterval(bin, digits)} ${bin.count}`).join('; ')
    : '';
  return {
    zh: `${name.zh || name.en}的直方图：${count} 个组，组距 ${width}。${bars ? '' : '各组频数见下面的频数表。'}`,
    en: `Histogram of ${name.en || name.zh}: ${plural(count, 'bin')} of width ${width}${bars ? `: ${bars}.` : '; the frequency table below lists every bin.'}`,
  };
}

/* ---------- Reading percentages from the bars 从柱子读百分比 ---------- */

/**
 * The two relations whole bars can answer: "at most" and "more than" for right-closed bins (a, b], "less than"
 * and "at least" for left-closed bins [a, b).
 * 整根柱子能回答的两种关系：右闭 (a, b] 时是“最多”和“多于”，左闭 [a, b) 时是“少于”和“至少”。
 */
export function readableRelations(closed) {
  return closed === 'left' ? ['less-than', 'at-least'] : ['at-most', 'more-than'];
}

/** Words of a relation for the relation control: { zh, en, symbol }. 关系控件用的文字：{ zh, en, symbol }。 */
export function relationWords(relation) {
  const words = RELATION_WORDS[relation] ?? RELATION_WORDS['at-most'];
  return { zh: words.zh, en: words.en, symbol: words.symbol };
}

/** The edges a question can cut at: every edge between two bins. 问题可以切开的位置：两组之间的每条边界。 */
export function cutOptions(layout) {
  return (layout?.edges ?? []).slice(1, -1);
}

/**
 * Reads "what percentage of the cases are <relation> <cut>?" from the bars. Returns null unless `cut` is an
 * edge between two bins; otherwise { relation, cut, closed, readable, bins (indexes of the bars on the side
 * of the question), cutBin (the bar that holds values equal to the cut), barTotal (what adding those bars
 * gives), count (the true count from the raw data), values (those data values), onCut (values equal to the
 * cut), n, proportion }. When `readable` is true barTotal always equals count.
 * 从柱子读出“百分之多少的个案 <关系> <分界点>？”。cut 不是两组之间的边界时返回 null；否则返回关系、分界点、区间规则、
 * readable（柱子能否回答）、bins（问题那一侧的柱子序号）、cutBin（装着等于分界点的值的那根柱子）、
 * barTotal（把那些柱子加起来得到的数）、count（按原始数据数出的真实个数）、values（这些数据值）、
 * onCut（正好等于分界点的个数）、n 和 proportion。readable 为 true 时 barTotal 一定等于 count。
 */
export function readFromBins(layout, values, { relation, cut } = {}) {
  const kind = READING_RELATIONS.includes(relation) ? relation : readableRelations(layout?.closed)[0];
  const edges = layout?.edges ?? [];
  const target = toNumber(cut);
  const at = target === null ? -1 : edges.findIndex((edge, index) => index > 0 && index < edges.length - 1 && nearlyEqual(edge, target));
  if (at < 0) return null;
  const point = edges[at];
  const lowSide = kind === 'at-most' || kind === 'less-than';
  const bins = lowSide ? layout.bins.slice(0, at) : layout.bins.slice(at);
  const sorted = sortAscending(values);
  const matches = sorted.filter((value) => RELATION_TESTS[kind](value, point));
  return {
    relation: kind,
    cut: point,
    closed: layout.closed,
    readable: readableRelations(layout.closed).includes(kind),
    bins: bins.map((bin) => bin.index),
    cutBin: layout.closed === 'left' ? at : at - 1,
    barTotal: bins.reduce((total, bin) => total + bin.count, 0),
    count: matches.length,
    values: matches,
    onCut: sorted.filter((value) => nearlyEqual(value, point)).length,
    n: sorted.length,
    proportion: sorted.length ? matches.length / sorted.length : NaN,
  };
}

/**
 * A count over n the way the course writes it: the proportion with 2 decimals when that is exact ("6/30 =
 * 0.20", M3 p.14), otherwise 3 or 4 ("13/35 ≈ 0.3714", Module 3 practice Q3b), and the percentage with 2 fewer
 * decimals ("20%", "37.14%"). Returns { count, n, proportion, percent, sign, proportionText, percentSign,
 * percentText }.
 * 按课程写法写出“个数 / n”：比例在 2 位小数精确时保留 2 位（“6/30 = 0.20”，第 3 单元第 14 页），
 * 否则保留 3 或 4 位（“13/35 ≈ 0.3714”，第 3 单元练习 Q3b）；百分比少 2 位小数（“20%”“37.14%”）。
 */
export function shareOf(count, n) {
  const proportion = n > 0 ? count / n : NaN;
  const digits = [2, 3, 4].find((places) => relationSign(proportion, places) === '=') ?? 4;
  const percent = proportion * 100;
  return {
    count,
    n,
    proportion,
    percent,
    sign: relationSign(proportion, digits),
    proportionText: formatFixed(proportion, digits),
    percentSign: relationSign(percent, digits - 2),
    percentText: `${formatTrim(percent, digits - 2)}%`,
  };
}

// "at most 200 kcal (200 or less)", "more than 300 kcal": the course's wording of each relation (M3 p.13-20).
// “最多 200 kcal（200 或更少）”“多于 300 kcal”：课程对每种关系的说法（第 3 单元第 13-20 页）。
function relationPhrase(relation, cutText, unit) {
  const value = withUnit(cutText, unit);
  if (relation === 'at-most') return { zh: `最多 ${value}（${cutText} 或更少）`, en: `at most ${value} (${cutText} or less)` };
  if (relation === 'at-least') return { zh: `至少 ${value}（${cutText} 或更多）`, en: `at least ${value} (${cutText} or more)` };
  const words = RELATION_WORDS[relation] ?? RELATION_WORDS['more-than'];
  return { zh: `${words.zh} ${value}`, en: `${words.en} ${value}` };
}

// The bars on one side of the cut, by name: "(300, 350] and (350, 400]", or "the 12 bars from ... to ...".
// 分界点一侧的柱子的名字：“(300, 350] 和 (350, 400]”，太多时写“从……到……的 12 根柱子”。
function barNames(layout, indexes) {
  const digits = edgeDigits(layout);
  const names = indexes.map((index) => formatInterval(layout.bins[index], digits));
  if (names.length <= 4) return { zh: names.join('、'), en: listEn(names) };
  return {
    zh: `从 ${names[0]} 到 ${names[names.length - 1]} 的 ${names.length} 根柱子`,
    en: `the ${names.length} bars from ${names[0]} to ${names[names.length - 1]}`,
  };
}

/**
 * The worked answer to a reading, in the course's style (M3 p.14-20, Module 3 practice Q3b): { question, steps,
 * warning, answer, rCode }, where every text is { zh, en } and rCode is the R line of the slides
 * ("length(y[y >= 300])"). Bars that can answer are added up; otherwise the steps explain why they cannot,
 * count the raw data, and the warning says what adding the bars would have given.
 * 按课程风格写出读数的完整解答（第 3 单元第 14-20 页、练习 Q3b）：问题、步骤、提醒、答案句和课件里的 R 代码
 * （“length(y[y >= 300])”）。柱子能回答时把柱子加起来；不能回答时，步骤说明原因并改数原始数据，提醒说出把柱子加起来会得到什么。
 */
export function readingText(reading, layout, { unit = '' } = {}) {
  const digits = edgeDigits(layout);
  const cutText = formatTrim(reading.cut, digits);
  const phrase = relationPhrase(reading.relation, cutText, unit);
  const share = shareOf(reading.count, reading.n);
  const rule = reading.closed === 'left' ? '[a, b)' : '(a, b]';
  const lowSide = reading.relation === 'at-most' || reading.relation === 'less-than';
  const side = lowSide ? { zh: '左边', en: 'left' } : { zh: '右边', en: 'right' };
  const rCode = `length(y[y ${RELATION_WORDS[reading.relation].r} ${String(roundTo(reading.cut, digits))}])`;
  const { count, n } = reading;
  const about = share.percentSign === '=' ? { zh: '', en: '' } : { zh: '约', en: 'about ' };
  const divide = {
    zh: `除以 n = ${n}：${count} / ${n} ${share.sign} ${share.proportionText}（比例 proportion）。`,
    en: `Divide by n = ${n}: ${count} / ${n} ${share.sign} ${share.proportionText} in proportion.`,
  };
  const percent = {
    zh: `换成百分比：${count} / ${n} ${TIMES} 100 ${share.percentSign} ${share.percentText}。`,
    en: `As a percentage: ${count} / ${n} ${TIMES} 100 ${share.percentSign} ${share.percentText}.`,
  };
  const question = {
    zh: `有百分之多少的个案${phrase.zh}？`,
    en: `What percentage of the cases have ${phrase.en}?`,
  };
  const answer = {
    zh: `${n} 个个案中有 ${count} 个${phrase.zh}。也就是说，比例是 ${count}/${n} ${share.sign} ${share.proportionText}（即${about.zh} ${share.percentText}）。`,
    en: `${count} of the ${n} cases ${count === 1 ? 'has' : 'have'} ${phrase.en}. That is, ${count}/${n} ${share.sign} ${share.proportionText} in proportion (or ${about.en}${share.percentText}).`,
  };

  if (reading.readable) {
    const names = barNames(layout, reading.bins);
    const owner = reading.closed === 'left' ? { zh: '右边', en: 'right' } : { zh: '左边', en: 'left' };
    const counts = reading.bins.map((index) => layout.bins[index].count);
    const add = counts.length === 1
      ? { zh: `这根柱子的频数是 ${count}。`, en: `The frequency of this bar is ${count}.` }
      : {
        zh: `把这些柱子的频数加起来：${counts.join(' + ')} = ${count}。`,
        en: `Add their frequencies: ${counts.join(' + ')} = ${count}.`,
      };
    return {
      question,
      steps: [
        {
          zh: `组是 ${rule} 形式时，正好等于 ${cutText} 的值算在 ${cutText} ${owner.zh}的柱子里。所以 ${cutText} ${side.zh}的柱子装的正好是所有${phrase.zh}的值：${names.zh}。`,
          en: `With bins ${rule}, a value equal to ${cutText} belongs to the bar on the ${owner.en} of ${cutText}. So the bars to the ${side.en} of ${cutText} hold exactly the values that are ${phrase.en}: ${names.en}.`,
        },
        add,
        divide,
        percent,
      ],
      warning: null,
      answer,
      rCode,
    };
  }

  const cutBin = formatInterval(layout.bins[reading.cutBin], digits);
  const mixed = reading.closed === 'left' ? { zh: '大于', en: 'greater' } : { zh: '小于', en: 'less' };
  const listed = count && count <= 12 ? reading.values.map((value) => formatTrim(value, dataDecimals(reading.values))) : [];
  const valueWord = count === 1 ? 'value is' : 'values are';
  let warning;
  if (reading.barTotal !== count) {
    const naive = shareOf(reading.barTotal, n);
    const missed = count > reading.barTotal;
    warning = {
      zh: `如果把 ${cutText} ${side.zh}的柱子加起来，会得到 ${reading.barTotal} / ${n} ${naive.percentSign} ${naive.percentText}：`
        + `${missed ? '漏掉了' : '多算了'} ${reading.onCut} 个正好等于 ${cutText} 的值。`,
      en: `Adding the bars to the ${side.en} of ${cutText} would give ${reading.barTotal} / ${n} ${naive.percentSign} ${naive.percentText}: `
        + `it ${missed ? 'misses' : 'wrongly counts'} the ${plural(reading.onCut, 'value')} equal to ${cutText}.`,
    };
  } else {
    warning = {
      zh: `这组数据里没有值正好等于 ${cutText}，所以把柱子加起来碰巧也对；但只有看原始数据才知道这一点。`,
      en: `In these data no value equals ${cutText}, so adding the bars happens to give the same count; only the raw data can show that.`,
    };
  }
  return {
    question,
    steps: [
      {
        zh: `柱子回答不了这个问题。组是 ${rule} 形式时，正好等于 ${cutText} 的值落在柱子 ${cutBin} 里，和${mixed.zh} ${cutText} 的值混在一起，所以整根整根的柱子分不出${phrase.zh}的值。`,
        en: `The bars cannot answer this. With bins ${rule}, a value equal to ${cutText} sits in the bar ${cutBin} together with values ${mixed.en} than ${cutText}, so whole bars cannot pick out the values that are ${phrase.en}.`,
      },
      {
        zh: `改用原始数据来数，就像课件在 R 里用 \`${rCode}\`：有 ${count} 个值${phrase.zh}${listed.length ? `：${listed.join(', ')}` : ''}。`,
        en: `Count the raw data instead, as the slides do in R with \`${rCode}\`: ${count} ${valueWord} ${phrase.en}${listed.length ? `, namely ${listed.join(', ')}` : ''}.`,
      },
      divide,
      percent,
    ],
    warning,
    answer,
    rCode,
  };
}

/* ---------- Dotplot 点图 ---------- */

/**
 * Stacks of the dotplot (M3 p.26): one dot per case, equal values stacked. When some values are closer than
 * about a fortieth of the range, values are grouped into intervals of a nice width, like ggplot2's
 * geom_dotplot(binwidth = ...), and each stack sits at the middle of its interval. Returns { grouped, width
 * (the group width, or the smallest gap between stacks when not grouped), stacks: [{ value, lower, upper,
 * count, values }], maxCount }. The donut calories stay ungrouped: 1 dot at 180, 3 at 190, ..., 5 at 270.
 * 点图的叠放（第 3 单元第 26 页）：每个个案一个点，相同的值叠起来。有些值相距不到全距的约四十分之一时，
 * 把值按整齐的宽度分进小区间（像 ggplot2 的 geom_dotplot(binwidth = ...)），每一叠画在小区间的中点。
 * 返回 grouped、width（分组宽度；不分组时为相邻两叠的最小间距）、stacks 与 maxCount。
 * 甜甜圈热量不需要分组：180 有 1 个点，190 有 3 个……270 有 5 个。
 */
export function dotplotStacks(values) {
  const counts = valueCounts(values);
  if (!counts.length) return { grouped: false, width: NaN, stacks: [], maxCount: 0 };
  const span = counts[counts.length - 1].value - counts[0].value;
  let gap = Infinity;
  for (let index = 1; index < counts.length; index += 1) gap = Math.min(gap, counts[index].value - counts[index - 1].value);
  if (counts.length === 1 || gap >= (span / DOT_COLUMNS) * (1 - EPSILON)) {
    const stacks = counts.map(({ value, count }) => ({ value, lower: value, upper: value, count, values: new Array(count).fill(value) }));
    return {
      grouped: false,
      width: counts.length > 1 ? gap : NaN,
      stacks,
      maxCount: stacks.reduce((most, stack) => Math.max(most, stack.count), 0),
    };
  }
  const width = niceStep(span, DOT_COLUMNS);
  const digits = Math.max(decimalsOf(width), dataDecimals(counts.map((item) => item.value)));
  const origin = Math.floor(counts[0].value / width + EPSILON) * width;
  const groups = new Map();
  for (const value of sortAscending(values)) {
    const index = Math.floor((value - origin) / width + EPSILON);
    if (!groups.has(index)) groups.set(index, []);
    groups.get(index).push(value);
  }
  const stacks = [...groups.entries()].map(([index, list]) => ({
    value: roundTo(origin + (index + 0.5) * width, digits + 1),
    lower: roundTo(origin + index * width, digits),
    upper: roundTo(origin + (index + 1) * width, digits),
    count: list.length,
    values: list,
  }));
  return { grouped: true, width, stacks, maxCount: stacks.reduce((most, stack) => Math.max(most, stack.count), 0) };
}

/**
 * The words around the dotplot: { note (under the plot), alt (its short text alternative), rows (the table
 * behind it: [{ label, count }], one row per stack) }.
 * 点图周围的文字：note（图下的说明）、alt（简短的文字替代）、rows（图背后的表格，每一叠一行）。
 */
export function dotplotText(dots, variable) {
  const name = toBi(variable, FALLBACK_VARIABLE);
  const total = dots.stacks.reduce((sum, stack) => sum + stack.count, 0);
  const alt = {
    zh: `${name.zh || name.en}的点图：${total} 个点，最高的一叠有 ${dots.maxCount} 个点。每一叠见下面的表格。`,
    en: `Dotplot of ${name.en || name.zh}: ${plural(total, 'dot')}; the tallest stack has ${dots.maxCount}. The table below lists every stack.`,
  };
  if (!dots.grouped) {
    const digits = dataDecimals(dots.stacks.map((stack) => stack.value));
    return {
      note: {
        zh: '每个点代表一个个案（case）；相同的值往上叠。叠得越高，这个值出现得越多。',
        en: 'Each dot is one case; equal values stack up. The taller the stack, the more often that value occurs.',
      },
      alt,
      rows: dots.stacks.map((stack) => ({ label: formatTrim(stack.value, digits), count: stack.count })),
    };
  }
  const digits = Math.max(decimalsOf(dots.width), ...dots.stacks.map((stack) => decimalsOf(stack.lower)));
  const width = formatTrim(dots.width, decimalsOf(dots.width));
  return {
    note: {
      zh: `每个点代表一个个案。有些值靠得太近，所以像 ggplot2 的 geom_dotplot(binwidth = ${width}) 一样，把同一个宽 ${width} 的小区间里的值叠在一起，画在小区间的中点。`,
      en: `Each dot is one case. Some values are very close, so, like ggplot2's geom_dotplot(binwidth = ${width}), the values in each interval of width ${width} share one stack, drawn at the middle of the interval.`,
    },
    alt,
    rows: dots.stacks.map((stack) => ({
      label: formatInterval({ lower: stack.lower, upper: stack.upper, leftClosed: true, rightClosed: false }, digits),
      count: stack.count,
    })),
  };
}

/* ---------- Stem-and-leaf display 茎叶图 ---------- */

/**
 * Leaf units the stem-and-leaf control offers: the current one (the configured power of ten, or the default)
 * and its neighbours a tenth and ten times as large, when they are not finer than the data's decimals and need
 * 2 to MAX_STEM_LINES lines. The donuts get 1 and 10 (100 would put every value on a single stem).
 * 茎叶图控件给的叶单位：当前的（配置的 10 的整数次幂或默认值），以及它的十分之一和十倍——前提是不比数据本身的小数位更细，
 * 并且需要 2 到 MAX_STEM_LINES 行。甜甜圈得到 1 和 10（100 会让所有值挤在同一个茎上）。
 */
export function leafUnitOptions(values, leafUnit) {
  const sorted = sortAscending(values);
  if (!sorted.length) return [];
  const base = usableLeafUnit(sorted, leafUnit) ?? defaultLeafUnit(sorted);
  const resolution = 10 ** -dataDecimals(sorted);
  const lines = (unit) => {
    const display = stemAndLeaf(sorted, { leafUnit: unit });
    return nearlyEqual(display.leafUnit, unit) ? display.lines.length : Infinity;
  };
  const options = [base];
  const finer = roundTo(base / 10, decimalsOf(base) + 1);
  if (finer >= resolution * (1 - EPSILON) && lines(finer) <= MAX_STEM_LINES) options.unshift(finer);
  const coarser = roundTo(base * 10, Math.max(0, decimalsOf(base) - 1));
  const coarserLines = lines(coarser);
  if (coarserLines >= 2 && coarserLines <= MAX_STEM_LINES) options.push(coarser);
  return options;
}

/**
 * Whether the stems start split into two lines (leaves 0-4, then 5-9): when one line per stem gives fewer
 * than 5 lines, as for the donuts, whose R output on M3 p.23 is split ("a value of a stem is repeated").
 * 茎是否一开始就拆成两行（叶 0-4，然后 5-9）：每个茎一行时不到 5 行就拆，例如甜甜圈，
 * 它在第 3 单元第 23 页的 R 输出就是拆开的（“茎的值重复出现”）。
 */
export function defaultSplit(values, leafUnit) {
  const plain = stemAndLeaf(values, { leafUnit }).lines.length;
  const split = stemAndLeaf(values, { leafUnit, split: true }).lines.length;
  return plain > 0 && plain < 5 && split > plain && split <= 2 * MAX_STEM_LINES;
}

/**
 * The line R's stem() prints above the display: "The decimal point is 2 digit(s) to the right of the |" when
 * stems count hundreds (M3 p.23-24), "The decimal point is at the |" for ones, "... to the left of the |"
 * for tenths and smaller.
 * R 的 stem() 在茎叶图上方打印的那一行：茎以百为单位时是“The decimal point is 2 digit(s) to the right of the |”
 * （第 3 单元第 23-24 页），以一为单位时是“The decimal point is at the |”，十分之一及更小时是“... to the left of the |”。
 */
export function decimalPointNote(stemUnit) {
  const digits = Math.round(Math.log10(toNumber(stemUnit, 1)));
  if (!Number.isFinite(digits) || digits === 0) return 'The decimal point is at the |';
  return digits > 0
    ? `The decimal point is ${digits} digit(s) to the right of the |`
    : `The decimal point is ${-digits} digit(s) to the left of the |`;
}

/**
 * The stem-and-leaf display with what the widget prints: stemAndLeaf's { n, leafUnit, stemUnit, split, rounded,
 * lines } where each line also has { label, leafText, count, start }, plus note (R's decimal-point line), key
 * (the first leaf: { stem, leaf, value }, so "1 | 8" means 180), first and last (the leaves that show the
 * minimum and the maximum) and lineWidth (how much of the scale one line covers).
 * 组件要显示的茎叶图：stemAndLeaf 的结果，每行再加上 label、leafText、count、start；另有 note（R 的小数点说明）、
 * key（第一片叶子，例如“1 | 8”表示 180）、first 与 last（显示最小值和最大值的叶子），以及 lineWidth（一行覆盖的数值范围）。
 */
export function stemDisplay(values, { leafUnit, split = false } = {}) {
  const display = stemAndLeaf(values, { leafUnit, split: split === true });
  const digits = decimalsOf(display.leafUnit);
  const leafValue = (line, leaf) => roundTo((line.negative ? -1 : 1) * (line.stem * display.stemUnit + leaf * display.leafUnit), digits);
  const lines = display.lines.map((line) => ({
    ...line,
    label: formatStemLabel(line),
    leafText: line.leaves.join(''),
    count: line.leaves.length,
  }));
  const filled = lines.filter((line) => line.count);
  const leafAt = (line, leaf) => ({ stem: line.label, leaf, value: leafValue(line, leaf) });
  // The first leaf of the first filled line is the minimum and the last leaf of the last line the maximum.
  // 第一行（有叶的）的第一片叶子是最小值，最后一行的最后一片叶子是最大值。
  const top = filled[0];
  const bottom = filled[filled.length - 1];
  const first = top ? leafAt(top, top.leaves[0]) : null;
  const last = bottom ? leafAt(bottom, bottom.leaves[bottom.leaves.length - 1]) : null;
  return {
    ...display,
    lines,
    note: decimalPointNote(display.stemUnit),
    key: first,
    first,
    last,
    lineWidth: roundTo(display.stemUnit / (display.split ? 2 : 1), digits),
  };
}

/**
 * The sentences under the display: { key, ends, rounded, tilt } as { zh, en } (rounded is null when no value
 * lost digits). `ends` reads the minimum and the maximum off the first and the last leaf (M3 p.24-25).
 * 茎叶图下面的句子：key（读法）、ends（第一片和最后一片叶子就是最小值和最大值，第 3 单元第 24-25 页）、
 * rounded（有值被取整时的提醒，否则为 null）和 tilt（歪头看形状）。
 */
export function stemText(display, { unit = '', decimals = 0 } = {}) {
  if (!display.key) return { key: null, ends: null, rounded: null, tilt: null };
  const digits = decimalsOf(display.leafUnit);
  const leafUnit = formatTrim(display.leafUnit, digits);
  const show = (leaf) => withUnit(formatTrim(leaf.value, digits), unit);
  const width = withUnit(formatTrim(display.lineWidth, digits), unit);
  const values = display.lines.flatMap((line) => line.values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    key: {
      zh: `读法：${display.key.stem} | ${display.key.leaf} 表示 ${show(display.key)}（叶的单位 leaf unit 是 ${leafUnit}）。`,
      en: `Key: ${display.key.stem} | ${display.key.leaf} means ${show(display.key)} (leaf unit ${leafUnit}).`,
    },
    ends: {
      zh: `最小值看第一片叶子：${display.first.stem} | ${display.first.leaf}，即 ${show(display.first)}。最大值看最后一片叶子：${display.last.stem} | ${display.last.leaf}，即 ${show(display.last)}。`,
      en: `The minimum is the first leaf, ${display.first.stem} | ${display.first.leaf}, which is ${show(display.first)}. The maximum is the last leaf, ${display.last.stem} | ${display.last.leaf}, which is ${show(display.last)}.`,
    },
    rounded: display.rounded
      ? {
        zh: `注意：像 R 的 stem() 一样，每个值先按叶的单位四舍五入，所以叶子显示的可能是取整后的值（实际最小值 ${withUnit(formatTrim(min, decimals), unit)}，最大值 ${withUnit(formatTrim(max, decimals), unit)}）。`,
        en: `Note: like R's stem(), every value is first rounded to the leaf unit, so a leaf can show a rounded value (the actual minimum is ${withUnit(formatTrim(min, decimals), unit)} and the maximum ${withUnit(formatTrim(max, decimals), unit)}).`,
      }
      : null,
    tilt: {
      zh: `每一行覆盖 ${width} 的范围，就像组距为 ${width} 的一根柱子。把头向右歪，就能看出分布的形状（从最小值到最大值）。`,
      en: `Each line covers ${width}, like a bar of width ${width}. Tilt your head to the right to see the shape, from the minimum to the maximum.`,
    },
  };
}

/** Screen-reader announcement after the leaf unit or the split changed. 叶单位或拆分改变后的读屏播报。 */
export function stemAnnouncement(display) {
  const leafUnit = formatTrim(display.leafUnit, decimalsOf(display.leafUnit));
  return {
    zh: `叶的单位 ${leafUnit}：${display.lines.length} 行${display.split ? '，每个茎拆成两行' : ''}。`,
    en: `Leaf unit ${leafUnit}: ${plural(display.lines.length, 'line')}${display.split ? ', each stem split in two' : ''}.`,
  };
}

/* ---------- Centre: mean and median 中心：平均数与中位数 ---------- */

/**
 * The numbers of the centre panel: { n, sorted, sum, mean, median, medianRank, medianPositions, medianMiddle,
 * min, max, range, decimals, digits: { value, mean, median } }. Values print with their own decimals, the mean
 * with at least 2 (12.13, practice Q1b) and the median with one more than the data (the average of two values).
 * 中心面板的数字。数值按自己的小数位显示，平均数至少 2 位小数（12.13，练习 Q1b），中位数比数据多一位（两个值的平均）。
 */
export function centreSummary(values) {
  const info = medianInfo(values);
  const { n, sorted } = info;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const decimals = dataDecimals(sorted);
  return {
    n,
    sorted,
    sum: total,
    mean: n ? total / n : NaN,
    median: info.value,
    medianRank: info.rank,
    medianPositions: info.positions,
    medianMiddle: info.middle,
    min: n ? sorted[0] : NaN,
    max: n ? sorted[n - 1] : NaN,
    range: n ? sorted[n - 1] - sorted[0] : NaN,
    decimals,
    digits: {
      value: decimals,
      mean: Math.max(STAT_DIGITS.value, decimals),
      median: Math.max(STAT_DIGITS.value, decimals + 1),
    },
  };
}

/**
 * The short labels of the summary strip and the marker legend: { n, mean, median, min, max }, such as
 * "n = 30", "ȳ = 251 kcal" and "250 kcal".
 * 概览条和标记线图例的短标签，例如“n = 30”“ȳ = 251 kcal”“250 kcal”。
 */
export function summaryLabels(summary, unit = '') {
  const { digits } = summary;
  return {
    n: `n = ${summary.n}`,
    mean: `ȳ ${relationSign(summary.mean, digits.mean)} ${withUnit(formatTrim(summary.mean, digits.mean), unit)}`,
    median: withUnit(formatTrim(summary.median, digits.median), unit),
    min: withUnit(formatTrim(summary.min, digits.value), unit),
    max: withUnit(formatTrim(summary.max, digits.value), unit),
  };
}

// The variable's name for a sentence in one language, falling back to the other language.
// 句子里用的变量名（某一种语言），缺失时用另一种语言。
function variableName(variable, language) {
  const name = toBi(variable, FALLBACK_VARIABLE);
  const other = language === 'zh' ? 'en' : 'zh';
  return (name[language] || name[other]).trim();
}

/**
 * The worked centre with the instructor's sentences (M3 p.30-35, course brief): { meanWork (ȳ = Σy / n =
 * (180 + 190 + ⋯ + 400) / 30 = 7530 / 30 = 251 kcal), medianPosition (0.5 × (n + 1) = 15.5), medianRule,
 * meanSentence ("On average, [cases] have 251 kcal."), medianSentence ("The median calories is 250 kcal. This
 * means that 50% of [cases] have at most 250 kcal (250 or less), whereas 50% have more than 250 kcal."),
 * placeholderHint, hint (mean against median, with its relation), caution (the donuts of p.35), describe
 * (shape, centre, spread and outliers in the practice style) }. [cases] and [units] are left for the learner. The
 * variable's English name is written as it reads inside a sentence ("Calories" becomes "calories").
 * 中心的完整计算和老师的句型（第 3 单元第 30-35 页、课程简报）：平均数算式、中位数位置、中位数规则、平均数句、中位数句、
 * 占位词提示、平均数与中位数比较的提示（及其关系）、第 35 页甜甜圈的提醒，以及练习风格的“形状、中心、分散、离群值”描述。
 * [个案]、[单位] 留给学习者按题目填写。变量的英文名按句中写法给出（“Calories”写成“calories”）。
 */
export function centreTexts(summary, { variable, unit = '' } = {}) {
  const { n, digits } = summary;
  const value = (number) => formatTrim(number, digits.value);
  const meanNumber = formatTrim(summary.mean, digits.mean);
  const medianNumber = formatTrim(summary.median, digits.median);
  const meanSign = relationSign(summary.mean, digits.mean);
  const meanText = withUnit(meanNumber, unit);
  const medianText = withUnit(medianNumber, unit);
  const nameEn = nameInSentence(variableName(variable, 'en'));
  const nameZh = variableName(variable, 'zh');
  const [first, second] = summary.medianPositions;
  const [low, high] = summary.medianMiddle;

  const meanWork = n
    ? `ȳ = Σy / n = (${formatTerms(summary.sorted, { digits: digits.value, maxTerms: 4 })}) / ${n} = ${value(summary.sum)} / ${n} ${meanSign} ${meanText}`
    : 'ȳ = —';
  const medianPosition = `0.5 ${TIMES} (n + 1) = 0.5 ${TIMES} (${n} + 1) = ${formatTrim(summary.medianRank, 1)}`;
  const medianRule = second
    ? {
      zh: `n = ${n} 是偶数，所以中位数是第 ${first} 个和第 ${second} 个有序值的平均：(${formatOperand(low, digits.value)} + ${formatOperand(high, digits.value)}) / 2 = ${medianText}。`,
      en: `n = ${n} is even, so the median is the average of the ${ordinal(first)} and the ${ordinal(second)} ordered values: (${formatOperand(low, digits.value)} + ${formatOperand(high, digits.value)}) / 2 = ${medianText}.`,
    }
    : {
      zh: `n = ${n} 是奇数，所以中位数就是第 ${first} 个有序值：${medianText}。`,
      en: `n = ${n} is odd, so the median is the ${ordinal(first)} ordered value: ${medianText}.`,
    };

  // Without a unit in the config, the template keeps its [units] slot for the learner to fill.
  // 配置里没有单位时，句型保留 [单位] 这个空让学习者填写。
  const meanAmount = unit
    ? { zh: meanText, en: meanText }
    : { zh: `${meanNumber} ${UNITS.zh}`, en: `${meanNumber} ${UNITS.en}` };
  const meanSentence = {
    zh: `平均来说，${CASES.zh} 的${nameZh}是 ${meanAmount.zh}。`,
    en: `On average, ${CASES.en} have ${meanAmount.en}.`,
  };
  const medianSentence = {
    zh: `${nameZh}的中位数是 ${medianText}。也就是说，50% 的 ${CASES.zh} 最多 ${medianText}（${medianNumber} 或更少），另外 50% 多于 ${medianText}。`,
    en: `The median ${nameEn} is ${medianText}. This means that 50% of ${CASES.en} have at most ${medianText} (${medianNumber} or less), whereas 50% have more than ${medianText}.`,
  };
  const placeholderHint = unit
    ? {
      zh: `考试时把 ${CASES.zh} 换成题目里的个案，例如 Tim Hortons donuts。`,
      en: `On a test, replace ${CASES.en} with the cases of the question, for example Tim Hortons donuts.`,
    }
    : {
      zh: `考试时把 ${CASES.zh} 换成题目里的个案（例如 Tim Hortons donuts），把 ${UNITS.zh} 换成变量的单位。`,
      en: `On a test, replace ${CASES.en} with the cases of the question (for example Tim Hortons donuts) and ${UNITS.en} with the units of the variable.`,
    };

  return {
    meanWork,
    medianPosition,
    medianRule,
    meanSentence,
    medianSentence,
    placeholderHint,
    hint: meanMedianHint(summary, unit),
    caution: slideCaution(),
    describe: describeLines(summary, unit),
  };
}

/**
 * Mean against median as a hint, never as a shape label (M3 p.35, p.42): { relation ('greater', 'less' or
 * 'equal', comparing the printed numbers), zh, en }.
 * 把平均数和中位数的比较作为提示，而不是形状的结论（第 3 单元第 35、42 页）：relation 比较的是显示出来的数字。
 */
export function meanMedianHint(summary, unit = '') {
  const { digits } = summary;
  const mean = roundTo(summary.mean, digits.mean);
  const median = roundTo(summary.median, digits.median);
  const meanText = withUnit(formatTrim(summary.mean, digits.mean), unit);
  const medianText = withUnit(formatTrim(summary.median, digits.median), unit);
  if (mean > median || mean < median) {
    const right = mean > median;
    return {
      relation: right ? 'greater' : 'less',
      zh: `这里平均数 ȳ = ${meanText} ${right ? '大于' : '小于'}中位数 ${medianText}。平均数${right ? '大于' : '小于'}中位数，常常和${right ? '右偏（right-skewed，右边的尾巴更长）' : '左偏（left-skewed，左边的尾巴更长）'}一起出现。这只是提示：形状要看图来判断。`,
      en: `Here the mean ȳ = ${meanText} is ${right ? 'greater' : 'less'} than the median ${medianText}. A mean ${right ? 'greater' : 'less'} than the median often goes with a ${right ? 'right-skewed distribution (a longer tail to the right)' : 'left-skewed distribution (a longer tail to the left)'}. It is only a hint: name the shape from the graph.`,
    };
  }
  return {
    relation: 'equal',
    zh: `这里平均数和中位数一样（${medianText}）。对称的分布里两者很接近，但两者相等并不能证明形状是对称的：要看图。`,
    en: `Here the mean and the median are equal (${medianText}). In a symmetric distribution they are close, but equal values alone do not show that the shape is symmetric: look at the graph.`,
  };
}

/**
 * M3 p.35 with the numbers computed from the slide data: the donuts' mean 251 and median 250 are almost equal,
 * yet their histogram is right-skewed.
 * 第 3 单元第 35 页，数字由课件数据算出：甜甜圈的平均数 251 和中位数 250 几乎相等，直方图却是右偏的。
 */
export function slideCaution() {
  const donuts = centreSummary(SLIDE_EXAMPLE.data);
  const mean = formatTrim(donuts.mean, donuts.digits.mean);
  const median = formatTrim(donuts.median, donuts.digits.median);
  return {
    zh: `课件第 3 单元第 35 页：Tim Hortons 甜甜圈热量的平均数是 ${mean}、中位数是 ${median}，几乎一样，可直方图却是右偏的。所以不能只靠这两个数判断形状。`,
    en: `Module 3, p.35: the Tim Hortons donut calories have mean ${mean} and median ${median}, almost the same, yet the histogram is right-skewed. So do not decide the shape from these two numbers alone.`,
  };
}

/**
 * "Describe the distribution" in the practice style ("Based on the histogram of data: Shape ... Centre ...
 * Spread ..."): rows { label, text } as { zh, en }. Shape and outliers stay for the learner to read off the
 * graph; centre and spread are computed (Range = Max − Min, M3 p.44).
 * 练习风格的“描述分布”（Based on the histogram of data: Shape … Centre … Spread …）：形状和离群值留给学习者看图回答；
 * 中心和分散程度由计算给出（全距 = 最大值 − 最小值，第 3 单元第 44 页）。
 */
export function describeLines(summary, unit = '') {
  const { digits } = summary;
  const value = (number) => formatTrim(number, digits.value);
  const median = withUnit(formatTrim(summary.median, digits.median), unit);
  const mean = withUnit(formatTrim(summary.mean, digits.mean), unit);
  const min = withUnit(value(summary.min), unit);
  const max = withUnit(value(summary.max), unit);
  const range = `${value(summary.max)} ${MINUS} ${formatOperand(summary.min, digits.value)} = ${withUnit(value(summary.range), unit)}`;
  return [
    {
      label: { zh: '形状', en: 'Shape' },
      text: {
        zh: '[看图回答：有几个峰；是对称，还是向尾巴更长的一侧偏]',
        en: '[read it from the graph: how many peaks; symmetric, or skewed toward the longer tail]',
      },
    },
    {
      label: { zh: '中心', en: 'Centre' },
      text: { zh: `中位数 ${median}（平均数 ȳ ${relationSign(summary.mean, digits.mean)} ${mean}）`, en: `median ${median} (mean ȳ ${relationSign(summary.mean, digits.mean)} ${mean})` },
    },
    {
      label: { zh: '分散程度', en: 'Spread' },
      text: { zh: `从 ${min} 到 ${max}（全距 Range = ${range}）`, en: `from ${min} to ${max} (Range = Max ${MINUS} Min = ${range})` },
    },
    {
      label: { zh: '离群值', en: 'Outliers' },
      text: {
        zh: '[看图回答：有没有远离整体模式的值，例如隔着缺口、孤零零的一根柱子]',
        en: '[read it from the graph: any value outside the overall pattern, such as a bar standing alone after a gap]',
      },
    },
  ];
}
