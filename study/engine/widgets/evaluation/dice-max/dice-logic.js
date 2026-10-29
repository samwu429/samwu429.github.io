/**
 * Dice maths for the lec06 activity "Consequences of Choosing the Maximum" (p.23-26):
 * roll 8 six-sided dice, then record 10 rolls and keep the maximum. DOM-free.
 * lec06 活动“选最大值的后果”（第 23-26 页）的骰子数学：掷 8 个六面骰子，再记录 10 次取最大值。不依赖 DOM。
 *
 * Exact distributions come from counting outcomes, so the reference values (most likely
 * total 28, expected maximum of 10 rolls about 35.4) are computed, not hard-coded.
 * 精确分布通过计数所有结果得到，因此参考值（最可能总和 28、10 次最大值的期望约 35.4）是算出来的，不是写死的。
 */
import { clampInteger } from '../shared/config-utils.js';

export const DEFAULT_DICE_CONFIG = Object.freeze({ dice: 8, sides: 6, rolls: 10 });

// Limits keep the outcome count below 2^53, so the exact counting stays exact.
// 限制范围使结果总数小于 2^53，保证精确计数不丢精度。
export const DICE_LIMITS = Object.freeze({
  dice: Object.freeze([1, 12]),
  sides: Object.freeze([2, 20]),
  rolls: Object.freeze([1, 30]),
});

export function normalizeDiceConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const read = (key) => clampInteger(source[key], DICE_LIMITS[key][0], DICE_LIMITS[key][1], DEFAULT_DICE_CONFIG[key]);
  return { dice: read('dice'), sides: read('sides'), rolls: read('rolls') };
}

/**
 * Small seeded generator (mulberry32) so tests and demos can be reproduced.
 * 小型可设种子的随机数生成器（mulberry32），便于测试复现。
 */
export function createRandom(seed = 1) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDie(sides, random = Math.random) {
  return Math.min(sides, 1 + Math.floor(random() * sides));
}

export function rollDice(dice, sides, random = Math.random) {
  return Array.from({ length: dice }, () => rollDie(sides, random));
}

export function sumOf(values) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * One "record N rolls and keep the max" experiment.
 * 一次“记录 N 次取最大”的实验。
 * Returns { sums, max, maxIndex } where maxIndex is the first roll that reached the max.
 * 返回 { sums, max, maxIndex }，maxIndex 为第一次达到最大值的那一次。
 */
export function runMaxExperiment({ dice, sides, rolls }, random = Math.random) {
  const sums = Array.from({ length: rolls }, () => sumOf(rollDice(dice, sides, random)));
  let maxIndex = 0;
  sums.forEach((sum, index) => {
    if (sum > sums[maxIndex]) maxIndex = index;
  });
  return { sums, max: sums[maxIndex], maxIndex };
}

/**
 * Number of ways to reach each total: ways[k] counts outcomes whose sum is dice + k.
 * 达到每个总和的方法数：ways[k] 是总和为 dice + k 的结果个数。
 */
export function sumWays(dice, sides) {
  let ways = [1];
  for (let die = 0; die < dice; die += 1) {
    const next = new Array(ways.length + sides - 1).fill(0);
    ways.forEach((count, index) => {
      for (let face = 0; face < sides; face += 1) next[index + face] += count;
    });
    ways = next;
  }
  return ways;
}

/**
 * Exact distribution of the total: { min, max, probabilities } with probabilities[k] = P(total = min + k).
 * 总和的精确分布：probabilities[k] = P(总和 = min + k)。
 */
export function sumDistribution(dice, sides) {
  const outcomes = sides ** dice;
  return {
    min: dice,
    max: dice * sides,
    probabilities: sumWays(dice, sides).map((count) => count / outcomes),
  };
}

export function distributionMean({ min, probabilities }) {
  return probabilities.reduce((total, probability, index) => total + (min + index) * probability, 0);
}

/**
 * Every most likely total: one for 8d6 (28), two when the number of totals is even (3d6: 10 and 11).
 * 所有“最可能”的总和：8d6 只有 28 一个；总和个数为偶数时有两个（3d6 为 10 和 11）。
 */
export function distributionModes({ min, probabilities }) {
  const peak = Math.max(...probabilities);
  return probabilities
    .map((probability, index) => (Math.abs(probability - peak) <= peak * 1e-12 ? min + index : null))
    .filter((value) => value !== null);
}

/**
 * Distribution of the largest of `rolls` independent totals: P(max = v) = F(v)^n - F(v - 1)^n.
 * n 次独立总和中最大值的分布：P(max = v) = F(v)^n - F(v - 1)^n。
 */
export function maxDistribution({ min, max, probabilities }, rolls) {
  let below = 0;
  let previousPower = 0;
  const result = probabilities.map((probability) => {
    below = Math.min(1, below + probability);
    const power = below ** rolls;
    const share = power - previousPower;
    previousPower = power;
    return share;
  });
  return { min, max, probabilities: result };
}

export function expectedMax(distribution, rolls) {
  return distributionMean(maxDistribution(distribution, rolls));
}

/** P(total > threshold) for an exact distribution. 精确分布下总和大于 threshold 的概率。 */
export function probabilityAbove({ min, probabilities }, threshold) {
  return probabilities.reduce((total, probability, index) => (min + index > threshold ? total + probability : total), 0);
}

export function createHistogram(min, max) {
  return { min, max, counts: new Array(max - min + 1).fill(0), n: 0, sum: 0 };
}

/** Adds one whole-number sample inside [min, max]; returns false for anything else. 加入一个样本，超出范围则忽略。 */
export function addSample(histogram, value) {
  if (!Number.isInteger(value) || value < histogram.min || value > histogram.max) return false;
  histogram.counts[value - histogram.min] += 1;
  histogram.n += 1;
  histogram.sum += value;
  return true;
}

export function resetHistogram(histogram) {
  histogram.counts.fill(0);
  histogram.n = 0;
  histogram.sum = 0;
}

export function histogramMean(histogram) {
  return histogram.n ? histogram.sum / histogram.n : null;
}

export function histogramPeak(histogram) {
  return histogram.counts.reduce((peak, count) => Math.max(peak, count), 0);
}

/** Share of samples strictly above `threshold`, or null when empty. 严格大于 threshold 的样本比例，空时为 null。 */
export function shareAbove(histogram, threshold) {
  if (!histogram.n) return null;
  const above = histogram.counts.reduce((total, count, index) => (histogram.min + index > threshold ? total + count : total), 0);
  return above / histogram.n;
}

/**
 * Evenly spaced axis ticks from min, using a "nice" step so at most `maxTicks` labels fit.
 * 从 min 开始、步长取整的坐标刻度，最多 maxTicks 个。
 */
export function axisTicks(min, max, maxTicks = 11) {
  const span = Math.max(1, max - min);
  const steps = [1, 2, 4, 5, 10, 20, 25, 50, 100];
  const step = steps.find((candidate) => Math.floor(span / candidate) + 1 <= maxTicks) || Math.ceil(span / (maxTicks - 1));
  const ticks = [];
  for (let value = min; value <= max; value += step) ticks.push(value);
  return ticks;
}

const PIPS = Object.freeze({
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
});

/**
 * Pip centres of a die face in a 100 x 100 box, or null when the face is drawn as a number (> 6).
 * 骰子面上圆点的中心坐标（100 x 100 坐标系）；点数大于 6 时返回 null，改为直接写数字。
 */
export function pipPositions(face) {
  return PIPS[face] || null;
}
