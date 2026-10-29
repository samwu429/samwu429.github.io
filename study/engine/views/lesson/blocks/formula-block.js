/**
 * Formula box: the expression, its Chinese explanation, and an optional "where" list of symbols.
 * 公式框：公式本身、中文解释，以及可选的符号说明列表（其中……）。
 */
import { h } from '../../../core/dom/element.js';
import { enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { renderInline } from '../../../core/text/inline-markup.js';
import { blockTag, listOf, secondaryEn } from './lesson-block.js';

export const stylesheet = new URL('./formula-block.css', import.meta.url);

function symbolText(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function render(block) {
  const where = listOf(block.where).filter((item) => hasText(symbolText(item.symbol)));
  return h('div', { class: 'formula-block' },
    blockTag({ zh: '公式', en: 'Formula', iconName: 'sigma' }),
    h('p', { class: ['formula', 'formula-block__expr'], lang: 'en' }, renderInline(symbolText(block.expr))),
    zhNode(block.zh, 'teach', 'p', 'formula-block__zh'),
    secondaryEn(block.en),
    where.length ? h('div', { class: 'formula-block__where' },
      h('p', { class: 'formula-block__where-title' }, '其中 Where'),
      h('dl', { class: 'formula-block__terms' }, where.map((item) => h('div', { class: 'formula-block__term' },
        h('dt', { class: 'formula-block__symbol', lang: 'en' }, renderInline(symbolText(item.symbol))),
        h('dd', { class: 'formula-block__meaning' },
          zhNode(item.zh, 'gloss', 'span', 'formula-block__meaning-zh'),
          enNode(item.en, 'span', 'formula-block__meaning-en')))))) : null);
}
