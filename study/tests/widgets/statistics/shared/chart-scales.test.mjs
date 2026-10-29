import { test } from 'node:test';
import assert from 'node:assert/strict';

import { categoryBand, categoryExtent, countExtent } from '../../../../engine/widgets/statistics/shared/chart-scales.js';

test('countExtent starts at 0 and ticks counts in whole steps', () => {
  // The tallest bar of R's donut histogram holds 11 donuts (M3 p.14). R 甜甜圈直方图最高的柱子有 11 个。
  assert.deepEqual(countExtent(11), { min: 0, max: 12, step: 2, ticks: [0, 2, 4, 6, 8, 10, 12] });
  assert.deepEqual(countExtent(3), { min: 0, max: 3, step: 1, ticks: [0, 1, 2, 3] });
  assert.deepEqual(countExtent(12).step, 2, 'a step of 2.5 becomes 2');
  assert.deepEqual(countExtent(25), { min: 0, max: 25, step: 5, ticks: [0, 5, 10, 15, 20, 25] });
  assert.deepEqual(countExtent(933), { min: 0, max: 1000, step: 200, ticks: [0, 200, 400, 600, 800, 1000] });
  assert.equal(countExtent(120, { targetTicks: 4 }).step, 25);
  for (const value of [1, 2, 5, 7, 13, 18, 40, 99, 250, 1490]) {
    const extent = countExtent(value);
    assert.ok(extent.max >= value, `max ${extent.max} below ${value}`);
    assert.ok(Number.isInteger(extent.step) && extent.ticks.every(Number.isInteger), `fractional ticks for ${value}`);
    assert.equal(extent.ticks[extent.ticks.length - 1], extent.max);
  }
});

test('countExtent of no counts is still a usable axis', () => {
  assert.deepEqual(countExtent(0), { min: 0, max: 1, step: 1, ticks: [0, 1] });
  assert.deepEqual(countExtent(-4), countExtent(0));
  assert.deepEqual(countExtent('x'), countExtent(0));
});

test('categoryExtent gives one unit per category and no numeric ticks', () => {
  assert.deepEqual(categoryExtent(4), { min: 0, max: 4, step: 1, ticks: [] });
  assert.equal(categoryExtent(0).max, 1);
  assert.equal(categoryExtent('3').max, 3);
  assert.equal(categoryExtent(undefined).max, 1);
});

test('categoryBand centres each bar in its slot with padding between neighbours', () => {
  const band = categoryBand(2);
  assert.ok(Math.abs(band.start - 2.15) < 1e-12 && Math.abs(band.end - 2.85) < 1e-12);
  assert.equal(band.center, 2.5);
  assert.deepEqual(categoryBand(0, { padding: 0 }), { start: 0, end: 1, center: 0.5 });
  assert.deepEqual(categoryBand(1, { padding: 0.5 }), { start: 1.25, end: 1.75, center: 1.5 });
  const widest = categoryBand(0, { padding: 5 });
  assert.ok(widest.end > widest.start, 'padding is capped so a bar never disappears');
});
