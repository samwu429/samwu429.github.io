/**
 * Logic of the "least-squares-line" widget (STA220 Module 5, introduction to linear regression). DOM-free:
 * the config reader, the line from data or from summary statistics with every worked step, residuals,
 * predictions with the extrapolation check, the learner's own line, plot extents and the sentences.
 * “最小二乘直线”组件的逻辑（STA220 第 5 单元，线性回归入门），不依赖 DOM：读取配置；由数据或概括统计量求直线并给出
 * 每一步算式；残差；带外推检查的预测；学习者自己画的直线；坐标范围；以及所有解释句。
 *
 * Course conventions (M5 regression practice solutions, 2025 midterm Q22-Q25): ŷ = b0 + b1x with
 * b1 = r · s_y / s_x and b0 = ȳ − b1 · x̄; residual e = y − ŷ = observed − predicted (negative: the line
 * overestimates); R² = r²; the intercept means something only when x = 0 lies in the observed x range, and
 * predicting outside that range is extrapolation. Worked values keep 4 decimals ("keep full precision until
 * the final answer"), predictions and residuals are reported with 2, and the sentences round the slope to
 * 2 decimals ("estimated to decrease by 3.08"). "=" is written only when every printed number is exact.
 * 课程约定（第 5 单元回归练习答案、2025 年期中第 22-25 题）：ŷ = b0 + b1x，b1 = r · s_y / s_x，b0 = ȳ − b1 · x̄；
 * 残差 e = y − ŷ = 观测值 − 预测值（为负表示直线高估）；R² = r²；只有 x = 0 在观测到的 x 范围内时截距才有意义，
 * 在范围外预测属于外推。计算过程保留 4 位小数（“最后才四舍五入”），预测值与残差保留 2 位，解释句中的斜率取 2 位小数
 * （“estimated to decrease by 3.08”）。只有算式里每个数都精确时才写“=”，否则写“≈”。
 */
import {
  clamp, decimalsOf, isFiniteNumber, niceCeil, niceExtent, toBi, toNumber,
} from '../../machine-learning/shared/ml-math.js';
import {
  finitePoints, leastSquares, lineFromSummary, predict, residualTable, sum,
} from '../shared/stats-math.js';
import {
  APPROX, MINUS, TIMES, formatFixed, formatPercent, formatSigned, formatTrim, relationSign, roundTo,
} from '../shared/stat-format.js';

// The content validator accepts 3-30 points (tools/validate_content.py, check_statistics_widget).
// 内容校验器接受 3-30 个点（见 tools/validate_content.py 的 check_statistics_widget）。
export const MIN_POINTS = 3;
export const MAX_POINTS = 30;

// Decimals of worked values, of reported answers, the most any number gets, and the most read from data.
// 计算过程的小数位、报告答案的小数位、任何数最多的小数位，以及从数据中读取的最多小数位。
const WORK_DIGITS = 4;
const REPORT_DIGITS = 2;
const MAX_DIGITS = 8;
const DATA_DIGITS = 6;
// Larger prediction inputs are refused: their predictions would print in exponent form, which no step uses.
// 拒绝更大的预测输入：它们的预测值会以指数形式输出，而计算步骤里从不这样写数。
export const MAX_INPUT = 1e12;

const DEFAULT_TITLE = Object.freeze({ zh: '最小二乘回归直线', en: 'Least-squares regression line' });
const DEFAULT_X_LABEL = Object.freeze({ zh: '解释变量 x', en: 'Explanatory variable x' });
const DEFAULT_Y_LABEL = Object.freeze({ zh: '响应变量 y', en: 'Response variable y' });
const DEFAULT_X_NAME = Object.freeze({ zh: 'x', en: 'x' });
const DEFAULT_Y_NAME = Object.freeze({ zh: 'y', en: 'y' });

/**
 * Shown when a config gives neither usable points nor a usable summary: the M5 p.33-44 "Drug Reaction Time"
 * example, five subjects with the drug amount in the blood (%) and the reaction time (seconds). Its line is
 * ŷ = −0.1 + 0.7x with r = 0.9037.
 * 配置既没有可用的数据点也没有可用的概括统计量时使用：第 5 单元第 33-44 页的“药物与反应时间”例子，五名受试者的
 * 血液药物含量（%）与反应时间（秒）。它的直线是 ŷ = −0.1 + 0.7x，r = 0.9037。
 */
export const SLIDE_EXAMPLE = Object.freeze({
  title: Object.freeze({ zh: '药物含量与反应时间', en: 'Drug amount and reaction time' }),
  xLabel: Object.freeze({ zh: '血液中的药物含量（%）', en: 'Drug amount (in %)' }),
  yLabel: Object.freeze({ zh: '反应时间（秒）', en: 'Reaction time (in seconds)' }),
  xName: Object.freeze({ zh: '血液中的药物含量（%）', en: 'the amount of drug (in %) in the blood' }),
  yName: Object.freeze({ zh: '反应时间（秒）', en: 'reaction time (in seconds)' }),
  points: Object.freeze([[1, 1], [2, 1], [3, 2], [4, 2], [5, 4]].map((pair) => Object.freeze(pair))),
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// A bilingual label from the config, or null when it has no text in either language.
// 配置中的双语标签；两种语言都没有文字时为 null。
function readBi(value) {
  const bi = toBi(value, { zh: '', en: '' });
  return hasText(bi.zh) || hasText(bi.en) ? bi : null;
}

// The summary of an exam-style config, or null unless it has numbers xbar, sx, ybar, sy, r with
// s_x > 0, s_y > 0 and −1 ≤ r ≤ 1 (the validator's rule).
// 考试题型配置中的概括统计量；必须有数字 xbar、sx、ybar、sy、r，且 s_x > 0、s_y > 0、−1 ≤ r ≤ 1（与校验器一致），否则为 null。
function readSummary(value) {
  if (!isPlainObject(value)) return null;
  const numbers = ['xbar', 'sx', 'ybar', 'sy', 'r'].map((key) => toNumber(value[key]));
  if (numbers.some((number) => number === null)) return null;
  const [xbar, sx, ybar, sy, r] = numbers;
  if (!(sx > 0 && sy > 0 && r >= -1 && r <= 1)) return null;
  return { xbar, sx, ybar, sy, r };
}

function copyBi(value) {
  return { zh: value.zh, en: value.en };
}

function exampleModel() {
  return {
    mode: 'data',
    usedDefault: true,
    title: copyBi(SLIDE_EXAMPLE.title),
    xLabel: copyBi(SLIDE_EXAMPLE.xLabel),
    yLabel: copyBi(SLIDE_EXAMPLE.yLabel),
    xName: copyBi(SLIDE_EXAMPLE.xName),
    yName: copyBi(SLIDE_EXAMPLE.yName),
    points: SLIDE_EXAMPLE.points.map(([x, y], index) => ({ index, x, y })),
    summary: null,
  };
}

/**
 * Reads a widget config defensively into { mode, usedDefault, title, xLabel, yLabel, xName, yName, points,
 * summary }. Points may be [x, y] pairs or { x, y } objects; entries that are not two finite numbers are
 * skipped and at most MAX_POINTS are kept. Data mode needs at least MIN_POINTS points with two different x
 * values and wins over a summary, as in the validator; otherwise a valid summary gives summary mode, and
 * with neither the slide example is shown (usedDefault, with the example's own labels so they match its
 * data). xLabel (axis title) and xName (the name inside sentences) stand in for each other when one is
 * missing; the same holds for y.
 * 防御性地读取组件配置，得到 { mode, usedDefault, title, xLabel, yLabel, xName, yName, points, summary }。
 * 数据点可以写成 [x, y] 或 { x, y }；不是两个有限数字的项会被跳过，最多保留 MAX_POINTS 个。数据模式至少需要
 * MIN_POINTS 个点且 x 不全相同，并且与校验器一样优先于 summary；否则有效的 summary 进入概括统计量模式；两者都没有时
 * 显示课件例子（usedDefault，并使用例子自己的标签，保证标签与数据一致）。xLabel（坐标轴名称）与 xName（句子中的名称）
 * 缺一个时互相替代；y 同理。
 */
export function normalizeLeastSquaresConfig(config) {
  const source = isPlainObject(config) ? config : {};
  const points = finitePoints(source.points).slice(0, MAX_POINTS).map(({ x, y }, index) => ({ index, x, y }));
  const hasData = points.length >= MIN_POINTS && new Set(points.map((point) => point.x)).size >= 2;
  const summary = hasData ? null : readSummary(source.summary);
  if (!hasData && !summary) return exampleModel();

  const xLabel = readBi(source.xLabel);
  const yLabel = readBi(source.yLabel);
  const xName = readBi(source.xName);
  const yName = readBi(source.yName);
  return {
    mode: hasData ? 'data' : 'summary',
    usedDefault: false,
    title: readBi(source.title) ?? copyBi(DEFAULT_TITLE),
    xLabel: xLabel ?? xName ?? copyBi(DEFAULT_X_LABEL),
    yLabel: yLabel ?? yName ?? copyBi(DEFAULT_Y_LABEL),
    xName: xName ?? xLabel ?? copyBi(DEFAULT_X_NAME),
    yName: yName ?? yLabel ?? copyBi(DEFAULT_Y_NAME),
    points: hasData ? points : [],
    summary,
  };
}

/**
 * The variable names used inside sentences, with a missing language filled from the other one, so every
 * English sentence names its variables: { x: { zh, en }, y: { zh, en } }. Names are noun phrases written as
 * they read in the middle of a sentence ("When <x> increases by 1, the mean <y> ...").
 * 句子中使用的变量名；缺少的语言用另一种语言补上，保证每个英文句子都写出变量：{ x: { zh, en }, y: { zh, en } }。
 * 名称是放在句子中间读起来通顺的名词短语（“When <x> increases by 1, the mean <y> ...”）。
 */
export function sentenceNames(model) {
  const fill = (value, fallback) => {
    const zh = hasText(value?.zh) ? value.zh.trim() : '';
    const en = hasText(value?.en) ? value.en.trim() : '';
    if (!zh && !en) return copyBi(fallback);
    return { zh: zh || en, en: en || zh };
  };
  return { x: fill(model?.xName, DEFAULT_X_NAME), y: fill(model?.yName, DEFAULT_Y_NAME) };
}

/**
 * What the symbols of the equation stand for: { zh: 'x：…；ŷ：预测的…', en: 'x: …; ŷ: predicted …' }.
 * 方程中各符号代表什么。
 */
export function equationLegend(names) {
  return {
    zh: zhSentence(`x：${names.x.zh}；ŷ：预测的${inZh(names.y.zh)}`),
    en: `x: ${names.x.en}; ŷ: predicted ${names.y.en}`,
  };
}

// A name placed inside Chinese text gets a space on each side that touches Latin letters or digits, as
// Chinese typesetting does ("当 x 增加 1 时"); a Chinese name is left as it is.
// 放进中文句子的名称：与拉丁字母或数字相接的一侧加空格，符合中文排版（“当 x 增加 1 时”）；中文名称保持原样。
function inZh(name) {
  const text = String(name ?? '');
  const before = /^[A-Za-z0-9]/.test(text) ? ' ' : '';
  const after = /[A-Za-z0-9)]$/.test(text) ? ' ' : '';
  return `${before}${text}${after}`;
}

// A Chinese sentence without the spaces inZh may leave behind: at its ends, doubled next to a number, or
// beside full-width punctuation, which never takes a space.
// 去掉 inZh 可能留下的空格：句首句尾的、与数字相邻时重复的，以及全角标点旁边的（全角标点两侧不加空格）。
function zhSentence(text) {
  return text.replace(/ {2,}/g, ' ').replace(/ *([，。；：、（）“”]) */g, '$1').trim();
}

/* ---------- Number text 数字文本 ---------- */

/**
 * Decimals that keep a value readable: at least `base`, and more for small values so that they keep about
 * `base` significant digits (b1 = 0.0034 is not printed as 0.00). At most 8.
 * 让数值清楚可读的小数位：至少 base 位；数值很小时多给几位，保留大约 base 位有效数字（b1 = 0.0034 不会印成 0.00）。最多 8 位。
 */
export function adaptiveDigits(value, base = WORK_DIGITS) {
  if (!isFiniteNumber(value) || value === 0) return base;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  return Math.min(MAX_DIGITS, Math.max(base, base - 1 - magnitude));
}

// Most decimals any of the values needs, capped at DATA_DIGITS (21.4 needs 1).
// 这些值中最多需要的小数位数，上限为 DATA_DIGITS（21.4 需要 1 位）。
function decimalsNeeded(values) {
  return values.reduce((most, value) => Math.max(most, decimalsOf(value, DATA_DIGITS)), 0);
}

// Decimals of predictions and residuals: 2, or one more than the data's own decimals.
// 预测值与残差的小数位：2 位，或比数据本身多 1 位。
function resultDigitsFor(dataDigits) {
  return Math.min(DATA_DIGITS, Math.max(REPORT_DIGITS, dataDigits + 1));
}

// Decimals of predictions from a given summary: 2, or as many as ȳ is given with, at most 4 (the worked decimals).
// ȳ and s_y are statistics, often copied from R with many decimals, so they do not show how precise the data are;
// the course reports such predictions with 2 to 4 decimals (2025 midterm Q24: 74.03; M5 practice Q4: 428.0294).
// 由给定概括统计量做预测时的小数位：2 位，或 ȳ 给出的位数，最多 4 位（计算过程的位数）。ȳ 和 s_y 是统计量，常常从 R 抄来、
// 带很多位小数，并不代表数据的精度；课程报告这类预测值时用 2 到 4 位小数（2025 年期中第 24 题：74.03；第 5 单元练习 Q4：428.0294）。
function summaryResultDigits(ybar) {
  return Math.min(WORK_DIGITS, Math.max(REPORT_DIGITS, decimalsNeeded([ybar])));
}

// A number as printed in a worked step: its text and whether that text is exact.
// 算式中印出来的一个数：文字，以及这段文字是否精确。
function printed(value, digits) {
  return {
    value,
    text: formatTrim(value, digits),
    exact: isFiniteNumber(value) && relationSign(value, digits) === '=',
  };
}

const workPart = (value) => printed(value, adaptiveDigits(value, WORK_DIGITS));
// Data and given numbers are printed as they are (up to 8 decimals). 数据与题目给的数原样印出（最多 8 位小数）。
const givenPart = (value) => printed(value, decimalsOf(value, MAX_DIGITS));

// "=" only when every number of the written line is printed exactly, otherwise "≈".
// 只有这一行里每个数都精确时才用“=”，否则用“≈”。
function relation(...parts) {
  return parts.every((part) => part.exact) ? '=' : APPROX;
}

// A factor inside written working: negative numbers get parentheses, "(−3.0771)".
// 算式中作为因数的数：负数加括号，例如“(−3.0771)”。
function operand(part) {
  return part.text.startsWith(MINUS) ? `(${part.text})` : part.text;
}

// "b0 + b1 × x" with the numbers substituted: "560.6513 − 3.0771 × 43.1".
// 代入数字后的“b0 + b1 × x”，例如“560.6513 − 3.0771 × 43.1”。
function substituteLine(b0, b1, x) {
  const negative = b1.text.startsWith(MINUS);
  const size = negative ? b1.text.slice(MINUS.length) : b1.text;
  return `${b0.text} ${negative ? MINUS : '+'} ${size} ${TIMES} ${operand(x)}`;
}

function isLine(line) {
  return isFiniteNumber(line?.b0) && isFiniteNumber(line?.b1);
}

/**
 * The equation as the course writes it, "ŷ = −0.1 + 0.7x", "ŷ = 560.6513 − 3.0771x". The working form keeps
 * 4 decimals; `report: true` rounds to 2 ("ŷ = 560.65 − 3.08x"). A missing line prints "ŷ = —".
 * 按课程写法输出的方程，例如“ŷ = −0.1 + 0.7x”。计算形式保留 4 位小数；report 为 true 时取 2 位（“ŷ = 560.65 − 3.08x”）。
 * 直线不存在时输出“ŷ = —”。
 */
export function equationText(line, { report = false } = {}) {
  if (!isLine(line)) return 'ŷ = —';
  const base = report ? REPORT_DIGITS : WORK_DIGITS;
  const slopeDigits = adaptiveDigits(line.b1, base);
  const sign = roundTo(line.b1, slopeDigits) < 0 ? MINUS : '+';
  return `ŷ = ${formatTrim(line.b0, adaptiveDigits(line.b0, base))} ${sign} ${formatTrim(Math.abs(line.b1), slopeDigits)}x`;
}

/* ---------- The fitted line 拟合直线 ---------- */

/**
 * The least-squares line of a normalized model, with what the steps and the checks need: { mode, given,
 * n, b0, b1, r, rSquared, xbar, ybar, sx, sy, xMin, xMax, sumX, sumY, ssxx, ssyy, sumZProducts, rows, sse,
 * sumResiduals, flat, digits }. Data mode uses the shared least-squares fit (rows are its residual table);
 * summary mode uses the given x̄, s_x, ȳ, s_y and r, so it has no rows and no observed x range. `flat` marks
 * data whose y values are all equal: s_y = 0, r does not exist and the line is ŷ = ȳ. `digits` gives the
 * decimals of the x data, of the y data and of predictions and residuals.
 * 规范化模型的最小二乘直线，并带上步骤与检查所需的数值。数据模式使用共享的最小二乘计算（rows 即其残差表）；
 * 概括统计量模式使用题目给的 x̄、s_x、ȳ、s_y 与 r，因此没有 rows，也没有观测到的 x 范围。flat 表示所有 y 都相等：
 * s_y = 0，r 不存在，直线为 ŷ = ȳ。digits 给出 x 数据、y 数据以及预测值和残差的小数位数。
 */
export function fitLine(model) {
  if (model?.mode === 'summary' && model.summary) {
    const given = model.summary;
    const line = lineFromSummary(given);
    const yDigits = decimalsNeeded([given.ybar, given.sy]);
    return {
      mode: 'summary',
      given: { ...given },
      n: NaN,
      b0: line.b0,
      b1: line.b1,
      r: line.r,
      rSquared: line.rSquared,
      xbar: line.xbar,
      ybar: line.ybar,
      sx: line.sx,
      sy: line.sy,
      xMin: NaN,
      xMax: NaN,
      sumX: NaN,
      sumY: NaN,
      ssxx: NaN,
      ssyy: NaN,
      sumZProducts: NaN,
      rows: [],
      sse: NaN,
      sumResiduals: NaN,
      flat: false,
      digits: { x: decimalsNeeded([given.xbar]), y: yDigits, result: summaryResultDigits(given.ybar) },
    };
  }
  const points = Array.isArray(model?.points) ? model.points : [];
  const fit = leastSquares(points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const yDigits = decimalsNeeded(ys);
  return {
    mode: 'data',
    given: null,
    n: fit.n,
    b0: fit.b0,
    b1: fit.b1,
    r: fit.r,
    rSquared: fit.rSquared,
    xbar: fit.xbar,
    ybar: fit.ybar,
    sx: fit.sx,
    sy: fit.sy,
    xMin: fit.xMin,
    xMax: fit.xMax,
    sumX: sum(xs),
    sumY: sum(ys),
    ssxx: fit.correlation.ssxx,
    ssyy: fit.correlation.ssyy,
    sumZProducts: fit.correlation.sumZProducts,
    rows: fit.residuals,
    sse: fit.sse,
    sumResiduals: sum(fit.residuals.map((row) => row.residual)),
    flat: fit.n > 1 && !(fit.sy > 0),
    digits: { x: decimalsNeeded(xs), y: yDigits, result: resultDigitsFor(yDigits) },
  };
}

/* ---------- Worked steps 计算步骤 ---------- */

const STEP_TEXT = {
  means: {
    title: { zh: '两个平均数（mean）', en: 'The two means' },
    note: {
      zh: 'x̄ 读作“x bar”，是 x 的平均数；ȳ 读作“y bar”，是 y 的平均数。',
      en: 'x̄ ("x-bar") is the mean of x, and ȳ ("y-bar") is the mean of y.',
    },
  },
  sds: {
    title: { zh: '两个标准差（standard deviation）', en: 'The two standard deviations' },
    note: { zh: '除以 n − 1，不是除以 n。', en: 'Divide by n − 1, not by n.' },
  },
  correlation: {
    title: { zh: '相关系数（correlation coefficient）r', en: 'The correlation coefficient r' },
    note: {
      zh: 'r 没有单位，一定在 −1 和 1 之间；斜率 b1 的正负号总是和 r 相同。',
      en: 'r has no units and is always between −1 and 1; the slope b1 always has the same sign as r.',
    },
    flatNote: {
      zh: '所有 y 都一样，y 的标准差是 0，z 分数没法算，所以 r 不存在。',
      en: 'Every y is the same, so the standard deviation of y is 0 and r cannot be computed.',
    },
  },
  given: {
    title: { zh: '题目给出的概括统计量（summary statistics）', en: 'The given summary statistics' },
    note: {
      zh: '有了这五个数就能求出直线，不需要原始数据。',
      en: 'These five numbers are enough to find the line; the raw data are not needed.',
    },
  },
  slope: {
    title: { zh: '斜率（slope）b1', en: 'The slope b1' },
    note: {
      zh: '斜率 = r × y 的标准差 ÷ x 的标准差。中间结果多留几位小数，最后再四舍五入。',
      en: 'Slope = r × (SD of y) ÷ (SD of x). Keep extra decimals in the middle steps and round only at the end.',
    },
    flatNote: {
      zh: 'y 完全不变，所以最好的直线是水平线 ŷ = ȳ，斜率 b1 = 0。',
      en: 'y never changes, so the best line is the flat line ŷ = ȳ with slope b1 = 0.',
    },
  },
  intercept: {
    title: { zh: '截距（intercept）b0', en: 'The intercept b0' },
    note: {
      zh: '把 x = x̄ 代入直线，得到的正好是 ȳ：最小二乘直线一定经过点 (x̄, ȳ)。',
      en: 'Put x = x̄ into the line and you get ȳ: the least-squares line always passes through the point (x̄, ȳ).',
    },
  },
  equation: {
    title: { zh: '写出回归方程（regression equation）', en: 'The regression equation' },
    note: {
      zh: 'ŷ 读作“y hat”，是预测值（predicted value）；y 是真正观测到的值（observed value）。',
      en: 'ŷ ("y-hat") is the predicted value; y is the observed value.',
    },
  },
};

function step(id, text, rows, note = text.note) {
  return { id, title: copyBi(text.title), rows, note: note ? copyBi(note) : null };
}

function slopeAndIntercept(fit, { r, sx, sy, xbar, ybar }) {
  const b1 = workPart(fit.b1);
  const b0 = workPart(fit.b0);
  const slopeRow = fit.flat
    ? { formula: 'b1 = r · s_y / s_x', work: `b1 = ${b1.text}` }
    : {
      formula: 'b1 = r · s_y / s_x',
      work: `b1 = ${operand(r)} ${TIMES} ${sy.text} / ${sx.text} ${relation(r, sy, sx, b1)} ${b1.text}`,
    };
  return [
    step('slope', STEP_TEXT.slope, [slopeRow], fit.flat ? STEP_TEXT.slope.flatNote : STEP_TEXT.slope.note),
    step('intercept', STEP_TEXT.intercept, [{
      formula: 'b0 = ȳ − b1 · x̄',
      work: `b0 = ${ybar.text} ${MINUS} ${operand(b1)} ${TIMES} ${operand(xbar)} ${relation(ybar, b1, xbar, b0)} ${b0.text}`,
    }]),
    step('equation', STEP_TEXT.equation, [{ formula: 'ŷ = b0 + b1x', work: equationText(fit) }]),
  ];
}

/**
 * The worked steps that lead to the line, in order: [{ id, title: Bi, rows: [{ formula, work }], note: Bi }].
 * Data mode: the means, the standard deviations, r = Σ z_x z_y / (n − 1), the slope, the intercept and the
 * equation (drug example: "b1 = 0.9037 × 1.2247 / 1.5811 ≈ 0.7", "b0 = 2 − 0.7 × 3 = −0.1"). Summary mode
 * starts from the given numbers. `formula` is the general formula and `work` the same line with numbers;
 * `work` is null where nothing can be computed (r when every y is equal).
 * 求出直线的各个步骤（按顺序）：[{ id, title, rows: [{ formula, work }], note }]。数据模式：两个平均数、两个标准差、
 * r = Σ z_x z_y / (n − 1)、斜率、截距与方程；概括统计量模式从题目给的数开始。formula 是一般公式，work 是代入数字后的同一行；
 * 无法计算的地方 work 为 null（所有 y 都相等时的 r）。
 */
export function lineSteps(fit) {
  if (fit?.mode === 'summary') {
    const given = {
      xbar: givenPart(fit.xbar), sx: givenPart(fit.sx), ybar: givenPart(fit.ybar), sy: givenPart(fit.sy), r: givenPart(fit.r),
    };
    return [
      step('given', STEP_TEXT.given, [{
        formula: null,
        work: `x̄ = ${given.xbar.text}, s_x = ${given.sx.text}, ȳ = ${given.ybar.text}, s_y = ${given.sy.text}, r = ${given.r.text}`,
      }]),
      ...slopeAndIntercept(fit, given),
    ];
  }
  const n = fit?.n ?? 0;
  const sumX = printed(fit.sumX, fit.digits.x);
  const sumY = printed(fit.sumY, fit.digits.y);
  const xbar = workPart(fit.xbar);
  const ybar = workPart(fit.ybar);
  const ssxx = workPart(fit.ssxx);
  const ssyy = workPart(fit.ssyy);
  const sx = workPart(fit.sx);
  const sy = workPart(fit.sy);
  const sumZ = workPart(fit.sumZProducts);
  const r = workPart(fit.r);
  return [
    step('means', STEP_TEXT.means, [
      { formula: 'x̄ = Σx / n', work: `x̄ = ${sumX.text} / ${n} ${relation(sumX, xbar)} ${xbar.text}` },
      { formula: 'ȳ = Σy / n', work: `ȳ = ${sumY.text} / ${n} ${relation(sumY, ybar)} ${ybar.text}` },
    ]),
    step('sds', STEP_TEXT.sds, [
      { formula: 's_x = √(Σ(x − x̄)² / (n − 1))', work: `s_x = √(${ssxx.text} / ${n - 1}) ${relation(ssxx, sx)} ${sx.text}` },
      { formula: 's_y = √(Σ(y − ȳ)² / (n − 1))', work: `s_y = √(${ssyy.text} / ${n - 1}) ${relation(ssyy, sy)} ${sy.text}` },
    ]),
    step('correlation', STEP_TEXT.correlation, [{
      formula: 'r = Σ z_x z_y / (n − 1)',
      work: fit.flat ? null : `r = ${sumZ.text} / ${n - 1} ${relation(sumZ, r)} ${r.text}`,
    }], fit.flat ? STEP_TEXT.correlation.flatNote : STEP_TEXT.correlation.note),
    ...slopeAndIntercept(fit, { r, sx, sy, xbar, ybar }),
  ];
}

/* ---------- Ranges 范围 ---------- */

/** The observed x range as words, { zh: '1 到 5', en: '1 to 5' }; null without data. 观测到的 x 范围；没有数据时为 null。 */
export function rangeText(fit) {
  if (!isFiniteNumber(fit?.xMin) || !isFiniteNumber(fit?.xMax)) return null;
  return rangeWords(fit.xMin, fit.xMax, fit.digits.x);
}

function rangeWords(xMin, xMax, digits) {
  const low = formatTrim(xMin, digits);
  const high = formatTrim(xMax, digits);
  return { zh: `${low} 到 ${high}`, en: `${low} to ${high}` };
}

// Equal up to binary noise, so x = 5.000000000000001 still counts as the end of the range 1 to 5.
// 在二进制误差范围内相等，使 x = 5.000000000000001 仍算作范围 1 到 5 的端点。
function nearlyEqual(a, b) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * Where x lies against the observed range [xMin, xMax]: "inside" (the ends included), "below", "above", or
 * "unknown" when the range is not known (summary mode).
 * x 相对于观测范围 [xMin, xMax] 的位置："inside"（含端点）、"below"、"above"；范围未知（概括统计量模式）时为 "unknown"。
 */
export function rangePosition(x, xMin, xMax) {
  const value = toNumber(x);
  if (value === null || !isFiniteNumber(xMin) || !isFiniteNumber(xMax)) return 'unknown';
  if (value < xMin && !nearlyEqual(value, xMin)) return 'below';
  if (value > xMax && !nearlyEqual(value, xMax)) return 'above';
  return 'inside';
}

/* ---------- Residuals 残差 ---------- */

const RESIDUAL_SENTENCES = {
  over: {
    zh: '残差为负：这个点在直线下方，直线高估（overestimate）了它的 y（y < ŷ）。',
    en: 'The residual is negative: the point is below the line, so the line overestimates y here (y < ŷ).',
  },
  under: {
    zh: '残差为正：这个点在直线上方，直线低估（underestimate）了它的 y（y > ŷ）。',
    en: 'The residual is positive: the point is above the line, so the line underestimates y here (y > ŷ).',
  },
  on: {
    zh: '残差为 0：这个点正好在直线上，预测值等于观测值。',
    en: 'The residual is 0: the point is on the line, so the prediction equals the observed value.',
  },
};

/**
 * The residual of one point for any line { b0, b1 }, written like the M5 practice ("Residual = Observed value
 * − Predicted value = y − ŷ"): { ok, x, y, yHat, residual, kind, lines, sentence }. `kind` is "over" (negative
 * residual, y < ŷ), "under" (positive) or "on" (it prints as 0). 2025 midterm Q24: ŷ = 13.31 + 0.69 × 88 = 74.03
 * and e = 90 − 74.03 = 15.97.
 * 任意直线 { b0, b1 } 下某个点的残差，写法与第 5 单元练习一致（“残差 = 观测值 − 预测值 = y − ŷ”）。kind 为 "over"
 * （残差为负，y < ŷ）、"under"（为正）或 "on"（印出来为 0）。2025 年期中第 24 题：ŷ = 13.31 + 0.69 × 88 = 74.03，
 * e = 90 − 74.03 = 15.97。
 */
export function residualWork(line, point, { resultDigits = REPORT_DIGITS } = {}) {
  const x = toNumber(point?.x);
  const y = toNumber(point?.y);
  if (!isLine(line) || x === null || y === null) {
    return {
      ok: false, x, y, yHat: NaN, residual: NaN, kind: null, yHatText: '—', residualText: '—', lines: [], sentence: null,
    };
  }
  const yHat = predict(line, x);
  const residual = y - yHat;
  const b0 = workPart(line.b0);
  const b1 = workPart(line.b1);
  const xPart = givenPart(x);
  const yPart = givenPart(y);
  const yHatPart = printed(yHat, resultDigits);
  const ePart = printed(residual, resultDigits);
  const kind = roundTo(residual, resultDigits) === 0 ? 'on' : residual < 0 ? 'over' : 'under';
  return {
    ok: true,
    x,
    y,
    yHat,
    residual,
    kind,
    yHatText: yHatPart.text,
    residualText: formatSigned(residual, resultDigits, { trim: true }),
    lines: [
      `ŷ = ${substituteLine(b0, b1, xPart)} ${relation(b0, b1, xPart, yHatPart)} ${yHatPart.text}`,
      `e = y ${MINUS} ŷ = ${yPart.text} ${MINUS} ${operand(yHatPart)} ${relation(yPart, yHatPart, ePart)} ${ePart.text}`,
    ],
    sentence: copyBi(RESIDUAL_SENTENCES[kind]),
  };
}

/**
 * Every point's prediction and residual for a line, as numbers for drawing: [{ index, x, y, yHat, residual,
 * squared }] in point order.
 * 一条直线下每个点的预测值与残差（数值，供绘图使用），按点的顺序排列。
 */
export function lineResiduals(line, points) {
  return residualTable(line, points).rows;
}

/**
 * The table of a line's predictions and residuals as printed text: { rows: [{ index, number, x, y, yHat,
 * residual, squared }], sumResiduals, sse, sseValue }. Data keep their own decimals; ŷ, e and e² use the
 * result decimals, and e carries an explicit sign.
 * 一条直线的预测值与残差表（印出来的文字）。数据保留原有小数位；ŷ、e、e² 使用结果的小数位，e 带正负号。
 */
export function residualRowsText(line, points, { resultDigits = REPORT_DIGITS, xDigits, yDigits } = {}) {
  const table = residualTable(line, points);
  const xPlaces = xDigits ?? decimalsNeeded(table.rows.map((row) => row.x));
  const yPlaces = yDigits ?? decimalsNeeded(table.rows.map((row) => row.y));
  const sumResiduals = sum(table.rows.map((row) => row.residual));
  return {
    rows: table.rows.map((row) => ({
      index: row.index,
      number: String(row.index + 1),
      x: formatTrim(row.x, xPlaces),
      y: formatTrim(row.y, yPlaces),
      yHat: formatFixed(row.yHat, resultDigits),
      residual: formatSigned(row.residual, resultDigits),
      squared: formatFixed(row.squared, resultDigits),
    })),
    sumResiduals: formatFixed(sumResiduals, resultDigits),
    sse: formatFixed(table.sse, resultDigits),
    sseValue: table.sse,
  };
}

/* ---------- Prediction 预测 ---------- */

/**
 * A starting x for the prediction box. With data it is the midpoint of two neighbouring observed x values
 * closest to halfway between x̄ and the largest x: inside the observed range, not on a data point, and away
 * from x̄, where the prediction would just be ȳ and its marker would hide under the mean point. From a
 * summary it is x̄ itself, which shows that the line passes through (x̄, ȳ).
 * 预测框的起始 x。有数据时，取相邻两个观测 x 的中点里最接近“x̄ 与最大 x 正中间”的那个：在观测范围之内、不落在数据点上，
 * 也不在 x̄ 处（那里的预测值就是 ȳ，标记会被平均点盖住）。概括统计量模式下取 x̄ 本身，说明直线经过 (x̄, ȳ)。
 */
export function defaultPredictionX(fit) {
  if (!isFiniteNumber(fit?.xbar)) return 0;
  if (fit.mode !== 'data') return roundTo(fit.xbar, Math.min(WORK_DIGITS, decimalsOf(fit.xbar, MAX_DIGITS)));
  const xs = [...new Set(fit.rows.map((row) => row.x))].sort((a, b) => a - b);
  const target = (fit.xbar + fit.xMax) / 2;
  let best = null;
  for (let index = 1; index < xs.length; index += 1) {
    const middle = (xs[index - 1] + xs[index]) / 2;
    if (best === null || Math.abs(middle - target) < Math.abs(best - target)) best = middle;
  }
  return roundTo(best ?? fit.xbar, Math.min(DATA_DIGITS, fit.digits.x + 1));
}

function rangeNote(position, xText, range) {
  if (position === 'unknown') {
    return {
      zh: '这里没有给出观测到的 x 范围。只有当 x 在数据的范围之内时，预测才可靠；在范围之外做预测叫外推（extrapolation）。',
      en: 'The observed range of x is not given here. A prediction is only reliable for x inside the range of the data; predicting outside it is extrapolation.',
    };
  }
  if (position === 'inside') {
    return {
      zh: `x = ${xText} 在观测到的 x 范围（${range.zh}）之内，不属于外推（extrapolation）。`,
      en: `x = ${xText} is inside the observed range of x (${range.en}), so this is not extrapolation.`,
    };
  }
  return {
    zh: `外推（extrapolation）：x = ${xText} 在观测到的 x 范围（${range.zh}）之外。数据不能说明直线的规律在那里还成立，所以这个预测不可靠。`,
    en: `Extrapolation: x = ${xText} is outside the observed range of x (${range.en}). The data cannot show that the straight-line pattern continues there, so this prediction is not reliable.`,
  };
}

/**
 * The prediction ŷ = b0 + b1x at `x` with the extrapolation check: { ok, reason, x, yHat, position, work,
 * sentence, note }. `position` comes from rangePosition (xMin/xMax are NaN in summary mode, giving "unknown").
 * Input that is not a number gives ok false with reason "not-a-number", and |x| above MAX_INPUT gives
 * "too-large". M5 practice: ŷ(43.1) = 560.65126 − 3.0770733 × 43.1 ≈ 428.03.
 * 在 x 处的预测 ŷ = b0 + b1x，并检查是否外推：{ ok, reason, x, yHat, position, work, sentence, note }。
 * position 来自 rangePosition（概括统计量模式下 xMin、xMax 为 NaN，得到 "unknown"）。输入不是数字时 ok 为 false、
 * reason 为 "not-a-number"；|x| 超过 MAX_INPUT 时 reason 为 "too-large"。
 */
export function predictionWork(line, x, {
  xMin = NaN, xMax = NaN, xDigits = 0, resultDigits = REPORT_DIGITS, names = sentenceNames(null),
} = {}) {
  const input = toNumber(x);
  const yHat = isLine(line) && input !== null ? predict(line, input) : NaN;
  if (!isFiniteNumber(yHat) || Math.abs(input) > MAX_INPUT || Math.abs(yHat) > MAX_INPUT * 1000) {
    return {
      ok: false,
      reason: isFiniteNumber(yHat) ? 'too-large' : 'not-a-number',
      x: input,
      yHat: NaN,
      position: 'unknown',
      work: null,
      sentence: null,
      note: null,
    };
  }
  const b0 = workPart(line.b0);
  const b1 = workPart(line.b1);
  const xPart = givenPart(input);
  const result = printed(yHat, resultDigits);
  const position = rangePosition(input, xMin, xMax);
  const range = position === 'unknown' ? null : rangeWords(xMin, xMax, xDigits);
  return {
    ok: true,
    reason: null,
    x: input,
    yHat,
    position,
    work: `ŷ = ${substituteLine(b0, b1, xPart)} ${relation(b0, b1, xPart, result)} ${result.text}`,
    sentence: {
      zh: zhSentence(`当${inZh(names.x.zh)}为 ${xPart.text} 时，预测的${inZh(names.y.zh)}${result.exact ? '为' : '约为'} ${result.text}。`),
      en: `When ${names.x.en} is ${xPart.text}, the predicted ${names.y.en} is ${result.exact ? '' : 'about '}${result.text}.`,
    },
    note: rangeNote(position, xPart.text, range),
  };
}

/**
 * predictionWork for a fitted line, with the fit's observed range and decimals.
 * 针对拟合直线的 predictionWork，使用该拟合的观测范围与小数位。
 */
export function predictionFor(fit, x, names) {
  return predictionWork(fit, x, {
    xMin: fit.xMin, xMax: fit.xMax, xDigits: fit.digits.x, resultDigits: fit.digits.result, names,
  });
}

/* ---------- Interpretation sentences 解释句 ---------- */

/**
 * The slope sentence of the 2025 midterm Q22 and the M5 practice: "When <x> increases by 1, the mean <y> is
 * estimated to increase by 0.69." { direction: "increase" | "decrease" | "none", amount, zh, en }, with |b1|
 * rounded to 2 decimals (3.0771 gives "decrease by 3.08"); null without a slope.
 * 2025 年期中第 22 题与第 5 单元练习的斜率解释句。|b1| 取 2 位小数（3.0771 写成“decrease by 3.08”）；没有斜率时为 null。
 */
export function slopeSentence(b1, names = sentenceNames(null)) {
  if (!isFiniteNumber(b1)) return null;
  const digits = adaptiveDigits(b1, REPORT_DIGITS);
  const rounded = roundTo(b1, digits);
  const { x, y } = names;
  if (rounded === 0) {
    return {
      direction: 'none',
      amount: '0',
      zh: zhSentence(`斜率为 0：当${inZh(x.zh)}增加 1 时，${inZh(y.zh)}的平均值估计不变。`),
      en: `The slope is 0: when ${x.en} increases by 1, the mean ${y.en} is estimated to stay the same.`,
    };
  }
  const up = rounded > 0;
  const amount = formatTrim(Math.abs(b1), digits);
  return {
    direction: up ? 'increase' : 'decrease',
    amount,
    zh: zhSentence(`当${inZh(x.zh)}增加 1 时，${inZh(y.zh)}的平均值估计会${up ? '增加' : '减少'} ${amount}。`),
    en: `When ${x.en} increases by 1, the mean ${y.en} is estimated to ${up ? 'increase' : 'decrease'} by ${amount}.`,
  };
}

/**
 * The intercept sentence of the 2025 midterm Q23, "The mean <y> is estimated to be 13.31 when <x> is 0.", with
 * a note on whether it means anything: { value, zeroInRange, zh, en, note }. zeroInRange is true or false
 * from the observed x range, or null when the range is unknown (summary mode).
 * 2025 年期中第 23 题的截距解释句，并说明它是否有实际意义。zeroInRange 由观测到的 x 范围判断（true 或 false），
 * 范围未知（概括统计量模式）时为 null。
 */
export function interceptSentence(b0, names = sentenceNames(null), { xMin = NaN, xMax = NaN, xDigits = 0 } = {}) {
  if (!isFiniteNumber(b0)) return null;
  const value = formatTrim(b0, adaptiveDigits(b0, REPORT_DIGITS));
  const { x, y } = names;
  const position = rangePosition(0, xMin, xMax);
  const zeroInRange = position === 'unknown' ? null : position === 'inside';
  const range = zeroInRange === null ? null : rangeWords(xMin, xMax, xDigits);
  let note;
  if (zeroInRange === null) {
    note = {
      zh: '只有当 x = 0 在观测到的 x 范围之内时，才能这样解释截距；否则属于外推（extrapolation）。',
      en: 'Use this sentence only if x = 0 is within the observed range of x; otherwise it is extrapolation.',
    };
  } else if (zeroInRange) {
    note = {
      zh: `x = 0 在观测到的 x 范围（${range.zh}）之内，所以这里的截距有实际意义。`,
      en: `x = 0 is inside the observed range of x (${range.en}), so the intercept has a practical meaning here.`,
    };
  } else {
    note = {
      zh: `但是 x = 0 不在观测到的 x 范围（${range.zh}）之内：用截距去说 x = 0 时的情况属于外推（extrapolation），所以这里的截距没有实际意义。`,
      en: `But x = 0 is outside the observed range of x (${range.en}): interpreting the intercept would be extrapolation, so it has no practical meaning here.`,
    };
  }
  return {
    value,
    zeroInRange,
    zh: zhSentence(`当${inZh(x.zh)}为 0 时，${inZh(y.zh)}的平均值估计为 ${value}。`),
    en: `The mean ${y.en} is estimated to be ${value} when ${x.en} is 0.`,
    note,
  };
}

// Whole-number percent unless that would hide a non-zero share or claim 100% (99.6% stays 99.6%).
// 百分数取整数，除非这样会把非零比例写成 0% 或把不到 100% 写成 100%（99.6% 保持 99.6%）。
function percentDigits(share) {
  const percent = share * 100;
  let digits = 0;
  while (digits < 4 && ((percent > 0 && roundTo(percent, digits) === 0) || (percent < 100 && roundTo(percent, digits) === 100))) {
    digits += 1;
  }
  return digits;
}

/**
 * R² = r² with its working and the M5 practice sentence: "About 42% of the variation in <y> is explained by
 * the linear regression with <x>." { defined, value, text, percent, work, sentence }. R² is printed with 2
 * decimals (0.77 gives "R² = r² = (0.77)² ≈ 0.59", 2025 midterm Q25). r is printed with 4 decimals, or as
 * it was given when `given` is set. Without r (every y equal) R² is undefined and the sentence says why.
 * R² = r²，附计算过程和第 5 单元练习的解释句。R² 印 2 位小数（r = 0.77 得到“R² = r² = (0.77)² ≈ 0.59”，
 * 2025 年期中第 25 题）。r 印 4 位小数；given 为 true 时按题目给的样子印出。没有 r（所有 y 都相等）时 R² 无法计算，句子说明原因。
 */
export function rSquaredInfo(r, names = sentenceNames(null), { given = false } = {}) {
  if (!isFiniteNumber(r)) {
    return {
      defined: false,
      value: NaN,
      text: '—',
      percent: '—',
      work: null,
      sentence: {
        zh: '所有 y 都一样，y 没有任何变化（variation）可以解释，所以 R² 无法计算。',
        en: 'Every y is the same, so there is no variation in y to explain and R² cannot be computed.',
      },
    };
  }
  const value = r * r;
  const rPart = given ? givenPart(r) : workPart(r);
  const digits = adaptiveDigits(value, REPORT_DIGITS);
  const text = formatFixed(value, digits);
  const percent = formatPercent(value, percentDigits(value));
  const sign = rPart.exact && relationSign(value, digits) === '=' ? '=' : APPROX;
  const { x, y } = names;
  return {
    defined: true,
    value,
    text,
    percent,
    work: `R² = r² = (${rPart.text})² ${sign} ${text}`,
    sentence: {
      zh: zhSentence(`${inZh(y.zh)}的变化（variation）中，大约 ${percent} 可以由它与${inZh(x.zh)}之间的线性回归来解释。`),
      en: `About ${percent} of the variation in ${y.en} is explained by the linear regression with ${x.en}.`,
    },
  };
}

/**
 * The three interpretation sentences of a fitted line: { slope, intercept, rSquared }. The intercept is
 * checked against the observed x range, and a given r is printed as given.
 * 拟合直线的三个解释句：{ slope, intercept, rSquared }。截距会对照观测到的 x 范围检查，题目给出的 r 按原样印出。
 */
export function fitSentences(fit, names) {
  return {
    slope: slopeSentence(fit.b1, names),
    intercept: interceptSentence(fit.b0, names, { xMin: fit.xMin, xMax: fit.xMax, xDigits: fit.digits.x }),
    rSquared: rSquaredInfo(fit.r, names, { given: fit.mode === 'summary' }),
  };
}

/* ---------- The learner's own line 学习者自己的直线 ---------- */

// A slider range [−limit, limit] whose step keeps about three digits below the limit's leading digit.
// 滑块范围 [−limit, limit]；步长比上限的最高位低三位左右。
function sliderSpec(limit) {
  const step = 10 ** (Math.floor(Math.log10(limit)) - 3);
  const digits = decimalsOf(step);
  const rounded = roundTo(step, digits);
  return { min: -limit, max: limit, step: rounded, keyStep: roundTo(rounded * 10, digits), digits };
}

function snap(value, spec) {
  return roundTo(clamp(Math.round(value / spec.step) * spec.step, spec.min, spec.max), spec.digits);
}

/**
 * Slider settings for the "try your own line" mode: { b0: spec, b1: spec, start }, each spec { min, max,
 * step, keyStep, digits } for the shared parameter slider. Both ranges are symmetric around 0, so the slider
 * position gives nothing away; the slope range covers twice the steeper of the least-squares slope and the
 * data's rise over run, and the intercept range covers every line that slope range can draw through the data.
 * The start is the flat line ŷ = ȳ (b1 = 0), the guess that ignores x.
 * “自己画一条直线”模式的滑块设置：{ b0, b1, start }，每个 spec 为共享参数滑块所用的 { min, max, step, keyStep, digits }。
 * 两个范围都以 0 为中心，滑块位置不会泄露答案；斜率范围是最小二乘斜率与数据“纵向跨度 ÷ 横向跨度”中较陡者的两倍，
 * 截距范围覆盖这个斜率范围内所有穿过数据的直线。起点是水平线 ŷ = ȳ（b1 = 0），也就是完全不看 x 的猜法。
 */
export function ownLineSpecs(fit, points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xSpan = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const ySpan = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  const ybar = isFiniteNumber(fit?.ybar) ? fit.ybar : 0;
  const xbar = isFiniteNumber(fit?.xbar) ? fit.xbar : 0;
  const run = xSpan > 0 ? xSpan : 1;
  const rise = ySpan > 0 ? ySpan : Math.max(Math.abs(ybar), 1);
  const slopeScale = Math.max(isFiniteNumber(fit?.b1) ? Math.abs(fit.b1) : 0, rise / run);
  const slopeLimit = niceCeil(2 * slopeScale);
  const interceptScale = Math.max(
    Math.abs(ybar) + slopeLimit * Math.abs(xbar) + rise,
    isFiniteNumber(fit?.b0) ? 1.2 * Math.abs(fit.b0) : 0,
  );
  const b1 = sliderSpec(slopeLimit);
  const b0 = sliderSpec(niceCeil(interceptScale));
  return { b0, b1, start: { b0: snap(ybar, b0), b1: 0 } };
}

/**
 * Compares the learner's line with the least-squares line by the sum of squared residuals Σe²:
 * { ownSse, bestSse, gap, status, ownText, bestText, gapText, message }. `status` is "best" (the same Σe²,
 * which only the least-squares line reaches), "close" (equal once printed) or "worse".
 * 用残差平方和 Σe² 比较学习者的直线和最小二乘直线。status 为 "best"（Σe² 相同，只有最小二乘直线能做到）、
 * "close"（印出来相同）或 "worse"。
 */
export function compareWithBest(ownLine, fit, points, { resultDigits = REPORT_DIGITS } = {}) {
  const ownSse = residualTable(ownLine, points).sse;
  const bestSse = residualTable(fit, points).sse;
  const gap = Math.max(0, ownSse - bestSse);
  const own = printed(ownSse, resultDigits);
  const best = printed(bestSse, resultDigits);
  const difference = printed(gap, resultDigits);
  const ownText = formatFixed(ownSse, resultDigits);
  const bestText = formatFixed(bestSse, resultDigits);
  const gapText = formatFixed(gap, resultDigits);
  const ownSign = relation(own);
  const bestSign = relation(best);
  let status = 'worse';
  if (gap <= 1e-9 * Math.max(1, Math.abs(bestSse))) status = 'best';
  else if (ownText === bestText) status = 'close';
  const about = difference.exact ? '' : 'about ';
  const messages = {
    best: {
      zh: `你的直线就是最小二乘直线：Σe² ${bestSign} ${bestText}，已经是所有直线里最小的。`,
      en: `Your line is the least-squares line: Σe² ${bestSign} ${bestText}, the smallest of all lines.`,
    },
    close: {
      zh: `非常接近：你的 Σe² ${ownSign} ${ownText}，和最小二乘直线只差一点点。`,
      en: `Very close: your Σe² ${ownSign} ${ownText}, almost the same as the least-squares line.`,
    },
    worse: {
      zh: `你的直线 Σe² ${ownSign} ${ownText}，比最小二乘直线（Σe² ${bestSign} ${bestText}）大${difference.exact ? '' : '约'} ${gapText}。`,
      en: `Your line has Σe² ${ownSign} ${ownText}, which is ${about}${gapText} more than the least-squares line (Σe² ${bestSign} ${bestText}).`,
    },
  };
  return {
    ownSse, bestSse, gap, status, ownText, bestText, gapText, ownSign, bestSign, message: messages[status],
  };
}

/* ---------- Plot geometry 绘图几何 ---------- */

/**
 * Axis extents of the scatterplot: x covers the data with a margin on both sides, so the observed range and
 * a little room for extrapolation are visible; y covers the data and the line across the x axis, without a
 * very steep line squashing the data. Both are { min, max, step, ticks } for the plot frame.
 * 散点图的坐标范围：x 覆盖数据并在两边留出余量，能看到观测范围和一点外推空间；y 覆盖数据以及整条直线，
 * 但不会让很陡的直线把数据压扁。两者都是坐标框所需的 { min, max, step, ticks }。
 */
export function plotExtents(points, line) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = niceExtent(xs, { anchorZero: false, padRatio: 0.08 });
  const low = ys.length ? Math.min(...ys) : 0;
  const high = ys.length ? Math.max(...ys) : 1;
  const span = high - low || Math.abs(high) || 1;
  const ends = isLine(line)
    ? [predict(line, x.min), predict(line, x.max)].map((value) => clamp(value, low - span, high + span))
    : [];
  return { x, y: niceExtent([...ys, ...ends], { anchorZero: false, padRatio: 0.08 }) };
}

/**
 * Extents of the residual plot: the horizontal axis is x (`axis` "x", same as the scatterplot) or the fitted
 * values ŷ (`axis` "fitted", as R's residual plots draw it); the vertical axis is symmetric around e = 0.
 * 残差图的坐标范围：横轴是 x（axis 为 "x"，与散点图相同）或拟合值 ŷ（axis 为 "fitted"，R 的残差图就是这样画的）；
 * 纵轴以 e = 0 为中心上下对称。
 */
export function residualExtents(rows, axis, xExtent) {
  const largest = rows.reduce((most, row) => Math.max(most, Math.abs(row.residual)), 0);
  const reach = largest > 1e-12 ? largest : 1;
  const y = niceExtent([-reach, reach], { anchorZero: false, padRatio: 0.1, targetTicks: 4 });
  const x = axis === 'fitted' || !xExtent
    ? niceExtent(rows.map((row) => (axis === 'fitted' ? row.yHat : row.x)), { anchorZero: false, padRatio: 0.08 })
    : xExtent;
  return { x, y };
}

/**
 * The part of the line ŷ = b0 + b1x inside the box { xMin, xMax, yMin, yMax } as two end points, or null.
 * 直线 ŷ = b0 + b1x 落在方框内的部分（两个端点）；完全在框外时为 null。
 */
export function visibleSegment(line, { xMin, xMax, yMin, yMax }) {
  if (!isLine(line)) return null;
  const { b0, b1 } = line;
  if (b1 === 0) return b0 >= yMin && b0 <= yMax ? [[xMin, b0], [xMax, b0]] : null;
  const xAtLow = (yMin - b0) / b1;
  const xAtHigh = (yMax - b0) / b1;
  const start = Math.max(xMin, Math.min(xAtLow, xAtHigh));
  const end = Math.min(xMax, Math.max(xAtLow, xAtHigh));
  if (start > end) return null;
  return [[start, b0 + b1 * start], [end, b0 + b1 * end]];
}

/** Point indices from left to right (then bottom to top), the keyboard order. 从左到右（再从下到上）的点序号，即键盘顺序。 */
export function pointOrder(points) {
  return points.map((point) => point.index).sort((a, b) => points[a].x - points[b].x || points[a].y - points[b].y);
}

/* ---------- Text alternatives 文字替代 ---------- */

/**
 * One point for screen readers: "点 4 Point 4: x = 4, y = 2, ŷ = 2.7, e = −0.7".
 * 供读屏软件使用的单个点描述。
 */
export function pointDescription(line, point, { resultDigits = REPORT_DIGITS } = {}) {
  const work = residualWork(line, point, { resultDigits });
  const head = `点 ${point.index + 1} Point ${point.index + 1}: x = ${formatTrim(point.x, DATA_DIGITS)}, y = ${formatTrim(point.y, DATA_DIGITS)}`;
  if (!work.ok) return head;
  return `${head}, ŷ = ${formatTrim(work.yHat, resultDigits)}, e = ${formatSigned(work.residual, resultDigits, { trim: true })}`;
}

/**
 * Summary of the scatterplot for its aria-label, { zh, en }: number of points, the observed x range and the
 * line drawn.
 * 散点图的概述（用于 aria-label）：点数、观测到的 x 范围和画出的直线。
 */
export function scatterDescription(fit, line, { own = false } = {}) {
  const range = rangeText(fit);
  const equation = equationText(line);
  return {
    zh: `散点图：${fit.n} 个点，x 从 ${range?.zh ?? '—'}；${own ? '你的直线' : '最小二乘直线'} ${equation}。`,
    en: `Scatterplot of ${fit.n} points, x from ${range?.en ?? '—'}; ${own ? 'your line' : 'least-squares line'} ${equation}.`,
  };
}

/**
 * Summary of the residual plot for its aria-label, { zh, en }: how many residuals, their smallest and largest
 * value, and what the horizontal axis shows.
 * 残差图的概述（用于 aria-label）：残差个数、最小值与最大值，以及横轴表示什么。
 */
export function residualPlotDescription(fit, axis) {
  const values = fit.rows.map((row) => row.residual);
  const low = values.length ? formatSigned(Math.min(...values), fit.digits.result, { trim: true }) : '—';
  const high = values.length ? formatSigned(Math.max(...values), fit.digits.result, { trim: true }) : '—';
  const fitted = axis === 'fitted';
  return {
    zh: `残差图：横轴是${fitted ? '拟合值 ŷ' : ' x'}，纵轴是残差 e；${values.length} 个残差从 ${low} 到 ${high}，分布在 e = 0 这条线的上下。`,
    en: `Residual plot against ${fitted ? 'the fitted values ŷ' : 'x'}: ${values.length} residuals from ${low} to ${high}, around the line e = 0.`,
  };
}
