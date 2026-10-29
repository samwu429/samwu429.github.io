/**
 * One flip card of the flashcards page: prompt on the front, answer on the back.
 * The 3D flip lives in flashcards-view.css and turns into a plain swap under reduced motion.
 * 闪卡页面中的单张翻转卡：正面是提示，背面是答案。3D 翻转效果写在 flashcards-view.css 中，减少动态效果时改为直接切换。
 */
import { appendChildren, h } from '../../core/dom/element.js';
import { blurredChinese, enNode, hasText, zhNode } from '../../core/text/bilingual.js';
import { stripMarkup } from '../../core/text/inline-markup.js';
import { badge } from '../../components/badges/badge.js';
import { speakButton } from '../../components/text/speak-button.js';
import { hasVisibleClue, maskAnswer } from './logic/answer-mask.js';

export const DIRECTIONS = Object.freeze({ EN_ZH: 'en-zh', ZH_EN: 'zh-en' });

const STATUS_BADGES = {
  known: { text: '已认识 Known', tone: 'accent' },
  learning: { text: '不熟 Learning', tone: 'warn' },
};
const NEW_BADGE = { text: '新卡 New', tone: 'muted' };

/**
 * Builds the card for one glossary term.
 *   direction - 'en-zh': English term as the prompt; 'zh-en': Chinese prompt with the English answer masked
 *   unitLabel - e.g. "Lec 3 · Lab 3"; status - stored flashcard status ('known' | 'learning' | null)
 *   onFlip    - called when the learner clicks or taps the card surface
 * Returns { element, setFlipped(flipped), promptText, answerText } (texts are for screen-reader announcements).
 * 为一个术语生成卡片。direction 为 'en-zh' 时用英文术语作提示，为 'zh-en' 时用中文作提示并遮住英文答案；
 * unitLabel 例如 "Lec 3 · Lab 3"；status 为已保存的状态；onFlip 在点击卡面时调用。
 * 返回 { element, setFlipped, promptText, answerText }，后两者用于读屏播报。
 */
export function createFlashcard(term, { direction = DIRECTIONS.EN_ZH, unitLabel = '', status = null, onFlip } = {}) {
  const definition = term.def && typeof term.def === 'object' ? term.def : {};
  const englishName = hasText(term.en) ? term.en : term.id;
  const prompt = direction === DIRECTIONS.ZH_EN ? chinesePrompt(term, definition) : englishPrompt(englishName, term.en);

  const front = h('div', { class: 'flashcards-card__face flashcards-card__face--front' },
    eyebrow(unitLabel, status),
    prompt.node,
    h('p', { class: 'flashcards-card__tap', 'aria-hidden': 'true' }, '点卡片或按空格翻面 Tap or press Space to flip'));
  const back = h('div', { class: 'flashcards-card__face flashcards-card__face--back' },
    eyebrow(unitLabel, status),
    answer(term, englishName, definition));
  const element = h('div', { class: 'flashcards-card', role: 'group', 'aria-label': '闪卡 Flashcard', tabindex: '-1' },
    h('div', { class: 'flashcards-card__inner' }, front, back));

  element.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest('button, a, input, select, textarea, label')) return;
    // In English-practice mode a tap on blurred Chinese reveals it instead of flipping the card.
    // 英文练习模式下，点模糊的中文是为了显示它，而不是翻面。
    if (blurredChinese(target)) return;
    if (hasSelectionInside(element)) return;
    onFlip?.();
  });

  function setFlipped(flipped) {
    element.classList.toggle('is-flipped', flipped);
    // The hidden face leaves the tab order and the accessibility tree.
    // 被翻到背后的那一面同时移出 Tab 顺序与无障碍树。
    front.toggleAttribute('inert', flipped);
    back.toggleAttribute('inert', !flipped);
    front.setAttribute('aria-hidden', String(flipped));
    back.setAttribute('aria-hidden', String(!flipped));
  }

  setFlipped(false);
  return {
    element,
    setFlipped,
    promptText: prompt.text,
    answerText: [stripMarkup(englishName), stripMarkup(term.zh)].filter(Boolean).join(' — '),
  };
}

function englishPrompt(englishName, speakText) {
  return {
    text: stripMarkup(englishName),
    node: h('div', { class: 'flashcards-card__prompt' },
      h('p', { class: 'flashcards-card__ask' }, '这个英文术语是什么意思？ What does it mean?'),
      h('div', { class: 'flashcards-card__term-row' },
        enNode(englishName, 'h2', 'flashcards-card__term'),
        speakButton(speakText, { className: 'flashcards-card__speak' }))),
  };
}

function chinesePrompt(term, definition) {
  const name = maskAnswer(term.zh, term.en);
  const clue = maskAnswer(definition.zh, term.en);
  const nameShown = hasVisibleClue(name) ? name : '';
  const clueShown = hasVisibleClue(clue) ? clue : '';
  // If masking leaves nothing readable (the Chinese name is just the English word), fall back to the raw name.
  // 如果遮挡后什么都看不出来（中文名本身就是英文单词），就退回显示原始名称。
  const title = nameShown || (clueShown ? '' : String(term.zh || ''));
  return {
    text: [stripMarkup(title), stripMarkup(clueShown)].filter(Boolean).join(' '),
    node: h('div', { class: 'flashcards-card__prompt' },
      h('p', { class: 'flashcards-card__ask' }, '英文术语怎么写？ What is the English term?'),
      // The Chinese is the question on this side, so it uses the always-visible label role.
      // 这一面的中文就是题目本身，所以使用始终可见的 label 角色。
      zhNode(title, 'label', 'h2', 'flashcards-card__term flashcards-card__term--zh'),
      zhNode(clueShown, 'label', 'p', 'flashcards-card__clue')),
  };
}

function answer(term, englishName, definition) {
  const hasDefinition = hasText(definition.en) || hasText(definition.zh);
  return h('div', { class: 'flashcards-card__answer' },
    h('div', { class: 'flashcards-card__term-row' },
      enNode(englishName, 'h2', 'flashcards-card__term'),
      speakButton(term.en, { className: 'flashcards-card__speak' })),
    zhNode(term.zh, 'gloss', 'p', 'flashcards-card__zh'),
    hasDefinition
      ? h('div', { class: 'flashcards-card__def' },
        h('p', { class: 'flashcards-card__label' }, '考试定义 Exam definition'),
        withSpeech(enNode(definition.en, 'p', 'flashcards-card__def-en'), definition.en),
        zhNode(definition.zh, 'teach', 'p', 'flashcards-card__def-zh'))
      : null);
}

function eyebrow(unitLabel, status) {
  const meta = STATUS_BADGES[status] || NEW_BADGE;
  return h('div', { class: 'flashcards-card__eyebrow' },
    unitLabel ? h('span', { class: 'flashcards-card__units' }, unitLabel) : null,
    badge(meta.text, meta.tone));
}

function withSpeech(node, text) {
  if (node) appendChildren(node, [speakButton(text, { className: 'flashcards-card__speak' })]);
  return node;
}

// A drag that selects text on the card should not also flip it.
// 在卡片上拖动选中文字时不应同时翻面。
function hasSelectionInside(element) {
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
  return Boolean(selection && !selection.isCollapsed && selection.anchorNode && element.contains(selection.anchorNode));
}
