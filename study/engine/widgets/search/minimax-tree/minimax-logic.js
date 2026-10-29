/**
 * Pure minimax logic for the minimax-tree widget: tree shape, evaluation, best path,
 * level-by-level steps, random practice trees and answer checking. DOM-free.
 * minimax-tree 组件的纯逻辑：树形、求值、最佳路线、逐层步骤、随机练习树与答案检查；不依赖 DOM。
 *
 * Course conventions (Lecture 3): an upward triangle is our turn (maximize), a downward
 * triangle is the opponent's turn (minimize); terminal values are given and carried upwards
 * one level at a time.
 * 课程约定（第 3 讲）：朝上三角形是我们的回合（取最大），朝下三角形是对手的回合（取最小）；
 * 终局的值已给出，并一层一层往上带。
 *
 * Every leaf sits at `depth`. counts[level][index] is the number of children of node (level, index);
 * its children are the next counts[level][index] nodes of level + 1, starting at firsts[level][index].
 * A uniform tree (`leaves` plus `branching`) gives every internal node `branching` children; a nested
 * `tree` config such as the Lecture 3 p.47 activity may give a node a single child.
 * 所有叶子都在第 depth 层。counts[level][index] 是节点 (level, index) 的孩子数；它的孩子是第 level + 1 层
 * 从 firsts[level][index] 开始的连续 counts[level][index] 个节点。均匀的树（leaves 加 branching）每个内部节点都有
 * branching 个孩子；嵌套的 tree 配置（例如第 3 讲第 47 页的活动）允许某个节点只有一个孩子。
 */

export const MINUS = '−';
export const DEFAULT_LEAVES = Object.freeze([2, 3, 5, -9, 7, 5, 0, -1]);
export const MAX_DEPTH = 4;
export const MAX_LEAVES = 81;
export const PRACTICE_RANGE = Object.freeze({ min: -10, max: 10 });

const EPSILON = 1e-9;

function sameNumber(a, b) {
  return Math.abs(a - b) < EPSILON;
}

export function otherPlayer(player) {
  return player === 'max' ? 'min' : 'max';
}

/**
 * Whose turn it is at a level: the root player on even levels, the other player on odd levels.
 * 某一层轮到谁：偶数层是根的玩家，奇数层是另一方。
 */
export function playerAt(level, rootPlayer = 'max') {
  return level % 2 === 0 ? rootPlayer : otherPlayer(rootPlayer);
}

export function pickValue(player, values) {
  return player === 'max' ? Math.max(...values) : Math.min(...values);
}

/**
 * Depth d (1 to MAX_DEPTH) with branching^d === leafCount, or null when no such depth exists.
 * 返回满足 branching^d === leafCount 的深度 d（1 到 MAX_DEPTH），不存在时返回 null。
 */
export function treeDepth(leafCount, branching) {
  if (!Number.isInteger(leafCount) || !Number.isInteger(branching) || branching < 2) return null;
  let size = 1;
  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    size *= branching;
    if (size === leafCount) return depth;
    if (size > leafCount) return null;
  }
  return null;
}

/**
 * Reads a number typed by a learner or written by an author. Accepts the Unicode minus sign,
 * en dashes and full-width digits that Chinese input methods produce; returns null otherwise.
 * 读取学生输入或作者填写的数字。接受 Unicode 减号、短破折号以及中文输入法产生的全角数字；无法识别时返回 null。
 */
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xFF10))
    .replace(/[−–—－]/g, '-')
    .replace(/＋/g, '+')
    .replace(/[．。]/g, '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Child counts of a uniform tree: every internal node has `branching` children. 均匀树的孩子数：每个内部节点都有 branching 个孩子。 */
export function uniformCounts(branching, depth) {
  return Array.from({ length: depth }, (_, level) => new Array(branching ** level).fill(branching));
}

/** Index of the first child of every node, level by level. 每一层每个节点的第一个孩子的位置。 */
export function firstChildren(counts) {
  return counts.map((row) => {
    let next = 0;
    return row.map((count) => {
      const first = next;
      next += count;
      return first;
    });
  });
}

/** The common child count when every internal node has the same number of children, otherwise null. 所有内部节点孩子数相同时返回该数，否则为 null。 */
export function uniformBranching(counts) {
  const all = counts.flat();
  return all.length && all.every((count) => count === all[0]) ? all[0] : null;
}

/**
 * Reads a nested `tree` config: a number is a leaf, an array lists the children of a node, e.g. the
 * Lecture 3 p.47 activity [[[[4, 3], [0, 6]], [[1, 5]]], [[[5, 6], [7, 9]]]]. Every leaf must sit on
 * the same bottom level. Returns { ok: true, leaves, counts, depth } or { ok: false, reason, leafCount }.
 * 读取嵌套的 tree 配置：数字是叶子，数组列出一个节点的孩子，例如第 3 讲第 47 页的活动。
 * 所有叶子必须在最底下同一层。
 */
export function readNestedTree(raw) {
  const counts = [];
  let level = [raw];
  // Breadth first, so the counts come level by level and left to right.
  // 按层遍历，孩子数就是一层一层、从左到右排好的。
  while (level.every(Array.isArray)) {
    if (level.some((node) => node.length === 0)) return { ok: false, reason: 'empty', leafCount: 0 };
    if (counts.length >= MAX_DEPTH) return { ok: false, reason: 'depth', leafCount: 0 };
    counts.push(level.map((node) => node.length));
    level = level.flat(1);
    if (level.length > MAX_LEAVES) return { ok: false, reason: 'size', leafCount: level.length };
  }
  if (!counts.length) return { ok: false, reason: 'empty', leafCount: 1 };
  if (level.some(Array.isArray)) return { ok: false, reason: 'uneven', leafCount: level.length };
  const leaves = level.map(parseNumber);
  if (leaves.some((value) => value === null)) return { ok: false, reason: 'leaves', leafCount: leaves.length };
  return { ok: true, leaves, counts, depth: counts.length };
}

/**
 * Validates a widget config. A nested `tree` describes any tree whose leaves share the bottom level;
 * otherwise missing leaves fall back to the Lecture 3 example, a missing branching is inferred from
 * the leaf count, and a missing rootPlayer means "max".
 * Returns { ok: true, leaves, branching, depth, rootPlayer, counts } (branching is null when the
 * nodes have different numbers of children) or { ok: false, reason, leafCount }.
 * 校验组件配置：嵌套的 tree 可以描述任何叶子都在最底层的树；否则缺少 leaves 时用第 3 讲的例子，
 * 缺少 branching 时按叶子数推断，缺少 rootPlayer 时按 "max" 处理。各节点孩子数不同时 branching 为 null。
 */
export function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const rootPlayer = source.rootPlayer === 'min' ? 'min' : 'max';
  if (Array.isArray(source.tree)) {
    const nested = readNestedTree(source.tree);
    if (!nested.ok) return nested;
    return { ok: true, leaves: nested.leaves, branching: uniformBranching(nested.counts), depth: nested.depth, rootPlayer, counts: nested.counts };
  }
  const rawLeaves = Array.isArray(source.leaves) && source.leaves.length > 0 ? source.leaves : DEFAULT_LEAVES;
  const leaves = rawLeaves.map(parseNumber);
  if (leaves.some((value) => value === null)) {
    return { ok: false, reason: 'leaves', leafCount: rawLeaves.length };
  }
  if (leaves.length > MAX_LEAVES) {
    return { ok: false, reason: 'size', leafCount: leaves.length };
  }

  const requested = Number(source.branching);
  const hasBranching = source.branching !== undefined && source.branching !== null && Number.isInteger(requested);
  let branching = hasBranching ? requested : null;
  let depth = hasBranching ? treeDepth(leaves.length, branching) : null;
  if (!hasBranching) {
    // Smallest branching first, so 16 leaves become a binary tree of depth 4.
    // 从最小的分支数开始试，16 个叶子会被理解为深度 4 的二叉树。
    for (let candidate = 2; candidate <= leaves.length && depth === null; candidate += 1) {
      const found = treeDepth(leaves.length, candidate);
      if (found !== null) {
        branching = candidate;
        depth = found;
      }
    }
  }
  if (depth === null) {
    return { ok: false, reason: 'shape', leafCount: leaves.length };
  }
  return { ok: true, leaves, branching, depth, rootPlayer, counts: uniformCounts(branching, depth) };
}

/**
 * Runs minimax bottom-up. values[level][index] holds every node value (values[depth] are the
 * leaves); choices[level][index] is the position of the child whose value was carried up, the
 * leftmost one when several children tie. Without `counts` the tree is uniform.
 * 自下而上运行 Minimax。values[level][index] 是每个节点的值（values[depth] 就是叶子）；
 * choices[level][index] 是被带上来的那个孩子的位置，并列时取最左边的。没有 counts 时按均匀树处理。
 */
export function evaluateTree({ leaves, branching, depth, rootPlayer = 'max', counts }) {
  const resolvedDepth = depth ?? (counts ? counts.length : treeDepth(leaves.length, branching));
  const shape = counts ?? uniformCounts(branching, resolvedDepth);
  const firsts = firstChildren(shape);
  const values = [];
  const choices = [];
  values[resolvedDepth] = leaves.slice();
  for (let level = resolvedDepth - 1; level >= 0; level -= 1) {
    const player = playerAt(level, rootPlayer);
    const below = values[level + 1];
    values[level] = [];
    choices[level] = [];
    shape[level].forEach((count, index) => {
      const children = below.slice(firsts[level][index], firsts[level][index] + count);
      const value = pickValue(player, children);
      values[level].push(value);
      choices[level].push(children.indexOf(value));
    });
  }
  return {
    leaves: leaves.slice(),
    branching: branching ?? uniformBranching(shape),
    depth: resolvedDepth,
    rootPlayer,
    counts: shape,
    firsts,
    values,
    choices,
  };
}

export function childValues(tree, level, index) {
  const first = tree.firsts[level][index];
  return tree.values[level + 1].slice(first, first + tree.counts[level][index]);
}

/** Number of moves at the root, i.e. the children of the root. 根上可以走的步数，即根的孩子数。 */
export function rootMoveCount(tree) {
  return tree.counts[0][0];
}

/**
 * The line of play when both sides play rationally: from the root, follow the chosen child
 * down to a leaf. Returns [{ level, index }] starting with the root.
 * 双方都理性时的走法路线：从根开始沿着被选中的孩子一直走到叶子。返回以根开头的 [{ level, index }]。
 */
export function bestPath(tree) {
  const path = [{ level: 0, index: 0 }];
  let index = 0;
  for (let level = 0; level < tree.depth; level += 1) {
    index = tree.firsts[level][index] + tree.choices[level][index];
    path.push({ level: level + 1, index });
  }
  return path;
}

/**
 * Every root move (child position) that reaches the root value; more than one means a tie.
 * 所有能拿到根节点值的走法（孩子的位置）；多于一个表示并列。
 */
export function bestMoves(tree) {
  const root = tree.values[0][0];
  const moves = [];
  tree.values[1].forEach((value, index) => {
    if (sameNumber(value, root)) moves.push(index);
  });
  return moves;
}

/**
 * Walkthrough steps in the order the course applies minimax: the level just above the
 * leaves first, the root last.
 * 按课程的计算顺序给出演示步骤：先算紧挨叶子的那一层，最后算根。
 */
export function levelSteps(tree) {
  const steps = [];
  for (let level = tree.depth - 1; level >= 0; level -= 1) {
    steps.push({
      level,
      player: playerAt(level, tree.rootPlayer),
      nodes: tree.values[level].map((value, index) => ({
        index,
        value,
        children: childValues(tree, level, index),
        choice: tree.choices[level][index],
      })),
    });
  }
  return steps;
}

/**
 * Display text of a value, with a true minus sign: -9 becomes "−9".
 * 数值的显示文本，负号使用真正的减号：-9 显示为“−9”。
 */
export function formatValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '?';
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return '0';
  return rounded < 0 ? `${MINUS}${Math.abs(rounded)}` : String(rounded);
}

/** One calculation in the slide notation, e.g. "max(5, −9) = 5". 课件写法的一步计算，例如“max(5, −9) = 5”。 */
export function formatCalc(player, children, value) {
  return `${player}(${children.map(formatValue).join(', ')}) = ${formatValue(value)}`;
}

/**
 * Random integer leaves in [min, max]. `random` is injectable so tests can be deterministic.
 * 生成 [min, max] 内的随机整数叶子；random 可注入，便于测试得到确定结果。
 */
export function randomLeaves(count, { min = PRACTICE_RANGE.min, max = PRACTICE_RANGE.max, random = Math.random } = {}) {
  const span = max - min + 1;
  return Array.from({ length: count }, () => {
    const roll = Math.floor(random() * span);
    return min + Math.min(span - 1, Math.max(0, roll));
  });
}

/**
 * New practice leaves for the same shape. A few retries make the root's best move unique,
 * so "which move should we play?" has exactly one answer (unless the root has a single move).
 * 为同样形状的树生成新的练习叶子。多试几次让根的最佳走法唯一，使“应该走哪一步”只有一个答案（根只有一步可走时除外）。
 */
export function generatePracticeLeaves({ branching, depth, rootPlayer = 'max', counts }, { attempts = 40, ...range } = {}) {
  const shape = counts ?? uniformCounts(branching, depth);
  const count = shape[shape.length - 1].reduce((sum, children) => sum + children, 0);
  let leaves = randomLeaves(count, range);
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (bestMoves(evaluateTree({ leaves, depth: shape.length, rootPlayer, counts: shape })).length === 1) break;
    leaves = randomLeaves(count, range);
  }
  return leaves;
}

export function nodeKey(level, index) {
  return `${level}-${index}`;
}

/**
 * Classifies a typed answer: { state: "empty" | "invalid" | "number", value }.
 * 判断一个输入：{ state: "empty"（未填）| "invalid"（不是数字）| "number"（数字）, value }。
 */
export function parseAnswer(raw) {
  const text = raw === undefined || raw === null ? '' : String(raw).trim();
  if (text === '') return { state: 'empty', value: null };
  const value = parseNumber(text);
  return value === null ? { state: 'invalid', value: null } : { state: 'number', value };
}

/**
 * Checks typed values of every internal node. `answers` maps nodeKey(level, index) to the
 * raw text (a Map or a plain object). Cells come bottom-up, left to right; `swapped` flags the
 * classic slip of taking the max at a min node or the min at a max node.
 * 检查每个内部节点填写的值。answers 把 nodeKey(level, index) 映射到原始文本（Map 或普通对象）。
 * 结果按自下而上、从左到右排列；swapped 标出“该取最小却取了最大（或反过来）”的典型错误。
 */
export function checkAnswers(tree, answers) {
  const lookup = answers && typeof answers.get === 'function'
    ? (key) => answers.get(key)
    : (key) => (answers ? answers[key] : undefined);
  const cells = [];
  for (let level = tree.depth - 1; level >= 0; level -= 1) {
    const player = playerAt(level, tree.rootPlayer);
    tree.values[level].forEach((expected, index) => {
      const key = nodeKey(level, index);
      const parsed = parseAnswer(lookup(key));
      let status = parsed.state;
      let swapped = false;
      if (parsed.state === 'number') {
        status = sameNumber(parsed.value, expected) ? 'right' : 'wrong';
        if (status === 'wrong') {
          swapped = sameNumber(parsed.value, pickValue(otherPlayer(player), childValues(tree, level, index)));
        }
      }
      cells.push({ key, level, index, player, expected, given: parsed.value, status, swapped });
    });
  }
  const count = (status) => cells.filter((cell) => cell.status === status).length;
  const right = count('right');
  return {
    cells,
    right,
    wrong: count('wrong'),
    empty: count('empty'),
    invalid: count('invalid'),
    total: cells.length,
    swapped: cells.some((cell) => cell.swapped),
    allRight: right === cells.length,
  };
}

/**
 * Judges the chosen root move: "empty" (nothing chosen), "right" (any tied best move) or "wrong".
 * 判断选择的根走法：“empty”未选，“right”选中任一最佳走法（含并列），“wrong”选错。
 */
export function checkMove(tree, moveIndex) {
  if (!Number.isInteger(moveIndex)) return 'empty';
  return bestMoves(tree).includes(moveIndex) ? 'right' : 'wrong';
}

const NAMED_MOVES = {
  2: [{ zh: '左边', en: 'left' }, { zh: '右边', en: 'right' }],
  3: [{ zh: '左边', en: 'left' }, { zh: '中间', en: 'middle' }, { zh: '右边', en: 'right' }],
};

/**
 * Bilingual name of a root move, matching the slides ("we should play the left move").
 * Returns { zh, en } for sentences and { zhShort, enShort } for buttons.
 * 根走法的双语名称，与课件说法一致（"we should play the left move"）。zh/en 用于句子，zhShort/enShort 用于按钮。
 */
export function moveName(index, branching) {
  const named = NAMED_MOVES[branching]?.[index];
  if (named) {
    return {
      zh: `${named.zh}那一步`,
      en: `the ${named.en} move`,
      zhShort: named.zh,
      enShort: named.en[0].toUpperCase() + named.en.slice(1),
    };
  }
  return {
    zh: `左起第 ${index + 1} 步`,
    en: `move ${index + 1} from the left`,
    zhShort: `第 ${index + 1} 步`,
    enShort: `Move ${index + 1}`,
  };
}
