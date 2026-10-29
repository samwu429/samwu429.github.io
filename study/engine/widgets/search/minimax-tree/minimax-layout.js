/**
 * Geometry of the minimax tree drawing: node centres, triangle corners, edge ends and the
 * spots where values or practice inputs go. Pure numbers, DOM-free.
 * minimax 树的绘图几何：节点中心、三角形顶点、连线端点，以及数值和练习输入框的位置；只做数值计算，不依赖 DOM。
 *
 * The drawing keeps its natural pixel size (it is never scaled), so practice inputs can be
 * placed over the nodes with the same coordinates; small screens scroll the box instead.
 * 图始终保持原始像素大小（不缩放），练习输入框才能按同一坐标盖在节点上；小屏幕改为在框内滚动。
 */
import { uniformCounts } from './minimax-logic.js';

export const GEOMETRY = Object.freeze({
  nodeWidth: 56,
  nodeHeight: 46,
  // Horizontal room per leaf and vertical distance between level centres.
  // 每个叶子占的水平宽度，以及相邻两层中心的垂直距离。
  slot: 62,
  levelGap: 84,
  padX: 14,
  padY: 16,
  // Offset of the hard shadow drawn behind each triangle. 三角形后面硬阴影的偏移。
  shadow: 3,
  inputWidth: 44,
  inputHeight: 28,
  // Values sit in the wide half of a triangle, this fraction of its height away from the centre.
  // 数值放在三角形较宽的那一半，离中心的距离为三角形高度的这个比例。
  valueShift: 0.2,
});

/**
 * Positions of every node: levels[level][index] = { level, index, x, y }. Leaves are spaced
 * evenly; every parent sits centred above its children, so a single child is straight below.
 * `counts` gives the children of each node (see minimax-logic); without it the tree is uniform.
 * 计算所有节点的位置：levels[level][index] = { level, index, x, y }。叶子等距排开，父节点位于孩子正中上方，
 * 只有一个孩子时就在它正上方。counts 给出每个节点的孩子数（见 minimax-logic），没有时按均匀树处理。
 */
export function layoutTree({ branching, depth, counts }, geometry = GEOMETRY) {
  const shape = counts ?? uniformCounts(branching, depth);
  const leafCount = shape[depth - 1].reduce((sum, count) => sum + count, 0);
  const yOf = (level) => geometry.padY + geometry.nodeHeight / 2 + level * geometry.levelGap;
  const levels = new Array(depth + 1);
  levels[depth] = Array.from({ length: leafCount }, (_, index) => ({
    level: depth,
    index,
    x: geometry.padX + geometry.slot * (index + 0.5),
    y: yOf(depth),
  }));
  for (let level = depth - 1; level >= 0; level -= 1) {
    let next = 0;
    levels[level] = shape[level].map((count, index) => {
      const first = levels[level + 1][next];
      const last = levels[level + 1][next + count - 1];
      next += count;
      return { level, index, x: (first.x + last.x) / 2, y: yOf(level) };
    });
  }
  return {
    width: geometry.padX * 2 + leafCount * geometry.slot + geometry.shadow,
    height: geometry.padY * 2 + geometry.nodeHeight + depth * geometry.levelGap + geometry.shadow,
    levels,
  };
}

/**
 * Corners of the node triangle: apex up for "max" (our turn), apex down for "min" (opponent).
 * 节点三角形的三个顶点："max"（我们的回合）顶点朝上，"min"（对手的回合）顶点朝下。
 */
export function trianglePoints({ x, y }, player, geometry = GEOMETRY) {
  const halfWidth = geometry.nodeWidth / 2;
  const halfHeight = geometry.nodeHeight / 2;
  return player === 'max'
    ? [[x, y - halfHeight], [x + halfWidth, y + halfHeight], [x - halfWidth, y + halfHeight]]
    : [[x - halfWidth, y - halfHeight], [x + halfWidth, y - halfHeight], [x, y + halfHeight]];
}

export function pointsAttribute(points) {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
}

export function valueAnchor({ x, y }, player, geometry = GEOMETRY) {
  const shift = geometry.nodeHeight * geometry.valueShift;
  return { x, y: player === 'max' ? y + shift : y - shift };
}

/**
 * Box of the practice input over a node, in whole pixels so the text stays crisp.
 * 练习输入框盖在节点上的位置，取整到像素，文字更清晰。
 */
export function inputBox(node, player, geometry = GEOMETRY) {
  const anchor = valueAnchor(node, player, geometry);
  return {
    left: Math.round(anchor.x - geometry.inputWidth / 2),
    top: Math.round(anchor.y - geometry.inputHeight / 2),
    width: geometry.inputWidth,
    height: geometry.inputHeight,
  };
}

/**
 * Edge from the bottom of a parent (base of an upward triangle, apex of a downward one) to the
 * top of a child.
 * 连线从父节点底部（朝上三角形的底边或朝下三角形的顶点）连到孩子的顶部。
 */
export function edgeLine(parent, child, geometry = GEOMETRY) {
  const halfHeight = geometry.nodeHeight / 2;
  return {
    x1: round(parent.x),
    y1: round(parent.y + halfHeight),
    x2: round(child.x),
    y2: round(child.y - halfHeight),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
