/**
 * Question card: one question of any type (CONTENT_SPEC 4.3) with its answer controls, grading and
 * bilingual feedback.
 * 题目卡片：任意题型（CONTENT_SPEC 4.3）的一道题，含作答控件、判分与中英反馈。
 *
 * mode "practice": "提交 Submit" grades at once, shows feedback and records progress.
 * mode "exam": answers are collected silently; the paper calls reveal() at hand-in and finalize()
 * once the learner has ticked the scoring points of a written answer.
 * practice 模式：提交即判分、显示解析并记录进度。exam 模式：只收集答案；交卷时由试卷调用 reveal()，
 * 主观题勾完评分要点后调用 finalize()。
 *
 * Keyboard: 1-9 pick options, Enter submits and then moves on (onNext), Ctrl+Enter submits a written answer.
 * 键盘：1-9 选择选项；Enter 提交，答完后再按 Enter 进入下一题（onNext）；书写题用 Ctrl+Enter 提交。
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { icon } from '../../../core/dom/icons.js';
import { isActivatable, isTextEntry } from '../../../core/dom/keyboard.js';
import { biTitle, enNode, hasText, scriptText, zhNode } from '../../../core/text/bilingual.js';
import { renderInline } from '../../../core/text/inline-markup.js';
import { optionLetter } from '../../../core/util/format.js';
import { badge } from '../../../components/badges/badge.js';
import { button } from '../../../components/controls/button.js';
import { speakButton } from '../../../components/text/speak-button.js';
import {
  containsChinese,
  correctAnswerText,
  countWords,
  formatNumber,
  gradeQuestion,
  hasResponse,
  parseNumber,
  withUnit,
} from '../logic/grading.js';
import { questionTable } from '../logic/question-table.js';
import { isKnownType, isWrittenType, scoringPoints } from '../logic/question-types.js';
import { difficultyBadge, lessonHref, typeBadge, typeLabel, unitKicker } from './labels.js';

const STYLESHEET = new URL('./question-card.css', import.meta.url);

const TF_OPTIONS = Object.freeze([
  { value: true, key: 'T', text: { en: 'True', zh: '对（正确）' } },
  { value: false, key: 'F', text: { en: 'False', zh: '错（错误）' } },
]);

const UNIT_TITLES = { '%': '百分比 percent', pp: '百分点 percentage points' };

const CALC_HINTS = {
  sign: { zh: '大小对了，但正负号反了：检查是谁减谁。', en: 'The size is right but the sign is flipped; check the order of the subtraction.' },
  'ratio-for-percent': { zh: '你写的是小数比例，题目要百分比：再乘以 100。', en: 'You wrote a ratio; the question wants a percentage, so multiply by 100.' },
  close: { zh: '非常接近了：检查四舍五入和保留几位小数。', en: 'Very close; check the rounding and the number of decimal places.' },
  unreadable: { zh: '没认出这个数字，只写数字即可，例如 87.5。', en: 'That is not a number; type digits only, e.g. 87.5.' },
};

let serial = 0;

export function ensureQuestionCardStyles() {
  return ensureStylesheet(STYLESHEET);
}

/**
 * The question's data table (logic/question-table.js) as a figure that scrolls inside its own box.
 * Cells are exam material, so they stay visible in every language mode.
 * 题目数据表（见 logic/question-table.js），宽表在自身容器内滚动。单元格属于试题内容，在所有语言模式下都保持可见。
 */
function tableFigure(table, uid) {
  if (!table) return null;
  const captionId = table.caption ? `${uid}-table-caption` : null;
  return h('figure', { class: 'question-card__table' },
    table.caption ? h('figcaption', { class: 'question-card__table-caption', id: captionId }, biTitle(table.caption)) : null,
    h('div', {
      class: 'table-scroll',
      tabindex: '0',
      role: 'region',
      'aria-labelledby': captionId || undefined,
      'aria-label': captionId ? undefined : '题目数据表 Data table',
    },
    h('table', { class: 'data-table' },
      table.headers.length
        ? h('thead', {}, h('tr', {}, table.headers.map((text) => h('th', { scope: 'col' }, scriptText(text, { role: 'label' })))))
        : null,
      h('tbody', {}, table.rows.map((row) => h('tr', {}, row.map((text) => h('td', {}, scriptText(text, { role: 'label' })))))))));
}

/**
 * Creates a card. Options:
 *   context        course context; progress.recordAnswer() is called when `record` is true
 *   mode           'practice' (default) | 'exam'
 *   number         question number shown in the heading ("第 3 题 Question 3")
 *   unit           unit meta from course.json, shown as a badge (practice) or after grading (exam)
 *   headingLevel   2-6, level of the card heading
 *   record         record the final result in progress (default: practice mode only)
 *   selfScore      'confirm' (own confirm button, default in practice) | 'external' (parent calls finalize())
 *   assistShown    start with the Chinese translation visible
 *   onAnswered(result, card)  final result available (objective: on submit; written: after self-scoring)
 *   onChange(card)            the learner changed the answer
 *   onNext()                  Enter pressed after the question is done
 *   onAssistToggle(shown)     the learner toggled "显示中文 Show Chinese"
 * Returns { element, question, getResponse, hasResponse, getResult, phase, submit, reveal, finalize,
 *           handleKey, setAssistShown, focus }.
 * 创建题目卡片；参数与返回值见上。
 */
export function createQuestionCard(question, options = {}) {
  const {
    context = null,
    mode = 'practice',
    number = null,
    unit = null,
    headingLevel = 2,
    record = mode === 'practice',
    selfScore = mode === 'practice' ? 'confirm' : 'external',
    assistShown = false,
    onAnswered = null,
    onChange = null,
    onNext = null,
    onAssistToggle = null,
  } = options;

  serial += 1;
  const uid = `question-card-${serial}`;
  const type = isKnownType(question?.type) ? question.type : null;
  const written = isWrittenType(type);
  const practice = mode === 'practice';
  const prompt = question?.prompt || {};
  const state = { phase: 'open', result: null };

  let choices = [];
  let choiceGroup = null;
  let calcInput = null;
  let signButton = null;
  let textarea = null;
  let meter = null;
  let pointBoxes = [];
  let scoreLine = null;
  let confirmButton = null;
  let verdictSlot = null;

  const level = Math.min(6, Math.max(2, Number(headingLevel) || 2));
  const heading = h(`h${level}`, { class: 'question-card__title', id: `${uid}-title`, tabindex: '-1' },
    number ? `第 ${number} 题 Question ${number}` : (type ? typeLabel(type) : '题目 Question'));

  const hasAssist = hasText(prompt.en) && (hasText(prompt.zh)
    || type === 'tf'
    || (Array.isArray(question?.options) && question.options.some((option) => hasText(option?.zh))));
  const assistToggle = hasAssist
    ? button({
      label: '显示中文 Show Chinese',
      iconName: 'translate',
      variant: 'ghost',
      size: 'sm',
      pressed: false,
      className: 'question-card__assist',
      onClick: () => {
        const next = !root.classList.contains('show-assist');
        setAssistShown(next);
        onAssistToggle?.(next);
      },
    })
    : null;

  const badges = h('div', { class: 'question-card__badges' },
    number && type ? typeBadge(type) : null,
    practice && unit ? badge(unitKicker(unit), 'accent') : null,
    difficultyBadge(question?.difficulty));

  const promptMain = hasText(prompt.en)
    ? h('p', { class: ['question-card__prompt-en', 'en'], id: `${uid}-prompt`, lang: 'en' }, renderInline(prompt.en))
    : h('p', { class: 'question-card__prompt-en', id: `${uid}-prompt`, lang: 'zh-CN' }, renderInline(prompt.zh || ''));
  const promptBox = h('div', { class: 'question-card__prompt' },
    h('div', { class: 'question-card__prompt-line' }, promptMain, speakButton(prompt.en, { className: 'question-card__speak' })),
    hasText(prompt.en) ? zhNode(prompt.zh, 'assist', 'p', 'question-card__prompt-zh') : null,
    tableFigure(questionTable(question), uid));

  const answerArea = buildAnswerArea();
  const submitButton = practice && type
    ? button({ label: '提交 Submit', iconName: 'check', variant: 'primary', type: 'submit', className: 'question-card__submit' })
    : null;
  const keyHint = practice ? keyboardHint() : null;
  // Visible messages (e.g. "choose an answer first") and a hidden channel for verdicts.
  // 可见的提示信息（例如“先选一个答案”），以及只供读屏软件播报判分结果的隐藏区域。
  const status = h('p', { class: 'question-card__status', role: 'status' });
  const announcer = h('p', { class: 'visually-hidden', role: 'status' });
  const feedback = h('div', { class: 'question-card__feedback', tabindex: '-1', hidden: true });

  const form = h('form', {
    class: 'question-card__form',
    novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      if (practice) submit();
    },
  },
  h('div', { class: 'question-card__head' }, heading, badges, assistToggle),
  promptBox,
  answerArea,
  submitButton || keyHint ? h('div', { class: 'question-card__actions' }, submitButton, keyHint) : null,
  status,
  announcer,
  feedback);

  const root = h('article', {
    class: ['question-card', `question-card--${type || 'unknown'}`],
    'aria-labelledby': `${uid}-title`,
    dataset: { questionId: String(question?.id ?? '') },
  }, form);
  root.addEventListener('keydown', onCardKeydown);
  if (assistShown) setAssistShown(true);

  // ---- answer controls 作答控件 ----

  function buildAnswerArea() {
    if (type === 'mcq' || type === 'multi' || type === 'tf') return buildChoices();
    if (type === 'calc') return buildCalc();
    if (written) return buildWritten();
    return h('p', { class: 'question-card__notice' }, `暂不支持这种题型 Unsupported question type: ${String(question?.type ?? '')}`);
  }

  function optionText(option) {
    const value = typeof option === 'string' ? { en: option } : (option || {});
    if (hasText(value.en)) {
      return [enNode(value.en, 'span', 'question-card__option-en'), zhNode(value.zh, 'assist', 'span', 'question-card__option-zh')];
    }
    return [zhNode(value.zh, 'label', 'span', 'question-card__option-en')];
  }

  function buildChoices() {
    const multiple = type === 'multi';
    const source = type === 'tf' ? TF_OPTIONS.map((option) => option.text) : (Array.isArray(question.options) ? question.options : []);
    if (!source.length) return h('p', { class: 'question-card__notice' }, '这道题缺少选项 This question has no options.');
    choices = source.map((option, index) => {
      const input = h('input', {
        class: 'question-card__option-input',
        type: multiple ? 'checkbox' : 'radio',
        name: `${uid}-choice`,
        value: String(index),
        onchange: handleInputChange,
      });
      const verdict = h('span', { class: 'question-card__option-verdict' });
      const label = h('label', { class: ['question-card__option', multiple ? 'question-card__option--check' : 'question-card__option--radio'] },
        input,
        h('span', { class: 'question-card__option-key', 'aria-hidden': 'true' }, type === 'tf' ? TF_OPTIONS[index].key : optionLetter(index)),
        h('span', { class: 'question-card__option-text' }, optionText(option), verdict));
      return { input, label, verdict };
    });
    choiceGroup = h('fieldset', { class: 'question-card__choices', 'aria-labelledby': `${uid}-prompt` },
      choices.map((choice) => choice.label));
    if (!multiple) return choiceGroup;
    return h('div', { class: 'question-card__choice-wrap' },
      h('p', { class: 'question-card__hint' }, '多选题：选出所有正确的选项 Select every correct option'),
      choiceGroup);
  }

  function buildCalc() {
    const unitText = typeof question.unit === 'string' ? question.unit.trim() : '';
    calcInput = h('input', {
      class: ['input', 'question-card__calc-input'],
      id: `${uid}-calc`,
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      enterkeyhint: 'done',
      'aria-describedby': `${uid}-calc-hint`,
      oninput: handleInputChange,
    });
    // Some phone keypads for decimals have no minus key, so the sign gets its own button.
    // 部分手机的小数键盘没有负号键，因此单独提供正负号按钮。
    signButton = h('button', {
      type: 'button',
      class: 'question-card__calc-sign',
      title: '加上或去掉负号 Toggle the minus sign',
      'aria-label': '加上或去掉负号 Toggle the minus sign',
      onclick: toggleSign,
    }, '±');
    return h('div', { class: 'question-card__calc' },
      h('label', { class: 'field__label', for: calcInput.id }, '你的答案 Your answer'),
      h('div', { class: 'question-card__calc-row' },
        signButton,
        calcInput,
        unitText ? h('span', { class: 'question-card__calc-unit', title: UNIT_TITLES[unitText] || unitText }, unitText) : null),
      h('p', { class: 'question-card__hint', id: `${uid}-calc-hint` },
        unitText ? `只写数字，单位 ${unitText} 已经写好了 Numbers only; the unit is already there` : '只写数字，可以有小数点和负号 Numbers only; decimals and minus signs are fine'));
  }

  function toggleSign() {
    if (!calcInput || calcInput.readOnly) return;
    const value = calcInput.value.trim();
    calcInput.value = /^[-−－]/.test(value) ? value.slice(1) : `-${value}`;
    calcInput.focus();
    handleInputChange();
  }

  function buildWritten() {
    textarea = h('textarea', {
      class: ['textarea', 'question-card__textarea'],
      id: `${uid}-text`,
      rows: type === 'long' ? 8 : 4,
      lang: 'en',
      spellcheck: 'true',
      autocapitalize: 'sentences',
      'aria-describedby': `${uid}-text-hint`,
      oninput: () => {
        updateMeter();
        handleInputChange();
      },
    });
    meter = h('p', { class: 'question-card__meter' });
    updateMeter();
    return h('div', { class: 'question-card__written' },
      h('label', { class: 'field__label', for: textarea.id }, '用英文写你的答案 Write your answer in English'),
      h('p', { class: 'question-card__hint', id: `${uid}-text-hint` },
        type === 'long' ? '写一段完整的英文，约 80–180 词 One full paragraph, about 80-180 words' : '写 1–3 句英文就够 1-3 English sentences are enough'),
      textarea,
      meter);
  }

  function updateMeter() {
    if (!meter || !textarea) return;
    const words = countWords(textarea.value);
    const chinese = containsChinese(textarea.value);
    meter.classList.toggle('is-warn', chinese);
    meter.textContent = `${words} 词 words${chinese ? ' · 考试要用英文作答 The exam needs English answers' : ''}`;
  }

  function keyboardHint() {
    let text = '';
    if (choices.length) text = `键盘 Keys: 1–${choices.length} 选择 choose · Enter 提交 submit`;
    else if (type === 'calc') text = '键盘 Keys: Enter 提交 submit';
    else if (written) text = '键盘 Keys: Ctrl + Enter 提交 submit';
    return text ? h('p', { class: ['kbd-hint', 'question-card__keys'] }, text) : null;
  }

  // ---- responses and keyboard 作答读取与键盘 ----

  function readResponse() {
    switch (type) {
      case 'mcq': {
        const index = choices.findIndex((choice) => choice.input.checked);
        return index >= 0 ? index : null;
      }
      case 'multi':
        return choices.flatMap((choice, index) => (choice.input.checked ? [index] : []));
      case 'tf': {
        const index = choices.findIndex((choice) => choice.input.checked);
        return index >= 0 ? TF_OPTIONS[index].value : null;
      }
      case 'calc':
        return calcInput ? calcInput.value : '';
      case 'short':
      case 'long':
        return {
          text: textarea ? textarea.value : '',
          covered: pointBoxes.flatMap((box, index) => (box.checked ? [index] : [])),
        };
      default:
        return null;
    }
  }

  function handleInputChange() {
    for (const choice of choices) choice.label.classList.toggle('is-selected', choice.input.checked);
    if (status.textContent) status.textContent = '';
    onChange?.(api);
  }

  function onCardKeydown(event) {
    if (event.defaultPrevented) return;
    const { target } = event;
    if (event.key === 'Enter') {
      if (target instanceof HTMLTextAreaElement) {
        if ((event.ctrlKey || event.metaKey) && handleKey(event)) event.preventDefault();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isActivatable(target)) return;
      if (handleKey(event)) event.preventDefault();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || isTextEntry(target)) return;
    if (handleKey(event)) event.preventDefault();
  }

  /**
   * Shortcut handling shared with page-level listeners; returns true when the key was used.
   * 快捷键处理（页面级监听也会调用）；用掉了按键时返回 true。
   */
  function handleKey(event) {
    const key = event?.key;
    if (key === 'Enter') {
      if (!practice || !type) return false;
      if (state.phase === 'open' || (state.phase === 'scoring' && selfScore === 'confirm')) {
        submit();
        return true;
      }
      if (state.phase === 'done' && typeof onNext === 'function') {
        onNext();
        return true;
      }
      return false;
    }
    if (state.phase !== 'open' || !choices.length || !/^[1-9]$/.test(String(key))) return false;
    const choice = choices[Number(key) - 1];
    if (!choice) return false;
    choice.input.checked = type === 'multi' ? !choice.input.checked : true;
    choice.input.focus();
    handleInputChange();
    return true;
  }

  // ---- grading flow 判分流程 ----

  function setStatus(text) {
    status.textContent = text;
  }

  function announce(text) {
    announcer.textContent = text;
  }

  function lockInputs() {
    if (choiceGroup) choiceGroup.disabled = true;
    if (calcInput) calcInput.readOnly = true;
    if (signButton) signButton.disabled = true;
    if (textarea) textarea.readOnly = true;
    if (submitButton) submitButton.hidden = true;
    if (keyHint) keyHint.hidden = true;
    setStatus('');
    root.classList.add('is-locked');
  }

  function focusFeedback() {
    feedback.focus({ preventScroll: true });
    feedback.scrollIntoView({ block: 'nearest' });
  }

  /** Practice mode: validate, grade and show feedback (written answers open self-scoring). 练习模式提交。 */
  function submit() {
    if (!practice || !type) return null;
    if (state.phase === 'scoring') return finalize();
    if (state.phase === 'done') return state.result;
    const response = readResponse();
    if (!hasResponse(question, response)) {
      // A blank written answer is not self-scored, so ticking points can never make it "correct".
      // 空白的主观题不进入自评，避免勾几个要点就被算成“答对”。
      let prompt = '先选一个答案再提交 Choose an answer first';
      if (written) prompt = '先用英文写下你的答案，再对照参考答案 Write your answer in English first, then compare it with the model answer';
      else if (type === 'calc') prompt = '先填一个数字再提交 Type a number first';
      setStatus(prompt);
      (textarea || calcInput || choices[0]?.input)?.focus();
      return null;
    }
    if (type === 'calc' && parseNumber(response, { unit: question.unit }) === null) {
      setStatus(`${CALC_HINTS.unreadable.zh} ${CALC_HINTS.unreadable.en}`);
      calcInput.focus();
      return null;
    }
    lockInputs();
    if (written) {
      openScoring();
      announce('参考答案已显示，请勾选你写到的要点。The model answer is shown; tick the points you covered.');
      focusFeedback();
      return null;
    }
    const result = gradeQuestion(question, response);
    showObjectiveFeedback(result);
    announce(verdictSpeech(result));
    focusFeedback();
    finish(result);
    return result;
  }

  /** Exam mode: grade without validation; written answers open self-scoring. 考试模式交卷时判分。 */
  function reveal({ announceResult = false } = {}) {
    if (state.phase !== 'open' || !type) return state.result;
    lockInputs();
    if (written) {
      openScoring();
      return null;
    }
    const result = gradeQuestion(question, readResponse());
    showObjectiveFeedback(result);
    if (announceResult) announce(verdictSpeech(result));
    finish(result);
    return result;
  }

  /** Locks the self-score of a written answer and produces its result. 锁定主观题自评并得出结果。 */
  function finalize() {
    if (state.phase === 'done' || !type) return state.result;
    if (!written) return reveal();
    if (state.phase === 'open') {
      lockInputs();
      openScoring();
    }
    const result = gradeQuestion(question, readResponse());
    for (const box of pointBoxes) box.disabled = true;
    if (confirmButton) confirmButton.hidden = true;
    if (verdictSlot) {
      replaceContent(verdictSlot, icon(result.correct ? 'check' : 'cross', { size: 20 }), writtenVerdictText(result));
      verdictSlot.className = `question-card__verdict ${result.correct ? 'question-card__verdict--right' : 'question-card__verdict--wrong'}`;
    }
    if (practice) {
      announce(writtenVerdictText(result));
      focusFeedback();
    }
    finish(result);
    return result;
  }

  function finish(result) {
    state.result = result;
    state.phase = 'done';
    root.classList.remove('is-scoring');
    root.classList.add('is-done', result.correct ? 'is-correct' : 'is-incorrect');
    if (record && question?.id && typeof context?.progress?.recordAnswer === 'function') {
      context.progress.recordAnswer(question.id, Boolean(result.correct));
    }
    onAnswered?.(result, api);
  }

  // ---- feedback 反馈 ----

  function verdictSpeech(result) {
    if (result.correct) return '答对了 Correct.';
    const answer = correctAnswerText(question);
    return `${result.answered ? '答错了 Incorrect.' : '未作答 Not answered.'}${answer ? ` 正确答案 Correct answer: ${answer}` : ''}`;
  }

  function writtenVerdictText(result) {
    if (!result.answered) return '没有写答案，这题不得分 Nothing was written: no marks';
    return result.correct
      ? `写到 ${result.coveredCount} / ${result.total} 个要点，算答对 Covered ${result.coveredCount} of ${result.total}: counts as correct`
      : `写到 ${result.coveredCount} / ${result.total} 个要点，还不够 Covered ${result.coveredCount} of ${result.total}: not enough yet`;
  }

  function choiceText(index) {
    if (!Number.isInteger(index)) return '';
    return type === 'tf' ? TF_OPTIONS[index]?.text.en || '' : optionLetter(index);
  }

  function markChoices(result) {
    let answers = [];
    if (type === 'multi') answers = result.expected;
    else if (type === 'tf') answers = result.expected === null ? [] : [result.expected ? 0 : 1];
    else if (result.expected !== null) answers = [result.expected];
    const answerSet = new Set(answers);
    choices.forEach(({ input, label, verdict }, index) => {
      const isAnswer = answerSet.has(index);
      let mark = null;
      if (isAnswer && input.checked) mark = ['is-correct', 'check', '选对了 Correct'];
      else if (isAnswer) mark = type === 'multi' ? ['is-missed', 'check', '漏选了 Missed'] : ['is-correct', 'check', '正确答案 Correct answer'];
      else if (input.checked) mark = ['is-wrong', 'cross', '选错了 Wrong choice'];
      if (!mark) return;
      label.classList.add(mark[0]);
      replaceContent(verdict, icon(mark[1], { size: 14 }), mark[2]);
    });
  }

  function objectiveFacts(result) {
    const facts = [];
    const answer = correctAnswerText(question);
    if (type === 'mcq' || type === 'tf') {
      if (!result.correct && answer) facts.push(['正确答案 Correct answer', answer]);
      if (result.answered && !result.correct) facts.push(['你的选择 Your choice', choiceText(type === 'tf' ? (result.value ? 0 : 1) : result.choice)]);
    } else if (type === 'multi') {
      if (!result.correct && answer) facts.push(['正确答案 Correct answer', answer]);
      if (result.answered) {
        facts.push(['你的选择 Your choice', result.selected.map(optionLetter).join(', ')]);
        facts.push(['对照 Tally', `选对 ${result.hits.length} / ${result.expected.length} · 漏选 ${result.missed.length} · 多选 ${result.extra.length} | Found ${result.hits.length} of ${result.expected.length}, ${result.missed.length} missed, ${result.extra.length} extra`]);
      }
    } else if (type === 'calc') {
      const tolerance = result.tolerance > 0 ? `（允许误差 ±${formatNumber(result.tolerance)} tolerance）` : '';
      if (answer) facts.push(['正确答案 Correct answer', `${answer}${tolerance}`]);
      facts.push(['你的答案 Your answer', result.answered ? withUnit(formatNumber(result.value), result.unit) : '未作答 none']);
    }
    if (!facts.length) return null;
    return h('dl', { class: 'question-card__facts' },
      facts.map(([label, value]) => h('div', { class: 'question-card__fact' }, h('dt', {}, label), h('dd', {}, value))));
  }

  function calcHint(result) {
    const hint = type === 'calc' && result.hint ? CALC_HINTS[result.hint] : null;
    if (!hint) return null;
    return h('p', { class: 'question-card__calc-hint' }, icon('flag', { size: 16 }),
      h('span', {}, hint.zh, ' ', h('span', { lang: 'en' }, hint.en)));
  }

  function sourceLine() {
    if (practice || !unit) return null;
    return h('p', { class: 'question-card__source' }, `出自 From: ${unitKicker(unit)}`);
  }

  function explanationBlock() {
    const explain = question?.explain || {};
    if (!hasText(explain.zh) && !hasText(explain.en)) return null;
    return h('div', { class: 'question-card__explain' },
      h('p', { class: 'question-card__label' }, '解析 Explanation'),
      zhNode(explain.zh, 'teach', 'p', 'question-card__explain-zh'),
      hasText(explain.en)
        ? h('p', { class: 'question-card__explain-en' }, enNode(explain.en), speakButton(explain.en))
        : null);
  }

  function modelAnswerBlock() {
    const model = question?.modelAnswer || {};
    if (!hasText(model.en) && !hasText(model.zh)) return null;
    return h('div', { class: 'question-card__model' },
      h('p', { class: 'question-card__label' }, '参考答案 Model answer', speakButton(model.en)),
      enNode(model.en, 'p', 'question-card__model-en'),
      zhNode(model.zh, hasText(model.en) ? 'gloss' : 'teach', 'p', 'question-card__model-zh'));
  }

  function reviewLink() {
    const href = lessonHref(question);
    return href ? h('a', { class: 'question-card__review', href }, icon('book', { size: 16 }), '复习这一节 Review this section') : null;
  }

  function showObjectiveFeedback(result) {
    if (choices.length) markChoices(result);
    let verdictText = '答错了 Incorrect';
    if (result.correct) verdictText = '答对了 Correct';
    else if (!result.answered) verdictText = '未作答 Not answered';
    replaceContent(feedback,
      h('p', { class: ['question-card__verdict', result.correct ? 'question-card__verdict--right' : 'question-card__verdict--wrong'] },
        icon(result.correct ? 'check' : 'cross', { size: 20 }), verdictText),
      sourceLine(),
      objectiveFacts(result),
      calcHint(result),
      explanationBlock(),
      reviewLink());
    feedback.hidden = false;
  }

  function openScoring() {
    state.phase = 'scoring';
    const points = scoringPoints(question);
    const needed = Math.ceil(points.length / 2);
    // A blank paper answer (exam mode) has nothing to grade: its points stay locked at zero.
    // 试卷上空着的主观题（考试模式）没有可自评的内容：要点保持锁定，计 0 分。
    const blank = !textarea || !textarea.value.trim();
    pointBoxes = [];
    const rows = points.map((point) => {
      const box = h('input', { type: 'checkbox', class: 'question-card__point-input', disabled: blank, onchange: updateScoreLine });
      pointBoxes.push(box);
      return h('li', {}, h('label', { class: 'question-card__point' },
        box,
        h('span', { class: 'question-card__point-body' },
          h('span', { class: 'question-card__point-tag' }, '我写到了 I covered this'),
          enNode(point.en, 'span', 'question-card__point-en'),
          zhNode(point.zh, hasText(point.en) ? 'gloss' : 'label', 'span', 'question-card__point-zh'))));
    });
    scoreLine = h('p', { class: 'question-card__score' });
    confirmButton = selfScore === 'confirm'
      ? button({ label: '确认自评 Confirm my score', iconName: 'check', variant: 'primary', onClick: () => finalize() })
      : null;
    verdictSlot = blank
      ? h('p', { class: ['question-card__verdict', 'question-card__verdict--wrong'] }, icon('cross', { size: 20 }), '未作答 Not answered')
      : h('p', { class: ['question-card__verdict', 'question-card__verdict--neutral'] }, icon('eye', { size: 20 }), '对照参考答案自评 Compare and grade yourself');
    replaceContent(feedback,
      verdictSlot,
      sourceLine(),
      modelAnswerBlock(),
      h('fieldset', { class: 'question-card__points' },
        h('legend', { class: 'question-card__points-title' }, '评分要点：勾选你写到的 Scoring points: tick what you covered'),
        h('p', { class: 'question-card__hint' }, blank
          ? '这题没有写答案，不得分；可以对照参考答案学习。Nothing was written, so this question scores 0; study the model answer.'
          : `写到 ${needed} / ${points.length} 个就算答对 Cover ${needed} of ${points.length} to count as correct`),
        h('ul', { class: 'question-card__point-list' }, rows),
        scoreLine,
        confirmButton),
      explanationBlock(),
      reviewLink());
    feedback.hidden = false;
    root.classList.add('is-scoring');
    updateScoreLine();
  }

  function updateScoreLine() {
    let covered = 0;
    for (const box of pointBoxes) {
      box.closest('.question-card__point')?.classList.toggle('is-checked', box.checked);
      if (box.checked) covered += 1;
    }
    if (scoreLine) scoreLine.textContent = `已勾选 ${covered} / ${pointBoxes.length} Covered ${covered} of ${pointBoxes.length}`;
  }

  function setAssistShown(value) {
    const on = Boolean(value);
    root.classList.toggle('show-assist', on);
    assistToggle?.setAttribute('aria-pressed', String(on));
  }

  const api = {
    element: root,
    question,
    getResponse: readResponse,
    hasResponse: () => hasResponse(question, readResponse()),
    getResult: () => state.result,
    get phase() {
      return state.phase;
    },
    submit,
    reveal,
    finalize,
    handleKey,
    setAssistShown,
    // Moves focus to the card heading and, unless told otherwise, brings the card to the top of the view.
    // 把焦点移到题目标题；默认同时把卡片滚动到视野顶部。
    focus({ preventScroll = false } = {}) {
      heading.focus({ preventScroll: true });
      if (!preventScroll) root.scrollIntoView({ block: 'start' });
    },
  };
  return api;
}
