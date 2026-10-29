/**
 * Everyday analogy card ("生活类比"), with an optional note on where the analogy stops working.
 * 生活类比卡片，可附“类比的局限”说明类比在哪里不再成立。
 */
import { h } from '../../../core/dom/element.js';
import { zhNode } from '../../../core/text/bilingual.js';
import { asBi, blockTag, secondaryEn } from './lesson-block.js';

export const stylesheet = new URL('./analogy-block.css', import.meta.url);

export function render(block) {
  const limit = asBi(block.limit);
  return h('div', { class: 'analogy-block' },
    blockTag({ zh: '生活类比', en: 'Analogy', iconName: 'bulb', tone: 'warn' }),
    zhNode(block.zh, 'teach', 'p', 'analogy-block__text'),
    secondaryEn(block.en),
    limit ? h('div', { class: 'analogy-block__limit' },
      blockTag({ zh: '类比的局限', en: 'Where it breaks', iconName: 'alert', tone: 'danger', size: 'sm' }),
      zhNode(limit.zh, 'teach', 'p', 'analogy-block__limit-text'),
      secondaryEn(limit.en)) : null);
}
