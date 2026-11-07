/**
 * Widget "afterimage": a negative-afterimage demo for opponent-process theory (King & Urbszat 2024, Chapter 4,
 * p.138-139; PSY100 lecture "Sensation and Perception", slides 10-11).
 * - Step 1: the learner stares at the black dot of a coloured picture (a flag or colour patches) for N seconds,
 *   with a calm countdown (a number and a progress bar), a Skip button and nothing moving in the picture.
 * - Step 2: the picture turns into a plain white field with the same dot (white in light and dark mode, because
 *   the demo needs it) for about 10 seconds, or until Continue.
 * - Step 3: which colour turned into which, opponent-process theory (with the textbook's two pairs and the
 *   lecture's three systems), why the trichromatic theory cannot explain afterimages, why both theories are correct,
 *   exam sentences, and a toggle that draws the expected afterimage as a simplified illustration. Restart goes back
 *   to step 1. "Skip to the explanation" reaches step 3 without the demo.
 * 组件“afterimage”：用负后像演示对立过程理论（King & Urbszat 2024 第 4 章第 138-139 页；PSY100 讲课“感觉与知觉”第 10-11 张）。
 * - 第 1 步：学习者盯着彩色图（旗帜或色块）中间的黑点看 N 秒；倒计时很安静（数字加进度条），有“跳过”按钮，图本身不动。
 * - 第 2 步：图变成同样位置有黑点的纯白区域（浅色和深色模式都是白色，演示需要），大约 10 秒，或者按“继续”。
 * - 第 3 步：颜色对照、对立过程理论（教材的两对与课件的 3 个系统）、三色理论为什么解释不了后像、为什么两个理论都对、
 *   考试句子，以及一个画出预期后像（简化示意）的开关。“再做一次”回到第 1 步。“直接看解释”不做演示也能到第 3 步。
 *
 * Config: { title: Bi, preset: "flag" | "patches", seconds: 20 }
 * Every string, colour, shape and time comes from afterimage-logic.js; this module only builds and updates the DOM.
 * 所有文字、颜色、形状和时间都来自 afterimage-logic.js；本模块只负责构建和更新 DOM。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { button, setButtonLabel } from '../../../components/controls/button.js';
import {
  COLOURS, PHASES, SECONDS_LIMITS, TEXT, advance, afterimageShapes, announcement, blankShapes, colourRows,
  createState, explainNote, finishLook, goToExplanation, instructionText, interrupt, isRepeatClick, lookTimerText,
  normalizeAfterimageConfig, pairSourceText, phaseAnnouncement, pictureLabel, presetOf, progressFraction,
  progressValueText, remainingSeconds, restart, secondsValueText, setSeconds, simplifiedNote, skipStare, sliderHint,
  starPoints, startStare, stepLabel, stimulusShapes, toggleExpected, wholeSecondsElapsed, whySteps,
} from './afterimage-logic.js';

let mountCount = 0;

// How often the countdown is refreshed while a timed step runs; the number itself changes once a second.
// 计时步骤进行时倒计时的刷新间隔；数字本身每秒只变一次。
const TICK_MS = 200;

function clock() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

/* ---------- Small builders 小型构件 ---------- */

/** Short UI label: Chinese first, English after. 简短界面文字：中文在前、英文在后。 */
function label(text, role = 'label') {
  return [zhNode(text.zh, role), ' ', enNode(text.en)];
}

/** Chinese teaching sentence with its English version on the next line. 中文讲解句，下一行是对应的英文。 */
function pair(text, className) {
  return h('p', { class: ['afterimage__pair', className] },
    zhNode(text.zh, 'teach', 'span', 'afterimage__zh'),
    enNode(text.en, 'span', 'afterimage__en'));
}

/** An English sentence to write on the test, with its Chinese meaning below. 考试时要写的英文句子，下面是中文意思。 */
function examSentence(text) {
  return h('p', { class: 'afterimage__exam-sentence' },
    enNode(text.en, 'span', 'afterimage__exam-en'),
    zhNode(text.zh, 'gloss', 'span', 'afterimage__exam-zh'));
}

function heading(text, id) {
  return h('h4', { class: 'afterimage__heading', id }, label(text));
}

/** "开始 Start": the button component marks the English part lang="en". 按钮文字；按钮组件会把英文部分标为 lang="en"。 */
function buttonText(text) {
  return `${text.zh} ${text.en}`;
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
      if (!text) return;
      toggle = !toggle;
      replaceContent(element,
        h('span', { lang: 'zh-CN' }, text.zh), ' ',
        h('span', { lang: 'en' }, `${text.en}${toggle ? ' ' : ''}`));
    },
  };
}

/** True when the element left the page or sits inside a hidden part. 元素已离开页面或位于被隐藏的部分里时为 true。 */
function isHidden(element) {
  return !element.isConnected || element.closest('[hidden]') !== null;
}

/* ---------- Pictures 图片 ---------- */

function shapeNode(shape) {
  const fill = (COLOURS[shape.colour] ?? COLOURS.grey).hex;
  if (shape.type === 'star') {
    return s('polygon', { points: starPoints(shape.cx, shape.cy, shape.outer, shape.inner), fill });
  }
  return s('rect', { x: shape.x, y: shape.y, width: shape.width, height: shape.height, fill });
}

/** An empty picture that scales with its viewBox. 随 viewBox 缩放的空白图片。 */
function pictureSvg(preset) {
  return s('svg', {
    class: 'afterimage__picture',
    viewBox: `0 0 ${preset.width} ${preset.height}`,
    role: 'img',
    'aria-label': '',
    focusable: 'false',
    style: { aspectRatio: `${preset.width} / ${preset.height}` },
  });
}

/** Draws the shapes, then the black fixation dot on top. 先画形状，再在最上面画黑色注视点。 */
function drawPicture(svg, preset, shapes, description) {
  svg.setAttribute('aria-label', description);
  replaceContent(svg,
    shapes.map(shapeNode),
    s('circle', { cx: preset.dot.cx, cy: preset.dot.cy, r: preset.dot.r, fill: COLOURS.black.hex }));
}

/** A colour swatch with its name, so the table never depends on colour alone. 色块加颜色名称，表格不只靠颜色表达。 */
function colourChip(colour) {
  const meta = COLOURS[colour];
  return h('span', { class: 'afterimage__colour' },
    h('span', { class: 'afterimage__swatch', 'aria-hidden': 'true', style: { backgroundColor: meta.hex } }),
    h('span', { class: 'afterimage__colour-name' }, label(meta.name)));
}

/* ---------- Step 3 panels 第 3 步的面板 ---------- */

function coloursPanel(presetId, headingId) {
  return h('section', { class: 'afterimage__panel', 'aria-labelledby': headingId },
    heading(TEXT.headings.colours, headingId),
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data-table afterimage__table' },
        h('caption', { class: 'visually-hidden' }, label(TEXT.table.caption)),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, label(TEXT.table.stared)),
          h('th', { scope: 'col' }, label(TEXT.table.afterimage)),
          h('th', { scope: 'col' }, label(TEXT.table.pair)))),
        h('tbody', {}, colourRows(presetId).map((row) => {
          const source = pairSourceText(row.pair);
          return h('tr', {},
            h('td', {}, colourChip(row.colour), h('span', { class: 'afterimage__where' }, label(row.where))),
            h('td', {}, colourChip(row.afterimage)),
            h('td', {},
              h('span', { class: 'afterimage__pair-name' }, label(row.pair.name)),
              source ? h('span', { class: 'afterimage__source' }, label(source)) : null));
        })))));
}

function whyPanel(presetId, headingId) {
  // The story follows the first colour of the picture (green in both pictures). 用图里的第一种颜色来讲（两张图都是绿色）。
  const focus = colourRows(presetId)[0]?.colour ?? 'green';
  return h('section', { class: 'afterimage__panel', 'aria-labelledby': headingId },
    heading(TEXT.headings.why, headingId),
    TEXT.why.map((text) => pair(text)),
    h('ol', { class: 'afterimage__steps' }, whySteps(focus).map((step) => h('li', {}, pair(step)))),
    pair(TEXT.textbookExample, 'afterimage__example'));
}

function trichromaticPanel(headingId) {
  return h('section', { class: 'afterimage__panel', 'aria-labelledby': headingId },
    heading(TEXT.headings.trichromatic, headingId),
    TEXT.trichromatic.map((text) => pair(text)));
}

function bothPanel(headingId) {
  return h('section', { class: 'afterimage__panel', 'aria-labelledby': headingId },
    heading(TEXT.headings.both, headingId),
    pair(TEXT.both.intro),
    h('ol', { class: 'afterimage__flow' }, TEXT.both.stages.map((stage) => h('li', {},
      h('p', { class: 'afterimage__flow-title' }, label(stage.title)),
      pair(stage.text)))));
}

function examPanel(headingId) {
  return h('section', { class: ['afterimage__panel', 'afterimage__exam'], 'aria-labelledby': headingId },
    heading(TEXT.headings.exam, headingId),
    TEXT.exam.map(examSentence));
}

/* ---------- Mount 挂载 ---------- */

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./afterimage.css', import.meta.url));
  mountCount += 1;
  const prefix = `afterimage-${mountCount}`;
  const ids = {
    title: `${prefix}-title`,
    expected: `${prefix}-expected`,
    seconds: `${prefix}-seconds`,
    secondsHint: `${prefix}-seconds-hint`,
    colours: `${prefix}-colours`,
    why: `${prefix}-why`,
    trichromatic: `${prefix}-trichromatic`,
    both: `${prefix}-both`,
    exam: `${prefix}-exam`,
  };
  const model = normalizeAfterimageConfig(config);
  const preset = presetOf(model.preset);
  // Every listener is registered with this signal, so the cleanup removes them all at once.
  // 所有事件监听都用这个 signal 注册，清理时一次全部移除。
  const controller = new AbortController();
  const { signal } = controller;
  const live = liveRegion();
  const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let state = createState(model.seconds);
  let timer = 0;
  // What the stage and the clock show now, so the DOM only changes when the picture or a whole second changes.
  // 舞台和计时器当前显示的内容：只有图或整秒数变了才改 DOM。
  let stageShows = null;
  let shownLeft = null;
  let shownElapsed = null;

  /* Pictures 图片 */
  const mainSvg = pictureSvg(preset);
  const mainCaption = h('figcaption', { class: 'afterimage__caption', hidden: true },
    h('span', { class: 'afterimage__caption-title' }, label(TEXT.captions.stared)));
  const mainFigure = h('figure', { class: 'afterimage__figure' },
    h('div', { class: 'afterimage__stage' }, mainSvg),
    mainCaption);
  const expectedSvg = pictureSvg(preset);
  drawPicture(expectedSvg, preset, afterimageShapes(preset.id), pictureLabel(preset.id, 'afterimage'));
  const expectedFigure = h('figure', { class: ['afterimage__figure', 'afterimage__figure--expected'], id: ids.expected, hidden: true },
    h('div', { class: 'afterimage__stage' }, expectedSvg),
    h('figcaption', { class: 'afterimage__caption' },
      h('span', { class: 'afterimage__caption-title' },
        label(TEXT.captions.expected), ' ',
        h('span', { class: 'badge badge--warn afterimage__badge' }, label(TEXT.simplified))),
      pair(simplifiedNote(preset.id), 'afterimage__note')));
  const figures = h('div', { class: 'afterimage__figures' }, mainFigure, expectedFigure);

  /* Step and instruction 步骤与指示 */
  const stepLine = h('p', { class: 'afterimage__step-label' });
  const instruction = h('div', { class: 'afterimage__instruction' });
  const notice = h('div', { class: ['callout', 'callout--warn', 'afterimage__notice'], hidden: true }, pair(TEXT.interrupted));
  const status = h('div', { class: 'afterimage__status' }, stepLine, instruction, notice);

  /* Countdown of step 1 第 1 步的倒计时 */
  const countNumber = h('span', { class: 'afterimage__count-number', role: 'timer' });
  const progressFill = h('div', { class: 'progress__fill', style: { width: '0%' } });
  const progressTrack = h('div', {
    class: 'progress__track',
    role: 'progressbar',
    'aria-label': buttonText(TEXT.progressLabel),
    'aria-valuemin': 0,
    'aria-valuemax': state.seconds,
    'aria-valuenow': 0,
  }, progressFill);
  const countdownRow = h('div', { class: 'afterimage__countdown-row', hidden: true },
    h('p', { class: 'afterimage__countdown' },
      h('span', { class: 'afterimage__count-label' }, label(TEXT.timeLeft)),
      countNumber,
      h('span', { class: 'afterimage__count-unit' }, label(TEXT.secondsUnit))),
    h('div', { class: 'progress progress--sm afterimage__progress' }, progressTrack));

  /* Quiet timer of step 2 第 2 步的安静计时 */
  const lookTimer = h('p', { class: 'afterimage__look-timer', role: 'timer', hidden: true });

  /* Stare-time slider 盯视时间滑块 */
  const slider = h('input', {
    id: ids.seconds,
    class: 'afterimage__range',
    type: 'range',
    min: SECONDS_LIMITS.min,
    max: SECONDS_LIMITS.max,
    step: 1,
    value: state.seconds,
    'aria-describedby': ids.secondsHint,
  });
  // The value is read out through aria-valuetext, so the visible copy is hidden from screen readers.
  // 读屏软件通过 aria-valuetext 读出数值，所以屏幕上显示的数字对读屏隐藏。
  const sliderNumber = h('span', { class: 'afterimage__range-number' });
  const sliderField = h('div', { class: 'afterimage__field' },
    h('label', { class: 'afterimage__label', for: ids.seconds }, label(TEXT.stareTime)),
    h('div', { class: 'afterimage__range-row' },
      slider,
      h('span', { class: 'afterimage__range-value', 'aria-hidden': 'true' }, sliderNumber, ' ', label(TEXT.secondsUnit))),
    h('div', { id: ids.secondsHint }, pair(sliderHint(), 'afterimage__hint')));

  /* Buttons 按钮 */
  const startButton = button({ label: buttonText(TEXT.buttons.start), iconName: 'play', variant: 'primary' });
  const explainOnlyButton = button({ label: buttonText(TEXT.buttons.explainOnly), iconName: 'arrowDown', variant: 'ghost' });
  const skipButton = button({ label: buttonText(TEXT.buttons.skip), iconName: 'skipForward' });
  const continueButton = button({ label: buttonText(TEXT.buttons.continue), iconName: 'arrowRight', variant: 'primary' });
  const toggleButton = button({ label: buttonText(TEXT.buttons.showExpected), iconName: 'eye' });
  toggleButton.setAttribute('aria-controls', ids.expected);
  const restartButton = button({ label: buttonText(TEXT.buttons.restart), iconName: 'refresh', variant: 'ghost' });
  const controls = h('div', { class: 'afterimage__controls' },
    startButton, explainOnlyButton, skipButton, continueButton, toggleButton, restartButton);
  // The main control of each step, which takes the focus when the focused control disappears with a step change.
  // 每一步的主要控件：步骤切换让当前获得焦点的控件消失时，焦点移到这里。
  const focusTargets = { ready: startButton, stare: skipButton, look: continueButton, explain: toggleButton };

  /* Step 3 第 3 步 */
  const explainNoteBox = h('div', { class: ['callout', 'callout--tip', 'afterimage__tip'], hidden: true });
  const explain = h('div', { class: 'afterimage__explain', hidden: true },
    explainNoteBox,
    coloursPanel(preset.id, ids.colours),
    whyPanel(preset.id, ids.why),
    trichromaticPanel(ids.trichromatic),
    bothPanel(ids.both),
    examPanel(ids.exam));

  const root = h('section', { class: 'afterimage', 'aria-labelledby': ids.title },
    h('header', { class: 'afterimage__header' },
      h('p', { class: 'afterimage__eyebrow' }, label(TEXT.eyebrow)),
      h('h3', { class: 'afterimage__title', id: ids.title }, biTitle(model.title)),
      pair(TEXT.intro, 'afterimage__intro')),
    figures,
    status,
    countdownRow,
    lookTimer,
    sliderField,
    controls,
    explain,
    live.element);

  /* Rendering 渲染 */

  // Step 2 swaps the picture for the white field in the same box, so the dot stays exactly where it was.
  // 第 2 步在同一个框里把图换成白色区域，黑点的位置完全不变。
  function drawStage() {
    const kind = state.phase === 'look' ? 'blank' : 'stimulus';
    if (kind === stageShows) return;
    stageShows = kind;
    drawPicture(mainSvg, preset, kind === 'blank' ? blankShapes(preset.id) : stimulusShapes(preset.id), pictureLabel(preset.id, kind));
  }

  function updateClock() {
    const now = clock();
    if (state.phase === 'stare') {
      const left = remainingSeconds(state, now);
      if (left !== shownLeft) {
        shownLeft = left;
        countNumber.textContent = String(left);
      }
      const done = wholeSecondsElapsed(state, now);
      if (done !== shownElapsed) {
        shownElapsed = done;
        progressTrack.setAttribute('aria-valuemax', String(state.seconds));
        progressTrack.setAttribute('aria-valuenow', String(done));
        progressTrack.setAttribute('aria-valuetext', progressValueText(done, state.seconds));
      }
      // With reduced motion the bar moves once a second instead of gliding. 减少动态效果时，进度条每秒跳一次，不连续滑动。
      const fraction = progressFraction(state, now, { stepped: Boolean(motionQuery?.matches) });
      progressFill.style.width = `${(fraction * 100).toFixed(2)}%`;
    } else if (state.phase === 'look') {
      const left = remainingSeconds(state, now);
      if (left !== shownLeft) {
        shownLeft = left;
        replaceContent(lookTimer, label(lookTimerText(left)));
      }
    }
  }

  function render() {
    const { phase } = state;
    for (const name of PHASES) root.classList.toggle(`afterimage--${name}`, name === phase);
    drawStage();
    const comparing = phase === 'explain' && state.showExpected;
    mainCaption.hidden = phase !== 'explain';
    expectedFigure.hidden = !comparing;
    figures.classList.toggle('afterimage__figures--compare', comparing);

    replaceContent(stepLine, label(stepLabel(phase)));
    replaceContent(instruction, pair(instructionText(phase, state.seconds), 'afterimage__instruction-text'));
    notice.hidden = !(phase === 'ready' && state.interrupted);

    sliderField.hidden = phase !== 'ready';
    slider.value = String(state.seconds);
    slider.setAttribute('aria-valuetext', secondsValueText(state.seconds));
    sliderNumber.textContent = String(state.seconds);

    countdownRow.hidden = phase !== 'stare';
    lookTimer.hidden = phase !== 'look';
    // A fresh step starts its numbers again; the bar is emptied while hidden, so it never runs backwards on screen.
    // 新的一步重新开始计数；进度条在隐藏时清空，屏幕上不会看到它倒退。
    shownLeft = null;
    shownElapsed = null;
    if (phase !== 'stare') progressFill.style.width = '0%';

    startButton.hidden = phase !== 'ready';
    explainOnlyButton.hidden = phase !== 'ready';
    skipButton.hidden = phase !== 'stare';
    continueButton.hidden = phase !== 'look';
    toggleButton.hidden = phase !== 'explain';
    restartButton.hidden = phase !== 'explain';
    toggleButton.setAttribute('aria-expanded', String(comparing));
    setButtonLabel(toggleButton, buttonText(state.showExpected ? TEXT.buttons.hideExpected : TEXT.buttons.showExpected));

    explain.hidden = phase !== 'explain';
    const note = phase === 'explain' ? explainNote(state) : null;
    explainNoteBox.hidden = !note;
    replaceContent(explainNoteBox, note ? pair(note) : null);

    updateClock();
  }

  /* State changes 状态变化 */

  function syncTimer() {
    const timed = state.phase === 'stare' || state.phase === 'look';
    if (timed && !timer) {
      timer = window.setInterval(tick, TICK_MS);
    } else if (!timed && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  }

  function setState(next) {
    if (next === state) return;
    const previous = state;
    const active = document.activeElement;
    const focusInside = active instanceof HTMLElement && root.contains(active);
    state = next;
    render();
    syncTimer();
    live.announce(phaseAnnouncement(previous, next));
    // Keyboard users stay in the widget: when the focused control disappeared with the step, focus the new step's control.
    // While the learner stares at the dot (steps 1 and 2) focusing must not scroll, or the picture would move.
    // 让键盘用户留在组件里：当前获得焦点的控件随步骤消失时，把焦点移到新步骤的主要控件。
    // 学习者盯着黑点时（第 1、2 步）移动焦点不能滚动页面，否则图会跟着移动。
    if (focusInside && previous.phase !== next.phase && isHidden(active)) {
      focusTargets[next.phase]?.focus({ preventScroll: next.phase === 'stare' || next.phase === 'look' });
    }
  }

  function tick() {
    const next = advance(state, clock());
    if (next === state) updateClock();
    else setState(next);
  }

  // The step buttons ignore the second click of a double-click, which would otherwise land on whatever the first
  // click put under the pointer: after Skip, Continue sits about where Skip was, so a double-click on Skip would
  // also skip the white field (see isRepeatClick).
  // 步骤按钮忽略双击中的第二次点击；否则它会落在第一次点击放到指针下面的东西上：按下“跳过”后，“继续”差不多就在“跳过”原来的位置，
  // 双击“跳过”会连白色区域也跳过（见 isRepeatClick）。
  function onStepClick(element, action) {
    element.addEventListener('click', (event) => {
      if (!isRepeatClick(event.detail)) action();
    }, { signal });
  }

  onStepClick(startButton, () => {
    setState(startStare(state, clock()));
    // Bring the whole picture into view at once (no smooth scrolling) before the learner starts staring.
    // 开始盯之前，立即（不平滑滚动）把整张图移进视野。
    if (typeof mainFigure.scrollIntoView === 'function') mainFigure.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  onStepClick(explainOnlyButton, () => setState(goToExplanation(state)));
  onStepClick(skipButton, () => setState(skipStare(state, clock())));
  onStepClick(continueButton, () => setState(finishLook(state)));
  onStepClick(toggleButton, () => {
    const next = toggleExpected(state);
    if (next === state) return;
    setState(next);
    live.announce(announcement(next.showExpected ? 'expectedShown' : 'expectedHidden', next));
  });
  onStepClick(restartButton, () => setState(restart(state)));
  slider.addEventListener('input', () => {
    const value = Number.isFinite(slider.valueAsNumber) ? slider.valueAsNumber : Number(slider.value);
    setState(setSeconds(state, value));
  }, { signal });
  // A stare stops counting when the page is hidden (another tab, a locked phone); the learner starts it again.
  // 页面被隐藏（切到别的标签页、手机锁屏）时，这次盯视不再算数，学习者重新开始。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') setState(interrupt(state));
  }, { signal });

  container.replaceChildren(root);
  render();

  return () => {
    controller.abort();
    if (timer) window.clearInterval(timer);
    timer = 0;
  };
}
