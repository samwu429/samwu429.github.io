/**
 * Widget "concept-sorter": a general sorting drill (content-spec section 5.5). One item at a time, the learner
 * picks the category it belongs to and sees right or wrong with the correct category and the reason; at the end
 * the score and the missed items are reviewed, and "Try again" reshuffles the items while the category buttons
 * keep their order. Lessons use it for any classification a test asks for (depth cues, drug classes, levels of
 * awareness, types of learning).
 * 组件“concept-sorter”：通用的分类练习（内容规范第 5.5 节）。一次一道题，学习者选出它属于哪一类，马上看到对错、正确类别和原因；
 * 做完后看成绩、复习答错的题目，“再练一次”会重新打乱题目顺序，类别按钮的顺序不变。讲义用它练考试会问的各种分类
 * （深度线索、药物类别、意识水平、学习类型）。
 *
 * Config: { title: Bi, prompt: Bi, categories: [{ id: "monocular", label: Bi }], items: [{ text: Bi, answer: "monocular", why: Bi }] }
 * Every sentence and every state change comes from concept-sorter-logic.js; this module only builds and updates the DOM.
 * 所有句子和状态变化都来自 concept-sorter-logic.js；本模块只负责构建和更新 DOM。
 *
 * Keyboard: Tab to a category and press Enter or Space, or press its number key. Focus then moves to "Next"
 * (Enter continues); on the next item it moves to the item heading, from which Tab reaches the first category.
 * 键盘：用 Tab 移到类别上按回车或空格，或者直接按它的数字键。之后焦点移到“下一题”（按回车继续）；下一题出现时焦点回到题目标题，
 * 再按 Tab 就到第一个类别。
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { isTextEntry } from '../../../core/dom/keyboard.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { button, setButtonLabel } from '../../../components/controls/button.js';
import {
  PHASE, UI_TEXT, choiceAnnouncement, choiceStates, chooseCategory, currentAnswer, currentItem, goToNext,
  gradeChoice, invalidText, isRepeatClick, keyHintText, missedTitle, nextLabel, normalizeConceptSorterConfig, progressOf,
  progressText, progressValueText, restartAnnouncement, restartRound, scoreAdvice, scoreText, shortcutIndex,
  startRound, summarizeRound, summaryAnnouncement, verdictText,
} from './concept-sorter-logic.js';

let mountCount = 0;

// Toggled at the end of a live message so that a repeated message is announced again (U+00A0).
// 加在朗读消息末尾、交替出现的不换行空格（U+00A0），让重复的消息也会再次播报。
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

/* ---------- Small builders 小型构件 ---------- */

/** Short UI label: Chinese (always visible) first, English after. 简短界面文字：中文（始终可见）在前、英文在后。 */
function label(text) {
  return [zhNode(text.zh, 'label'), hasText(text.zh) && hasText(text.en) ? ' ' : null, enNode(text.en)];
}

/** Chinese teaching sentence with its English version on the next line. 中文讲解句，下一行是对应的英文。 */
function pair(text, className) {
  return h('p', { class: ['concept-sorter__pair', className] },
    zhNode(text.zh, 'teach', 'span', 'concept-sorter__zh'),
    enNode(text.en, 'span', 'concept-sorter__en'));
}

/**
 * Content in exam English with its Chinese meaning below (blurred in English practice mode); Chinese without
 * any English is teaching text.
 * 考试英文内容，下面是中文意思（英文练习模式下模糊）；完全没有英文时，中文按讲解文字处理。
 */
function glossed(text, className) {
  return h('span', { class: ['concept-sorter__glossed', className] },
    enNode(text.en, 'span', 'concept-sorter__glossed-en'),
    zhNode(text.zh, hasText(text.en) ? 'gloss' : 'teach', 'span', 'concept-sorter__glossed-zh'));
}

/**
 * A category name: the Chinese label stays visible in every language mode (it also sits inside buttons, where
 * tapping blurred text would press the button), then the English name.
 * 类别名称：中文标签在任何语言模式下都可见（它也出现在按钮里，点模糊文字会顺带按下按钮），后面是英文名称。
 */
function categoryName(category, className) {
  if (!category) return null;
  return h('span', { class: ['concept-sorter__category', className] },
    zhNode(category.label.zh, 'label', 'span', 'concept-sorter__category-zh'),
    enNode(category.label.en, 'span', 'concept-sorter__category-en'));
}

/**
 * "Your choice: X" or "Correct category: Y" with a cross or a check, so the line never depends on colour alone.
 * “你的选择：X”或“正确类别：Y”，带叉号或对勾，不只靠颜色区分。
 */
function categoryLine(kind, text, category) {
  return h('p', { class: ['concept-sorter__line', `concept-sorter__line--${kind}`] },
    icon(kind === 'answer' ? 'check' : 'cross', { size: 16 }),
    h('span', { class: 'concept-sorter__line-label' }, label(text), ':'),
    categoryName(category));
}

/** The reason behind an answer: Chinese teaching text, then English. 答案背后的原因：先中文讲解，再英文。 */
function whyBlock(why) {
  if (!why) return null;
  return h('div', { class: 'concept-sorter__why' },
    h('p', { class: 'concept-sorter__why-title' }, label(UI_TEXT.why)),
    zhNode(why.zh, 'teach', 'p', 'concept-sorter__why-zh'),
    enNode(why.en, 'p', 'concept-sorter__why-en'));
}

/**
 * The mark inside a category button after a choice: an icon plus words for screen readers.
 * 作答后类别按钮里的标记：图标，加上给读屏软件的文字。
 */
function markContent(look) {
  if (look?.state === 'correct') {
    return [icon('check', { size: 18 }),
      h('span', { class: 'visually-hidden' }, label(look.chosen ? UI_TEXT.markChosenCorrect : UI_TEXT.markCorrect))];
  }
  if (look?.state === 'wrong') {
    return [icon('cross', { size: 18 }), h('span', { class: 'visually-hidden' }, label(UI_TEXT.markWrong))];
  }
  return [];
}

/**
 * Polite live region. Repeating the same message is still announced because a no-break space is toggled.
 * 礼貌型朗读区域。末尾交替添加不换行空格，相同的消息也会再次播报。
 */
function liveRegion() {
  const element = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let toggle = false;
  return {
    element,
    announce(text) {
      toggle = !toggle;
      element.textContent = `${text}${toggle ? NO_BREAK_SPACE : ''}`;
    },
  };
}

/**
 * Moves keyboard focus to `target` without a jump, then scrolls `scrollTarget` just into view (instantly; the
 * station never animates scrolling).
 * 把键盘焦点移到 target 而不让页面跳动，再把 scrollTarget 恰好滚进视野（瞬间完成，工作站从不做滚动动画）。
 */
function focusQuietly(target, scrollTarget = target) {
  if (!target?.isConnected) return;
  target.focus({ preventScroll: true });
  scrollTarget.scrollIntoView({ block: 'nearest' });
}

/** Eyebrow, title and (for a drill that can start) the how-to line. 眉标、标题，以及（练习能开始时）用法说明。 */
function headerBlock(model, titleId, { intro = true } = {}) {
  return h('header', { class: 'concept-sorter__header' },
    h('p', { class: 'concept-sorter__eyebrow' }, label(UI_TEXT.eyebrow)),
    h('h3', { class: 'concept-sorter__title', id: titleId }, biTitle(model.title)),
    intro ? pair(UI_TEXT.intro, 'concept-sorter__intro') : null);
}

/* ---------- Mount 挂载 ---------- */

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./concept-sorter.css', import.meta.url));
  mountCount += 1;
  const prefix = `concept-sorter-${mountCount}`;
  const ids = {
    title: `${prefix}-title`,
    count: `${prefix}-count`,
    prompt: `${prefix}-prompt`,
    item: `${prefix}-item`,
    hint: `${prefix}-hint`,
    summary: `${prefix}-summary`,
  };
  const model = normalizeConceptSorterConfig(config);
  // Every listener is registered with this signal, so the cleanup removes them all at once. The widget uses
  // no timers or animation frames.
  // 所有事件监听都用这个 signal 注册，清理时一次全部移除。本组件不使用定时器或动画帧。
  const controller = new AbortController();
  const { signal } = controller;

  if (!model.ok) {
    container.replaceChildren(h('section', { class: 'concept-sorter', 'aria-labelledby': ids.title },
      headerBlock(model, ids.title, { intro: false }),
      h('div', { class: ['callout', 'callout--warn', 'concept-sorter__invalid'] }, pair(invalidText(model)))));
    return () => controller.abort();
  }

  let state = startRound(model);
  const live = liveRegion();

  // The buttons ignore the second click of a double-click, which would otherwise land on whatever the first click
  // put under the pointer: a category button after "Try again", or Next once the feedback scrolls into view
  // (see isRepeatClick).
  // 按钮忽略双击中的第二次点击；否则它会落在第一次点击放到指针下面的东西上：“再练一次”之后的类别按钮，或者反馈滚进视野后的
  // “下一题”（见 isRepeatClick）。
  function onPress(element, action) {
    element.addEventListener('click', (event) => {
      if (!isRepeatClick(event.detail)) action();
    }, { signal });
  }

  /* Progress: the heading is where focus lands on each new item. 进度：每道新题出现时焦点落在这个标题上。 */
  const countHeading = h('h4', { class: 'concept-sorter__count', id: ids.count, tabindex: '-1' });
  const fill = h('span', { class: 'concept-sorter__fill' });
  const track = h('div', {
    class: 'concept-sorter__track',
    role: 'progressbar',
    'aria-label': `${UI_TEXT.progress.zh} ${UI_TEXT.progress.en}`,
    'aria-valuemin': '0',
    'aria-valuemax': String(model.items.length),
  }, fill);

  /* Item card 题目卡片 */
  const itemText = h('p', { class: 'concept-sorter__item', id: ids.item });
  const card = h('div', { class: 'concept-sorter__card' },
    h('p', { class: 'concept-sorter__prompt', id: ids.prompt }, glossed(model.prompt)),
    itemText);

  /* One button per category, in config order 每个类别一个按钮，按配置顺序 */
  const choices = model.categories.map((category, index) => {
    const mark = h('span', { class: 'concept-sorter__mark' });
    const element = h('button', {
      type: 'button',
      class: 'concept-sorter__choice',
      'aria-keyshortcuts': String(index + 1),
    },
    h('span', { class: 'concept-sorter__key', 'aria-hidden': 'true' }, String(index + 1)),
    categoryName(category, 'concept-sorter__choice-name'),
    mark);
    onPress(element, () => choose(category.id));
    return { element, mark };
  });
  const choiceGroup = h('div', {
    class: 'concept-sorter__choices',
    role: 'group',
    'aria-labelledby': ids.prompt,
    'aria-describedby': `${ids.item} ${ids.hint}`,
  }, choices.map((choice) => choice.element));
  const hint = pair(keyHintText(model.categories.length), 'concept-sorter__hint');
  hint.id = ids.hint;

  /* Feedback after a choice 作答后的反馈 */
  const feedbackBody = h('div', { class: 'concept-sorter__feedback-body' });
  const nextButton = button({ label: label(UI_TEXT.next), iconName: 'arrowRight', variant: 'primary', className: 'concept-sorter__next' });
  onPress(nextButton, () => next());
  const feedback = h('div', { class: 'concept-sorter__feedback', hidden: true },
    feedbackBody,
    h('div', { class: 'concept-sorter__actions' }, nextButton));

  const stage = h('div', { class: 'concept-sorter__stage' },
    h('div', { class: 'concept-sorter__progress' }, countHeading, track),
    card,
    choiceGroup,
    hint,
    feedback);

  /* Summary at the end of a round 一轮结束后的总结 */
  const summaryHeading = h('h4', { class: 'concept-sorter__summary-title', id: ids.summary, tabindex: '-1' }, label(UI_TEXT.summaryTitle));
  const scoreValue = h('p', { class: 'concept-sorter__score' });
  const scoreBody = h('div', { class: 'concept-sorter__score-body' });
  const missedHeading = h('h5', { class: 'concept-sorter__subheading' });
  const missedBody = h('div', { class: 'concept-sorter__missed-body' });
  const againButton = button({ label: label(UI_TEXT.tryAgain), iconName: 'refresh', variant: 'primary', className: 'concept-sorter__again' });
  onPress(againButton, () => restart());
  const summary = h('section', { class: 'concept-sorter__summary', 'aria-labelledby': ids.summary, hidden: true },
    summaryHeading,
    scoreValue,
    scoreBody,
    missedHeading,
    missedBody,
    h('div', { class: ['concept-sorter__actions', 'concept-sorter__actions--start'] }, againButton),
    pair(UI_TEXT.tryAgainNote, 'concept-sorter__note'));

  const root = h('section', { class: 'concept-sorter', 'aria-labelledby': ids.title },
    headerBlock(model, ids.title),
    stage,
    summary,
    live.element);

  /* Rendering 渲染 */

  function renderProgress() {
    const progress = progressOf(state);
    const valueText = progressValueText(progress);
    // Screen readers hear "Item 3 of 10" instead of "3 slash 10". 读屏软件读“第 3 题，共 10 题”，而不是“3 斜杠 10”。
    replaceContent(countHeading,
      h('span', { class: 'visually-hidden' }, label(progressText(progress))),
      h('span', { class: 'concept-sorter__count-visible', 'aria-hidden': 'true' },
        h('span', { class: 'concept-sorter__count-label' }, label(UI_TEXT.item)),
        h('span', { class: 'concept-sorter__count-number' }, `${progress.position} / ${progress.total}`)));
    track.setAttribute('aria-valuenow', String(progress.answered));
    track.setAttribute('aria-valuetext', `${valueText.zh} ${valueText.en}`);
    fill.style.width = `${(progress.ratio * 100).toFixed(1)}%`;
  }

  function renderChoices() {
    const answer = currentAnswer(state);
    const looks = answer ? choiceStates(model, currentItem(state, model), answer.choice) : [];
    choices.forEach((choice, index) => {
      const look = looks[index];
      if (look) {
        // aria-disabled (not disabled) keeps the buttons focusable, so the marks can still be read.
        // 用 aria-disabled 而不是 disabled：按钮仍可聚焦，读屏用户还能回看标记。
        choice.element.setAttribute('aria-disabled', 'true');
        choice.element.dataset.state = look.state;
      } else {
        choice.element.removeAttribute('aria-disabled');
        delete choice.element.dataset.state;
      }
      replaceContent(choice.mark, markContent(look));
    });
  }

  function renderFeedback() {
    const answer = currentAnswer(state);
    const item = currentItem(state, model);
    const grade = answer ? gradeChoice(model, item, answer.choice) : null;
    feedback.hidden = !grade;
    if (!grade) {
      delete feedback.dataset.result;
      replaceContent(feedbackBody);
      return;
    }
    feedback.dataset.result = grade.correct ? 'correct' : 'wrong';
    replaceContent(feedbackBody,
      h('p', { class: 'concept-sorter__verdict' },
        icon(grade.correct ? 'check' : 'cross', { size: 20 }),
        h('span', {}, label(verdictText(grade.correct)))),
      grade.correct ? null : categoryLine('choice', UI_TEXT.yourChoice, grade.choice),
      categoryLine('answer', UI_TEXT.correctCategory, grade.answer),
      whyBlock(item.why));
    setButtonLabel(nextButton, label(nextLabel(state)));
  }

  function missedEntry(entry) {
    return h('li', { class: 'concept-sorter__missed-item' },
      h('p', { class: 'concept-sorter__missed-text' }, glossed(entry.item.text)),
      categoryLine('choice', UI_TEXT.yourChoice, entry.choice),
      categoryLine('answer', UI_TEXT.correctCategory, entry.answer),
      whyBlock(entry.item.why));
  }

  function renderSummary() {
    const result = summarizeRound(state, model);
    replaceContent(scoreValue, `${result.correct} / ${result.total}`);
    replaceContent(scoreBody,
      pair(scoreText(result), 'concept-sorter__score-text'),
      pair(scoreAdvice(result), 'concept-sorter__advice'));
    missedHeading.hidden = !result.missed.length;
    replaceContent(missedHeading, label(missedTitle(result)));
    replaceContent(missedBody, result.missed.length
      ? h('ul', { class: 'concept-sorter__missed' }, result.missed.map(missedEntry))
      : pair(UI_TEXT.noneMissed, 'concept-sorter__none'));
    return result;
  }

  /** Shows the current phase; returns the round summary once the round is done. 显示当前阶段；本轮结束时返回总结。 */
  function render() {
    const done = state.phase === PHASE.done;
    stage.hidden = done;
    summary.hidden = !done;
    if (done) return renderSummary();
    renderProgress();
    const item = currentItem(state, model);
    replaceContent(itemText, item ? glossed(item.text) : null);
    renderChoices();
    renderFeedback();
    // The number keys work only while an item waits for an answer, so the hint shows only then.
    // 数字键只在题目等待作答时有效，所以提示也只在这时显示。
    hint.hidden = state.phase !== PHASE.asking;
    return null;
  }

  /* Actions 操作 */

  function choose(categoryId) {
    const answered = chooseCategory(state, model, categoryId);
    if (answered === state) return;
    state = answered;
    render();
    // Enter on the focused "Next" button continues; the feedback is scrolled into view.
    // 焦点移到“下一题”按钮，按回车即可继续；反馈内容滚进视野。
    focusQuietly(nextButton, feedback);
    live.announce(choiceAnnouncement(model, currentItem(state, model), categoryId));
  }

  function next() {
    const following = goToNext(state);
    if (following === state) return;
    state = following;
    const result = render();
    if (state.phase === PHASE.done) {
      focusQuietly(summaryHeading);
      live.announce(summaryAnnouncement(result));
    } else {
      focusQuietly(countHeading);
    }
  }

  function restart() {
    state = restartRound(state, model);
    render();
    focusQuietly(countHeading);
    live.announce(restartAnnouncement());
  }

  // Number keys pick a category while an item waits for an answer and focus is inside the widget. A key held down
  // repeats; the repeats are ignored, so a held key never answers the next item too.
  // 题目等待作答、焦点在组件内时，数字键可以直接选类别。按住不放的键会自动重复；重复的按键被忽略，所以按住一个键不会顺带回答下一题。
  root.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    if (state.phase !== PHASE.asking || isTextEntry(event.target)) return;
    const index = shortcutIndex(event.key, model.categories.length);
    if (index < 0) return;
    event.preventDefault();
    choose(model.categories[index].id);
  }, { signal });

  container.replaceChildren(root);
  render();

  return () => {
    controller.abort();
  };
}
