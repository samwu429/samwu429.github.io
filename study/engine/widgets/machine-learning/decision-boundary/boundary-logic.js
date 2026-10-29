/**
 * Linear decision boundary w0 + w1x1 + w2x2 = 0 in a 2-D data space (lecture 4 notation). DOM-free.
 * 二维数据空间中的线性决策边界 w0 + w1x1 + w2x2 = 0（沿用第 4 讲记号）；不依赖 DOM。
 *
 * A point is predicted as the positive class when w0 + w1x1 + w2x2 > 0, otherwise as the other class.
 * 当 w0 + w1x1 + w2x2 > 0 时预测为正类（positiveClass），否则预测为另一类。
 */
import {
  MINUS, TIMES, decimalsOf, formatLinear, formatNonZero, formatOperand, formatTrim,
  isFiniteNumber, niceCeil, niceExtent, niceStep, roundTo, toBi, toNumber,
} from '../shared/ml-math.js';

const DEFAULT_X_LABEL = { zh: '特征 x1', en: 'Feature x1' };
const DEFAULT_Y_LABEL = { zh: '特征 x2', en: 'Feature x2' };

/**
 * Reads a content config defensively: missing classes are derived from the points, a missing or
 * unknown positiveClass falls back to the second class, invalid points are dropped.
 * 防御性读取内容配置：缺少 classes 时从数据点推出；positiveClass 缺失或无效时用第二个类别；无效的点被丢弃。
 */
export function normalizeBoundaryConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const rawPoints = Array.isArray(source.points) ? source.points : [];

  const classes = [];
  const seen = new Set();
  const addClass = (id, label) => {
    if (typeof id !== 'string' || !id || seen.has(id)) return;
    seen.add(id);
    classes.push({ id, label: toBi(label, { zh: '', en: id }) });
  };
  for (const item of Array.isArray(source.classes) ? source.classes : []) addClass(item?.id, item?.label);
  for (const point of rawPoints) addClass(point?.class, null);

  const points = [];
  rawPoints.forEach((point) => {
    const x = toNumber(point?.x);
    const y = toNumber(point?.y);
    if (x === null || y === null || !seen.has(point?.class)) return;
    points.push({ index: points.length, x, y, cls: point.class });
  });

  const ids = classes.map((item) => item.id);
  const positive = ids.includes(source.positiveClass) ? source.positiveClass : (ids[1] ?? ids[0] ?? 'positive');
  const negative = ids.find((id) => id !== positive) ?? 'negative';

  return {
    classes,
    points,
    positive,
    negative,
    boundary: normalizeBoundary(source.boundary, points),
    xLabel: toBi(source.xLabel, DEFAULT_X_LABEL),
    yLabel: toBi(source.yLabel, DEFAULT_Y_LABEL),
  };
}

// Without a usable boundary, start with a vertical line through the middle of the data.
// 没有可用的边界时，用一条穿过数据中间的竖线作为起点。
function normalizeBoundary(boundary, points) {
  const w1 = toNumber(boundary?.w1, null);
  const w2 = toNumber(boundary?.w2, null);
  const w0 = toNumber(boundary?.w0, null);
  if (w0 !== null && w1 !== null && w2 !== null) return { w0, w1, w2 };
  const meanX = points.length ? points.reduce((sum, point) => sum + point.x, 0) / points.length : 0;
  return { w0: w0 ?? roundTo(-meanX, 1), w1: w1 ?? 1, w2: w2 ?? 0 };
}

export function boundaryScore(w, x1, x2) {
  return w.w0 + w.w1 * x1 + w.w2 * x2;
}

export function hasBoundaryLine(w) {
  return w.w1 !== 0 || w.w2 !== 0;
}

/** Predicted class of one point: positive when the score is > 0. 单个点的预测类别：得分 > 0 为正类。 */
export function predictClass(w, point, positive, negative) {
  return boundaryScore(w, point.x, point.y) > 0 ? positive : negative;
}

/**
 * Classifies every point and counts the correct predictions.
 * 对每个点分类并统计预测正确的个数。
 */
export function classifyPoints(w, points, positive, negative) {
  const rows = points.map((point) => {
    const score = boundaryScore(w, point.x, point.y);
    const predicted = score > 0 ? positive : negative;
    return { ...point, score, predicted, correct: predicted === point.cls };
  });
  const correct = rows.filter((row) => row.correct).length;
  return { rows, correct, total: rows.length };
}

/**
 * accuracy = correct / total and classification error = 1 - accuracy (lecture 4, slide 46).
 * 准确率 = 正确数 / 总数，分类错误率 = 1 - 准确率（第 4 讲第 46 页）。
 */
export function accuracySummary(correct, total) {
  if (!total) return { correct: 0, wrong: 0, total: 0, accuracy: NaN, error: NaN };
  const accuracy = correct / total;
  return { correct, wrong: total - correct, total, accuracy, error: 1 - accuracy };
}

export function rectPolygon({ xMin, xMax, yMin, yMax }) {
  return [[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]];
}

/**
 * Clips a convex polygon to the half-plane sign * (w0 + w1x1 + w2x2) >= 0 (Sutherland-Hodgman).
 * 将凸多边形裁剪到半平面 sign * (w0 + w1x1 + w2x2) >= 0（Sutherland-Hodgman 算法）。
 */
export function clipToHalfPlane(polygon, w, sign = 1) {
  const value = ([x, y]) => sign * boundaryScore(w, x, y);
  const output = [];
  polygon.forEach((current, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentValue = value(current);
    const previousValue = value(previous);
    if ((currentValue >= 0) !== (previousValue >= 0)) {
      const ratio = previousValue / (previousValue - currentValue);
      output.push([
        previous[0] + ratio * (current[0] - previous[0]),
        previous[1] + ratio * (current[1] - previous[1]),
      ]);
    }
    if (currentValue >= 0) output.push(current);
  });
  return output.length >= 3 ? output : [];
}

/**
 * The visible piece of the line w0 + w1x1 + w2x2 = 0 inside a rectangle, or null.
 * 直线 w0 + w1x1 + w2x2 = 0 在矩形内可见的线段；不相交时返回 null。
 */
export function boundarySegment(w, rect) {
  if (!hasBoundaryLine(w)) return null;
  const hits = [];
  const add = (x, y) => {
    const tolerance = 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
    const inside = x >= rect.xMin - tolerance && x <= rect.xMax + tolerance
      && y >= rect.yMin - tolerance && y <= rect.yMax + tolerance;
    if (inside && !hits.some(([hx, hy]) => Math.abs(hx - x) < 1e-9 && Math.abs(hy - y) < 1e-9)) hits.push([x, y]);
  };
  if (w.w2 !== 0) {
    add(rect.xMin, -(w.w0 + w.w1 * rect.xMin) / w.w2);
    add(rect.xMax, -(w.w0 + w.w1 * rect.xMax) / w.w2);
  }
  if (w.w1 !== 0) {
    add(-(w.w0 + w.w2 * rect.yMin) / w.w1, rect.yMin);
    add(-(w.w0 + w.w2 * rect.yMax) / w.w1, rect.yMax);
  }
  if (hits.length < 2) return null;
  // With a corner hit twice, keep the two points that are farthest apart.
  // 直线恰好经过角点时可能有多个交点，取相距最远的两个。
  let best = [hits[0], hits[1]];
  let bestDistance = -1;
  for (let i = 0; i < hits.length; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      const distance = Math.hypot(hits[i][0] - hits[j][0], hits[i][1] - hits[j][1]);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [hits[i], hits[j]];
      }
    }
  }
  return bestDistance > 0 ? best : null;
}

/**
 * The highest number of points any straight line can classify correctly.
 * 任意一条直线最多能分对多少个点。
 *
 * Any line can be shifted and turned, without changing which side each point is on, until it passes
 * through two data points; so it suffices to test the lines through every pair of points. Points lying
 * on such a line can be sent to either side by a tiny shift, or split into a front and a back group by
 * a tiny turn.
 * 任何直线都可以在不改变各点所在一侧的前提下平移、旋转，直到经过两个数据点；所以只需检查每两点确定的直线。
 * 落在这条线上的点，可以通过微小平移全部归到同一侧，或通过微小旋转分成前后两组。
 */
export function bestLinearSplit(points, positive) {
  const total = points.length;
  const positives = points.filter((point) => point.cls === positive).length;
  let best = Math.max(positives, total - positives);
  const scale = Math.max(1, ...points.map((point) => Math.max(Math.abs(point.x), Math.abs(point.y))));

  for (let i = 0; i < total; i += 1) {
    for (let j = i + 1; j < total; j += 1) {
      const origin = points[i];
      const dx = points[j].x - origin.x;
      const dy = points[j].y - origin.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      let leftCorrect = 0;
      let rightCorrect = 0;
      const onLine = [];
      for (const point of points) {
        const side = (dx * (point.y - origin.y) - dy * (point.x - origin.x)) / length;
        const isPositive = point.cls === positive;
        if (Math.abs(side) <= 1e-9 * scale) {
          onLine.push({ along: (dx * (point.x - origin.x) + dy * (point.y - origin.y)) / length, isPositive });
        } else if ((side > 0) === isPositive) {
          leftCorrect += 1;
        } else {
          rightCorrect += 1;
        }
      }
      const lineBest = bestCollinearSplit(onLine, scale);
      best = Math.max(best, leftCorrect + lineBest, rightCorrect + lineBest);
    }
  }
  return { correct: best, total };
}

// Points on one line can only be split into a front part and a back part (or kept together).
// 同一直线上的点只能分成“前一段”和“后一段”（或不分开）。
function bestCollinearSplit(items, scale) {
  if (!items.length) return 0;
  const sorted = [...items].sort((a, b) => a.along - b.along);
  const groups = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(item.along - last.along) <= 1e-9 * scale) {
      last.positive += item.isPositive ? 1 : 0;
      last.negative += item.isPositive ? 0 : 1;
    } else {
      groups.push({ along: item.along, positive: item.isPositive ? 1 : 0, negative: item.isPositive ? 0 : 1 });
    }
  }
  const totalPositive = groups.reduce((sum, group) => sum + group.positive, 0);
  const totalNegative = groups.reduce((sum, group) => sum + group.negative, 0);
  let best = 0;
  let prefixPositive = 0;
  let prefixNegative = 0;
  for (let split = 0; split <= groups.length; split += 1) {
    if (split > 0) {
      prefixPositive += groups[split - 1].positive;
      prefixNegative += groups[split - 1].negative;
    }
    best = Math.max(
      best,
      prefixPositive + (totalNegative - prefixNegative),
      prefixNegative + (totalPositive - prefixPositive),
    );
  }
  return best;
}

/**
 * Plot extent of the data space; positive features start at 0 like the slides' plots.
 * 数据空间的绘图范围；正数特征从 0 开始，和课件的图一致。
 */
export function boundaryExtent(points) {
  const x = niceExtent(points.map((point) => point.x));
  const y = niceExtent(points.map((point) => point.y));
  return { x, y, rect: { xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max } };
}

/**
 * Slider ranges for w0, w1, w2. The weights get a symmetric range around 0; w0 must be able to push
 * the line across the whole plot.
 * w0、w1、w2 的滑块范围。w1、w2 以 0 为中心对称；w0 要能把直线推过整个图。
 */
export function boundarySliderSpecs(boundary, rect) {
  const weightLimit = niceCeil(Math.max(1, 2 * Math.abs(boundary.w1), 2 * Math.abs(boundary.w2)));
  const reachX = Math.max(Math.abs(rect.xMin), Math.abs(rect.xMax));
  const reachY = Math.max(Math.abs(rect.yMin), Math.abs(rect.yMax));
  const biasLimit = niceCeil(Math.max(1, 1.5 * Math.abs(boundary.w0), (weightLimit * (reachX + reachY)) / 2));
  const weightStep = niceStep(2 * weightLimit, 80);
  const biasStep = niceStep(2 * biasLimit, 160);
  const spec = (limit, step, value) => ({
    min: -limit,
    max: limit,
    step,
    keyStep: step,
    digits: Math.min(3, Math.max(decimalsOf(step), decimalsOf(value, 3))),
  });
  return {
    w0: spec(biasLimit, biasStep, boundary.w0),
    w1: spec(weightLimit, weightStep, boundary.w1),
    w2: spec(weightLimit, weightStep, boundary.w2),
  };
}

/** "−12 + x1 + 0.3x2 = 0", written like slide 44. 按第 44 页的写法输出边界方程。 */
export function formatBoundaryEquation(w, digits = { w0: 2, w1: 2, w2: 2 }) {
  const left = formatLinear([
    { coef: w.w0, symbol: '', digits: digits.w0 },
    { coef: w.w1, symbol: 'x1', digits: digits.w1 },
    { coef: w.w2, symbol: 'x2', digits: digits.w2 },
  ]);
  return `${left} = 0`;
}

/**
 * Written working for one point: "−12 + 1 × 10 + 0.3 × 18 = 3.4".
 * 单个点的代入算式：“−12 + 1 × 10 + 0.3 × 18 = 3.4”。
 */
export function formatScoreWork(w, point, digits = { w0: 2, w1: 2, w2: 2 }) {
  const first = formatTrim(w.w0, digits.w0);
  const term = (coef, value, coefDigits) => {
    const sign = roundTo(coef, coefDigits) < 0 ? ` ${MINUS} ` : ' + ';
    return `${sign}${formatTrim(Math.abs(coef), coefDigits)} ${TIMES} ${formatOperand(value, 4)}`;
  };
  const score = boundaryScore(w, point.x, point.y);
  return `${first}${term(w.w1, point.x, digits.w1)}${term(w.w2, point.y, digits.w2)} = ${formatNonZero(score, 2)}`;
}

/** Feature vector as on slide 32, without the class: "[10, 18]". 特征向量写法（不含类别）。 */
export function formatFeatureVector(point) {
  return `[${formatTrim(point.x, 4)}, ${formatTrim(point.y, 4)}]`;
}

/** Unreduced fraction, matching the slides ("6/7", "1/7"). 不约分的分数，与课件写法一致。 */
export function formatFraction(part, total) {
  return `${part}/${total}`;
}

export function isValidWeights(w) {
  return isFiniteNumber(w?.w0) && isFiniteNumber(w?.w1) && isFiniteNumber(w?.w2);
}
