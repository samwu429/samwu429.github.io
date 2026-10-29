/**
 * Widget "scatter-correlation": a scatterplot whose points can be dragged, moved with the arrow keys, typed in,
 * added and removed, with the correlation r recomputed after every change (STA220 Module 5). Beside the plot it
 * shows r with its direction and strength in the course's words and the exam sentences; below it, the worked
 * steps and the z-score product table of r = Σ z_x z_y / (n − 1), the change-of-units demo and the facts about r.
 * Two buttons load the outlier demo and a curved pattern whose r is about 0.
 * 组件“scatter-correlation”：散点图上的点可以拖动、用方向键移动、直接输入坐标、添加和删除，每次改动后都重新计算相关系数 r
 * （STA220 第 5 单元）。图旁边用课程用语给出 r 的方向、强度和考试句子；下面是 r = Σ z_x z_y / (n − 1) 的解题步骤与
 * z 分数乘积表、换单位演示，以及关于 r 要记住的几点。两个按钮分别演示离群值，以及 r 约为 0 的弯曲图案。
 *
 * Config: { title: Bi, xLabel: Bi, yLabel: Bi, points: [[x, y], ...] } with 4-30 points; optional xName and yName
 * ({ zh, en }) name the variables inside the sentences, and optional form "curved" marks data whose scatterplot bends,
 * so the sentences describe a nonlinear relationship. See scatter-correlation-logic.js for every rule.
 * 配置：{ title, xLabel, yLabel, points: [[x, y], ...] }，4-30 个点；可选的 xName、yName 是句子里的变量名；可选的 form 为 "curved"
 * 时表示散点图是弯曲的，句子改为描述非线性关系。规则见 scatter-correlation-logic.js。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biStack, biTitle } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import {
  biLabel, biText, biValue, ensureSharedStyles, legendIcon, teachPair,
} from '../../machine-learning/shared/ml-ui.js';
import { createPlotFrame } from '../../machine-learning/shared/plot-frame.js';
import { MINUS, TIMES } from '../shared/stat-format.js';
import {
  MAX_POINTS, MIN_POINTS, STRENGTH_SCALE, UNIT_FACTORS, analyzeScatter, appendPoint, associationWords, changeMessage,
  correlationSteps, curvedPoints, describeAssociation, dragTarget, fitView, formatCoordinate, formatFactor, inputValue,
  normalizeFactor, normalizeScatterConfig, nudgePoint, outlierPosition, placeNewPoint, plotDescription, pointDescription,
  pointInsight, productSign, productTable, rText, removePoint, replacePoint, scaleExtent, scalePoint, strengthRows,
  unitComparison, unscaleX, viewContains,
} from './scatter-correlation-logic.js';

const INTRO = {
  zh: '拖动图上的点（或选中后用方向键移动），看相关系数（correlation coefficient）r 怎样跟着变。'
    + 'r 衡量两个定量变量之间线性关系的方向和强弱。',
  en: 'Correlation is a statistical measure that quantifies the direction and strength of a linear association between two quantitative variables (p.25).',
};

const KEYBOARD_HINT = {
  zh: '拖动一个点就能移动它。键盘：按 Tab 进入图，方向键移动这个点（按住 Shift 一次走一大格），'
    + 'Page Up / Page Down 换一个点，Enter 输入精确数值，Delete 删除这个点。',
  en: 'Drag a point to move it. Keyboard: Tab into the plot, the arrow keys move the point (hold Shift for a big step), '
    + 'Page Up / Page Down switch points, Enter types exact values, Delete removes the point.',
};

const QUADRANT_NOTE = {
  zh: '两条虚线是平均数 x̄ 和 ȳ，把图分成四块。右上、左下的点 z_x · z_y 为正（角上标 +），左上、右下的点为负（标 −）。'
    + '把所有乘积加起来再除以 n − 1，就是 r。',
  en: 'The dashed lines are the means x̄ and ȳ. Points above-right or below-left have a positive product z_x · z_y (+), '
    + 'points above-left or below-right a negative one (−). Add all the products and divide by n − 1 to get r.',
};

const SELECT_NOTE = {
  zh: '还没有选中点：点一下图上的点，或者点表格第一列的编号。',
  en: 'No point selected: tap a point in the plot or a number in the first column of the table.',
};

// Shown before the exam sentences, so the condition is read before a sentence is copied.
// 放在考试句子前面，先读到使用条件再抄句子。
const FORM_NOTE = {
  zh: '先看散点图的形状（form）：只有点大致排成一条直线时，才用 r 和下面的句子描述关系。',
  en: 'Check the form first: describe the relationship with r and these sentences only when the points roughly follow a straight line.',
};

const SUM_NOTE = {
  zh: 'Σ z_x 和 Σ z_y 总是 0（软件可能印出 −7.77e-16 这种极小的数，其实就是 0）。算 r 用的是乘积之和 Σ z_x z_y，并且除以 n − 1，不是 n。',
  en: 'Σ z_x and Σ z_y are always 0 (software may print a tiny number such as −7.77e-16). r uses the sum of the products Σ z_x z_y, divided by n − 1, not n.',
};

const UNITS_INTRO = {
  zh: '换单位（比如英寸换成厘米）不会改变散点图的形状（第 24 页）。把每个 x 乘以 k：图上的点和 r 都不动，只有 x 轴上的数字变了。',
  en: 'Changing the units does not change the shape of the scatterplot (p.24). Multiply every x by k: the points and r stay where they are; only the numbers on the x axis change.',
};

const MAX_NOTE = { zh: `已经有 ${MAX_POINTS} 个点（上限），不能再加了。`, en: `The plot already holds ${MAX_POINTS} points, the most it can show.` };
const MIN_NOTE = { zh: `只剩 ${MIN_POINTS} 个点，不能再删了。`, en: `Only ${MIN_POINTS} points are left, so none can be removed.` };

// Course statements about r, quoted in English (exam wording) with a Chinese explanation.
// 课件关于 r 的原话（英文，考试用语），配中文解释。
const FACTS = [
  {
    en: 'r is always between −1 and 1 (−1 ≤ r ≤ 1). The strength of the linear relationship increases as r moves away from 0.',
    zh: 'r 一定在 −1 和 1 之间；离 0 越远，线性关系越强。',
    source: 'M5 p.31',
  },
  { en: 'r has no unit of measurement.', zh: 'r 没有单位：换单位不会改变 r（试试“换单位”）。', source: 'M5 p.28' },
  {
    en: 'r is sensitive and it is affected by extreme outliers in the data.',
    zh: 'r 对离群值很敏感：一个极端的点就能让 r 变很多（试试“加一个离群值”）。',
    source: 'M5 p.28',
  },
  {
    en: 'A low correlation does not necessarily imply that x and y are unrelated, only that they are not strongly linearly related.',
    zh: 'r 只衡量线性关系：弯曲的图案关系再强，r 也可能接近 0（试试“弯曲图案”）。',
    source: 'M5 p.50',
  },
  {
    en: 'A high correlation does not necessarily imply that a causal relationship exists between x and y, only that a linear trend may exist.',
    zh: '相关不等于因果：r 很高，也不能说明 x 导致了 y。',
    source: 'M5 p.50',
  },
];

// Short descriptions of the unit factors in the select. 换单位下拉框里倍数的简短说明。
const FACTOR_NOTES = {
  1: '原来的单位 original units',
  2.54: '例如英寸换成厘米 e.g. inches to centimetres',
  60: '例如分钟换成秒 e.g. minutes to seconds',
};

// The r meter runs from −1 to 1 across a 320-unit box; the bands follow the M5 p.32 strength scale.
// r 刻度尺在 320 单位宽的框内从 −1 画到 1；色带按第 5 单元第 32 页的强度表划分。
const METER = Object.freeze({ left: 16, right: 304, axis: 22 });
const METER_BANDS = [
  [-1, -0.8, 'strong'], [-0.8, -0.5, 'moderate-to-strong'], [-0.5, -0.3, 'moderate'], [-0.3, 0.3, 'weak'],
  [0.3, 0.5, 'moderate'], [0.5, 0.8, 'moderate-to-strong'], [0.8, 1, 'strong'],
];
const METER_TICKS = [
  [-1, `${MINUS}1`], [-0.8, `${MINUS}0.8`], [-0.5, `${MINUS}0.5`], [-0.3, `${MINUS}0.3`], [0, '0'],
  [0.3, '0.3'], [0.5, '0.5'], [0.8, '0.8'], [1, '1'],
];
const meterX = (r) => METER.left + ((r + 1) / 2) * (METER.right - METER.left);

// A click on the plot right after a drag belongs to the drag, not to "tap empty space to deselect".
// 拖动刚结束时图上的点击属于这次拖动，不算“点空白处取消选择”。
const CLICK_AFTER_DRAG_MS = 300;

// Arrow-key moves are read out once the learner pauses (as the least-squares-line sliders are), in one sentence
// with the final position and the change of r over the whole run of presses, auto-repeat included.
// 方向键移动等学习者停下来才读出（与 least-squares-line 的滑块一样）：一句话说出最后的位置和这一连串按键（包括按住不放
// 的自动重复）让 r 变了多少。
const KEY_ANNOUNCE_DELAY = 450;

const ARROW_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']);

// Written as a code point so the character stays visible in the source. 用码位写出，源代码里看得见这个字符。
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

// Notation tokens such as s_x, z_y, S_xy and SS_xx; the letters after "_" are drawn as a subscript.
// s_x、z_y、S_xy、SS_xx 这类记号；“_”后面的字母画成下标。
const SUBSCRIPT = /([A-Za-z]+)_(xy|xx|yy|x|y)(?![A-Za-z])/g;

let mountCount = 0;

/** Text split around subscript tokens, or null when it has none. 按下标记号拆开的文本；没有记号时为 null。 */
function subscriptParts(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(SUBSCRIPT)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(match[1], h('sub', {}, match[2]));
    last = match.index + match[0].length;
  }
  if (!parts.length) return null;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** A formula in the course's notation, with real subscripts. 用课程记号写的公式，带真正的下标。 */
function formula(text, className) {
  const source = String(text ?? '');
  return h('span', { class: ['ml-math', className] }, subscriptParts(source) ?? source);
}

/**
 * Turns the notation tokens inside an already built bilingual node into subscripts, keeping its language
 * classes, so teaching sentences can say "z_x" and still show it like the slides.
 * 把已经建好的双语节点中的记号改成下标，同时保留语言类名，讲解句子里写“z_x”也能像课件一样显示。
 */
function withSubscripts(node) {
  if (!(node instanceof Node)) return node;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const text of texts) {
    const parts = subscriptParts(text.nodeValue);
    if (parts) text.replaceWith(...parts);
  }
  return node;
}

/** Short bilingual label (Chinese first) with subscripts. 带下标的简短双语标签（中文在前）。 */
function uiLabel(zh, en, role = 'label') {
  return biLabel(zh, en, role).map(withSubscripts);
}

/** Chinese teaching sentence and its English line, with subscripts. 带下标的中文讲解句与英文句。 */
function teach(zh, en, className) {
  return withSubscripts(teachPair(zh, en, className));
}

/** An English exam sentence with its Chinese gloss underneath. 英文考试句子，下面是中文释义。 */
function examLine(sentence, className = 'scatter-correlation__sentence') {
  return withSubscripts(biStack(sentence, { role: 'gloss', className }));
}

function svgText(text, x, y, anchor, kind) {
  return s('text', {
    class: `scatter-correlation__${kind}`, x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': anchor,
  }, text);
}

export async function mount(container, config, context) {
  await Promise.all([
    ensureStylesheet(new URL('./scatter-correlation.css', import.meta.url)),
    ensureSharedStyles(),
  ]);
  mountCount += 1;
  const uid = `scatter-correlation-${mountCount}`;
  const model = normalizeScatterConfig(config);
  const plainLabels = { xLabel: biText(model.xLabel), yLabel: biText(model.yLabel) };

  // Every listener is registered with this signal, so the cleanup removes them all at once.
  // 所有事件监听都带上这个 signal，清理时一次全部移除。
  const events = new AbortController();
  const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: events.signal });

  // Points stay in the config's units; `factor` multiplies x only for what is shown.
  // 数据点保持配置的单位；factor 只在显示时乘到 x 上。
  const state = {
    points: model.points.map((point) => ({ ...point })),
    factor: 1,
    view: fitView(model.points),
    selected: null,
    drag: null,
  };
  let analysis = analyzeScatter(state.points, state.factor);
  let frame = null;
  let stopObserving = () => {};
  let pendingFrame = 0;
  let dragEndedAt = -Infinity;
  let announceToggle = false;
  // The run of arrow-key moves not read out yet: { index, before, moved, timer }.
  // 还没有读出的一连串方向键移动：{ index, before, moved, timer }。
  let keyRun = null;
  const pointViews = [];
  const rowViews = [];

  /* ---------- Header 标题 ---------- */
  const titleId = `${uid}-title`;
  const header = h('header', { class: 'ml-panel scatter-correlation__header' },
    h('p', { class: 'ml-eyebrow' }, biLabel('互动演示', 'Interactive')),
    h('h3', { class: 'scatter-correlation__title', id: titleId }, biTitle(model.title)),
    teach(INTRO.zh, INTRO.en, 'scatter-correlation__intro'));

  /* ---------- Plot panel 散点图面板 ---------- */
  const plotHost = h('div', { class: 'scatter-correlation__plot' });
  const hintId = `${uid}-hint`;
  const keyboardHint = teach(KEYBOARD_HINT.zh, KEYBOARD_HINT.en, 'scatter-correlation__hint');
  keyboardHint.id = hintId;

  const legendDot = (sign, zh, en) => h('li', { class: 'ml-legend__item' },
    legendIcon(() => s('circle', { class: `scatter-correlation__dot scatter-correlation__dot--${sign}`, cx: 10, cy: 10, r: 5.5 })),
    h('span', {}, biLabel(zh, en)));
  const legend = h('ul', { class: 'ml-legend' },
    legendDot('positive', '乘积为正（右上、左下）', 'positive product'),
    legendDot('negative', '乘积为负（左上、右下）', 'negative product'),
    legendDot('zero', '乘积为 0（在平均线上）', 'product 0'),
    h('li', { class: 'ml-legend__item' },
      legendIcon(() => s('line', { class: 'scatter-correlation__mean', x1: 1, y1: 10, x2: 19, y2: 10 })),
      h('span', {}, biLabel('虚线：平均数 x̄、ȳ', 'dashed: the means x̄, ȳ'))));

  const actionButton = (zh, en, iconName, handler, variant = 'secondary') => {
    const element = button({ label: biLabel(zh, en), iconName, variant, size: 'sm' });
    listen(element, 'click', handler);
    return element;
  };
  const addButton = actionButton('添加一个点', 'Add a point', 'plus', addPoint);
  const outlierButton = actionButton('加一个离群值', 'Add an outlier', 'target', addOutlier);
  const curveButton = actionButton('弯曲图案', 'Curved pattern', 'eye', loadCurve);
  const resetButton = actionButton('复位', 'Reset', 'refresh', reset, 'ghost');
  const maxNote = h('p', { class: 'scatter-correlation__note', hidden: true }, biLabel(MAX_NOTE.zh, MAX_NOTE.en, 'teach'));
  const status = h('p', {
    class: 'ml-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
  });

  const plotPanel = h('section', { class: 'ml-panel scatter-correlation__figure', 'aria-label': '散点图 Scatterplot' },
    plotHost,
    legend,
    teach(QUADRANT_NOTE.zh, QUADRANT_NOTE.en, 'scatter-correlation__hint'),
    keyboardHint,
    h('div', { class: 'scatter-correlation__actions' }, addButton, outlierButton, curveButton, resetButton),
    maxNote,
    status);

  /* ---------- Selected point 选中的点 ---------- */
  const pointTitleId = `${uid}-point-title`;
  const pointHeading = h('p', { class: 'scatter-correlation__point-heading' });
  const xInputId = `${uid}-x`;
  const yInputId = `${uid}-y`;
  const numberInput = (id) => h('input', {
    id, class: 'input scatter-correlation__input', type: 'number', step: 'any', inputmode: 'decimal', autocomplete: 'off',
  });
  const xInput = numberInput(xInputId);
  const yInput = numberInput(yInputId);
  const xFactorTag = h('span', { class: 'scatter-correlation__factor' });
  const field = (id, letter, axisLabel, input, extra) => h('div', { class: 'field scatter-correlation__field' },
    h('label', { class: 'field__label', for: id },
      h('span', { class: 'ml-math' }, letter), extra,
      h('span', { class: 'scatter-correlation__field-hint' }, biValue(axisLabel))),
    input);
  const removeButton = actionButton('删除这个点', 'Remove this point', 'trash', () => removeAt(state.selected));
  const minNote = h('p', { class: 'scatter-correlation__note', hidden: true }, biLabel(MIN_NOTE.zh, MIN_NOTE.en, 'teach'));
  const insightValues = h('p', { class: 'scatter-correlation__formula' });
  const insightText = h('div', { class: 'scatter-correlation__insight' });
  const editor = h('div', { class: 'scatter-correlation__editor' },
    pointHeading,
    h('div', { class: 'scatter-correlation__fields' },
      field(xInputId, 'x', model.xLabel, xInput, xFactorTag),
      field(yInputId, 'y', model.yLabel, yInput, null)),
    h('div', { class: 'scatter-correlation__editor-actions' }, removeButton),
    minNote,
    insightValues,
    insightText);
  const emptyNote = teach(SELECT_NOTE.zh, SELECT_NOTE.en, 'scatter-correlation__empty');
  const pointPanel = h('section', { class: 'ml-panel scatter-correlation__point-panel', 'aria-labelledby': pointTitleId },
    h('h4', { class: 'ml-eyebrow scatter-correlation__panel-title', id: pointTitleId }, biLabel('选中的点', 'Selected point')),
    emptyNote,
    editor);
  listen(xInput, 'change', () => commitInput('x'));
  listen(yInput, 'change', () => commitInput('y'));

  /* ---------- r and its meaning r 及其含义 ---------- */
  const resultTitleId = `${uid}-result-title`;
  const rValue = h('p', { class: 'scatter-correlation__r' });
  const badges = h('p', { class: 'scatter-correlation__badges' });
  // A triangle above the band pointing at r, with a line through the band. 色带上方指向 r 的三角形，以及穿过色带的竖线。
  const meterMarker = s('g', { class: 'scatter-correlation__meter-marker' },
    s('path', { d: `M0 ${METER.axis - 6} L-6 ${METER.axis - 17} L6 ${METER.axis - 17} Z` }),
    s('line', { x1: 0, x2: 0, y1: METER.axis - 6, y2: METER.axis + 7 }));
  const meter = s('svg', {
    class: 'scatter-correlation__meter', viewBox: '0 0 320 48', 'aria-hidden': 'true', focusable: 'false',
  },
  METER_BANDS.map(([from, to, level]) => s('rect', {
    class: `scatter-correlation__band scatter-correlation__band--${level}`,
    x: meterX(from), y: METER.axis - 5, width: meterX(to) - meterX(from), height: 10,
  })),
  s('line', { class: 'scatter-correlation__meter-axis', x1: METER.left, x2: METER.right, y1: METER.axis, y2: METER.axis }),
  METER_TICKS.map(([value, text]) => [
    s('line', { class: 'scatter-correlation__meter-tick', x1: meterX(value), x2: meterX(value), y1: METER.axis - 5, y2: METER.axis + 7 }),
    s('text', { class: 'scatter-correlation__meter-label', x: meterX(value), y: METER.axis + 20, 'text-anchor': 'middle' }, text),
  ]),
  meterMarker);

  const scaleViews = STRENGTH_SCALE.map((item) => {
    const now = h('span', { class: 'scatter-correlation__now', hidden: true }, biLabel('现在', 'now'));
    const row = h('tr', {},
      h('th', { scope: 'row' }, h('span', { class: 'scatter-correlation__level' }, biLabel(item.label.zh, item.label.en)), now),
      h('td', { class: 'scatter-correlation__rule' }, item.rule));
    return { row, now };
  });
  const scaleTable = h('div', { class: 'table-scroll' },
    h('table', { class: 'data-table scatter-correlation__scale' },
      h('caption', { class: 'visually-hidden' }, biLabel('相关强度的标准（第 32 页）', 'Strength of association (p.32)')),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, biLabel('强度', 'Strength')),
        h('th', { scope: 'col' }, biLabel('规则', 'Rule')))),
      h('tbody', {}, scaleViews.map((view) => view.row))));
  const summaryBox = h('div', { class: 'scatter-correlation__summary' });
  const examTitle = h('p', { class: 'ml-eyebrow scatter-correlation__exam-title' }, biLabel('考试这样写', 'Write it like this on the test'));
  const formNote = teach(FORM_NOTE.zh, FORM_NOTE.en, 'scatter-correlation__caution');
  const sentenceList = h('div', { class: 'scatter-correlation__sentences' });
  const resultPanel = h('section', { class: 'ml-panel scatter-correlation__result', 'aria-labelledby': resultTitleId },
    h('h4', { class: 'ml-eyebrow scatter-correlation__panel-title', id: resultTitleId }, biLabel('相关系数 r', 'Correlation coefficient r')),
    rValue,
    badges,
    meter,
    scaleTable,
    summaryBox,
    examTitle,
    formNote,
    sentenceList);

  /* ---------- Worked steps and table 解题步骤与表格 ---------- */
  const stepsTitleId = `${uid}-steps-title`;
  const stepList = h('ol', { class: 'scatter-correlation__steps' });
  const headCell = (symbol, zh, en) => h('th', { scope: 'col' },
    h('span', { class: 'scatter-correlation__th-symbol' }, formula(symbol)),
    h('span', { class: 'scatter-correlation__th-name' }, biLabel(zh, en)));
  const numberCell = () => h('td', { class: 'scatter-correlation__num' });
  const tableBody = h('tbody');
  const sumCells = { zx: numberCell(), zy: numberCell(), product: numberCell() };
  const rCell = numberCell();
  const table = h('table', { class: 'data-table scatter-correlation__table' },
    h('caption', { class: 'visually-hidden' }, biLabel('每个点的 z 分数与乘积', 'z-scores and their products for every point')),
    h('thead', {}, h('tr', {},
      headCell('i', '点', 'point'),
      headCell('x', '解释变量', 'explanatory'),
      headCell('y', '响应变量', 'response'),
      headCell('z_x', 'x 的 z 分数', 'z-score of x'),
      headCell('z_y', 'y 的 z 分数', 'z-score of y'),
      headCell('z_x · z_y', '乘积', 'product'))),
    tableBody,
    h('tfoot', {},
      h('tr', {}, h('th', { scope: 'row', colspan: 3 }, 'Σ'), sumCells.zx, sumCells.zy, sumCells.product),
      h('tr', {}, h('th', { scope: 'row', colspan: 5 }, formula('r = Σ z_x z_y / (n − 1)')), rCell)));
  const stepsPanel = h('section', { class: 'ml-panel scatter-correlation__work', 'aria-labelledby': stepsTitleId },
    h('h4', { class: 'ml-eyebrow scatter-correlation__panel-title', id: stepsTitleId },
      biLabel('r 是怎么算出来的（第 42-43 页）', 'How r is computed (p.42-43)')),
    stepList,
    h('div', { class: 'table-scroll' }, table),
    teach(SUM_NOTE.zh, SUM_NOTE.en, 'scatter-correlation__note'));

  /* ---------- Change of units 换单位 ---------- */
  const unitsTitleId = `${uid}-units-title`;
  const unitSelectId = `${uid}-units`;
  const unitSelect = h('select', { id: unitSelectId, class: 'select' },
    UNIT_FACTORS.map((factor) => h('option', { value: String(factor) },
      [`${TIMES} ${formatFactor(factor)}`, FACTOR_NOTES[factor]].filter(Boolean).join('：'))));
  listen(unitSelect, 'change', () => setFactor(normalizeFactor(unitSelect.value)));
  const unitFactorHead = h('th', { scope: 'col' });
  const unitBody = h('tbody');
  const unitTableWrap = h('div', { class: 'table-scroll' },
    h('table', { class: 'data-table scatter-correlation__units-table' },
      h('caption', { class: 'visually-hidden' }, biLabel('换单位前后的对比', 'Before and after the change of units')),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, biLabel('量', 'Quantity')),
        h('th', { scope: 'col' }, biLabel('原来', 'Original')),
        unitFactorHead,
        h('th', { scope: 'col' }, biLabel('变了吗', 'Changed?')))),
      unitBody));
  const unitText = h('div', { class: 'scatter-correlation__unit-text' });
  const unitsPanel = h('section', { class: 'ml-panel scatter-correlation__units', 'aria-labelledby': unitsTitleId },
    h('h4', { class: 'ml-eyebrow scatter-correlation__panel-title', id: unitsTitleId },
      biLabel('换单位（第 24、27 页）', 'Change of units (p.24, p.27)')),
    teach(UNITS_INTRO.zh, UNITS_INTRO.en, 'scatter-correlation__lead'),
    h('div', { class: 'field scatter-correlation__field' },
      h('label', { class: 'field__label', for: unitSelectId }, biLabel('把每个 x 乘以 k', 'Multiply every x by k')),
      unitSelect),
    unitTableWrap,
    unitText);

  /* ---------- Facts about r 关于 r ---------- */
  const factsTitleId = `${uid}-facts-title`;
  const factsPanel = h('section', { class: 'ml-panel scatter-correlation__facts', 'aria-labelledby': factsTitleId },
    h('h4', { class: 'ml-eyebrow scatter-correlation__panel-title', id: factsTitleId }, biLabel('关于 r 要记住的', 'Remember about r')),
    h('ul', { class: 'scatter-correlation__fact-list' }, FACTS.map((fact) => h('li', { class: 'scatter-correlation__fact' },
      examLine(fact, 'scatter-correlation__fact-text'),
      h('span', { class: 'scatter-correlation__source' }, fact.source)))));

  const root = h('section', { class: 'scatter-correlation', 'aria-labelledby': titleId },
    header,
    h('div', { class: 'scatter-correlation__body' },
      h('div', { class: 'scatter-correlation__column' }, plotPanel, pointPanel),
      h('div', { class: 'scatter-correlation__column' }, resultPanel)),
    stepsPanel,
    h('div', { class: 'scatter-correlation__pair' }, unitsPanel, factsPanel));

  /* ---------- Plot frame and points 坐标框与数据点 ---------- */

  // The frame's extents are fixed when it is made, so a new view or unit factor builds a new frame; the point
  // nodes move over, keeping their listeners.
  // 坐标框创建后范围固定，所以换绘图窗口或换单位时重建坐标框；数据点节点连同监听一起搬过去。
  function buildFrame() {
    stopObserving();
    const next = createPlotFrame({
      xExtent: scaleExtent(state.view.x, state.factor),
      yExtent: state.view.y,
      role: 'group',
      label: '',
      aspect: 0.75,
      xTitle: [
        biValue(model.xLabel),
        state.factor === 1 ? null : h('span', { class: 'scatter-correlation__factor' }, `${TIMES} ${formatFactor(state.factor)}`),
      ],
      yTitle: biValue(model.yLabel),
    });
    next.layers.points.append(...pointViews.map((view) => view.node));
    listen(next.svg, 'click', onBackgroundClick);
    if (frame) frame.element.replaceWith(next.element);
    else plotHost.append(next.element);
    frame = next;
    stopObserving = frame.observe(drawPlot);
  }

  function createPointView(index) {
    const dot = s('circle', { class: 'scatter-correlation__dot', r: 6 });
    const node = s('g', {
      class: 'scatter-correlation__point', tabindex: '-1', role: 'button', 'aria-describedby': hintId,
    },
    s('circle', { class: 'scatter-correlation__hit', r: 16 }),
    s('circle', { class: 'scatter-correlation__ring', r: 11 }),
    dot);
    // Older mobile browsers ignore touch-action on SVG children; this keeps the page still while a point is dragged.
    // 旧版移动浏览器会忽略 SVG 子元素上的 touch-action，这里保证拖动点时页面不跟着滚动。
    listen(node, 'touchstart', (event) => event.preventDefault(), { passive: false });
    listen(node, 'pointerdown', (event) => startDrag(event, index));
    listen(node, 'pointermove', moveDrag);
    listen(node, 'pointerup', endDrag);
    listen(node, 'pointercancel', endDrag);
    listen(node, 'lostpointercapture', endDrag);
    listen(node, 'focus', () => onPointFocus(index));
    listen(node, 'keydown', (event) => onPointKey(event, index));
    return { node, dot };
  }

  // Point nodes and table rows are tied to a data position, so they are only ever added or removed at the end.
  // 数据点节点和表格行与数据位置一一对应，所以只在末尾增删。
  function syncPointViews() {
    while (pointViews.length < state.points.length) {
      const view = createPointView(pointViews.length);
      pointViews.push(view);
      frame.layers.points.append(view.node);
    }
    while (pointViews.length > state.points.length) pointViews.pop().node.remove();
    // One tab stop for the whole set (roving tabindex): the selected point, or the first one.
    // 整组点只占一个 Tab 位置（游走式 tabindex）：选中的点，或第一个点。
    const rover = state.selected ?? 0;
    pointViews.forEach((view, index) => view.node.setAttribute('tabindex', index === rover ? '0' : '-1'));
  }

  function createRowView(index) {
    const pick = h('button', {
      type: 'button', class: 'scatter-correlation__pick', 'aria-pressed': 'false',
      'aria-label': `选择点 ${index + 1} Select point ${index + 1}`,
    }, String(index + 1));
    listen(pick, 'click', () => select(index));
    const cells = { x: numberCell(), y: numberCell(), zx: numberCell(), zy: numberCell(), product: numberCell() };
    const row = h('tr', {}, h('th', { scope: 'row' }, pick), cells.x, cells.y, cells.zx, cells.zy, cells.product);
    return { row, pick, cells };
  }

  function syncRowViews() {
    while (rowViews.length < state.points.length) {
      const view = createRowView(rowViews.length);
      rowViews.push(view);
      tableBody.append(view.row);
    }
    while (rowViews.length > state.points.length) rowViews.pop().row.remove();
  }

  /* ---------- Drawing 绘制 ---------- */

  function drawPlot() {
    if (!frame) return;
    const geometry = frame.layout();
    const { plot } = geometry;
    const hasCentre = analysis.n > 0 && Number.isFinite(analysis.xbar) && Number.isFinite(analysis.ybar);
    const overlay = [];
    if (hasCentre) {
      const cx = geometry.x(analysis.xbar);
      const cy = geometry.y(analysis.ybar);
      replaceContent(frame.layers.regions,
        s('line', { class: 'scatter-correlation__mean', x1: cx, x2: cx, y1: plot.top, y2: plot.bottom }),
        s('line', { class: 'scatter-correlation__mean', x1: plot.left, x2: plot.right, y1: cy, y2: cy }));
      const nearRight = cx > plot.right - 32;
      overlay.push(
        svgText('x̄', nearRight ? cx - 5 : cx + 5, plot.top + 13, nearRight ? 'end' : 'start', 'mean-label'),
        svgText('ȳ', plot.left + 5, cy < plot.top + 18 ? cy + 15 : cy - 6, 'start', 'mean-label'),
      );
    } else {
      replaceContent(frame.layers.regions);
    }
    // The sign of z_x · z_y in each quarter, at the plot's corners (every quarter holds one corner).
    // 每一块里 z_x · z_y 的正负，标在图的四个角上（每一块都含有图的一个角）。
    if (analysis.defined) {
      overlay.push(
        svgText('+', plot.right - 8, plot.top + 17, 'end', 'quadrant'),
        svgText(MINUS, plot.right - 8, plot.bottom - 8, 'end', 'quadrant'),
        svgText('+', plot.left + 22, plot.bottom - 8, 'start', 'quadrant'),
        svgText(MINUS, plot.left + 22, plot.top + 17, 'start', 'quadrant'),
      );
    }
    const chosen = state.selected === null ? null : analysis.points[state.selected];
    if (chosen) {
      const px = geometry.x(chosen.x);
      const py = geometry.y(chosen.y);
      const toLeft = px > (plot.left + plot.right) / 2;
      overlay.push(svgText(
        `(${formatCoordinate(chosen.x)}, ${formatCoordinate(chosen.y)})`,
        toLeft ? px - 13 : px + 13,
        py < plot.top + 22 ? py + 24 : py - 13,
        toLeft ? 'end' : 'start',
        'point-label',
      ));
    }
    replaceContent(frame.layers.overlay, overlay);

    analysis.points.forEach((point, index) => {
      const view = pointViews[index];
      if (!view) return;
      const selected = state.selected === index;
      view.node.setAttribute('transform', `translate(${geometry.x(point.x).toFixed(1)} ${geometry.y(point.y).toFixed(1)})`);
      view.node.classList.toggle('is-selected', selected);
      view.node.setAttribute('aria-pressed', String(selected));
      view.node.setAttribute('aria-label', pointDescription(analysis, index));
      view.dot.setAttribute('class', `scatter-correlation__dot scatter-correlation__dot--${productSign(analysis.rows[index].zxzy) ?? 'none'}`);
    });
    frame.svg.setAttribute('aria-label', plotDescription(analysis, plainLabels));
  }

  function renderPointPanel() {
    const index = state.selected;
    const point = index === null ? null : state.points[index];
    emptyNote.hidden = Boolean(point);
    editor.hidden = !point;
    replaceContent(xFactorTag, state.factor === 1 ? null : ` (${TIMES} ${formatFactor(state.factor)})`);
    if (!point) return;
    replaceContent(pointHeading, biLabel(`点 ${index + 1}`, `Point ${index + 1}`));
    syncInputs(false);
    const insight = pointInsight(analysis, index);
    replaceContent(insightValues, insight.values ? formula(insight.values) : null);
    insightValues.hidden = !insight.values;
    replaceContent(insightText, insight.text ? teach(insight.text.zh, insight.text.en) : null);
  }

  // A field the learner is typing in keeps its text until they commit it.
  // 学生正在输入的框，在确认之前保留他输入的内容。
  function syncInputs(force) {
    const point = state.points[state.selected];
    if (!point) return;
    const shown = scalePoint(point, state.factor);
    if (force || document.activeElement !== xInput) xInput.value = inputValue(shown.x);
    if (force || document.activeElement !== yInput) yInput.value = inputValue(shown.y);
  }

  function renderResult() {
    replaceContent(rValue, formula(rText(analysis)));
    const words = associationWords(analysis);
    const badge = (word) => h('span', { class: 'scatter-correlation__badge' }, biLabel(word.zh, word.en));
    replaceContent(badges, analysis.defined
      ? [badge(words.direction), badge(words.strength)]
      : badge({ zh: '无法计算', en: 'cannot be computed' }));
    if (analysis.defined) {
      meterMarker.setAttribute('transform', `translate(${meterX(analysis.rShown).toFixed(1)} 0)`);
      meterMarker.removeAttribute('hidden');
    } else {
      meterMarker.setAttribute('hidden', '');
    }
    strengthRows(analysis).forEach((row, index) => {
      const view = scaleViews[index];
      view.row.classList.toggle('is-active', row.active);
      view.now.hidden = !row.active;
      if (row.active) view.row.setAttribute('aria-current', 'true');
      else view.row.removeAttribute('aria-current');
    });
    const description = describeAssociation(analysis, model);
    replaceContent(summaryBox, description.summary ? teach(description.summary.zh, description.summary.en) : null);
    examTitle.hidden = !description.sentences.length;
    // Sentences for curved data already say that r does not describe them, so the straight-line note is left out.
    // 弯曲数据的句子已经说明 r 不能描述它们，所以不再显示“只在直线时使用”的提示。
    formNote.hidden = !description.sentences.length || description.kind === 'curved';
    replaceContent(sentenceList, description.sentences.map((sentence) => examLine(sentence)));
  }

  function renderSteps() {
    replaceContent(stepList, correlationSteps(analysis, state.selected ?? 0).map((step) => h('li', { class: 'scatter-correlation__step' },
      h('p', { class: 'scatter-correlation__step-title' }, biLabel(step.title.zh, step.title.en)),
      step.lines.map((line) => h('p', { class: 'scatter-correlation__formula' }, formula(line))),
      step.note ? teach(step.note.zh, step.note.en) : null)));
  }

  function renderTable() {
    const data = productTable(analysis);
    syncRowViews();
    data.rows.forEach((row, index) => {
      const view = rowViews[index];
      const selected = state.selected === index;
      view.cells.x.textContent = row.x;
      view.cells.y.textContent = row.y;
      view.cells.zx.textContent = row.zx;
      view.cells.zy.textContent = row.zy;
      view.cells.product.textContent = row.product;
      view.cells.product.className = ['scatter-correlation__num', row.sign ? `scatter-correlation__num--${row.sign}` : ''].join(' ').trim();
      view.row.classList.toggle('is-selected', selected);
      view.pick.setAttribute('aria-pressed', String(selected));
    });
    sumCells.zx.textContent = data.sums.zx;
    sumCells.zy.textContent = data.sums.zy;
    sumCells.product.textContent = data.sums.product;
    rCell.textContent = data.rLine;
  }

  function renderUnits() {
    const comparison = unitComparison(state.points, state.factor, state.selected ?? 0);
    unitTableWrap.hidden = comparison.factor === 1;
    replaceContent(unitFactorHead, `${TIMES} ${formatFactor(comparison.factor)}`);
    replaceContent(unitBody, comparison.rows.map((row) => h('tr', { class: row.changed ? 'is-changed' : null },
      h('th', { scope: 'row' },
        h('span', { class: 'scatter-correlation__th-symbol' }, formula(row.symbol)),
        h('span', { class: 'scatter-correlation__th-name' }, biLabel(row.name.zh, row.name.en))),
      h('td', { class: 'scatter-correlation__num' }, row.original),
      h('td', { class: 'scatter-correlation__num' }, row.converted),
      h('td', {}, row.changed ? biLabel('变了', 'changed') : biLabel('不变', 'same')))));
    replaceContent(unitText, comparison.text ? teach(comparison.text.zh, comparison.text.en) : null);
  }

  // aria-disabled instead of disabled keeps keyboard focus on a button that reaches a limit; a press there is
  // refused by addPoint, addOutlier or removeAt, which say why in the status line.
  // 用 aria-disabled 而不是 disabled，按钮到达上限或下限时键盘焦点不会丢失；这时按下按钮，addPoint、addOutlier 或 removeAt
  // 会拒绝操作，并在状态行说明原因。
  function syncControls() {
    const count = state.points.length;
    addButton.setAttribute('aria-disabled', String(count >= MAX_POINTS));
    outlierButton.setAttribute('aria-disabled', String(count >= MAX_POINTS));
    removeButton.setAttribute('aria-disabled', String(count <= MIN_POINTS));
    maxNote.hidden = count < MAX_POINTS;
    minNote.hidden = count > MIN_POINTS;
  }

  /** Recomputes r and redraws every part. 重新计算 r 并重画所有部分。 */
  function refresh() {
    analysis = analyzeScatter(state.points, state.factor);
    if (state.selected !== null && state.selected >= state.points.length) state.selected = null;
    syncPointViews();
    drawPlot();
    renderPointPanel();
    renderResult();
    renderSteps();
    renderTable();
    renderUnits();
    syncControls();
  }

  // Dragging redraws at most once per frame. 拖动时每帧最多重画一次。
  function scheduleRefresh() {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      refresh();
    });
  }

  function flushRefresh() {
    if (!pendingFrame) return;
    cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
    refresh();
  }

  /**
   * Shows a { zh, en } message in the status line, which screen readers announce. A newer message replaces a run
   * of arrow-key moves that was not read out yet, so the two never arrive out of order.
   * 在状态行显示消息，读屏软件会朗读。新的消息会取代还没读出的方向键移动，两者不会颠倒顺序。
   */
  function say(message) {
    dropKeyRun();
    // Toggling a trailing no-break space makes a repeated message count as new, so it is read again.
    // 末尾交替加一个不换行空格，让重复的消息也被当作新消息再读一遍。
    announceToggle = !announceToggle;
    replaceContent(status, uiLabel(message.zh, message.en, 'teach'), announceToggle ? NO_BREAK_SPACE : '');
  }

  // Forgets a run of arrow-key moves that was not read out yet. 丢弃还没读出的一连串方向键移动。
  function dropKeyRun() {
    if (keyRun) window.clearTimeout(keyRun.timer);
    keyRun = null;
  }

  // Reads out a run of arrow-key moves: the point's final position and r before and after the run, or that the
  // point could not move because it sits at the edge of the plot.
  // 读出一连串方向键移动：点最后的位置，以及这一连串移动前后的 r；点在图的边上动不了时说明这一点。
  function sayKeyRun() {
    const run = keyRun;
    dropKeyRun();
    const point = run ? state.points[run.index] : null;
    if (!point) return;
    say(run.moved
      ? changeMessage('move', {
        number: run.index + 1, point: scalePoint(point, state.factor), before: run.before, after: analysis,
      })
      : changeMessage('edge', { number: run.index + 1 }));
  }

  /* ---------- Selection, dragging and keys 选择、拖动与按键 ---------- */

  function select(index) {
    state.selected = index;
    refresh();
  }

  function onPointFocus(index) {
    if (state.selected !== index) select(index);
  }

  function focusPoint(index) {
    pointViews[index]?.node.focus({ preventScroll: true });
  }

  // Tapping empty space in the plot releases the selected point. 点击图上的空白处取消选中的点。
  function onBackgroundClick(event) {
    if (event.target instanceof Element && event.target.closest('.scatter-correlation__point')) return;
    if (performance.now() - dragEndedAt < CLICK_AFTER_DRAG_MS || state.selected === null) return;
    select(null);
  }

  // Client coordinates are mapped back into data space through the SVG transform, then x back into config units.
  // 通过 SVG 的变换矩阵把屏幕坐标换算回数据坐标，再把 x 换回配置单位。
  function toData(event) {
    const matrix = frame.svg.getScreenCTM();
    if (!matrix) return null;
    const spot = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const geometry = frame.layout();
    return { x: unscaleX(geometry.x.invert(spot.x), state.factor), y: geometry.y.invert(spot.y) };
  }

  function startDrag(event, index) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    // The drag reports its own move when it ends. 拖动结束时会报告自己的移动。
    dropKeyRun();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    state.drag = { index, pointerId: event.pointerId, before: analysis, moved: false };
    root.classList.add('is-dragging');
    focusPoint(index);
    if (state.selected !== index) select(index);
  }

  function moveDrag(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const spot = toData(event);
    const current = state.points[drag.index];
    if (!spot || !current) return;
    const target = dragTarget(spot, state.view);
    if (target.x === current.x && target.y === current.y) return;
    state.points = replacePoint(state.points, drag.index, target);
    drag.moved = true;
    scheduleRefresh();
  }

  function endDrag(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    state.drag = null;
    root.classList.remove('is-dragging');
    flushRefresh();
    if (!drag.moved) return;
    dragEndedAt = performance.now();
    say(changeMessage('move', {
      number: drag.index + 1, point: scalePoint(state.points[drag.index], state.factor), before: drag.before, after: analysis,
    }));
  }

  function onPointKey(event, index) {
    const count = state.points.length;
    const jumps = {
      PageDown: index + 1, PageUp: index - 1, Home: 0, End: count - 1,
    };
    if (ARROW_KEYS.has(event.key)) {
      event.preventDefault();
      movePointBy(index, event.key, event.shiftKey);
    } else if (Object.hasOwn(jumps, event.key)) {
      event.preventDefault();
      focusPoint((jumps[event.key] + count) % count);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeAt(index, { refocus: true });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (state.selected !== index) select(index);
      xInput.focus();
      xInput.select?.();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (state.selected !== index) select(index);
    } else if (event.key === 'Escape' && state.selected !== null) {
      select(null);
    }
  }

  // The plot follows every press at once; the sentence waits until the presses stop (KEY_ANNOUNCE_DELAY). A run on
  // another point is read out first, so each point's move is still reported.
  // 图在每次按键后立刻更新；句子等按键停下来才读出（KEY_ANNOUNCE_DELAY）。如果之前在移动另一个点，先把那一段读出来，
  // 每个点的移动都会报告。
  function movePointBy(index, key, large) {
    if (keyRun && keyRun.index !== index) sayKeyRun();
    if (!keyRun) keyRun = { index, before: analysis, moved: false, timer: 0 };
    const current = state.points[index];
    const next = nudgePoint(current, key, state.view, { large });
    state.selected = index;
    if (next.x !== current.x || next.y !== current.y) {
      state.points = replacePoint(state.points, index, next);
      keyRun.moved = true;
    }
    refresh();
    window.clearTimeout(keyRun.timer);
    keyRun.timer = window.setTimeout(sayKeyRun, KEY_ANNOUNCE_DELAY);
  }

  /* ---------- Actions 操作 ---------- */

  function commitInput(axis) {
    const index = state.selected;
    const current = index === null ? null : state.points[index];
    if (!current) return;
    const input = axis === 'x' ? xInput : yInput;
    const value = input.value.trim() === '' ? Number.NaN : Number(input.value);
    if (!Number.isFinite(value)) {
      syncInputs(true);
      say(changeMessage('invalid'));
      return;
    }
    const next = axis === 'x' ? { x: unscaleX(value, state.factor), y: current.y } : { x: current.x, y: value };
    if (next.x === current.x && next.y === current.y) return;
    const before = analysis;
    state.points = replacePoint(state.points, index, next);
    // A typed value may lie outside the plot, so the view grows to show it.
    // 输入的值可能在图外，这时扩大绘图窗口把它显示出来。
    if (!viewContains(state.view, state.points)) {
      state.view = fitView(state.points);
      buildFrame();
    }
    refresh();
    say(changeMessage('move', {
      number: index + 1, point: scalePoint(next, state.factor), before, after: analysis,
    }));
  }

  function addPoint() {
    if (state.points.length >= MAX_POINTS) {
      say(changeMessage('max'));
      return;
    }
    const before = analysis;
    const point = placeNewPoint(state.points, state.view);
    state.points = appendPoint(state.points, point);
    state.selected = state.points.length - 1;
    refresh();
    say(changeMessage('add', {
      number: state.selected + 1, point: scalePoint(point, state.factor), before, after: analysis,
    }));
  }

  function addOutlier() {
    if (state.points.length >= MAX_POINTS) {
      say(changeMessage('max'));
      return;
    }
    const before = analysis;
    const point = outlierPosition(state.points, state.view);
    state.points = appendPoint(state.points, point);
    state.selected = state.points.length - 1;
    if (!viewContains(state.view, state.points)) {
      state.view = fitView(state.points);
      buildFrame();
    }
    refresh();
    say(changeMessage('outlier', {
      number: state.selected + 1, point: scalePoint(point, state.factor), before, after: analysis,
    }));
  }

  function loadCurve() {
    state.points = curvedPoints(state.view);
    state.view = fitView(state.points);
    state.selected = null;
    buildFrame();
    refresh();
    say(changeMessage('curve', { after: analysis }));
  }

  function removeAt(index, { refocus = false } = {}) {
    if (index === null || index === undefined || !state.points[index]) return;
    if (state.points.length <= MIN_POINTS) {
      say(changeMessage('min'));
      return;
    }
    const before = analysis;
    state.points = removePoint(state.points, index);
    // The next point (or the new last one) becomes selected, so the editor and the keyboard keep their place.
    // 下一个点（或新的最后一个点）成为选中的点，编辑区和键盘焦点都不会丢失位置。
    state.selected = Math.min(index, state.points.length - 1);
    refresh();
    if (refocus) focusPoint(state.selected);
    say(changeMessage('remove', { number: index + 1, before, after: analysis }));
  }

  function setFactor(factor) {
    if (factor === state.factor) return;
    state.factor = factor;
    buildFrame();
    refresh();
    say(changeMessage('units', { factor, after: analysis }));
  }

  function reset() {
    state.points = model.points.map((point) => ({ ...point }));
    state.factor = 1;
    unitSelect.value = '1';
    state.view = fitView(state.points);
    state.selected = null;
    buildFrame();
    refresh();
    say(changeMessage('reset', { after: analysis }));
  }

  container.replaceChildren(root);
  buildFrame();
  refresh();

  return () => {
    events.abort();
    stopObserving();
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
    dropKeyRun();
    state.drag = null;
  };
}
