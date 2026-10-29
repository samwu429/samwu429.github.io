/**
 * Static tree diagram drawn as SVG from a content TreeNode: MAX nodes are upward triangles, MIN nodes
 * downward triangles, leaves squares and other nodes circles. A collapsible text outline repeats the
 * tree for small screens and screen readers.
 * 由内容 TreeNode 绘制的静态树形图（SVG）：MAX 为尖角朝上的三角形，MIN 为尖角朝下的三角形，叶子为方形，其他节点为圆形。
 * 可展开的文字版重复同一棵树，方便小屏幕与读屏软件。
 */
import { h, s } from '../../../core/dom/element.js';
import { scriptText, zhNode } from '../../../core/text/bilingual.js';
import { scriptMix, scriptRuns } from '../../../core/text/script-runs.js';
import { asBi, blockTag, secondaryEn } from './lesson-block.js';
import { TREE_METRICS, describeNode, describeTree, layoutTree, normalizeTree } from './tree-layout.js';

export const stylesheet = new URL('./tree-block.css', import.meta.url);

// Below this scale the labels get too small to read, so the canvas scrolls sideways instead.
// 缩小到这个比例以下标签就看不清了，此时改为在画布内横向滚动。
const MIN_SCALE = 0.72;

const LEGEND = [
  { shape: 'max', zh: '我方回合，取最大', en: 'MAX: our turn' },
  { shape: 'min', zh: '对手回合，取最小', en: 'MIN: opponent' },
  { shape: 'leaf', zh: '叶子', en: 'Leaf' },
  { shape: 'node', zh: '节点', en: 'Node' },
];

function shapeElement(node) {
  const className = ['tree-block__shape', `tree-block__shape--${node.shape}`];
  if (node.points) return s('polygon', { class: className, points: node.points });
  if (node.shape === 'leaf') {
    return s('rect', {
      class: className,
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
      width: node.width,
      height: node.height,
      rx: 3,
    });
  }
  return s('circle', { class: className, cx: node.x, cy: node.y, r: node.width / 2 });
}

function runSpans(text) {
  return scriptRuns(text).map((run) => {
    if (run.script === 'zh') return s('tspan', { class: ['zh', 'zh-teach'], lang: 'zh-CN' }, run.text);
    if (run.script === 'en') return s('tspan', { lang: 'en' }, run.text);
    return run.text;
  });
}

/**
 * Diagram text that still follows the language modes: an all-Chinese label is teaching text as a
 * whole, and in a mixed label each Chinese run gets its own <tspan>, revealed together.
 * 同样遵循语言模式的图中文字：纯中文标签整体作为讲解文字；中英混排的标签中每段中文各占一个 <tspan>，并一起显示。
 */
function labelText(classNames, lines, fontSize) {
  const mix = scriptMix(lines.map((line) => line.text).join(' '));
  const attributes = { class: classNames, 'text-anchor': 'middle', 'font-size': fontSize };
  if (mix === 'zh') Object.assign(attributes, { class: [...classNames, 'zh', 'zh-teach'], lang: 'zh-CN' });
  else if (mix === 'en') attributes.lang = 'en';
  else if (mix === 'mixed') attributes.class = [...classNames, 'bi-mixed'];
  return s('text', attributes, lines.map((line) => s('tspan', { x: line.x, y: line.y },
    mix === 'mixed' ? runSpans(line.text) : line.text)));
}

function nodeGroup(node) {
  return s('g', { class: 'tree-block__node' },
    shapeElement(node),
    node.value ? s('text', {
      class: 'tree-block__value',
      x: node.x,
      y: node.valueY,
      'text-anchor': 'middle',
      'font-size': TREE_METRICS.valueFont,
    }, node.value) : null,
    node.lines.length
      ? labelText(['tree-block__label', node.grid ? 'tree-block__label--grid' : null], node.lines, TREE_METRICS.labelFont)
      : null);
}

function edgeTag(node) {
  const tag = node.edgeTag;
  return s('g', { class: 'tree-block__edge' },
    s('rect', { class: 'tree-block__edge-box', x: tag.x, y: tag.y, width: tag.width, height: tag.height, rx: 4 }),
    labelText(['tree-block__edge-text'], tag.lines, TREE_METRICS.edgeFont));
}

function swatch(shape) {
  const className = ['tree-block__shape', `tree-block__shape--${shape}`];
  let mark;
  if (shape === 'max') mark = s('polygon', { class: className, points: '8,2 14.5,13.5 1.5,13.5' });
  else if (shape === 'min') mark = s('polygon', { class: className, points: '1.5,2.5 14.5,2.5 8,14' });
  else if (shape === 'leaf') mark = s('rect', { class: className, x: 2.5, y: 2.5, width: 11, height: 11, rx: 1.5 });
  else mark = s('circle', { class: className, cx: 8, cy: 8, r: 5.5 });
  return s('svg', { class: 'tree-block__swatch', width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, mark);
}

// The legend only matters for game trees, where the shapes carry the MAX/MIN meaning.
// 图例只对博弈树有意义，因为那里的形状表示 MAX/MIN。
function legend(nodes) {
  const shapes = new Set(nodes.map((node) => node.shape));
  if (!shapes.has('max') && !shapes.has('min')) return null;
  return h('ul', { class: 'tree-block__legend', role: 'list', 'aria-label': '图例 Legend' },
    LEGEND.filter((item) => shapes.has(item.shape)).map((item) => h('li', { class: 'tree-block__legend-item' },
      swatch(item.shape),
      zhNode(item.zh, 'label', 'span'),
      h('span', { class: 'tree-block__legend-en', lang: 'en' }, item.en))));
}

function outlineList(nodes) {
  return h('ul', { class: 'tree-block__outline-list' }, nodes.map((node) => h('li', { class: 'tree-block__outline-item' },
    h('span', { class: 'tree-block__outline-node' },
      node.edge ? h('span', { class: 'tree-block__outline-edge' },
        h('span', { class: 'visually-hidden' }, '经过 via '),
        scriptText(node.edge)) : null,
      h('span', { class: ['tree-block__outline-label', node.label.includes('\n') ? 'tree-block__outline-label--grid' : null] },
        scriptText(describeNode({ label: node.label }))),
      node.shape === 'max' || node.shape === 'min'
        ? h('span', { class: `tree-block__outline-role tree-block__outline-role--${node.shape}` }, node.shape.toUpperCase())
        : null,
      node.value ? h('span', { class: 'tree-block__outline-value' }, `= ${node.value}`) : null),
    node.children.length ? outlineList(node.children) : null)));
}

export function render(block) {
  const layout = layoutTree(block.root);
  const caption = asBi(block.caption);
  if (!layout.nodes.length) {
    return h('div', { class: 'tree-block' }, h('p', { class: 'tree-block__note' }, '这个树形图没有数据 This tree has no data'));
  }
  const svg = s('svg', {
    class: 'tree-block__svg',
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    width: layout.width,
    height: layout.height,
    role: 'img',
    'aria-label': describeTree(block.root),
    style: { maxWidth: `${layout.width}px`, minWidth: `${Math.round(layout.width * MIN_SCALE)}px` },
  },
  s('g', { class: 'tree-block__links' }, layout.links.map((link) => s('line', {
    class: 'tree-block__link', x1: link.x1, y1: link.y1, x2: link.x2, y2: link.y2,
  }))),
  s('g', { class: 'tree-block__edges' }, layout.nodes.filter((node) => node.edgeTag).map(edgeTag)),
  s('g', { class: 'tree-block__nodes' }, layout.nodes.map(nodeGroup)));

  return h('div', { class: 'tree-block' },
    blockTag({ zh: '树形图', en: 'Tree diagram', iconName: 'tree' }),
    h('figure', { class: 'tree-block__figure' },
      h('div', { class: 'tree-block__canvas', tabindex: '0', role: 'region', 'aria-label': '树形图（较宽时可横向滚动）Tree diagram' }, svg),
      caption ? h('figcaption', { class: 'tree-block__caption' },
        zhNode(caption.zh, 'teach', 'p', 'tree-block__caption-zh'),
        secondaryEn(caption.en)) : null),
    legend(layout.nodes),
    layout.truncated
      ? h('p', { class: 'tree-block__note' }, `这棵树太大，只画出了前 ${layout.count} 个节点。Only the first ${layout.count} nodes are drawn.`)
      : null,
    h('details', { class: 'tree-block__outline' },
      h('summary', { class: 'tree-block__outline-summary' }, '文字版 Text outline'),
      outlineList([normalizeTree(block.root).root])));
}
