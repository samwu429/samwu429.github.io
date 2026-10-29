/**
 * DOM helpers shared by the machine-learning widgets: bilingual labels, formula text, legend icons.
 * 机器学习类组件共用的 DOM 工具：双语标签、公式文本与图例小图标。
 */
import { h, s } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { enNode, hasText, zhNode } from '../../../core/text/bilingual.js';

export function ensureSharedStyles() {
  return ensureStylesheet(new URL('./ml-shared.css', import.meta.url));
}

/**
 * Short UI label: Chinese first, English after. `role` is the Chinese role class (label, teach, gloss).
 * 简短界面文字：中文在前、英文在后。role 为中文节点的角色类名。
 */
export function biLabel(zh, en, role = 'label') {
  return [zhNode(zh, role), hasText(zh) && hasText(en) ? ' ' : null, enNode(en)];
}

/** Bilingual config value ({ zh, en }) as a label. 将配置中的双语值渲染为标签。 */
export function biValue(value, role = 'label') {
  return value ? biLabel(value.zh, value.en, role) : null;
}

/** Plain text of a bilingual value, for aria labels: "叶子宽度 Leaf width". 双语值的纯文本，用于无障碍标签。 */
export function biText(value) {
  return [value?.zh, value?.en].filter(hasText).join(' ');
}

/** Chinese teaching sentence followed by its English version, as two lines. 中文讲解句与英文句，分两行。 */
export function teachPair(zh, en, className) {
  return h('p', { class: ['ml-teach', className] },
    zhNode(zh, 'teach', 'span', 'ml-teach__zh'),
    enNode(en, 'span', 'ml-teach__en'));
}

const INDEXED_SYMBOL = /([wx])(\d)(?![\d.])/g;

/**
 * Formula text with indexed symbols written as subscripts, like the slides: "w0 + w1x1" -> w₀ + w₁x₁.
 * 公式文本，带编号的符号写成下标，与课件一致：“w0 + w1x1” 显示为 w₀ + w₁x₁。
 */
export function mathText(text, className) {
  const source = String(text ?? '');
  const span = h('span', { class: ['ml-math', className] });
  let last = 0;
  for (const match of source.matchAll(INDEXED_SYMBOL)) {
    if (match.index > last) span.append(source.slice(last, match.index));
    span.append(match[1], h('sub', {}, match[2]));
    last = match.index + match[0].length;
  }
  if (last < source.length) span.append(source.slice(last));
  return span;
}

/**
 * Small inline SVG used in legends; `draw` returns the shapes inside a 20 x 20 box.
 * 图例用的小型内联 SVG；draw 返回 20 x 20 方框内的图形。
 */
export function legendIcon(draw, className) {
  return s('svg', { class: ['ml-legend__icon', className], viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true' }, draw());
}

/** Marker shapes centred at (0, 0), so the same shape serves the plot and the legend. 以 (0, 0) 为中心的点形状。 */
export function markerShape(shape, size = 6.5) {
  if (shape === 'square') return s('rect', { x: -size + 0.5, y: -size + 0.5, width: 2 * size - 1, height: 2 * size - 1, rx: 1 });
  if (shape === 'triangle') return s('path', { d: `M0 ${-size - 1} L${size + 1} ${size} L${-size - 1} ${size} Z` });
  if (shape === 'diamond') return s('path', { d: `M0 ${-size - 1} L${size + 1} 0 L0 ${size + 1} L${-size - 1} 0 Z` });
  return s('circle', { r: size });
}
