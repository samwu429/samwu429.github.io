/**
 * Turtle sandbox widget: a PencilCode-style program from Lecture 2, the drawing it makes, and a counter on
 * every line that shows how many times the line executed (the "Computation Time" idea of Lecture 2).
 * 海龟沙盒组件：Lecture 2 的 PencilCode 风格程序、它画出的图，以及每行旁边“执行了几次”的计数（Lecture 2 的 Computation Time）。
 *
 * Config / 配置: { preset: 'sequence' | 'function-call' | 'function-param' | 'function-two-params'
 *                          | 'loop' | 'loop-robot' | 'loop-robot-9' | 'loop-calls-function' | 'nested-loop' }
 * The whole run is computed first (turtle-interpreter.js); this module only plays it back.
 * 整个运行过程先算好（turtle-interpreter.js），本模块只负责回放。
 */
import { h, s, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { icon } from '../../../core/dom/icons.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { button } from '../../../components/controls/button.js';
import { segmented } from '../../../components/controls/segmented.js';
import { badge } from '../../../components/badges/badge.js';
import { TOO_COMPLEX, parseProgram, sourceLines } from './turtle-language.js';
import { runProgram } from './turtle-interpreter.js';
import {
  axesPathData, gridPathData, niceStep, normalizeDegrees, partialPoints, pointAlong, pointsPathData, svgNumber,
  traceBounds, viewFor,
} from './turtle-geometry.js';
import { describeStep, formatNumber, headingWords, highlightLine, summarizeRun } from './turtle-explain.js';
import { getPreset } from './turtle-presets.js';

// Animation speed = the `speed` in the code (steps per second) times this multiplier.
// 动画速度 = 代码里的 speed（每秒几步）乘以这里的倍数。
const SPEED_OPTIONS = [
  { value: '1', label: '慢 Slow', title: '和代码里的 speed 一样快 As fast as speed in the code' },
  { value: '4', label: '中 Normal', title: '4 倍速 4 times faster' },
  { value: '25', label: '快 Fast', title: '25 倍速 25 times faster' },
];
const DEFAULT_SPEED = '4';
const MAX_COMMITS_PER_FRAME = 2500;
const SEGMENTS_PER_PATH = 400;

const INTRO = {
  zh: '按“运行”看海龟一条一条执行指令；每行右边的 ×N 表示这一行执行了 N 次。也可以按“改代码”改个数字，再运行一次。',
  en: 'Press Run to watch the turtle follow the instructions one at a time. ×N next to a line means it ran N times. Use Edit code to change a number and run it again.',
};
const IDLE = {
  zh: '准备好了：按“运行”从头播放，或按“单步”一次只执行一步。',
  en: 'Ready: press Run to play, or Step to run one step at a time.',
};
// Pen colours follow the theme so lines stay visible, which turns `black` light on the dark canvas.
// 画笔颜色跟随主题以保证看得清：在深色画布上，`black` 会画成浅色。
const DARK_INK_NOTE = {
  zh: '深色模式下画布是深色的：`black` 的线画成浅色，`white` 画成深色，这样才看得清。',
  en: 'In dark mode the canvas is dark, so `black` is drawn light and `white` dark to stay visible.',
};
const PLAIN_INKS = new Set(['black', 'white']);

let instances = 0;

export async function mount(container, config = {}, context = {}) {
  await ensureStylesheet(new URL('./turtle-sandbox.css', import.meta.url));
  instances += 1;
  const uid = `turtle-sandbox-${instances}`;
  const preset = getPreset(config && config.preset);
  const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  let source = preset.code;
  let program = null;
  let run = null;
  let stage = null;
  let rows = [];
  let counts = [];
  let callsSoFar = new Map();
  let iterationsSoFar = new Map();
  let executedSoFar = 0;
  let namesPlainInk = false;
  let maxCount = 0;
  let committed = 0;
  let budget = 0;
  let started = false;
  let playing = false;
  let editing = false;
  let destroyed = false;
  let frameId = 0;
  let lastTime = 0;
  let currentLine = 0;
  let describedStep;
  let poseKey = '';
  let progressKey = '';
  let multiplier = Number(DEFAULT_SPEED);
  let allDirty = true;
  const dirty = new Set();

  // ---- Layout / 布局 ----
  const ids = {
    title: `${uid}-title`,
    code: `${uid}-code`,
    stage: `${uid}-stage`,
    insights: `${uid}-insights`,
    editor: `${uid}-editor`,
    editorHint: `${uid}-editor-hint`,
  };

  const runButton = button({ label: '运行 Run', iconName: 'play', variant: 'primary', onClick: () => onRun() });
  const stepButton = button({ label: '单步 Step', iconName: 'stepForward', onClick: () => onStep() });
  const finishButton = button({ label: '直接看结果 Show result', iconName: 'skipForward', onClick: () => onFinish() });
  const resetButton = button({ label: '重置 Reset', iconName: 'refresh', variant: 'ghost', onClick: () => onReset() });
  const speedControl = segmented({
    options: SPEED_OPTIONS,
    value: DEFAULT_SPEED,
    ariaLabel: '动画速度 Animation speed',
    size: 'sm',
    onChange: (value) => {
      multiplier = Number(value) || 1;
    },
  });

  const nowLine = h('p', { class: 'turtle-sandbox__now' });
  const executedText = h('p', { class: 'turtle-sandbox__executed' });
  const progressFill = h('div', { class: 'progress__fill' });
  const progressTrack = h('div', {
    class: 'progress__track',
    role: 'progressbar',
    'aria-label': '已执行的指令 Instructions executed',
    'aria-valuemin': 0,
    'aria-valuemax': 0,
    'aria-valuenow': 0,
  }, progressFill);
  const feedback = h('div', { class: 'turtle-sandbox__alert', role: 'alert' });

  const legend = h('p', { class: 'turtle-sandbox__legend' });
  const codeList = h('ol', { class: 'turtle-sandbox__code', role: 'list', 'aria-labelledby': ids.code, translate: 'no' });
  const editButton = button({ label: '改代码 Edit code', iconName: 'pencil', size: 'sm', onClick: () => enterEdit() });
  const restoreButton = button({ label: '恢复原例子 Restore example', iconName: 'undo', size: 'sm', variant: 'ghost', onClick: () => restorePreset() });
  const editedBadge = badge('已修改 Edited', 'warn');

  const editor = h('textarea', {
    id: ids.editor,
    class: ['textarea', 'turtle-sandbox__editor'],
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    wrap: 'off',
    translate: 'no',
    'aria-describedby': ids.editorHint,
    onkeydown: onEditorKeydown,
  });
  const editorError = h('div', { class: 'turtle-sandbox__alert', role: 'alert' });
  const editorPanel = h('div', { class: 'turtle-sandbox__editor-panel', hidden: true },
    h('label', { class: 'field__label', for: ids.editor }, '编辑代码 Edit the code'),
    editor,
    h('p', { class: 'turtle-sandbox__hint', id: ids.editorHint },
      zhNode('每行写一条指令；函数和 for 循环里面的行要多缩进 2 个空格。按 Ctrl + Enter 也能运行。', 'label'), ' ',
      enNode('One instruction per line; lines inside a function or a for-loop are indented by 2 more spaces. Ctrl + Enter runs the code.')),
    editorError,
    h('div', { class: 'turtle-sandbox__editor-actions' },
      button({ label: '运行这段代码 Run this code', iconName: 'play', variant: 'primary', size: 'sm', onClick: () => onRun({ fromEditor: true }) }),
      button({ label: '取消 Cancel', size: 'sm', onClick: () => cancelEdit() }),
      button({
        label: '恢复原例子 Restore example',
        iconName: 'undo',
        size: 'sm',
        variant: 'ghost',
        onClick: () => {
          editor.value = preset.code;
          editorError.replaceChildren();
          editor.focus();
        },
      })));

  const stageBox = h('div', { class: 'turtle-sandbox__stage' });
  const poseLine = h('p', { class: 'turtle-sandbox__pose' });
  const inkNote = h('p', { class: 'turtle-sandbox__ink-note', hidden: true },
    zhNode(DARK_INK_NOTE.zh, 'label'), ' ', enNode(DARK_INK_NOTE.en));
  const insightList = h('ul', { class: 'turtle-sandbox__insight-list' });
  const insights = h('section', { class: 'turtle-sandbox__insights', hidden: true, 'aria-labelledby': ids.insights },
    h('h4', { class: 'turtle-sandbox__panel-title', id: ids.insights }, biTitle({ zh: '看懂这些数字', en: 'What the numbers mean' })),
    insightList);
  const announcer = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });

  const root = h('section', { class: 'turtle-sandbox', 'aria-labelledby': ids.title },
    h('header', { class: 'turtle-sandbox__header' },
      h('span', { class: 'turtle-sandbox__eyebrow' }, '互动演示 Interactive'),
      h('h3', { class: 'turtle-sandbox__title', id: ids.title }, biTitle(preset.title)),
      h('div', { class: 'turtle-sandbox__meta' },
        badge(`Lecture 2 · ${preset.source.zh} ${preset.source.en}`, 'neutral'),
        editedBadge),
      h('div', { class: 'turtle-sandbox__intro' }, zhNode(INTRO.zh, 'teach', 'p'), enNode(INTRO.en, 'p'))),
    h('div', { class: 'turtle-sandbox__toolbar' },
      h('div', { class: 'turtle-sandbox__buttons' }, runButton, stepButton, finishButton, resetButton),
      h('div', { class: 'turtle-sandbox__speed' },
        h('span', { class: 'turtle-sandbox__speed-label', 'aria-hidden': 'true' }, '速度 Speed'),
        speedControl)),
    h('div', { class: 'turtle-sandbox__status' },
      nowLine,
      h('div', { class: 'turtle-sandbox__meter' }, executedText, h('div', { class: 'progress progress--sm' }, progressTrack))),
    feedback,
    h('div', { class: 'turtle-sandbox__panels' },
      h('section', { class: 'turtle-sandbox__panel', 'aria-labelledby': ids.code },
        h('div', { class: 'turtle-sandbox__panel-head' },
          h('h4', { class: 'turtle-sandbox__panel-title', id: ids.code }, biTitle({ zh: '代码', en: 'Code' })),
          h('div', { class: 'turtle-sandbox__panel-actions' }, editButton, restoreButton)),
        legend,
        codeList,
        editorPanel),
      h('section', { class: 'turtle-sandbox__panel', 'aria-labelledby': ids.stage },
        h('div', { class: 'turtle-sandbox__panel-head' },
          h('h4', { class: 'turtle-sandbox__panel-title', id: ids.stage }, biTitle({ zh: '画布', en: 'Canvas' }))),
        stageBox,
        poseLine,
        inkNote)),
    insights,
    announcer);

  replaceContent(container, root);
  loadSource(source);

  // ---- Program loading / 载入程序 ----

  // Parses and runs the code; on success the views are rebuilt and playback starts over.
  // Anything unexpected becomes a message, so the editor always explains why nothing happened.
  // 解析并运行代码；成功后重建视图并从头开始。返回错误对象或 null。
  // 意外的错误也会变成提示信息，编辑框总能说明为什么没有运行。
  function loadSource(text) {
    let parsed;
    let nextRun;
    try {
      parsed = parseProgram(text);
      if (parsed.error) return parsed.error;
      nextRun = runProgram(parsed.program);
    } catch {
      return { line: null, zh: TOO_COMPLEX.zh, en: TOO_COMPLEX.en, kind: 'runtime' };
    }
    source = text;
    program = parsed.program;
    run = nextRun;
    namesPlainInk = run.steps.some((step) => ['pen', 'box', 'dot'].includes(step.kind) && PLAIN_INKS.has(step.detail?.color));
    buildCodeView();
    buildStage();
    resetPlayback();
    syncEdited();
    return null;
  }

  function buildCodeView() {
    rows = program.lines.map((text, index) => {
      const line = index + 1;
      const kind = program.lineKinds[line];
      const row = { line, kind, li: null, countEl: null, countVisible: null, countHidden: null };
      if (kind) {
        row.countVisible = h('span', { 'aria-hidden': 'true' });
        row.countHidden = h('span', { class: 'visually-hidden' });
        row.countEl = h('span', { class: ['turtle-sandbox__count', kind !== 'instruction' && `turtle-sandbox__count--${kind}`] },
          row.countVisible, row.countHidden);
      }
      row.li = h('li', { class: 'turtle-sandbox__line' },
        h('span', { class: 'turtle-sandbox__ln', 'aria-hidden': 'true' }, String(line)),
        h('code', { class: 'turtle-sandbox__src' }, renderCode(text)),
        row.countEl);
      return row;
    });
    replaceContent(codeList, rows.map((row) => row.li));
    currentLine = 0;
    replaceContent(legend,
      h('span', { class: 'turtle-sandbox__legend-item' },
        zhNode('×N = 这一行执行了 N 次', 'label'), ' ', enNode('this line was executed N times')),
      program.loops.length
        ? h('span', { class: 'turtle-sandbox__legend-item' },
          zhNode('转 ×N = 循环转了 N 圈（for 这一行不计入指令数）', 'label'), ' ',
          enNode('the loop made N iterations (the for line is not counted as an instruction)'))
        : null,
      program.definitions.length
        ? h('span', { class: 'turtle-sandbox__legend-item' },
          zhNode('调用 ×N = 函数被调用了 N 次', 'label'), ' ', enNode('the function was called N times'))
        : null);
  }

  function renderCode(text) {
    return highlightLine(text).map((segment) => (segment.kind === 'plain'
      ? segment.text
      : h('span', { class: ['turtle-sandbox__tok', `turtle-sandbox__tok--${segment.kind}`] }, segment.text)));
  }

  function buildStage() {
    const view = viewFor(traceBounds(run.steps, run.initial));
    const grid = niceStep(view.span / 8);
    const minWidth = view.span / 160;
    const ink = s('g', { class: 'turtle-sandbox__ink' });
    const live = s('path', { class: 'turtle-sandbox__stroke', d: '' });
    const turtle = s('g', { class: 'turtle-sandbox__turtle' }, turtleShape());
    const svg = s('svg', {
      class: 'turtle-sandbox__svg',
      viewBox: [view.x, view.y, view.width, view.height].map(svgNumber).join(' '),
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': `海龟画布，网格每格 ${formatNumber(grid)} Turtle canvas, grid squares of ${formatNumber(grid)}`,
      focusable: 'false',
    },
    s('path', { class: 'turtle-sandbox__grid', d: gridPathData(view, grid) }),
    s('path', { class: 'turtle-sandbox__axes', d: axesPathData(view) }),
    ink,
    live,
    turtle);
    replaceContent(stageBox, svg);
    stage = {
      grid,
      minWidth,
      live,
      liveKey: '',
      turtle,
      turtleScale: view.span / 13,
      ink: createInkLayer(ink, minWidth),
    };
    poseKey = '';
  }

  // The theme is read from the computed color-scheme that tokens.css sets, whenever a run is loaded,
  // reset or finished, so a theme switch shows up at the next of those.
  // 主题取自 tokens.css 设置的 color-scheme 计算值；每次载入、重置或运行结束时读取，切换主题后在下一次这些操作时生效。
  function syncInkNote() {
    const dark = typeof window.getComputedStyle === 'function'
      && window.getComputedStyle(document.documentElement).colorScheme === 'dark';
    inkNote.hidden = !(namesPlainInk && dark);
  }

  // ---- Playback / 播放 ----

  function isDone() {
    return started && committed >= run.steps.length;
  }

  function resetPlayback() {
    stopFrames();
    started = false;
    committed = 0;
    budget = 0;
    counts = new Array(program.lines.length + 1).fill(0);
    callsSoFar = new Map();
    iterationsSoFar = new Map();
    executedSoFar = 0;
    maxCount = 0;
    allDirty = true;
    dirty.clear();
    describedStep = undefined;
    progressKey = '';
    stage.ink.clear();
    rows.forEach((row) => row.li.classList.remove('is-error'));
    feedback.replaceChildren();
    insights.hidden = true;
    insightList.replaceChildren();
    syncInkNote();
    paint(null);
    updateButtons();
  }

  function stopFrames() {
    playing = false;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function durationOf(step) {
    // Steps that are not instructions (a definition, the start of a loop iteration) are shown briefly;
    // every instruction lasts one "move" at the current speed.
    // 不是指令的步骤（定义函数、循环开始新的一圈）只闪一下；每条指令按当前速度占一步的时间。
    return (step.counted ? 1 : 0.5) / (Math.max(0.05, step.speed) * multiplier);
  }

  function commit(index) {
    const step = run.steps[index];
    if (step.draw) stage.ink.add(step.draw);
    if (step.counted) {
      counts[step.line] += 1;
      executedSoFar += 1;
      dirty.add(step.line);
      if (counts[step.line] > maxCount) {
        maxCount = counts[step.line];
        allDirty = true;
      }
    }
    if (step.kind === 'call') {
      const defLine = step.detail.defLine;
      callsSoFar.set(defLine, (callsSoFar.get(defLine) || 0) + 1);
      dirty.add(defLine);
    }
    if (step.kind === 'iterate') {
      iterationsSoFar.set(step.line, (iterationsSoFar.get(step.line) || 0) + 1);
      dirty.add(step.line);
    }
  }

  function frame(now) {
    if (destroyed || !playing) return;
    const elapsed = Math.min(0.25, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    budget += elapsed;
    let commits = 0;
    while (committed < run.steps.length) {
      const duration = durationOf(run.steps[committed]);
      if (budget < duration) break;
      budget -= duration;
      commit(committed);
      committed += 1;
      commits += 1;
      if (commits >= MAX_COMMITS_PER_FRAME) {
        budget = 0;
        break;
      }
    }
    if (committed >= run.steps.length) {
      finishRun();
      return;
    }
    const step = run.steps[committed];
    paint({ step, fraction: Math.min(1, budget / durationOf(step)) });
    frameId = requestAnimationFrame(frame);
  }

  function prefersReducedMotion() {
    return Boolean(motionQuery && motionQuery.matches);
  }

  function play() {
    started = true;
    if (prefersReducedMotion()) {
      // Reduced motion: show the finished drawing at once; Step still walks through it.
      // 减少动态效果：直接显示最终结果；“单步”依然可以逐步查看。
      finishAll();
      return;
    }
    playing = true;
    lastTime = performance.now();
    frameId = requestAnimationFrame(frame);
    updateButtons();
    announce('开始运行 Running');
  }

  function pause() {
    stopFrames();
    updateButtons();
    announce('已暂停 Paused');
  }

  function finishAll() {
    started = true;
    stopFrames();
    while (committed < run.steps.length) {
      commit(committed);
      committed += 1;
    }
    finishRun();
  }

  function finishRun() {
    stopFrames();
    started = true;
    budget = 0;
    syncInkNote();
    paint(null);
    describeFinished();
    replaceContent(insightList, summarizeRun(program, run).map((item) => h('li', { class: 'turtle-sandbox__insight' },
      zhNode(item.zh, 'teach', 'p'),
      enNode(item.en, 'p'))));
    insights.hidden = false;
    if (run.error) {
      replaceContent(feedback, messageBox(run.error));
      const row = run.error.line ? rows[run.error.line - 1] : null;
      if (row) row.li.classList.add('is-error');
    }
    updateButtons();
    announce(`运行结束，一共执行了 ${run.executed} 条指令。Finished: ${run.executed} instructions run.`);
  }

  // ---- Button handlers / 按钮 ----

  function onRun({ fromEditor = false } = {}) {
    if (editing && !applyEditor(fromEditor)) return;
    if (playing) {
      pause();
      return;
    }
    if (isDone()) resetPlayback();
    play();
  }

  function onStep() {
    if (editing && !applyEditor(false)) return;
    if (isDone()) return;
    started = true;
    stopFrames();
    budget = 0;
    if (committed < run.steps.length) {
      commit(committed);
      committed += 1;
    }
    if (committed >= run.steps.length) {
      finishRun();
      return;
    }
    paint(null);
    updateButtons();
    const step = run.steps[committed - 1];
    const words = describeStep(step);
    announce(stripMarkup(`第 ${step.line} 行：${words.zh}。Line ${step.line}: ${words.en}.`));
  }

  function onFinish() {
    if (editing && !applyEditor(false)) return;
    finishAll();
  }

  function onReset() {
    resetPlayback();
    announce('已重置 Reset');
  }

  function setButton(target, label, iconName) {
    replaceContent(target, icon(iconName), h('span', { class: 'btn__label' }, label));
  }

  function setDisabled(target, disabled) {
    if (disabled && document.activeElement === target) runButton.focus();
    target.disabled = disabled;
  }

  function updateButtons() {
    // While editing, every button applies the new code first, so nothing counts as finished.
    // 编辑代码时，每个按钮都会先应用新代码，因此不算“已运行完”。
    const done = isDone() && !editing;
    if (playing) setButton(runButton, '暂停 Pause', 'pause');
    else if (editing) setButton(runButton, '运行 Run', 'play');
    else if (done) setButton(runButton, '再运行一次 Run again', 'refresh');
    else if (started) setButton(runButton, '继续 Resume', 'play');
    else setButton(runButton, '运行 Run', 'play');
    setDisabled(stepButton, done);
    setDisabled(finishButton, done);
    setDisabled(resetButton, !started);
  }

  // ---- Painting / 绘制 ----

  function paint(partial) {
    stage.ink.flush();
    paintCounts();
    let pose;
    let focus;
    if (partial) {
      pose = partialPose(partial.step, partial.fraction);
      drawLive(partial.step, partial.fraction);
      focus = partial.step;
    } else {
      pose = committedState();
      clearLive();
      focus = committed > 0 ? run.steps[committed - 1] : null;
    }
    placeTurtle(pose);
    paintPose(pose, committedState().penDown);
    setCurrentLine(focus ? focus.line : 0);
    paintProgress();
    if (focus !== describedStep) {
      describedStep = focus;
      describeNow(focus);
    }
  }

  function committedState() {
    return committed > 0 ? run.steps[committed - 1].after : run.initial;
  }

  function partialPose(step, fraction) {
    const pose = { x: step.before.x, y: step.before.y, visible: step.before.visible };
    if (step.path) [pose.x, pose.y] = pointAlong(step.path, fraction);
    pose.heading = step.before.heading + (step.after.heading - step.before.heading) * fraction;
    return pose;
  }

  function drawLive(step, fraction) {
    if (!step.draw || step.draw.type !== 'line') {
      clearLive();
      return;
    }
    const key = `${step.draw.color}|${step.draw.width}`;
    if (stage.liveKey !== key) {
      stage.live.setAttribute('class', `turtle-sandbox__stroke turtle-sandbox__ink--${step.draw.color}`);
      stage.live.setAttribute('stroke-width', svgNumber(Math.max(step.draw.width, stage.minWidth)));
      stage.liveKey = key;
    }
    stage.live.setAttribute('d', pointsPathData(partialPoints(step.draw.points, fraction)));
  }

  function clearLive() {
    if (stage.live.getAttribute('d')) stage.live.setAttribute('d', '');
  }

  function placeTurtle(pose) {
    stage.turtle.setAttribute('transform',
      `translate(${svgNumber(pose.x)} ${svgNumber(-pose.y)}) rotate(${svgNumber(normalizeDegrees(pose.heading))}) scale(${svgNumber(stage.turtleScale)})`);
    stage.turtle.classList.toggle('is-hidden', pose.visible === false);
  }

  function paintPose(pose, penDown) {
    const heading = Math.round(normalizeDegrees(pose.heading) * 100) / 100 % 360;
    const key = `${formatNumber(pose.x)}|${formatNumber(pose.y)}|${heading}|${penDown}|${stage.grid}`;
    if (key === poseKey) return;
    poseKey = key;
    const words = headingWords(heading);
    const degrees = `${formatNumber(heading)}°`;
    replaceContent(poseLine,
      h('span', { class: 'turtle-sandbox__pose-xy' }, `x = ${formatNumber(pose.x)}, y = ${formatNumber(pose.y)}`),
      h('span', { class: 'turtle-sandbox__pose-item' },
        zhNode(`朝向 ${degrees}${words ? `（${words.zh}）` : ''}`, 'label'), ' ',
        enNode(`heading ${degrees}${words ? ` (${words.en})` : ''}`)),
      h('span', { class: 'turtle-sandbox__pose-item' },
        zhNode(penDown ? '落笔' : '抬笔', 'label'), ' ', enNode(penDown ? 'pen down' : 'pen up')),
      h('span', { class: 'turtle-sandbox__pose-item' },
        zhNode(`每格 ${formatNumber(stage.grid)}`, 'label'), ' ', enNode(`grid ${formatNumber(stage.grid)}`)));
  }

  function paintCounts() {
    if (allDirty) rows.forEach(paintCount);
    else dirty.forEach((line) => paintCount(rows[line - 1]));
    dirty.clear();
    allDirty = false;
  }

  function paintCount(row) {
    if (!row || !row.countEl) return;
    if (row.kind === 'define') {
      const calls = callsSoFar.get(row.line) || 0;
      const words = `函数被调用了 ${calls} 次 called ${calls} ${calls === 1 ? 'time' : 'times'}`;
      row.countVisible.textContent = `调用 ×${formatNumber(calls)}`;
      row.countHidden.textContent = words;
      row.countEl.title = words;
      row.countEl.classList.toggle('is-idle', calls === 0);
      return;
    }
    if (row.kind === 'loop') {
      const turns = iterationsSoFar.get(row.line) || 0;
      const words = `循环转了 ${turns} 圈 ${turns} ${turns === 1 ? 'iteration' : 'iterations'}`;
      row.countVisible.textContent = `转 ×${formatNumber(turns)}`;
      row.countHidden.textContent = words;
      row.countEl.title = words;
      row.countEl.classList.toggle('is-idle', turns === 0);
      return;
    }
    const count = counts[row.line] || 0;
    const words = `执行了 ${count} 次 executed ${count} ${count === 1 ? 'time' : 'times'}`;
    row.countVisible.textContent = `×${formatNumber(count)}`;
    row.countHidden.textContent = words;
    row.countEl.title = words;
    row.countEl.classList.toggle('is-idle', count === 0);
    // Log scale, so lines that run 100 times glow clearly hotter than lines that run 10 times.
    // 用对数刻度，执行 100 次的行明显比执行 10 次的行更“热”。
    const heat = count && maxCount ? Math.log(count + 1) / Math.log(maxCount + 1) : 0;
    row.countEl.style.setProperty('--turtle-heat', heat.toFixed(3));
  }

  function setCurrentLine(line) {
    if (line === currentLine) return;
    const previous = rows[currentLine - 1];
    if (previous) {
      previous.li.classList.remove('is-current');
      previous.li.removeAttribute('aria-current');
    }
    currentLine = line;
    const row = rows[line - 1];
    if (!row) return;
    row.li.classList.add('is-current');
    row.li.setAttribute('aria-current', 'step');
    revealRow(row.li);
  }

  // Scrolls only the code box (never the page) so the current line stays visible.
  // 只滚动代码框（不滚动整个页面），让当前行保持可见。
  function revealRow(li) {
    if (codeList.hidden || codeList.scrollHeight <= codeList.clientHeight) return;
    const top = li.offsetTop;
    const bottom = top + li.offsetHeight;
    if (top < codeList.scrollTop) codeList.scrollTop = Math.max(0, top - 8);
    else if (bottom > codeList.scrollTop + codeList.clientHeight) codeList.scrollTop = bottom - codeList.clientHeight + 8;
  }

  function paintProgress() {
    const total = run.executed;
    const key = `${executedSoFar}/${total}`;
    if (key === progressKey) return;
    progressKey = key;
    replaceContent(executedText,
      zhNode(`已执行 ${formatNumber(executedSoFar)} / ${formatNumber(total)} 条指令`, 'label'), ' ',
      enNode(`${formatNumber(executedSoFar)} of ${formatNumber(total)} instructions executed`));
    progressTrack.setAttribute('aria-valuemax', String(total));
    progressTrack.setAttribute('aria-valuenow', String(executedSoFar));
    progressFill.style.width = total ? `${((100 * executedSoFar) / total).toFixed(1)}%` : '0%';
  }

  function describeNow(step) {
    if (!step) {
      replaceContent(nowLine, zhNode(IDLE.zh, 'label'), ' ', enNode(IDLE.en));
      return;
    }
    const words = describeStep(step);
    replaceContent(nowLine,
      h('span', { class: 'turtle-sandbox__now-line' }, `第 ${step.line} 行 Line ${step.line}`), ' ',
      zhNode(words.zh, 'label'), ' ',
      enNode(words.en));
  }

  function describeFinished() {
    describedStep = null;
    const stopped = Boolean(run.error);
    replaceContent(nowLine,
      h('span', { class: 'turtle-sandbox__now-line' }, stopped ? '停下了 Stopped' : '运行结束 Finished'), ' ',
      zhNode(stopped ? '程序没有跑完，原因见下面的提示。' : '整个程序都执行完了。看看每行右边的次数。', 'label'), ' ',
      enNode(stopped ? 'The program did not finish; see the message below.' : 'The whole program has run. Check the counts next to each line.'));
  }

  function messageBox(error) {
    const heads = {
      syntax: { zh: '代码写法有问题', en: 'Code error' },
      runtime: { zh: '运行时出错', en: 'Error while running' },
      limit: { zh: '到达步数上限', en: 'Step limit reached' },
    };
    const head = heads[error.kind] || heads.runtime;
    const where = error.line ? ` · 第 ${error.line} 行 Line ${error.line}` : '';
    return h('div', { class: ['turtle-sandbox__message', `turtle-sandbox__message--${error.kind === 'limit' ? 'limit' : 'error'}`] },
      h('p', { class: 'turtle-sandbox__message-head' }, icon('alert', { size: 16 }), h('span', {}, `${head.zh} ${head.en}${where}`)),
      zhNode(error.zh, 'label', 'p'),
      enNode(error.en, 'p'));
  }

  function announce(text) {
    // A trailing non-breaking space toggles so a repeated message is announced again.
    // 末尾交替添加不换行空格，使相同的消息也会被再次朗读。
    announcer.textContent = announcer.textContent.endsWith(' ') ? text : `${text} `;
  }

  // ---- Editing / 编辑代码 ----

  function enterEdit() {
    if (playing) pause();
    editing = true;
    editor.value = source;
    editor.rows = Math.min(20, Math.max(6, sourceLines(source).length + 1));
    editorError.replaceChildren();
    codeList.hidden = true;
    legend.hidden = true;
    editButton.hidden = true;
    restoreButton.hidden = true;
    editorPanel.hidden = false;
    updateButtons();
    editor.focus();
  }

  function exitEdit() {
    editing = false;
    editorPanel.hidden = true;
    editorError.replaceChildren();
    codeList.hidden = false;
    legend.hidden = false;
    editButton.hidden = false;
    syncEdited();
    updateButtons();
  }

  function cancelEdit() {
    exitEdit();
    editButton.focus();
  }

  function applyEditor(fromEditor) {
    const error = loadSource(editor.value);
    if (error) {
      replaceContent(editorError, messageBox(error));
      if (error.line) selectEditorLine(error.line);
      editor.focus();
      return false;
    }
    exitEdit();
    if (fromEditor) runButton.focus();
    return true;
  }

  function selectEditorLine(line) {
    const lines = editor.value.replace(/\r\n?/g, '\n').split('\n');
    let start = 0;
    for (let index = 0; index < line - 1 && index < lines.length; index += 1) start += lines[index].length + 1;
    const end = start + (lines[line - 1] || '').length;
    try {
      editor.setSelectionRange(start, end);
    } catch {
      // Selection is only a convenience. 选中出错行只是辅助功能。
    }
  }

  function restorePreset() {
    loadSource(preset.code);
    editButton.focus();
    announce('已恢复原来的例子 Example restored');
  }

  function syncEdited() {
    const edited = source.trim() !== preset.code.trim();
    editedBadge.hidden = !edited;
    restoreButton.hidden = editing || !edited;
  }

  function onEditorKeydown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onRun({ fromEditor: true });
      return;
    }
    // Enter keeps the indentation and adds 2 spaces after "->" or a for-loop header.
    // 回车时保持当前缩进；在 "->" 或 for 循环头之后再多缩进 2 格。
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing || event.keyCode === 229) return;
    if (typeof editor.setRangeText !== 'function') return;
    const { selectionStart, selectionEnd, value } = editor;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const before = value.slice(lineStart, selectionStart);
    let indent = /^[ \t]*/.exec(before)[0].replace(/\t/g, '  ');
    const code = before.replace(/#.*$/, '').trim();
    if (/[-=]>$/.test(code) || /^for\b/.test(code)) indent += '  ';
    event.preventDefault();
    editor.setRangeText(`\n${indent}`, selectionStart, selectionEnd, 'end');
  }

  return () => {
    destroyed = true;
    stopFrames();
  };
}

/**
 * Collects drawn shapes and writes them to SVG in batches: consecutive lines of the same pen share one
 * <path>, so even thousands of strokes stay light.
 * 收集画出的图形并分批写入 SVG：同一支笔的连续线段共用一个 <path>，几千笔也不卡。
 */
function createInkLayer(group, minWidth) {
  const pending = [];
  let open = null;

  function close() {
    if (open && open.dirty) open.element.setAttribute('d', open.parts.join(''));
    open = null;
  }

  function appendLine(shape) {
    const key = `${shape.color}|${shape.width}`;
    if (!open || open.key !== key || open.segments >= SEGMENTS_PER_PATH) {
      close();
      const element = s('path', {
        class: ['turtle-sandbox__stroke', `turtle-sandbox__ink--${shape.color}`],
        'stroke-width': svgNumber(Math.max(shape.width, minWidth)),
      });
      group.append(element);
      open = { key, element, parts: [], segments: 0, lastX: NaN, lastY: NaN, dirty: false };
    }
    const points = shape.points;
    const [firstX, firstY] = points[0];
    if (firstX !== open.lastX || firstY !== open.lastY) open.parts.push(`M${svgNumber(firstX)} ${svgNumber(-firstY)}`);
    for (let index = 1; index < points.length; index += 1) {
      open.parts.push(`L${svgNumber(points[index][0])} ${svgNumber(-points[index][1])}`);
    }
    open.segments += points.length - 1;
    [open.lastX, open.lastY] = points[points.length - 1];
    open.dirty = true;
  }

  function stamp(shape) {
    close();
    const classes = ['turtle-sandbox__fill', `turtle-sandbox__ink--${shape.color}`];
    if (shape.type === 'box') {
      group.append(s('polygon', { class: classes, points: shape.points.map(([x, y]) => `${svgNumber(x)},${svgNumber(-y)}`).join(' ') }));
    } else {
      group.append(s('circle', { class: classes, cx: svgNumber(shape.cx), cy: svgNumber(-shape.cy), r: svgNumber(shape.r) }));
    }
  }

  return {
    add(shape) {
      pending.push(shape);
    },
    flush() {
      for (const shape of pending) {
        if (shape.type === 'line') appendLine(shape);
        else stamp(shape);
      }
      pending.length = 0;
      if (open && open.dirty) {
        open.element.setAttribute('d', open.parts.join(''));
        open.dirty = false;
      }
    },
    clear() {
      pending.length = 0;
      open = null;
      group.replaceChildren();
    },
  };
}

/** Turtle drawn in unit coordinates, head pointing up (-y). 以单位坐标绘制的海龟，头朝上（-y）。 */
function turtleShape() {
  const skin = 'turtle-sandbox__turtle-skin';
  return [
    s('ellipse', { class: skin, cx: -0.36, cy: -0.26, rx: 0.13, ry: 0.17 }),
    s('ellipse', { class: skin, cx: 0.36, cy: -0.26, rx: 0.13, ry: 0.17 }),
    s('ellipse', { class: skin, cx: -0.34, cy: 0.3, rx: 0.13, ry: 0.17 }),
    s('ellipse', { class: skin, cx: 0.34, cy: 0.3, rx: 0.13, ry: 0.17 }),
    s('path', { class: skin, d: 'M-0.08 0.42L0 0.62L0.08 0.42Z' }),
    s('ellipse', { class: skin, cx: 0, cy: -0.58, rx: 0.15, ry: 0.18 }),
    s('ellipse', { class: 'turtle-sandbox__turtle-shell', cx: 0, cy: 0, rx: 0.34, ry: 0.44 }),
    s('path', { class: 'turtle-sandbox__turtle-mark', d: 'M0 -0.26L0.17 -0.12L0.17 0.12L0 0.26L-0.17 0.12L-0.17 -0.12Z' }),
  ];
}
