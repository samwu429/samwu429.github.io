/**
 * Code listing shown verbatim (never parsed as markup) with its language and a Chinese explanation.
 * 原样显示的代码（不解析任何标记），附语言名称与中文解释。
 */
import { h } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { hasText, zhNode } from '../../../core/text/bilingual.js';

export const stylesheet = new URL('./code-block.css', import.meta.url);

const LANGUAGE_NAMES = {
  pencilcode: 'PencilCode',
  python: 'Python',
  javascript: 'JavaScript',
  coffeescript: 'CoffeeScript',
  text: 'Text',
};

export function render(block, scope) {
  const language = hasText(block.language) ? block.language.trim() : 'text';
  const name = LANGUAGE_NAMES[language.toLowerCase()] || language;
  const labelId = scope.uid('code-label');
  return h('figure', { class: 'code-block' },
    h('div', { class: 'code-block__bar', id: labelId },
      icon('code', { size: 16 }),
      h('span', { class: 'code-block__label' }, '代码 Code'),
      h('span', { class: 'code-block__lang', lang: 'en' }, name)),
    h('pre', { class: 'code-block__pre', tabindex: '0', 'aria-labelledby': labelId },
      h('code', { class: 'code-block__code', lang: 'en' }, typeof block.code === 'string' ? block.code : '')),
    hasText(block.zh) ? h('figcaption', { class: 'code-block__caption' }, zhNode(block.zh, 'teach', 'p', 'code-block__zh')) : null);
}
