import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arcPoints,
  axesPathData,
  boxCorners,
  cosDeg,
  forwardPoint,
  gridPathData,
  niceStep,
  normalizeDegrees,
  partialPoints,
  pathLength,
  pointAlong,
  pointsPathData,
  roundCoord,
  shortestTurn,
  sinDeg,
  svgNumber,
  traceBounds,
  viewFor,
} from '../../../engine/widgets/programming/turtle-sandbox/turtle-geometry.js';

const close = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('sine and cosine are exact at multiples of 90 degrees, including negative and large angles', () => {
  assert.deepEqual([0, 90, 180, 270, 360, -90, 450].map(sinDeg), [0, 1, 0, -1, 0, -1, 1]);
  assert.deepEqual([0, 90, 180, 270, 360, -90, 540].map(cosDeg), [1, 0, -1, 0, 1, 0, -1]);
  close(sinDeg(30), 0.5);
  assert.equal(normalizeDegrees(-90), 270);
  assert.equal(normalizeDegrees(720), 0);
});

test('heading 0 points up and positive headings turn clockwise', () => {
  assert.deepEqual(forwardPoint({ x: 0, y: 0, heading: 0 }, 100), [0, 100]);
  assert.deepEqual(forwardPoint({ x: 0, y: 0, heading: 90 }, 100), [100, 0]);
  assert.deepEqual(forwardPoint({ x: 0, y: 0, heading: 270 }, 50), [-50, 0]);
  assert.deepEqual(forwardPoint({ x: 10, y: 10, heading: 0 }, -10), [10, 0]);
});

test('four forward-and-turn moves close the square exactly at the start', () => {
  let pose = { x: 0, y: 0, heading: 0 };
  for (let side = 0; side < 4; side += 1) {
    const [x, y] = forwardPoint(pose, 100);
    pose = { x, y, heading: pose.heading + 90 };
  }
  assert.deepEqual([pose.x, pose.y], [0, 0]);
  assert.equal(roundCoord(0.1 + 0.2), 0.3);
  assert.ok(Object.is(roundCoord(-0), 0));
});

test('rt 180, 25 draws the robot smile of Lecture 2 p.10', () => {
  const points = arcPoints({ x: 125, y: 37.5, heading: 180 }, 180, 25);
  assert.deepEqual(points[0], [125, 37.5]);
  assert.deepEqual(points[points.length - 1], [75, 37.5]);
  const middle = points[(points.length - 1) / 2];
  assert.deepEqual(middle, [100, 12.5]);
  assert.equal(points.length, 37);
});

test('left arcs curve to the left and right arcs to the right', () => {
  const left = arcPoints({ x: 0, y: 0, heading: 0 }, -90, 100);
  assert.deepEqual(left[left.length - 1], [-100, 100]);
  const right = arcPoints({ x: 0, y: 0, heading: 0 }, 90, 100);
  assert.deepEqual(right[right.length - 1], [100, 100]);
});

test('very large turns draw one full circle plus the remainder, in steps of at most 5 degrees', () => {
  const start = { x: 0, y: 0, heading: 0 };
  const laps = arcPoints(start, 36000, 10);
  assert.equal(laps.length, 73, '100 laps draw the circle once');
  assert.deepEqual(laps[laps.length - 1], [0, 0]);
  const huge = arcPoints(start, 100000, 20);
  const remainder = arcPoints(start, 100000 % 360, 20);
  assert.deepEqual(huge[huge.length - 1], remainder[remainder.length - 1], 'the end point matches the remaining 280 degrees');
  // Every chord spans at most 5 degrees: 2 r sin(2.5 degrees).
  // 每一段弦最多对应 5 度：2 r sin(2.5 度)。
  const longest = Math.max(...huge.slice(1).map(([x, y], index) => Math.hypot(x - huge[index][0], y - huge[index][1])));
  assert.ok(longest <= 2 * 20 * Math.sin((2.5 * Math.PI) / 180) + 1e-9, String(longest));
  const left = arcPoints(start, -720, 10);
  assert.deepEqual(left[left.length - 1], [0, 0]);
  assert.ok(left[1][0] < 0, 'a left turn still curves to the left');
});

test('a box is centred on the turtle (the robot eye covers x 25-50, y 50-75)', () => {
  const corners = boxCorners({ x: 37.5, y: 62.5, heading: 90 }, 25);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [25, 50, 50, 75]);
});

test('shortestTurn picks the smaller way round', () => {
  assert.equal(shortestTurn(0, 90), 90);
  assert.equal(shortestTurn(0, 270), -90);
  assert.equal(shortestTurn(720, 90), 90);
  assert.equal(shortestTurn(90, 90), 0);
});

test('traceBounds covers start, positions, paths, shapes and dots', () => {
  const steps = [
    { after: { x: 0, y: 100 }, path: [[0, 0], [0, 100]], draw: null },
    { after: { x: 0, y: 100 }, path: null, draw: { type: 'box', points: [[-10, 90], [10, 90], [10, 110], [-10, 110]] } },
    { after: { x: 0, y: 100 }, path: null, draw: { type: 'dot', cx: 50, cy: -20, r: 5 } },
  ];
  assert.deepEqual(traceBounds(steps, { x: 0, y: 0 }), { minX: -10, maxX: 55, minY: -25, maxY: 110 });
  assert.deepEqual(traceBounds([], { x: 3, y: 4 }), { minX: 3, maxX: 3, minY: 4, maxY: 4 });
});

test('viewFor returns a padded square that contains the drawing, in SVG coordinates', () => {
  const view = viewFor({ minX: 0, maxX: 200, minY: 0, maxY: 100 });
  assert.equal(view.width, view.height);
  assert.ok(view.width > 240);
  assert.ok(view.x < 0 && view.x + view.width > 200);
  assert.ok(view.y < -100 && view.y + view.height > 0, 'world y is flipped');
  const tiny = viewFor({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  assert.ok(tiny.width >= 240);
  close(tiny.x + tiny.width / 2, 0);
});

test('niceStep rounds up to 1, 2 or 5 times a power of ten', () => {
  assert.equal(niceStep(37.5), 50);
  assert.equal(niceStep(12), 20);
  assert.equal(niceStep(100), 100);
  assert.equal(niceStep(0.3), 0.5);
  assert.equal(niceStep(0), 1);
  assert.equal(niceStep(Number.NaN), 1);
});

test('grid and axes path data are well formed', () => {
  const view = { x: -50, y: -150, width: 200, height: 200 };
  const grid = gridPathData(view, 50);
  assert.match(grid, /^M/);
  assert.ok(grid.includes('M0 '), 'grid passes through x = 0');
  assert.equal(axesPathData(view), 'M-250 0H350M0 -350V250');
  assert.equal(svgNumber(1.005), '1');
  assert.equal(svgNumber(-0.001), '0');
  assert.equal(pointsPathData([[0, 0], [100, 50]]), 'M0 0L100 -50');
});

test('partialPoints and pointAlong interpolate by length, across corners', () => {
  const path = [[0, 0], [100, 0], [100, 100]];
  assert.equal(pathLength(path), 200);
  assert.deepEqual(pointAlong(path, 0.25), [50, 0]);
  assert.deepEqual(pointAlong(path, 0.75), [100, 50]);
  assert.deepEqual(partialPoints(path, 0.75), [[0, 0], [100, 0], [100, 50]]);
  assert.deepEqual(pointAlong(path, 1), [100, 100]);
  assert.deepEqual(partialPoints(path, 0), [[0, 0], [0, 0]]);
  assert.deepEqual(partialPoints([], 0.5), []);
  assert.deepEqual(pointAlong([[5, 5], [5, 5]], 0.5), [5, 5]);
});
