/**
 * "易错点" list of common confusions, styled as a red warning strip.
 * “易错点”列表：常见混淆点，以红色警示条呈现。
 */
import { h } from '../../../core/dom/element.js';
import { hasText, zhNode } from '../../../core/text/bilingual.js';
import { blockTag, listOf, secondaryEn } from './lesson-block.js';

export const stylesheet = new URL('./pitfall-block.css', import.meta.url);

export function render(block) {
  const items = listOf(block.items).filter((item) => hasText(item.zh) || hasText(item.en));
  return h('div', { class: 'pitfall-block' },
    blockTag({ zh: '易错点', en: 'Watch out', iconName: 'alert', tone: 'danger' }),
    h('ul', { class: 'pitfall-block__list', role: 'list' }, items.map((item) => h('li', { class: 'pitfall-block__item' },
      zhNode(item.zh, 'teach', 'p', 'pitfall-block__zh'),
      secondaryEn(item.en)))));
}
