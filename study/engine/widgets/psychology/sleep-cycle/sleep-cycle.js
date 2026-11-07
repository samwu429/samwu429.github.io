/**
 * Widget "sleep-cycle": a hypnogram of a typical young adult's night (textbook Chapter 5, pp. 173-179,
 * Figures 5.5 and 5.7). A time slider, a tap on the chart, the step buttons or Play move a cursor through the
 * night; the panel below shows the stage at the cursor, its EEG waves (drawn as a simplified illustration) and
 * what happens in it, and the summary shows that N3 comes mostly early and REM periods grow longer toward morning.
 * 组件“sleep-cycle”：一个典型年轻成年人一夜的睡眠图（教材第 5 章第 173-179 页，图 5.5 与图 5.7）。时间滑块、点按图表、
 * 上一段/下一段按钮或“播放”都能移动光标；下方面板显示光标处的睡眠阶段、它的脑电波（简化示意）和这一期会发生什么；
 * 汇总部分说明 N3 主要在前半夜、REM 期越到早上越长。
 *
 * Config: { title: Bi, preset: "typical-night" }. Every number, sentence and chart position comes from
 * sleep-cycle-logic.js; this module only builds and updates the DOM.
 * 所有数字、句子和图上位置都来自 sleep-cycle-logic.js；本模块只负责构建和更新 DOM。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, uiText, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import {
  CHART, LEGEND, NIGHT_EXAM_SENTENCES, SHARE_ROWS, STAGE_KEY, STAGE_ORDER, TRACE_BOX, TRACE_LABELS, UI_TEXT, WAVES,
  announcement, chartDescription, chartLayout, clampMinute, cycleBands, cycleText, formatClock, formatLength,
  hourTicks, hypnogramPath, nextRemStart, nightLength, nightSegments, nightSummary, normalizeSleepCycleConfig,
  segmentIndexAt, sliderValueText, stageAt, stageBoxes, stageInfo, stepStretch, stretchNotes, stretchText,
  summaryBars, summaryTexts, tracePath,
} from './sleep-cycle-logic.js';

let mountCount = 0;

// Play moves the cursor one stretch at a time, without animation; with reduced motion it pauses longer on each.
// “播放”一次把光标移到下一段，没有动画；用户偏好减少动态效果时，每一段停留更久。
const PLAY_DELAY = Object.freeze({ normal: 1600, reduced: 2600 });

/**
 * One line with both languages, Chinese first, for button names and announcements. Every string the view shows
 * comes from the logic module (UI_TEXT and its text builders), where the tests check it.
 * 中文在前的双语单行文字，用于按钮名称和播报。视图显示的每一段文字都来自逻辑模块（UI_TEXT 与各个文字函数），测试会在那里逐一检查。
 */
function spoken(value) {
  return `${value.zh} ${value.en}`;
}

/* ---------- Small builders 小型构件 ---------- */

/** Short UI label: Chinese first, English after. 简短界面文字：中文在前、英文在后。 */
function label(value, role = 'label') {
  return [zhNode(value.zh, role), ' ', enNode(value.en)];
}

/** Chinese teaching sentence with its English version on the next line. 中文讲解句，下一行是对应的英文。 */
function pair(value, className, tag = 'p') {
  return h(tag, { class: ['sleep-cycle__pair', className] },
    zhNode(value.zh, 'teach', 'span', 'sleep-cycle__zh'),
    enNode(value.en, 'span', 'sleep-cycle__en'));
}

/** An English sentence to write on a test, with its Chinese meaning below. 考试时要写的英文句子，下面是中文意思。 */
function examSentence(value) {
  return h('p', { class: 'sleep-cycle__exam-sentence' },
    enNode(value.en, 'span', 'sleep-cycle__exam-en'),
    zhNode(value.zh, 'gloss', 'span', 'sleep-cycle__exam-zh'));
}

function examBlock(sentences) {
  return h('div', { class: 'sleep-cycle__exam' },
    h('p', { class: 'sleep-cycle__exam-title' }, label(UI_TEXT.exam)),
    sentences.map(examSentence));
}

function heading(value, id, tag = 'h4') {
  return h(tag, { class: 'sleep-cycle__heading', id }, label(value));
}

function sourceLine(source) {
  return h('p', { class: 'sleep-cycle__source' }, label(source));
}

function stageChip(stage, value) {
  return h('span', { class: ['sleep-cycle__chip', `sleep-cycle__chip--${stage.toLowerCase()}`] }, label(value));
}

/** The stage code alone ("N3", "REM"), the same in both languages. 只有阶段代号（“N3”“REM”），两种语言写法相同。 */
function codeChip(stage) {
  return h('span', { class: ['sleep-cycle__chip', 'sleep-cycle__chip--code', `sleep-cycle__chip--${stage.toLowerCase()}`], lang: 'en' }, stage);
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
      element.textContent = `${text}${toggle ? '\u00a0' : ''}`;
    },
  };
}

/**
 * Redraws after the width of `element` changes (frame-throttled); returns a function that stops observing.
 * 元素宽度变化后重画（按动画帧节流）；返回停止监听的函数。
 */
function observeWidth(element, onResize) {
  if (typeof ResizeObserver !== 'function') return () => {};
  let frame = 0;
  let width = Math.round(element.clientWidth);
  const observer = new ResizeObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const measured = Math.round(element.clientWidth);
      if (measured > 0 && measured !== width) {
        width = measured;
        onResize();
      }
    });
  });
  observer.observe(element);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
  };
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- EEG traces 示意脑电波形 ---------- */

const tracePaths = new Map();

function traceFigure(kind) {
  if (!tracePaths.has(kind)) tracePaths.set(kind, tracePath(kind));
  const path = tracePaths.get(kind);
  const middle = TRACE_BOX.height / 2;
  return h('figure', { class: 'sleep-cycle__trace' },
    s('svg', {
      class: 'sleep-cycle__trace-svg',
      viewBox: `0 0 ${TRACE_BOX.width} ${TRACE_BOX.height}`,
      'aria-hidden': 'true',
      focusable: 'false',
    },
    path.bursts.map((burst) => s('rect', {
      class: 'sleep-cycle__burst', x: burst.x, y: 0, width: burst.width, height: TRACE_BOX.height,
    })),
    s('line', { class: 'sleep-cycle__trace-axis', x1: 0, x2: TRACE_BOX.width, y1: middle, y2: middle }),
    s('path', { class: 'sleep-cycle__trace-line', d: path.d })),
    h('figcaption', { class: 'sleep-cycle__trace-caption' }, label(TRACE_LABELS[kind])));
}

/* ---------- Summary 汇总 ---------- */

// One bar: its name, the bar (hidden from screen readers) and the minutes; the unit is said once above the list
// and spelled out for screen readers in every row.
// 一根条：名称、条本身（读屏软件跳过）和分钟数；单位在列表上方写一次，读屏软件则每行都读出单位。
function barRow(name, minutes, largest, modifier) {
  const width = largest > 0 ? (100 * minutes) / largest : 0;
  const length = formatLength(minutes);
  return h('li', { class: 'sleep-cycle__bar' },
    h('span', { class: 'sleep-cycle__bar-name' }, name),
    h('span', { class: 'sleep-cycle__bar-track', 'aria-hidden': 'true' },
      h('span', { class: ['sleep-cycle__bar-fill', `sleep-cycle__bar-fill--${modifier}`], style: { width: `${width.toFixed(1)}%` } })),
    h('span', { class: 'sleep-cycle__bar-value' },
      h('span', { 'aria-hidden': 'true' }, String(minutes)),
      h('span', { class: 'visually-hidden' }, zhNode(length.zh, 'label'), ' ', enNode(length.en))));
}

function shareRow(rowLabel, parts) {
  return h('div', { class: 'sleep-cycle__share' },
    h('p', { class: 'sleep-cycle__share-name' }, label(rowLabel)),
    h('div', { class: 'sleep-cycle__stack', 'aria-hidden': 'true' },
      parts.map((part) => h('span', {
        class: ['sleep-cycle__stack-part', `sleep-cycle__stack-part--${part.id.toLowerCase()}`],
        style: { width: `${part.percent}%` },
      }, `${part.percent}%`))),
    h('p', { class: 'sleep-cycle__share-text' },
      parts.map((part, index) => [index ? ' · ' : null, label(part.label), ` ${part.percent}%`])));
}

function tile(text, visual, modifier) {
  return h('article', { class: ['sleep-cycle__tile', `sleep-cycle__tile--${modifier}`] },
    h('h5', { class: 'sleep-cycle__tile-title' }, biTitle(text.title)),
    visual,
    pair(text.text, 'sleep-cycle__tile-text'),
    pair(text.textbook, 'sleep-cycle__tile-book'));
}

function barList(bars, modifier) {
  const largest = Math.max(...bars.map((bar) => bar.minutes));
  return h('div', { class: 'sleep-cycle__bar-chart' },
    h('p', { class: 'sleep-cycle__bar-unit', 'aria-hidden': 'true' }, label(UI_TEXT.unit)),
    h('ul', { class: 'sleep-cycle__bars' }, bars.map((bar) => barRow(label(bar.label), bar.minutes, largest, modifier))));
}

function stageTable(summary) {
  const { totals } = summary;
  const percent = (value) => (value === null ? '—' : `${value.toFixed(1)}%`);
  const rows = ['W', 'N1', 'N2', 'N3', 'REM'].map((stage) => {
    const entry = totals.stages[stage];
    const info = stageInfo(stage);
    return h('tr', {},
      h('th', { scope: 'row' }, stageChip(stage, info.short)),
      h('td', { class: 'sleep-cycle__num' }, String(entry.minutes)),
      h('td', { class: 'sleep-cycle__num' }, percent(entry.percentOfNight)),
      h('td', { class: 'sleep-cycle__num' }, percent(entry.percentOfSleep)));
  });
  return h('div', { class: 'table-scroll' },
    h('table', { class: 'data-table sleep-cycle__table' },
      h('caption', { class: 'sleep-cycle__table-caption' }, label(UI_TEXT.table)),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, label(UI_TEXT.stage)),
        h('th', { scope: 'col' }, label(UI_TEXT.minutes)),
        h('th', { scope: 'col' }, label(UI_TEXT.ofNight)),
        h('th', { scope: 'col' }, label(UI_TEXT.ofSleep)))),
      h('tbody', {}, rows,
        h('tr', { class: 'sleep-cycle__row--light' },
          h('th', { scope: 'row' }, label(UI_TEXT.light)),
          h('td', { class: 'sleep-cycle__num' }, String(totals.light.minutes)),
          h('td', { class: 'sleep-cycle__num' }, percent((100 * totals.light.minutes) / totals.night)),
          h('td', { class: 'sleep-cycle__num' }, percent(totals.light.percentOfSleep))),
        h('tr', { class: 'sleep-cycle__row--total' },
          h('th', { scope: 'row' }, label(UI_TEXT.total)),
          h('td', { class: 'sleep-cycle__num' }, String(totals.night)),
          h('td', { class: 'sleep-cycle__num' }, '100.0%'),
          h('td', { class: 'sleep-cycle__num' }, '—')))));
}

function summaryPanel(segments, headingId) {
  const summary = nightSummary(segments);
  const texts = summaryTexts(summary);
  const bars = summaryBars(summary, segments);
  return h('section', { class: ['sleep-cycle__panel', 'sleep-cycle__summary'], 'aria-labelledby': headingId },
    heading(UI_TEXT.summary, headingId),
    h('div', { class: 'sleep-cycle__tiles' },
      tile(texts.cycles, barList(bars.cycles, 'cycle'), 'cycles'),
      tile(texts.n3, barList(bars.n3, 'n3'), 'n3'),
      tile(texts.rem, barList(bars.rem, 'rem'), 'rem'),
      tile(texts.shares, h('div', { class: 'sleep-cycle__shares' },
        shareRow(SHARE_ROWS.night, bars.shares.night),
        shareRow(SHARE_ROWS.textbook, bars.shares.textbook)), 'shares')),
    pair(texts.closing, 'sleep-cycle__closing'),
    stageTable(summary),
    examBlock(NIGHT_EXAM_SENTENCES),
    h('div', { class: 'sleep-cycle__pitfall' },
      icon('alert', { size: 16 }),
      pair(UI_TEXT.remPosition, 'sleep-cycle__pitfall-text')));
}

/* ---------- Mount 挂载 ---------- */

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./sleep-cycle.css', import.meta.url));
  mountCount += 1;
  const prefix = `sleep-cycle-${mountCount}`;
  const ids = {
    title: `${prefix}-title`,
    description: `${prefix}-description`,
    slider: `${prefix}-slider`,
    controls: `${prefix}-controls`,
    info: `${prefix}-info`,
    summary: `${prefix}-summary`,
  };
  const model = normalizeSleepCycleConfig(config);
  const segments = nightSegments(model.preset);
  const night = nightLength(segments);
  const lastIndex = segments.length - 1;

  // Every listener is registered with this signal, so the cleanup removes them all at once.
  // 所有事件监听都用这个 signal 注册，清理时一次全部移除。
  const controller = new AbortController();
  const on = (target, type, handler) => target.addEventListener(type, handler, { signal: controller.signal });
  const live = liveRegion();
  const state = { minute: 0, index: -1, playing: false, timer: 0, pointerId: null };
  let layout = null;
  let disposed = false;

  /* Header 标题区 */
  const header = h('header', { class: 'sleep-cycle__header' },
    h('p', { class: 'sleep-cycle__eyebrow' }, label(UI_TEXT.eyebrow)),
    h('h3', { class: 'sleep-cycle__title', id: ids.title }, biTitle(model.title)),
    pair(UI_TEXT.intro, 'sleep-cycle__intro'));
  const illustrationNote = h('div', { class: 'sleep-cycle__note' },
    icon('info', { size: 16 }),
    pair(UI_TEXT.illustration, 'sleep-cycle__note-text'));

  /* Chart 睡眠图 */
  const description = chartDescription(segments);
  const bandsLayer = s('g', { class: 'sleep-cycle__bands' });
  const currentBox = s('rect', { class: 'sleep-cycle__current' });
  const gridLayer = s('g', { class: 'sleep-cycle__grid' });
  const fillsLayer = s('g', { class: 'sleep-cycle__fills' });
  const linePath = s('path', { class: 'sleep-cycle__line' });
  const remLayer = s('g', { class: 'sleep-cycle__rem-lines' });
  const labelsLayer = s('g', { class: 'sleep-cycle__labels' });
  const cursorLine = s('line', { class: 'sleep-cycle__cursor-line' });
  const cursorDot = s('circle', { class: 'sleep-cycle__cursor-dot', r: 6 });
  const chartSvg = s('svg', {
    class: 'sleep-cycle__chart',
    role: 'img',
    'aria-labelledby': ids.description,
  }, bandsLayer, currentBox, gridLayer, fillsLayer, linePath, remLayer, labelsLayer, cursorLine, cursorDot);
  // The text alternative of the chart sits next to it, hidden from view, with its Chinese and English marked.
  // 图表的文字说明紧挨着图表，视觉上隐藏，中文和英文分别标明语言。
  const chartHost = h('div', { class: 'sleep-cycle__chart-host' },
    chartSvg,
    h('p', { class: 'visually-hidden', id: ids.description },
      zhNode(description.zh, 'label'), ' ', enNode(description.en)));
  const legend = h('ul', { class: 'sleep-cycle__legend' },
    LEGEND.map((item) => h('li', {},
      h('span', { class: ['sleep-cycle__swatch', `sleep-cycle__swatch--${item.id}`], 'aria-hidden': 'true' }),
      label(item.label))),
    h('li', {},
      h('span', { class: 'sleep-cycle__swatch sleep-cycle__swatch--cursor', 'aria-hidden': 'true' }),
      label(UI_TEXT.cursor)));
  const stageKey = h('div', { class: 'sleep-cycle__key' },
    h('p', { class: 'sleep-cycle__key-title' }, label(UI_TEXT.key)),
    h('ul', { class: 'sleep-cycle__key-list' },
      STAGE_KEY.map((item) => h('li', {},
        h('span', { class: 'sleep-cycle__key-code', lang: 'en' }, item.code), ' ', label(item.label)))));
  const figure = h('figure', { class: 'sleep-cycle__figure' },
    chartHost,
    h('figcaption', { class: 'sleep-cycle__caption' },
      legend,
      stageKey,
      pair(UI_TEXT.axes, 'sleep-cycle__axes')));

  /* Controls 控件 */
  const slider = h('input', {
    id: ids.slider,
    class: 'sleep-cycle__range',
    type: 'range',
    min: '0',
    max: String(night),
    step: '1',
    value: '0',
  });
  const readout = h('p', { class: 'sleep-cycle__readout' });
  const previousButton = button({ label: spoken(UI_TEXT.previous), iconName: 'arrowLeft', size: 'sm' });
  const nextButton = button({ label: spoken(UI_TEXT.next), iconName: 'arrowRight', size: 'sm' });
  const remButton = button({ label: spoken(UI_TEXT.nextRem), iconName: 'skipForward', size: 'sm' });
  const playButton = button({ label: spoken(UI_TEXT.play), iconName: 'play', size: 'sm', variant: 'primary' });
  const controls = h('section', { class: ['sleep-cycle__panel', 'sleep-cycle__controls'], 'aria-labelledby': ids.controls },
    h('h4', { class: 'visually-hidden', id: ids.controls }, label(UI_TEXT.controls)),
    h('div', { class: 'sleep-cycle__slider' },
      h('label', { class: 'sleep-cycle__slider-label', for: ids.slider }, label(UI_TEXT.slider)),
      slider,
      readout),
    h('div', { class: 'sleep-cycle__buttons' }, previousButton, nextButton, remButton, playButton));

  /* Stage panel 阶段面板 */
  const infoTitle = h('h4', { class: 'sleep-cycle__info-title', id: ids.info });
  const infoMeta = h('div', { class: 'sleep-cycle__meta' });
  const notesList = h('ul', { class: 'sleep-cycle__notes' });
  const wavesBox = h('div', { class: 'sleep-cycle__waves' });
  const factsList = h('ul', { class: 'sleep-cycle__facts' });
  const examBox = h('div', { class: 'sleep-cycle__info-exam' });
  const momentBlock = h('div', { class: 'sleep-cycle__moment' },
    h('h5', { class: 'sleep-cycle__subheading' }, label(UI_TEXT.moment)),
    notesList);
  const info = h('section', { class: ['sleep-cycle__panel', 'sleep-cycle__info'], 'aria-labelledby': ids.info },
    infoTitle,
    infoMeta,
    momentBlock,
    h('div', { class: 'sleep-cycle__wave-part' },
      h('h5', { class: 'sleep-cycle__subheading' }, label(UI_TEXT.waves)),
      wavesBox,
      pair(UI_TEXT.traceNote, 'sleep-cycle__trace-note')),
    h('div', { class: 'sleep-cycle__fact-part' },
      h('h5', { class: 'sleep-cycle__subheading' }, label(UI_TEXT.facts)),
      factsList),
    examBox);

  /* Drawing 绘制 */
  function measuredWidth() {
    const width = Math.round(chartHost.clientWidth);
    return width > 0 ? width : CHART.fallbackWidth;
  }

  function drawChart() {
    layout = chartLayout(measuredWidth(), segments);
    const { plot } = layout;
    const plotHeight = plot.bottom - plot.top;
    chartSvg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    replaceContent(bandsLayer, cycleBands(layout, segments).map((band) => s('rect', {
      class: ['sleep-cycle__band', band.number % 2 ? 'sleep-cycle__band--odd' : 'sleep-cycle__band--even'],
      x: band.x, y: plot.top, width: band.width, height: plotHeight,
    })));
    const ticks = hourTicks(layout, segments);
    replaceContent(gridLayer,
      STAGE_ORDER.map((stage) => s('line', {
        class: 'sleep-cycle__row-line', x1: plot.left, x2: plot.right, y1: layout.rowY(stage), y2: layout.rowY(stage),
      })),
      ticks.map((tick) => s('line', {
        class: 'sleep-cycle__hour-line', x1: tick.x, x2: tick.x, y1: plot.top, y2: plot.bottom + 4,
      })),
      s('rect', { class: 'sleep-cycle__frame', x: plot.left, y: plot.top, width: plot.right - plot.left, height: plotHeight }));
    replaceContent(fillsLayer,
      stageBoxes('N3', layout, segments).map((box) => s('rect', { class: 'sleep-cycle__fill sleep-cycle__fill--n3', ...boxAttributes(box) })),
      stageBoxes('REM', layout, segments).map((box) => s('rect', { class: 'sleep-cycle__fill sleep-cycle__fill--rem', ...boxAttributes(box) })));
    linePath.setAttribute('d', hypnogramPath(layout, segments));
    // REM and N3 stretches are drawn again as thick strokes, so "N3 early, REM late" stands out without colour alone.
    // REM 和 N3 的各段再用粗线描一遍，让“N3 在前、REM 在后”一眼可见，而不只靠颜色。
    const strokes = (stage, className) => stageBoxes(stage, layout, segments).map((box) => s('line', {
      class: className, x1: box.x, x2: (box.x + box.width).toFixed(1), y1: layout.rowY(stage), y2: layout.rowY(stage),
    }));
    replaceContent(remLayer, strokes('N3', 'sleep-cycle__n3-line'), strokes('REM', 'sleep-cycle__rem-line'));
    replaceContent(labelsLayer,
      STAGE_ORDER.map((stage) => s('text', {
        class: 'sleep-cycle__stage-label', x: plot.left - 8, y: layout.rowY(stage), 'text-anchor': 'end', 'dominant-baseline': 'central', lang: 'en',
      }, stage)),
      ticks.filter((tick) => tick.showLabel).map((tick) => s('text', {
        class: 'sleep-cycle__hour-label', x: tick.x, y: plot.bottom + 18, 'text-anchor': tick.hour === 0 ? 'start' : 'middle', lang: 'en',
      }, tick.label)),
      cycleBands(layout, segments).map((band) => s('text', {
        class: 'sleep-cycle__cycle-label', x: band.labelX, y: plot.top - 9, 'text-anchor': 'middle',
      }, String(band.number))));
    placeCursor();
  }

  function boxAttributes(box) {
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }

  function placeCursor() {
    if (!layout) return;
    const { plot } = layout;
    const x = layout.x(state.minute).toFixed(1);
    const stretch = stageAt(state.minute, segments);
    cursorLine.setAttribute('x1', x);
    cursorLine.setAttribute('x2', x);
    cursorLine.setAttribute('y1', String(plot.top - 2));
    cursorLine.setAttribute('y2', String(plot.bottom + 2));
    cursorDot.setAttribute('cx', x);
    cursorDot.setAttribute('cy', String(layout.rowY(stretch.stage)));
    const left = layout.x(stretch.start);
    currentBox.setAttribute('x', left.toFixed(1));
    currentBox.setAttribute('y', String(plot.top));
    currentBox.setAttribute('width', Math.max(1, layout.x(stretch.end) - left).toFixed(1));
    currentBox.setAttribute('height', String(plot.bottom - plot.top));
  }

  function renderReadout() {
    const clock = formatClock(state.minute);
    const stretch = stageAt(state.minute, segments);
    replaceContent(readout,
      h('span', { class: 'sleep-cycle__readout-time' }, label(clock)),
      stageChip(stretch.stage, stageInfo(stretch.stage).short));
  }

  function waveItem(id) {
    const wave = WAVES[id];
    return h('li', { class: 'sleep-cycle__wave' },
      h('p', { class: 'sleep-cycle__wave-name' }, biTitle(wave.name)),
      pair(wave.text, 'sleep-cycle__wave-text'),
      sourceLine(wave.source));
  }

  function renderInfo() {
    const stretch = stageAt(state.minute, segments);
    const stage = stageInfo(stretch.stage);
    replaceContent(infoTitle, codeChip(stretch.stage), ' ', biTitle(stage.name));
    replaceContent(infoMeta,
      h('p', { class: 'sleep-cycle__meta-line' },
        h('span', { class: 'sleep-cycle__meta-label' }, label(UI_TEXT.stretch)), ' ',
        label(stretchText(state.minute, segments))),
      h('p', { class: 'sleep-cycle__meta-line' }, label(cycleText(state.minute, segments))));
    const notes = stretchNotes(state.minute, segments);
    momentBlock.hidden = notes.length === 0;
    replaceContent(notesList, notes.map((note) => h('li', { class: 'sleep-cycle__note-item' }, pair(note))));
    replaceContent(wavesBox,
      h('div', { class: 'sleep-cycle__traces' }, stage.traces.map(traceFigure)),
      h('ul', { class: 'sleep-cycle__wave-list' }, stage.waves.map(waveItem)));
    replaceContent(factsList, stage.facts.map((fact) => h('li', { class: 'sleep-cycle__fact' },
      pair(fact),
      sourceLine(fact.source))));
    replaceContent(examBox, examBlock([stage.exam]));
  }

  /* State changes 状态变化 */
  function setMinute(minute) {
    const next = Math.round(clampMinute(minute, night));
    state.minute = next;
    slider.value = String(next);
    slider.setAttribute('aria-valuetext', sliderValueText(next, segments));
    renderReadout();
    placeCursor();
    const index = segmentIndexAt(next, segments);
    if (index !== state.index) {
      state.index = index;
      renderInfo();
    }
  }

  function setPlayButton() {
    replaceContent(playButton,
      icon(state.playing ? 'pause' : 'play'),
      h('span', { class: 'btn__label' }, uiText(spoken(state.playing ? UI_TEXT.pause : UI_TEXT.play))));
  }

  function stopPlaying(message) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = 0;
    if (!state.playing) return;
    state.playing = false;
    setPlayButton();
    if (message) live.announce(message);
  }

  function playStep() {
    state.timer = 0;
    if (!state.playing || disposed) return;
    const step = stepStretch(state.minute, 1, segments);
    if (step.moved) setMinute(step.minute);
    if (!step.moved || segmentIndexAt(state.minute, segments) === lastIndex) {
      stopPlaying(spoken(UI_TEXT.finished));
      return;
    }
    state.timer = setTimeout(playStep, prefersReducedMotion() ? PLAY_DELAY.reduced : PLAY_DELAY.normal);
  }

  function startPlaying() {
    if (state.playing) return;
    // From the last stretch, playing starts the night again. 在最后一段按播放，就从头再走一遍。
    if (segmentIndexAt(state.minute, segments) === lastIndex) setMinute(0);
    state.playing = true;
    setPlayButton();
    live.announce(spoken(UI_TEXT.playing));
    state.timer = setTimeout(playStep, prefersReducedMotion() ? PLAY_DELAY.reduced : PLAY_DELAY.normal);
  }

  // A move by a button or a tap stops Play and says where the cursor is now. 按钮或点按造成的移动会停止播放并播报光标的新位置。
  function moveTo(minute) {
    stopPlaying();
    setMinute(minute);
    live.announce(announcement(state.minute, segments));
  }

  function minuteFromPointer(event) {
    if (!layout) return null;
    const box = chartSvg.getBoundingClientRect();
    if (!(box.width > 0)) return null;
    return layout.minuteAt(((event.clientX - box.left) / box.width) * layout.width);
  }

  /* Events 事件 */
  on(slider, 'input', () => {
    stopPlaying();
    setMinute(Number(slider.value));
  });
  on(previousButton, 'click', () => {
    const step = stepStretch(state.minute, -1, segments);
    if (step.moved) moveTo(step.minute);
    else live.announce(spoken(UI_TEXT.first));
  });
  on(nextButton, 'click', () => {
    const step = stepStretch(state.minute, 1, segments);
    if (step.moved) moveTo(step.minute);
    else live.announce(spoken(UI_TEXT.last));
  });
  on(remButton, 'click', () => moveTo(nextRemStart(state.minute, segments).minute));
  on(playButton, 'click', () => {
    if (state.playing) stopPlaying(spoken(UI_TEXT.paused));
    else startPlaying();
  });
  on(chartSvg, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const minute = minuteFromPointer(event);
    if (minute === null) return;
    stopPlaying();
    state.pointerId = event.pointerId;
    try {
      chartSvg.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a convenience for dragging; a tap works without it. 捕获指针只是为了方便拖动，单击不需要它。
    }
    setMinute(minute);
  });
  on(chartSvg, 'pointermove', (event) => {
    if (state.pointerId !== event.pointerId) return;
    const minute = minuteFromPointer(event);
    if (minute !== null) setMinute(minute);
  });
  on(chartSvg, 'pointerup', (event) => {
    if (state.pointerId !== event.pointerId) return;
    state.pointerId = null;
    live.announce(announcement(state.minute, segments));
  });
  on(chartSvg, 'pointercancel', () => {
    state.pointerId = null;
  });
  on(chartSvg, 'lostpointercapture', () => {
    state.pointerId = null;
  });
  // Play pauses when the page is hidden, so the night does not run on unseen in a background tab.
  // 页面被隐藏时暂停播放，免得在后台标签页里没人看着也一直往后走。
  on(document, 'visibilitychange', () => {
    if (document.hidden) stopPlaying(spoken(UI_TEXT.paused));
  });

  const root = h('section', { class: 'sleep-cycle', 'aria-labelledby': ids.title },
    header,
    illustrationNote,
    figure,
    controls,
    info,
    summaryPanel(segments, ids.summary),
    live.element);

  container.replaceChildren(root);
  drawChart();
  setMinute(0);
  const stopObserving = observeWidth(chartHost, drawChart);

  return () => {
    disposed = true;
    stopPlaying();
    controller.abort();
    stopObserving();
  };
}
