/**
 * Number helpers, axis extents and formula text shared by the machine-learning widgets. DOM-free.
 * 机器学习类组件共用的数字工具、坐标范围与公式文本；不依赖 DOM。
 *
 * Numbers are printed the way the slides print them: a real minus sign (U+2212), rounding half
 * away from zero, and linear expressions such as "−12 + x1 + 0.3x2".
 * 数字按课件的样子输出：使用真正的减号（U+2212）、四舍五入，线性式写成“−12 + x1 + 0.3x2”。
 */

export const MINUS = '−';
export const TIMES = '×';
export const APPROX = '≈';

const HAN = /[㐀-鿿]/;
const NICE_STEPS = [1, 2, 2.5, 5, 10];
const NICE_LIMITS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Accepts numbers and numeric strings; anything else yields the fallback. 接受数字与数字字符串，其余返回后备值。 */
export function toNumber(value, fallback = null) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return isFiniteNumber(number) ? number : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Returns a bilingual value { zh, en }; a plain string is placed by script (Chinese characters go to zh).
 * 返回 { zh, en } 双语值；普通字符串按文字判断归属（含汉字放入 zh）。
 */
export function toBi(value, fallback = { zh: '', en: '' }) {
  if (typeof value === 'string' && value.trim()) {
    return HAN.test(value) ? { zh: value, en: '' } : { zh: '', en: value };
  }
  if (value && typeof value === 'object') {
    const zh = typeof value.zh === 'string' ? value.zh : '';
    const en = typeof value.en === 'string' ? value.en : '';
    if (zh.trim() || en.trim()) return { zh, en };
  }
  return { ...fallback };
}

/**
 * Rounds half away from zero, like hand calculation on the slides, and never returns -0.
 * 按四舍五入（远离零）取整，与课件手算一致，且不会返回 -0。
 */
export function roundTo(value, digits = 0) {
  if (!isFiniteNumber(value)) return value;
  const factor = 10 ** digits;
  const scaled = Math.abs(value) * factor;
  // A tiny nudge absorbs binary noise such as 9.55 * 10 = 95.49999999999999.
  // 微小的偏移用于吸收二进制误差，例如 9.55 * 10 = 95.49999999999999。
  const rounded = (Math.sign(value) * Math.round(scaled + scaled * 1e-12 + 1e-9)) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** Number of decimals needed to write a step size exactly (0.05 -> 2). 精确写出步长所需的小数位数。 */
export function decimalsOf(value, maxDigits = 8) {
  if (!isFiniteNumber(value)) return 0;
  for (let digits = 0; digits < maxDigits; digits += 1) {
    if (Math.abs(roundTo(value, digits) - value) < 1e-9 * Math.max(1, Math.abs(value))) return digits;
  }
  return maxDigits;
}

export function formatFixed(value, digits = 0) {
  if (!isFiniteNumber(value)) return '—';
  const text = roundTo(value, digits).toFixed(digits);
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
}

/** Fixed decimals with trailing zeros removed: 12.50 -> "12.5", 3.00 -> "3". 去掉末尾的 0。 */
export function formatTrim(value, maxDigits = 2) {
  const text = formatFixed(value, maxDigits);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** Explicit sign for positive values ("+5.1", "−2.0", "0.0"). 正数带“+”号。 */
export function formatSigned(value, digits = 1, { trim = false } = {}) {
  const text = trim ? formatTrim(value, digits) : formatFixed(value, digits);
  return isFiniteNumber(value) && roundTo(value, digits) > 0 ? `+${text}` : text;
}

/** Ratio in [0, 1] as a percentage with up to `digits` decimals: 6/7 -> "85.7%". 比例转百分数。 */
export function formatPercent(ratio, digits = 1) {
  if (!isFiniteNumber(ratio)) return '—';
  return `${formatTrim(ratio * 100, digits)}%`;
}

/**
 * Prints a value with enough decimals that a non-zero number never shows as 0, so its sign stays visible.
 * 输出足够的小数位，保证非零的数不会显示成 0，让正负号始终可见。
 */
export function formatNonZero(value, digits = 2, maxDigits = 6) {
  if (!isFiniteNumber(value)) return '—';
  let used = digits;
  while (used < maxDigits && value !== 0 && roundTo(value, used) === 0) used += 1;
  return formatTrim(value, used);
}

/** Number used as a factor in written working: negatives get parentheses, "(−3)". 代入式中的数，负数加括号。 */
export function formatOperand(value, digits = 3) {
  const text = formatTrim(value, digits);
  return roundTo(value, digits) < 0 ? `(${text})` : text;
}

/**
 * Formats a linear expression like the slides: "−12 + x1 + 0.3x2", "19.00 − 0.800x1".
 * Each term is { coef, symbol, digits }; symbol '' marks the constant term.
 * 按课件写法格式化线性式。每项为 { coef, symbol, digits }，symbol 为空表示常数项。
 *
 * Options: `fixed` keeps trailing zeros, `omitUnit` drops a coefficient of 1 (x1 instead of 1x1),
 * `keepZero` keeps terms whose coefficient rounds to 0.
 * 选项：fixed 保留末尾 0；omitUnit 省略系数 1；keepZero 保留系数为 0 的项。
 */
export function formatLinear(terms, { digits = 2, fixed = false, omitUnit = true, keepZero = false } = {}) {
  const parts = [];
  for (const term of terms) {
    const termDigits = term.digits ?? digits;
    const rounded = roundTo(term.coef, termDigits);
    if (!isFiniteNumber(rounded) || (rounded === 0 && !keepZero)) continue;
    const symbol = term.symbol || '';
    const magnitude = Math.abs(rounded);
    const coefText = fixed ? formatFixed(magnitude, termDigits) : formatTrim(magnitude, termDigits);
    const body = symbol && omitUnit && !fixed && magnitude === 1 ? symbol : `${coefText}${symbol}`;
    if (!parts.length) parts.push(rounded < 0 ? `${MINUS}${body}` : body);
    else parts.push(rounded < 0 ? ` ${MINUS} ${body}` : ` + ${body}`);
  }
  return parts.length ? parts.join('') : '0';
}

export function linearScale([domainStart, domainEnd], [rangeStart, rangeEnd]) {
  const span = domainEnd - domainStart;
  const scale = (value) => (span === 0
    ? (rangeStart + rangeEnd) / 2
    : rangeStart + ((value - domainStart) / span) * (rangeEnd - rangeStart));
  scale.invert = (pixel) => (rangeEnd === rangeStart
    ? domainStart
    : domainStart + ((pixel - rangeStart) / (rangeEnd - rangeStart)) * span);
  return scale;
}

/**
 * Tick step of the form {1, 2, 2.5, 5} x 10^k closest (on a log scale) to span / targetCount.
 * 选取形如 {1, 2, 2.5, 5} x 10^k、在对数尺度上最接近 span / targetCount 的刻度步长。
 */
export function niceStep(span, targetCount = 6) {
  if (!isFiniteNumber(span) || span <= 0) return 1;
  const raw = span / Math.max(1, targetCount);
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  let best = NICE_STEPS[0];
  for (const candidate of NICE_STEPS) {
    if (Math.abs(Math.log(candidate / fraction)) < Math.abs(Math.log(best / fraction))) best = candidate;
  }
  return roundTo(best * power, decimalsOf(best * power));
}

/** Smallest "round" limit (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 x 10^k) that is >= value. 不小于 value 的整齐上限。 */
export function niceCeil(value) {
  if (!isFiniteNumber(value) || value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const candidate of NICE_LIMITS) {
    const limit = roundTo(candidate * power, decimalsOf(candidate * power));
    if (limit >= value - 1e-12) return limit;
  }
  return 10 * power;
}

export function ticksBetween(min, max, step) {
  if (!(step > 0) || !(max >= min)) return [];
  const digits = decimalsOf(step);
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, index) => roundTo(min + index * step, digits));
}

/**
 * Axis extent with round ends. Positive data close to 0 starts at 0, like the slides' plots
 * (leaf width 0-15, leaf height 0-20). When the ends are cut in steps of 2.5 x 10^k, the ticks
 * come every 2 x 10^k instead, as on the slides: 0, 2, 4, ..., 14 inside 0-15.
 * Returns { min, max, step, ticks }, where step is the tick step.
 * 生成两端取整的坐标范围。接近 0 的正数数据从 0 开始，和课件的图一致（叶宽 0-15、叶高 0-20）。
 * 两端按 2.5 x 10^k 取整时，刻度改为每 2 x 10^k 一个，和课件一样：0-15 里标 0、2、4……14。
 * 返回 { min, max, step, ticks }，step 是刻度间距。
 */
export function niceExtent(values, { targetTicks = 6, padRatio = 0.05, anchorZero = true } = {}) {
  const finite = values.filter(isFiniteNumber);
  let low = finite.length ? Math.min(...finite) : 0;
  let high = finite.length ? Math.max(...finite) : 1;
  if (low === high) {
    const half = Math.abs(low) * 0.5 || 1;
    low -= half;
    high += half;
  }
  if (anchorZero && low > 0 && low <= 0.6 * high) low = 0;
  if (anchorZero && high < 0 && high >= 0.6 * low) high = 0;
  const span = high - low;
  if (low !== 0) low -= span * padRatio;
  if (high !== 0) high += span * padRatio;
  const step = niceStep(high - low, targetTicks);
  const digits = decimalsOf(step);
  const min = roundTo(Math.floor(low / step + 1e-9) * step, digits);
  const max = roundTo(Math.ceil(high / step - 1e-9) * step, digits);
  const power = 10 ** Math.floor(Math.log10(step));
  const tickStep = Math.abs(step / power - 2.5) < 1e-9 ? roundTo(2 * power, decimalsOf(2 * power)) : step;
  const tickDigits = decimalsOf(tickStep);
  const first = roundTo(Math.ceil(min / tickStep - 1e-9) * tickStep, tickDigits);
  const last = roundTo(Math.floor(max / tickStep + 1e-9) * tickStep, tickDigits);
  return { min, max, step: tickStep, ticks: ticksBetween(first, last, tickStep) };
}

/**
 * Keeps at most maxCount values, evenly spaced, always including the first and the last.
 * 均匀抽取至多 maxCount 个值，始终保留第一个和最后一个。
 */
export function downsample(values, maxCount = 120) {
  if (values.length <= maxCount || maxCount < 2) return [...values];
  const last = values.length - 1;
  return Array.from({ length: maxCount }, (_, index) => values[Math.round((index * last) / (maxCount - 1))]);
}
