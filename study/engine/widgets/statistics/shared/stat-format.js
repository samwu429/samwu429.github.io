/**
 * Number text for the statistics widgets' worked steps and labels, and the variable names their English sentences
 * use. DOM-free.
 * 统计类组件解题步骤与标签中的数字文本，以及英文句子里使用的变量名；不依赖 DOM。
 *
 * Numbers are printed the way the STA220 slides print them: a real minus sign (U+2212), rounding half away
 * from zero, "=" when the printed value is exact and "≈" when it was rounded. The general formatters (fixed
 * and trimmed decimals, percentages, signed values, operands) are the machine-learning shared ones, passed on
 * here so every statistics widget takes its number text from one module. core/util/format.js only formats
 * dates, timers and option letters, so nothing there applies.
 * 数字按 STA220 课件的样子输出：使用真正的减号（U+2212），四舍五入（远离零），显示值精确时用“=”，经过四舍五入时用“≈”。
 * 通用的格式化函数（固定小数位、去掉末尾 0、百分数、带正负号、代入式中的数）沿用机器学习共享模块，在这里统一导出，
 * 让每个统计组件都从同一个模块取得数字文本。core/util/format.js 只格式化日期、计时器和选项字母，没有可用的函数。
 */
import {
  APPROX, MINUS, TIMES, decimalsOf, formatFixed, formatOperand, formatPercent, formatSigned, formatTrim,
  isFiniteNumber, roundTo,
} from '../../machine-learning/shared/ml-math.js';

export { APPROX, MINUS, TIMES, formatFixed, formatOperand, formatPercent, formatSigned, formatTrim, roundTo };

// Midline ellipsis, as in the slide's sum "180 + 190 + ⋯ + 400" (M3 p.30).
// 居中的省略号，与课件的求和式“180 + 190 + ⋯ + 400”一致（第 3 单元第 30 页）。
export const ELLIPSIS = '⋯';

/**
 * Default decimals for each kind of number, as the course prints them: x̄ = 251 and s = 50.06 (M3 p.30, p.53),
 * s² = 2505.8621 (M3 p.53), z = 2.98 (M4 p.39), r = 0.9037 in the working (M5 p.40), ŷ = 13.31 + 0.69x and
 * R² = 0.59 (midterm 2025 Q22, Q25), proportions 30 / 96 ≈ 0.313 (midterm 2025 Q4), percentages 28.6% (M2 p.23).
 * 各类数字的默认小数位数，与课程的写法一致：x̄ = 251、s = 50.06（第 3 单元第 30、53 页），s² = 2505.8621（第 3 单元第 53 页），
 * z = 2.98（第 4 单元第 39 页），计算过程中 r = 0.9037（第 5 单元第 40 页），ŷ = 13.31 + 0.69x 与 R² = 0.59
 * （2025 年期中考试第 22、25 题），比例 30 / 96 ≈ 0.313（同卷第 4 题），百分数 28.6%（第 2 单元第 23 页）。
 */
export const STAT_DIGITS = Object.freeze({
  value: 2,
  variance: 4,
  sd: 2,
  z: 2,
  r: 4,
  coefficient: 2,
  rSquared: 2,
  proportion: 3,
  percent: 1,
});

/**
 * "=" when `value` written with `digits` decimals is exact, "≈" when it was rounded
 * (7530 / 30 = 251, but 72670 / 29 ≈ 2505.8621).
 * 用 digits 位小数写出 value 时精确则为“=”，经过四舍五入则为“≈”。
 */
export function relationSign(value, digits = STAT_DIGITS.value) {
  if (!isFiniteNumber(value)) return '=';
  const exact = Math.abs(value - roundTo(value, digits)) <= 1e-9 * Math.max(1, Math.abs(value));
  return exact ? '=' : APPROX;
}

/**
 * The end of a worked step: "= 251" or "≈ 50.06". Trailing zeros are dropped unless `fixed` is set.
 * 一步计算的结尾：“= 251”或“≈ 50.06”。除非指定 fixed，否则去掉末尾的 0。
 */
export function formatResult(value, digits = STAT_DIGITS.value, { fixed = false } = {}) {
  const text = fixed ? formatFixed(value, digits) : formatTrim(value, digits);
  return `${relationSign(value, digits)} ${text}`;
}

/** A proportion with fixed decimals, as the course writes them: 0.313, 0.20 (digits 2). 固定小数位的比例。 */
export function formatProportion(value, digits = STAT_DIGITS.proportion) {
  return formatFixed(value, digits);
}

/**
 * The fraction behind a proportion, { numerator, denominator, value } (from cellFraction or marginalFraction):
 * "30 / 96 ≈ 0.313", or with `percent` "30 / 96 ≈ 31.3%". A zero denominator prints the fraction only.
 * 比例背后的分数：“30 / 96 ≈ 0.313”，percent 时为“30 / 96 ≈ 31.3%”。分母为 0 时只写分数。
 */
export function formatFraction(part, { digits, percent = false } = {}) {
  const base = `${formatTrim(part?.numerator, 6)} / ${formatTrim(part?.denominator, 6)}`;
  if (!isFiniteNumber(part?.value)) return base;
  if (percent) {
    const places = digits ?? STAT_DIGITS.percent;
    return `${base} ${relationSign(part.value * 100, places)} ${formatPercent(part.value, places)}`;
  }
  const places = digits ?? STAT_DIGITS.proportion;
  return `${base} ${relationSign(part.value, places)} ${formatFixed(part.value, places)}`;
}

/**
 * Interval notation of a bin { lower, upper, leftClosed, rightClosed }: "[150, 200]", "(200, 250]", "[400, 450)".
 * The ends are written with the decimals they need, at most `digits` when it is given, without trailing zeros.
 * 组区间的写法；端点写出所需的小数位（给出 digits 时最多 digits 位），不保留末尾的 0。
 */
export function formatInterval(bin, digits) {
  const places = digits ?? Math.max(decimalsOf(bin?.lower), decimalsOf(bin?.upper));
  const open = bin?.leftClosed ? '[' : '(';
  const close = bin?.rightClosed ? ']' : ')';
  return `${open}${formatTrim(bin?.lower, places)}, ${formatTrim(bin?.upper, places)}${close}`;
}

/**
 * A sum written out term by term, shortened with "⋯" after `maxTerms` - 2 terms when longer:
 * formatTerms(calories, { maxTerms: 4 }) gives "180 + 190 + ⋯ + 400" like M3 p.30. Negative terms get
 * parentheses, "(−2) + (−1) + 3" (M3 p.45). `term` can write each term differently, for example as
 * a squared deviation "(180 − 251)²".
 * 逐项写出的求和式；项数超过 maxTerms 时，写出前 maxTerms - 2 项、“⋯”和最后一项：
 * formatTerms(热量, { maxTerms: 4 }) 得到“180 + 190 + ⋯ + 400”（第 3 单元第 30 页）。负数项加括号。
 * term 可以改写每一项，例如写成平方偏差“(180 − 251)²”。
 */
export function formatTerms(values, { digits = STAT_DIGITS.value, maxTerms = 6, term } = {}) {
  const list = Array.isArray(values) ? values : [];
  const write = typeof term === 'function' ? term : (value) => formatOperand(value, digits);
  const limit = Math.max(3, Math.floor(maxTerms) || 3);
  if (list.length <= limit) return list.map((value) => write(value)).join(' + ');
  return [...list.slice(0, limit - 2).map((value) => write(value)), ELLIPSIS, write(list[list.length - 1])].join(' + ');
}

/**
 * English ordinal of a 1-based position, for steps like "the 15th and the 16th values": 1st, 2nd, 3rd, 11th,
 * 22nd. A non-whole rank such as 15.5 is returned as the number itself.
 * 从 1 开始的位置的英文序数（如 1st、2nd、3rd、11th、22nd），用于步骤中的“第 15 个和第 16 个值”；15.5 这样的非整数名次原样返回。
 */
export function ordinal(position) {
  if (!Number.isInteger(position) || position < 0) return formatTrim(position, 2);
  const lastTwo = position % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${position}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[position % 10] ?? 'th';
  return `${position}${suffix}`;
}

/** Stem label of a stem-and-leaf line: "1", "12", or "−0" for the negative zero stem. 茎叶图一行的茎标签。 */
export function formatStemLabel(line) {
  return `${line?.negative ? MINUS : ''}${line?.stem ?? ''}`;
}

/* ---------- Names inside sentences 句子中的变量名 ---------- */

// Short words that stay in small letters inside a Title Case label ("Hours of Study per Week").
// 标题式大写（Title Case）的标签里仍然小写的短词（“Hours of Study per Week”）。
const TITLE_SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'per', 'the', 'to', 'vs', 'with',
]);
// A capital followed by small letters only: "Calories", "Time", "Mother's", "Follow-up".
// 首字母大写、其余都是小写字母的单词。
const CAPITALIZED_WORD = /^[A-Z][a-z]+(?:['’-][a-z]+)*$/;
// Brackets, counted to know which words lie inside "(in seconds)". 括号；数一数括号，就知道哪些单词在“(in seconds)”里面。
const OPENING_BRACKETS = /[(（[]/g;
const CLOSING_BRACKETS = /[)）\]]/g;

// "capital" (Calories), "neutral" (no letters, an acronym such as GPA or TB, or a small word such as "of") or "other"
// (a small-letter word such as "donuts", or mixed case such as "pH").
// 单词的类别：capital（首字母大写）、neutral（没有字母、缩写词如 GPA、TB，或 of 这样的短词）、other（小写单词或 pH 这样的混合写法）。
function wordKind(core) {
  if (!/[A-Za-z]/.test(core)) return 'neutral';
  if (CAPITALIZED_WORD.test(core)) return 'capital';
  if (/^[A-Z0-9]+$/.test(core) || TITLE_SMALL_WORDS.has(core)) return 'neutral';
  return 'other';
}

/**
 * A variable label as it reads in the middle of an English sentence. A Title Case label has every capitalized word
 * outside brackets lowered ("Reaction Time (in seconds)" → "reaction time (in seconds)", "% Drug Amount" →
 * "% drug amount"); any other label has only its first word lowered ("Calories in Tim Hortons donuts" → "calories in
 * Tim Hortons donuts"), so names inside it keep their capitals. Acronyms ("GDP per capita"), R names
 * ("Type.of.Donut", "original.data") and the text inside brackets stay as written, and mixed case such as
 * "reaction Time" never appears.
 * 变量标签放进英文句子中间时的写法。标题式大写的标签把括号外每个首字母大写的单词都改成小写；其他标签只改第一个单词，
 * 里面的专有名词保持大写。缩写词、R 里的名字和括号里的文字保持原样，所以不会出现“reaction Time”这种大小写混杂的写法。
 */
export function nameInSentence(text) {
  if (typeof text !== 'string') return '';
  const parts = text.trim().split(/(\s+)/);
  const words = [];
  let depth = 0;
  parts.forEach((part, index) => {
    if (!part.trim()) return;
    if (depth === 0 && !/^[(（[]/.test(part)) {
      const core = part.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9]+$/, '');
      words.push({ index, kind: wordKind(core), letters: /[A-Za-z]/.test(core) });
    }
    depth = Math.max(0, depth + (part.match(OPENING_BRACKETS) || []).length - (part.match(CLOSING_BRACKETS) || []).length);
  });
  const titleCase = words.some((word) => word.kind === 'capital') && !words.some((word) => word.kind === 'other');
  const first = words.find((word) => word.letters);
  const targets = titleCase
    ? words.filter((word) => word.kind === 'capital')
    : [first].filter((word) => word?.kind === 'capital');
  for (const word of targets) parts[word.index] = parts[word.index].replace(/[A-Z]/, (letter) => letter.toLowerCase());
  return parts.join('');
}

/**
 * A fitted line { b0, b1 } as the course writes it: "ŷ = 13.31 + 0.69x", "ŷ = −0.1 + 0.7x". A word for x
 * is separated by a space ("ŷ = 560.65 − 3.08 time"); a missing line prints "ŷ = —".
 * 按课程写法输出拟合直线：“ŷ = 13.31 + 0.69x”。x 是单词时前面加空格；直线不存在时写“ŷ = —”。
 */
export function formatLineEquation(line, {
  digits = STAT_DIGITS.coefficient, x = 'x', y = 'ŷ', fixed = false,
} = {}) {
  if (!isFiniteNumber(line?.b0) || !isFiniteNumber(line?.b1)) return `${y} = —`;
  const write = (value) => (fixed ? formatFixed(value, digits) : formatTrim(value, digits));
  const sign = roundTo(line.b1, digits) < 0 ? MINUS : '+';
  const gap = String(x).length > 1 ? ' ' : '';
  return `${y} = ${write(line.b0)} ${sign} ${write(Math.abs(line.b1))}${gap}${x}`;
}
