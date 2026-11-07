/**
 * Widget "classical-conditioning": classical conditioning as the textbook teaches it (King & Urbszat, Chapter 6,
 * pp. 210-221).
 * - Storyboard: before / during / after conditioning (Figure 6.2) with the neutral stimulus, US, UR, CS and CR of the
 *   example, a toggle between the textbook's US and UR and the lecture's UCS and UCR, the exam answer and the key.
 * - Trial simulator: pair the CS with the US, present the CS alone, rest a day, reset, or run the Figure 6.3
 *   sequence; a simplified curve of CR strength shows the stages (acquisition, extinction, rest, spontaneous
 *   recovery) and a sentence under the chart names what just happened.
 * 组件“classical-conditioning”：按教材讲法演示经典条件反射（King & Urbszat 第 6 章第 210-221 页）。
 * - 三格图：条件反射建立前、建立中、建立后（图 6.2），标出例子里的中性刺激、US、UR、CS 和 CR；可以在教材的 US、UR 和讲课的
 *   UCS、UCR 之间切换；附考试答案和记号说明。
 * - 试次模拟器：CS 与 US 配对、只给 CS、休息一天、重置，或按图 6.3 的顺序走一遍；简化曲线显示 CR 强度和各阶段
 *   （习得、消退、休息、自发恢复），图下方的句子说明刚才发生了什么。
 *
 * Config: { title: Bi, example: "pavlov" | "little-albert" | "taste-aversion" | "custom", notation: "us" | "ucs",
 *           roles: { neutral: Bi, us: Bi, ur: Bi, cr: Bi } (read only for "custom") }
 * Every fact, number and sentence comes from classical-conditioning-logic.js; this module only builds and updates
 * the DOM. 所有事实、数字和句子都来自 classical-conditioning-logic.js；本模块只负责构建和更新 DOM。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, scriptText, uiText, zhNode } from '../../../core/text/bilingual.js';
import { button, setButtonLabel } from '../../../components/controls/button.js';
import {
  CONNECTORS, NOTATIONS, NOTATION_NOTE, NOTATION_OPTIONS, SIM_ACTIONS, UI_TEXT, actionLabel, announcementText,
  chartDescription, chartModel, demoSimulation, eventSentence, examAnswer, initialSimulation, isFull,
  normalizeClassicalConditioningConfig, phaseRuns, phaseText, simplifiedNote, simulate, statusText, storyboard,
  termKey,
} from './classical-conditioning-logic.js';

let mountCount = 0;

// Width used before the widget is on the page and can be measured. 组件挂到页面、能测量宽度之前使用的宽度。
const FALLBACK_WIDTH = 480;

// The demonstration and reset buttons sit after the three trial buttons. 演示与重置按钮排在三个试次按钮之后。
const EXTRA_ACTIONS = ['demo', 'reset'];
const ACTION_ICONS = { pair: 'plus', 'cs-alone': 'minus', rest: 'clock', demo: 'play', reset: 'refresh' };
const ACTION_VARIANTS = { pair: 'primary', 'cs-alone': 'secondary', rest: 'secondary', demo: 'secondary', reset: 'ghost' };

/* ---------- Small builders 小型构件 ---------- */

/**
 * Short UI label from a { zh, en } value: Chinese first (split by script, so Latin abbreviations are marked
 * lang="en"), English after. 由 { zh, en } 生成的简短界面文字：中文在前（按文字拆分，拉丁字母缩写标为 lang="en"），英文在后。
 */
function label(value, role = 'label') {
  if (!value) return null;
  return [scriptText(value.zh, { role }), ' ', enNode(value.en)];
}

/** Chinese teaching sentence with its English version on the next line. 中文讲解句，下一行是对应的英文。 */
function pair(value, className) {
  if (!value) return null;
  return h('p', { class: ['classical-conditioning__pair', className] },
    zhNode(value.zh, 'teach', 'span', 'classical-conditioning__zh'),
    enNode(value.en, 'span', 'classical-conditioning__en'));
}

/**
 * An English sentence to write on the test, with its Chinese meaning below (blurred in English practice mode).
 * 考试时要写的英文句子，下面是中文意思（英文练习模式下模糊）。
 */
function examSentence(value) {
  return h('p', { class: 'classical-conditioning__exam-sentence' },
    enNode(value.en, 'span', 'classical-conditioning__exam-en'),
    zhNode(value.zh, 'gloss', 'span', 'classical-conditioning__exam-zh'));
}

function abbreviation(text) {
  return text ? h('span', { class: 'classical-conditioning__abbr', lang: 'en' }, text) : null;
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
 * Redraws after the width of `element` changes (frame-throttled); returns a function that stops observing and
 * cancels a pending frame. 元素宽度变化后重画（按动画帧节流）；返回停止监听并取消待执行帧的函数。
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

function measuredWidth(element) {
  const width = Math.round(element.clientWidth);
  return width > 0 ? width : FALLBACK_WIDTH;
}

const px = (value) => value.toFixed(1);

/* ---------- Storyboard 三格图 ---------- */

/** One element: abbreviation, full name, and the example's own thing. 一个元素：缩写、全称，以及例子里的具体东西。 */
function chip(element) {
  return h('div', { class: ['classical-conditioning__chip', `classical-conditioning__chip--${element.family}`] },
    h('p', { class: 'classical-conditioning__chip-head' },
      abbreviation(element.abbr),
      h('span', { class: 'classical-conditioning__term' }, label(element.term))),
    element.item
      ? h('p', { class: 'classical-conditioning__item' }, biTitle(element.item, { className: 'classical-conditioning__item-name' }))
      : null);
}

/** The words on a plus sign or an arrow, so the flow does not rely on the symbol alone. 加号与箭头旁的文字，流程不只靠符号表达。 */
function connector(kind) {
  return h('p', { class: ['classical-conditioning__connector', `classical-conditioning__connector--${kind}`] },
    icon(kind === 'paired' ? 'plus' : 'arrowDown', { size: 16 }),
    h('span', { class: 'classical-conditioning__connector-text' }, label(CONNECTORS[kind])));
}

function flowRow(row) {
  const parts = [];
  row.stimuli.forEach((element, index) => {
    if (index) parts.push(connector('paired'));
    parts.push(chip(element));
  });
  parts.push(connector('produces'), chip(row.response));
  return h('div', { class: 'classical-conditioning__flow' }, parts);
}

function stageCard(stage, index, prefix) {
  const headingId = `${prefix}-stage-${stage.id}`;
  return h('li', { class: ['classical-conditioning__stage', `classical-conditioning__stage--${stage.id}`] },
    h('h5', { class: 'classical-conditioning__stage-title', id: headingId },
      h('span', { class: 'classical-conditioning__stage-number', 'aria-hidden': 'true' }, String(index + 1)),
      h('span', { class: 'classical-conditioning__stage-name' }, label(stage.title))),
    h('div', { class: 'classical-conditioning__flows' }, stage.rows.map(flowRow)),
    pair(stage.note, 'classical-conditioning__stage-note'));
}

function keyRow(item) {
  return h('div', { class: ['classical-conditioning__key-row', `classical-conditioning__key-row--${item.family}`] },
    h('dt', { class: 'classical-conditioning__key-term' }, abbreviation(item.abbr), ' ', label(item.term)),
    h('dd', { class: 'classical-conditioning__key-meaning' }, pair(item.meaning)));
}

/* ---------- Mount 挂载 ---------- */

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./classical-conditioning.css', import.meta.url));
  mountCount += 1;
  const prefix = `classical-conditioning-${mountCount}`;
  const ids = {
    title: `${prefix}-title`,
    notation: `${prefix}-notation`,
    storyboard: `${prefix}-storyboard`,
    simulator: `${prefix}-simulator`,
    controls: `${prefix}-controls`,
    stages: `${prefix}-stages`,
  };
  const model = normalizeClassicalConditioningConfig(config);
  let notation = model.notation;
  let sim = initialSimulation();
  // Every listener is registered with this signal, so the cleanup removes them all at once.
  // 所有事件监听都用这个 signal 注册，清理时一次全部移除。
  const controller = new AbortController();
  const { signal } = controller;
  const live = liveRegion();

  /* Notation toggle 记号切换 */
  const notationButtons = NOTATIONS.map((value) => {
    const option = button({
      label: label(NOTATION_OPTIONS[value].label),
      size: 'sm',
      pressed: value === notation,
      className: 'classical-conditioning__notation-option',
    });
    option.addEventListener('click', () => setNotation(value), { signal });
    return option;
  });
  const notationGroup = h('div', { class: 'classical-conditioning__notation', role: 'group', 'aria-labelledby': ids.notation },
    h('span', { class: 'classical-conditioning__notation-label', id: ids.notation }, label(UI_TEXT.notation)),
    h('span', { class: 'classical-conditioning__notation-options' }, notationButtons));

  const header = h('header', { class: 'classical-conditioning__header' },
    h('p', { class: 'classical-conditioning__eyebrow' }, label(UI_TEXT.eyebrow)),
    h('h3', { class: 'classical-conditioning__title', id: ids.title }, biTitle(model.title)),
    model.name ? h('p', { class: 'classical-conditioning__example' },
      h('span', { class: 'classical-conditioning__example-label' }, label(UI_TEXT.example)),
      biTitle(model.name, { className: 'classical-conditioning__example-name' }),
      model.source ? h('span', { class: 'classical-conditioning__source' }, label(model.source)) : null) : null,
    pair(UI_TEXT.intro, 'classical-conditioning__intro'),
    notationGroup,
    pair(NOTATION_NOTE, 'classical-conditioning__notation-note'));

  /* Storyboard 三格图 */
  const stagesList = h('ol', { class: 'classical-conditioning__stages', role: 'list' });
  const examTitle = h('p', { class: 'classical-conditioning__exam-title' });
  const examBody = h('div', { class: 'classical-conditioning__exam-body' });
  const keyList = h('dl', { class: 'classical-conditioning__key' });
  const storyboardPanel = h('section', { class: 'classical-conditioning__panel', 'aria-labelledby': ids.storyboard },
    h('h4', { class: 'classical-conditioning__heading', id: ids.storyboard }, label(UI_TEXT.storyboardHeading)),
    stagesList,
    model.note ? h('div', { class: 'classical-conditioning__note' },
      h('p', { class: 'classical-conditioning__note-label' }, icon('bulb', { size: 14 }), label(UI_TEXT.noteLabel)),
      pair(model.note)) : null,
    h('div', { class: 'classical-conditioning__exam' }, examTitle, examBody),
    // The key is folded away by default: on a phone it is as long as the storyboard itself.
    // 记号说明默认收起：在手机上它和三格图本身一样长。
    h('details', { class: 'classical-conditioning__key-block' },
      h('summary', { class: 'classical-conditioning__key-summary' },
        icon('chevronDown', { size: 16 }),
        h('span', { class: 'classical-conditioning__key-title' }, label(UI_TEXT.keyHeading))),
      keyList));

  /* Simulator 模拟器 */
  const actionButtons = {};
  for (const action of [...SIM_ACTIONS, ...EXTRA_ACTIONS]) {
    const element = button({
      label: label(actionLabel(action, notation)),
      iconName: ACTION_ICONS[action],
      variant: ACTION_VARIANTS[action],
      size: 'sm',
      className: `classical-conditioning__action classical-conditioning__action--${action}`,
    });
    element.addEventListener('click', () => dispatch(action), { signal });
    actionButtons[action] = element;
  }
  const statusLine = h('p', { class: 'classical-conditioning__status' });
  const chartSvg = s('svg', { class: 'classical-conditioning__chart', role: 'img', 'aria-label': '' });
  const chartHost = h('div', { class: 'classical-conditioning__chart-host' }, chartSvg);
  const sentenceBody = h('div', { class: 'classical-conditioning__happened-body' });
  const stageList = h('ol', { class: 'classical-conditioning__phases', role: 'list', 'aria-labelledby': ids.stages });
  const simulatorPanel = h('section', { class: 'classical-conditioning__panel', 'aria-labelledby': ids.simulator },
    h('h4', { class: 'classical-conditioning__heading', id: ids.simulator }, label(UI_TEXT.simulatorHeading)),
    h('p', { class: 'classical-conditioning__badge' }, icon('info', { size: 14 }), label(UI_TEXT.simplified)),
    pair(UI_TEXT.instructions, 'classical-conditioning__instructions'),
    h('div', { class: 'classical-conditioning__actions', role: 'group', 'aria-labelledby': ids.controls },
      h('span', { class: 'visually-hidden', id: ids.controls }, label(UI_TEXT.controls)),
      h('div', { class: 'classical-conditioning__action-row' }, SIM_ACTIONS.map((action) => actionButtons[action])),
      h('div', { class: 'classical-conditioning__action-row classical-conditioning__action-row--extra' },
        EXTRA_ACTIONS.map((action) => actionButtons[action]))),
    statusLine,
    h('figure', { class: 'classical-conditioning__figure' },
      chartHost,
      h('figcaption', { class: 'classical-conditioning__caption' }, pair(UI_TEXT.chartGuide))),
    h('div', { class: 'classical-conditioning__happened' },
      h('p', { class: 'classical-conditioning__happened-title' }, label(UI_TEXT.happened)),
      sentenceBody),
    h('div', { class: 'classical-conditioning__stage-block' },
      h('h5', { class: 'classical-conditioning__subheading', id: ids.stages }, label(UI_TEXT.stages)),
      stageList),
    model.caveat ? h('div', { class: 'classical-conditioning__caveat' }, icon('alert', { size: 16 }), pair(model.caveat)) : null,
    h('div', { class: 'classical-conditioning__rule' }, pair(simplifiedNote())));

  const root = h('section', { class: 'classical-conditioning', 'aria-labelledby': ids.title },
    header,
    storyboardPanel,
    simulatorPanel,
    live.element);

  /* Rendering 渲染 */

  function renderStoryboard() {
    replaceContent(stagesList, storyboard(model, notation).map((stage, index) => stageCard(stage, index, prefix)));
    const answer = examAnswer(model, notation);
    replaceContent(examTitle, label(answer.heading));
    replaceContent(examBody, examSentence(answer));
    replaceContent(keyList, termKey(notation).map(keyRow));
  }

  function renderStages() {
    const runs = phaseRuns(sim.steps);
    if (!runs.length) {
      replaceContent(stageList, h('li', { class: 'classical-conditioning__phase classical-conditioning__phase--empty' }, label(UI_TEXT.noTrials)));
      return;
    }
    replaceContent(stageList, runs.map((run, index) => {
      const text = phaseText(run, notation);
      const current = index === runs.length - 1;
      return h('li', {
        class: ['classical-conditioning__phase', current ? 'is-current' : null],
        'aria-current': current ? 'step' : null,
      },
      h('span', { class: ['classical-conditioning__phase-number', `classical-conditioning__phase-number--${text.phase}`] }, String(text.number)),
      h('span', { class: 'classical-conditioning__phase-body' },
        h('span', { class: 'classical-conditioning__phase-name' }, label(text.name)),
        h('span', { class: 'classical-conditioning__phase-detail' },
          h('span', { class: 'classical-conditioning__phase-part' }, label(text.what)),
          text.range ? h('span', { class: 'classical-conditioning__phase-part' }, label(text.range)) : null,
          h('span', { class: 'classical-conditioning__phase-part classical-conditioning__phase-change' }, uiText(text.change)),
          text.result ? h('span', { class: 'classical-conditioning__phase-part' }, label(text.result)) : null)));
    }));
  }

  function drawChart() {
    const chart = chartModel(sim, measuredWidth(chartHost));
    const { geometry } = chart;
    const { plot } = geometry;
    // Dots shrink with the slot width so neighbours do not merge on a phone. 点的大小随每步宽度缩小，手机上相邻的点不会糊在一起。
    const radius = Math.max(2, Math.min(4, geometry.slot * 0.38));
    chartSvg.setAttribute('viewBox', `0 0 ${geometry.width} ${geometry.height}`);
    chartSvg.setAttribute('aria-label', chartDescription(sim, notation));
    replaceContent(chartSvg,
      chart.bands.map((band) => s('rect', {
        class: ['classical-conditioning__band', `classical-conditioning__band--${band.phase}`],
        x: px(band.x),
        y: plot.top,
        width: px(band.width),
        height: plot.bottom - plot.top,
      })),
      chart.yTicks.map((tick) => [
        s('line', { class: 'classical-conditioning__grid', x1: plot.left, x2: plot.right, y1: px(tick.y), y2: px(tick.y) }),
        s('text', { class: 'classical-conditioning__tick', x: plot.left - 6, y: px(tick.y + 4), 'text-anchor': 'end' }, tick.text),
      ]),
      s('line', { class: 'classical-conditioning__axis', x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom }),
      s('line', { class: 'classical-conditioning__axis', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom }),
      chart.peak ? [
        s('line', { class: 'classical-conditioning__peak', x1: plot.left, x2: plot.right, y1: px(chart.peak.y), y2: px(chart.peak.y) }),
        s('text', { class: 'classical-conditioning__peak-label', x: plot.right - 2, y: px(chart.peak.labelY), 'text-anchor': 'end' },
          s('tspan', { class: 'zh zh-label', lang: 'zh-CN' }, UI_TEXT.peak.zh), ' ',
          s('tspan', { class: 'en', lang: 'en' }, UI_TEXT.peak.en), ` ${chart.peak.text}`),
      ] : null,
      chart.segments.map((segment) => s('line', {
        class: ['classical-conditioning__curve', segment.dashed ? 'classical-conditioning__curve--rest' : null],
        x1: px(segment.x1), y1: px(segment.y1), x2: px(segment.x2), y2: px(segment.y2),
      })),
      chart.points.map((point) => s('circle', {
        class: ['classical-conditioning__point', `classical-conditioning__point--${point.kind}`, point.latest ? 'is-latest' : null],
        cx: px(point.x),
        cy: px(point.y),
        r: px(point.latest ? radius + 2 : radius),
      })),
      chart.numbers.map((item) => s('text', {
        class: 'classical-conditioning__band-number', x: px(item.x), y: plot.top - 10, 'text-anchor': 'middle',
      }, String(item.number))),
      chart.xLabels.map((item) => s('text', {
        class: 'classical-conditioning__x-label', x: px(item.x), y: plot.bottom + 18, 'text-anchor': 'middle',
      }, item.text)));
  }

  function renderSimulator() {
    replaceContent(statusLine, label(statusText(sim)));
    // A full chart keeps its trial buttons focusable: pressing one explains why nothing is added.
    // 图满了以后试次按钮仍可聚焦：按下时会说明为什么没有新增一步。
    const full = isFull(sim);
    for (const action of SIM_ACTIONS) {
      if (full) actionButtons[action].setAttribute('aria-disabled', 'true');
      else actionButtons[action].removeAttribute('aria-disabled');
    }
    replaceContent(sentenceBody, pair(eventSentence(sim.event, model, notation), 'classical-conditioning__happened-text'));
    renderStages();
    drawChart();
  }

  function relabelActions() {
    for (const [action, element] of Object.entries(actionButtons)) setButtonLabel(element, label(actionLabel(action, notation)));
  }

  function setNotation(value) {
    notation = value;
    notationButtons.forEach((option, index) => option.setAttribute('aria-pressed', String(NOTATIONS[index] === notation)));
    renderStoryboard();
    relabelActions();
    renderSimulator();
    live.announce(announcementText(NOTATION_OPTIONS[notation].announce));
  }

  function dispatch(action) {
    sim = action === 'demo' ? demoSimulation() : simulate(sim, action);
    renderSimulator();
    live.announce(announcementText(eventSentence(sim.event, model, notation)));
  }

  container.replaceChildren(root);
  renderStoryboard();
  renderSimulator();
  const stopObserving = observeWidth(chartHost, drawChart);

  return () => {
    controller.abort();
    stopObserving();
  };
}
