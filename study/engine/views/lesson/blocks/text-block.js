/**
 * Plain teaching paragraph in Chinese, with an optional English line (often the slide's own words).
 * 中文讲解段落，可附一行英文（常为课件或大纲原文）。
 */
import { h } from '../../../core/dom/element.js';
import { enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { speakButton } from '../../../components/text/speak-button.js';

export const stylesheet = new URL('./text-block.css', import.meta.url);

export function render(block) {
  return h('div', { class: 'text-block' },
    zhNode(block.zh, 'teach', 'p', 'text-block__zh'),
    hasText(block.en)
      ? h('p', { class: 'text-block__en' }, enNode(block.en, 'span', 'text-block__en-text'), speakButton(block.en))
      : null);
}
