/**
 * Worked example: a title, numbered steps (Chinese teaching, optional English) and an answer box.
 * 例题：标题、编号步骤（中文讲解，可附英文）与答案框。
 */
import { h } from '../../../core/dom/element.js';
import { biTitle, hasText, zhNode } from '../../../core/text/bilingual.js';
import { asBi, blockTag, listOf, secondaryEn } from './lesson-block.js';

export const stylesheet = new URL('./example-block.css', import.meta.url);

export function render(block) {
  const title = asBi(block.title);
  const answer = asBi(block.answer);
  const steps = listOf(block.steps).filter((step) => hasText(step.zh) || hasText(step.en));
  return h('div', { class: 'example-block' },
    blockTag({ zh: '例题', en: 'Worked example', iconName: 'list' }),
    title ? h('p', { class: 'example-block__title' }, biTitle(title)) : null,
    steps.length ? h('ol', { class: 'example-block__steps', role: 'list' }, steps.map((step, index) => h('li', { class: 'example-block__step' },
      h('span', { class: 'example-block__num', 'aria-hidden': 'true' }, String(index + 1)),
      h('div', { class: 'example-block__step-body' },
        h('span', { class: 'visually-hidden' }, `第 ${index + 1} 步 Step ${index + 1}: `),
        zhNode(step.zh, 'teach', 'p', 'example-block__step-zh'),
        secondaryEn(step.en))))) : null,
    answer ? h('div', { class: 'example-block__answer' },
      blockTag({ zh: '答案', en: 'Answer', iconName: 'check', tone: 'accent', size: 'sm' }),
      // The Chinese line is the conclusion when it stands alone, and a gloss when English is given.
      // 只有中文时它就是结论（讲解），有英文时它是英文答案的释义。
      zhNode(answer.zh, hasText(answer.en) ? 'gloss' : 'teach', 'p', 'example-block__answer-zh'),
      secondaryEn(answer.en, { speak: true, className: 'example-block__answer-en' })) : null);
}
