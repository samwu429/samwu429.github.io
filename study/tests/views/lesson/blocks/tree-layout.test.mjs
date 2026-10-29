import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TREE_NODES,
  TREE_METRICS,
  describeNode,
  describeTree,
  estimateTextWidth,
  isGridLabel,
  layoutTree,
  normalizeTree,
  trianglePoints,
  wrapText,
} from '../../../../engine/views/lesson/blocks/tree-layout.js';

// Lecture 3 abstract minimax tree (slides 42-46), with edge labels on the first level.
const MINIMAX = {
  label: 'Root', shape: 'max', value: '3', children: [
    { label: 'L', edge: 'left', shape: 'min', value: '3', children: [
      { label: 'LL', shape: 'max', value: '3', children: [{ label: '2', shape: 'leaf' }, { label: '3', shape: 'leaf' }] },
      { label: 'LR', shape: 'max', value: '5', children: [{ label: '5', shape: 'leaf' }, { label: '-9', shape: 'leaf' }] },
    ] },
    { label: 'R', edge: 'right', shape: 'min', value: '0', children: [
      { label: 'RL', shape: 'max', value: '7', children: [{ label: '7', shape: 'leaf' }, { label: '5', shape: 'leaf' }] },
      { label: 'RR', shape: 'max', value: '0', children: [{ label: '0', shape: 'leaf' }, { label: '-1', shape: 'leaf' }] },
    ] },
  ],
};

// Lecture 1 "umbrella" concept tree: uneven depths and long mixed-language labels.
const UMBRELLA = {
  label: 'AI', children: [
    { label: 'Symbolic AI 符号 AI', children: [
      { label: 'Search 搜索', children: [{ label: 'Uninformed' }, { label: 'Heuristic' }, { label: 'Game-tree' }] },
      { label: 'Constraint Satisfaction' },
    ] },
    { label: 'Machine Learning 机器学习（见下图）' },
    { label: 'AI Ethics' },
  ],
};

function byDepth(nodes) {
  const levels = new Map();
  for (const node of nodes) {
    if (!levels.has(node.depth)) levels.set(node.depth, []);
    levels.get(node.depth).push(node);
  }
  for (const list of levels.values()) list.sort((a, b) => a.x - b.x);
  return levels;
}

test('text width grows with length and CJK characters are wider than Latin ones', () => {
  assert.equal(estimateTextWidth('', 13), 0);
  assert.ok(estimateTextWidth('abcd', 13) < estimateTextWidth('abcdefgh', 13));
  assert.ok(estimateTextWidth('机器学习', 13) > estimateTextWidth('abcd', 13));
  assert.equal(estimateTextWidth('机', 10), 10);
  assert.equal(estimateTextWidth('iiii', 10, { mono: true }), estimateTextWidth('MMMM', 10, { mono: true }));
});

test('wrapping keeps lines within the width and breaks between languages', () => {
  assert.deepEqual(wrapText('AI Ethics', 132, 13), ['AI Ethics']);
  const lines = wrapText('Markov Decision Processes and First-Order Logic', 100, 13);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(estimateTextWidth(line, 13) <= 100, line);
  assert.deepEqual(wrapText('Machine Learning 机器学习（见下图）', 132, 13), ['Machine Learning', '机器学习（见下图）']);
  assert.deepEqual(wrapText('first\nsecond', 132, 13), ['first', 'second']);
  assert.deepEqual(wrapText('**bold** and `code`', 200, 13), ['bold and code']);
  assert.deepEqual(wrapText('', 100, 13), []);
  assert.deepEqual(wrapText(null, 100, 13), []);
});

test('an over-long word is split instead of widening the node without limit', () => {
  const lines = wrapText('three_in_a_row_count_for_the_whole_board', 80, 13);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(estimateTextWidth(line, 13) <= 80, line);
  assert.equal(lines.join(''), 'three_in_a_row_count_for_the_whole_board');
});

test('closing punctuation never starts a wrapped line', () => {
  for (const width of [40, 52, 66, 80]) {
    for (const line of wrapText('机器学习，深度学习。监督学习（示例）', width, 13).slice(1)) {
      assert.ok(!/^[，。）]/.test(line), `${width}: ${line}`);
    }
  }
});

test('small boards are recognised as grid labels', () => {
  assert.equal(isGridLabel('. . G\nP B B\n. . G'), true);
  assert.equal(isGridLabel('O X _\nX X O\nO _ X'), true);
  assert.equal(isGridLabel('. .\n. P\n. B/G'), true);
  assert.equal(isGridLabel('Machine Learning\n机器学习'), false);
  assert.equal(isGridLabel('P B B'), false);
  assert.equal(isGridLabel(''), false);
});

test('normalizing assigns pre-order ids, depths and default shapes', () => {
  const { root, count, truncated } = normalizeTree({
    label: 'Top', edge: 'ignored', children: [
      { label: 'A', value: 4, children: [{ label: 'A1' }] },
      'junk',
      null,
      { label: 'B', shape: 'hexagon' },
    ],
  });
  assert.equal(count, 4);
  assert.equal(truncated, false);
  assert.equal(root.edge, '');
  assert.equal(root.shape, 'node');
  assert.deepEqual(root.children.map((child) => [child.id, child.label, child.depth, child.shape]), [[1, 'A', 1, 'node'], [3, 'B', 1, 'leaf']]);
  assert.equal(root.children[0].value, '4');
  assert.equal(root.children[0].children[0].parentId, 1);
  assert.equal(normalizeTree(undefined).root, null);
});

test('oversized, too deep or cyclic input is cut off safely', () => {
  const wide = { label: 'r', children: Array.from({ length: MAX_TREE_NODES + 10 }, (_, index) => ({ label: `n${index}` })) };
  const big = normalizeTree(wide);
  assert.equal(big.count, MAX_TREE_NODES);
  assert.equal(big.truncated, true);

  let deep = { label: 'leaf' };
  for (let level = 0; level < 20; level += 1) deep = { label: `d${level}`, children: [deep] };
  const tall = normalizeTree(deep, { maxDepth: 5 });
  assert.equal(tall.count, 5);
  assert.equal(tall.truncated, true);

  const loop = { label: 'loop', children: [] };
  loop.children.push(loop);
  assert.equal(normalizeTree(loop).count, 1);
});

test('an empty tree has an empty layout', () => {
  assert.deepEqual(layoutTree(null), { width: 0, height: 0, nodes: [], links: [], levels: 0, count: 0, truncated: false });
});

test('parents are centred over their first and last child', () => {
  for (const tree of [MINIMAX, UMBRELLA]) {
    const { nodes } = layoutTree(tree);
    for (const node of nodes) {
      const children = nodes.filter((child) => child.parentId === node.id);
      if (!children.length) continue;
      const centre = (children[0].x + children[children.length - 1].x) / 2;
      assert.ok(Math.abs(node.x - centre) <= 0.2, `${node.label}: ${node.x} vs ${centre}`);
    }
  }
});

test('nodes on the same level never overlap', () => {
  for (const tree of [MINIMAX, UMBRELLA]) {
    const { nodes } = layoutTree(tree);
    for (const list of byDepth(nodes).values()) {
      for (let index = 1; index < list.length; index += 1) {
        const gap = (list[index].x - list[index].slot / 2) - (list[index - 1].x + list[index - 1].slot / 2);
        assert.ok(gap >= TREE_METRICS.nodeGap - 0.2, `${list[index - 1].label} / ${list[index].label}: ${gap}`);
      }
    }
  }
});

test('everything is drawn inside the canvas and rows go downwards', () => {
  for (const tree of [MINIMAX, UMBRELLA]) {
    const layout = layoutTree(tree);
    for (const node of layout.nodes) {
      assert.ok(node.x - node.slot / 2 >= 0 && node.x + node.slot / 2 <= layout.width, `x of ${node.label}`);
      assert.ok(node.y - node.height / 2 >= 0, `top of ${node.label}`);
      for (const line of node.lines) assert.ok(line.y > node.y && line.y <= layout.height, `label of ${node.label}`);
      if (node.edgeTag) {
        assert.ok(node.edgeTag.y >= 0 && node.edgeTag.y + node.edgeTag.height <= node.y - node.height / 2);
      }
    }
    for (const link of layout.links) {
      const parent = layout.nodes.find((node) => node.id === link.from);
      const child = layout.nodes.find((node) => node.id === link.to);
      assert.equal(link.x1, parent.x);
      assert.equal(link.x2, child.x);
      assert.ok(link.y1 < link.y2);
      assert.ok(child.y > parent.y);
    }
    assert.equal(layout.links.length, layout.nodes.length - 1);
  }
});

test('shapes share one size per kind and are big enough for their value', () => {
  const layout = layoutTree({ label: 'r', shape: 'max', value: '+100', children: [{ label: 'a', shape: 'max', value: '0' }, { label: 'b', shape: 'leaf', value: '4 O, 1 M' }] });
  const [root, small, leaf] = layout.nodes;
  assert.equal(root.width, small.width);
  assert.ok(root.width * (2 / 3) >= estimateTextWidth('+100', TREE_METRICS.valueFont) * 1.1);
  assert.ok(leaf.width > leaf.height, 'a long value stretches a leaf into a low box');
  assert.ok(root.valueY > root.y, 'a MAX value sits low, where the triangle is wide');
});

test('labels that only repeat the shape glyph are not drawn, boards keep their rows', () => {
  const layout = layoutTree({ label: '\u25B2', shape: 'max', value: '3', children: [{ label: '. . G\nP B B', shape: 'node' }] });
  assert.deepEqual(layout.nodes[0].lines, []);
  assert.deepEqual(layout.nodes[1].lines.map((line) => line.text), ['. . G', 'P B B']);
  assert.equal(layout.nodes[1].grid, true);
});

test('triangles point up for MAX and down for MIN', () => {
  assert.equal(trianglePoints('max', 50, 50, 20, 18), '50,41 60,59 40,59');
  assert.equal(trianglePoints('min', 50, 50, 20, 18), '40,41 60,41 50,59');
});

test('the summary lists the size and every level', () => {
  const text = describeTree(MINIMAX);
  assert.match(text, /15 个节点 nodes, 4 层 levels/);
  assert.match(text, /Level 1: Root MAX = 3/);
  assert.match(text, /Level 4: 2, 3, 5, -9, 7, 5, 0, -1\./);
  assert.equal(describeNode({ label: '. .\nP B', shape: 'min', value: '0' }), '. . / P B MIN = 0');
  assert.equal(describeTree(null), '树形图 Tree diagram');
});
