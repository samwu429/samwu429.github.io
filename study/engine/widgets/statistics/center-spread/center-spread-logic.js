/**
 * Measures of centre and spread (STA220 Modules 3-4) for the "center-spread" widget: the config reader, the worked
 * steps of the mean, median, mode, range, quartiles, IQR, variance and standard deviation, the outlier comparison
 * that shows which measures are resistant, and the effect of adding or multiplying by a constant. DOM-free: every
 * number and sentence the widget shows is built here.
 * 集中趋势与离散程度（STA220 第 3-4 单元），供 center-spread 组件使用：读取配置，逐步写出平均数、中位数、众数、极差、
 * 四分位数、IQR、方差与标准差的计算过程，用离群值对比说明哪些指标耐抗，以及加上或乘以一个常数的影响。
 * 不依赖 DOM：组件显示的每个数字和句子都在这里生成。
 *
 * Course conventions kept here:
 * - Notation of the one-variable slides: observations y, sample size n, sample mean ȳ, sample variance S² and
 *   sample standard deviation S, both dividing by n − 1 (M3 p.29, p.46, p.51).
 * - The median sits at rank position 0.5 × (n + 1); an even n averages the two middle values (M3 p.32-33).
 * - Quartiles always name their method: "hand" takes the median of each half (M4 p.5-6; the slides show no odd n,
 *   so an odd n leaves the median out of both halves and says so), "r7" is R's quantile() rule.
 * - Interpretation sentences follow the instructor's templates (M3 p.30, p.33, p.37, p.53; M4 p.6, p.17).
 * - Resistance (M3 p.68, M4 p.46) and adding or multiplying by a constant (M4 p.27-30) follow the slides; what the
 *   slides do not state (negative factors, the variance) is marked as extra.
 * 课程约定：
 * - 单变量课件的记号：观测值 y、样本量 n、样本平均数 ȳ、样本方差 S² 与样本标准差 S（都除以 n − 1；第 3 单元第 29、46、51 页）。
 * - 中位数的名次位置是 0.5 × (n + 1)；n 为偶数时取中间两个值的平均（第 3 单元第 32-33 页）。
 * - 四分位数总是注明方法：hand 取每一半的中位数（第 4 单元第 5-6 页；课件没有 n 为奇数的例子，此时中位数不放进任何一半，
 *   并在步骤中说明），r7 是 R 的 quantile() 规则。
 * - 解释句沿用老师的句型（第 3 单元第 30、33、37、53 页；第 4 单元第 6、17 页）。
 * - 耐抗性（第 3 单元第 68 页、第 4 单元第 46 页）与加上或乘以常数（第 4 单元第 27-30 页）按课件讲；
 *   课件没有说的内容（负数因子、方差）标为课件外补充。
 */
import { decimalsOf, niceExtent, toBi, toNumber } from '../../machine-learning/shared/ml-math.js';
import {
  APPROX, MINUS, STAT_DIGITS, formatTerms, formatTrim, nameInSentence, ordinal, roundTo,
} from '../shared/stat-format.js';
import {
  QUARTILE_METHODS, deviationTable, finiteNumbers, medianInfo, modes, quartiles, range, sortAscending, valueCounts,
} from '../shared/stats-math.js';

/* ---------- Limits and course data 上限与课程数据 ---------- */

// Sizes the content validator accepts (tools/validate_content.py, check_statistics_widget): 3-30 values.
// Longer lists are cut to the maximum.
// 内容校验器接受的数量（tools/validate_content.py 的 check_statistics_widget）：3-30 个值；更长的列表截到上限。
export const MIN_VALUES = 3;
export const MAX_VALUES = 30;
// Data values are written with at most this many decimals. 数据值最多写出这么多位小数。
export const MAX_DATA_DIGITS = 6;

// How far the constants of the transformation panel may go, so every printed number stays readable.
// 变换面板中常数的取值范围，保证打印出的每个数字都清楚可读。
export const CONSTANT_LIMITS = Object.freeze({ add: 1e6, multiplyMin: 0.001, multiplyMax: 1000 });
export const TRANSFORM_OPERATIONS = Object.freeze(['add', 'multiply']);
export const DEFAULT_CONSTANTS = Object.freeze({ add: 10, multiply: 2 });

// The outlier demo moves the largest value this many ranges further up, far away from the rest of the data.
// 离群值演示把最大值再往上移这么多个极差，让它远离其余数据。
export const OUTLIER_RANGES = 2;

// Sums with at most this many terms are written out in full; longer ones are shortened like M3 p.30.
// 项数不超过这个数的求和式全部写出；更长的按第 3 单元第 30 页的样子缩写。
const TERMS_IN_FULL = 6;
const TERMS_SHORT = 4;

// Relative tolerance for binary noise, as in stats-math: 3.0000000000000004 still counts as 3.
// 吸收二进制误差的相对容差，与 stats-math 一致：3.0000000000000004 仍算作 3。
const EPSILON = 1e-9;

/**
 * M3 p.5: calories of the 30 Tim Hortons donuts (2014) in ID order, the course's running example (ȳ = 251,
 * median 250, mode 270, range 220, hand quartiles 210 and 280, S² = 2505.8621, S = 50.06). Shown, with its own
 * labels, when a config has no usable data, so the labels always describe the numbers.
 * 第 3 单元第 5 页：30 个 Tim Hortons 甜甜圈（2014 年）的热量，按 ID 顺序，是课程贯穿始终的例子（ȳ = 251、中位数 250、
 * 众数 270、极差 220、手算四分位数 210 和 280、S² = 2505.8621、S = 50.06）。配置里没有可用数据时显示它，
 * 并使用它自己的标签，保证标签和数字始终对应。
 */
export const EXAMPLE = Object.freeze({
  variable: Object.freeze({ zh: 'Tim Hortons 甜甜圈的热量', en: 'calories in Tim Hortons donuts' }),
  unit: 'kcal',
  data: Object.freeze([
    180, 190, 190, 190, 210, 250, 290, 300, 210, 220, 250, 270, 270, 270, 280,
    280, 300, 340, 250, 200, 200, 210, 220, 230, 230, 250, 270, 270, 400, 310,
  ]),
});

const DEFAULT_TITLE = Object.freeze({ zh: '集中趋势与离散程度', en: 'Measures of centre and spread' });
const DEFAULT_VARIABLE = Object.freeze({ zh: '变量 y', en: 'y' });

// Placeholders of the instructor's templates, as in the histogram widget; the learner fills them in from the question.
// 老师句型里的占位词（与直方图组件相同），由学习者按题目填写。
export const PLACEHOLDERS = Object.freeze({
  cases: Object.freeze({ zh: '[个案]', en: '[cases]' }),
  units: Object.freeze({ zh: '[单位]', en: '[units]' }),
});

/**
 * M4 p.27-30: the slides shift the data 5, 10, 15, 20, 25 by + 10 and − 5 and rescale it by × 2 and ÷ 5
 * (÷ 5 is × 0.2). `text` is the button face and `name` its accessible name.
 * 第 4 单元第 27-30 页：课件把数据 5、10、15、20、25 平移 + 10、− 5，并缩放 × 2、÷ 5（÷ 5 就是 × 0.2）。
 * text 是按钮上的文字，name 是它的无障碍名称。
 */
export const TRANSFORM_PRESETS = Object.freeze([
  Object.freeze({
    operation: 'add',
    constant: 10,
    text: '+ 10',
    name: Object.freeze({ zh: '每个值加上 10（Module 4 第 27 页）', en: 'Add 10 to every value (Module 4 p.27)' }),
  }),
  Object.freeze({
    operation: 'add',
    constant: -5,
    text: `${MINUS} 5`,
    name: Object.freeze({ zh: '每个值减去 5（Module 4 第 28 页）', en: 'Subtract 5 from every value (Module 4 p.28)' }),
  }),
  Object.freeze({
    operation: 'multiply',
    constant: 2,
    text: '× 2',
    name: Object.freeze({ zh: '每个值乘以 2（Module 4 第 29 页）', en: 'Multiply every value by 2 (Module 4 p.29)' }),
  }),
  Object.freeze({
    operation: 'multiply',
    constant: 0.2,
    text: '÷ 5',
    name: Object.freeze({ zh: '每个值除以 5（Module 4 第 30 页）', en: 'Divide every value by 5 (Module 4 p.30)' }),
  }),
]);

/**
 * The measures the widget names, how each is printed (`digits` picks an entry of digitsFor), whether it carries
 * the data's unit, and its family under adding or multiplying by a constant (M4 p.27-30): measures of position
 * move with the data, measures of spread change only with a factor, and the variance changes with its square.
 * 组件用到的指标：名称、打印方式（digits 指向 digitsFor 的某一项）、是否带数据的单位，以及加上或乘以常数时所属的类别
 * （第 4 单元第 27-30 页）：位置指标随数据移动，离散程度只随乘数变化，方差随乘数的平方变化。
 */
const MEASURES = Object.freeze({
  mean: {
    symbol: 'ȳ', label: { zh: '平均数', en: 'mean' }, name: { zh: '平均数', en: 'the mean' },
    digits: 'mean', unit: true, kind: 'position', read: (analysis) => analysis.mean,
  },
  median: {
    symbol: '', label: { zh: '中位数', en: 'median' }, name: { zh: '中位数', en: 'the median' },
    digits: 'position', unit: true, kind: 'position', read: (analysis) => analysis.median.value,
  },
  min: {
    symbol: 'Min', label: { zh: '最小值', en: 'minimum' }, name: { zh: '最小值', en: 'the minimum' },
    digits: 'data', unit: true, kind: 'position', read: (analysis) => analysis.min,
  },
  q1: {
    symbol: 'Q1', label: { zh: '下四分位数', en: 'lower quartile' }, name: { zh: 'Q1', en: 'Q1' },
    digits: 'position', unit: true, kind: 'position', read: (analysis) => analysis.quartiles.q1,
  },
  q3: {
    symbol: 'Q3', label: { zh: '上四分位数', en: 'upper quartile' }, name: { zh: 'Q3', en: 'Q3' },
    digits: 'position', unit: true, kind: 'position', read: (analysis) => analysis.quartiles.q3,
  },
  max: {
    symbol: 'Max', label: { zh: '最大值', en: 'maximum' }, name: { zh: '最大值', en: 'the maximum' },
    digits: 'data', unit: true, kind: 'position', read: (analysis) => analysis.max,
  },
  range: {
    symbol: '', label: { zh: '极差', en: 'range' }, name: { zh: '极差', en: 'the range' },
    digits: 'data', unit: true, kind: 'spread', read: (analysis) => analysis.range,
  },
  iqr: {
    symbol: 'IQR', label: { zh: '四分位距', en: 'interquartile range' }, name: { zh: 'IQR', en: 'the IQR' },
    digits: 'position', unit: true, kind: 'spread', read: (analysis) => analysis.quartiles.iqr,
  },
  variance: {
    symbol: 'S²', label: { zh: '方差', en: 'variance' }, name: { zh: '方差', en: 'the variance' },
    digits: 'variance', unit: false, kind: 'variance', read: (analysis) => analysis.variance,
  },
  sd: {
    symbol: 'S', label: { zh: '标准差', en: 'standard deviation' }, name: { zh: '标准差', en: 'the standard deviation' },
    digits: 'sd', unit: true, kind: 'spread', read: (analysis) => analysis.sd,
  },
});

// The rows of the outlier comparison: the measures the slides call resistant or not resistant.
// 离群值对比表的各行：课件说耐抗或不耐抗的那些指标。
export const RESISTANCE_ROWS = Object.freeze(['mean', 'median', 'range', 'iqr', 'variance', 'sd']);
const RESISTANT = new Set(['median', 'iqr']);

// The rows of the transformation table: measures of position, then of spread, then the variance (M4 p.27-30).
// 变换表的各行：先是位置指标，再是离散程度，最后是方差（第 4 单元第 27-30 页）。
export const TRANSFORM_ROWS = Object.freeze(['mean', 'median', 'min', 'q1', 'q3', 'max', 'range', 'iqr', 'sd', 'variance']);

// A negative factor reverses the order of the values, so these measures come from their mirror partners.
// 负数因子会把数据的顺序反过来，所以这些指标来自与它对称的那个指标。
const MIRRORED = Object.freeze({
  min: { zh: '最大值', en: 'maximum' },
  max: { zh: '最小值', en: 'minimum' },
  q1: { zh: 'Q3', en: 'Q3' },
  q3: { zh: 'Q1', en: 'Q1' },
});

const UNCHANGED = Object.freeze({ zh: '不变', en: 'unchanged' });

export const METHOD_NAMES = Object.freeze({
  hand: Object.freeze({ zh: '手算方法（每一半的中位数）', en: 'the hand method (the median of each half)' }),
  r7: Object.freeze({ zh: 'R 的方法（quantile() 的 type 7）', en: "R's method (quantile(), type 7)" }),
});

export const RESET_MESSAGE = Object.freeze({ zh: '已恢复原始数据。', en: 'Back to the original data.' });

/**
 * The fixed teaching sentences of the widget's panels. 组件各面板中固定的讲解句。
 */
export const GUIDE = Object.freeze({
  intro: Object.freeze({
    zh: '改一改数据，跟着下面的步骤看平均数、中位数、众数、极差、四分位数、IQR 和标准差是怎么一步步算出来的；再把最大值变成离群值，看看哪些指标“怕”极端值。',
    en: 'Edit the data and follow how the mean, median, mode, range, quartiles, IQR and standard deviation are worked out step by step; then turn the largest value into an outlier to see which measures are resistant.',
  }),
  dataHint: Object.freeze({
    zh: '3 到 30 个数，用逗号或空格隔开。改完按“应用”（或 Ctrl + Enter）。',
    en: '3 to 30 numbers, separated by commas or spaces. Press Apply (or Ctrl + Enter) when you are done.',
  }),
  example: Object.freeze({
    zh: '这个演示没有拿到可用的数据，所以显示课件的例子：30 个 Tim Hortons 甜甜圈的热量（Module 3 第 5 页）。',
    en: "This demo has no usable data, so it shows the slides' example: the calories of 30 Tim Hortons donuts (Module 3 p.5).",
  }),
  outlier: Object.freeze({
    zh: '按“把最大值变成离群值”，最大值会换成一个远大于其他数据的值：看看哪些指标跟着大变，哪些几乎不动。',
    en: 'Make the largest value an outlier: it is replaced by a value far above the rest, so you can see which measures change a lot and which hardly move.',
  }),
  transform: Object.freeze({
    zh: 'Module 4 第 27–30 页：把每个值都加上（或减去）同一个常数，或都乘以（或除以）同一个常数，看每个指标怎么变。下面的表从变换后的数据重新算出每个指标。',
    en: 'Module 4 p.27-30: add (or subtract) the same constant to every value, or multiply (or divide) every value by it, and see how each measure changes. The table recomputes every measure from the transformed data.',
  }),
});

/* ---------- Number text 数字文字 ---------- */

// roundTo (ml-math) adds 1e-12 of the scaled value to absorb binary noise, which turns 100000000 at 4 decimals into
// 100000000.0001. Keeping the scaled value below 1e10 holds that nudge under a hundredth of the last digit, so large
// numbers get fewer decimals and whole numbers beyond that size are written directly. The variance of income data
// (about 2 × 10⁸) needs this.
// ml-math 的 roundTo 会加上缩放后数值的 1e-12 来吸收二进制误差，会把保留 4 位小数的 100000000 写成 100000000.0001。
// 让缩放后的值小于 1e10，这个偏移就不到末位的百分之一；所以大数少写几位小数，更大的整数直接写出。收入数据的方差（约 2 × 10⁸）就会遇到。
const ROUND_SAFE = 1e10;

function placesFor(value, digits) {
  const size = Math.abs(value);
  if (!(size >= 1)) return digits;
  return Math.max(0, Math.min(digits, Math.floor(Math.log10(ROUND_SAFE / size))));
}

const beyondRounding = (value, places) => Math.abs(value) * 10 ** places >= ROUND_SAFE;

/** A number with at most `digits` decimals and no trailing zeros; a dash when it cannot be computed. 数字文字。 */
function num(value, digits) {
  if (!Number.isFinite(value)) return '—';
  const places = placesFor(value, digits);
  if (!beyondRounding(value, places)) return formatTrim(value, places);
  const whole = Math.round(Math.abs(value));
  return `${value < 0 ? MINUS : ''}${String(whole)}`;
}

/** With an explicit "+" for positive values, like "+3" on M3 p.45. 正数带“+”号，与第 3 单元第 45 页的“+3”一致。 */
function numSigned(value, digits) {
  const text = num(value, digits);
  return Number.isFinite(value) && text !== '0' && !text.startsWith(MINUS) ? `+${text}` : text;
}

/** A number used inside working: negatives get parentheses, "(−2)". 计算式中的数，负数加括号。 */
function numOperand(value, digits) {
  const text = num(value, digits);
  return text.startsWith(MINUS) ? `(${text})` : text;
}

/**
 * "=" when the printed number is exact, "≈" when it was rounded. The slack is a thousandth of the last printed
 * digit (plus binary noise), so 1730039318.63 printed as 1730039319 gets "≈" however large it is.
 * 打印值精确时为“=”，经过四舍五入时为“≈”。容差是末位的千分之一（再加二进制误差），所以无论数多大，
 * 把 1730039318.63 写成 1730039319 时都会用“≈”。
 */
function numSign(value, digits) {
  if (!Number.isFinite(value)) return '=';
  const places = placesFor(value, digits);
  const rounded = beyondRounding(value, places) ? Math.round(value) : roundTo(value, places);
  const slack = 1e-3 * 10 ** -places + 1e-14 * Math.abs(value);
  return Math.abs(value - rounded) <= slack ? '=' : APPROX;
}

/** A sum written term by term, shortened after six terms like M3 p.30. 逐项写出的求和式，超过六项时像第 3 单元第 30 页那样缩写。 */
function numTerms(values, term) {
  return formatTerms(values, { maxTerms: values.length <= TERMS_IN_FULL ? TERMS_IN_FULL : TERMS_SHORT, term });
}

// Units written before the number ("$5", "−$5"); every other unit follows it ("251 kcal"), "%" without a space.
// 写在数字前面的单位（“$5”“−$5”）；其他单位写在数字后面（“251 kcal”），“%”前不留空格。
const PREFIX_UNITS = new Set(['$', 'C$', 'CA$', 'US$', '€', '£', '¥']);

/**
 * A printed number with the data's unit: "251 kcal", "$106.43", "−$5", "+$2", "5.2%". A dash stays a dash.
 * 带数据单位的数字：“251 kcal”“$106.43”“−$5”“+$2”“5.2%”；破折号保持原样。
 */
export function withUnit(text, unit) {
  const value = String(text ?? '');
  if (!unit || !value || value === '—') return value;
  if (PREFIX_UNITS.has(unit)) {
    const sign = value.startsWith(MINUS) || value.startsWith('+') ? value[0] : '';
    return `${sign}${unit}${value.slice(sign.length)}`;
  }
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}

/* ---------- Words 文字 ---------- */

const same = (text) => ({ zh: text, en: text });

function sameNumber(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Object.is(a, b);
  return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

// "a, b and c" in English. 英文列举。
function listEn(items, conjunction = 'and') {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

const HAN_START = /^[㐀-鿿]/;
const HAN_END = /[㐀-鿿]$/;
const LATIN_START = /^[A-Za-z0-9(]/;
const LATIN_END = /[A-Za-z0-9%)]$/;

/**
 * Joins pieces of Chinese text, putting a space wherever Latin letters or digits meet Chinese characters, as the
 * rest of the station writes mixed text ("中位数和 IQR 没有变").
 * 拼接中文文字片段：英文字母或数字与汉字相接的地方加一个空格，与全站的中英混排写法一致（“中位数和 IQR 没有变”）。
 */
function zhJoin(...parts) {
  return parts.filter(Boolean).reduce((text, part) => {
    const gap = (LATIN_END.test(text) && HAN_START.test(part)) || (HAN_END.test(text) && LATIN_START.test(part));
    return `${text}${gap ? ' ' : ''}${part}`;
  }, '');
}

// A Chinese list: "甲、乙和丙", "8、10 和 17". 中文列举。
function listZh(items) {
  if (items.length < 2) return items.join('');
  return zhJoin(items.slice(0, -1).join('、'), '和', items[items.length - 1]);
}

// Chinese and English for "the kth value" or "the 2nd and 3rd values". “第 k 个值”的中英文写法。
function positionsName(positions) {
  if (positions.length === 1) return { zh: `第 ${positions[0]} 个值`, en: `the ${ordinal(positions[0])} value` };
  return {
    zh: `第 ${positions[0]} 和第 ${positions[1]} 个值`,
    en: `the ${ordinal(positions[0])} and ${ordinal(positions[1])} values`,
  };
}

// "the 1st to the 15th values (15 values)", or one value on its own. 一段连续位置的写法。
function spanName(from, to) {
  if (from === to) return { zh: `只有第 ${from} 个值`, en: `only the ${ordinal(from)} value` };
  return {
    zh: `第 ${from} 到第 ${to} 个值（共 ${to - from + 1} 个）`,
    en: `the ${ordinal(from)} to the ${ordinal(to)} values (${to - from + 1} values)`,
  };
}

/**
 * Decimals used for each kind of number of one data set. Data, sums and the range are written exactly; the median
 * and quartiles add at most two decimals (an average of two values, or a quarter step of R's rule), so they are
 * exact too. The mean, S² and S use the course's decimals (M3 p.30, p.53) or the data's own, whichever is finer.
 * 一组数据中各类数字的小数位数。数据、求和与极差精确写出；中位数和四分位数最多多出两位小数（两个值的平均，或 R 规则的四分之一步），
 * 所以也是精确的。平均数、S² 与 S 用课程的小数位数（第 3 单元第 30、53 页）或数据本身的位数，取较细的一个。
 */
function digitsFor(values) {
  const data = Math.min(MAX_DATA_DIGITS, values.reduce((most, value) => Math.max(most, decimalsOf(value)), 0));
  const squared = Math.min(8, Math.max(STAT_DIGITS.variance, 2 * data));
  return {
    data,
    position: data + 2,
    mean: Math.max(STAT_DIGITS.value, data),
    deviation: Math.max(STAT_DIGITS.variance, data),
    squared,
    variance: squared,
    sd: Math.max(STAT_DIGITS.sd, data),
  };
}

/* ---------- Config 配置 ---------- */

// A bilingual label with both languages filled: a missing side borrows the other one, then the fallback.
// 两种语言都有内容的双语标签：缺少的一边借用另一边，都没有时用后备值。
function fullBi(value, fallback) {
  const read = toBi(value, { zh: '', en: '' });
  const zh = read.zh.trim();
  const en = read.en.trim();
  return { zh: zh || en || fallback.zh, en: en || zh || fallback.en };
}

// The unit is kept whole, as the validator accepts any string; it is only ever printed as HTML text, which wraps.
// 单位原样完整保留（校验器接受任何字符串）；它只出现在会自动换行的 HTML 文字里。
function readUnit(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// The cases the sentences talk about ("Tim Hortons donuts"), or null. They are written into the English exam sentence,
// so an English name is required; a missing Chinese name borrows the English one.
// 句子所说的个案（“Tim Hortons donuts”），没有时为 null。它们要写进英文考试句子，所以必须有英文名称；缺少中文名称时借用英文名称。
function readCases(value) {
  const read = toBi(value, { zh: '', en: '' });
  const en = read.en.trim();
  return en ? { zh: read.zh.trim() || en, en } : null;
}

/**
 * Reads a content config defensively into { title, variable, cases, unit, data, quartiles, transform, usesExample }.
 * - data keeps the finite numbers (numeric strings count) in their order, cut to 30. Fewer than 3 usable values
 *   give the donut example together with its own variable and unit (usesExample) and no cases.
 * - quartiles is "hand" (default) or "r7"; transform is on only when it is true.
 * - variable is a Bi value with both languages filled, because the interpretation sentences use it; unit is the
 *   trimmed string as written (anything that is not a string gives no unit).
 * - cases (optional Bi, e.g. { zh: "Tim Hortons 甜甜圈", en: "Tim Hortons donuts" }) fills the <cases> slot of the
 *   instructor's mean and median templates; without it the sentences keep the [cases] placeholder.
 * A config the validator accepts is read exactly as it is written.
 * 防御性读取内容配置，得到 { title, variable, cases, unit, data, quartiles, transform, usesExample }。
 * - data 按原顺序保留有限数字（数字字符串也算），最多 30 个；可用的值少于 3 个时，改用甜甜圈例子及其自己的变量名和单位（usesExample），
 *   不带个案。
 * - quartiles 为 "hand"（默认）或 "r7"；transform 只有为 true 时才打开。
 * - variable 是两种语言都有内容的双语值，因为解释句要用到它；unit 是去掉首尾空格后原样保留的文字（不是字符串时不显示单位）。
 * - cases（可选的双语值）填入老师平均数句和中位数句里的 <cases>；没有时句子保留 [cases] 占位词。
 * 校验器接受的配置会按原样读取。
 */
export function normalizeCenterSpreadConfig(config) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const data = finiteNumbers(source.data).slice(0, MAX_VALUES);
  const usesExample = data.length < MIN_VALUES;
  return {
    title: toBi(source.title, DEFAULT_TITLE),
    variable: usesExample ? { ...EXAMPLE.variable } : fullBi(source.variable, DEFAULT_VARIABLE),
    cases: usesExample ? null : readCases(source.cases),
    unit: usesExample ? EXAMPLE.unit : readUnit(source.unit),
    data: usesExample ? [...EXAMPLE.data] : data,
    quartiles: QUARTILE_METHODS.includes(source.quartiles) ? source.quartiles : 'hand',
    transform: source.transform === true,
    usesExample,
  };
}

/* ---------- Learner input 学生输入 ---------- */

// Plain decimals with an optional exponent ("180", "−2.5", ".5", "1e+21"); hexadecimal and the like are refused.
// 普通小数，可带指数（“180”“−2.5”“.5”“1e+21”）；十六进制之类的写法不接受。
const NUMBER_TOKEN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const SEPARATORS = /[\s,，、;；]+/;
const MAX_TOKEN_SHOWN = 12;

// Full-width digits and signs from a Chinese input method, and the minus signs the widget itself prints.
// 中文输入法打出的全角数字和符号，以及组件自己打印的减号。
function asciiNumberText(text) {
  return String(text ?? '')
    .replace(/[０-９．＋－]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[−﹣]/g, '-');
}

function readNumberToken(token) {
  if (!NUMBER_TOKEN.test(token)) return null;
  const number = Number(token);
  if (!Number.isFinite(number)) return null;
  return number === 0 ? 0 : number;
}

function shownToken(token) {
  const chars = [...token];
  return chars.length > MAX_TOKEN_SHOWN ? `${chars.slice(0, MAX_TOKEN_SHOWN).join('')}…` : token;
}

/**
 * Reads the data text a learner typed: numbers separated by commas, spaces, semicolons or Chinese commas.
 * Returns { values, error }: values are the numbers in order, or null with an error { code, zh, en } when a token
 * is not a number ("invalid") or there are fewer than 3 ("too-few") or more than 30 ("too-many") values.
 * 读取学生输入的数据：用逗号、空格、分号或中文逗号分隔的数字。返回 { values, error }：values 是按顺序的数字；
 * 有不是数字的内容（invalid）、少于 3 个（too-few）或多于 30 个（too-many）时 values 为 null，error 为 { code, zh, en }。
 */
export function parseDataText(text) {
  const tokens = asciiNumberText(text).split(SEPARATORS).filter(Boolean);
  const values = [];
  for (const token of tokens) {
    const number = readNumberToken(token);
    if (number === null) {
      const shown = shownToken(token);
      return {
        values: null,
        error: {
          code: 'invalid',
          zh: `“${shown}”不是数字。请只输入数字，用逗号或空格隔开。`,
          en: `"${shown}" is not a number. Enter numbers separated by commas or spaces.`,
        },
      };
    }
    values.push(number);
  }
  if (values.length < MIN_VALUES) {
    return {
      values: null,
      error: {
        code: 'too-few',
        zh: `至少需要 ${MIN_VALUES} 个数（现在有 ${values.length} 个）。`,
        en: `At least ${MIN_VALUES} numbers are needed (now ${values.length}).`,
      },
    };
  }
  if (values.length > MAX_VALUES) {
    return {
      values: null,
      error: {
        code: 'too-many',
        zh: `最多 ${MAX_VALUES} 个数（现在有 ${values.length} 个）。`,
        en: `At most ${MAX_VALUES} numbers are allowed (now ${values.length}).`,
      },
    };
  }
  return { values, error: null };
}

/**
 * The data as editable text, "180, 190, 190"; parseDataText reads it back unchanged. A value that the usual printed
 * decimals would round (0.1234567, 1e-7, 123456789.123) is written in full instead, so editing one value in the box
 * never changes the others.
 * 可编辑的数据文本，例如“180, 190, 190”；parseDataText 能原样读回。常用的打印小数位会把某个值四舍五入时
 * （0.1234567、1e-7、123456789.123），改为完整写出这个值，所以在输入框里改一个值不会改动其他值。
 */
export function formatDataText(values) {
  const numbers = finiteNumbers(values);
  const digits = digitsFor(numbers).data;
  return numbers.map((value) => {
    const text = num(value, digits);
    if (readNumberToken(asciiNumberText(text)) === value) return text;
    const full = String(value);
    return full.startsWith('-') ? `${MINUS}${full.slice(1)}` : full;
  }).join(', ');
}

/**
 * Reads the constant of the transformation panel. "add" takes any c with |c| ≤ 1000000; "multiply" takes a k
 * with 0.001 ≤ |k| ≤ 1000 (negative allowed, 0 refused). Returns { value, error } like parseDataText.
 * 读取变换面板中的常数。add 接受 |c| ≤ 1000000 的任意 c；multiply 接受 0.001 ≤ |k| ≤ 1000 的 k（可以是负数，不能是 0）。
 * 返回值与 parseDataText 相同：{ value, error }。
 */
export function parseConstant(raw, operation) {
  const multiply = operation === 'multiply';
  const symbol = multiply ? 'k' : 'c';
  const text = asciiNumberText(raw).trim();
  if (!text) return { value: null, error: { code: 'empty', zh: `请输入 ${symbol} 的值。`, en: `Enter a value for ${symbol}.` } };
  const value = readNumberToken(text);
  if (value === null) {
    return { value: null, error: { code: 'invalid', zh: `${symbol} 必须是一个数。`, en: `${symbol} must be a number.` } };
  }
  if (!multiply && Math.abs(value) > CONSTANT_LIMITS.add) {
    const limit = num(CONSTANT_LIMITS.add, 0);
    return {
      value: null,
      error: { code: 'range', zh: `c 要在 ${MINUS}${limit} 到 ${limit} 之间。`, en: `c must be between ${MINUS}${limit} and ${limit}.` },
    };
  }
  if (multiply && value === 0) {
    return {
      value: null,
      error: { code: 'zero', zh: 'k 不能是 0：乘以 0 会把每个值都变成 0。', en: 'k cannot be 0: multiplying by 0 turns every value into 0.' },
    };
  }
  if (multiply && (Math.abs(value) < CONSTANT_LIMITS.multiplyMin || Math.abs(value) > CONSTANT_LIMITS.multiplyMax)) {
    const low = num(CONSTANT_LIMITS.multiplyMin, 3);
    const high = num(CONSTANT_LIMITS.multiplyMax, 0);
    return {
      value: null,
      error: {
        code: 'range',
        zh: `k 的大小（不看正负号）要在 ${low} 到 ${high} 之间。`,
        en: `The size of k (ignoring its sign) must be between ${low} and ${high}.`,
      },
    };
  }
  return { value, error: null };
}

/* ---------- Analysis 计算 ---------- */

/**
 * Every measure of one data set: { n, sorted, method, digits, sum, mean, median (medianInfo), modes, counts
 * (valueCounts), min, max, range, quartiles (stats-math quartiles), deviations (rows of the deviation table in
 * sorted order), sumDeviation, sumSquared, variance, sd }. An unknown method falls back to "hand".
 * 一组数据的全部指标：样本量、排序后的数据、四分位数方法、小数位数、总和、平均数、中位数、众数、各值出现次数、最小值、最大值、
 * 极差、四分位数、偏差表（按排序后的顺序）、偏差之和、平方和、方差与标准差。未知的方法按 "hand" 处理。
 */
export function analyzeData(values, method = 'hand') {
  const sorted = sortAscending(values);
  const n = sorted.length;
  const quartileMethod = QUARTILE_METHODS.includes(method) ? method : 'hand';
  const table = deviationTable(sorted);
  return {
    n,
    sorted,
    method: quartileMethod,
    digits: digitsFor(sorted),
    sum: table.sum,
    mean: table.mean,
    median: medianInfo(sorted),
    modes: modes(sorted),
    counts: valueCounts(sorted),
    min: n ? sorted[0] : NaN,
    max: n ? sorted[n - 1] : NaN,
    range: range(sorted),
    quartiles: quartiles(sorted, quartileMethod),
    deviations: table.rows,
    sumDeviation: table.sumDeviation,
    sumSquared: table.sumSquared,
    variance: table.variance,
    sd: table.sd,
  };
}

/** A measure of an analysis as printed text, with the unit when the measure carries one. 指标的打印文字。 */
function measureText(analysis, id, unit, digits = analysis.digits[MEASURES[id].digits]) {
  const measure = MEASURES[id];
  const text = num(measure.read(analysis), digits);
  return measure.unit ? withUnit(text, unit) : text;
}

const measureSign = (analysis, id) => numSign(MEASURES[id].read(analysis), analysis.digits[MEASURES[id].digits]);

/* ---------- Interpretation sentences 解释句 ---------- */

// The variable's English name as it reads inside a sentence: "Calories" becomes "calories", "Quiz mark" "quiz mark",
// while "original.data" and "the cost of Prozac" stay as written (shared nameInSentence).
// 变量的英文名在句子中间的写法：“Calories”写成“calories”，“Quiz mark”写成“quiz mark”；“original.data”“the cost of Prozac”
// 保持原样（共用的 nameInSentence）。
function inSentence(variable) {
  return nameInSentence(variable.en);
}

// The cases of the labels ({ zh, en } with an English name), or null when the sentences keep the placeholder.
// labels 中的个案（带英文名称的 { zh, en }）；没有时为 null，句子保留占位词。
function casesOf(labels) {
  const en = typeof labels?.cases?.en === 'string' ? labels.cases.en.trim() : '';
  if (!en) return null;
  const zh = typeof labels.cases.zh === 'string' ? labels.cases.zh.trim() : '';
  return { zh: zh || en, en };
}

/**
 * The instructor's mean template (M3 p.30, course brief): "On average, <cases> have <ȳ> <units>." ("On average,
 * Tim Hortons donuts have 251 calories."). Without cases in the labels the sentence keeps [cases], and without a
 * unit it keeps [units], as the histogram widget does; placeholderHint says what to fill in.
 * 老师的平均数句型（第 3 单元第 30 页、课程简报）：“On average, <cases> have <ȳ> <units>.”。labels 里没有个案时保留 [cases]，
 * 没有单位时保留 [units]，与直方图组件相同；placeholderHint 说明要填什么。
 */
export function meanSentence(analysis, labels) {
  const { variable, unit } = labels;
  const value = measureText(analysis, 'mean', unit);
  const amount = unit
    ? { zh: value, en: value }
    : { zh: `${value} ${PLACEHOLDERS.units.zh}`, en: `${value} ${PLACEHOLDERS.units.en}` };
  const cases = casesOf(labels);
  return {
    zh: `平均来说，${cases ? zhJoin(cases.zh, '的') : `${PLACEHOLDERS.cases.zh} 的`}“${variable.zh}”是 ${amount.zh}。`,
    en: `On average, ${cases ? cases.en : PLACEHOLDERS.cases.en} have ${amount.en}.`,
  };
}

// "the cost of Prozac" becomes "cost of Prozac" after "The median", which already brings its own article.
// “the cost of Prozac”放在“The median”后面时去掉开头的 the，因为句子已经有冠词。
function withoutArticle(text) {
  return text.replace(/^the\s+/i, '');
}

/**
 * The instructor's median template (M3 p.33, M3 practice Q1c, course brief): "The median <variable> is M. This
 * means that 50% of <cases> have at most M (M or less), whereas 50% have more than M." When every value is the
 * same, no value is more than M, so the sentence says that instead of the 50% split.
 * 老师的中位数句型（第 3 单元第 33 页、练习 Q1c、课程简报）。所有值都相同时没有值大于 M，所以句子改为说明这一点，而不写 50% 的划分。
 */
export function medianSentence(analysis, labels) {
  const { variable, unit } = labels;
  const value = measureText(analysis, 'median', unit);
  const number = num(analysis.median.value, analysis.digits.position);
  const name = withoutArticle(inSentence(variable));
  const cases = casesOf(labels);
  const casesEn = cases ? cases.en : PLACEHOLDERS.cases.en;
  const casesZh = cases ? cases.zh : ` ${PLACEHOLDERS.cases.zh} `;
  if (analysis.range === 0) {
    return {
      zh: zhJoin(`“${variable.zh}”的中位数是 ${value}。这里每个值都等于 ${value}，所以 100% 的`, casesZh,
        `都不超过 ${value}，没有一个大于 ${value}。`),
      en: `The median ${name} is ${value}. Here every value equals ${value}, so 100% of ${casesEn} have at most ${value} and none has more than ${value}.`,
    };
  }
  return {
    zh: zhJoin(`“${variable.zh}”的中位数是 ${value}：50% 的`, casesZh,
      `不超过 ${value}（at most，即 ${number} 或更少），另外 50% 大于 ${value}（more than）。`),
    en: `The median ${name} is ${value}. This means that 50% of ${casesEn} have at most ${value} (${number} or less), whereas 50% have more than ${value}.`,
  };
}

/**
 * What to fill in on a test when a template keeps a placeholder: [cases] when the labels name no cases, and [units]
 * (the mean sentence, `units: true`) when there is no unit; null when nothing is left to fill.
 * 句型保留占位词时考试要填什么：labels 没有个案时填 [cases]；没有单位时（平均数句，units 为 true）填 [units]；
 * 没有要填的就返回 null。
 */
export function placeholderHint(labels, { units = false } = {}) {
  const { cases, units: unitWords } = PLACEHOLDERS;
  const needCases = !casesOf(labels);
  const needUnits = units && !labels?.unit;
  if (needCases && needUnits) {
    return {
      zh: `考试时把 ${cases.zh} 换成题目里的个案（例如 Tim Hortons donuts），把 ${unitWords.zh} 换成变量的单位。`,
      en: `On a test, replace ${cases.en} with the cases of the question (for example Tim Hortons donuts) and ${unitWords.en} with the units of the variable.`,
    };
  }
  if (needCases) {
    return {
      zh: `考试时把 ${cases.zh} 换成题目里的个案，例如 Tim Hortons donuts。`,
      en: `On a test, replace ${cases.en} with the cases of the question, for example Tim Hortons donuts.`,
    };
  }
  if (needUnits) {
    return {
      zh: `考试时把 ${unitWords.zh} 换成变量的单位。`,
      en: `On a test, replace ${unitWords.en} with the units of the variable.`,
    };
  }
  return null;
}

/** M3 p.37 and M3 practice Q1d: the most frequent value, several tied modes, or none. 众数的解释句。 */
export function modeSentence(analysis, { unit }) {
  const { n, digits } = analysis;
  const { values, count } = analysis.modes;
  const shown = values.map((value) => withUnit(num(value, digits.data), unit));
  if (!values.length) {
    return {
      zh: '每个值都只出现一次，没有哪个值比其他值出现得更多，所以没有众数。',
      en: 'Every value appears only once, so no value is more frequent than the others: there is no mode.',
    };
  }
  if (values.length === 1) {
    return {
      zh: `出现次数最多的值是 ${shown[0]}（${n} 个值中有 ${count} 个），所以众数是 ${shown[0]}。`,
      en: `The most frequent value is ${shown[0]} (${count} out of ${n} values), so the mode is ${shown[0]}.`,
    };
  }
  return {
    zh: `有 ${values.length} 个众数：${listZh(shown)}（${n} 个值中各出现 ${count} 次）。`,
    en: `There are ${values.length} modes: ${listEn(shown)} (each appears ${count} times out of ${n}).`,
  };
}

/** M3 p.44 and M4 p.17: the values run from Min to Max. 极差的解释句。 */
export function rangeSentence(analysis, { variable, unit }) {
  const min = measureText(analysis, 'min', unit);
  const max = measureText(analysis, 'max', unit);
  const spread = measureText(analysis, 'range', unit);
  if (analysis.range === 0) {
    return {
      zh: `“${variable.zh}”的每个值都等于 ${min}，所以极差是 ${spread}。`,
      en: `Every value of ${inSentence(variable)} equals ${min}, so the range is ${spread}.`,
    };
  }
  return {
    zh: `“${variable.zh}”从 ${min} 到 ${max}，所以极差是 ${spread}。`,
    en: `The values of ${inSentence(variable)} range from ${min} to ${max}, so the range is ${spread}.`,
  };
}

/** M4 p.6 and p.17: the middle 50% lie between Q1 and Q3, a range of IQR. IQR 的解释句。 */
export function iqrSentence(analysis, { variable, unit }) {
  const q1 = measureText(analysis, 'q1', unit);
  const q3 = measureText(analysis, 'q3', unit);
  const spread = measureText(analysis, 'iqr', unit);
  return {
    zh: `“${variable.zh}”中间 50% 的值落在 Q1 = ${q1} 到 Q3 = ${q3} 之间，跨度（IQR）是 ${spread}。`,
    en: `The middle 50% of the values of ${inSentence(variable)} lie between Q1 = ${q1} and Q3 = ${q3}, a range of ${spread} (the IQR).`,
  };
}

/** M3 p.53 and M3 practice Q3f: "We can expect <variable> to differ from the mean by about S, on average." 标准差的解释句。 */
export function sdSentence(analysis, { variable, unit }) {
  const value = measureText(analysis, 'sd', unit);
  if (analysis.sd === 0) {
    return {
      zh: `S = 0：“${variable.zh}”的每个值都等于平均数，数据没有任何变化（no variation）。`,
      en: `S = 0: every value of ${inSentence(variable)} equals the mean, so there is no variation.`,
    };
  }
  return {
    zh: `我们可以预期，“${variable.zh}”与平均数平均相差大约 ${value}。`,
    en: `We can expect ${inSentence(variable)} to differ from the mean by about ${value}, on average.`,
  };
}

/* ---------- Worked steps 解题步骤 ---------- */

function sortStep(analysis) {
  const marks = {
    zh: '标记：Min = 最小值，Max = 最大值，Q2 = 中位数，Q1 和 Q3 = 四分位数。',
    en: 'Marks: Min and Max are the smallest and largest values, Q2 is the median, Q1 and Q3 are the quartiles.',
  };
  let cells = {
    zh: 'R 的方法可能用到两个相邻的位置。',
    en: " R's method may use two neighbouring positions.",
  };
  if (analysis.method === 'hand') {
    const excluded = analysis.quartiles.medianExcluded;
    cells = {
      zh: `灰色格子是下半部分，蓝色格子是上半部分${excluded ? '，虚线框是不放进任何一半的中位数' : ''}。`,
      en: ` Grey cells form the lower half and blue cells the upper half${excluded ? '; the dashed cell is the median, which belongs to neither half' : ''}.`,
    };
  }
  return {
    id: 'sort',
    title: { zh: '排序，给每个值编上位置', en: 'Sort the data and number the positions' },
    why: {
      zh: '中位数和四分位数都是按“位置”（rank position）找的，所以先把数据从小到大排好，再给每个值编号 1、2、…、n。',
      en: 'The median and the quartiles are found by position, so first sort the values from smallest to largest and number them 1, 2, …, n.',
    },
    items: [
      { kind: 'work', lines: [`n = ${analysis.n}`] },
      { kind: 'positions' },
      { kind: 'explain', text: { zh: `${marks.zh}${cells.zh}`, en: `${marks.en}${cells.en}` } },
    ],
    sentence: null,
  };
}

function meanStep(analysis, labels) {
  const { n, sorted, digits } = analysis;
  return {
    id: 'mean',
    title: { zh: '平均数 ȳ（样本平均数）', en: 'Mean ȳ (sample mean)' },
    why: {
      zh: 'Σ（读作 sigma）表示“全部加起来”。平均数 = 所有值的总和 ÷ 值的个数 n。它是数据的“平衡点”，但会被极端值拉过去，所以不耐抗（not resistant）。',
      en: 'Σ (sigma) means "add them all up". The mean is the sum of all values divided by the number of values n. It is the balance point of the data, but extreme values pull it, so it is not resistant.',
    },
    items: [
      { kind: 'formula', text: 'ȳ = Σy / n' },
      {
        kind: 'work',
        lines: [
          `ȳ = (${numTerms(sorted, (value) => numOperand(value, digits.data))}) / ${n}`,
          `= ${num(analysis.sum, digits.data)} / ${n}`,
          `${measureSign(analysis, 'mean')} ${num(analysis.mean, digits.mean)}`,
        ],
      },
    ],
    sentence: meanSentence(analysis, labels),
    hint: placeholderHint(labels, { units: true }),
  };
}

function medianStep(analysis, labels) {
  const { n, median, digits } = analysis;
  const rank = num(median.rank, 1);
  const value = num(median.value, digits.position);
  const even = median.positions.length === 2;
  const where = positionsName(median.positions);
  const lines = [`0.5 × (${n} + 1) = ${rank}`];
  if (even) {
    const [low, high] = median.middle;
    lines.push(`median = (${num(low, digits.data)} + ${numOperand(high, digits.data)}) / 2 = ${value}`);
  } else {
    lines.push(`median = ${value}`);
  }
  return {
    id: 'median',
    title: { zh: '中位数', en: 'Median' },
    why: {
      zh: '中位数是排好序后正中间的值：一半数据不超过它，一半数据比它大。它只看位置、不看两端的值有多大，所以不怕极端值（耐抗，resistant）。',
      en: 'The median is the middle value of the sorted data: half of the values are at most the median and half are above it. It depends only on position, not on how large the extreme values are, so it is resistant.',
    },
    items: [
      { kind: 'formula', text: 'position = 0.5 × (n + 1)' },
      { kind: 'work', lines },
      {
        kind: 'explain',
        text: even
          ? {
            zh: `n = ${n} 是偶数：位置 ${rank} 落在${where.zh}之间，所以中位数是这两个值的平均。`,
            en: `n = ${n} is even: position ${rank} lies between ${where.en}, so the median is their average.`,
          }
          : {
            zh: `n = ${n} 是奇数：中位数就是${where.zh}。`,
            en: `n = ${n} is odd, so the median is ${where.en}.`,
          },
      },
    ],
    sentence: medianSentence(analysis, labels),
    hint: placeholderHint(labels),
  };
}

function modeStep(analysis, labels) {
  const { values, count } = analysis.modes;
  const shown = values.map((value) => num(value, analysis.digits.data));
  const items = [];
  if (values.length === 1) {
    items.push(
      { kind: 'work', lines: [`mode = ${shown[0]}`] },
      {
        kind: 'explain',
        text: {
          zh: `${shown[0]} 出现了 ${count} 次，比其他任何值都多。`,
          en: `${shown[0]} appears ${count} times, more often than any other value.`,
        },
      },
    );
  } else if (values.length > 1) {
    items.push(
      { kind: 'work', lines: [`modes = ${shown.join(', ')}`] },
      {
        kind: 'explain',
        text: {
          zh: `${listZh(shown)} 各出现 ${count} 次，并列最多，所以它们都是众数。`,
          en: `${listEn(shown)} each appear ${count} times, tied for the most, so all of them are modes.`,
        },
      },
    );
  }
  return {
    id: 'mode',
    title: { zh: '众数', en: 'Mode' },
    why: {
      zh: '众数 = 出现次数最多的值，可以有好几个。它常用于分类变量和离散变量（Module 3 第 36 页）。',
      en: 'The mode is the value that occurs most often; there can be several. It is mostly used for categorical and discrete variables.',
    },
    items,
    sentence: modeSentence(analysis, labels),
  };
}

function rangeStep(analysis, labels) {
  const { digits } = analysis;
  const max = num(analysis.max, digits.data);
  const min = numOperand(analysis.min, digits.data);
  return {
    id: 'range',
    title: { zh: '极差', en: 'Range' },
    why: {
      zh: '极差 = 最大值 − 最小值。它只用到最两端的两个值，所以一个极端值就能让它变很多（不耐抗）。',
      en: 'Range = Max − Min. It uses only the two most extreme values, so a single extreme value can change it a lot (not resistant).',
    },
    items: [{ kind: 'work', lines: [`Range = Max − Min = ${max} − ${min} = ${num(analysis.range, digits.data)}`] }],
    sentence: rangeSentence(analysis, labels),
  };
}

// The slide's remark on R's quartiles (M4 p.6), in our own words. 课件对 R 四分位数的说明（第 4 单元第 6 页），用自己的话转述。
function rRemark(hand) {
  return {
    kind: 'note',
    tone: 'info',
    text: {
      zh: `课件说明：R 用另一种（更高级的）算法求四分位数，所以 R 的结果可能和手算不同，这很正常；课程里的四分位数以 R 的输出为准。${hand ? '切换到“R 的方法”可以对比。' : ''}`,
      en: `The slides note that R uses a different, more advanced algorithm for the quartiles, so R's results can differ from a hand calculation; that is expected, and the course takes quartile values from R.${hand ? " Switch to R's method to compare." : ''}`,
    },
  };
}

function iqrLine(analysis) {
  const { quartiles: info, digits } = analysis;
  return `IQR = Q3 − Q1 = ${num(info.q3, digits.position)} − ${numOperand(info.q1, digits.position)} = ${num(info.iqr, digits.position)}`;
}

// The median of one half: "Q1 = 210" or "Q1 = (205 + 215) / 2 = 210". 某一半的中位数。
function halfMedianLine(key, half, digits) {
  const value = num(half.value, digits.position);
  if (half.positions.length === 1) return `${key} = ${value}`;
  const [low, high] = half.positions.map((position) => half.values[position - 1]);
  return `${key} = (${num(low, digits.data)} + ${numOperand(high, digits.data)}) / 2 = ${value}`;
}

function handQuartileItems(analysis) {
  const { n, quartiles: info, digits } = analysis;
  const items = [];
  if (info.medianExcluded) {
    const middle = (n + 1) / 2;
    items.push({
      kind: 'note',
      tone: 'info',
      text: {
        zh: `n = ${n} 是奇数：中位数（第 ${middle} 个值）不放进任何一半。课件只举了 n 为偶数的例子；有的方法会把中位数放进两半，四分位数可能略有不同。`,
        en: `n = ${n} is odd: the median (the ${ordinal(middle)} value) is not included in either half. The slides only show an even n; some methods put the median into both halves, which can change the quartiles slightly.`,
      },
    });
  }
  const halves = [
    { key: 'Q1', half: info.lowerHalf, name: { zh: '下半部分', en: 'Lower half' } },
    { key: 'Q3', half: info.upperHalf, name: { zh: '上半部分', en: 'Upper half' } },
  ];
  for (const { key, half, name } of halves) {
    const span = spanName(half.from, half.to);
    let mapping = { zh: '', en: '' };
    if (half.from > 1) {
      const inside = positionsName(half.positions);
      const overall = positionsName(half.positions.map((position) => position + half.from - 1));
      mapping = {
        zh: `它的${inside.zh}就是全部数据的${overall.zh}。`,
        en: ` Its ${inside.en.replace(/^the /, '')} ${half.positions.length > 1 ? 'are' : 'is'} ${overall.en} overall.`,
      };
    }
    items.push(
      {
        kind: 'explain',
        text: {
          zh: `${name.zh}：${span.zh}。${key} 是这一半的中位数。${mapping.zh}`,
          en: `${name.en}: ${span.en}. ${key} is the median of this half.${mapping.en}`,
        },
      },
      {
        kind: 'work',
        lines: [
          `position in the half = 0.5 × (${half.values.length} + 1) = ${num(half.rank, 1)}`,
          halfMedianLine(key, half, digits),
        ],
      },
    );
  }
  items.push({ kind: 'work', lines: [iqrLine(analysis)] }, rRemark(true));
  return items;
}

// One quartile by R's rule: h = (n − 1) × p + 1, then the value at h or between its two neighbours.
// 按 R 的规则求一个四分位数：h = (n − 1) × p + 1，再取第 h 个值或它两旁两个值之间的值。
function r7QuartileItems(analysis, key, p) {
  const { n, sorted, quartiles: info, digits } = analysis;
  const lower = key === 'Q1';
  const rank = lower ? info.ranks.q1 : info.ranks.q3;
  const positions = lower ? info.positions.q1 : info.positions.q3;
  const value = num(lower ? info.q1 : info.q3, digits.position);
  const h = num(rank, 2);
  const lines = [`h = (${n} − 1) × ${p} + 1 = ${h}`];
  if (positions.length === 1) {
    lines.push(`${key} = ${value}`);
    return [
      { kind: 'work', lines },
      {
        kind: 'explain',
        text: {
          zh: `h = ${h} 是整数：${key} 就是第 ${positions[0]} 个值。`,
          en: `h = ${h} is a whole number, so ${key} is the ${ordinal(positions[0])} value.`,
        },
      },
    ];
  }
  const [a, b] = positions;
  const low = sorted[a - 1];
  const high = sorted[b - 1];
  const fraction = num(rank - a, 2);
  lines.push(`${key} = ${num(low, digits.data)} + ${fraction} × (${num(high, digits.data)} − ${numOperand(low, digits.data)}) = ${value}`);
  return [
    { kind: 'work', lines },
    {
      kind: 'explain',
      text: {
        zh: `h = ${h} 落在第 ${a} 和第 ${b} 个值之间：从第 ${a} 个值出发，再加上它到下一个值的差距的 ${fraction}。`,
        en: `h = ${h} lies between the ${ordinal(a)} and ${ordinal(b)} values: start at the ${ordinal(a)} value and add ${fraction} of the gap to the next value.`,
      },
    },
  ];
}

function r7Items(analysis) {
  return [
    {
      kind: 'note',
      tone: 'extra',
      text: {
        zh: '补充（课件外）：R 的 summary()、quantile() 和 favstats() 默认用这个规则（type 7）：位置 h = (n − 1) × p + 1，Q1 取 p = 0.25，Q3 取 p = 0.75；h 不是整数时，在相邻两个值之间按比例取值。考试不用背这个公式，课程直接读 R 的输出。',
        en: "Extra (not on the slides): R's summary(), quantile() and favstats() use this rule by default (type 7): position h = (n − 1) × p + 1, with p = 0.25 for Q1 and p = 0.75 for Q3; when h is not a whole number, go that fraction of the way from one value to the next. You do not need to memorize it: the course reads quartiles from R's output.",
      },
    },
    { kind: 'formula', text: 'h = (n − 1) × p + 1' },
    ...r7QuartileItems(analysis, 'Q1', 0.25),
    ...r7QuartileItems(analysis, 'Q3', 0.75),
    { kind: 'work', lines: [iqrLine(analysis)] },
    rRemark(false),
  ];
}

function quartileStep(analysis, labels) {
  const hand = analysis.method === 'hand';
  return {
    id: 'quartiles',
    title: hand
      ? { zh: '四分位数 Q1、Q3 与四分位距 IQR（手算：每一半的中位数）', en: 'Quartiles Q1, Q3 and the IQR (hand method: the median of each half)' }
      : { zh: '四分位数 Q1、Q3 与四分位距 IQR（R 的方法）', en: "Quartiles Q1, Q3 and the IQR (R's method)" },
    why: {
      zh: 'Q1（下四分位数，第 25 百分位数）以下大约有 25% 的数据，Q3（上四分位数，第 75 百分位数）以下大约有 75% 的数据。IQR = Q3 − Q1 是中间 50% 数据的跨度，不受两端极端值影响（耐抗）。',
      en: 'About 25% of the data lie below Q1 (lower quartile, 25th percentile) and about 75% below Q3 (upper quartile, 75th percentile). IQR = Q3 − Q1 is the range of the middle 50% of the data, and it is resistant to extreme values.',
    },
    items: hand ? handQuartileItems(analysis) : r7Items(analysis),
    sentence: iqrSentence(analysis, labels),
  };
}

function sdStep(analysis, labels) {
  const { n, sorted, digits } = analysis;
  const meanOperand = numOperand(analysis.mean, digits.deviation);
  const terms = numTerms(sorted, (value) => `(${num(value, digits.data)} − ${meanOperand})²`);
  const sumSign = numSign(analysis.sumSquared, digits.squared);
  const sumText = num(analysis.sumSquared, digits.squared);
  const varianceText = num(analysis.variance, digits.variance);
  const varianceSign = sumSign === '=' ? numSign(analysis.variance, digits.variance) : APPROX;
  const sdSign = varianceSign === '=' ? numSign(analysis.sd, digits.sd) : APPROX;
  return {
    id: 'sd',
    title: { zh: '方差 S² 与标准差 S', en: 'Variance S² and standard deviation S' },
    why: {
      zh: '先算每个值离平均数多远：偏差 y − ȳ。偏差加起来总是 0（正负抵消），所以先平方再相加，再除以 n − 1，得到方差 S²；最后开平方，得到标准差 S。它们都不耐抗。',
      en: 'First find how far each value is from the mean: the deviation y − ȳ. The deviations always add up to 0, so square them before adding, then divide by n − 1 to get the variance S²; the square root is the standard deviation S. Neither is resistant.',
    },
    items: [
      { kind: 'formula', text: 'S² = Σ(y − ȳ)² / (n − 1)' },
      { kind: 'formula', text: 'S = √S²' },
      { kind: 'deviations' },
      {
        kind: 'work',
        lines: [
          `Σ(y − ȳ)² = ${terms}`,
          `${sumSign} ${sumText}`,
          `S² ${sumSign} ${sumText} / (${n} − 1) ${sumSign} ${sumText} / ${n - 1} ${varianceSign} ${varianceText}`,
          `S = √${varianceText} ${sdSign} ${num(analysis.sd, digits.sd)}`,
        ],
      },
      {
        kind: 'explain',
        text: {
          zh: '除以 n − 1（自由度，degrees of freedom），不是 n：平均数是从同一组数据估计出来的。S² 的单位是数据单位的平方，开平方后的 S 和数据的单位相同。',
          en: 'Divide by n − 1 (the degrees of freedom), not by n, because the mean was estimated from the same data. S² is in squared units; its square root S is in the same units as the data.',
        },
      },
    ],
    sentence: sdSentence(analysis, labels),
  };
}

/**
 * The worked steps in the order of the widget: sort, mean, median, mode, range, quartiles and IQR, variance and
 * standard deviation. Each step is { id, title, why, items, sentence }: `items` run in display order and are
 * { kind: 'formula', text }, { kind: 'work', lines }, { kind: 'explain', text: Bi }, { kind: 'note', tone, text: Bi },
 * { kind: 'positions' } (positionCells) or { kind: 'deviations' } (deviationView); `sentence` is the exam sentence
 * or null. The mean and median steps also carry `hint`, what to fill into the sentence's placeholders
 * (placeholderHint), or null. `labels` is { variable: Bi, unit, cases } from the config.
 * 组件中按顺序显示的解题步骤：排序、平均数、中位数、众数、极差、四分位数与 IQR、方差与标准差。每一步为
 * { id, title, why, items, sentence }：items 按显示顺序排列，可以是公式、计算行、讲解、提示、排序表（positionCells）
 * 或偏差表（deviationView）；sentence 是考试时的解释句，没有时为 null。平均数和中位数两步还带有 hint：句子里的占位词要填什么
 * （placeholderHint），没有时为 null。labels 是配置中的 { variable, unit, cases }。
 */
export function centreSpreadSteps(analysis, labels) {
  return [
    sortStep(analysis),
    meanStep(analysis, labels),
    medianStep(analysis, labels),
    modeStep(analysis, labels),
    rangeStep(analysis, labels),
    quartileStep(analysis, labels),
    sdStep(analysis, labels),
  ];
}

/**
 * The sorted data as cells { position, text, marks, half }: marks are among "Min", "Q1", "Q2" (median), "Q3", "Max"
 * at the positions each one uses; half is "lower" or "upper" for the hand method, "median" for a median left out
 * of both halves, and null otherwise.
 * 排序后的数据，每格为 { position, text, marks, half }：marks 是 Min、Q1、Q2（中位数）、Q3、Max 中用到这个位置的那些；
 * half 在手算方法中为 lower 或 upper，不放进任何一半的中位数为 median，其余为 null。
 */
export function positionCells(analysis) {
  const { n, sorted, digits, median, quartiles: info } = analysis;
  const marks = Array.from({ length: n }, () => []);
  const mark = (positions, name) => {
    for (const position of positions) {
      const list = marks[position - 1];
      if (list && !list.includes(name)) list.push(name);
    }
  };
  if (n) mark([1], 'Min');
  mark(info.positions.q1, 'Q1');
  mark(median.positions, 'Q2');
  mark(info.positions.q3, 'Q3');
  if (n) mark([n], 'Max');
  const halfOf = (position) => {
    if (info.method !== 'hand') return null;
    if (position >= info.lowerHalf.from && position <= info.lowerHalf.to) return 'lower';
    if (position >= info.upperHalf.from && position <= info.upperHalf.to) return 'upper';
    return info.medianExcluded ? 'median' : null;
  };
  return sorted.map((value, index) => ({
    position: index + 1,
    text: num(value, digits.data),
    marks: marks[index],
    half: halfOf(index + 1),
  }));
}

/**
 * The deviation table of M3 p.45-53 in sorted order: rows { position, y, deviation, squared } as text (deviations
 * signed, like "+3"), the footer sums { sum, sumDeviation, sumSquared }, and a note when table cells are rounded.
 * 第 3 单元第 45-53 页的偏差表（按排序后的顺序）：每行 { position, y, deviation, squared } 都是文字（偏差带正负号，如“+3”），
 * 表尾为各列之和；表中数字经过四舍五入时附上说明。
 */
export function deviationView(analysis) {
  const { digits } = analysis;
  const rounded = analysis.deviations.some((row) => numSign(row.deviation, digits.deviation) !== '='
    || numSign(row.squared, digits.squared) !== '=');
  return {
    rows: analysis.deviations.map((row) => ({
      position: row.index + 1,
      y: num(row.x, digits.data),
      deviation: numSigned(row.deviation, digits.deviation),
      squared: num(row.squared, digits.squared),
    })),
    footer: {
      sum: num(analysis.sum, digits.data),
      sumDeviation: num(analysis.sumDeviation, digits.deviation),
      sumSquared: num(analysis.sumSquared, digits.squared),
    },
    note: rounded
      ? {
        zh: `表中的偏差和平方都四舍五入到最多 ${digits.deviation} 位小数；Σ 用的是没有四舍五入的值。`,
        en: `Deviations and squares in the table are rounded to at most ${digits.deviation} decimals; the sums use the unrounded values.`,
      }
      : null,
  };
}

/**
 * Results at a glance, in three groups named like the slides: centre (mean, median, mode), spread (range, IQR,
 * S², S) and position (Min, Q1, Q3, Max). Items are { id, symbol, label, value } with value as printed text, or
 * { valueBi } instead for a mode that is not a short list of numbers.
 * 结果一览，按课件分成三组：集中趋势（平均数、中位数、众数）、离散程度（极差、IQR、S²、S）与位置（最小值、Q1、Q3、最大值）。
 * 每项为 { id, symbol, label, value }；众数不是简短的数字列表时改用 valueBi。
 */
export function summaryGroups(analysis, unit) {
  const tile = (id) => ({ id, symbol: MEASURES[id].symbol, label: MEASURES[id].label, value: measureText(analysis, id, unit) });
  const { values } = analysis.modes;
  const modeTile = { id: 'mode', symbol: '', label: { zh: '众数', en: 'mode' } };
  if (!values.length) modeTile.valueBi = { zh: '没有', en: 'none' };
  else if (values.length > 3) modeTile.valueBi = { zh: `${values.length} 个众数`, en: `${values.length} modes` };
  else modeTile.value = values.map((value) => withUnit(num(value, analysis.digits.data), unit)).join(', ');
  return [
    { id: 'centre', title: { zh: '集中趋势', en: 'Centre' }, items: [tile('mean'), tile('median'), modeTile] },
    { id: 'spread', title: { zh: '离散程度', en: 'Spread' }, items: [tile('range'), tile('iqr'), tile('variance'), tile('sd')] },
    { id: 'position', title: { zh: '位置', en: 'Position' }, items: [tile('min'), tile('q1'), tile('q3'), tile('max')] },
  ];
}

/* ---------- Dot plot 点图 ---------- */

// Values a dot plot can place: between 10⁻³⁰⁰ and 10³⁰⁰ in size (or 0), so the axis arithmetic never overflows.
// 点图能放下的数值：大小在 10⁻³⁰⁰ 到 10³⁰⁰ 之间（或为 0），保证坐标轴的计算不会溢出。
const PLOT_LIMIT = 1e300;
const MAX_TICKS = 100;

// The x axis of the dot plot, or null when the values are too large or too close together to draw.
// 点图的横轴；数值太大或彼此太接近、无法画出时为 null。
function plotAxis(sorted) {
  const placeable = sorted.length && sorted.every((value) => value === 0
    || (Math.abs(value) <= PLOT_LIMIT && Math.abs(value) >= 1 / PLOT_LIMIT));
  const span = placeable ? sorted[sorted.length - 1] - sorted[0] : NaN;
  if (!(span === 0 || span >= 1 / PLOT_LIMIT)) return null;
  const extent = niceExtent(sorted, { anchorZero: false });
  const usable = Number.isFinite(extent.min) && Number.isFinite(extent.max) && extent.max > extent.min
    && extent.step > 0 && extent.ticks.length <= MAX_TICKS;
  return usable ? extent : null;
}

/**
 * What the dot plot draws: axis extents in the plot frame's shape, one stack of dots per distinct value (the
 * outlier marked), the mean, median and quartiles, and a text description for screen readers. `drawable` is false
 * when the values are too large or too close together for an axis; the description then says so.
 * 点图要画的内容：坐标框格式的坐标范围、每个不同取值一列点（标出离群值）、平均数、中位数与四分位数，以及给读屏软件的文字说明。
 * 数值太大或彼此太接近、画不出坐标轴时 drawable 为 false，文字说明也会说明这一点。
 */
export function plotModel(analysis, { outlier = null, unit = '' } = {}) {
  const maxCount = analysis.counts.reduce((most, item) => Math.max(most, item.count), 0);
  const marked = toNumber(outlier);
  const text = (id) => measureText(analysis, id, unit);
  const meanSign = measureSign(analysis, 'mean');
  const outlierText = marked === null ? '' : withUnit(num(marked, analysis.digits.data), unit);
  const xExtent = plotAxis(analysis.sorted);
  if (!xExtent) {
    return {
      drawable: false,
      description: {
        zh: '这些数值太大（或彼此太接近），无法画出点图；下面的步骤照常计算。',
        en: 'These values are too large (or too close together) to draw a dot plot; the steps below still work them out.',
      },
    };
  }
  return {
    drawable: true,
    xExtent,
    yExtent: { min: 0, max: Math.max(4, maxCount + 1), step: 1, ticks: [] },
    stacks: analysis.counts.map(({ value, count }) => ({ value, count, outlier: marked !== null && sameNumber(value, marked) })),
    maxCount,
    mean: analysis.mean,
    median: analysis.median.value,
    q1: analysis.quartiles.q1,
    q3: analysis.quartiles.q3,
    description: {
      zh: `点图：${analysis.n} 个值，从 ${text('min')} 到 ${text('max')}。平均数 ȳ ${meanSign} ${text('mean')}，中位数 = ${text('median')}；阴影是从 Q1 = ${text('q1')} 到 Q3 = ${text('q3')} 的中间 50%。${outlierText ? `标出的点是离群值 ${outlierText}。` : ''}`,
      en: `Dot plot of ${analysis.n} values from ${text('min')} to ${text('max')}. Mean ȳ ${meanSign} ${text('mean')}, median = ${text('median')}; the shaded band is the middle 50%, from Q1 = ${text('q1')} to Q3 = ${text('q3')}.${outlierText ? ` The marked dot is the outlier ${outlierText}.` : ''}`,
    },
  };
}

/* ---------- Status messages 状态提示 ---------- */

/** After the data change: n, ȳ, the median and S. 数据更新后的提示。 */
export function updateMessage(analysis, unit) {
  const mean = `${measureSign(analysis, 'mean')} ${measureText(analysis, 'mean', unit)}`;
  const sd = `${measureSign(analysis, 'sd')} ${measureText(analysis, 'sd', unit)}`;
  const median = measureText(analysis, 'median', unit);
  return {
    zh: `已更新：n = ${analysis.n}，ȳ ${mean}，中位数 = ${median}，S ${sd}。`,
    en: `Updated: n = ${analysis.n}, ȳ ${mean}, median = ${median}, S ${sd}.`,
  };
}

/** After the quartile method changes: Q1, Q3 and the IQR by the new method. 换了四分位数方法后的提示。 */
export function methodMessage(analysis, unit) {
  const name = METHOD_NAMES[analysis.method];
  const parts = ['q1', 'q3', 'iqr'].map((id) => `${MEASURES[id].symbol} = ${measureText(analysis, id, unit)}`);
  return {
    zh: zhJoin('四分位数改用', name.zh, `：${parts.join('，')}。`),
    en: `Quartiles now use ${name.en}: ${parts.join(', ')}.`,
  };
}

/* ---------- Resistance 耐抗性 ---------- */

/**
 * The outlier demo: the largest value (its last occurrence) moves OUTLIER_RANGES ranges further up, or by twice its
 * own size when every value is equal. Returns { values (input order), index, from, to }.
 * 离群值演示：最大值（最后一次出现的那个）再往上移 OUTLIER_RANGES 个极差；所有值都相等时，移动它自身大小的两倍。
 * 返回 { values（原顺序）, index, from, to }。
 */
export function outlierSwap(values) {
  const numbers = finiteNumbers(values);
  if (!numbers.length) return { values: [], index: -1, from: NaN, to: NaN };
  let index = 0;
  numbers.forEach((value, at) => {
    if (value >= numbers[index]) index = at;
  });
  const sorted = sortAscending(numbers);
  const from = numbers[index];
  const spread = sorted[sorted.length - 1] - sorted[0];
  const step = spread > 0 ? spread : Math.abs(from) || 1;
  // Values near the limit of floating point would overflow; the largest finite number stands in then.
  // 接近浮点数上限的值会溢出，这时用最大的有限数代替。
  const moved = roundTo(from + OUTLIER_RANGES * step, digitsFor(sorted).data);
  const to = Number.isFinite(moved) ? moved : Number.MAX_VALUE;
  const next = numbers.slice();
  next[index] = to;
  return { values: next, index, from, to };
}

/** Status after the outlier switch: on (with the new value) or off. 离群值开关切换后的提示。 */
export function outlierMessage(swap, on, unit) {
  const digits = digitsFor(swap.values).data;
  const from = withUnit(num(swap.from, digits), unit);
  const to = withUnit(num(swap.to, digits), unit);
  return on
    ? {
      zh: `最大值 ${from} 变成了 ${to}，成为离群值。下面的对比表显示哪些指标变了。`,
      en: `The largest value ${from} is now ${to}, an outlier. The comparison below shows which measures changed.`,
    }
    : { zh: `最大值恢复为 ${from}。`, en: `The largest value is back to ${from}.` };
}

/**
 * Compares the measures before and after the outlier (M3 p.68, M4 p.46). Returns { rows, sentence, rule, advice,
 * note }: rows { id, symbol, label, before, after, change, changed, resistant } (change is signed text, or null when
 * the measure did not move); sentence says what changed with these numbers; rule and advice are the slides'
 * conclusions; note explains a quartile that moved because n is small, or is null.
 * 比较离群值出现前后的各项指标（第 3 单元第 68 页、第 4 单元第 46 页）。返回 { rows, sentence, rule, advice, note }：
 * 每行为 { id, symbol, label, before, after, change, changed, resistant }（change 是带正负号的文字，没变时为 null）；
 * sentence 用这组数字说明哪些变了；rule 与 advice 是课件的结论；note 解释 n 很小时四分位数为什么也变了，没有时为 null。
 */
export function resistanceReport(before, after, swap, { unit }) {
  const rows = RESISTANCE_ROWS.map((id) => {
    const measure = MEASURES[id];
    const digits = Math.max(before.digits[measure.digits], after.digits[measure.digits]);
    const old = measure.read(before);
    const next = measure.read(after);
    const changed = !sameNumber(old, next);
    const change = numSigned(next - old, digits);
    return {
      id,
      symbol: measure.symbol,
      label: measure.label,
      before: measureText(before, id, unit, digits),
      after: measureText(after, id, unit, digits),
      change: changed ? (measure.unit ? withUnit(change, unit) : change) : null,
      changed,
      resistant: RESISTANT.has(id),
    };
  });
  const moved = rows.filter((row) => row.changed).map((row) => MEASURES[row.id].name);
  const steady = rows.filter((row) => !row.changed).map((row) => MEASURES[row.id].name);
  const digits = Math.max(before.digits.data, after.digits.data);
  const from = withUnit(num(swap.from, digits), unit);
  const to = withUnit(num(swap.to, digits), unit);
  // Only values at the edge of floating point leave every measure where it was. 只有接近浮点数极限的值才会让所有指标都不变。
  const sentence = moved.length
    ? {
      zh: zhJoin(
        `把最大值 ${from} 换成 ${to}：`,
        listZh(moved.map((name) => name.zh)),
        moved.length > 1 ? '都变了' : '变了',
        steady.length ? `，${listZh(steady.map((name) => name.zh))}` : '',
        steady.length ? '没有变' : '',
        '。',
      ),
      en: `Replacing the largest value ${from} by ${to} changes ${listEn(moved.map((name) => name.en))}${steady.length ? `, but not ${listEn(steady.map((name) => name.en), 'or')}` : ''}.`,
    }
    : {
      zh: `把最大值 ${from} 换成 ${to}：这些指标都没有变。`,
      en: `Replacing the largest value ${from} by ${to} changes none of these measures.`,
    };
  return {
    rows,
    sentence,
    rule: {
      zh: '课件结论：平均数、极差、方差和标准差不耐抗（会被极端值拉动）；中位数和 IQR 耐抗（几乎不受影响）。',
      en: 'From the slides: the mean, range, variance and standard deviation are not resistant (extreme values pull them); the median and the IQR are resistant (hardly affected).',
    },
    advice: {
      zh: '所以：数据偏斜或有离群值时，报告中位数和 IQR；数据大致对称、呈钟形时，报告平均数和标准差。',
      en: 'So for skewed data or data with outliers, report the median and the IQR; for roughly symmetric, bell-shaped data, report the mean and the standard deviation.',
    },
    note: rows.some((row) => row.resistant && row.changed)
      ? {
        zh: `注意：这里只有 n = ${after.n} 个值，Q3 的计算用到了最大值，所以 IQR 也跟着变了。数据多一些时，Q3 不再用到最大值，IQR 就不受它影响。`,
        en: `Note: with only n = ${after.n} values, Q3 is computed from the largest value, so the IQR changes too. With more data, Q3 no longer uses the largest value and the IQR is not affected.`,
      }
      : null,
  };
}

/* ---------- Adding or multiplying by a constant 加上或乘以常数 ---------- */

// Decimals that keep a transformed value exact, so binary noise (0.1 + 0.2) never reaches the steps.
// 让变换后的值保持精确的小数位数，二进制误差（0.1 + 0.2）不会出现在步骤里。
function transformDigits(numbers, multiply, constant) {
  const data = numbers.reduce((most, value) => Math.max(most, decimalsOf(value)), 0);
  const extra = decimalsOf(constant);
  return Math.min(8, multiply ? data + extra : Math.max(data, extra));
}

/**
 * Every value plus c ("add") or times k ("multiply"), in input order. A missing constant changes nothing.
 * 每个值都加上 c（add）或乘以 k（multiply），保持原顺序。没有常数时不做任何改变。
 */
export function transformData(values, operation, constant) {
  const numbers = finiteNumbers(values);
  const multiply = operation === 'multiply';
  const amount = toNumber(constant, multiply ? 1 : 0);
  const digits = transformDigits(numbers, multiply, amount);
  return numbers.map((value) => {
    const next = roundTo(multiply ? value * amount : value + amount, digits);
    return next === 0 ? 0 : next;
  });
}

// The new variable as written in the table: "y + 10", "y − 5", "2 × y", "(−2) × y". 新变量的写法。
function expressionFor(operation, constant) {
  if (operation === 'multiply') return `${numOperand(constant, 6)} × y`;
  return constant < 0 ? `y ${MINUS} ${num(-constant, 6)}` : `y + ${num(constant, 6)}`;
}

// How one measure moves under the transformation, as Bi text ("+ 10", "× 2", "= (−2) × the old Q3", "unchanged").
// 某个指标在变换下怎样变化（如“+ 10”“× 2”“= (−2) × 原来的 Q3”“不变”）。
function ruleFor(id, operation, constant) {
  const { kind } = MEASURES[id];
  const k = numOperand(constant, 6);
  if (operation === 'add') {
    if (kind !== 'position' || constant === 0) return { ...UNCHANGED };
    return same(constant > 0 ? `+ ${num(constant, 6)}` : `${MINUS} ${num(-constant, 6)}`);
  }
  if (kind === 'variance') return same(`× ${k}² = × ${num(constant * constant, 8)}`);
  if (kind === 'spread') return same(constant < 0 ? `× |${num(constant, 6)}| = × ${num(-constant, 6)}` : `× ${k}`);
  if (constant < 0 && MIRRORED[id]) {
    return { zh: zhJoin(`= ${k} × 原来的`, MIRRORED[id].zh), en: `= ${k} × the old ${MIRRORED[id].en}` };
  }
  return same(`× ${k}`);
}

// "(that is, dividing by 5)" when k is 1 over a whole number. k 是某个整数的倒数时补充“也就是除以 d”。
function divisionNote(constant) {
  if (!(constant > 0 && constant < 1)) return { zh: '', en: '' };
  const whole = Math.round(1 / constant);
  if (!sameNumber(1 / constant, whole)) return { zh: '', en: '' };
  return { zh: `（也就是除以 ${whole}）`, en: ` (that is, dividing by ${whole})` };
}

function transformSentence(operation, constant) {
  const size = num(Math.abs(constant), 6);
  if (operation === 'add') {
    if (constant === 0) return { zh: '加上 0 不会改变任何值，所以每个指标都不变。', en: 'Adding 0 changes no value, so every measure stays the same.' };
    if (constant > 0) {
      return {
        zh: `每个值都加上 ${size}：所有位置指标（平均数、中位数、Q1、Q3、最小值、最大值）都加上 ${size}；离散程度（极差、IQR、标准差 S）不变。形状也不变：整个分布向右平移 ${size}。`,
        en: `Adding ${size} to every value adds ${size} to every measure of position (mean, median, Q1, Q3, min, max) and leaves the measures of spread (range, IQR, standard deviation S) unchanged. The shape stays the same: the whole distribution shifts ${size} to the right.`,
      };
    }
    return {
      zh: `每个值都减去 ${size}：所有位置指标（平均数、中位数、Q1、Q3、最小值、最大值）都减少 ${size}；离散程度（极差、IQR、标准差 S）不变。形状也不变：整个分布向左平移 ${size}。`,
      en: `Subtracting ${size} from every value subtracts ${size} from every measure of position (mean, median, Q1, Q3, min, max) and leaves the measures of spread (range, IQR, standard deviation S) unchanged. The shape stays the same: the whole distribution shifts ${size} to the left.`,
    };
  }
  const k = num(constant, 6);
  if (constant > 0) {
    const division = divisionNote(constant);
    return {
      zh: `每个值都乘以 ${k}${division.zh}：所有位置指标（平均数、中位数、Q1、Q3、最小值、最大值）和离散程度（极差、IQR、标准差 S）都乘以 ${k}。形状不变，只是刻度变了。`,
      en: `Multiplying every value by ${k}${division.en} multiplies every measure of position (mean, median, Q1, Q3, min, max) and every measure of spread (range, IQR, standard deviation S) by ${k}. The shape stays the same; only the scale changes.`,
    };
  }
  return {
    zh: `补充（课件外，课件只举了正数的例子）：每个值都乘以负数 ${k}，平均数和中位数也乘以 ${k}，但数据的顺序反过来了：新的最小值 = ${k} × 原来的最大值，新的 Q1 = ${k} × 原来的 Q3。离散程度不会是负数，所以极差、IQR 和 S 都乘以 |${k}| = ${size}。分布的形状左右翻转。`,
    en: `Extra (not on the slides, which only use positive constants): multiplying every value by the negative number ${k} multiplies the mean and the median by ${k}, but it also reverses the order of the values: the new minimum is ${k} × the old maximum and the new Q1 is ${k} × the old Q3. A spread is never negative, so the range, the IQR and S are multiplied by |${k}| = ${size}. The shape is mirrored.`,
  };
}

function varianceNote(operation, constant) {
  if (operation === 'add') {
    return {
      zh: '补充（课件外）：方差 S² 也不变，因为它是标准差 S 的平方。',
      en: 'Extra (not on the slides): the variance S² does not change either, because it is the square of S.',
    };
  }
  const squared = num(constant * constant, 8);
  return {
    zh: `补充（课件外）：方差 S² 是“平方”的量，所以每个值乘以 k 时，它变成原来的 k² 倍（这里 × ${squared}）；加上常数时它不变。`,
    en: `Extra (not on the slides): the variance S² is a squared quantity, so multiplying every value by k multiplies it by k² (here × ${squared}); adding a constant leaves it unchanged.`,
  };
}

/**
 * What adding c or multiplying by k does to every measure (M4 p.27-30). Returns { operation, constant, expression,
 * preview, rows, sentence, sentenceIsExtra, varianceNote, before, after }: expression names the new variable
 * ("y + 10"), preview lists its sorted values, rows are { id, symbol, label, kind, before, after, rule } with rule as
 * Bi text, and sentenceIsExtra is true when the sentence goes beyond the slides (a negative factor). Every after
 * value is computed from the transformed data itself, so it can be checked against the rule column.
 * 加上 c 或乘以 k 对每个指标的影响（第 4 单元第 27-30 页）。返回 { operation, constant, expression, preview, rows,
 * sentence, sentenceIsExtra, varianceNote, before, after }：expression 是新变量的写法（“y + 10”），preview 列出它排序后的值；
 * 每行为 { id, symbol, label, kind, before, after, rule }，rule 是双语文字；sentence 超出课件内容（负数因子）时
 * sentenceIsExtra 为 true。变换后的每个值都直接由变换后的数据算出，因此可以和规律那一列互相核对。
 */
export function transformReport(values, method, operation, constant, { unit }) {
  const op = operation === 'multiply' ? 'multiply' : 'add';
  const amount = toNumber(constant, op === 'multiply' ? 1 : 0);
  const before = analyzeData(values, method);
  const after = analyzeData(transformData(values, op, amount), method);
  return {
    operation: op,
    constant: amount,
    expression: expressionFor(op, amount),
    preview: after.sorted.map((value) => num(value, after.digits.data)).join(', '),
    rows: TRANSFORM_ROWS.map((id) => ({
      id,
      symbol: MEASURES[id].symbol,
      label: MEASURES[id].label,
      kind: MEASURES[id].kind,
      before: measureText(before, id, unit),
      after: measureText(after, id, unit),
      rule: ruleFor(id, op, amount),
    })),
    sentence: transformSentence(op, amount),
    sentenceIsExtra: op === 'multiply' && amount < 0,
    varianceNote: varianceNote(op, amount),
    before,
    after,
  };
}

/** Status after a transformation: the new variable with its mean and S before and after. 变换后的提示。 */
export function transformMessage(report, unit) {
  const mean = `${measureText(report.before, 'mean', unit)} → ${measureText(report.after, 'mean', unit)}`;
  const sd = `${measureText(report.before, 'sd', unit)} → ${measureText(report.after, 'sd', unit)}`;
  return {
    zh: `${report.expression}：平均数 ${mean}，标准差 S ${sd}。`,
    en: `${report.expression}: mean ${mean}, standard deviation S ${sd}.`,
  };
}

/** A constant as the text of its input box: "10", "−5", "0.2". 常数在输入框中的写法。 */
export function formatConstant(value) {
  return num(toNumber(value, 0), 6);
}

/** Index of the slide preset matching an operation and constant, or −1. 与当前操作和常数相同的课件预设的下标，没有时为 −1。 */
export function matchingPreset(operation, constant) {
  return TRANSFORM_PRESETS.findIndex((preset) => preset.operation === operation && sameNumber(preset.constant, constant));
}
