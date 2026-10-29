/**
 * Turtle geometry and drawing-stage maths without any DOM: headings, arcs, boxes, bounds, grid, interpolation.
 * 海龟几何与画布计算（不涉及 DOM）：朝向、圆弧、方块、边界、网格与插值。
 *
 * World coordinates follow PencilCode: x to the right, y up, heading 0 = up, positive turns are clockwise.
 * SVG has y pointing down, so a world point (x, y) is drawn at (x, -y).
 * 世界坐标沿用 PencilCode：x 向右、y 向上，朝向 0 为向上，正角度为顺时针（右转）。SVG 的 y 向下，所以世界点 (x, y) 画在 (x, -y)。
 */

const PRECISION = 1e9;

export function roundCoord(value) {
  const rounded = Math.round(value * PRECISION) / PRECISION;
  return rounded === 0 ? 0 : rounded;
}

export function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

// Exact values at multiples of 90 degrees, so a square closes exactly where it started.
// 在 90 度的整数倍上取精确值，保证正方形精确回到起点。
export function sinDeg(degrees) {
  const d = normalizeDegrees(degrees);
  if (d === 0 || d === 180) return 0;
  if (d === 90) return 1;
  if (d === 270) return -1;
  return Math.sin((d * Math.PI) / 180);
}

export function cosDeg(degrees) {
  const d = normalizeDegrees(degrees);
  if (d === 90 || d === 270) return 0;
  if (d === 0) return 1;
  if (d === 180) return -1;
  return Math.cos((d * Math.PI) / 180);
}

/** Point `distance` units ahead of the turtle (negative = behind). 海龟前方 distance 处的点（负数为后方）。 */
export function forwardPoint(pose, distance) {
  return [
    roundCoord(pose.x + distance * sinDeg(pose.heading)),
    roundCoord(pose.y + distance * cosDeg(pose.heading)),
  ];
}

/**
 * Points of an arc: the turtle turns by `turn` degrees (positive = right) while moving along a circle
 * of the given radius. The centre lies `radius` units to the right for right turns and to the left for left turns,
 * so `rt 180, 25` draws the U-shaped smile of the Lecture 2 robot face.
 * 圆弧上的点：海龟沿半径为 radius 的圆一边走一边转 turn 度（正数为右转）。右转时圆心在右侧，左转时在左侧，
 * 所以 `rt 180, 25` 会画出 Lecture 2 机器人脸上 U 形的笑脸。
 */
export function arcPoints(pose, turn, radius, { stepDegrees = 5, maxSegments = 720 } = {}) {
  const side = turn >= 0 ? 1 : -1;
  const centerX = pose.x + side * radius * cosDeg(pose.heading);
  const centerY = pose.y - side * radius * sinDeg(pose.heading);
  const vx = pose.x - centerX;
  const vy = pose.y - centerY;
  // Laps after the first retrace the same circle, so at most one lap plus the rest of the turn is drawn.
  // The end point is unchanged and every segment stays within `stepDegrees`, however large the turn.
  // 第一圈之后的圈都沿着同一个圆重画，所以最多画一整圈再加上剩下的角度：终点不变，而且无论转多少度，每一小段都不超过 stepDegrees。
  const drawn = Math.abs(turn) > 360 ? side * (360 + (Math.abs(turn) % 360)) : turn;
  const segments = Math.min(maxSegments, Math.max(2, Math.ceil(Math.abs(drawn) / stepDegrees)));
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (drawn * index) / segments;
    const c = cosDeg(angle);
    const s = sinDeg(angle);
    // Clockwise rotation in a y-up frame: (x, y) -> (x cos a + y sin a, -x sin a + y cos a).
    // y 向上坐标系中的顺时针旋转公式。
    points.push([roundCoord(centerX + vx * c + vy * s), roundCoord(centerY - vx * s + vy * c)]);
  }
  return points;
}

/**
 * Corners of a filled square of side `size` centred on the turtle and turned with it.
 * 以海龟为中心、边长为 size、随海龟方向旋转的实心方块的四个角。
 */
export function boxCorners(pose, size) {
  const half = size / 2;
  const fx = sinDeg(pose.heading) * half;
  const fy = cosDeg(pose.heading) * half;
  const rx = cosDeg(pose.heading) * half;
  const ry = -sinDeg(pose.heading) * half;
  return [
    [pose.x + fx + rx, pose.y + fy + ry],
    [pose.x - fx + rx, pose.y - fy + ry],
    [pose.x - fx - rx, pose.y - fy - ry],
    [pose.x + fx - rx, pose.y + fy - ry],
  ].map(([x, y]) => [roundCoord(x), roundCoord(y)]);
}

/** Smallest signed turn (-180..180] from one heading to another. 从一个朝向转到另一个朝向的最小有向角。 */
export function shortestTurn(from, to) {
  const delta = normalizeDegrees(to - from);
  return delta > 180 ? delta - 360 : delta;
}

/**
 * Bounding box (world units) of everything a trace visits or draws, starting from the initial pose.
 * 轨迹经过或画出的所有内容的外接矩形（世界坐标），包含起始位置。
 */
export function traceBounds(steps, initial = { x: 0, y: 0 }) {
  const box = { minX: initial.x, maxX: initial.x, minY: initial.y, maxY: initial.y };
  const add = (x, y) => {
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
  };
  for (const step of steps) {
    add(step.after.x, step.after.y);
    if (step.path) step.path.forEach(([x, y]) => add(x, y));
    const draw = step.draw;
    if (!draw) continue;
    if (draw.type === 'dot') {
      add(draw.cx - draw.r, draw.cy - draw.r);
      add(draw.cx + draw.r, draw.cy + draw.r);
    } else {
      draw.points.forEach(([x, y]) => add(x, y));
    }
  }
  return box;
}

/**
 * Square SVG view box around the bounds, with padding and a minimum size so tiny drawings are not blown up.
 * Returned in SVG coordinates (y down); `span` is the side length.
 * 包住边界的正方形 SVG 视口，带留白与最小尺寸，避免小图被放得过大。返回 SVG 坐标（y 向下），span 为边长。
 */
export function viewFor(bounds, { minSpan = 240, padRatio = 0.14, minPad = 24 } = {}) {
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, minSpan);
  const size = span + 2 * Math.max(minPad, span * padRatio);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return { x: centerX - size / 2, y: -centerY - size / 2, width: size, height: size, span: size };
}

/** Smallest "nice" grid step (1, 2 or 5 times a power of ten) that is at least `raw`. 不小于 raw 的“整齐”网格间距。 */
export function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const multiple of [1, 2, 5, 10]) {
    if (multiple * power >= raw * (1 - 1e-12)) return multiple * power;
  }
  return 10 * power;
}

/** Formats an SVG number with at most two decimals. 把数字格式化为最多两位小数的 SVG 数值。 */
export function svgNumber(value) {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded === 0 ? 0 : rounded);
}

// The grid covers three view widths in each direction, so letterboxed space is gridded too.
// 网格向四周各覆盖三倍视口，即使画布留边也铺满网格。
function gridExtent(view) {
  return {
    left: view.x - view.width,
    right: view.x + 2 * view.width,
    top: view.y - view.height,
    bottom: view.y + 2 * view.height,
  };
}

/** SVG path data of grid lines every `step` units (axes included). 每隔 step 一条的网格线路径数据。 */
export function gridPathData(view, step) {
  const { left, right, top, bottom } = gridExtent(view);
  const parts = [];
  for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
    parts.push(`M${svgNumber(x)} ${svgNumber(top)}V${svgNumber(bottom)}`);
  }
  for (let y = Math.ceil(top / step) * step; y <= bottom; y += step) {
    parts.push(`M${svgNumber(left)} ${svgNumber(y)}H${svgNumber(right)}`);
  }
  return parts.join('');
}

/** SVG path data of the x and y axes through the origin. 经过原点的 x 轴与 y 轴路径数据。 */
export function axesPathData(view) {
  const { left, right, top, bottom } = gridExtent(view);
  return `M${svgNumber(left)} 0H${svgNumber(right)}M0 ${svgNumber(top)}V${svgNumber(bottom)}`;
}

/** SVG path data ("M x y L x y ...") of world points; y is flipped. 世界坐标点的 SVG 路径数据（y 取反）。 */
export function pointsPathData(points) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'}${svgNumber(x)} ${svgNumber(-y)}`).join('');
}

export function pathLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return total;
}

/**
 * The part of a polyline from its start to `fraction` (0..1) of its length, ending at the interpolated point.
 * 折线从起点到其长度 fraction（0..1）处的部分，终点为插值得到的点。
 */
export function partialPoints(points, fraction) {
  if (!points || !points.length) return [];
  if (fraction >= 1) return points.slice();
  const total = pathLength(points);
  if (fraction <= 0 || total === 0) return [points[0], points[0]];
  let remaining = total * fraction;
  const result = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    const segment = Math.hypot(x1 - x0, y1 - y0);
    if (remaining <= segment) {
      const t = segment ? remaining / segment : 0;
      result.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      return result;
    }
    result.push(points[index]);
    remaining -= segment;
  }
  return result;
}

/** The point at `fraction` (0..1) of a polyline's length. 折线长度 fraction 处的点。 */
export function pointAlong(points, fraction) {
  const part = partialPoints(points, fraction);
  return part.length ? part[part.length - 1] : null;
}
