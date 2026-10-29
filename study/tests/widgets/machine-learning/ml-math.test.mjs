import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decimalsOf, downsample, formatFixed, formatLinear, formatNonZero, formatOperand, formatPercent,
  formatSigned, formatTrim, linearScale, niceCeil, niceExtent, niceStep, roundTo, ticksBetween, toBi, toNumber,
} from '../../../engine/widgets/machine-learning/shared/ml-math.js';

test('roundTo rounds half away from zero and never returns -0', () => {
  assert.equal(roundTo(9.55, 1), 9.6);
  assert.equal(roundTo(-2.05, 1), -2.1);
  assert.equal(roundTo(10.506, 1), 10.5);
  assert.equal(roundTo(14.218, 1), 14.2);
  assert.ok(Object.is(roundTo(-0.0001, 2), 0));
  assert.equal(roundTo(26.009999999999998, 2), 26.01);
});

test('decimalsOf finds the decimals of a step', () => {
  assert.equal(decimalsOf(0.05), 2);
  assert.equal(decimalsOf(2.5), 1);
  assert.equal(decimalsOf(1), 0);
  assert.equal(decimalsOf(0.001), 3);
});

test('number formatting uses a real minus sign and slide-style signs', () => {
  assert.equal(formatFixed(-4.1, 1), '−4.1');
  assert.equal(formatFixed(-0.001, 2), '0.00');
  assert.equal(formatFixed(Number.NaN, 2), '—');
  assert.equal(formatTrim(12.5, 2), '12.5');
  assert.equal(formatTrim(3, 2), '3');
  assert.equal(formatTrim(-0.3, 2), '−0.3');
  assert.equal(formatTrim(100, 2), '100');
  assert.equal(formatSigned(5.1, 1), '+5.1');
  assert.equal(formatSigned(-2, 1), '−2.0');
  assert.equal(formatSigned(0.0001, 1), '0.0');
  assert.equal(formatPercent(6 / 7), '85.7%');
  assert.equal(formatPercent(1), '100%');
  assert.equal(formatNonZero(0.001, 2), '0.001');
  assert.equal(formatNonZero(3.4, 2), '3.4');
  assert.equal(formatOperand(-3), '(−3)');
  assert.equal(formatOperand(18), '18');
});

test('formatLinear writes expressions like the slides', () => {
  const w = (w0, w1, w2) => [
    { coef: w0, symbol: '' }, { coef: w1, symbol: 'x1' }, { coef: w2, symbol: 'x2' },
  ];
  assert.equal(formatLinear(w(-12, 1, 0.3)), '−12 + x1 + 0.3x2');
  assert.equal(formatLinear(w(-4, 1, -0.5)), '−4 + x1 − 0.5x2');
  assert.equal(formatLinear(w(0, -1, 0)), '−x1');
  assert.equal(formatLinear(w(0, 0, 0)), '0');
  assert.equal(
    formatLinear([{ coef: 19, symbol: '', digits: 2 }, { coef: -0.8, symbol: 'x1', digits: 3 }], { fixed: true, keepZero: true }),
    '19.00 − 0.800x1',
  );
  assert.equal(
    formatLinear([{ coef: 8.65, symbol: '', digits: 2 }, { coef: 0.464, symbol: 'x1', digits: 3 }], { fixed: true, keepZero: true }),
    '8.65 + 0.464x1',
  );
});

test('niceStep, niceCeil and ticks produce round values', () => {
  assert.equal(niceStep(15, 6), 2.5);
  assert.equal(niceStep(4, 80), 0.05);
  assert.equal(niceStep(80, 160), 0.5);
  assert.equal(niceCeil(35), 40);
  assert.equal(niceCeil(2), 2);
  assert.equal(niceCeil(28.5), 30);
  assert.equal(niceCeil(1.6), 2);
  assert.equal(niceCeil(0.7), 0.8);
  assert.deepEqual(ticksBetween(0, 10, 2.5), [0, 2.5, 5, 7.5, 10]);
});

test('niceExtent matches the leaf plots of lectures 4 and 5: 0-15 and 0-20, ticks every 2', () => {
  const width = niceExtent([5, 7, 9, 10, 9, 11, 13]);
  assert.deepEqual([width.min, width.max, width.step], [0, 15, 2]);
  assert.deepEqual(width.ticks, [0, 2, 4, 6, 8, 10, 12, 14]);
  const height = niceExtent([10, 12, 6, 18, 14, 9, 11]);
  assert.deepEqual([height.min, height.max, height.step], [0, 20, 2]);
  assert.deepEqual(height.ticks, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  const targets = niceExtent([4.5, 12.5, 15.5, 11, 16.5, 16, 10.5, 19, 7]);
  assert.deepEqual([targets.min, targets.max, targets.step], [0, 20, 2], 'the lecture 5 heights tick every 2 as well');
  const small = niceExtent([0.03, 0.12]);
  assert.ok(small.ticks.every((tick) => tick >= small.min && tick <= small.max));
  const wide = niceExtent([0, 100]);
  assert.deepEqual([wide.min, wide.max, wide.step], [0, 120, 20], 'other steps keep ticks at the ends');
  assert.equal(wide.ticks[wide.ticks.length - 1], 120);
  const negative = niceExtent([-3, 4]);
  assert.ok(negative.min <= -3 && negative.max >= 4);
  const single = niceExtent([5]);
  assert.ok(single.min < 5 && single.max > 5);
  const empty = niceExtent([]);
  assert.ok(empty.max > empty.min);
});

test('linearScale maps and inverts', () => {
  const scale = linearScale([0, 10], [100, 0]);
  assert.equal(scale(0), 100);
  assert.equal(scale(5), 50);
  assert.equal(scale.invert(25), 7.5);
  assert.equal(linearScale([3, 3], [0, 10])(3), 5);
});

test('downsample keeps both ends', () => {
  const values = Array.from({ length: 1000 }, (_, index) => index);
  const reduced = downsample(values, 50);
  assert.equal(reduced.length, 50);
  assert.equal(reduced[0], 0);
  assert.equal(reduced[49], 999);
  assert.deepEqual(downsample([1, 2, 3], 50), [1, 2, 3]);
});

test('config readers fall back safely', () => {
  assert.deepEqual(toBi('叶子宽度'), { zh: '叶子宽度', en: '' });
  assert.deepEqual(toBi('Leaf width'), { zh: '', en: 'Leaf width' });
  assert.deepEqual(toBi({ zh: '宽', en: 'Width' }), { zh: '宽', en: 'Width' });
  assert.deepEqual(toBi(42, { zh: 'x', en: 'y' }), { zh: 'x', en: 'y' });
  assert.equal(toNumber('2.5'), 2.5);
  assert.equal(toNumber('abc', 7), 7);
  assert.equal(toNumber(Number.POSITIVE_INFINITY, 0), 0);
});
