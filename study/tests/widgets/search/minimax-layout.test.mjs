import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEOMETRY,
  edgeLine,
  inputBox,
  layoutTree,
  pointsAttribute,
  trianglePoints,
  valueAnchor,
} from '../../../engine/widgets/search/minimax-tree/minimax-layout.js';

test('layoutTree spaces leaves evenly and centres every parent over its children', () => {
  const layout = layoutTree({ branching: 2, depth: 3 });
  assert.deepEqual(layout.levels.map((level) => level.length), [1, 2, 4, 8]);

  const leaves = layout.levels[3];
  const gaps = leaves.slice(1).map((leaf, index) => leaf.x - leaves[index].x);
  assert.ok(gaps.every((gap) => gap === GEOMETRY.slot));

  for (let level = 0; level < 3; level += 1) {
    layout.levels[level].forEach((parent) => {
      const children = layout.levels[level + 1].slice(parent.index * 2, parent.index * 2 + 2);
      const mean = children.reduce((sum, child) => sum + child.x, 0) / children.length;
      assert.equal(parent.x, mean);
      assert.ok(children.every((child) => child.y > parent.y));
    });
  }
  assert.equal(layout.levels[0][0].x, (leaves[0].x + leaves[7].x) / 2);
});

test('layoutTree size grows with leaves and depth and contains every node', () => {
  const small = layoutTree({ branching: 2, depth: 2 });
  const wide = layoutTree({ branching: 3, depth: 2 });
  const deep = layoutTree({ branching: 2, depth: 4 });
  assert.ok(wide.width > small.width);
  assert.ok(deep.height > small.height);
  for (const layout of [small, wide, deep]) {
    for (const node of layout.levels.flat()) {
      assert.ok(node.x - GEOMETRY.nodeWidth / 2 >= 0 && node.x + GEOMETRY.nodeWidth / 2 <= layout.width);
      assert.ok(node.y - GEOMETRY.nodeHeight / 2 >= 0 && node.y + GEOMETRY.nodeHeight / 2 <= layout.height);
    }
  }
});

test('a nested tree is laid out by leaf order, a single child straight below its parent', () => {
  const counts = [[2], [2, 1], [2, 1, 2], [2, 2, 2, 2, 2]];
  const layout = layoutTree({ depth: 4, counts });
  assert.deepEqual(layout.levels.map((level) => level.length), [1, 2, 3, 5, 10]);
  assert.equal(layout.width, GEOMETRY.padX * 2 + 10 * GEOMETRY.slot + GEOMETRY.shadow);
  const [a1, a2, b1] = layout.levels[2];
  assert.equal(layout.levels[1][1].x, b1.x, 'the right min node has one child, directly below it');
  assert.equal(a2.x, layout.levels[3][2].x);
  assert.equal(layout.levels[1][0].x, (a1.x + a2.x) / 2);
  assert.equal(layout.levels[0][0].x, (layout.levels[1][0].x + layout.levels[1][1].x) / 2);
});

test('triangles point up for max and down for min', () => {
  const node = { x: 100, y: 50 };
  const up = trianglePoints(node, 'max');
  const down = trianglePoints(node, 'min');
  assert.equal(up[0][1], 50 - GEOMETRY.nodeHeight / 2);
  assert.equal(up[1][1], 50 + GEOMETRY.nodeHeight / 2);
  assert.equal(down[2][1], 50 + GEOMETRY.nodeHeight / 2);
  assert.equal(down[0][1], 50 - GEOMETRY.nodeHeight / 2);
  assert.equal(pointsAttribute([[1, 2.345], [3, 4]]), '1,2.35 3,4');
});

test('values and inputs sit in the wide half of each triangle', () => {
  const node = { x: 100, y: 50 };
  assert.ok(valueAnchor(node, 'max').y > node.y);
  assert.ok(valueAnchor(node, 'min').y < node.y);
  const box = inputBox(node, 'max');
  assert.equal(box.width, GEOMETRY.inputWidth);
  assert.equal(box.left + box.width / 2, 100);
  assert.ok(Number.isInteger(box.left) && Number.isInteger(box.top));
  assert.ok(box.top + box.height <= node.y + GEOMETRY.nodeHeight / 2 + 1);
});

test('edges run from the bottom of the parent to the top of the child', () => {
  const line = edgeLine({ x: 10, y: 20 }, { x: 30, y: 120 });
  assert.deepEqual(line, { x1: 10, y1: 20 + GEOMETRY.nodeHeight / 2, x2: 30, y2: 120 - GEOMETRY.nodeHeight / 2 });
});
