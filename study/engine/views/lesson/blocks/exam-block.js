/**
 * "考试这样写" card: English sentences to memorise for the exam, each with read-aloud and a Chinese gloss.
 * “考试这样写”卡片：可直接写进考卷的英文句子，每句可朗读并附中文释义。
 */
import { h } from '../../../core/dom/element.js';
import { biTitle, enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { speakButton } from '../../../components/text/speak-button.js';
import { asBi, blockTag, listOf } from './lesson-block.js';

export const stylesheet = new URL('./exam-block.css', import.meta.url);

const DEFAULT_LABEL_ZH = '考试这样写';

export function render(block) {
  const items = listOf(block.items).filter((item) => hasText(item.en) || hasText(item.zh));
  const label = asBi(block.label);
  // The role tag already says "考试这样写", so a content label is only shown when it adds something.
  // 角色标签已经写着“考试这样写”，内容里的标签只有提供新信息时才显示。
  const extraLabel = label && label.zh !== DEFAULT_LABEL_ZH ? label : null;
  return h('div', { class: 'exam-block' },
    h('div', { class: 'exam-block__head' },
      blockTag({ zh: DEFAULT_LABEL_ZH, en: 'Exam English', iconName: 'pencil', tone: 'exam' }),
      extraLabel ? h('p', { class: 'exam-block__label' }, biTitle(extraLabel)) : null),
    h('ul', { class: 'exam-block__list', role: 'list' }, items.map((item) => h('li', { class: 'exam-block__item' },
      hasText(item.en)
        ? h('p', { class: 'exam-block__en' }, enNode(item.en, 'span', 'exam-block__sentence'), speakButton(item.en))
        : null,
      zhNode(item.zh, 'gloss', 'p', 'exam-block__zh')))));
}
