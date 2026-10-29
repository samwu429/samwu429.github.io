import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LEAVES,
  bestMoves,
  bestPath,
  checkAnswers,
  checkMove,
  evaluateTree,
  formatCalc,
  formatValue,
  generatePracticeLeaves,
  levelSteps,
  moveName,
  nodeKey,
  normalizeConfig,
  parseAnswer,
  parseNumber,
  playerAt,
  randomLeaves,
  readNestedTree,
  rootMoveCount,
  treeDepth,
} from '../../../engine/widgets/search/minimax-tree/minimax-logic.js';

// Lecture 3, pages 42-46: root MAX, then MIN, then MAX above the leaves.
// 第 3 讲第 42–46 页：根取最大，下一层取最小，叶子上面一层取最大。
const COURSE = { leaves: [2, 3, 5, -9, 7, 5, 0, -1], branching: 2, rootPlayer: 'max' };
// Lecture 3 p.47-50 activity: two nodes have a single child; the answer is 7, choose the right action.
// 第 3 讲第 47–50 页的活动：有两个节点只有一个孩子；答案是 7，应该选右边。
const ACTIVITY = { tree: [[[[4, 3], [0, 6]], [[1, 5]]], [[[5, 6], [7, 9]]]], rootPlayer: 'max' };

// Small deterministic generator (LCG) so random trees are reproducible.
// 简单的确定性随机数生成器（线性同余），让随机树可以复现。
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test('treeDepth accepts only branching^depth leaf counts with depth 1 to 4', () => {
  assert.equal(treeDepth(8, 2), 3);
  assert.equal(treeDepth(9, 3), 2);
  assert.equal(treeDepth(16, 2), 4);
  assert.equal(treeDepth(16, 4), 2);
  assert.equal(treeDepth(3, 3), 1);
  assert.equal(treeDepth(6, 2), null);
  assert.equal(treeDepth(32, 2), null);
  assert.equal(treeDepth(1, 2), null);
  assert.equal(treeDepth(8, 1), null);
});

test('playerAt alternates turns starting from the root player', () => {
  assert.deepEqual([0, 1, 2, 3].map((level) => playerAt(level, 'max')), ['max', 'min', 'max', 'min']);
  assert.deepEqual([0, 1, 2].map((level) => playerAt(level, 'min')), ['min', 'max', 'min']);
});

test('normalizeConfig fills defaults and infers the shape', () => {
  assert.deepEqual(normalizeConfig(COURSE), {
    ok: true, leaves: COURSE.leaves, branching: 2, depth: 3, rootPlayer: 'max', counts: [[2], [2, 2], [2, 2, 2, 2]],
  });

  const empty = normalizeConfig(undefined);
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.leaves, [...DEFAULT_LEAVES]);
  assert.equal(empty.depth, 3);
  assert.equal(empty.rootPlayer, 'max');

  const inferred = normalizeConfig({ leaves: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
  assert.equal(inferred.branching, 3);
  assert.equal(inferred.depth, 2);

  assert.equal(normalizeConfig({ leaves: [1, 2, 3, 4], rootPlayer: 'min' }).rootPlayer, 'min');
  assert.equal(normalizeConfig({ leaves: [1, 2, 3, 4], rootPlayer: 'banana' }).rootPlayer, 'max');
  assert.deepEqual(normalizeConfig({ leaves: ['3', '−9'], branching: 2 }).leaves, [3, -9]);
});

test('normalizeConfig reports configs it cannot draw', () => {
  assert.deepEqual(normalizeConfig({ leaves: [1, 2, 3, 4, 5, 6], branching: 2 }), { ok: false, reason: 'shape', leafCount: 6 });
  assert.equal(normalizeConfig({ leaves: [1, 'x', 3, 4], branching: 2 }).reason, 'leaves');
  assert.equal(normalizeConfig({ leaves: [1], branching: 2 }).reason, 'shape');
  assert.equal(normalizeConfig({ leaves: Array.from({ length: 128 }, () => 1), branching: 2 }).reason, 'size');
});

test('evaluateTree reproduces the Lecture 3 abstract example level by level', () => {
  const tree = evaluateTree(normalizeConfig(COURSE));
  assert.deepEqual(tree.values[3], [2, 3, 5, -9, 7, 5, 0, -1]);
  assert.deepEqual(tree.values[2], [3, 5, 7, 0]);
  assert.deepEqual(tree.values[1], [3, 0]);
  assert.deepEqual(tree.values[0], [3]);
  assert.deepEqual(tree.choices[2], [1, 0, 0, 0]);
  assert.deepEqual(tree.choices[1], [0, 1]);
  assert.deepEqual(tree.choices[0], [0]);
});

test('bestPath follows the rational line of play and bestMoves says play left', () => {
  const tree = evaluateTree(normalizeConfig(COURSE));
  assert.deepEqual(bestPath(tree), [
    { level: 0, index: 0 },
    { level: 1, index: 0 },
    { level: 2, index: 0 },
    { level: 3, index: 1 },
  ]);
  assert.deepEqual(bestMoves(tree), [0]);
  assert.equal(moveName(bestMoves(tree)[0], 2).en, 'the left move');
});

test('a MIN root flips every level', () => {
  const tree = evaluateTree({ ...COURSE, depth: 3, rootPlayer: 'min' });
  assert.deepEqual(tree.values[2], [2, -9, 5, -1]);
  assert.deepEqual(tree.values[1], [2, 5]);
  assert.deepEqual(tree.values[0], [2]);
  assert.deepEqual(bestMoves(tree), [0]);
});

test('depth-1 and branching-3 trees work, and ties list every best move', () => {
  const flat = evaluateTree({ leaves: [4, -2, 7], branching: 3, depth: 1, rootPlayer: 'max' });
  assert.deepEqual(flat.values[0], [7]);
  assert.deepEqual(bestMoves(flat), [2]);
  assert.deepEqual(bestPath(flat), [{ level: 0, index: 0 }, { level: 1, index: 2 }]);

  const tied = evaluateTree({ leaves: [1, 0, 1, 0], branching: 2, depth: 2, rootPlayer: 'max' });
  assert.deepEqual(tied.values[1], [0, 0]);
  assert.deepEqual(bestMoves(tied), [0, 1]);
  assert.equal(bestPath(tied)[1].index, 0);
});

test('levelSteps go bottom-up and formatCalc writes the slide arithmetic', () => {
  const steps = levelSteps(evaluateTree(normalizeConfig(COURSE)));
  assert.deepEqual(steps.map((step) => [step.level, step.player]), [[2, 'max'], [1, 'min'], [0, 'max']]);
  const lines = steps.map((step) => step.nodes.map((node) => formatCalc(step.player, node.children, node.value)));
  assert.deepEqual(lines[0], ['max(2, 3) = 3', 'max(5, −9) = 5', 'max(7, 5) = 7', 'max(0, −1) = 0']);
  assert.deepEqual(lines[1], ['min(3, 5) = 3', 'min(7, 0) = 0']);
  assert.deepEqual(lines[2], ['max(3, 0) = 3']);
});

test('formatValue uses a true minus sign and trims float noise', () => {
  assert.equal(formatValue(-9), '−9');
  assert.equal(formatValue(0), '0');
  assert.equal(formatValue(-0), '0');
  assert.equal(formatValue(100), '100');
  assert.equal(formatValue(0.1 + 0.2), '0.3');
  assert.equal(formatValue(Number.NaN), '?');
});

test('parseNumber and parseAnswer accept what learners actually type', () => {
  assert.equal(parseNumber(' 3 '), 3);
  assert.equal(parseNumber('-9'), -9);
  assert.equal(parseNumber('−9'), -9);
  assert.equal(parseNumber('+4'), 4);
  assert.equal(parseNumber('３'), 3);
  assert.equal(parseNumber('－５'), -5);
  assert.equal(parseNumber('1.5'), 1.5);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber('--1'), null);
  assert.equal(parseNumber(''), null);
  assert.deepEqual(parseAnswer(''), { state: 'empty', value: null });
  assert.deepEqual(parseAnswer(undefined), { state: 'empty', value: null });
  assert.deepEqual(parseAnswer('x'), { state: 'invalid', value: null });
  assert.deepEqual(parseAnswer('-1'), { state: 'number', value: -1 });
});

test('checkAnswers marks right, wrong, empty and the max/min mix-up', () => {
  const tree = evaluateTree(normalizeConfig(COURSE));
  const answers = new Map([
    [nodeKey(2, 0), '3'],
    [nodeKey(2, 1), '-9'],
    [nodeKey(2, 2), '7'],
    [nodeKey(2, 3), '0'],
    [nodeKey(1, 0), '5'],
    [nodeKey(1, 1), ''],
  ]);
  const result = checkAnswers(tree, answers);
  assert.equal(result.total, 7);
  assert.equal(result.right, 3);
  assert.equal(result.wrong, 2);
  assert.equal(result.empty, 2);
  assert.equal(result.allRight, false);
  assert.equal(result.swapped, true);
  const byKey = Object.fromEntries(result.cells.map((cell) => [cell.key, cell]));
  assert.equal(byKey['2-1'].status, 'wrong');
  assert.equal(byKey['2-1'].swapped, true);
  assert.equal(byKey['1-0'].status, 'wrong');
  assert.equal(byKey['1-0'].swapped, true);
  assert.equal(byKey['0-0'].status, 'empty');
  assert.deepEqual(result.cells.map((cell) => cell.level), [2, 2, 2, 2, 1, 1, 0]);
});

test('checkAnswers accepts a plain object and reports a full solution', () => {
  const tree = evaluateTree(normalizeConfig(COURSE));
  const answers = { '2-0': '3', '2-1': '5', '2-2': '7', '2-3': '0', '1-0': '3', '1-1': '−0', '0-0': '3' };
  const result = checkAnswers(tree, answers);
  assert.equal(result.allRight, true);
  assert.equal(result.swapped, false);
});

test('checkMove accepts any tied best move', () => {
  const tree = evaluateTree(normalizeConfig(COURSE));
  assert.equal(checkMove(tree, 0), 'right');
  assert.equal(checkMove(tree, 1), 'wrong');
  assert.equal(checkMove(tree, null), 'empty');
  const tied = evaluateTree({ leaves: [1, 0, 1, 0], branching: 2, depth: 2, rootPlayer: 'max' });
  assert.equal(checkMove(tied, 1), 'right');
});

test('randomLeaves stays inside [-10, 10] and is reproducible with a seeded generator', () => {
  const first = randomLeaves(200, { random: seeded(7) });
  const second = randomLeaves(200, { random: seeded(7) });
  assert.deepEqual(first, second);
  assert.equal(first.length, 200);
  assert.ok(first.every((value) => Number.isInteger(value) && value >= -10 && value <= 10));
  assert.ok(new Set(first).size > 10);
  assert.deepEqual(randomLeaves(3, { random: () => 0.9999999999 }), [10, 10, 10]);
  assert.deepEqual(randomLeaves(2, { random: () => 0 }), [-10, -10]);
});

test('generatePracticeLeaves keeps the shape and gives the root one best move', () => {
  const random = seeded(42);
  for (let round = 0; round < 25; round += 1) {
    const leaves = generatePracticeLeaves({ branching: 2, depth: 3, rootPlayer: 'max' }, { random });
    assert.equal(leaves.length, 8);
    const tree = evaluateTree({ leaves, branching: 2, depth: 3, rootPlayer: 'max' });
    assert.equal(bestMoves(tree).length, 1);
  }
  assert.equal(generatePracticeLeaves({ branching: 3, depth: 2 }, { random }).length, 9);
});

test('a nested tree config reads the Lecture 3 p.47 activity, single children included', () => {
  const setup = normalizeConfig(ACTIVITY);
  assert.equal(setup.ok, true);
  assert.deepEqual(setup.leaves, [4, 3, 0, 6, 1, 5, 5, 6, 7, 9]);
  assert.deepEqual(setup.counts, [[2], [2, 1], [2, 1, 2], [2, 2, 2, 2, 2]]);
  assert.equal(setup.depth, 4);
  assert.equal(setup.branching, null);
  const uniform = normalizeConfig({ tree: [[2, 3], [5, -9]] });
  assert.equal(uniform.branching, 2);
  assert.equal(normalizeConfig({ tree: [['3', '−9']] }).leaves[1], -9);
});

test('the p.47 activity evaluates level by level to 7: choose the right action (p.50)', () => {
  const tree = evaluateTree(normalizeConfig(ACTIVITY));
  assert.deepEqual(tree.values[3], [3, 0, 1, 5, 7]);
  assert.deepEqual(tree.values[2], [3, 1, 7]);
  assert.deepEqual(tree.values[1], [1, 7]);
  assert.deepEqual(tree.values[0], [7]);
  assert.equal(rootMoveCount(tree), 2);
  assert.deepEqual(bestMoves(tree), [1]);
  assert.equal(moveName(bestMoves(tree)[0], rootMoveCount(tree)).en, 'the right move');
  assert.deepEqual(bestPath(tree).map(({ level, index }) => [level, index]), [[0, 0], [1, 1], [2, 2], [3, 4], [4, 8]]);
  const lines = levelSteps(tree).map((step) => step.nodes.map((node) => formatCalc(step.player, node.children, node.value)));
  assert.deepEqual(lines[1], ['max(3, 0) = 3', 'max(1) = 1', 'max(5, 7) = 7']);
  assert.deepEqual(lines[2], ['min(3, 1) = 1', 'min(7) = 7']);
});

test('answers on a nested tree are checked node by node, including the max/min mix-up', () => {
  const tree = evaluateTree(normalizeConfig(ACTIVITY));
  const answers = { '3-0': '3', '3-1': '0', '3-2': '1', '3-3': '5', '3-4': '7', '2-0': '3', '2-1': '1', '2-2': '7', '1-0': '3', '1-1': '7', '0-0': '7' };
  const result = checkAnswers(tree, answers);
  assert.equal(result.total, 11);
  assert.equal(result.wrong, 1);
  assert.equal(result.cells.find((cell) => cell.key === '1-0').swapped, true);
  assert.equal(checkAnswers(tree, { ...answers, '1-0': '1' }).allRight, true);
});

test('nested tree configs that cannot be drawn give a reason', () => {
  assert.equal(readNestedTree([[1, 2], [3, [4, 5]]]).reason, 'uneven');
  assert.equal(readNestedTree([[1, 2], []]).reason, 'empty');
  assert.equal(readNestedTree(7).reason, 'empty');
  assert.equal(readNestedTree([[[[[1, 2]]]]]).reason, 'depth');
  assert.equal(readNestedTree([[1, 'x']]).reason, 'leaves');
  assert.equal(readNestedTree(Array.from({ length: 82 }, () => 1)).reason, 'size');
  assert.equal(normalizeConfig({ tree: [[1], [2, [3]]] }).ok, false);
});

test('practice leaves keep the nested shape', () => {
  const setup = normalizeConfig(ACTIVITY);
  const leaves = generatePracticeLeaves(setup, { random: seeded(3) });
  assert.equal(leaves.length, 10);
  const tree = evaluateTree({ ...setup, leaves });
  assert.deepEqual(tree.counts, setup.counts);
  assert.equal(bestMoves(tree).length, 1);
});

test('moveName follows the slide wording for two and three moves', () => {
  assert.deepEqual(moveName(0, 2), { zh: '左边那一步', en: 'the left move', zhShort: '左边', enShort: 'Left' });
  assert.equal(moveName(1, 3).en, 'the middle move');
  assert.equal(moveName(2, 3).enShort, 'Right');
  assert.equal(moveName(3, 4).en, 'move 4 from the left');
});
