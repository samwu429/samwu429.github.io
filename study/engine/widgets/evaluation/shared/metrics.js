/**
 * Metrics of a binary classifier in the course layout: PREDICTED rows x ACTUAL columns,
 * TP top-left, FP top-right, FN bottom-left, TN bottom-right (lec06 p.30).
 * 课程布局下的二分类指标：行 = 预测（PREDICTED），列 = 实际（ACTUAL），
 * TP 左上、FP 右上、FN 左下、TN 右下（lec06 第 30 页）。
 *
 * Every ratio is returned as { numerator, denominator, value }. `value` is null when the
 * denominator is 0, so a view can explain the division by zero instead of printing NaN.
 * 每个比例都返回 { numerator, denominator, value }；分母为 0 时 value 为 null，
 * 视图据此解释“分母为 0”，而不是显示 NaN。
 *
 * DOM-free so it can be unit-tested with node --test.
 * 不依赖 DOM，可直接用 node --test 测试。
 */

export const CELL_KEYS = Object.freeze(['tp', 'fp', 'fn', 'tn']);

// Upper bound keeps the grid readable and the arithmetic exact.
// 设上限让表格保持可读，同时保证整数运算精确。
export const MAX_COUNT = 99999;

/**
 * Turns any input (number, numeric string, junk) into a whole count in [0, MAX_COUNT].
 * 把任意输入（数字、数字字符串、无效值）转换为 [0, MAX_COUNT] 内的整数计数。
 */
export function sanitizeCount(value) {
  const number = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(MAX_COUNT, Math.floor(number));
}

export function normalizeCounts(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    tp: sanitizeCount(source.tp),
    fp: sanitizeCount(source.fp),
    fn: sanitizeCount(source.fn),
    tn: sanitizeCount(source.tn),
  };
}

export function countsEqual(a, b) {
  if (!a || !b) return false;
  return CELL_KEYS.every((key) => a[key] === b[key]);
}

export function totalOf(counts) {
  return counts.tp + counts.fp + counts.fn + counts.tn;
}

export function ratio(numerator, denominator) {
  return { numerator, denominator, value: denominator > 0 ? numerator / denominator : null };
}

/** Accuracy = (TP + TN) / (TP + TN + FP + FN), the share of all examples predicted correctly. 准确率：所有样本中预测正确的比例。 */
export function accuracy(counts) {
  return ratio(counts.tp + counts.tn, totalOf(counts));
}

/** Precision = TP / (TP + FP); also the quantity compared by predictive parity. 预测均等比较的也是它。 */
export function precision(counts) {
  return ratio(counts.tp, counts.tp + counts.fp);
}

/** Recall = true positive rate = TP / (TP + FN). 召回率 = 真阳性率。 */
export function recall(counts) {
  return ratio(counts.tp, counts.tp + counts.fn);
}

export const truePositiveRate = recall;

/** False positive rate = FP / (FP + TN), used by equalized odds. 均等几率使用的假阳性率。 */
export function falsePositiveRate(counts) {
  return ratio(counts.fp, counts.fp + counts.tn);
}

/** Selection rate = (TP + FP) / total: share predicted positive (demographic parity). 被预测为正的比例（人口统计均等）。 */
export function selectionRate(counts) {
  return ratio(counts.tp + counts.fp, totalOf(counts));
}

/** Share of examples that are actually positive = (TP + FN) / total. 实际为正的比例。 */
export function actualPositiveRate(counts) {
  return ratio(counts.tp + counts.fn, totalOf(counts));
}

/**
 * F1 = 2(Precision)(Recall) / (Precision + Recall), following the slide formula literally.
 * F1 按课件公式计算。
 *
 * `reason` says why F1 is undefined: 'precision' or 'recall' (that ratio divides by 0),
 * or 'zero-sum' (Precision + Recall = 0). It is null when F1 has a value.
 * `reason` 说明 F1 无法计算的原因：'precision' / 'recall'（该比例分母为 0），
 * 或 'zero-sum'（Precision + Recall = 0）；有值时为 null。
 */
export function f1Score(counts) {
  const p = precision(counts);
  const r = recall(counts);
  let reason = null;
  if (p.value === null) reason = 'precision';
  else if (r.value === null) reason = 'recall';
  else if (p.value + r.value === 0) reason = 'zero-sum';
  const value = reason ? null : (2 * p.value * r.value) / (p.value + r.value);
  return { precision: p, recall: r, value, reason };
}

export function summarize(counts) {
  return {
    total: totalOf(counts),
    accuracy: accuracy(counts),
    precision: precision(counts),
    recall: recall(counts),
    f1: f1Score(counts),
    falsePositiveRate: falsePositiveRate(counts),
    selectionRate: selectionRate(counts),
    actualPositiveRate: actualPositiveRate(counts),
  };
}

/**
 * Which cells feed the numerator and the denominator of each metric, for highlighting.
 * 每个指标的分子、分母分别用到哪些格子，用于在表格中标出。
 * F1 lists every cell it depends on as denominator cells: it never uses TN.
 * F1 把用到的格子都列为分母格：它从不使用 TN。
 */
export const METRIC_CELLS = Object.freeze({
  accuracy: { numerator: ['tp', 'tn'], denominator: ['tp', 'fp', 'fn', 'tn'] },
  precision: { numerator: ['tp'], denominator: ['tp', 'fp'] },
  recall: { numerator: ['tp'], denominator: ['tp', 'fn'] },
  f1: { numerator: [], denominator: ['tp', 'fp', 'fn'] },
  falsePositiveRate: { numerator: ['fp'], denominator: ['fp', 'tn'] },
  selectionRate: { numerator: ['tp', 'fp'], denominator: ['tp', 'fp', 'fn', 'tn'] },
  actualPositiveRate: { numerator: ['tp', 'fn'], denominator: ['tp', 'fp', 'fn', 'tn'] },
});
