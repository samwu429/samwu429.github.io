/**
 * Geometry for the linear-separability demo: four corner points, one straight line, and checks
 * for whether the line puts the two classes on opposite sides. DOM-free.
 * 线性可分演示的几何逻辑：四个角上的点、一条直线，以及判断这条线能否把两类点分到两边。不依赖 DOM。
 *
 * A line is { angle, offset }: angle is the direction of the line in degrees (0 <= angle < 180) and
 * offset is its signed distance from the centre of the unit square along the normal n = (sin, -cos).
 * 直线用 { angle, offset } 表示：angle 是直线方向（度，0 到 180），offset 是它沿法向量 n = (sin, -cos)
 * 离单位正方形中心的有向距离。
 */

export const DATASET_NAMES = ['and', 'or', 'xor'];

export const CENTER = Object.freeze({ x1: 0.5, x2: 0.5 });

// Visible part of the data space. 数据空间中可见的范围。
export const VIEW_BOX = Object.freeze({ min: -0.5, max: 1.5 });

const CORNERS = [[0, 0], [0, 1], [1, 0], [1, 1]];
const LABELS = { and: [0, 0, 0, 1], or: [0, 1, 1, 1], xor: [0, 1, 1, 0] };
const ON_LINE = 1e-6;

export function datasetPoints(name) {
  const labels = LABELS[name] || LABELS.and;
  return CORNERS.map(([x1, x2], index) => ({ x1, x2, label: labels[index] }));
}

export function normalizeAngle(angle) {
  const value = ((angle % 180) + 180) % 180;
  return value >= 180 - 1e-9 ? 0 : value;
}

export function lineNormal(angle) {
  const radians = (angle * Math.PI) / 180;
  return { x1: Math.sin(radians), x2: -Math.cos(radians) };
}

export function lineDirection(angle) {
  const radians = (angle * Math.PI) / 180;
  return { x1: Math.cos(radians), x2: Math.sin(radians) };
}

/**
 * Positive on one side of the line, negative on the other, 0 on the line itself.
 * 在直线一侧为正、另一侧为负、线上为 0。
 */
export function signedDistance(line, point) {
  const normal = lineNormal(line.angle);
  return normal.x1 * (point.x1 - CENTER.x1) + normal.x2 * (point.x2 - CENTER.x2) - line.offset;
}

export function sideOf(line, point) {
  const distance = signedDistance(line, point);
  return Math.abs(distance) < ON_LINE ? 0 : Math.sign(distance);
}

/**
 * The line through two points, or null when the points (almost) coincide.
 * 经过两点的直线；两点几乎重合时返回 null。
 */
export function lineThroughPoints(a, b) {
  const dx = b.x1 - a.x1;
  const dy = b.x2 - a.x2;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  const angle = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI);
  return { angle, offset: signedDistance({ angle, offset: 0 }, a) };
}

/**
 * Checks one line against labelled points. Class 1 may sit on either side, so both orientations are
 * tried and the one with fewer mistakes is reported. A point exactly on the line counts as a mistake.
 * 用一条直线检查带标签的点。类别 1 可以在任意一侧，所以两种朝向都试，报告错误更少的那种。点正好在线上算错。
 */
export function evaluateLine(points, line) {
  const sides = points.map((point) => sideOf(line, point));
  let best = null;
  for (const oneSide of [1, -1]) {
    const wrongIndices = [];
    points.forEach((point, index) => {
      const expected = point.label === 1 ? oneSide : -oneSide;
      if (sides[index] !== expected) wrongIndices.push(index);
    });
    if (!best || wrongIndices.length < best.wrongIndices.length) best = { oneSide, wrongIndices };
  }
  return {
    sides,
    oneSide: best.oneSide,
    wrongIndices: best.wrongIndices,
    wrongCount: best.wrongIndices.length,
    separated: best.wrongIndices.length === 0,
  };
}

// Smallest distance from the line to any point: a wider gap is a "safer" line. 直线到最近点的距离，越大越“稳”。
export function lineMargin(points, line) {
  return Math.min(...points.map((point) => Math.abs(signedDistance(line, point))));
}

/**
 * Brute-force search over many lines (every angle step and offset step). For XOR no line works,
 * which is the point of the demo.
 * 暴力搜索大量直线（每个角度步长与偏移步长）。对 XOR 一条都找不到，这正是演示要说明的。
 */
export function searchLines(points, { angleStep = 1, offsetStep = 0.05, maxOffset = 1 } = {}) {
  const steps = Math.round(maxOffset / offsetStep);
  let tried = 0;
  let workingCount = 0;
  let fewestWrong = Infinity;
  let best = null;
  for (let angleIndex = 0; angleIndex * angleStep < 180; angleIndex += 1) {
    const angle = angleIndex * angleStep;
    for (let offsetIndex = -steps; offsetIndex <= steps; offsetIndex += 1) {
      const line = { angle, offset: Math.round(offsetIndex * offsetStep * 1e6) / 1e6 };
      const result = evaluateLine(points, line);
      tried += 1;
      fewestWrong = Math.min(fewestWrong, result.wrongCount);
      if (!result.separated) continue;
      workingCount += 1;
      const margin = lineMargin(points, line);
      if (!best || margin > best.margin + 1e-12) best = { ...line, margin };
    }
  }
  return { tried, workingCount, fewestWrong, best };
}

function inside(value, box) {
  return value >= box.min - 1e-9 && value <= box.max + 1e-9;
}

/**
 * The part of the infinite line that lies inside the square view box, or null if it misses the box.
 * 无限长直线落在正方形视图框内的那一段；与视图框不相交时返回 null。
 */
export function clipLineToBox(line, box = VIEW_BOX) {
  const normal = lineNormal(line.angle);
  const direction = lineDirection(line.angle);
  const foot = { x1: CENTER.x1 + normal.x1 * line.offset, x2: CENTER.x2 + normal.x2 * line.offset };
  let low = -Infinity;
  let high = Infinity;
  for (const axis of ['x1', 'x2']) {
    if (Math.abs(direction[axis]) < 1e-12) {
      if (!inside(foot[axis], box)) return null;
      continue;
    }
    const a = (box.min - foot[axis]) / direction[axis];
    const b = (box.max - foot[axis]) / direction[axis];
    low = Math.max(low, Math.min(a, b));
    high = Math.min(high, Math.max(a, b));
  }
  if (!(high - low > 1e-9)) return null;
  const at = (t) => ({ x1: foot.x1 + direction.x1 * t, x2: foot.x2 + direction.x2 * t });
  return [at(low), at(high)];
}

/**
 * Two drag handles on the visible part of the line, at 20% and 80% of the segment.
 * 直线可见部分上的两个拖动手柄，分别位于线段的 20% 与 80% 处。
 */
export function handlePoints(line, box = VIEW_BOX) {
  const segment = clipLineToBox(line, box);
  if (!segment) return null;
  const [p, q] = segment;
  const lerp = (t) => ({ x1: p.x1 + (q.x1 - p.x1) * t, x2: p.x2 + (q.x2 - p.x2) * t });
  return [lerp(0.2), lerp(0.8)];
}

export function clampToBox(point, box = VIEW_BOX) {
  return {
    x1: Math.min(box.max, Math.max(box.min, point.x1)),
    x2: Math.min(box.max, Math.max(box.min, point.x2)),
  };
}

export function boxPolygon(box = VIEW_BOX) {
  return [
    { x1: box.min, x2: box.min },
    { x1: box.max, x2: box.min },
    { x1: box.max, x2: box.max },
    { x1: box.min, x2: box.max },
  ];
}

/**
 * Keeps the part of a convex polygon where keep * signedDistance >= 0 (Sutherland-Hodgman, one edge).
 * 保留凸多边形中 keep * 有向距离 >= 0 的部分（Sutherland-Hodgman 算法的单边裁剪）。
 */
export function clipPolygon(polygon, line, keep = 1) {
  const result = [];
  const value = (point) => keep * signedDistance(line, point);
  polygon.forEach((current, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const a = value(current);
    const b = value(next);
    if (a >= 0) result.push(current);
    if ((a >= 0) !== (b >= 0)) {
      const t = a / (a - b);
      result.push({ x1: current.x1 + (next.x1 - current.x1) * t, x2: current.x2 + (next.x2 - current.x2) * t });
    }
  });
  return result;
}

export function polygonArea(polygon) {
  let twice = 0;
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    twice += point.x1 * next.x2 - next.x1 * point.x2;
  });
  return Math.abs(twice) / 2;
}

// Distance from the centre to x1 + x2 = 0.5 (and to x1 + x2 = 1.5). 中心到 x1 + x2 = 0.5（以及 1.5）的距离。
const BAND_OFFSET = Math.SQRT1_2 / 2;

/**
 * A hidden-layer answer for XOR: two hidden neurons draw two parallel lines (x1 + x2 = 0.5 and
 * x1 + x2 = 1.5) and the output neuron says 1 only between them. One possible design, not from the slides.
 * XOR 的一种隐藏层解法：两个隐藏神经元各画一条平行线（x1 + x2 = 0.5 与 x1 + x2 = 1.5），输出神经元只在两线之间输出 1。
 * 这只是其中一种设计，并非课件内容。
 */
export const HIDDEN_LAYER_LINES = Object.freeze([
  Object.freeze({ angle: 135, offset: -BAND_OFFSET }),
  Object.freeze({ angle: 135, offset: BAND_OFFSET }),
]);

export function bandContains(point, lines = HIDDEN_LAYER_LINES) {
  return signedDistance(lines[0], point) > 0 && signedDistance(lines[1], point) < 0;
}

export function bandPolygon(lines = HIDDEN_LAYER_LINES, box = VIEW_BOX) {
  return clipPolygon(clipPolygon(boxPolygon(box), lines[0], 1), lines[1], -1);
}
