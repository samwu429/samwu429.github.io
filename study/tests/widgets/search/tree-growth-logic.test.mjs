import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRANCHING_RANGE,
  DEFAULT_CONFIG,
  DEFAULT_RATE,
  DEPTH_RANGE,
  DISCUSS_DEPTHS,
  RATES,
  approxEn,
  approxZh,
  compactNumber,
  deeperRows,
  describeCount,
  describeDuration,
  formatInteger,
  formatPower,
  levelCounts,
  nodesAtDepth,
  normalizeConfig,
  scientific,
  searchSeconds,
  sumExpression,
  superscript,
  totalNodes,
  treeLayout,
  universeNote,
} from '../../../engine/widgets/search/tree-growth/tree-growth-logic.js';

const YEAR = 365.25 * 86400;

test('config is rounded and clamped into the slider ranges', () => {
  assert.deepEqual(BRANCHING_RANGE, { min: 1, max: 10 });
  assert.deepEqual(DEPTH_RANGE, { min: 0, max: 12 });
  assert.deepEqual(normalizeConfig({ branching: 3, depth: 4 }), { branching: 3, depth: 4 });
  assert.deepEqual(normalizeConfig({ branching: 50, depth: -2 }), { branching: 10, depth: 0 });
  assert.deepEqual(normalizeConfig({ branching: '7', depth: 4.4 }), { branching: 7, depth: 4 });
  assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig({ branching: 'many', depth: null }), DEFAULT_CONFIG);
});

test('nodes per depth are b^d, matching the Lecture 3 trees', () => {
  assert.deepEqual(levelCounts(2, 3), [1, 2, 4, 8]);
  assert.equal(totalNodes(2, 3), 15, 'p.25 activity tree: 1 + 2 + 4 + 8');
  assert.equal(nodesAtDepth(2, 10), 1024);
  assert.equal(nodesAtDepth(2, 20), 1048576);
  assert.equal(nodesAtDepth(2, 40), 1099511627776);
  assert.equal(nodesAtDepth(7, 4), 2401, 'Lab 3 Connect Four: 7 moves, depth 4');
  assert.equal(nodesAtDepth(5, 0), 1);
});

test('totals are exact across the whole slider range', () => {
  assert.equal(totalNodes(1, 12), 13);
  assert.equal(totalNodes(10, 12), 1111111111111);
  assert.equal(totalNodes(3, 4), 121);
  for (let b = 1; b <= 10; b += 1) {
    for (let d = 0; d <= 12; d += 1) {
      assert.equal(totalNodes(b, d), levelCounts(b, d).reduce((sum, count) => sum + count, 0), `b=${b} d=${d}`);
    }
  }
});

test('search time is nodes divided by states per second', () => {
  assert.equal(DEFAULT_RATE, 1e6);
  assert.deepEqual(RATES.map((rate) => rate.value), [1e3, 1e6, 1e9]);
  assert.equal(searchSeconds(2e6, 1e6), 2);
});

test('superscripts, powers and scientific notation', () => {
  assert.equal(superscript(19), '¹⁹');
  assert.equal(superscript(-3), '⁻³');
  assert.equal(formatPower(3, 4), '3⁴');
  assert.equal(scientific(1.2e19), '1.2 × 10¹⁹');
  assert.equal(scientific(9.96e19), '1 × 10²⁰');
  assert.equal(formatInteger(1234567), '1,234,567');
  assert.equal(formatInteger(1e15), '1 × 10¹⁵');
  assert.equal(compactNumber(1.0485), '1');
  assert.equal(compactNumber(0.123), '0.12');
  assert.equal(compactNumber(1234.5), '1,235');
});

test('big numbers read naturally in Chinese and English', () => {
  assert.equal(approxZh(1048576), '105 万');
  assert.equal(approxEn(1048576), '1 million');
  assert.equal(approxZh(1099511627776), '1.1 万亿');
  assert.equal(approxEn(1099511627776), '1.1 trillion');
  assert.equal(approxZh(99999999), '1 亿', 'rounding up moves to the next unit');
  assert.equal(approxEn(999999), '1 million');
  assert.equal(approxZh(2.5e17), '2.5 × 10¹⁷');
  assert.equal(describeCount(9999), null);
  assert.deepEqual(describeCount(1048576), { zh: '约 105 万', en: 'about 1 million' });
});

test('durations move from milliseconds to years', () => {
  assert.deepEqual(describeDuration(0), { zh: '0 秒', en: '0 seconds' });
  assert.equal(describeDuration(0.0001).en, 'practically instant (under 1 millisecond)');
  assert.deepEqual(describeDuration(0.5), { zh: '约 500 毫秒', en: 'about 500 milliseconds' });
  assert.deepEqual(describeDuration(1), { zh: '约 1 秒', en: 'about 1 second' });
  assert.deepEqual(describeDuration(2.097151), { zh: '约 2.1 秒', en: 'about 2.1 seconds' });
  assert.deepEqual(describeDuration(90), { zh: '约 1.5 分钟', en: 'about 1.5 minutes' });
  assert.deepEqual(describeDuration(3 * 3600), { zh: '约 3 小时', en: 'about 3 hours' });
  assert.deepEqual(describeDuration(2199023.255551), { zh: '约 25 天', en: 'about 25 days' });
  assert.deepEqual(describeDuration(25 * YEAR), { zh: '约 25 年', en: 'about 25 years' });
  assert.deepEqual(describeDuration(575000 * YEAR), { zh: '约 58 万年', en: 'about 575 thousand years' });
  assert.deepEqual(describeDuration(3.5e26 * YEAR), { zh: '约 3.5 × 10²⁶ 年', en: 'about 3.5 × 10²⁶ years' });
});

test('the universe comparison appears only beyond 13.8 billion years', () => {
  assert.equal(universeNote(1e9 * YEAR), null);
  assert.match(universeNote(2e10 * YEAR).en, /age of the universe/);
  assert.equal(universeNote(0), null);
});

test('sum expressions are written out, or shortened when long', () => {
  assert.equal(sumExpression([1, 3, 9, 27, 81]), '1 + 3 + 9 + 27 + 81');
  assert.equal(sumExpression(levelCounts(2, 12)), '1 + 2 + 4 + … + 2,048 + 4,096');
});

test('treeLayout draws every level of small trees and centres parents over children', () => {
  const layout = treeLayout(2, 4);
  assert.equal(layout.drawnDepth, 4);
  assert.equal(layout.truncated, false);
  assert.equal(layout.leafCount, 16);
  assert.equal(layout.nodes.length, 31);
  assert.equal(layout.edges.length, 30);
  assert.equal(layout.nodes[0].x, 8);
  for (const [parent, child] of layout.edges) {
    assert.equal(layout.nodes[child].level, layout.nodes[parent].level + 1);
  }
  const children = layout.edges.filter(([parent]) => parent === 1).map(([, child]) => layout.nodes[child].x);
  assert.equal((children[0] + children[1]) / 2, layout.nodes[1].x);
});

test('treeLayout stops at the deepest level that fits and reports truncation', () => {
  const big = treeLayout(3, 12, 64);
  assert.equal(big.drawnDepth, 3);
  assert.equal(big.leafCount, 27);
  assert.equal(big.truncated, true);
  const chain = treeLayout(1, 12);
  assert.equal(chain.nodes.length, 13);
  assert.ok(chain.nodes.every((node) => node.x === 0.5));
  assert.equal(chain.truncated, false);
  const root = treeLayout(10, 0);
  assert.deepEqual(root.nodes, [{ level: 0, index: 0, x: 0.5 }]);
  assert.equal(treeLayout(10, 12).drawnDepth, 1);
});

test('deeper rows answer the Lecture 3 p.27 Discuss for b = 2', () => {
  assert.deepEqual(DISCUSS_DEPTHS, [10, 20, 40]);
  const rows = deeperRows(2, 1e6);
  assert.deepEqual(rows.map((row) => row.atDepth), [1024, 1048576, 1099511627776]);
  assert.equal(rows[1].total, 2097151);
  assert.equal(rows[1].seconds, 2.097151);
  assert.equal(describeDuration(rows[2].seconds).en, 'about 25 days');
});
