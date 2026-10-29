import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accuracySummary, bestLinearSplit, boundaryExtent, boundarySegment, boundarySliderSpecs, classifyPoints,
  clipToHalfPlane, formatBoundaryEquation, formatFeatureVector, formatScoreWork, normalizeBoundaryConfig, rectPolygon,
} from '../../../engine/widgets/machine-learning/decision-boundary/boundary-logic.js';

// The seven leaves of lecture 4 (slides 43-47) as configured in the lecture 5 lesson.
// 第 4 讲（第 43-47 页）的 7 片叶子，与第 5 讲课程里的配置相同。
const LEAVES = {
  xLabel: { zh: '叶子宽度 x1（cm）', en: 'Leaf Width x1 (cm)' },
  yLabel: { zh: '叶子高度 x2（cm）', en: 'Leaf Height x2 (cm)' },
  classes: [
    { id: 'oak', label: { zh: 'O：橡树（oak）', en: 'O (oak)' } },
    { id: 'maple', label: { zh: 'M：枫树（maple）', en: 'M (maple)' } },
  ],
  points: [
    { x: 5, y: 10, class: 'oak' },
    { x: 7, y: 12, class: 'oak' },
    { x: 9, y: 6, class: 'oak' },
    { x: 10, y: 18, class: 'oak' },
    { x: 9, y: 14, class: 'maple' },
    { x: 11, y: 9, class: 'maple' },
    { x: 13, y: 11, class: 'maple' },
  ],
  boundary: { w0: -12, w1: 1, w2: 0.3 },
  positiveClass: 'maple',
};

const area = (polygon) => Math.abs(polygon.reduce((sum, [x, y], index) => {
  const [nx, ny] = polygon[(index + 1) % polygon.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;

test('normalizeBoundaryConfig keeps the course data and the positive class', () => {
  const model = normalizeBoundaryConfig(LEAVES);
  assert.equal(model.points.length, 7);
  assert.equal(model.positive, 'maple');
  assert.equal(model.negative, 'oak');
  assert.deepEqual(model.boundary, { w0: -12, w1: 1, w2: 0.3 });
  assert.equal(model.classes[1].label.en, 'M (maple)');
});

test('normalizeBoundaryConfig survives missing and broken fields', () => {
  const model = normalizeBoundaryConfig({ points: [{ x: 1, y: 2, class: 'a' }, { x: 'bad', y: 1, class: 'b' }, { x: 3, y: 4, class: 'b' }] });
  assert.deepEqual(model.classes.map((item) => item.id), ['a', 'b']);
  assert.equal(model.points.length, 2);
  assert.equal(model.positive, 'b');
  assert.equal(model.boundary.w1, 1);
  assert.equal(model.xLabel.en, 'Feature x1');
  const empty = normalizeBoundaryConfig(undefined);
  assert.equal(empty.points.length, 0);
  assert.equal(classifyPoints(empty.boundary, empty.points, empty.positive, empty.negative).total, 0);
});

test('the trained line of slide 44 gets 6 of 7 leaves right (Model A)', () => {
  const model = normalizeBoundaryConfig(LEAVES);
  const result = classifyPoints(model.boundary, model.points, model.positive, model.negative);
  assert.equal(result.correct, 6);
  const wrong = result.rows.filter((row) => !row.correct);
  assert.equal(wrong.length, 1);
  assert.deepEqual([wrong[0].x, wrong[0].y, wrong[0].cls, wrong[0].predicted], [10, 18, 'oak', 'maple']);
  const summary = accuracySummary(result.correct, result.total);
  assert.equal(summary.accuracy, 6 / 7);
  assert.ok(Math.abs(summary.error - 1 / 7) < 1e-12);
});

test('Model C of slide 47 (-4 + x1 - 0.5x2) gets 5 of 7', () => {
  const model = normalizeBoundaryConfig(LEAVES);
  const result = classifyPoints({ w0: -4, w1: 1, w2: -0.5 }, model.points, model.positive, model.negative);
  assert.equal(result.correct, 5);
});

test('a point exactly on the line is predicted as the other class (score must be > 0)', () => {
  const result = classifyPoints({ w0: -10, w1: 1, w2: 0 }, [{ index: 0, x: 10, y: 3, cls: 'p' }], 'p', 'n');
  assert.equal(result.rows[0].predicted, 'n');
});

test('accuracySummary handles an empty data set', () => {
  const summary = accuracySummary(0, 0);
  assert.ok(Number.isNaN(summary.accuracy));
});

test('boundarySegment runs from (12, 0) to (6, 20) for the slide 44 line', () => {
  const { rect } = boundaryExtent(normalizeBoundaryConfig(LEAVES).points);
  assert.deepEqual(rect, { xMin: 0, xMax: 15, yMin: 0, yMax: 20 });
  const segment = boundarySegment({ w0: -12, w1: 1, w2: 0.3 }, rect);
  const sorted = segment.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]).sort((a, b) => a[1] - b[1]);
  assert.deepEqual(sorted, [[12, 0], [6, 20]]);
  assert.equal(boundarySegment({ w0: 5, w1: 0, w2: 0 }, rect), null);
  assert.equal(boundarySegment({ w0: -100, w1: 1, w2: 0 }, rect), null);
});

test('clipToHalfPlane splits the plot into the two predicted regions', () => {
  const rect = { xMin: 0, xMax: 15, yMin: 0, yMax: 20 };
  const w = { w0: -12, w1: 1, w2: 0.3 };
  const positive = clipToHalfPlane(rectPolygon(rect), w, 1);
  const negative = clipToHalfPlane(rectPolygon(rect), w, -1);
  assert.ok(Math.abs(area(positive) + area(negative) - 300) < 1e-9);
  for (const [x, y] of positive) assert.ok(-12 + x + 0.3 * y >= -1e-9);
  for (const [x, y] of negative) assert.ok(-12 + x + 0.3 * y <= 1e-9);
  assert.deepEqual(clipToHalfPlane(rectPolygon(rect), { w0: -1000, w1: 1, w2: 0 }, 1), []);
  assert.equal(clipToHalfPlane(rectPolygon(rect), { w0: 1, w1: 0, w2: 0 }, 1).length, 4);
});

test('bestLinearSplit: no straight line separates all seven leaves', () => {
  const model = normalizeBoundaryConfig(LEAVES);
  assert.deepEqual(bestLinearSplit(model.points, model.positive), { correct: 6, total: 7 });
});

test('bestLinearSplit handles separable, XOR, collinear and duplicate points', () => {
  const p = (x, y, cls) => ({ x, y, cls });
  assert.equal(bestLinearSplit([p(0, 0, 'a'), p(1, 0, 'a'), p(5, 5, 'b'), p(6, 5, 'b')], 'b').correct, 4);
  assert.equal(bestLinearSplit([p(0, 0, 'a'), p(1, 1, 'a'), p(0, 1, 'b'), p(1, 0, 'b')], 'b').correct, 3);
  assert.equal(bestLinearSplit([p(0, 0, 'a'), p(1, 0, 'b'), p(2, 0, 'a')], 'b').correct, 2);
  assert.equal(bestLinearSplit([p(0, 0, 'a'), p(1, 0, 'a'), p(2, 0, 'b'), p(3, 0, 'b')], 'b').correct, 4);
  assert.equal(bestLinearSplit([p(0, 0, 'a'), p(0, 0, 'b')], 'b').correct, 1);
  assert.equal(bestLinearSplit([], 'b').correct, 0);
});

test('slider specs include the configured weights and use round steps', () => {
  const model = normalizeBoundaryConfig(LEAVES);
  const { rect } = boundaryExtent(model.points);
  const specs = boundarySliderSpecs(model.boundary, rect);
  assert.deepEqual([specs.w0.min, specs.w0.max, specs.w0.step], [-40, 40, 0.5]);
  assert.deepEqual([specs.w1.min, specs.w1.max, specs.w1.step], [-2, 2, 0.05]);
  assert.equal(specs.w2.digits, 2);
  for (const key of ['w0', 'w1', 'w2']) {
    assert.ok(specs[key].min <= model.boundary[key] && model.boundary[key] <= specs[key].max);
  }
});

test('equation and working are written like the slides', () => {
  const digits = { w0: 1, w1: 2, w2: 2 };
  assert.equal(formatBoundaryEquation({ w0: -12, w1: 1, w2: 0.3 }, digits), '−12 + x1 + 0.3x2 = 0');
  assert.equal(formatScoreWork({ w0: -12, w1: 1, w2: 0.3 }, { x: 10, y: 18 }, digits), '−12 + 1 × 10 + 0.3 × 18 = 3.4');
  assert.equal(formatScoreWork({ w0: -4, w1: 1, w2: -0.5 }, { x: 9, y: 6 }, digits), '−4 + 1 × 9 − 0.5 × 6 = 2');
  assert.equal(formatFeatureVector({ x: 10, y: 18 }), '[10, 18]');
});
