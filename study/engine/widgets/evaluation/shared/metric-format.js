/**
 * Number formatting and substituted formulas for the evaluation widgets.
 * 评估类组件的数字格式化与“代入数字后的公式”文本。
 *
 * The formulas use the slide notation, so the learner sees exactly what to write on the test:
 * "Precision = 28 / (28 + 12) = 28 / 40 = 70%". DOM-free.
 * 公式沿用课件写法，学生看到的就是考试时该写的样子；本模块不依赖 DOM。
 */
import { accuracy, f1Score, precision, recall } from './metrics.js';

export const MINUS = '−';
export const TIMES = '×';
const EPSILON = 1e-9;

export function roundTo(value, digits = 0) {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  // Avoid printing "-0.0" after rounding a tiny negative number.
  // 避免把极小的负数四舍五入后显示成“-0.0”。
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isWhole(value) {
  return Math.abs(value - Math.round(value)) < EPSILON;
}

/**
 * Formats a ratio in [0, 1] as a percentage. `trim` drops ".0" from whole numbers (70%),
 * matching the slides; without it every value keeps its decimals (80.0%), matching the lab model cards.
 * 将 [0, 1] 的比例格式化为百分数。trim 时整数去掉“.0”（70%，与课件一致）；
 * 不 trim 时统一保留小数（80.0%，与实验课模型卡片一致）。
 */
export function formatPercent(value, { digits = 1, trim = true } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = roundTo(value * 100, digits);
  const text = trim && isWhole(rounded) ? String(Math.round(rounded)) : rounded.toFixed(digits);
  return `${text}%`;
}

/**
 * "=" when the shown percentage is exact, "≈" when it was rounded (46/60 ≈ 76.7%).
 * 显示的百分数精确时用“=”，经过四舍五入时用“≈”。
 */
export function relationSign(value, { digits = 1 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '=';
  const scaled = value * 100;
  return Math.abs(scaled - roundTo(scaled, digits)) < EPSILON ? '=' : '≈';
}

/**
 * Decimal with 2 to 3 places (0.70, 0.933), used when a formula multiplies ratios.
 * 保留 2 到 3 位小数（0.70、0.933），用于公式中比例相乘的场合。
 */
export function formatDecimal(value, { maxDigits = 3, minDigits = 2 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  let text = roundTo(value, maxDigits).toFixed(maxDigits);
  while (text.endsWith('0') && text.split('.')[1].length > minDigits) text = text.slice(0, -1);
  return text;
}

/**
 * Percentage-point gap with an explicit sign: "+12.0 pp", "−40.0 pp", "+0.0 pp".
 * 带正负号的百分点差距。
 */
export function formatPoints(points, { digits = 1, signed = true } = {}) {
  if (points === null || points === undefined || !Number.isFinite(points)) return '—';
  const rounded = roundTo(points, digits);
  const sign = rounded < 0 ? MINUS : (signed ? '+' : '');
  return `${sign}${Math.abs(rounded).toFixed(digits)} pp`;
}

/**
 * "28 / 40 = 70%", "46 / 60 ≈ 76.7%", or "0 / 0" when the denominator is 0.
 * 分数与百分数；分母为 0 时只显示“0 / 0”。
 */
export function formatRatio(part, { digits = 1, trim = true } = {}) {
  const base = `${part.numerator} / ${part.denominator}`;
  if (part.value === null) return base;
  return `${base} ${relationSign(part.value, { digits })} ${formatPercent(part.value, { digits, trim })}`;
}

export const FORMULAS = Object.freeze({
  accuracy: 'Accuracy = (TP + TN) / (TP + TN + FP + FN)',
  precision: 'Precision = TP / (TP + FP)',
  recall: 'Recall = TP / (TP + FN)',
  f1: `F1 = 2 ${TIMES} Precision ${TIMES} Recall / (Precision + Recall)`,
  selectionRate: 'Selection rate = (TP + FP) / (TP + FP + FN + TN)',
  truePositiveRate: 'TPR = TP / (TP + FN)',
  falsePositiveRate: 'FPR = FP / (FP + TN)',
  actualPositiveRate: 'Actual positive rate = (TP + FN) / (TP + FP + FN + TN)',
});

/**
 * Builds the four slide formulas with the counts substituted in.
 * 生成代入了具体数字的四个课件公式。
 *
 * Returns { accuracy, precision, recall, f1 }; f1 is null when precision or recall is
 * undefined, because there is nothing meaningful to substitute.
 * 返回 { accuracy, precision, recall, f1 }；精确率或召回率无法计算时 f1 为 null，因为没有可代入的数。
 */
export function formulaLines(counts, { digits = 1, trim = true } = {}) {
  const { tp, fp, fn, tn } = counts;
  const options = { digits, trim };
  const acc = accuracy(counts);
  const prec = precision(counts);
  const rec = recall(counts);
  const f1 = f1Score(counts);

  let f1Line = null;
  if (f1.reason === null || f1.reason === 'zero-sum') {
    const p = formatDecimal(prec.value);
    const r = formatDecimal(rec.value);
    const head = `F1 = 2 ${TIMES} ${p} ${TIMES} ${r} / (${p} + ${r})`;
    f1Line = f1.value === null
      ? `${head} = 0 / 0`
      : `${head} ${relationSign(f1.value, { digits })} ${formatPercent(f1.value, options)}`;
  }

  return {
    accuracy: `Accuracy = (${tp} + ${tn}) / (${tp} + ${tn} + ${fp} + ${fn}) = ${formatRatio(acc, options)}`,
    precision: `Precision = ${tp} / (${tp} + ${fp}) = ${formatRatio(prec, options)}`,
    recall: `Recall = ${tp} / (${tp} + ${fn}) = ${formatRatio(rec, options)}`,
    f1: f1Line,
  };
}
