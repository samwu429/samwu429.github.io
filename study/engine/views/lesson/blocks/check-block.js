/**
 * Inline multiple-choice quick check in exam English. A "Show Chinese" toggle reveals the
 * translations of this one question; choosing an option gives instant, announced feedback and
 * the explanation, and "Try again" resets it.
 * 课内英文选择题小测验。“显示中文”开关只显示本题的翻译；选择后立即给出（读屏可听到的）反馈与解析，“再试一次”可重置。
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { optionLetter } from '../../../core/util/format.js';
import { button } from '../../../components/controls/button.js';
import { speakButton } from '../../../components/text/speak-button.js';
import { answerIndex, judgeChoice, optionStates } from './check-logic.js';
import { asBi, assistToggle, blockTag, listOf, secondaryEn } from './lesson-block.js';

export const stylesheet = new URL('./check-block.css', import.meta.url);

const MARKS = {
  correct: { iconName: 'check', text: '正确答案 Correct answer' },
  wrong: { iconName: 'cross', text: '你的选择，不正确 Your choice, incorrect' },
  chosen: { iconName: null, text: '你的选择 Your choice' },
};

function markContent(state) {
  const mark = MARKS[state];
  if (!mark) return [];
  return [mark.iconName ? icon(mark.iconName, { size: 18 }) : null, h('span', { class: 'visually-hidden' }, mark.text)];
}

function verdictContent(result, answer) {
  if (result === 'correct') return [icon('check', { size: 18 }), '答对了！Correct!'];
  if (result === 'wrong') {
    const letter = optionLetter(answer);
    return [icon('cross', { size: 18 }), `不对哦，正确答案是 ${letter}。Not quite: the answer is ${letter}.`];
  }
  return ['已记录你的选择，请看下面的解析。See the explanation below.'];
}

// When an English line is missing, its Chinese text must stay visible instead of hiding as a translation.
// 缺少英文时，中文不能作为“翻译”被隐藏，而要直接显示。
function translationRole(value) {
  return hasText(value?.en) ? 'assist' : 'teach';
}

export function render(block, scope) {
  const question = asBi(block.question) || {};
  const options = listOf(block.options).map(asBi).filter(Boolean);
  const answer = answerIndex(block.answer, options.length);
  const explain = asBi(block.explain);
  const questionId = scope.uid('check-question');
  let root = null;
  let chosen = null;

  const verdict = h('p', { class: 'check-block__verdict', role: 'status' });
  const explanation = explain ? h('div', { class: 'check-block__explain', hidden: true },
    blockTag({ zh: '解析', en: 'Explanation', iconName: 'info', size: 'sm' }),
    zhNode(explain.zh, 'teach', 'p', 'check-block__explain-zh'),
    secondaryEn(explain.en)) : null;
  const retry = button({
    label: '再试一次 Try again',
    iconName: 'refresh',
    variant: 'ghost',
    size: 'sm',
    className: 'check-block__retry',
    onClick: () => reset(),
  });
  retry.hidden = true;

  const optionButtons = options.map((option, index) => h('button', {
    type: 'button',
    class: 'check-block__option',
    onclick: () => choose(index),
  },
  h('span', { class: 'check-block__letter' }, optionLetter(index)),
  h('span', { class: 'check-block__option-text' },
    enNode(option.en, 'span', 'check-block__option-en'),
    zhNode(option.zh, translationRole(option), 'span', 'check-block__option-zh')),
  h('span', { class: 'check-block__mark' })));

  function choose(index) {
    if (chosen !== null) return;
    chosen = index;
    const states = optionStates(answer, index, options.length);
    optionButtons.forEach((optionButton, position) => {
      // aria-disabled (not disabled) keeps the options focusable so the result can still be read.
      // 用 aria-disabled 而不是 disabled，选项仍可聚焦，读屏用户可以回看结果。
      optionButton.setAttribute('aria-disabled', 'true');
      optionButton.dataset.state = states[position];
      replaceContent(optionButton.querySelector('.check-block__mark'), markContent(states[position]));
    });
    const result = judgeChoice(answer, index);
    root.dataset.result = result;
    replaceContent(verdict, verdictContent(result, answer));
    if (explanation) explanation.hidden = false;
    retry.hidden = false;
  }

  function reset() {
    chosen = null;
    optionButtons.forEach((optionButton) => {
      optionButton.removeAttribute('aria-disabled');
      delete optionButton.dataset.state;
      replaceContent(optionButton.querySelector('.check-block__mark'));
    });
    delete root.dataset.result;
    replaceContent(verdict);
    if (explanation) explanation.hidden = true;
    retry.hidden = true;
    optionButtons[0]?.focus();
  }

  // The toggle only makes sense when at least one English line has a hidden translation.
  // 只有至少一行英文带有被隐藏的翻译时，开关才有意义。
  const toggle = [question, ...options].some((value) => hasText(value.en) && hasText(value.zh))
    ? assistToggle(() => root)
    : null;

  root = h('div', { class: 'check-block' },
    h('div', { class: 'check-block__head' },
      blockTag({ zh: '小测验', en: 'Quick check', iconName: 'help', tone: 'accent' }),
      toggle),
    h('div', { class: 'check-block__question', id: questionId },
      hasText(question.en)
        ? h('p', { class: 'check-block__question-en' }, enNode(question.en, 'span', 'check-block__question-text'), speakButton(question.en))
        : null,
      zhNode(question.zh, translationRole(question), 'p', 'check-block__question-zh')),
    h('div', { class: 'check-block__options', role: 'group', 'aria-labelledby': questionId }, optionButtons),
    verdict,
    explanation,
    retry);
  return root;
}
