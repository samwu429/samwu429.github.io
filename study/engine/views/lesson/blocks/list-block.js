/**
 * Bullet or numbered list with an optional title. Items may be Chinese, English or both;
 * when both are present the Chinese line leads and the English follows in a lighter tone.
 * 带可选标题的项目符号或编号列表。条目可以是中文、英文或中英都有；两者都有时中文在前、英文以浅色跟在后面。
 */
import { h } from '../../../core/dom/element.js';
import { biTitle, enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { asBi, listOf } from './lesson-block.js';

export const stylesheet = new URL('./list-block.css', import.meta.url);

export function render(block) {
  const numbered = block.style === 'number';
  const title = asBi(block.title);
  const items = listOf(block.items).filter((item) => hasText(item.zh) || hasText(item.en));
  return h('div', { class: 'list-block' },
    title ? h('p', { class: 'list-block__title' }, biTitle(title)) : null,
    h(numbered ? 'ol' : 'ul', {
      class: ['list-block__list', numbered ? 'list-block__list--number' : 'list-block__list--bullet'],
      role: 'list',
    }, items.map((item) => h('li', { class: 'list-block__item' },
      zhNode(item.zh, 'teach', 'span', 'list-block__zh'),
      enNode(item.en, 'span', hasText(item.zh) ? 'list-block__en list-block__en--secondary' : 'list-block__en')))));
}
