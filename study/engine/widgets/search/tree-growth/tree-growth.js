/**
 * Tree-growth widget: how fast the number of states explodes as a search tree gets deeper
 * (Lecture 3 "The Difficulty with Search"). Sliders for the branching factor b and the depth d.
 * 状态树增长组件：搜索树越深，状态数量涨得有多快（Lecture 3 “The Difficulty with Search”）。
 * 用滑块调节分支数 b 与深度 d。
 *
 * Config / 配置: { branching: 1-10, depth: 0-12 }
 */
import { h, s, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { badge } from '../../../components/badges/badge.js';
import { segmented } from '../../../components/controls/segmented.js';
import {
  BRANCHING_RANGE, DEFAULT_RATE, DEPTH_RANGE, RATES, deeperRows, describeCount, describeDuration, formatInteger,
  formatPower, levelCounts, normalizeConfig, nodesAtDepth, searchSeconds, sumExpression, totalNodes, treeLayout,
  universeNote,
} from './tree-growth-logic.js';

// 81 leaves = the spec example b = 3, d = 4 drawn in full; bigger trees show their top levels only.
// 81 个叶子正好完整画出内容规范里的例子 b = 3、d = 4；更大的树只画上面几层。
const MAX_DRAWN_LEAVES = 81;
let instances = 0;

export async function mount(container, config = {}, context = {}) {
  await ensureStylesheet(new URL('./tree-growth.css', import.meta.url));
  instances += 1;
  const uid = `tree-growth-${instances}`;
  const initial = normalizeConfig(config);
  let branching = initial.branching;
  let depth = initial.depth;
  let rate = DEFAULT_RATE;

  const ids = {
    title: `${uid}-title`,
    branching: `${uid}-b`,
    depth: `${uid}-d`,
    levels: `${uid}-levels`,
    tree: `${uid}-tree`,
    deeper: `${uid}-deeper`,
    rate: `${uid}-rate`,
  };

  const branchingInput = slider(ids.branching, BRANCHING_RANGE, branching);
  const depthInput = slider(ids.depth, DEPTH_RANGE, depth);
  const branchingOutput = h('output', { class: 'tree-growth__value', for: ids.branching });
  const depthOutput = h('output', { class: 'tree-growth__value', for: ids.depth });

  const statDepthLabel = h('p', { class: 'tree-growth__stat-label' });
  const statDepthValue = h('p', { class: 'tree-growth__stat-value' });
  const statDepthNote = h('p', { class: 'tree-growth__stat-note' });
  const statTotalLabel = h('p', { class: 'tree-growth__stat-label' });
  const statTotalValue = h('p', { class: 'tree-growth__stat-value' });
  const statTotalNote = h('p', { class: 'tree-growth__stat-note' });
  const statTimeValue = h('div', { class: 'tree-growth__stat-value tree-growth__stat-value--time' });
  const statTimeNote = h('p', { class: 'tree-growth__stat-note' });

  const levelsBody = h('tbody');
  const treeBox = h('div', { class: 'tree-growth__tree-scroll' });
  const treeNote = h('div', { class: 'tree-growth__tree-note' });
  const deeperBody = h('tbody');
  const announcer = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });

  const rateControl = segmented({
    options: RATES.map((option) => ({
      value: String(option.value),
      label: option.short,
      title: `每秒 ${option.label.zh}个 ${option.label.en} per second`,
    })),
    value: String(rate),
    ariaLabel: '电脑每秒检查多少个状态 States checked per second',
    size: 'sm',
    onChange: (value) => {
      rate = Number(value) || DEFAULT_RATE;
      update();
      announce();
    },
  });

  const root = h('section', { class: 'tree-growth', 'aria-labelledby': ids.title },
    h('header', { class: 'tree-growth__header' },
      h('span', { class: 'tree-growth__eyebrow' }, '互动演示 Interactive'),
      h('h3', { class: 'tree-growth__title', id: ids.title }, biTitle({ zh: '搜索树长得有多快', en: 'How fast a search tree grows' })),
      h('div', { class: 'tree-growth__meta' }, badge('Lecture 3 · 第 27–28 页 p.27–28', 'neutral')),
      h('div', { class: 'tree-growth__intro' },
        zhNode('每个状态有 b 种走法（动作），往下每多看一层，节点数就乘以 b。课件把这叫作“随深度指数增长”。', 'teach', 'p'),
        enNode('With b possible actions from every state, each depth has b times as many nodes as the one above. We say that the number of nodes grows exponentially with depth.', 'p'))),
    h('div', { class: 'tree-growth__controls' },
      field(ids.branching,
        { zh: '每个状态有几种走法 b', en: 'Actions per state (b)' },
        branchingInput, branchingOutput),
      field(ids.depth,
        { zh: '往下搜索几层 d（深度）', en: 'Search depth (d)' },
        depthInput, depthOutput)),
    h('div', { class: 'tree-growth__stats' },
      h('div', { class: 'tree-growth__stat' }, statDepthLabel, statDepthValue, statDepthNote),
      h('div', { class: 'tree-growth__stat' }, statTotalLabel, statTotalValue, statTotalNote),
      h('div', { class: 'tree-growth__stat tree-growth__stat--time' },
        h('p', { class: 'tree-growth__stat-label' },
          zhNode('穷举搜索全部生成一遍要多久', 'label'), ' ', enNode('Time for exhaustive search')),
        statTimeValue, statTimeNote)),
    h('div', { class: 'tree-growth__rate' },
      h('span', { class: 'tree-growth__rate-label', id: ids.rate, 'aria-hidden': 'true' },
        zhNode('假设电脑每秒生成并检查', 'label'), ' ', enNode('States the computer checks per second:')),
      rateControl),
    h('section', { class: 'tree-growth__section', 'aria-labelledby': ids.levels },
      h('h4', { class: 'tree-growth__subheading', id: ids.levels }, biTitle({ zh: '每一层有多少个节点', en: 'Nodes at each depth' })),
      h('div', { class: 'table-scroll' },
        h('table', { class: 'data-table tree-growth__table' },
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, '深度 Depth'),
            h('th', { scope: 'col' }, '节点数 Nodes'),
            h('th', { scope: 'col' }, '比上一层 vs. above'))),
          levelsBody))),
    h('section', { class: 'tree-growth__section', 'aria-labelledby': ids.tree },
      h('h4', { class: 'tree-growth__subheading', id: ids.tree }, biTitle({ zh: '画出来看看', en: 'What the tree looks like' })),
      treeBox,
      treeNote),
    h('section', { class: 'tree-growth__section', 'aria-labelledby': ids.deeper },
      h('h4', { class: 'tree-growth__subheading', id: ids.deeper }, biTitle({ zh: '再往下搜会怎样', en: 'What if we search deeper?' })),
      h('div', { class: 'tree-growth__pair' },
        zhNode('Lecture 3 第 27 页的讨论题：深度 10、20、40 大约有多少个节点？用上面选的 b 算一算：', 'teach', 'p'),
        enNode('Discuss (Lecture 3, p.27): approximately how many nodes would be at depth 10, 20 and 40? With the b chosen above:', 'p')),
      h('div', { class: 'table-scroll' },
        h('table', { class: 'data-table tree-growth__table' },
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, '深度 Depth'),
            h('th', { scope: 'col' }, '这一层的节点 Nodes at this depth'),
            h('th', { scope: 'col' }, '整棵树要多久 Time for the whole tree'))),
          deeperBody))),
    h('div', { class: 'tree-growth__takeaway' },
      zhNode('每生成一个状态都要花时间，而指数增长非常快。这种指数增长正是搜索难的原因：时间不够时，只能放弃，得不到答案。', 'teach', 'p'),
      enNode('Each state generated costs the computer time, and exponential growth is fast. This exponential growth is what makes Search hard.', 'p')),
    announcer);

  branchingInput.addEventListener('input', () => {
    branching = Number(branchingInput.value);
    update();
  });
  depthInput.addEventListener('input', () => {
    depth = Number(depthInput.value);
    update();
  });
  branchingInput.addEventListener('change', announce);
  depthInput.addEventListener('change', announce);

  replaceContent(container, root);
  update();

  function update() {
    const counts = levelCounts(branching, depth);
    const atDepth = nodesAtDepth(branching, depth);
    const total = totalNodes(branching, depth);
    const seconds = searchSeconds(total, rate);
    const rateOption = RATES.find((option) => option.value === rate) || RATES[1];

    branchingOutput.textContent = `b = ${branching}`;
    depthOutput.textContent = `d = ${depth}`;
    branchingInput.setAttribute('aria-valuetext', `${branching} 种走法 ${branching} ${branching === 1 ? 'action' : 'actions'}`);
    depthInput.setAttribute('aria-valuetext', `${depth} 层 depth ${depth}`);

    replaceContent(statDepthLabel, zhNode(`第 ${depth} 层的节点`, 'label'), ' ', enNode(`Nodes at depth ${depth}`));
    statDepthValue.textContent = formatInteger(atDepth);
    replaceContent(statDepthNote, countNote(atDepth, `= ${formatPower(branching, depth)}`));
    replaceContent(statTotalLabel,
      zhNode(`整棵树一共（第 0 层到第 ${depth} 层）`, 'label'), ' ', enNode(`Whole tree (depth 0 to ${depth})`));
    statTotalValue.textContent = formatInteger(total);
    replaceContent(statTotalNote, countNote(total, `= ${sumExpression(counts)}`));

    const duration = describeDuration(seconds);
    const universe = universeNote(seconds);
    replaceContent(statTimeValue, zhNode(duration.zh, 'label', 'span', 'tree-growth__time-zh'), enNode(duration.en, 'span', 'tree-growth__time-en'));
    replaceContent(statTimeNote,
      zhNode(`按每秒 ${rateOption.label.zh}个状态算`, 'label'), ' ', enNode(`at ${rateOption.label.en} states per second`),
      universe ? h('span', { class: 'tree-growth__universe' }, zhNode(universe.zh, 'teach'), ' ', enNode(universe.en)) : null);

    renderLevels(counts);
    renderTree();
    renderDeeper();
  }

  function renderLevels(counts) {
    const largest = counts[counts.length - 1] || 1;
    replaceContent(levelsBody,
      counts.map((count, level) => h('tr', { class: level === depth ? 'tree-growth__row--deepest' : null },
        h('th', { scope: 'row' }, String(level)),
        h('td', {},
          h('div', { class: 'tree-growth__count' },
            h('span', { class: 'tree-growth__count-number' }, formatInteger(count)),
            h('span', { class: 'tree-growth__bar', 'aria-hidden': 'true' },
              h('span', { class: 'tree-growth__bar-fill', style: { width: `${Math.max(0, (100 * count) / largest).toFixed(4)}%` } })))),
        h('td', { class: 'tree-growth__growth' }, level === 0 ? '—' : `×${branching}`))),
      h('tr', { class: 'tree-growth__row--total' },
        h('th', { scope: 'row' }, '合计 Total'),
        h('td', {}, h('span', { class: 'tree-growth__count-number' }, formatInteger(totalNodes(branching, depth)))),
        h('td', {}, '')));
  }

  function renderTree() {
    const layout = treeLayout(branching, depth, MAX_DRAWN_LEAVES);
    const leafGap = clamp(560 / layout.leafCount, 10, 40);
    const levelGap = layout.drawnDepth ? clamp(320 / layout.drawnDepth, 26, 56) : 56;
    const radius = Math.max(3.5, Math.min(10, leafGap * 0.34));
    const labelWidth = 44;
    const pad = 12;
    const moreHeight = layout.truncated ? 28 : 0;
    const width = Math.round(labelWidth + layout.leafCount * leafGap + pad);
    const height = Math.round(pad * 2 + radius * 2 + layout.drawnDepth * levelGap + moreHeight);
    const xOf = (node) => labelWidth + node.x * leafGap;
    const yOf = (level) => pad + radius + level * levelGap;
    const nodes = layout.nodes;

    const edgePath = layout.edges
      .map(([parent, child]) => `M${xOf(nodes[parent])} ${yOf(nodes[parent].level)}L${xOf(nodes[child])} ${yOf(nodes[child].level)}`)
      .join('');
    const lastLevel = nodes.filter((node) => node.level === layout.drawnDepth);
    const morePath = layout.truncated
      ? lastLevel.map((node) => `M${xOf(node)} ${yOf(node.level) + radius + 4}V${yOf(node.level) + radius + moreHeight - 2}`).join('')
      : '';
    const drawnCount = nodes.length;

    const svg = s('svg', {
      class: 'tree-growth__tree',
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `搜索树：每个节点 ${branching} 个孩子，画出了第 0 到第 ${layout.drawnDepth} 层，共 ${drawnCount} 个节点。`
        + ` Search tree with ${branching} ${branching === 1 ? 'child' : 'children'} per node, depths 0 to ${layout.drawnDepth} drawn, ${drawnCount} nodes.`,
    },
    Array.from({ length: layout.drawnDepth + 1 }, (_, level) => s('text', {
      class: 'tree-growth__depth-label',
      x: 4,
      y: yOf(level) + 4,
    }, `d=${level}`)),
    s('path', { class: 'tree-growth__edge', d: edgePath }),
    morePath ? s('path', { class: 'tree-growth__more', d: morePath }) : null,
    nodes.map((node) => s('circle', {
      class: ['tree-growth__node', node.level === 0 && 'tree-growth__node--root', !layout.truncated && node.level === depth && depth > 0 && 'tree-growth__node--deepest'],
      cx: xOf(node),
      cy: yOf(node.level),
      r: radius,
    })));
    replaceContent(treeBox, svg);

    let note = null;
    if (branching === 1) {
      note = {
        zh: '每个状态只有 1 种走法时，树就是一条直线：一共只有 d + 1 个节点，不会爆炸。',
        en: 'With only 1 action per state the tree is a single line: just d + 1 nodes, no explosion.',
      };
    } else if (layout.truncated) {
      note = {
        zh: `节点太多，画不下了：这里只画了第 0 到第 ${layout.drawnDepth} 层，下面的虚线表示树还在继续长，一直长到第 ${depth} 层（那一层有 ${formatInteger(nodesAtDepth(branching, depth))} 个节点）。`,
        en: `Too many nodes to draw: only depths 0 to ${layout.drawnDepth} are shown. The dashed lines mean the tree keeps growing down to depth ${depth} (${formatInteger(nodesAtDepth(branching, depth))} nodes there).`,
      };
    } else if (depth > 0) {
      note = {
        zh: `最底下一层（第 ${depth} 层）有 ${formatInteger(nodesAtDepth(branching, depth))} 个节点，比上面所有层加起来还多。`,
        en: `The bottom level (depth ${depth}) has ${formatInteger(nodesAtDepth(branching, depth))} nodes, more than all the levels above it together.`,
      };
    }
    replaceContent(treeNote, note ? [zhNode(note.zh, 'teach', 'p'), enNode(note.en, 'p')] : null);
  }

  function renderDeeper() {
    replaceContent(deeperBody, deeperRows(branching, rate).map((row) => {
      const approx = row.atDepth < 1e15 ? describeCount(row.atDepth) : null;
      const duration = describeDuration(row.seconds);
      const universe = universeNote(row.seconds);
      return h('tr', {},
        h('th', { scope: 'row' }, String(row.depth)),
        h('td', {},
          h('span', { class: 'tree-growth__count-number' }, formatInteger(row.atDepth)),
          approx ? h('span', { class: 'tree-growth__approx' }, zhNode(approx.zh, 'gloss'), ' ', enNode(approx.en)) : null),
        h('td', {},
          zhNode(duration.zh, 'label', 'span', 'tree-growth__time-zh'),
          enNode(duration.en, 'span', 'tree-growth__time-en'),
          universe ? h('span', { class: 'tree-growth__universe' }, zhNode(universe.zh, 'teach'), ' ', enNode(universe.en)) : null));
    }));
  }

  function announce() {
    const total = totalNodes(branching, depth);
    const duration = describeDuration(searchSeconds(total, rate));
    announcer.textContent = `b = ${branching}，d = ${depth}：第 ${depth} 层 ${formatInteger(nodesAtDepth(branching, depth))} 个节点，一共 ${formatInteger(total)} 个，${duration.zh}。`
      + ` b = ${branching}, d = ${depth}: ${formatInteger(nodesAtDepth(branching, depth))} nodes at depth ${depth}, ${formatInteger(total)} in total, ${duration.en}.`;
  }

  return () => {};
}

function slider(id, range, value) {
  return h('input', {
    id,
    class: 'tree-growth__range',
    type: 'range',
    min: range.min,
    max: range.max,
    step: 1,
    value,
  });
}

function field(id, label, input, output) {
  return h('div', { class: 'tree-growth__field' },
    h('label', { class: 'tree-growth__label', for: id }, zhNode(label.zh, 'label'), ' ', enNode(label.en)),
    h('div', { class: 'tree-growth__slider-row' }, input, output));
}

function countNote(count, formula) {
  const approx = describeCount(count);
  return [
    h('span', { class: 'tree-growth__formula' }, formula),
    approx ? h('span', { class: 'tree-growth__approx' }, zhNode(approx.zh, 'gloss'), ' ', enNode(approx.en)) : null,
  ];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
