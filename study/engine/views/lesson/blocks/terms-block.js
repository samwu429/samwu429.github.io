/**
 * Key vocabulary as a grid of term chips: English term (with read-aloud), Chinese meaning, one-line hint.
 * 关键词卡片网格：英文术语（可朗读）、中文意思与一句提示。
 */
import { h } from '../../../core/dom/element.js';
import { enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { speakButton } from '../../../components/text/speak-button.js';
import { blockTag, listOf } from './lesson-block.js';

export const stylesheet = new URL('./terms-block.css', import.meta.url);

export function render(block) {
  const items = listOf(block.items).filter((item) => hasText(item.en) || hasText(item.zh));
  return h('div', { class: 'terms-block' },
    blockTag({ zh: '关键词', en: 'Key terms', iconName: 'translate', tone: 'accent' }),
    h('ul', { class: 'terms-block__grid', role: 'list' }, items.map((item) => h('li', { class: 'terms-block__chip' },
      hasText(item.en)
        ? h('p', { class: 'terms-block__en' }, enNode(item.en, 'span', 'terms-block__term'), speakButton(item.en))
        : null,
      zhNode(item.zh, 'gloss', 'p', 'terms-block__zh'),
      zhNode(item.hint, 'teach', 'p', 'terms-block__hint')))));
}
