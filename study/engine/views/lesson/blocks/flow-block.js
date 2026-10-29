/**
 * A sequence of steps joined by arrows (pipelines, algorithms). Two to four short steps run left to
 * right when their box is wide enough; longer flows, and every flow on a phone, run top to bottom.
 * 用箭头连起来的步骤序列（流程、算法）。2 到 4 个简短步骤在容器够宽时从左到右排列；更长的流程以及手机上一律从上到下排列。
 */
import { h } from '../../../core/dom/element.js';
import { biTitle, enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { rowClass } from './flow-layout.js';
import { asBi, blockTag, listOf } from './lesson-block.js';

export const stylesheet = new URL('./flow-block.css', import.meta.url);

export function render(block) {
  const items = listOf(block.items).filter((item) => hasText(item.en) || hasText(item.zh));
  const title = asBi(block.title);
  return h('div', { class: ['flow-block', rowClass(items)] },
    blockTag({ zh: '流程', en: 'Flow', iconName: 'arrowRight' }),
    title ? h('p', { class: 'flow-block__title' }, biTitle(title)) : null,
    h('ol', { class: 'flow-block__steps', role: 'list' }, items.map((item, index) => h('li', { class: 'flow-block__step' },
      h('span', { class: 'flow-block__num', 'aria-hidden': 'true' }, String(index + 1)),
      h('div', { class: 'flow-block__body' },
        enNode(item.en, 'p', 'flow-block__en'),
        zhNode(item.zh, 'gloss', 'p', 'flow-block__zh'))))));
}
