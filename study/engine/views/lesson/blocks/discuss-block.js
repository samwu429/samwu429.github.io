/**
 * Discussion prompt from the slides (likely long-answer material) with a hidden model answer:
 * the English answer to write on the exam plus a Chinese explanation of the scoring points.
 * 课件中的讨论题（很可能是长答题素材），参考答案默认收起：包括考试可照写的英文答案与得分点的中文解析。
 */
import { h } from '../../../core/dom/element.js';
import { enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { button, setButtonLabel } from '../../../components/controls/button.js';
import { speakButton } from '../../../components/text/speak-button.js';
import { asBi, assistToggle, blockTag } from './lesson-block.js';

export const stylesheet = new URL('./discuss-block.css', import.meta.url);

const SHOW_LABEL = '看参考答案 Show model answer';
const HIDE_LABEL = '收起参考答案 Hide model answer';

export function render(block, scope) {
  const prompt = asBi(block.prompt) || {};
  const answer = asBi(block.answer);
  const panelId = scope.uid('discuss-answer');
  let root = null;

  const panel = answer ? h('div', { class: 'discuss-block__answer', id: panelId, hidden: true },
    hasText(answer.en) ? h('div', { class: 'discuss-block__model' },
      blockTag({ zh: '参考答案', en: 'Model answer', iconName: 'pencil', tone: 'exam', size: 'sm' }),
      h('p', { class: 'discuss-block__model-en' }, enNode(answer.en, 'span', 'discuss-block__model-text'), speakButton(answer.en))) : null,
    hasText(answer.zh) ? h('div', { class: 'discuss-block__explain' },
      blockTag({ zh: '中文解析', en: 'Explanation', iconName: 'info', size: 'sm' }),
      zhNode(answer.zh, 'teach', 'p', 'discuss-block__explain-zh')) : null) : null;

  const reveal = panel ? button({
    label: SHOW_LABEL,
    iconName: 'eye',
    variant: 'secondary',
    size: 'sm',
    className: 'discuss-block__reveal',
    onClick: () => {
      const open = panel.hidden;
      panel.hidden = !open;
      reveal.setAttribute('aria-expanded', String(open));
      setButtonLabel(reveal, open ? HIDE_LABEL : SHOW_LABEL);
    },
  }) : null;
  if (reveal) {
    reveal.setAttribute('aria-expanded', 'false');
    reveal.setAttribute('aria-controls', panelId);
  }

  const toggle = hasText(prompt.en) && hasText(prompt.zh) ? assistToggle(() => root) : null;

  root = h('div', { class: 'discuss-block' },
    h('div', { class: 'discuss-block__head' },
      blockTag({ zh: '讨论题', en: 'Discuss', iconName: 'chat', tone: 'signal' }),
      toggle),
    h('div', { class: 'discuss-block__prompt' },
      hasText(prompt.en)
        ? h('p', { class: 'discuss-block__prompt-en' }, enNode(prompt.en, 'span', 'discuss-block__prompt-text'), speakButton(prompt.en))
        : null,
      zhNode(prompt.zh, hasText(prompt.en) ? 'assist' : 'teach', 'p', 'discuss-block__prompt-zh')),
    reveal ? h('div', { class: 'discuss-block__actions' },
      reveal,
      h('span', { class: 'discuss-block__hint' }, '先自己想一想，再看答案 Think first, then check')) : null,
    panel);
  return root;
}
