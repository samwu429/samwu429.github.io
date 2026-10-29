/**
 * minimax-tree widget: the Lecture 3 abstract minimax tree, with upward triangles for our turn
 * (maximize) and downward triangles for the opponent's turn (minimize).
 * "Walkthrough" fills one level per step from the bottom up; "Practice" lets the learner type
 * every internal value, choose the move at the root and check the answers.
 * minimax-tree 组件：第 3 讲的抽象 Minimax 树，▲ 是我们的回合（取最大），▼ 是对手的回合（取最小）。
 * “看演示”自下而上每步填一层；“自己算”让学生填写每个内部节点、选择根的走法并检查答案。
 *
 * Config: { leaves: number[], branching: number, rootPlayer: "max" | "min" }, or a nested
 * { tree: [[[4, 3], [0, 6]], [[1, 5]]], rootPlayer } where a node may have any number of children.
 * 配置：{ leaves, branching, rootPlayer }；也可以写嵌套的 { tree, rootPlayer }，每个节点的孩子数可以不同。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { icon } from '../../../core/dom/icons.js';
import { enNode, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { segmented } from '../../../components/controls/segmented.js';
import {
  MAX_DEPTH,
  MAX_LEAVES,
  bestMoves,
  bestPath,
  checkAnswers,
  checkMove,
  childValues,
  evaluateTree,
  formatCalc,
  formatValue,
  generatePracticeLeaves,
  levelSteps,
  moveName,
  nodeKey,
  normalizeConfig,
  playerAt,
  rootMoveCount,
} from './minimax-logic.js';
import {
  GEOMETRY,
  edgeLine,
  inputBox,
  layoutTree,
  pointsAttribute,
  trianglePoints,
  valueAnchor,
} from './minimax-layout.js';

let instanceCount = 0;

const MODES = [
  { value: 'walk', label: '看演示 Walkthrough', title: '一步一步看 Minimax 怎么算 Step through minimax' },
  { value: 'practice', label: '自己算 Practice', title: '自己填每个节点的值 Fill in every value yourself' },
];

const TURN_TEXT = {
  max: {
    zh: '这一层轮到我们（▲），取最大值。',
    en: 'Our turn: take the maximum.',
    zhCopy: '每个 ▲ 从自己的孩子里挑最大的数，抄到自己身上（加粗的连线连着被选中的孩子）。',
    enCopy: 'Each ▲ copies the maximum of its children up one level (the thick line shows which child).',
  },
  min: {
    zh: '这一层轮到对手（▼），取最小值。',
    en: "Opponent's turn: take the minimum.",
    zhCopy: '每个 ▼ 从自己的孩子里挑最小的数，抄到自己身上（加粗的连线连着被选中的孩子）。',
    enCopy: 'Each ▼ copies the minimum of its children up one level (the thick line shows which child).',
  },
};

// A number box reports '' for text it cannot read (a full-width minus sign, Chinese digits), so such
// an answer is kept as this marker: the box then counts as "not a number" instead of "empty".
// 数字输入框读不懂的内容（全角减号、中文数字）会变成空字符串，所以改存这个标记：这样它算“不是数字”，而不是“没填”。
const UNREADABLE = '?';
const NUMBER_HINT = {
  zh: '格子里要填英文数字：先切换到英文输入法，用 0–9 和 - 号输入，例如 -9。',
  en: 'Type the number with an English keyboard: digits 0–9 and -, for example -9.',
};

const PATH_LINE = {
  zh: '加粗的绿色路线：双方都理性地下时，棋局就会这样走。',
  en: 'The bold green path is how the game goes if both players play rationally.',
};

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./minimax-tree.css', import.meta.url));
  const setup = normalizeConfig(config);
  if (!setup.ok) {
    container.append(configProblem(setup));
    return undefined;
  }

  instanceCount += 1;
  const uid = `minimax-tree-${instanceCount}`;
  const shape = { branching: setup.branching, depth: setup.depth, rootPlayer: setup.rootPlayer, counts: setup.counts };
  const layout = layoutTree(shape);
  const totalSteps = shape.depth + 2;
  // The walkthrough always shows the configured tree; practice starts with it and may swap in new ones.
  // 演示永远显示配置里的那棵树；练习从这棵树开始，之后可以换成新树。
  const courseTree = evaluateTree({ ...shape, leaves: setup.leaves });
  const rootMoves = rootMoveCount(courseTree);

  const state = {
    mode: 'walk',
    practiceTree: courseTree,
    step: 0,
    answers: new Map(),
    marks: new Map(),
    move: null,
    moveStatus: null,
    solved: false,
    revealed: false,
  };
  const currentTree = () => (state.mode === 'walk' ? courseTree : state.practiceTree);

  // Tree area shared by both modes. 两种模式共用的树形区域。
  const scrollBox = h('div', {
    class: 'minimax-tree__scroll',
    tabindex: '0',
    role: 'group',
    'aria-label': 'Minimax 树（可左右滚动） Minimax tree (scrolls sideways)',
  });
  const hint = h('p', { class: 'minimax-tree__hint', hidden: true },
    icon('arrowLeft', { size: 14 }),
    h('span', {}, zhNode('左右滑动看整棵树', 'label'), ' ', enNode('Scroll sideways to see the whole tree')),
    icon('arrowRight', { size: 14 }));
  let svg = null;
  let inputs = new Map();

  // Walkthrough panel. 演示面板。
  const backButton = button({ label: '上一步 Back', iconName: 'arrowLeft', onClick: () => goToStep(state.step - 1) });
  const nextButton = button({ label: '下一步 Next step', iconName: 'arrowRight', variant: 'primary', onClick: () => goToStep(state.step + 1) });
  const restartButton = button({ label: '从头开始 Restart', iconName: 'refresh', variant: 'ghost', onClick: () => goToStep(0) });
  const counter = h('span', { class: 'minimax-tree__counter', 'aria-hidden': 'true' });
  const explain = h('div', { class: 'minimax-tree__explain', 'aria-live': 'polite' });
  const walkPanel = h('div', { class: 'minimax-tree__panel' },
    h('div', { class: 'cluster minimax-tree__controls' }, backButton, nextButton, restartButton, counter),
    explain);

  // Practice panel. 练习面板。
  const moveRadios = [];
  const moveFieldset = h('fieldset', { class: 'minimax-tree__moves' },
    h('legend', { class: 'minimax-tree__moves-legend' }, moveQuestion(shape.rootPlayer)),
    h('div', { class: 'minimax-tree__move-options' }, Array.from({ length: rootMoves }, (_, index) => {
      const name = moveName(index, rootMoves);
      const radio = h('input', {
        type: 'radio',
        name: `${uid}-move`,
        value: String(index),
        onchange: () => onMoveChange(index),
      });
      moveRadios.push(radio);
      return h('label', { class: 'minimax-tree__move' }, radio, h('span', {}, `${name.zhShort} ${name.enShort}`));
    })));
  const checkButton = button({ label: '检查答案 Check answers', iconName: 'check', variant: 'primary', onClick: runCheck });
  const revealButton = button({ label: '看参考答案 Show answer', iconName: 'eye', onClick: revealAnswer });
  const newTreeButton = button({ label: '换一题 New tree', iconName: 'shuffle', onClick: newTree });
  const originalButton = button({ label: '换回原来的树 Original tree', iconName: 'undo', variant: 'ghost', onClick: useOriginalTree });
  originalButton.hidden = true;
  const clearButton = button({ label: '清空 Clear', variant: 'ghost', onClick: clearAnswers });
  const feedback = h('div', { class: 'minimax-tree__feedback', 'aria-live': 'polite' });
  const practicePanel = h('div', { class: 'minimax-tree__panel', hidden: true },
    sentence('从最底下往上，一层一层把空着的三角形填上数；最后选出根应该走哪一步。',
      'Fill in the empty triangles from the bottom up, then choose the move at the root.', 'minimax-tree__task'),
    moveFieldset,
    h('div', { class: 'cluster minimax-tree__controls' }, checkButton, revealButton, newTreeButton, originalButton, clearButton),
    h('p', { class: 'kbd-hint minimax-tree__tip' },
      zhNode('提示：在格子里按 Enter 也能检查。', 'label'), ' ', enNode('Tip: press Enter in a box to check.')),
    feedback);

  const modeControl = segmented({
    options: MODES,
    value: state.mode,
    ariaLabel: '模式 Mode',
    className: 'minimax-tree__modes',
    onChange: setMode,
  });

  const root = h('div', { class: 'minimax-tree' },
    h('div', { class: 'minimax-tree__top' }, modeControl),
    legend(shape),
    scrollBox,
    hint,
    walkPanel,
    practicePanel);

  buildStage();
  renderWalkText();
  container.append(root);
  updateHint();

  // The hint only shows when the tree is wider than its box. 只有树比框宽时才显示滑动提示。
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateHint) : null;
  observer?.observe(scrollBox);

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    walkPanel.hidden = mode !== 'walk';
    practicePanel.hidden = mode !== 'practice';
    buildStage();
    if (mode === 'walk') renderWalkText();
  }

  // ---- Drawing 绘图 ----

  function buildStage() {
    svg = drawTree();
    inputs = new Map();
    const layers = [svg];
    if (state.mode === 'practice') layers.push(buildInputs());
    replaceContent(scrollBox, h('div', {
      class: 'minimax-tree__stage',
      style: { width: `${layout.width}px`, height: `${layout.height}px` },
    }, layers));
    updateHint();
  }

  // Swaps only the SVG, so the practice inputs (and the focus inside them) stay untouched.
  // 只替换 SVG，练习输入框（以及其中的焦点）保持不变。
  function repaintTree() {
    const next = drawTree();
    svg.replaceWith(next);
    svg = next;
  }

  function currentView() {
    const { depth } = currentTree();
    if (state.mode === 'practice') {
      return { shownFrom: depth, band: null, chosen: null, path: state.solved || state.revealed };
    }
    if (state.step === 0) return { shownFrom: depth, band: depth, chosen: null, path: false };
    if (state.step <= depth) {
      const level = depth - state.step;
      return { shownFrom: level, band: level, chosen: level, path: false };
    }
    return { shownFrom: 0, band: null, chosen: null, path: true };
  }

  function drawTree() {
    const tree = currentTree();
    const view = currentView();
    const onPath = new Set(view.path ? bestPath(tree).map(({ level, index }) => nodeKey(level, index)) : []);
    const graphic = s('svg', {
      class: 'minimax-tree__svg',
      width: layout.width,
      height: layout.height,
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      role: 'img',
      'aria-label': describeTree(tree),
    });

    if (view.band !== null) {
      const y = layout.levels[view.band][0].y;
      graphic.append(s('rect', {
        class: 'minimax-tree__band',
        x: 3,
        y: y - GEOMETRY.nodeHeight / 2 - 9,
        width: layout.width - 6,
        height: GEOMETRY.nodeHeight + 18,
        rx: 10,
      }));
    }

    // Path edges are drawn last so the highlighted line is never covered.
    // 最佳路线的连线最后画，保证高亮线不被其他线盖住。
    const plainEdges = [];
    const pathEdges = [];
    for (let level = 0; level < tree.depth; level += 1) {
      for (const parent of layout.levels[level]) {
        for (let offset = 0; offset < tree.counts[level][parent.index]; offset += 1) {
          const childIndex = tree.firsts[level][parent.index] + offset;
          const isPath = onPath.has(nodeKey(level, parent.index)) && onPath.has(nodeKey(level + 1, childIndex));
          const isChosen = level === view.chosen && tree.choices[level][parent.index] === offset;
          const line = s('line', {
            class: ['minimax-tree__edge', isChosen && 'is-chosen', isPath && 'is-path'],
            ...edgeLine(parent, layout.levels[level + 1][childIndex]),
          });
          (isPath ? pathEdges : plainEdges).push(line);
        }
      }
    }
    graphic.append(...plainEdges, ...pathEdges);

    layout.levels.forEach((nodes, level) => {
      const player = playerAt(level, tree.rootPlayer);
      for (const node of nodes) {
        const text = formatValue(tree.values[level][node.index]);
        const anchor = valueAnchor(node, player);
        graphic.append(s('g', {
          class: [
            'minimax-tree__node',
            `minimax-tree__node--${player}`,
            level === tree.depth && 'minimax-tree__node--leaf',
            onPath.has(nodeKey(level, node.index)) && 'is-path',
            level === view.chosen && 'is-new',
          ],
        },
        s('polygon', {
          class: 'minimax-tree__shadow',
          points: pointsAttribute(trianglePoints({ x: node.x + GEOMETRY.shadow, y: node.y + GEOMETRY.shadow }, player)),
        }),
        s('polygon', { class: 'minimax-tree__tri', points: pointsAttribute(trianglePoints(node, player)) }),
        level >= view.shownFrom ? s('text', {
          class: ['minimax-tree__value', text.length > 3 && 'minimax-tree__value--long'],
          x: anchor.x,
          y: anchor.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        }, text) : null));
      }
    });
    return graphic;
  }

  function updateHint() {
    hint.hidden = !(scrollBox.scrollWidth > scrollBox.clientWidth + 1);
  }

  // ---- Walkthrough 演示 ----

  function goToStep(step) {
    if (step < 0 || step >= totalSteps || step === state.step) return;
    state.step = step;
    repaintTree();
    renderWalkText();
  }

  function renderWalkText() {
    setAriaDisabled(backButton, state.step === 0);
    setAriaDisabled(nextButton, state.step === totalSteps - 1);
    counter.textContent = `${state.step + 1} / ${totalSteps}`;
    replaceContent(explain, walkContent(courseTree, state.step));
  }

  // ---- Practice 练习 ----

  function buildInputs() {
    const tree = state.practiceTree;
    const layer = h('div', { class: 'minimax-tree__inputs' });
    // Bottom-up and left to right, so Tab follows the order in which minimax is computed.
    // 自下而上、从左到右创建，Tab 键的顺序就是 Minimax 的计算顺序。
    for (let level = tree.depth - 1; level >= 0; level -= 1) {
      const player = playerAt(level, tree.rootPlayer);
      for (const node of layout.levels[level]) {
        const key = nodeKey(level, node.index);
        const box = inputBox(node, player);
        const input = h('input', {
          type: 'number',
          step: 'any',
          class: 'minimax-tree__input',
          autocomplete: 'off',
          'aria-label': inputLabel(tree, level, node.index, player),
          style: { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` },
          oninput: (event) => onAnswerInput(key, event.currentTarget),
          onchange: (event) => onAnswerCommit(key, event.currentTarget),
          onkeydown: (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            runCheck();
          },
          // A wheel over a focused number box would silently change the answer.
          // 鼠标滚轮停在已聚焦的数字框上会悄悄改掉答案，所以先让它失焦。
          onwheel: (event) => {
            if (document.activeElement === event.currentTarget) event.currentTarget.blur();
          },
        });
        input.value = state.answers.get(key) === UNREADABLE ? '' : (state.answers.get(key) ?? '');
        input.readOnly = state.revealed;
        const badge = h('span', {
          class: 'minimax-tree__badge',
          'aria-hidden': 'true',
          hidden: true,
          style: { left: `${box.left + box.width - 10}px`, top: `${box.top - 9}px` },
        });
        layer.append(input, badge);
        inputs.set(key, { input, badge });
        paintMark(key);
      }
    }
    return layer;
  }

  function isUnreadable(input) {
    return Boolean(input.validity && input.validity.badInput);
  }

  function onAnswerInput(key, input) {
    state.answers.set(key, isUnreadable(input) ? UNREADABLE : input.value);
    if (state.marks.delete(key)) paintMark(key);
    if (state.solved) {
      state.solved = false;
      repaintTree();
    }
  }

  // Once the learner leaves a box that holds unreadable text, say why instead of waiting for Check.
  // 学生离开一个内容读不懂的格子时，马上说明原因，而不是等到按“检查”。
  function onAnswerCommit(key, input) {
    if (!isUnreadable(input)) return;
    state.marks.set(key, 'wrong');
    paintMark(key);
    showFeedback({ tone: 'error', lines: [NUMBER_HINT] });
  }

  function onMoveChange(index) {
    state.move = index;
    state.moveStatus = null;
    paintMoveStatus();
    if (state.solved) {
      state.solved = false;
      repaintTree();
    }
  }

  function paintMark(key) {
    const entry = inputs.get(key);
    if (!entry) return;
    const status = state.revealed ? 'revealed' : state.marks.get(key);
    const { input, badge } = entry;
    input.classList.remove('is-right', 'is-wrong', 'is-empty', 'is-revealed');
    if (status) input.classList.add(`is-${status}`);
    if (status === 'wrong') input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    const showBadge = status === 'right' || status === 'wrong';
    badge.hidden = !showBadge;
    badge.className = showBadge ? `minimax-tree__badge minimax-tree__badge--${status}` : 'minimax-tree__badge';
    replaceContent(badge, showBadge ? icon(status === 'right' ? 'check' : 'cross', { size: 12 }) : null);
  }

  function paintMoveStatus() {
    moveFieldset.classList.toggle('is-right', state.moveStatus === 'right');
    moveFieldset.classList.toggle('is-wrong', state.moveStatus === 'wrong');
  }

  function runCheck() {
    if (state.revealed) return;
    const tree = state.practiceTree;
    const result = checkAnswers(tree, state.answers);
    state.marks = new Map(result.cells.map((cell) => [cell.key, cell.status === 'invalid' ? 'wrong' : cell.status]));
    for (const key of inputs.keys()) paintMark(key);
    state.moveStatus = checkMove(tree, state.move);
    paintMoveStatus();
    state.solved = result.allRight && state.moveStatus === 'right';
    repaintTree();
    showFeedback(checkFeedback(tree, result, state.moveStatus));
  }

  function revealAnswer() {
    const tree = state.practiceTree;
    state.revealed = true;
    state.solved = false;
    state.marks = new Map();
    for (let level = 0; level < tree.depth; level += 1) {
      tree.values[level].forEach((value, index) => state.answers.set(nodeKey(level, index), String(value)));
    }
    for (const [key, { input }] of inputs) {
      input.value = state.answers.get(key) ?? '';
      input.readOnly = true;
      paintMark(key);
    }
    const best = bestMoves(tree)[0];
    state.move = best;
    state.moveStatus = null;
    moveRadios.forEach((radio, index) => { radio.checked = index === best; });
    // The revealed move is part of the answer, so it is locked like the value boxes.
    // 公布的走法也是答案的一部分，所以和数值格子一样锁定。
    moveFieldset.disabled = true;
    paintMoveStatus();
    setAriaDisabled(checkButton, true);
    repaintTree();
    showFeedback(answerFeedback(tree));
  }

  function resetPractice() {
    state.answers = new Map();
    state.marks = new Map();
    state.move = null;
    state.moveStatus = null;
    state.solved = false;
    state.revealed = false;
    moveRadios.forEach((radio) => { radio.checked = false; });
    moveFieldset.disabled = false;
    paintMoveStatus();
    setAriaDisabled(checkButton, false);
  }

  function newTree() {
    state.practiceTree = evaluateTree({ ...shape, leaves: generatePracticeLeaves(shape) });
    resetPractice();
    buildStage();
    originalButton.hidden = false;
    showFeedback({
      tone: 'info',
      lines: [{
        zh: '换了一棵新树：叶子是 −10 到 10 之间的随机整数。从最底下往上算吧。',
        en: 'New tree: the leaves are random whole numbers from −10 to 10. Work from the bottom up.',
      }],
    });
  }

  function useOriginalTree() {
    state.practiceTree = courseTree;
    resetPractice();
    buildStage();
    // The button disappears, so focus moves to its neighbour instead of being lost.
    // 这个按钮会消失，所以把焦点移到旁边的按钮上，避免焦点丢失。
    newTreeButton.focus();
    originalButton.hidden = true;
    showFeedback({
      tone: 'info',
      lines: [{ zh: '换回了原来的那棵树。', en: 'Back to the original tree.' }],
    });
  }

  function clearAnswers() {
    resetPractice();
    buildStage();
    showFeedback(null);
  }

  function showFeedback(message) {
    if (!message) {
      replaceContent(feedback);
      return;
    }
    replaceContent(feedback, h('div', { class: ['minimax-tree__message', `minimax-tree__message--${message.tone}`] },
      message.lines.map((line) => sentence(line.zh, line.en)),
      message.extra || null));
  }

  return () => {
    observer?.disconnect();
  };
}

// ---- Text builders 文本构建 ----

// A Chinese teaching sentence with its English version on the next line.
// 一句中文讲解，下一行是对应的英文。
function sentence(zh, en, className) {
  return h('p', { class: ['minimax-tree__sentence', className] },
    zhNode(zh, 'teach', 'span'),
    enNode(en, 'span'));
}

function setAriaDisabled(element, disabled) {
  // aria-disabled keeps the button focusable, so keyboard focus is not lost at the first or last step.
  // 用 aria-disabled 而不是 disabled：按钮仍可聚焦，到第一步或最后一步时键盘焦点不会丢失。
  if (disabled) element.setAttribute('aria-disabled', 'true');
  else element.removeAttribute('aria-disabled');
}

function swatch(player, leaf = false) {
  const points = pointsAttribute(trianglePoints({ x: 9, y: 8 }, player, { nodeWidth: 15, nodeHeight: 13 }));
  return s('svg', { class: 'minimax-tree__swatch', width: 18, height: 16, viewBox: '0 0 18 16', 'aria-hidden': 'true' },
    s('g', { class: ['minimax-tree__node', `minimax-tree__node--${player}`, leaf && 'minimax-tree__node--leaf'] },
      s('polygon', { class: 'minimax-tree__tri', points })));
}

function legend(shape) {
  const item = (graphic, zh, en) => h('li', { class: 'minimax-tree__legend-item' },
    graphic, h('span', {}, zhNode(zh, 'label'), ' ', enNode(en)));
  return h('ul', { class: 'minimax-tree__legend', 'aria-label': '图例 Legend' },
    item(swatch('max'), '我们的回合：取最大', 'Our turn: maximize'),
    item(swatch('min'), '对手的回合：取最小', "Opponent's turn: minimize"),
    item(swatch(playerAt(shape.depth, shape.rootPlayer), true), '最底一排是终局：值已给出', 'Bottom row: terminal values are given'));
}

function moveQuestion(rootPlayer) {
  const text = rootPlayer === 'max'
    ? { zh: '根轮到我们（▲）：应该走哪一步？', en: 'Which move should we play at the root?' }
    : { zh: '根轮到对手（▼）：对手会走哪一步？', en: 'Which move will the opponent play at the root?' };
  return [zhNode(text.zh, 'label'), ' ', enNode(text.en)];
}

function describeTree(tree) {
  const leaves = tree.leaves.map(formatValue).join(', ');
  const rootTurn = tree.rootPlayer === 'max'
    ? { zh: '我们（▲）', en: 'our turn (▲)' }
    : { zh: '对手（▼）', en: "the opponent's turn (▼)" };
  const branches = tree.branching
    ? { zh: `每个节点 ${tree.branching} 个分支`, en: `${tree.branching} branches per node` }
    : { zh: '各节点的分支数不一样', en: 'nodes have different numbers of branches' };
  return `Minimax 树：深度 ${tree.depth}，${branches.zh}，根轮到${rootTurn.zh}；终局值从左到右：${leaves}。`
    + ` Minimax tree: depth ${tree.depth}, ${branches.en}, ${rootTurn.en} at the root;`
    + ` terminal values from left to right: ${leaves}.`;
}

function inputLabel(tree, level, index, player) {
  const turn = player === 'max'
    ? { zh: '▲ 我们取最大', en: 'our turn, maximum' }
    : { zh: '▼ 对手取最小', en: "opponent's turn, minimum" };
  let label = `深度 ${level}，左起第 ${index + 1} 个，${turn.zh}。 Depth ${level}, node ${index + 1} from the left, ${turn.en}.`;
  if (level === tree.depth - 1) {
    label += ` 孩子 Children: ${childValues(tree, level, index).map(formatValue).join(', ')}.`;
  }
  return label;
}

function calcList({ player, nodes }) {
  return h('ul', { class: 'minimax-tree__calcs' },
    nodes.map((node) => h('li', {}, h('code', {}, formatCalc(player, node.children, node.value)))));
}

function stepTitle(zh, en) {
  return h('p', { class: 'minimax-tree__step-title' }, zhNode(zh, 'label'), ' ', enNode(en));
}

function walkContent(tree, step) {
  if (step === 0) {
    return [
      stepTitle('开始', 'Start'),
      sentence('最底下一排是终局（**terminal states**），它们的值已经给出。Minimax 从终局开始，一层一层把值往上带。',
        'Values of terminal states are given. Minimax starts at terminal states and carries values upwards, one level at a time.',
        'minimax-tree__sentence--lead'),
      sentence('真实的游戏里，终局的奖励是：赢 +100，输 −100，平局 0；抽象的树直接把值写在叶子上。',
        'In a real game, a win is +100, a loss is −100 and a draw is 0; an abstract tree just gives the values at the leaves.'),
      sentence('点“下一步”开始算。', 'Press Next step to begin.'),
    ];
  }
  if (step <= tree.depth) {
    const level = tree.depth - step;
    const levelStep = levelSteps(tree)[step - 1];
    const turn = TURN_TEXT[levelStep.player];
    return [
      stepTitle(`第 ${step} 步 · 深度 ${level}`, `Step ${step} · Depth ${level}`),
      sentence(turn.zh, turn.en, 'minimax-tree__sentence--lead'),
      sentence(turn.zhCopy, turn.enCopy),
      calcList(levelStep),
      level === 0 ? sentence('这一层就是根（**root**）。', 'This level is the root.') : null,
    ];
  }
  return [
    stepTitle('结论', 'Result'),
    sentence(...resultSentence(tree), 'minimax-tree__sentence--lead'),
    sentence(PATH_LINE.zh, PATH_LINE.en),
    courseQuote(),
  ];
}

function resultSentence(tree) {
  const root = formatValue(tree.values[0][0]);
  const names = bestMoves(tree).map((index) => moveName(index, rootMoveCount(tree)));
  const zhList = names.map((name) => name.zhShort).join('、');
  const enList = names.map((name) => name.enShort.toLowerCase()).join(', ');
  if (tree.rootPlayer === 'max') {
    return names.length === 1
      ? [`值带到了根：根 = ${root}。所以我们应该走${names[0].zh}，能拿到 ${root}。`,
        `The value reached the root: root = ${root}. We should play ${names[0].en} and expect a reward of ${root}.`]
      : [`值带到了根：根 = ${root}。走${zhList}都能拿到 ${root}，走哪一步都一样。`,
        `The value reached the root: root = ${root}. More than one move gives ${root} (${enList}), so it does not matter which one we play.`];
  }
  return names.length === 1
    ? [`根轮到对手（▼）：根 = ${root}。对手会走${names[0].zh}，我们只能拿到 ${root}。`,
      `At the root it is the opponent's turn: root = ${root}. They will play ${names[0].en}, and we get ${root}.`]
    : [`根轮到对手（▼）：根 = ${root}。对手走${zhList}都一样，我们只能拿到 ${root}。`,
      `At the root it is the opponent's turn: root = ${root}. Several moves (${enList}) give the same result, and we get ${root}.`];
}

function courseQuote() {
  return h('p', { class: 'minimax-tree__quote' },
    h('span', { class: 'minimax-tree__quote-label' }, zhNode('课件原话', 'label'), ' ', enNode('Course wording')),
    enNode('When a value gets carried up to the root, we know what move to play and the reward we should get for playing it.', 'span'),
    zhNode('值带到根时，我们就知道该走哪一步，以及走这一步应该拿到的奖励。', 'gloss', 'span'));
}

function checkFeedback(tree, result, moveStatus) {
  const root = formatValue(tree.values[0][0]);
  if (result.allRight && moveStatus === 'right') {
    return {
      tone: 'success',
      lines: [{ zh: `全对！根 = ${root}，走法也选对了。`, en: `All correct! Root = ${root}, and the move is right.` }, PATH_LINE],
    };
  }
  const wrong = result.wrong + result.invalid;
  const lines = [];
  if (result.wrong > 0) {
    lines.push({
      zh: `答对 ${result.right} / ${result.total} 个格子。红框里的数再算一次：▲ 取最大，▼ 取最小。`,
      en: `${result.right} of ${result.total} boxes are correct. Recheck the red boxes: ▲ takes the maximum, ▼ takes the minimum.`,
    });
  }
  if (result.invalid > 0) {
    lines.push({
      zh: `有 ${result.invalid} 个格子里不是能读懂的数字。${NUMBER_HINT.zh}`,
      en: `${result.invalid} ${result.invalid === 1 ? 'box does' : 'boxes do'} not hold a readable number. ${NUMBER_HINT.en}`,
    });
  }
  if (result.swapped) {
    lines.push({ zh: '提示：有的格子把最大和最小弄反了。', en: 'Hint: some boxes mixed up the maximum and the minimum.' });
  }
  if (result.empty > 0) {
    lines.push({
      zh: `还有 ${result.empty} 个格子没填（虚线框）。`,
      en: `${result.empty} ${result.empty === 1 ? 'box is' : 'boxes are'} still empty (dashed border).`,
    });
  }
  if (wrong === 0 && result.empty === 0) {
    lines.push({ zh: '所有格子都算对了！', en: 'Every box is correct!' });
  }
  if (moveStatus === 'empty') {
    lines.push({ zh: '还差一步：选出根应该走哪一步。', en: 'One more thing: choose the move at the root.' });
  } else if (moveStatus === 'wrong') {
    lines.push({ zh: '走法不对：要走向值和根相同的那个孩子。', en: 'Wrong move: go toward the child whose value equals the root.' });
  } else if (moveStatus === 'right') {
    lines.push({ zh: '走法选对了。', en: 'The move is correct.' });
  }
  return { tone: wrong > 0 || moveStatus === 'wrong' ? 'error' : 'info', lines };
}

function answerFeedback(tree) {
  const [zh, en] = resultSentence(tree);
  return {
    tone: 'info',
    lines: [{ zh: '参考答案：从最底下往上，一层一层这样算——', en: 'Answer: work from the bottom up, one level at a time.' }],
    extra: [
      ...levelSteps(tree).map((step) => h('div', { class: 'minimax-tree__answer-step' },
        sentence(TURN_TEXT[step.player].zh, TURN_TEXT[step.player].en, 'minimax-tree__sentence--compact'),
        calcList(step))),
      sentence(zh, en, 'minimax-tree__sentence--lead'),
      sentence(PATH_LINE.zh, PATH_LINE.en),
    ],
  };
}

function configProblem(setup) {
  const reasons = {
    leaves: { zh: '叶子里有不是数字的值。', en: 'Some leaves are not numbers.' },
    size: {
      zh: `叶子太多（${setup.leafCount} 个），最多 ${MAX_LEAVES} 个。`,
      en: `Too many leaves (${setup.leafCount}); the limit is ${MAX_LEAVES}.`,
    },
    shape: {
      zh: `叶子数（${setup.leafCount}）必须等于 branching 的 1 到 4 次方，例如 2 × 2 × 2 = 8。`,
      en: `The number of leaves (${setup.leafCount}) must equal branching to the power 1 to 4, for example 2 × 2 × 2 = 8.`,
    },
    empty: {
      zh: 'tree 里有空的节点 []，或者整棵树只是一个数。',
      en: 'The tree has an empty node [], or the whole tree is a single number.',
    },
    uneven: {
      zh: '所有叶子（终局）都要在最底下的同一层。',
      en: 'Every leaf (terminal state) must sit on the same bottom level.',
    },
    depth: {
      zh: `树太深了：最多 ${MAX_DEPTH} 层。`,
      en: `The tree is too deep; the limit is ${MAX_DEPTH} levels.`,
    },
  };
  const reason = reasons[setup.reason] || reasons.shape;
  return h('div', { class: 'minimax-tree minimax-tree--problem', role: 'note' },
    h('p', { class: 'minimax-tree__problem-title' },
      icon('alert', { size: 18 }),
      h('span', {}, zhNode('这棵 Minimax 树画不出来', 'label'), ' ', enNode('This minimax tree cannot be drawn'))),
    sentence(reason.zh, reason.en));
}
