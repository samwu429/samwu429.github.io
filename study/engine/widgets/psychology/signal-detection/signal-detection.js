/**
 * Widget "signal-detection": signal detection theory (textbook Chapter 4, p.126-129). A noise-only curve and a
 * signal + noise curve on an evidence axis, a criterion line the learner drags (or sets with a labelled slider),
 * the hit and false-alarm areas shaded, a sensitivity slider, liberal / neutral / conservative buttons, and the
 * four outcomes in a table laid out like textbook Figure 4.6 with live whole-percentage rates.
 * 组件“signal-detection”：信号检测论（教材第 4 章第 126-129 页）。证据轴上一条“只有噪音”曲线和一条“信号 + 噪音”曲线，
 * 学习者可以拖动（或用带标签的滑块设置）判断标准竖线，击中和虚报区域带阴影；还有灵敏度滑块、宽松 / 中立 / 严格按钮，
 * 以及按教材图 4.6 排列、实时显示整数百分比的四种结果表。
 *
 * Config: { title: Bi, scenario: Bi, signal: Bi, sensitivity: 1.5, criterion: 0.75 } (content-spec 5.5).
 * Every number, position and sentence comes from signal-detection-logic.js; this module only builds and updates
 * the DOM. 所有数字、位置和句子都来自 signal-detection-logic.js；本模块只负责构建和更新 DOM。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import {
  CRITERION_LIMITS, OUTCOME_IDS, PLOT, PRESET_IDS, SENSITIVITY_LIMITS, TEXT, activePreset, announcement, criterionAt,
  criterionValueLabel, criterionValueText, curvePath, figureDescription, formatCriterion, formatSensitivity,
  initialState, normalizeSignalDetectionConfig, outcomePercents, outcomeRates, outcomeTable, plotLayout, plotScale,
  presetAnnouncement, resetAnnouncement, resultSentence, sensitivityLabel, sensitivityValueText, stanceSentence,
  tailAreaPath, withCriterion, withPreset, withSensitivity,
} from './signal-detection-logic.js';

let mountCount = 0;

// After the last slider step, wait this long before the live region speaks, so a held arrow key gives one
// announcement instead of dozens. 滑块最后一次变化后等这么久再播报，按住方向键时只播报一次，而不是几十次。
const ANNOUNCE_DELAY = 450;
// Half the width of the invisible strip around the criterion line that catches the pointer (pixels).
// 判断标准竖线两侧接住指针的透明区域的半宽（像素）。
const LINE_GRAB = 18;

/* ---------- Small builders 小型构件 ---------- */

/** Short UI label: Chinese first, English after. 简短界面文字：中文在前、英文在后。 */
function label(text, role = 'label') {
  return [zhNode(text.zh, role), ' ', enNode(text.en)];
}

/** Chinese teaching sentence with its English version on the next line. 中文讲解句，下一行是对应的英文。 */
function pairNodes(text, role = 'teach') {
  return [zhNode(text.zh, role, 'span', 'signal-detection__zh'), enNode(text.en, 'span', 'signal-detection__en')];
}

function pair(text, className) {
  return h('p', { class: ['signal-detection__pair', className] }, pairNodes(text));
}

function heading(text, id) {
  return h('h4', { class: 'signal-detection__heading', id }, label(text));
}

/**
 * An English sentence to write on the test, with its Chinese meaning below (blurred in English practice mode).
 * 考试时要写的英文句子，下面是中文意思（英文练习模式下模糊）。
 */
function examSentence(item) {
  return h('p', { class: 'signal-detection__exam-sentence' },
    enNode(item.en, 'span', 'signal-detection__exam-en'),
    zhNode(item.zh, 'gloss', 'span', 'signal-detection__exam-zh'));
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
      element.textContent = `${text}${toggle ? ' ' : ''}`;
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
    observer.disconnect();
  };
}

// The width to draw at; plotScale falls back to its own default before the widget can be measured.
// 绘图使用的宽度；组件还不能测量时，plotScale 使用自己的默认宽度。
function measuredWidth(element) {
  const width = Math.round(element.clientWidth);
  return width > 0 ? width : null;
}

/** A two-line SVG label: the Chinese line, then the English line. 两行的 SVG 标签：先中文一行，再英文一行。 */
function twoLineLabel(text, className) {
  const zh = s('tspan', { class: 'zh zh-label', lang: 'zh-CN' }, text.zh);
  const en = s('tspan', { class: 'en', lang: 'en' }, text.en);
  const element = s('text', { class: className }, zh, en);
  return {
    element,
    place({ x, anchor }, zhY, enY) {
      const left = x.toFixed(1);
      element.setAttribute('text-anchor', anchor);
      zh.setAttribute('x', left);
      zh.setAttribute('y', zhY);
      en.setAttribute('x', left);
      en.setAttribute('y', enY);
    },
  };
}

/* ---------- Mount 挂载 ---------- */

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./signal-detection.css', import.meta.url));
  mountCount += 1;
  const prefix = `signal-detection-${mountCount}`;
  const ids = {
    title: `${prefix}-title`,
    scenario: `${prefix}-scenario`,
    figure: `${prefix}-figure`,
    criterion: `${prefix}-criterion`,
    sensitivity: `${prefix}-sensitivity`,
    presets: `${prefix}-presets`,
    outcomes: `${prefix}-outcomes`,
    explain: `${prefix}-explain`,
    hatch: `${prefix}-hatch`,
  };
  const model = normalizeSignalDetectionConfig(config);
  let state = initialState(model);
  let scale = plotScale(null);

  // Every listener is registered with this signal, so the cleanup removes them all at once.
  // 所有事件监听都用这个 signal 注册，清理时一次全部移除。
  const controller = new AbortController();
  const on = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: controller.signal });
  const live = liveRegion();
  let announceTimer = 0;
  let disposed = false;

  function announceNow(text) {
    window.clearTimeout(announceTimer);
    announceTimer = 0;
    live.announce(text);
  }

  function announceLater() {
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      announceTimer = 0;
      if (!disposed) live.announce(announcement(state));
    }, ANNOUNCE_DELAY);
  }

  /* Header and scenario 标题与情境 */
  const header = h('header', { class: 'signal-detection__header' },
    h('p', { class: 'signal-detection__eyebrow' }, label(TEXT.eyebrow)),
    h('h3', { class: 'signal-detection__title', id: ids.title }, biTitle(model.title)),
    h('p', { class: 'signal-detection__badge' }, icon('info', { size: 14 }), label(TEXT.simplified)),
    pair(TEXT.intro, 'signal-detection__intro'));

  const scenarioPanel = h('section', { class: 'signal-detection__panel', 'aria-labelledby': ids.scenario },
    heading(TEXT.scenarioHeading, ids.scenario),
    pair(model.scenario, 'signal-detection__scenario'),
    h('p', { class: 'signal-detection__signal' },
      h('span', { class: 'signal-detection__signal-label' }, label(TEXT.signalLabel), ':'),
      h('span', { class: 'signal-detection__signal-name' }, label(model.signal))));

  /* Drawing 图形 */
  const background = s('rect', { class: 'signal-detection__bg', x: 0, y: 0 });
  const hitArea = s('path', { class: ['signal-detection__area', 'signal-detection__area--hit'] });
  const falseAlarmArea = s('path', {
    class: ['signal-detection__area', 'signal-detection__area--false-alarm'], fill: `url(#${ids.hatch})`,
  });
  const axisLine = s('line', { class: 'signal-detection__axis' });
  const noiseCurve = s('path', { class: ['signal-detection__curve', 'signal-detection__curve--noise'] });
  const signalCurve = s('path', { class: ['signal-detection__curve', 'signal-detection__curve--signal'] });
  const bracket = s('path', { class: 'signal-detection__bracket' });
  const bracketText = s('text', { class: 'signal-detection__bracket-label', 'text-anchor': 'middle', y: PLOT.bracketLabelY });
  const axisText = s('text', { class: 'signal-detection__axis-label', 'text-anchor': 'end', y: PLOT.axisLabelY },
    s('tspan', { class: 'zh zh-label', lang: 'zh-CN' }, TEXT.axis.zh), ' ',
    s('tspan', { class: 'en', lang: 'en' }, TEXT.axis.en), ' →');
  const noiseLabel = twoLineLabel(TEXT.noiseCurve, 'signal-detection__curve-label signal-detection__curve-label--noise');
  const signalLabel = twoLineLabel(TEXT.signalCurve, 'signal-detection__curve-label signal-detection__curve-label--signal');
  const lineGrab = s('rect', { class: 'signal-detection__criterion-hit', y: 0, width: 2 * LINE_GRAB, height: PLOT.axisY + 10 });
  const criterionLine = s('line', {
    class: 'signal-detection__criterion-line', y1: PLOT.handleY + PLOT.handleRadius, y2: PLOT.axisY + 6,
  });
  const handle = s('circle', { class: 'signal-detection__criterion-handle', cy: PLOT.handleY, r: PLOT.handleRadius });
  const grip = s('path', { class: 'signal-detection__criterion-grip' });
  const valueText = s('text', { class: 'signal-detection__criterion-value', 'text-anchor': 'middle', y: PLOT.valueY });
  const criterionGroup = s('g', { class: 'signal-detection__criterion' }, lineGrab, criterionLine, handle, grip, valueText);
  const svg = s('svg', { class: 'signal-detection__svg', role: 'img', 'aria-label': '' },
    s('defs', {},
      s('pattern', { id: ids.hatch, patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45)' },
        s('line', { class: 'signal-detection__hatch-line', x1: 1, y1: 0, x2: 1, y2: 6 }))),
    // The dashed noise curve is drawn over the solid signal curve, so both stay visible where they coincide (d′ = 0).
    // The curve labels come last: the line may pass under them, and their halo keeps every letter readable.
    // 虚线的噪音曲线画在实线的信号曲线上面，两条曲线重合时（d′ = 0）也都看得见。曲线标签最后画：竖线可以从下面经过，标签的描边保证每个字都看得清。
    background, hitArea, falseAlarmArea, axisLine, signalCurve, noiseCurve, bracket, bracketText, axisText,
    criterionGroup, noiseLabel.element, signalLabel.element);
  const plotHost = h('div', { class: 'signal-detection__plot' }, svg);

  const legendItem = (modifier, text) => h('li', { class: 'signal-detection__legend-item' },
    h('span', { class: ['signal-detection__swatch', `signal-detection__swatch--${modifier}`], 'aria-hidden': 'true' }),
    h('span', { class: 'signal-detection__legend-text' }, label(text)));
  const legend = h('ul', { class: 'signal-detection__legend' },
    legendItem('hit', TEXT.legend.hit),
    legendItem('false-alarm', TEXT.legend.falseAlarm),
    legendItem('criterion', TEXT.legend.criterion),
    legendItem('distance', TEXT.legend.distance));

  /* Controls 控件 */
  function rangeSlider({ id, text, hint, limits, onInput }) {
    const hintId = `${id}-hint`;
    const shown = h('span', { class: 'signal-detection__slider-value', 'aria-hidden': 'true' });
    const input = h('input', {
      id,
      class: 'signal-detection__range',
      type: 'range',
      min: String(limits.min),
      max: String(limits.max),
      step: String(limits.step),
      'aria-describedby': hintId,
    });
    on(input, 'input', () => onInput(input.value));
    // "change" comes when a drag of the thumb ends and after each key press. 拖动滑块结束时、每次按键后都会触发 change。
    on(input, 'change', announceLater);
    const element = h('div', { class: 'signal-detection__slider' },
      h('div', { class: 'signal-detection__slider-head' },
        h('label', { class: 'signal-detection__slider-label', for: id }, label(text)),
        shown),
      input,
      h('p', { class: 'signal-detection__hint', id: hintId }, pairNodes(hint)));
    return {
      element,
      set(value, valueText, display) {
        const text = String(value);
        if (input.value !== text) input.value = text;
        input.setAttribute('aria-valuetext', valueText);
        shown.textContent = display;
      },
    };
  }

  const criterionSlider = rangeSlider({
    id: ids.criterion,
    text: TEXT.criterionSlider,
    hint: TEXT.criterionHint,
    limits: CRITERION_LIMITS,
    onInput: (raw) => update(withCriterion(state, raw)),
  });
  const sensitivitySlider = rangeSlider({
    id: ids.sensitivity,
    text: TEXT.sensitivitySlider,
    hint: TEXT.sensitivityHint,
    limits: SENSITIVITY_LIMITS,
    onInput: (raw) => update(withSensitivity(state, raw)),
  });

  const presetButtons = PRESET_IDS.map((preset) => {
    const element = button({ label: label(TEXT.presets[preset]), size: 'sm', pressed: false, className: 'signal-detection__preset' });
    on(element, 'click', () => {
      update(withPreset(state, preset));
      announceNow(presetAnnouncement(state, preset));
    });
    return { preset, element };
  });
  const presets = h('div', { class: 'signal-detection__presets', role: 'group', 'aria-labelledby': ids.presets },
    h('span', { class: 'signal-detection__presets-label', id: ids.presets }, label(TEXT.presetsLabel)),
    h('span', { class: 'signal-detection__preset-buttons' }, presetButtons.map((item) => item.element)));

  const stanceName = h('span', { class: 'signal-detection__stance-name' });
  const stanceText = h('p', { class: 'signal-detection__pair' });
  const stance = h('div', { class: 'signal-detection__stance' },
    h('p', { class: 'signal-detection__stance-head' },
      h('span', { class: 'signal-detection__stance-label' }, label(TEXT.stanceLabel)), stanceName),
    stanceText);

  const zeroNote = h('p', { class: 'signal-detection__note signal-detection__note--zero', hidden: true },
    icon('alert', { size: 16 }), h('span', { class: 'signal-detection__note-text' }, pairNodes(TEXT.zeroSensitivity)));

  const resetButton = button({ label: label(TEXT.reset), iconName: 'refresh', variant: 'ghost', size: 'sm', className: 'signal-detection__reset' });
  on(resetButton, 'click', () => {
    update(initialState(model));
    announceNow(resetAnnouncement(state));
  });

  const figurePanel = h('section', { class: 'signal-detection__panel', 'aria-labelledby': ids.figure },
    heading(TEXT.figureHeading, ids.figure),
    h('figure', { class: 'signal-detection__figure' },
      plotHost,
      h('figcaption', { class: 'signal-detection__caption' }, pair(TEXT.caption))),
    legend,
    h('div', { class: 'signal-detection__controls', 'aria-label': `${TEXT.controlsHeading.zh} ${TEXT.controlsHeading.en}`, role: 'group' },
      criterionSlider.element,
      presets,
      stance,
      sensitivitySlider.element,
      zeroNote,
      h('div', { class: 'signal-detection__actions' }, resetButton)));

  /* Outcome table (textbook Figure 4.6) 结果表（教材图 4.6） */
  const percentNodes = {};
  const outcomeCell = (cell) => {
    const percent = h('span', { class: 'signal-detection__percent' }, `${cell.percent}%`);
    percentNodes[cell.id] = percent;
    const verdict = cell.correct ? TEXT.correct : TEXT.mistake;
    const swatch = cell.id === 'hit' || cell.id === 'falseAlarm'
      ? h('span', { class: ['signal-detection__swatch', `signal-detection__swatch--${cell.id === 'hit' ? 'hit' : 'false-alarm'}`], 'aria-hidden': 'true' })
      : null;
    return h('td', { class: ['signal-detection__cell', cell.correct ? 'signal-detection__cell--correct' : 'signal-detection__cell--mistake'] },
      h('span', { class: 'signal-detection__term' }, swatch, label(cell.term)),
      h('span', { class: 'signal-detection__verdict' }, icon(cell.correct ? 'check' : 'cross', { size: 14 }), label(verdict)),
      percent);
  };
  const table = outcomeTable(state);
  const summary = h('p', { class: ['signal-detection__pair', 'signal-detection__summary'] });
  const outcomesPanel = h('section', { class: 'signal-detection__panel', 'aria-labelledby': ids.outcomes },
    heading(TEXT.outcomesHeading, ids.outcomes),
    h('div', { class: 'table-scroll' },
      h('table', { class: ['data-table', 'signal-detection__table'] },
        h('caption', { class: 'visually-hidden' }, label(TEXT.tableCaption)),
        h('thead', {},
          h('tr', {},
            h('td', { class: 'signal-detection__corner', rowspan: 2 }),
            h('th', { scope: 'colgroup', colspan: 2, class: 'signal-detection__response' }, label(TEXT.observerResponse))),
          h('tr', {}, table.columns.map((column) => h('th', { scope: 'col', class: 'signal-detection__col-head' },
            zhNode(column.label.zh, 'label', 'span', 'signal-detection__col-zh'),
            enNode(column.label.en, 'span', 'signal-detection__col-en'))))),
        h('tbody', {}, table.rows.map((row) => h('tr', {},
          h('th', { scope: 'row', class: 'signal-detection__row-head' }, label(row.label)),
          row.cells.map(outcomeCell)))))),
    summary,
    pair(TEXT.rowsNote, 'signal-detection__rows-note'));

  /* Explanations 讲解 */
  const explainPanel = h('section', { class: 'signal-detection__panel', 'aria-labelledby': ids.explain },
    heading(TEXT.explainHeading, ids.explain),
    h('ul', { class: 'signal-detection__explain' }, TEXT.explain.map((item) => h('li', {}, pair(item)))),
    h('div', { class: 'signal-detection__exam' },
      h('p', { class: 'signal-detection__exam-title' }, label(TEXT.examTitle)),
      TEXT.exam.map(examSentence)),
    h('p', { class: 'signal-detection__note' },
      icon('info', { size: 16 }), h('span', { class: 'signal-detection__note-text' }, pairNodes(TEXT.beyondTextbook))));

  const root = h('section', { class: 'signal-detection', 'aria-labelledby': ids.title },
    header, scenarioPanel, figurePanel, outcomesPanel, explainPanel, live.element);

  /* Drawing updates 更新图形 */
  function draw() {
    scale = plotScale(measuredWidth(plotHost));
    const layout = plotLayout(scale, state);
    const x = layout.x.toFixed(1);
    svg.setAttribute('viewBox', `0 0 ${scale.width} ${scale.height}`);
    svg.setAttribute('aria-label', figureDescription(state));
    background.setAttribute('width', scale.width);
    background.setAttribute('height', scale.height);
    hitArea.setAttribute('d', tailAreaPath(state.sensitivity, state.criterion, scale));
    falseAlarmArea.setAttribute('d', tailAreaPath(0, state.criterion, scale));
    axisLine.setAttribute('x1', scale.left);
    axisLine.setAttribute('x2', scale.right);
    axisLine.setAttribute('y1', PLOT.axisY);
    axisLine.setAttribute('y2', PLOT.axisY);
    noiseCurve.setAttribute('d', curvePath(0, scale));
    signalCurve.setAttribute('d', curvePath(state.sensitivity, scale));
    const { x1, x2, labelX } = layout.bracket;
    const top = PLOT.bracketY - 6;
    bracket.setAttribute('d', `M${x1.toFixed(1)} ${top} V${PLOT.bracketY} H${x2.toFixed(1)} V${top}`);
    bracketText.setAttribute('x', labelX.toFixed(1));
    bracketText.textContent = sensitivityLabel(state);
    axisText.setAttribute('x', scale.right);
    noiseLabel.place(layout.labels.noise, layout.labels.zhY, layout.labels.enY);
    signalLabel.place(layout.labels.signal, layout.labels.zhY, layout.labels.enY);
    lineGrab.setAttribute('x', (layout.x - LINE_GRAB).toFixed(1));
    criterionLine.setAttribute('x1', x);
    criterionLine.setAttribute('x2', x);
    handle.setAttribute('cx', x);
    const y = PLOT.handleY;
    grip.setAttribute('d', `M${(layout.x - 2).toFixed(1)} ${y - 3.5} L${(layout.x - 5.5).toFixed(1)} ${y} L${(layout.x - 2).toFixed(1)} ${y + 3.5} `
      + `M${(layout.x + 2).toFixed(1)} ${y - 3.5} L${(layout.x + 5.5).toFixed(1)} ${y} L${(layout.x + 2).toFixed(1)} ${y + 3.5}`);
    valueText.setAttribute('x', layout.valueX.toFixed(1));
    valueText.textContent = criterionValueLabel(state);
  }

  let shownStance = '';
  function render() {
    criterionSlider.set(state.criterion, criterionValueText(state), formatCriterion(state.criterion));
    sensitivitySlider.set(state.sensitivity, sensitivityValueText(state), formatSensitivity(state.sensitivity));
    const preset = activePreset(state);
    presetButtons.forEach((item) => item.element.setAttribute('aria-pressed', String(item.preset === preset)));
    const sentence = stanceSentence(state);
    if (sentence.stance !== shownStance) {
      shownStance = sentence.stance;
      replaceContent(stanceName, label(sentence.name));
      replaceContent(stanceText, pairNodes(sentence));
    }
    const percents = outcomePercents(outcomeRates(state));
    OUTCOME_IDS.forEach((id) => {
      percentNodes[id].textContent = `${percents[id]}%`;
    });
    replaceContent(summary, pairNodes(resultSentence(percents), 'label'));
    zeroNote.hidden = state.sensitivity > 0;
    draw();
  }

  function update(next) {
    if (next.criterion === state.criterion && next.sensitivity === state.sensitivity) return;
    state = next;
    render();
  }

  /* Dragging the criterion line 拖动判断标准竖线 */
  let drag = null;
  let lastPointerType = '';
  let pendingCriterion = null;
  let dragFrame = 0;

  // The pointer's x in the drawing's own units, through the SVG transform. 通过 SVG 的变换矩阵得到指针在图形坐标中的 x。
  function pointerX(event) {
    const matrix = svg.getScreenCTM?.();
    if (!matrix || typeof DOMPoint !== 'function') return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()).x;
  }

  // Pointer moves are applied once per frame. 指针移动每帧只处理一次。
  function flushCriterion() {
    if (dragFrame) cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    if (pendingCriterion === null) return;
    const next = withCriterion(state, pendingCriterion);
    pendingCriterion = null;
    update(next);
  }

  function queueCriterion(value) {
    if (value === null) return;
    pendingCriterion = value;
    if (!dragFrame) dragFrame = requestAnimationFrame(flushCriterion);
  }

  on(svg, 'pointerdown', (event) => {
    lastPointerType = event.pointerType;
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const onLine = criterionGroup.contains(event.target);
    // A finger on the drawing away from the line is left to the browser: a swipe scrolls the page, and a tap
    // becomes the click handled below. 手指按在图上但不在竖线上时交给浏览器：滑动会滚动页面，轻点会变成下面处理的 click。
    if (!onLine && event.pointerType === 'touch') return;
    const x = pointerX(event);
    if (x === null) return;
    event.preventDefault();
    const target = onLine ? criterionGroup : svg;
    // Capture keeps the drag going outside the drawing; a pointer the browser no longer tracks cannot be captured,
    // and the drag then simply ends at the edge. 捕获让拖动在图外也能继续；浏览器已不再跟踪的指针无法捕获，此时拖动到边缘就结束。
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Nothing to do. 无需处理。
    }
    // Grabbing the line keeps the gap between pointer and line, so the line does not jump; a press elsewhere
    // brings the line to the pointer. 抓住竖线时保持指针与竖线的距离，竖线不会跳动；在别处按下时竖线移到指针处。
    drag = { pointerId: event.pointerId, target, start: state.criterion, offset: onLine ? x - scale.x(state.criterion) : 0 };
    root.classList.add('signal-detection--dragging');
    if (!onLine) queueCriterion(criterionAt(scale, x));
  });

  on(svg, 'pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const x = pointerX(event);
    if (x !== null) queueCriterion(criterionAt(scale, x - drag.offset));
  });

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { target, pointerId, start } = drag;
    drag = null;
    root.classList.remove('signal-detection--dragging');
    flushCriterion();
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
    if (state.criterion !== start) announceNow(announcement(state));
  }
  on(svg, 'pointerup', endDrag);
  on(svg, 'pointercancel', endDrag);
  on(svg, 'lostpointercapture', endDrag);

  // A tap away from the line moves the line there; mouse and pen presses were handled on pointerdown.
  // 在竖线以外轻点会把竖线移到那里；鼠标和触控笔在 pointerdown 时已经处理过。
  on(svg, 'click', (event) => {
    if (lastPointerType !== 'touch' || criterionGroup.contains(event.target)) return;
    const x = pointerX(event);
    if (x === null) return;
    const before = state.criterion;
    update(withCriterion(state, criterionAt(scale, x)));
    if (state.criterion !== before) announceNow(announcement(state));
  });

  // Older mobile browsers ignore touch-action on SVG children; this keeps the page still while the line is dragged.
  // 旧版移动浏览器会忽略 SVG 子元素上的 touch-action，这里保证拖动竖线时页面不跟着滚动。
  on(criterionGroup, 'touchstart', (event) => event.preventDefault(), { passive: false });

  container.replaceChildren(root);
  render();
  const stopObserving = observeWidth(plotHost, draw);

  return () => {
    disposed = true;
    controller.abort();
    stopObserving();
    if (dragFrame) cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    pendingCriterion = null;
    window.clearTimeout(announceTimer);
    announceTimer = 0;
    if (drag && drag.target.hasPointerCapture?.(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
    drag = null;
  };
}
