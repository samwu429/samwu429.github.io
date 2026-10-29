/**
 * Callout note by tone: info "补充" (extra or outside-the-slides facts), tip "提示", warn "注意".
 * 按语气区分的提示框：info“补充”（补充或课件外内容）、tip“提示”、warn“注意”。
 */
import { h } from '../../../core/dom/element.js';
import { enNode, zhNode } from '../../../core/text/bilingual.js';
import { icon } from '../../../core/dom/icons.js';
import { secondaryEn } from './lesson-block.js';

export const stylesheet = new URL('./note-block.css', import.meta.url);

const TONES = {
  info: { zh: '补充', en: 'Extra', iconName: 'info' },
  tip: { zh: '提示', en: 'Tip', iconName: 'bulb' },
  warn: { zh: '注意', en: 'Caution', iconName: 'alert' },
};

export function render(block) {
  const tone = Object.hasOwn(TONES, block.tone) ? block.tone : 'info';
  const meta = TONES[tone];
  return h('div', { class: ['note-block', 'callout', `callout--${tone}`, `note-block--${tone}`] },
    h('p', { class: 'note-block__label' },
      icon(meta.iconName, { size: 16 }),
      zhNode(meta.zh, 'label', 'span'),
      enNode(meta.en, 'span', 'note-block__label-en')),
    zhNode(block.zh, 'teach', 'p', 'note-block__zh'),
    secondaryEn(block.en));
}
