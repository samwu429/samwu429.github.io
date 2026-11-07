/**
 * Widget "operant-quadrant": the four consequences of operant conditioning (King & Urbszat 2024, Chapter 6,
 * pp. 224-229; lecture slides 10-12).
 * - An always-visible 2 x 2 table: a stimulus added (positive, +) or removed (negative, −) against the behaviour
 *   becoming more likely (reinforcement) or less likely (punishment). Each quadrant has a one-line example; below are
 *   the two rules and the reminder that negative reinforcement is not punishment.
 * - With 3-12 scenarios, a two-step drill: added or removed, then more or less likely. The chosen quadrant lights up,
 *   then the correct one; the feedback says which step went wrong and gives the rule and the author's "why". A score,
 *   a summary of the missed scenarios and "Try again" in a new seeded order close the round.
 * 组件“operant-quadrant”：操作性条件反射的四种后果（King & Urbszat 2024 教材第 6 章第 224-229 页；讲课第 10-12 页）。
 * - 一直显示的 2 × 2 表：刺激被加上（正，+）或被拿走（负，−），对行为更可能发生（强化）或更不可能发生（惩罚）。
 *   每一格有一句例子；表下是两条规则和“负强化不是惩罚”的提醒。
 * - 有 3-12 个情境时出现两步练习：先选加上还是拿走，再选更可能还是更不可能。先点亮所选的格子，再显示正确的格子；
 *   反馈说明错在哪一步，并给出规则和作者写的 why。每轮有得分、错题回顾，以及按新种子打乱顺序的“再练一次”。
 *
 * Config: { title: Bi, scenarios: [{ text: Bi, answer: "negative-reinforcement", why: Bi }] }
 * Every sentence and state comes from operant-quadrant-logic.js; this module only builds and updates the DOM.
 * 所有句子和状态都来自 operant-quadrant-logic.js；本模块只负责构建和更新 DOM。
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, uiText, zhNode } from '../../../core/text/bilingual.js';
import { button, setButtonLabel } from '../../../components/controls/button.js';
import {
  DIRECTIONS, DIRECTION_INFO, QUADRANTS, QUADRANT_IDS, SIGNS, SIGN_INFO, TEXT,
  announceRestart, announceResult, announceSign, announceSummary, axisStates, cellStates, chooseDirection, chooseSign,
  confusionHint, currentScenarioId, drillScore, isLastScenario, lastResult, missedResults, nextScenario, nextSeed,
  normalizeOperantQuadrantConfig, progressText, quadrantOf, restartDrill, revealDelay, ruleLine, scoreText, seedFrom,
  startDrill, stepLines, summaryText, verdictText,
} from './operant-quadrant-logic.js';

let mountCount = 0;

// Icons next to the choices and inside the quadrant badges, so no answer depends on colour alone.
// 选项旁和格子徽标里的图标，让答案不只靠颜色来表达。
const CHOICE_ICONS = { positive: 'plus', negative: 'minus', increase: 'arrowUp', decrease: 'arrowDown' };
const STATE_ICONS = { chosen: 'target', right: 'check', wrong: 'cross', correct: 'check' };

/* ---------- Small builders 小型构件 ---------- */

/** Short UI label: Chinese first, English after. 简短界面文字：中文在前、英文在后。 */
function label(bi, role = 'label') {
  return [zhNode(bi.zh, role), ' ', enNode(bi.en)];
}

/** Chinese teaching sentence with its English version on the next line. 中文讲解句，下一行是对应的英文。 */
function pair(bi, className, tag = 'p') {
  if (!bi) return null;
  return h(tag, { class: ['operant-quadrant__pair', className] },
    zhNode(bi.zh, 'teach', 'span', 'operant-quadrant__zh'),
    enNode(bi.en, 'span', 'operant-quadrant__en'));
}

/**
 * English content to read as on the test (a scenario), with its Chinese meaning below; a text written only in Chinese
 * is shown as teaching text instead.
 * 像考试一样先读的英文内容（情境），下面是中文意思；只有中文的文字按讲解文字显示。
 */
function gloss(bi, className) {
  return h('p', { class: ['operant-quadrant__gloss', className] },
    enNode(bi.en, 'span', 'operant-quadrant__gloss-en'),
    zhNode(bi.zh, bi.en ? 'gloss' : 'teach', 'span', 'operant-quadrant__gloss-zh'));
}

/** A quadrant name: the Chinese term over the English one. 格子名称：中文术语在上，英文术语在下。 */
function quadrantName(id, tag = 'p') {
  const { name } = QUADRANTS[id];
  return h(tag, { class: 'operant-quadrant__name' },
    zhNode(name.zh, 'label', 'span', 'operant-quadrant__name-zh'),
    enNode(name.en, 'span', 'operant-quadrant__name-en'));
}

/** A decorative +, −, ↑ or ↓; the words beside it say the same for screen readers. 装饰用的 +、−、↑、↓；旁边的文字为读屏说明同样的意思。 */
function symbol(text) {
  return h('span', { class: 'operant-quadrant__symbol', 'aria-hidden': 'true' }, text);
}

/**
 * Polite live region. Repeating the same message is still announced because a no-break space is toggled; English runs
 * are marked lang="en" so screen readers switch voice.
 * 礼貌型朗读区域。末尾交替添加不换行空格，相同的消息也会再次播报；英文部分标为 lang="en"，读屏会切换发音。
 */
function liveRegion() {
  const element = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let toggle = false;
  return {
    element,
    announce(text) {
      if (!text) return;
      toggle = !toggle;
      replaceContent(element, uiText(`${text}${toggle ? ' ' : ''}`));
    },
  };
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Icon and words of a lit quadrant ("Your answer: wrong", "Correct answer"), or null; the words wrap beside the icon.
 * 被点亮格子的图标和文字（“你的答案：不对”“正确答案”）；没有时为 null。文字在图标旁边换行。
 */
function badgeContent(state, texts) {
  const text = texts[state];
  return text ? [icon(STATE_ICONS[state], { size: 14 }), h('span', { class: 'operant-quadrant__badge-text' }, label(text))] : null;
}

/**
 * Paints the states of cellStates() onto quadrant cells { id: { cell, badge } }, with badge words from `texts`.
 * 把 cellStates() 的状态画到各格上，徽标文字取自 texts。
 */
function paintCells(cells, states, texts) {
  for (const id of QUADRANT_IDS) {
    const state = states[id] || 'idle';
    const { cell, badge } = cells[id];
    cell.dataset.state = state;
    const content = badgeContent(state, texts);
    badge.hidden = !content;
    replaceContent(badge, content);
  }
}

/* ---------- The 2 x 2 table 2 × 2 表 ---------- */

function quadrantTable() {
  const cells = {};
  const columnHead = (direction) => h('th', { scope: 'col', class: 'operant-quadrant__col-head' },
    symbol(DIRECTION_INFO[direction].symbol),
    h('span', { class: 'operant-quadrant__head-text' }, label(TEXT.columns[direction])));
  const rowHead = (sign) => h('th', { scope: 'row', class: 'operant-quadrant__row-head' },
    symbol(SIGN_INFO[sign].symbol),
    h('span', { class: 'operant-quadrant__head-text' }, label(TEXT.rows[sign])));
  const quadrantCell = (sign, direction) => {
    const id = quadrantOf(sign, direction);
    const badge = h('span', { class: 'operant-quadrant__badge', hidden: true });
    const cell = h('td', { class: 'operant-quadrant__cell', dataset: { quadrant: id, state: 'idle' } },
      quadrantName(id),
      pair(QUADRANTS[id].example, 'operant-quadrant__example'),
      badge);
    cells[id] = { cell, badge };
    return cell;
  };
  const element = h('table', { class: 'operant-quadrant__table' },
    h('caption', { class: 'visually-hidden' }, label(TEXT.tableCaption)),
    h('colgroup', {}, h('col', { class: 'operant-quadrant__col-rows' }), h('col', {}), h('col', {})),
    h('thead', {}, h('tr', {}, h('td', { class: 'operant-quadrant__corner' }), DIRECTIONS.map(columnHead))),
    h('tbody', {}, SIGNS.map((sign) => h('tr', {},
      rowHead(sign),
      DIRECTIONS.map((direction) => quadrantCell(sign, direction))))));
  return { element, paint: (states) => paintCells(cells, states, TEXT.badges) };
}

function tableSection(table, headingId) {
  return h('section', { class: 'operant-quadrant__section', 'aria-labelledby': headingId },
    h('h4', { class: 'operant-quadrant__heading', id: headingId }, label(TEXT.tableHeading)),
    h('div', { class: 'operant-quadrant__table-wrap' }, table.element),
    h('ul', { class: 'operant-quadrant__rules' },
      h('li', { class: 'operant-quadrant__rule-item' }, symbol('+ −'), pair(TEXT.ruleSign, null, 'span')),
      h('li', { class: 'operant-quadrant__rule-item' }, symbol('↑ ↓'), pair(TEXT.ruleDirection, null, 'span'))),
    h('div', { class: ['callout', 'callout--warn', 'operant-quadrant__warning'], role: 'note' },
      h('p', { class: 'operant-quadrant__warning-label' }, icon('alert', { size: 16 }), label(TEXT.warningLabel)),
      pair(TEXT.warning, 'operant-quadrant__warning-text')));
}

/* ---------- Answer board of the drill 练习里的答案小表 ---------- */

/**
 * A compact copy of the table next to the drill, so the lit quadrants stay in view on a phone. It repeats what the
 * feedback text says, so screen readers skip it.
 * 练习旁边的小号表格，手机上也能看到被点亮的格子。它和反馈文字说的是同一件事，所以读屏会跳过它。
 */
function answerBoard() {
  const cells = {};
  const rowLabels = {};
  const columnLabels = {};
  const axisLabel = (info, kind) => h('span', { class: ['operant-quadrant__board-axis', `operant-quadrant__board-axis--${kind}`] },
    symbol(info.symbol),
    h('span', { class: 'operant-quadrant__board-axis-text' }, label(info.word)));
  const grid = h('div', { class: 'operant-quadrant__board-grid' }, h('span', { class: 'operant-quadrant__board-corner' }));
  for (const direction of DIRECTIONS) {
    columnLabels[direction] = axisLabel(DIRECTION_INFO[direction], 'column');
    grid.append(columnLabels[direction]);
  }
  for (const sign of SIGNS) {
    rowLabels[sign] = axisLabel(SIGN_INFO[sign], 'row');
    grid.append(rowLabels[sign]);
    for (const direction of DIRECTIONS) {
      const id = quadrantOf(sign, direction);
      const badge = h('span', { class: 'operant-quadrant__badge', hidden: true });
      const cell = h('span', { class: 'operant-quadrant__board-cell', dataset: { quadrant: id, state: 'idle' } },
        quadrantName(id, 'span'),
        badge);
      cells[id] = { cell, badge };
      grid.append(cell);
    }
  }
  const element = h('figure', { class: 'operant-quadrant__board', 'aria-hidden': 'true' },
    h('figcaption', { class: 'operant-quadrant__board-caption' }, label(TEXT.boardCaption)),
    grid);
  return {
    element,
    paint(states, axes) {
      paintCells(cells, states, TEXT.boardBadges);
      for (const sign of SIGNS) rowLabels[sign].classList.toggle('is-active', axes.rows[sign]);
      for (const direction of DIRECTIONS) columnLabels[direction].classList.toggle('is-active', axes.columns[direction]);
    },
  };
}

/** "Your answer: positive punishment" or "Correct answer: ..." in the summary. 总结里的“你的答案：…”或“正确答案：…”。 */
function answerTag(kind, caption, id) {
  const { name } = QUADRANTS[id];
  return h('span', { class: ['operant-quadrant__tag', `operant-quadrant__tag--${kind}`] },
    icon(kind === 'correct' ? 'check' : 'cross', { size: 14 }),
    h('span', { class: 'operant-quadrant__tag-text' }, label(caption), ': ', zhNode(name.zh, 'label'), ' ', enNode(name.en)));
}

/* ---------- Drill 练习 ---------- */

function drillView(model, { ids, signal, announce, table }) {
  const { scenarios } = model;
  let state = startDrill(scenarios.length);
  let revealed = false;
  let revealTimer = 0;
  // The first round keeps the written order; each "Try again" shuffles with the next seed of this random start.
  // 第一轮按书写顺序；每次“再练一次”都用这个随机起点的下一个种子来打乱。
  let seed = seedFrom(Math.random);

  const score = h('p', { class: 'operant-quadrant__score' });

  /* Scenario 情境 */
  const scenarioHeading = h('h5', { class: 'operant-quadrant__scenario-heading', id: ids.scenarioHeading });
  const scenarioText = h('div', { class: 'operant-quadrant__scenario-text', id: ids.scenarioText });
  // Focused when a scenario starts, so screen readers read its number and text. 每题开始时获得焦点，读屏会读出题号和情境。
  const scenario = h('article', {
    class: 'operant-quadrant__scenario',
    tabindex: '-1',
    'aria-labelledby': ids.scenarioHeading,
    'aria-describedby': ids.scenarioText,
  }, scenarioHeading, scenarioText);

  /* Steps 两步 */
  const choiceButton = (key, onPick) => {
    const element = button({
      label: [
        zhNode(TEXT.choices[key].zh, 'label', 'span', 'operant-quadrant__choice-zh'),
        enNode(TEXT.choices[key].en, 'span', 'operant-quadrant__choice-en'),
      ],
      iconName: CHOICE_ICONS[key],
      className: 'operant-quadrant__choice',
      pressed: false,
    });
    element.addEventListener('click', () => onPick(key), { signal });
    return element;
  };
  const signButtons = Object.fromEntries(SIGNS.map((sign) => [sign, choiceButton(sign, pickSign)]));
  const directionButtons = Object.fromEntries(DIRECTIONS.map((direction) => [direction, choiceButton(direction, pickDirection)]));
  // The question's Chinese is teaching text (blurred in English practice mode); the button labels stay visible.
  // 题目的中文是讲解文字（英文练习模式下模糊）；按钮上的文字一直可见。
  const stepGroup = (questionId, question, buttons) => h('div', { class: 'operant-quadrant__step', role: 'group', 'aria-labelledby': questionId },
    h('p', { class: 'operant-quadrant__question', id: questionId }, label(question, 'teach')),
    h('div', { class: 'operant-quadrant__choices' }, Object.values(buttons)));
  const step1 = stepGroup(ids.step1, TEXT.step1, signButtons);
  const step2 = stepGroup(ids.step2, TEXT.step2, directionButtons);
  step2.hidden = true;

  const board = answerBoard();

  /* Feedback 反馈 */
  const verdict = h('p', { class: 'operant-quadrant__verdict' });
  const stepList = h('ul', { class: 'operant-quadrant__step-results' });
  const hint = h('div', { class: 'operant-quadrant__hint', hidden: true });
  const rule = h('p', { class: 'operant-quadrant__rule' });
  const why = h('div', { class: 'operant-quadrant__why', hidden: true });
  const nextButton = button({ label: label(TEXT.next), iconName: 'arrowRight', variant: 'primary', className: 'operant-quadrant__next' });
  nextButton.addEventListener('click', goNext, { signal });
  const feedback = h('div', { class: 'operant-quadrant__feedback', hidden: true },
    verdict, stepList, hint, rule, why,
    h('div', { class: 'operant-quadrant__actions' }, nextButton));

  const play = h('div', { class: 'operant-quadrant__play' }, scenario, step1, step2, board.element, feedback);

  /* Summary 总结 */
  // A reading target, focused when the round ends. 阅读位置，一轮结束时获得焦点。
  const summaryHeading = h('h5', { class: 'operant-quadrant__summary-heading', id: ids.summary, tabindex: '-1' }, label(TEXT.summaryHeading));
  const summaryBody = h('div', { class: 'operant-quadrant__summary-body' });
  const tryAgain = button({ label: label(TEXT.tryAgain), iconName: 'shuffle', variant: 'primary', className: 'operant-quadrant__again' });
  tryAgain.addEventListener('click', restart, { signal });
  const summary = h('div', { class: 'operant-quadrant__summary', hidden: true },
    summaryHeading,
    summaryBody,
    h('div', { class: 'operant-quadrant__actions' }, tryAgain));

  const element = h('section', { class: ['operant-quadrant__panel', 'operant-quadrant__drill'], 'aria-labelledby': ids.drill },
    h('div', { class: 'operant-quadrant__drill-head' },
      h('h4', { class: 'operant-quadrant__heading', id: ids.drill }, label(TEXT.drillHeading)),
      score),
    play,
    summary);

  function clearReveal() {
    if (revealTimer) window.clearTimeout(revealTimer);
    revealTimer = 0;
  }

  function currentScenario() {
    const id = currentScenarioId(state);
    return id === null ? null : scenarios[id];
  }

  // aria-disabled (not disabled) keeps the graded choices focusable, so focus is never lost and the answer can be reread.
  // 用 aria-disabled 而不是 disabled：判分后的选项仍可聚焦，焦点不会丢失，也能回看自己的选择。
  function syncChoices() {
    const locked = state.phase === 'feedback';
    const mark = (choice, pressed) => {
      choice.setAttribute('aria-pressed', String(pressed));
      if (locked) choice.setAttribute('aria-disabled', 'true');
      else choice.removeAttribute('aria-disabled');
    };
    for (const sign of SIGNS) mark(signButtons[sign], state.sign === sign);
    for (const direction of DIRECTIONS) mark(directionButtons[direction], state.direction === direction);
    step2.hidden = !state.sign;
  }

  function syncCells() {
    const item = currentScenario();
    const states = cellStates({ sign: state.sign, direction: state.direction, answer: item?.answer ?? null, revealed });
    table.paint(states);
    board.paint(states, axisStates(state));
  }

  function renderScore() {
    replaceContent(score, label(scoreText(drillScore(state))));
  }

  function renderScenario() {
    const item = currentScenario();
    if (!item) return;
    replaceContent(scenarioHeading, label(progressText(state.position, state.order.length)));
    replaceContent(scenarioText, gloss(item.text, 'operant-quadrant__scenario-gloss'));
    feedback.hidden = true;
    syncChoices();
    syncCells();
    renderScore();
  }

  function renderFeedback() {
    const result = lastResult(state);
    if (!result) return;
    const item = scenarios[result.id];
    feedback.dataset.result = result.correct ? 'right' : 'wrong';
    replaceContent(verdict,
      icon(result.correct ? 'checkCircle' : 'cross', { size: 20 }),
      pair(verdictText(result), 'operant-quadrant__verdict-text', 'span'));
    replaceContent(stepList, stepLines(result).map((line) => h('li', {
      class: ['operant-quadrant__step-result', line.correct ? 'is-right' : 'is-wrong'],
    }, icon(line.correct ? 'check' : 'cross', { size: 16 }), pair(line.text, null, 'span'))));
    const tip = confusionHint(result);
    hint.hidden = !tip;
    replaceContent(hint, tip ? [icon('bulb', { size: 16 }), pair(tip, null, 'span')] : null);
    replaceContent(rule, pair(ruleLine(result.answer), null, 'span'));
    why.hidden = !item.why;
    replaceContent(why, item.why ? [h('p', { class: 'operant-quadrant__why-label' }, label(TEXT.whyLabel)), pair(item.why)] : null);
    setButtonLabel(nextButton, label(isLastScenario(state) ? TEXT.finish : TEXT.next));
  }

  // Second stage of the feedback: the correct quadrant, the words and the score. 反馈的第二阶段：正确的格子、文字和得分。
  function reveal() {
    revealTimer = 0;
    revealed = true;
    syncCells();
    renderFeedback();
    renderScore();
    feedback.hidden = false;
    announce(announceResult(lastResult(state), drillScore(state)));
  }

  function pickSign(sign) {
    const next = chooseSign(state, sign);
    if (next === state) return;
    state = next;
    syncChoices();
    syncCells();
    announce(announceSign(sign));
  }

  // First stage: the learner's quadrant lights up at once; the correct one follows after a pause (none when motion is reduced).
  // 第一阶段：学习者选的格子立即点亮；正确的格子稍后出现（减少动态效果时不停顿）。
  function pickDirection(direction) {
    const next = chooseDirection(state, direction, scenarios);
    if (next === state) return;
    state = next;
    syncChoices();
    syncCells();
    clearReveal();
    const delay = revealDelay(prefersReducedMotion());
    if (delay > 0) revealTimer = window.setTimeout(reveal, delay);
    else reveal();
  }

  function goNext() {
    if (!revealed || state.phase !== 'feedback') return;
    state = nextScenario(state);
    revealed = false;
    if (state.phase === 'done') {
      showSummary();
      return;
    }
    renderScenario();
    scenario.focus();
  }

  function missedItem(result) {
    const item = scenarios[result.id];
    return h('li', { class: 'operant-quadrant__missed-item' },
      gloss(item.text, 'operant-quadrant__missed-text'),
      h('p', { class: 'operant-quadrant__tags' },
        answerTag('wrong', TEXT.yourAnswer, result.chosen),
        answerTag('correct', TEXT.correctAnswer, result.answer)),
      h('p', { class: 'operant-quadrant__rule' }, pair(ruleLine(result.answer), null, 'span')),
      item.why ? pair(item.why, 'operant-quadrant__missed-why') : null);
  }

  function showSummary() {
    clearReveal();
    const result = drillScore(state);
    const missed = missedResults(state);
    syncCells();
    renderScore();
    replaceContent(summaryBody,
      pair(summaryText(result), 'operant-quadrant__summary-score'),
      missed.length
        ? [
          h('h6', { class: 'operant-quadrant__missed-heading' }, label(TEXT.missedHeading)),
          // role="list" keeps the list announced although its markers are hidden. 隐藏了序号，role="list" 让读屏仍把它当作列表。
          h('ol', { class: 'operant-quadrant__missed', role: 'list' }, missed.map(missedItem)),
        ]
        : h('p', { class: 'operant-quadrant__all-correct' }, icon('checkCircle', { size: 20 }), pair(TEXT.allCorrect, null, 'span')));
    play.hidden = true;
    summary.hidden = false;
    summaryHeading.focus();
    announce(announceSummary(result));
  }

  function restart() {
    clearReveal();
    seed = nextSeed(seed);
    state = restartDrill(state, seed);
    revealed = false;
    summary.hidden = true;
    play.hidden = false;
    renderScenario();
    scenario.focus();
    announce(announceRestart());
  }

  return {
    element,
    start: renderScenario,
    dispose: clearReveal,
  };
}

/* ---------- Mount 挂载 ---------- */

function headerBlock(model, titleId) {
  return h('header', { class: 'operant-quadrant__header' },
    h('p', { class: 'operant-quadrant__eyebrow' }, label(TEXT.eyebrow)),
    h('h3', { class: 'operant-quadrant__title', id: titleId }, biTitle(model.title)),
    pair(model.drill ? TEXT.intro : TEXT.introTableOnly, 'operant-quadrant__intro'));
}

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./operant-quadrant.css', import.meta.url));
  mountCount += 1;
  const prefix = `operant-quadrant-${mountCount}`;
  const ids = {
    title: `${prefix}-title`,
    table: `${prefix}-table`,
    drill: `${prefix}-drill`,
    scenarioHeading: `${prefix}-scenario`,
    scenarioText: `${prefix}-scenario-text`,
    step1: `${prefix}-step-1`,
    step2: `${prefix}-step-2`,
    summary: `${prefix}-summary`,
  };
  const model = normalizeOperantQuadrantConfig(config);
  // Every listener is registered with this signal, so the cleanup removes them all at once.
  // 所有事件监听都用这个 signal 注册，清理时一次全部移除。
  const controller = new AbortController();
  const live = liveRegion();
  const table = quadrantTable();
  // With fewer than 3 usable scenarios only the table is shown. 可用情境少于 3 个时只显示表格。
  const drill = model.drill ? drillView(model, { ids, signal: controller.signal, announce: live.announce, table }) : null;

  const root = h('section', { class: 'operant-quadrant', 'aria-labelledby': ids.title },
    headerBlock(model, ids.title),
    tableSection(table, ids.table),
    drill ? drill.element : null,
    live.element);

  container.replaceChildren(root);
  drill?.start();

  return () => {
    controller.abort();
    drill?.dispose();
  };
}
