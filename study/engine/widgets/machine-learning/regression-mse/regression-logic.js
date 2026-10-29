/**
 * Linear regression y = w0 + w1x1 with the mean squared error and gradient descent (lecture 5). DOM-free.
 * 线性回归 y = w0 + w1x1、均方误差 MSE 与梯度下降（第 5 讲）；不依赖 DOM。
 *
 * Notation follows the slides: prediction y, target t, error = y − t, squared error = (y − t)²,
 * MSE = (1/N) Σ (y − t)².
 * 记号与课件一致：预测值 y，目标值 t，误差 = y − t，平方误差 = (y − t)²，MSE = (1/N) Σ (y − t)²。
 */
import {
  APPROX, decimalsOf, formatFixed, isFiniteNumber, niceCeil, roundTo, toBi, toNumber,
} from '../shared/ml-math.js';

const DEFAULT_X_LABEL = { zh: '输入特征 x1', en: 'Input x1' };
const DEFAULT_Y_LABEL = { zh: '目标值 t', en: 'Target t' };

/**
 * Reads a content config defensively. Points may be [x, t] pairs or {x, t} / {x, y} objects;
 * a missing start becomes a flat line at the mean target.
 * 防御性读取内容配置。数据点可写成 [x, t] 或 {x, t} / {x, y}；缺少起始直线时用目标值平均数的水平线。
 */
export function normalizeRegressionConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const points = [];
  for (const raw of Array.isArray(source.points) ? source.points : []) {
    const x = toNumber(Array.isArray(raw) ? raw[0] : raw?.x);
    const t = toNumber(Array.isArray(raw) ? raw[1] : (raw?.t ?? raw?.y));
    if (x !== null && t !== null) points.push({ index: points.length, x, t });
  }
  const meanT = points.length ? points.reduce((sum, point) => sum + point.t, 0) / points.length : 0;
  const w0 = toNumber(source.start?.w0);
  const w1 = toNumber(source.start?.w1);
  return {
    points,
    start: { w0: w0 ?? roundTo(meanT, 2), w1: w1 ?? 0 },
    xLabel: toBi(source.xLabel, DEFAULT_X_LABEL),
    yLabel: toBi(source.yLabel, DEFAULT_Y_LABEL),
  };
}

export function predictY(w, x) {
  return w.w0 + w.w1 * x;
}

/**
 * The part of the line y = w0 + w1x1 that lies inside the plot box, as two end points, or null.
 * 直线 y = w0 + w1x1 落在绘图框内的部分（两个端点）；完全在框外时返回 null。
 */
export function visibleLine(w, { xMin, xMax, yMin, yMax }) {
  if (w.w1 === 0) return w.w0 >= yMin && w.w0 <= yMax ? [[xMin, w.w0], [xMax, w.w0]] : null;
  const xAtLow = (yMin - w.w0) / w.w1;
  const xAtHigh = (yMax - w.w0) / w.w1;
  const start = Math.max(xMin, Math.min(xAtLow, xAtHigh));
  const end = Math.min(xMax, Math.max(xAtLow, xAtHigh));
  if (start > end) return null;
  return [[start, predictY(w, start)], [end, predictY(w, end)]];
}

/**
 * One row per point: prediction y, error y − t and squared error. With `roundY` each y is first
 * rounded to 1 decimal, exactly as the slides do (that is how slide 20 gets 26.01, 4.00, ...).
 * 每个点一行：预测值 y、误差 y − t、平方误差。roundY 时先把 y 四舍五入到一位小数，与课件做法相同
 * （第 20 页的 26.01、4.00…… 就是这样得到的）。
 */
export function regressionRows(w, points, { roundY = false } = {}) {
  return points.map((point) => {
    const exactY = predictY(w, point.x);
    const y = roundY ? roundTo(exactY, 1) : exactY;
    const error = y - point.t;
    return { index: point.index, x: point.x, t: point.t, exactY, y, error, squared: error * error };
  });
}

export function summarizeRows(rows) {
  const n = rows.length;
  const sum = rows.reduce((total, row) => total + row.squared, 0);
  return { n, sum, mse: n ? sum / n : NaN };
}

export function meanSquaredError(w, points, options) {
  return summarizeRows(regressionRows(w, points, options)).mse;
}

function isTwoDecimalExact(value) {
  return Math.abs(value - roundTo(value, 2)) < 1e-9 * Math.max(1, Math.abs(value));
}

/**
 * The MSE written out like slide 20:
 * "MSE = [26.01 + 4.00 + 16.81 + 1.96 + 10.24 + 3.24 + 21.16] / 7 = 83.42 / 7 ≈ 11.92".
 * "=" is used only where the printed numbers are exact; otherwise "≈".
 * 按第 20 页的样子写出 MSE 的计算过程。只有打印出的数字完全精确时才用“=”，否则用“≈”。
 */
export function formatMseWork(rows) {
  const { n, sum, mse } = summarizeRows(rows);
  if (!n) return 'MSE = —';
  const termsExact = rows.every((row) => isTwoDecimalExact(row.squared));
  const between = termsExact ? '=' : APPROX;
  const last = isTwoDecimalExact(mse) ? '=' : APPROX;
  const terms = rows.map((row) => formatFixed(row.squared, 2)).join(' + ');
  return `MSE ${between} [${terms}] / ${n} ${between} ${formatFixed(sum, 2)} / ${n} ${last} ${formatFixed(mse, 2)}`;
}

/**
 * True gradient of the MSE: ∂MSE/∂w0 = (2/N) Σ (y − t), ∂MSE/∂w1 = (2/N) Σ (y − t) x.
 * MSE 的真实梯度：∂MSE/∂w0 = (2/N) Σ (y − t)，∂MSE/∂w1 = (2/N) Σ (y − t) x。
 */
export function mseGradient(w, points) {
  const n = points.length;
  if (!n) return { d0: 0, d1: 0 };
  let sum0 = 0;
  let sum1 = 0;
  for (const { x, t } of points) {
    const error = predictY(w, x) - t;
    sum0 += error;
    sum1 += error * x;
  }
  return { d0: (2 / n) * sum0, d1: (2 / n) * sum1 };
}

/**
 * Largest curvature of the MSE surface: the top eigenvalue of its Hessian 2·[[1, mean x], [mean x, mean x²]].
 * Plain gradient descent is stable only for learning rates below 2 / curvature.
 * MSE 曲面的最大曲率，即黑塞矩阵 2·[[1, x 均值], [x 均值, x² 均值]] 的最大特征值；
 * 普通梯度下降只有在学习率小于 2 / 曲率时才稳定。
 */
export function curvatureLimit(points) {
  const n = points.length;
  if (!n) return 0;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanX2 = points.reduce((sum, point) => sum + point.x * point.x, 0) / n;
  return 1 + meanX2 + Math.sqrt((1 - meanX2) ** 2 + 4 * meanX * meanX);
}

/**
 * Learning-rate choices of the form {1, 2, 5} x 10^k, all safely below the stability limit for this
 * data's scale. The default is the largest one at most half the limit, so the line moves smoothly.
 * 形如 {1, 2, 5} x 10^k 的学习率选项，全部安全地低于这组数据尺度下的稳定上限。
 * 默认值取不超过上限一半的最大选项，让直线平稳移动。
 */
export function learningRateOptions(points, count = 4) {
  const curvature = curvatureLimit(points);
  const limit = curvature > 0 ? 2 / curvature : 0.1;
  const ceiling = 0.9 * limit;
  const candidates = [];
  for (let power = -7; power <= 1; power += 1) {
    for (const multiplier of [1, 2, 5]) candidates.push(roundTo(multiplier * 10 ** power, 9));
  }
  const stable = candidates.filter((rate) => rate <= ceiling);
  const options = stable.length ? stable.slice(-count) : [roundTo(ceiling, 12)];
  const defaultRate = [...options].reverse().find((rate) => rate <= 0.5 * limit) ?? options[0];
  return { limit, options, defaultRate };
}

/**
 * One gradient-descent step with the true MSE gradient. The rate is clamped below the stability
 * limit, so every step lowers the MSE.
 * 用真实的 MSE 梯度走一步梯度下降。学习率被限制在稳定上限以下，因此每一步都会降低 MSE。
 */
export function gradientStep(w, points, rate, limit = Infinity) {
  const gradient = mseGradient(w, points);
  const safeRate = Math.max(0, Math.min(rate, 0.95 * limit));
  return {
    next: { w0: w.w0 - safeRate * gradient.d0, w1: w.w1 - safeRate * gradient.d1 },
    gradient,
    rate: safeRate,
  };
}

/** Which way a parameter should move to lower the cost. 参数应该往哪个方向变才能降低代价。 */
export function directionOf(derivative, tolerance = 1e-9) {
  if (derivative > tolerance) return 'decrease';
  if (derivative < -tolerance) return 'increase';
  return 'hold';
}

/**
 * Exact best line (least squares). The slides note linear regression "can be solved exactly";
 * the widget uses it only to know when gradient descent has arrived.
 * 精确的最佳直线（最小二乘）。课件提到线性回归可以精确求解；本组件只用它判断梯度下降是否已到达。
 */
export function leastSquaresFit(points) {
  const n = points.length;
  if (!n) return { w0: 0, w1: 0 };
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanT = points.reduce((sum, point) => sum + point.t, 0) / n;
  let sxx = 0;
  let sxt = 0;
  for (const { x, t } of points) {
    sxx += (x - meanX) ** 2;
    sxt += (x - meanX) * (t - meanT);
  }
  if (sxx <= 1e-12 * Math.max(1, meanX * meanX)) return { w0: meanT, w1: 0 };
  const w1 = sxt / sxx;
  return { w0: meanT - w1 * meanX, w1 };
}

/**
 * "Until the parameters are close to correct" (slide 25): both parameters sit within a tenth of their
 * last printed digit of the best line, so the printed numbers no longer change. When the data leaves
 * the best line ambiguous (all x equal), a vanishing MSE gap also counts.
 * 对应第 25 页“直到参数接近正确”：两个参数与最佳直线的差都小于最后一位显示数字的十分之一，显示的数字不再变化。
 * 当数据无法唯一确定最佳直线（所有 x 相同）时，MSE 差距几乎为 0 也算到达。
 */
export function hasConverged(w, best, { mse, bestMse, digits = { w0: 2, w1: 3 } } = {}) {
  const close = Math.abs(w.w0 - best.w0) <= 0.1 * 10 ** -digits.w0
    && Math.abs(w.w1 - best.w1) <= 0.1 * 10 ** -digits.w1;
  const flat = isFiniteNumber(mse) && isFiniteNumber(bestMse)
    && mse - bestMse <= 1e-10 * (1 + Math.abs(bestMse));
  return close || flat;
}

/**
 * Steps per animation tick while auto-running: the first steps are shown one by one, then the run
 * speeds up through the long, slow approach to the best line.
 * 自动运行时每一帧走的步数：开始时一步一步展示，之后加速走完靠近最佳直线的漫长阶段。
 */
export function autoStepsForTick(tick) {
  return Math.min(512, 2 ** Math.floor(Math.max(0, tick) / 5));
}

/**
 * Slider ranges for w0 (intercept) and w1 (slope), wide enough for the start line, the best line
 * and the data's own scale; w0 shows 2 decimals and w1 3, like slides 26-31 (w0 = 19.00, w1 = −0.800).
 * w0（截距）与 w1（斜率）的滑块范围，覆盖起始直线、最佳直线与数据本身的尺度；
 * w0 显示 2 位小数、w1 显示 3 位，与第 26-31 页一致。
 */
export function regressionSliderSpecs(points, start, best) {
  const xs = points.map((point) => point.x);
  const ts = points.map((point) => point.t);
  const xSpan = xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const tSpan = ts.length ? Math.max(...ts) - Math.min(...ts) : 0;
  const typicalSlope = xSpan > 0 ? tSpan / xSpan : 1;
  const largestT = ts.length ? Math.max(...ts.map(Math.abs)) : 1;
  const slopeLimit = niceCeil(1.6 * Math.max(Math.abs(start.w1), Math.abs(best.w1), typicalSlope, 0.1));
  const interceptLimit = niceCeil(1.5 * Math.max(Math.abs(start.w0), Math.abs(best.w0), largestT, 1));
  const slopeDigits = slopeLimit < 10 ? 3 : slopeLimit < 100 ? 2 : 1;
  const interceptDigits = interceptLimit < 100 ? 2 : interceptLimit < 1000 ? 1 : 0;
  const spec = (limit, digits) => ({
    min: -limit,
    max: limit,
    step: roundTo(10 ** -digits, digits),
    keyStep: roundTo(10 ** (1 - digits), Math.max(0, digits - 1)),
    digits,
  });
  return { w0: spec(interceptLimit, interceptDigits), w1: spec(slopeLimit, slopeDigits) };
}

export function isValidLine(w) {
  return isFiniteNumber(w?.w0) && isFiniteNumber(w?.w1);
}

/** Digits needed to print a learning rate exactly (0.005 -> 3). 精确写出学习率所需的位数。 */
export function rateDigits(rate) {
  return decimalsOf(rate);
}
