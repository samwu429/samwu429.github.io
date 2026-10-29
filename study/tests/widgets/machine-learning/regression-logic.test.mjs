import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFixed, formatSigned } from '../../../engine/widgets/machine-learning/shared/ml-math.js';
import {
  autoStepsForTick, curvatureLimit, directionOf, formatMseWork, gradientStep, hasConverged, leastSquaresFit,
  learningRateOptions, meanSquaredError, mseGradient, normalizeRegressionConfig, regressionRows,
  regressionSliderSpecs, visibleLine,
} from '../../../engine/widgets/machine-learning/regression-mse/regression-logic.js';

// Lecture 5 training data: leaf width x1 and leaf height t (slides 10-35).
// 第 5 讲的训练数据：叶子宽度 x1 与叶子高度 t（第 10-35 页）。
const LEAF_POINTS = [[2, 4.5], [4, 12.5], [6, 15.5], [8, 11], [10, 16.5], [12, 16], [14, 10.5]];
const { points } = normalizeRegressionConfig({ points: LEAF_POINTS, start: { w0: 19, w1: -0.8 } });
const GOOD = { w0: 8.65, w1: 0.464 };
const START = { w0: 19, w1: -0.8 };

test('normalizeRegressionConfig accepts pairs and objects and drops bad points', () => {
  const model = normalizeRegressionConfig({ points: [[1, 2], { x: 3, t: 4 }, { x: 5, y: 6 }, ['a', 1], null] });
  assert.deepEqual(model.points.map(({ x, t }) => [x, t]), [[1, 2], [3, 4], [5, 6]]);
  assert.deepEqual(model.start, { w0: 4, w1: 0 });
  assert.equal(model.xLabel.en, 'Input x1');
  assert.equal(normalizeRegressionConfig(null).points.length, 0);
});

test('slide 18-19: the point at x = 6 has error -4.1 and squared error 16.81', () => {
  const row = regressionRows(GOOD, points, { roundY: true })[2];
  assert.equal(row.y, 11.4);
  assert.equal(formatSigned(row.error, 1), '−4.1');
  assert.equal(formatFixed(row.squared, 2), '16.81');
});

test('slide 20: rounding y like the slides reproduces the written MSE exactly', () => {
  const rows = regressionRows(GOOD, points, { roundY: true });
  assert.deepEqual(rows.map((row) => formatFixed(row.squared, 2)), ['26.01', '4.00', '16.81', '1.96', '10.24', '3.24', '21.16']);
  assert.equal(
    formatMseWork(rows),
    'MSE = [26.01 + 4.00 + 16.81 + 1.96 + 10.24 + 3.24 + 21.16] / 7 = 83.42 / 7 ≈ 11.92',
  );
});

test('without rounding the same line has MSE about 11.89', () => {
  assert.equal(formatFixed(meanSquaredError(GOOD, points), 2), '11.89');
  assert.ok(formatMseWork(regressionRows(GOOD, points)).startsWith('MSE ≈ [25.79 + 3.98'));
});

test('slides 21 and 26: the starting guess y = 19 - 0.8x1 has MSE 37.52', () => {
  assert.equal(formatFixed(meanSquaredError(START, points), 2), '37.52');
  assert.equal(
    formatMseWork(regressionRows(START, points)),
    'MSE = [166.41 + 10.89 + 1.69 + 2.56 + 30.25 + 43.56 + 7.29] / 7 = 262.65 / 7 ≈ 37.52',
  );
  assert.equal(formatMseWork([]), 'MSE = —');
});

test('mseGradient matches finite differences of the MSE', () => {
  const w = { w0: 12.3, w1: -0.2 };
  const gradient = mseGradient(w, points);
  const h = 1e-6;
  const d0 = (meanSquaredError({ ...w, w0: w.w0 + h }, points) - meanSquaredError({ ...w, w0: w.w0 - h }, points)) / (2 * h);
  const d1 = (meanSquaredError({ ...w, w1: w.w1 + h }, points) - meanSquaredError({ ...w, w1: w.w1 - h }, points)) / (2 * h);
  assert.ok(Math.abs(gradient.d0 - d0) < 1e-5);
  assert.ok(Math.abs(gradient.d1 - d1) < 1e-4);
  assert.deepEqual(mseGradient(w, []), { d0: 0, d1: 0 });
});

test('learning-rate options stay below the stability limit for this data scale', () => {
  const { limit, options, defaultRate } = learningRateOptions(points);
  assert.ok(Math.abs(limit - 2 / (81 + Math.sqrt(6497))) < 1e-12);
  assert.deepEqual(options, [0.001, 0.002, 0.005, 0.01]);
  assert.equal(defaultRate, 0.005);
  assert.ok(options.every((rate) => rate < limit));
});

test('every gradient-descent step lowers the MSE, for every offered rate', () => {
  const { options, limit } = learningRateOptions(points);
  for (const rate of options) {
    let w = { ...START };
    let previous = meanSquaredError(w, points);
    for (let step = 0; step < 300; step += 1) {
      w = gradientStep(w, points, rate, limit).next;
      const current = meanSquaredError(w, points);
      assert.ok(current < previous, `rate ${rate}, step ${step}: ${current} >= ${previous}`);
      previous = current;
    }
  }
});

test('the rate is clamped, so even a huge requested rate cannot diverge', () => {
  const { limit } = learningRateOptions(points);
  let w = { ...START };
  const startMse = meanSquaredError(w, points);
  for (let step = 0; step < 200; step += 1) w = gradientStep(w, points, 10, limit).next;
  assert.ok(meanSquaredError(w, points) < startMse);
});

test('just above the curvature limit, unclamped gradient descent blows up', () => {
  const rate = 1.05 * (2 / curvatureLimit(points));
  let w = { ...START };
  for (let step = 0; step < 400; step += 1) w = gradientStep(w, points, rate).next;
  assert.ok(meanSquaredError(w, points) > 1e3);
});

test('gradient descent from the slide 26 guess converges to the exact best line, which slide 31 reads as 8.65 and 0.464', () => {
  const { limit, defaultRate } = learningRateOptions(points);
  const best = leastSquaresFit(points);
  const bestMse = meanSquaredError(best, points);
  let w = { ...START };
  let steps = 0;
  let slopeTurnedPositive = false;
  while (!hasConverged(w, best, { mse: meanSquaredError(w, points), bestMse }) && steps < 60000) {
    w = gradientStep(w, points, defaultRate, limit).next;
    steps += 1;
    if (w.w1 > 0) slopeTurnedPositive = true;
  }
  assert.ok(steps < 60000, 'did not converge');
  assert.ok(slopeTurnedPositive, 'the slope should turn positive, as on slide 29');
  // The exact best intercept is 8.643, which prints as 8.64; the slide stopped a little earlier at 8.65.
  // 精确的最佳截距是 8.643，显示为 8.64；课件停得稍早，读数是 8.65。
  assert.equal(formatFixed(best.w0, 3), '8.643');
  assert.equal(formatFixed(best.w1, 4), '0.4643');
  assert.equal(formatFixed(w.w0, 2), '8.64');
  assert.equal(formatFixed(w.w1, 3), '0.464');
  assert.equal(formatFixed(meanSquaredError(w, points, { roundY: true }), 2), '11.92');
  assert.equal(formatFixed(meanSquaredError(GOOD, points, { roundY: true }), 2), '11.92', 'the slide 31 reading gives the same written MSE');
});

test('leastSquaresFit gives the best line and handles a single x value', () => {
  const best = leastSquaresFit(points);
  assert.ok(Math.abs(best.w1 - 52 / 112) < 1e-12);
  assert.ok(Math.abs(best.w0 - (86.5 / 7 - (52 / 112) * 8)) < 1e-12);
  assert.deepEqual(leastSquaresFit([{ x: 2, t: 1 }, { x: 2, t: 3 }]), { w0: 2, w1: 0 });
  assert.deepEqual(leastSquaresFit([]), { w0: 0, w1: 0 });
});

test('slider specs cover the start and best lines with slide-style decimals', () => {
  const specs = regressionSliderSpecs(points, START, leastSquaresFit(points));
  assert.deepEqual(specs.w0, { min: -30, max: 30, step: 0.01, keyStep: 0.1, digits: 2 });
  assert.deepEqual(specs.w1, { min: -2, max: 2, step: 0.001, keyStep: 0.01, digits: 3 });
});

test('visibleLine clips the line to the plot box', () => {
  const box = { xMin: 0, xMax: 15, yMin: 0, yMax: 20 };
  const [[x1, y1], [x2, y2]] = visibleLine(GOOD, box);
  assert.deepEqual([x1, y1, x2], [0, 8.65, 15]);
  assert.ok(Math.abs(y2 - (8.65 + 0.464 * 15)) < 1e-12);
  const steep = visibleLine({ w0: 0, w1: 4 }, box);
  assert.deepEqual(steep.map(([x, y]) => [x, y]), [[0, 0], [5, 20]]);
  assert.equal(visibleLine({ w0: 30, w1: 0 }, box), null);
  assert.equal(visibleLine({ w0: 30, w1: 1 }, box), null);
  assert.deepEqual(visibleLine({ w0: 5, w1: 0 }, box), [[0, 5], [15, 5]]);
});

test('helpers: directions, convergence and the auto-run schedule', () => {
  assert.equal(directionOf(0.49), 'decrease');
  assert.equal(directionOf(-36.6), 'increase');
  assert.equal(directionOf(0), 'hold');
  const best = { w0: 8.642857, w1: 0.4642857 };
  assert.ok(hasConverged({ w0: 8.6429, w1: 0.46429 }, best));
  assert.ok(!hasConverged({ w0: 8.72, w1: 0.456 }, best, { mse: 11.8893, bestMse: 11.8878 }));
  assert.ok(hasConverged({ w0: 1, w1: 1 }, { w0: 2, w1: 0.5 }, { mse: 3, bestMse: 3 }));
  assert.equal(autoStepsForTick(0), 1);
  assert.equal(autoStepsForTick(4), 1);
  assert.equal(autoStepsForTick(5), 2);
  assert.equal(autoStepsForTick(1000), 512);
});
