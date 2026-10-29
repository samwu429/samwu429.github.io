import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIDDEN_LAYER_LINES,
  VIEW_BOX,
  bandContains,
  bandPolygon,
  boxPolygon,
  clampToBox,
  clipLineToBox,
  clipPolygon,
  datasetPoints,
  evaluateLine,
  handlePoints,
  lineThroughPoints,
  normalizeAngle,
  polygonArea,
  searchLines,
  signedDistance,
} from '../../../engine/widgets/neural-networks/linear-separability/separability-logic.js';

const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('datasets put the four corners in the right classes', () => {
  assert.deepEqual(datasetPoints('and').map((point) => point.label), [0, 0, 0, 1]);
  assert.deepEqual(datasetPoints('or').map((point) => point.label), [0, 1, 1, 1]);
  assert.deepEqual(datasetPoints('xor').map((point) => point.label), [0, 1, 1, 0]);
  assert.deepEqual(datasetPoints('nonsense'), datasetPoints('and'));
});

test('a diagonal line x1 + x2 = 1.5 separates AND', () => {
  const line = lineThroughPoints({ x1: 1.5, x2: 0 }, { x1: 0, x2: 1.5 });
  close(signedDistance(line, { x1: 0.75, x2: 0.75 }), 0);
  const result = evaluateLine(datasetPoints('and'), line);
  assert.equal(result.separated, true);
  assert.equal(result.wrongCount, 0);
});

test('the vertical middle line gets two XOR points wrong', () => {
  const result = evaluateLine(datasetPoints('xor'), { angle: 90, offset: 0 });
  assert.equal(result.separated, false);
  assert.equal(result.wrongCount, 2);
});

test('a point exactly on the line counts as a mistake', () => {
  const line = lineThroughPoints({ x1: 1, x2: 1 }, { x1: 1, x2: 0 });
  const result = evaluateLine(datasetPoints('and'), line);
  assert.equal(result.separated, false);
  assert.ok(result.wrongCount >= 1);
});

test('brute-force search finds lines for AND and OR but none for XOR', () => {
  const and = searchLines(datasetPoints('and'));
  const or = searchLines(datasetPoints('or'));
  const xor = searchLines(datasetPoints('xor'));
  assert.equal(and.tried, 180 * 41);
  assert.ok(and.workingCount > 0);
  assert.ok(or.workingCount > 0);
  assert.equal(evaluateLine(datasetPoints('and'), and.best).separated, true);
  assert.equal(evaluateLine(datasetPoints('or'), or.best).separated, true);
  assert.equal(xor.workingCount, 0);
  assert.equal(xor.best, null);
  assert.equal(xor.fewestWrong, 1);
});

test('lineThroughPoints normalizes the angle and is null for one point', () => {
  const line = lineThroughPoints({ x1: 1, x2: 1 }, { x1: 0, x2: 0 });
  close(line.angle, 45);
  close(line.offset, 0);
  assert.equal(lineThroughPoints({ x1: 0.3, x2: 0.3 }, { x1: 0.3, x2: 0.3 }), null);
  assert.equal(normalizeAngle(-45), 135);
  assert.equal(normalizeAngle(180), 0);
});

test('clipLineToBox and handlePoints stay inside the view box', () => {
  const segment = clipLineToBox({ angle: 90, offset: 0 });
  assert.equal(segment.length, 2);
  for (const point of segment) {
    close(point.x1, 0.5);
    assert.ok(point.x2 >= VIEW_BOX.min - 1e-9 && point.x2 <= VIEW_BOX.max + 1e-9);
  }
  assert.equal(clipLineToBox({ angle: 90, offset: 1.4 }), null);
  const handles = handlePoints({ angle: 30, offset: 0.4 });
  for (const point of handles) {
    close(signedDistance({ angle: 30, offset: 0.4 }, point), 0);
    assert.deepEqual(clampToBox(point), point);
  }
  assert.deepEqual(clampToBox({ x1: 3, x2: -2 }), { x1: VIEW_BOX.max, x2: VIEW_BOX.min });
});

test('the two half-planes of a line cover the whole view box', () => {
  const line = { angle: 120, offset: 0.2 };
  const box = boxPolygon();
  const total = polygonArea(box);
  close(total, 4);
  close(polygonArea(clipPolygon(box, line, 1)) + polygonArea(clipPolygon(box, line, -1)), total);
});

test('the hidden-layer band classifies every XOR point correctly', () => {
  for (const point of datasetPoints('xor')) {
    assert.equal(bandContains(point, HIDDEN_LAYER_LINES), point.label === 1);
  }
  const band = bandPolygon();
  assert.ok(band.length >= 4);
  assert.ok(polygonArea(band) > 0 && polygonArea(band) < 4);
});
