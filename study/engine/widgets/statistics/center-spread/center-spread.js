/**
 * Widget "center-spread": measures of centre and spread worked out step by step (STA220 Modules 3-4), with editable
 * data, a dot plot, an outlier switch that shows which measures are resistant, and "add c" / "multiply by k"
 * transformations of every value.
 * 组件“集中趋势与离散程度”：逐步计算集中趋势与离散程度（STA220 第 3-4 单元）；数据可以编辑，配有点图，
 * 离群值开关展示哪些指标耐抗，还可以把每个值“加上 c”或“乘以 k”。
 *
 * Config: { title: {zh, en}, variable: {zh, en}, unit: "kcal", data: [3-30 numbers], quartiles: "hand" | "r7",
 * transform: true, cases: {zh, en} (optional: the cases the mean and median sentences talk about) }. Every number
 * and sentence comes from center-spread-logic.js; this module only lays them out.
 * 配置格式见上（cases 可选：平均数句和中位数句所说的个案）。每个数字和句子都来自 center-spread-logic.js；本模块只负责排版与交互。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import {
  biStack, biTitle, enNode, uiText, zhNode,
} from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { segmented, setSegmentedValue } from '../../../components/controls/segmented.js';
import { ensureSharedStyles } from '../../machine-learning/shared/ml-ui.js';
import { createPlotFrame } from '../../machine-learning/shared/plot-frame.js';
import {
  DEFAULT_CONSTANTS, GUIDE, METHOD_NAMES, RESET_MESSAGE, TRANSFORM_OPERATIONS, TRANSFORM_PRESETS, analyzeData,
  centreSpreadSteps, deviationView, formatConstant, formatDataText, matchingPreset, methodMessage,
  normalizeCenterSpreadConfig, outlierMessage, outlierSwap, parseConstant, parseDataText, plotModel, positionCells,
  resistanceReport, summaryGroups, transformMessage, transformReport, updateMessage,
} from './center-spread-logic.js';

// The deviation table starts open for small data sets; longer ones fold away behind a summary line.
// 数据较少时偏差表默认展开；数据较多时折叠在一行摘要后面。
const OPEN_ROWS = 12;
// Dot radius in pixels, and the share of the row height and of the gap between values a dot may fill.
// 点的半径（像素），以及点最多占行高和相邻取值间距的比例。
const DOT_RADIUS = Object.freeze({ min: 2, max: 6, row: 0.42, gap: 0.48 });
// Room in pixels that the "ȳ" and "Q2" labels need beside their line. “ȳ”与“Q2”标签在线旁所需的空间（像素）。
const PLOT_LABEL_ROOM = 30;

let mountCount = 0;

/* ---------- Bilingual pieces 双语小构件 ---------- */

/** Short label: Chinese (always visible) then English. 简短标签：中文（始终可见）在前，英文在后。 */
function label(zh, en) {
  return [zhNode(zh, 'label'), zh && en ? ' ' : null, enNode(en)];
}

const labelOf = (value) => label(value.zh, value.en);

/** Teaching text: the Chinese explanation, then its English version. 讲解文字：中文讲解在前，英文在后。 */
function teach(value, className) {
  return h('div', { class: ['center-spread__teach', className] },
    zhNode(value.zh, 'teach', 'p', 'center-spread__teach-zh'),
    enNode(value.en, 'p', 'center-spread__teach-en'));
}

/** A rule cell: plain text when both languages agree ("× 2"), otherwise a bilingual label. 规律格：两种语言相同时为纯文字。 */
function ruleText(value) {
  return value.zh === value.en ? value.en : labelOf(value);
}

const EXAM_SENTENCE = Object.freeze({ zh: '考试这样写', en: 'Write it like this' });
const SLIDE_RULE = Object.freeze({ zh: '课件结论', en: 'The rule from the slides' });

/**
 * A sentence to learn in English: English first, the Chinese meaning under it, then `hint` (what to fill into its
 * placeholders such as [cases]) when there is one.
 * 要用英文掌握的句子：英文在前，中文意思在下；有 hint 时再写出占位词（如 [cases]）要填什么。
 */
function sentenceBox(value, heading = EXAM_SENTENCE, hint = null) {
  return h('div', { class: 'center-spread__sentence' },
    h('p', { class: 'center-spread__sentence-label' }, labelOf(heading)),
    biStack(value, { className: 'center-spread__sentence-text' }),
    hint ? teach(hint, 'center-spread__sentence-hint') : null);
}

function noteBox(value, tone = 'info') {
  return h('div', { class: ['center-spread__note', `center-spread__note--${tone}`] }, teach(value));
}

/** Measure name with its course symbol: "ȳ 平均数 mean". 指标名称及其课程记号。 */
function measureName(item) {
  return [item.symbol ? h('span', { class: 'center-spread__symbol' }, item.symbol) : null, item.symbol ? ' ' : null,
    label(item.label.zh, item.label.en)];
}

function headCell(symbol, zh, en) {
  return h('th', { scope: 'col' },
    symbol ? h('span', { class: 'center-spread__th-symbol' }, symbol) : null,
    h('span', { class: 'center-spread__th-name' }, label(zh, en)));
}

const numberCell = (text, className) => h('td', { class: ['center-spread__num', className] }, text);

/**
 * Polite status line. The same message twice is still announced, because a non-breaking space is toggled at the end.
 * 礼貌型状态行。末尾交替添加不换行空格，使相同的消息也会被再次朗读。
 */
function statusLine() {
  const element = h('p', { class: 'center-spread__status', role: 'status', 'aria-live': 'polite' });
  let flip = false;
  return {
    element,
    show(message, tone = 'info') {
      flip = !flip;
      element.classList.toggle('center-spread__status--error', tone === 'error');
      replaceContent(element, labelOf(message), flip ? '\u00a0' : null);
    },
    clear() {
      element.classList.remove('center-spread__status--error');
      replaceContent(element);
    },
  };
}

/* ---------- Mount 挂载 ---------- */

export async function mount(container, config, context) {
  await Promise.all([
    ensureStylesheet(new URL('./center-spread.css', import.meta.url)),
    ensureSharedStyles(),
  ]);
  mountCount += 1;
  const id = (name) => `center-spread-${mountCount}-${name}`;
  const model = normalizeCenterSpreadConfig(config);
  const labels = { variable: model.variable, unit: model.unit, cases: model.cases };
  // One signal ends everything at cleanup: listeners added here are removed by abort(), and callbacks handed to
  // shared components (buttons, segmented controls) or to elements rebuilt on each render stop acting once it fired.
  // 一个 signal 在清理时结束一切：这里添加的监听由 abort() 移除；交给共享组件（按钮、分段控件）或每次重绘都会重建的元素的回调，
  // 在 signal 触发后也不再起作用。
  const listeners = new AbortController();
  const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: listeners.signal });
  const guarded = (handler) => (...args) => {
    if (!listeners.signal.aborted) handler(...args);
  };

  const state = {
    base: [...model.data],
    outlier: false,
    method: model.quartiles,
    operation: 'add',
    constants: { ...DEFAULT_CONSTANTS },
    detailsOpen: model.data.length <= OPEN_ROWS,
  };
  const current = { analysis: null, swap: null };

  /* ---------- Header 标题 ---------- */
  const titleId = id('title');
  const header = h('header', { class: 'center-spread__header' },
    h('p', { class: 'center-spread__eyebrow' }, label('互动演示', 'Interactive')),
    h('h3', { class: 'center-spread__title', id: titleId }, biTitle(model.title)),
    teach(GUIDE.intro, 'center-spread__intro'));

  /* ---------- Data panel 数据面板 ---------- */
  const dataStatus = statusLine();
  dataStatus.element.id = id('data-status');
  const dataInput = h('textarea', {
    id: id('data'),
    class: ['input', 'center-spread__data-input'],
    rows: 3,
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    'aria-describedby': `${id('data-hint')} ${id('data-status')}`,
  });
  dataInput.value = formatDataText(state.base);

  const applyButton = button({
    label: label('应用', 'Apply'), iconName: 'check', variant: 'primary', onClick: guarded(() => applyData()),
  });
  const outlierButton = button({
    label: label('把最大值变成离群值', 'Make the largest value an outlier'),
    iconName: 'target',
    pressed: false,
    onClick: guarded(() => toggleOutlier()),
  });
  outlierButton.setAttribute('aria-controls', id('resist'));
  const resetButton = button({
    label: label('恢复原始数据', 'Reset'), iconName: 'refresh', variant: 'ghost', onClick: guarded(() => reset()),
  });

  const dataPanel = h('section', { class: 'center-spread__panel center-spread__data', 'aria-labelledby': id('data-title') },
    h('h4', { class: 'center-spread__panel-title', id: id('data-title') }, label('数据', 'Data')),
    h('p', { class: 'center-spread__variable' },
      label(model.variable.zh, model.variable.en),
      model.unit ? h('span', { class: 'center-spread__unit' }, uiText(` (${model.unit})`)) : null),
    model.usesExample ? noteBox(GUIDE.example) : null,
    h('label', { class: 'center-spread__field-label', for: id('data') }, label('数据值', 'Data values')),
    dataInput,
    h('p', { class: 'center-spread__hint', id: id('data-hint') }, labelOf(GUIDE.dataHint)),
    h('div', { class: 'center-spread__buttons' }, applyButton, outlierButton, resetButton),
    dataStatus.element,
    teach(GUIDE.outlier, 'center-spread__outlier-hint'));

  /* ---------- Dot plot 点图 ---------- */
  const plotHost = h('div', { class: 'center-spread__plot' });
  const outlierLegend = h('li', { class: 'center-spread__legend-item', hidden: true },
    legendIcon(() => s('circle', { class: 'center-spread__dot center-spread__dot--outlier', cx: 10, cy: 10, r: 6 })),
    h('span', {}, label('离群值', 'outlier')));
  const figurePanel = h('section', { class: 'center-spread__panel center-spread__figure', 'aria-labelledby': id('plot-title') },
    h('h4', { class: 'center-spread__panel-title', id: id('plot-title') }, label('点图', 'Dot plot')),
    plotHost,
    h('ul', { class: 'center-spread__legend' },
      h('li', { class: 'center-spread__legend-item' },
        legendIcon(() => s('circle', { class: 'center-spread__dot', cx: 10, cy: 10, r: 5 })),
        h('span', {}, label('每个点 = 一个值', 'one dot = one value'))),
      h('li', { class: 'center-spread__legend-item' },
        legendIcon(() => [
          s('line', { class: 'center-spread__mean-line', x1: 10, y1: 6, x2: 10, y2: 20 }),
          s('path', { class: 'center-spread__mean-marker', d: 'M4 1 L16 1 L10 10 Z' }),
        ]),
        h('span', {}, label('平均数 ȳ', 'mean ȳ'))),
      h('li', { class: 'center-spread__legend-item' },
        legendIcon(() => s('line', { class: 'center-spread__median-line', x1: 10, y1: 1, x2: 10, y2: 19 })),
        h('span', {}, label('中位数 Q2', 'median Q2'))),
      h('li', { class: 'center-spread__legend-item' },
        legendIcon(() => s('rect', { class: 'center-spread__iqr-band', x: 2, y: 3, width: 16, height: 14 })),
        h('span', {}, label('Q1 到 Q3：中间 50%', 'Q1 to Q3: the middle 50%'))),
      outlierLegend));

  /* ---------- Outlier comparison 离群值对比 ---------- */
  const resistBody = h('div', { class: 'center-spread__resist-body' });
  const resistPanel = h('section', {
    id: id('resist'),
    class: 'center-spread__panel center-spread__resist',
    'aria-labelledby': id('resist-title'),
    hidden: true,
  },
  h('h4', { class: 'center-spread__panel-title', id: id('resist-title') }, label('离群值对各指标的影响', 'How an outlier affects each measure')),
  resistBody);

  /* ---------- Results at a glance 结果一览 ---------- */
  const summaryStatus = statusLine();
  const methodControl = segmented({
    options: ['hand', 'r7'].map((value) => ({
      value,
      label: value === 'hand' ? label('手算', 'Hand') : label('R 的方法', "R's method"),
      title: `${METHOD_NAMES[value].zh} ${METHOD_NAMES[value].en}`,
    })),
    value: state.method,
    ariaLabel: '四分位数的算法 Quartile method',
    size: 'sm',
    onChange: guarded((value) => setMethod(value)),
  });
  const summaryBody = h('div', { class: 'center-spread__groups' });
  const summaryPanel = h('section', { class: 'center-spread__panel center-spread__summary', 'aria-labelledby': id('summary-title') },
    h('div', { class: 'center-spread__summary-head' },
      h('h4', { class: 'center-spread__panel-title', id: id('summary-title') }, label('结果一览', 'Results at a glance')),
      h('div', { class: 'center-spread__method' },
        h('span', { class: 'center-spread__method-label', 'aria-hidden': 'true' }, label('四分位数', 'Quartiles')),
        methodControl)),
    summaryBody,
    summaryStatus.element);

  /* ---------- Worked steps 解题步骤 ---------- */
  const stepsList = h('ol', { class: 'center-spread__steps' });
  const stepsPanel = h('section', { class: 'center-spread__panel center-spread__steps-panel', 'aria-labelledby': id('steps-title') },
    h('h4', { class: 'center-spread__panel-title', id: id('steps-title') }, label('一步一步算', 'Step by step')),
    stepsList);

  /* ---------- Transformations 变换 ---------- */
  const transform = model.transform ? buildTransformPanel() : null;

  const root = h('section', { class: 'center-spread', 'aria-labelledby': titleId },
    header,
    h('div', { class: 'center-spread__top' }, dataPanel, figurePanel),
    resistPanel,
    summaryPanel,
    stepsPanel,
    transform ? transform.panel : null);

  /* ---------- Rendering 绘制 ---------- */

  function legendIcon(draw) {
    return s('svg', { class: 'center-spread__legend-icon', viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true' }, draw());
  }

  const plot = { frame: null, key: '', stop: () => {}, model: null };

  // uiText marks the Latin part of the unit lang="en" ("(kcal)"), as z-score does. uiText 把单位的拉丁字母部分标为 lang="en"。
  function axisTitle() {
    return [label(model.variable.zh, model.variable.en), model.unit ? uiText(` (${model.unit})`) : null];
  }

  function renderPlot(next) {
    plot.model = next;
    if (!next.drawable) {
      // Values beyond what an axis can show: the sentence replaces the picture. 数值超出坐标轴能表示的范围：用文字代替图。
      plot.stop();
      plot.stop = () => {};
      plot.frame = null;
      plot.key = '';
      replaceContent(plotHost, teach(next.description, 'center-spread__plot-note'));
      return;
    }
    if (!plot.frame) replaceContent(plotHost);
    const key = [next.xExtent.min, next.xExtent.max, next.xExtent.step, next.yExtent.max].join('|');
    if (!plot.frame || plot.key !== key) {
      plot.stop();
      const frame = createPlotFrame({
        xExtent: next.xExtent,
        yExtent: next.yExtent,
        label: `${next.description.zh} ${next.description.en}`,
        aspect: 0.36,
        minHeight: 160,
        maxHeight: 240,
        xTitle: axisTitle(),
      });
      if (plot.frame) plot.frame.element.replaceWith(frame.element);
      else plotHost.append(frame.element);
      plot.frame = frame;
      plot.key = key;
      plot.stop = frame.observe(drawPlot);
    }
    drawPlot();
  }

  // Dots stack upwards for equal values; the triangle and dashed line mark the mean, the solid line the median,
  // and the band the middle 50%. Labels "ȳ" and "Q2" sit on opposite sides so they never cover each other.
  // 相同的值向上叠点；三角形与虚线标出平均数，实线标出中位数，阴影是中间 50%。“ȳ”和“Q2”分放两侧，互不遮挡。
  function drawPlot() {
    const { frame, model: data } = plot;
    if (!frame || !data || !data.drawable) return;
    const { plot: box, x, y } = frame.layout();
    const values = data.stacks.map((stack) => x(stack.value));
    const gaps = values.slice(1).map((value, index) => value - values[index]);
    const rowHeight = Math.abs(y(0) - y(1));
    const radius = Math.max(DOT_RADIUS.min, Math.min(DOT_RADIUS.max, rowHeight * DOT_RADIUS.row,
      gaps.length ? Math.min(...gaps) * DOT_RADIUS.gap : DOT_RADIUS.max));
    const meanX = x(data.mean);
    const medianX = x(data.median);
    const meanRight = meanX >= medianX;
    replaceContent(frame.layers.regions, s('rect', {
      class: 'center-spread__iqr-band',
      x: x(data.q1).toFixed(1),
      y: box.top,
      width: Math.max(1, x(data.q3) - x(data.q1)).toFixed(1),
      height: box.bottom - box.top,
    }));
    replaceContent(frame.layers.marks,
      s('line', { class: 'center-spread__median-line', x1: medianX.toFixed(1), x2: medianX.toFixed(1), y1: box.top, y2: box.bottom }),
      s('line', { class: 'center-spread__mean-line', x1: meanX.toFixed(1), x2: meanX.toFixed(1), y1: box.top, y2: box.bottom }));
    replaceContent(frame.layers.points, data.stacks.flatMap((stack) => Array.from({ length: stack.count }, (_, level) => {
      const marked = stack.outlier && level === stack.count - 1;
      return s('circle', {
        class: ['center-spread__dot', marked ? 'center-spread__dot--outlier' : null],
        cx: x(stack.value).toFixed(1),
        cy: y(level + 0.5).toFixed(1),
        r: (marked ? radius + 1.5 : radius).toFixed(1),
      });
    })));
    // A label that would run past the plot edge moves to the other side of its line. 会超出图边缘的标签换到线的另一侧。
    const text = (content, at, preferRight) => {
      let right = preferRight;
      if (right && at + PLOT_LABEL_ROOM > box.right) right = false;
      else if (!right && at - PLOT_LABEL_ROOM < box.left) right = true;
      return s('text', {
        class: 'center-spread__plot-label',
        x: (at + (right ? 9 : -9)).toFixed(1),
        y: box.top + 12,
        'text-anchor': right ? 'start' : 'end',
      }, content);
    };
    replaceContent(frame.layers.overlay,
      s('path', { class: 'center-spread__mean-marker', d: `M${(meanX - 6).toFixed(1)} ${box.top} L${(meanX + 6).toFixed(1)} ${box.top} L${meanX.toFixed(1)} ${box.top + 10} Z` }),
      text('ȳ', meanX, meanRight),
      text('Q2', medianX, !meanRight));
    frame.svg.setAttribute('aria-label', `${data.description.zh} ${data.description.en}`);
  }

  function renderSummary(analysis) {
    replaceContent(summaryBody, summaryGroups(analysis, model.unit).map((group) => h('section', { class: 'center-spread__group' },
      h('h5', { class: 'center-spread__group-title' }, labelOf(group.title)),
      h('dl', { class: 'center-spread__tiles' }, group.items.map((item) => h('div', { class: 'center-spread__tile' },
        h('dt', { class: 'center-spread__tile-label' }, measureName(item)),
        h('dd', { class: 'center-spread__tile-value' }, item.valueBi ? labelOf(item.valueBi) : uiText(item.value))))))));
  }

  function positionsView(analysis) {
    return h('ol', { class: 'center-spread__positions', 'aria-label': '排好序的数据 Sorted data' },
      positionCells(analysis).map((cell) => h('li', {
        class: [
          'center-spread__position',
          cell.half ? `center-spread__position--${cell.half}` : null,
          cell.marks.length ? 'center-spread__position--marked' : null,
        ],
      },
      h('span', { class: 'center-spread__position-index', 'aria-hidden': 'true' }, String(cell.position)),
      h('span', { class: 'center-spread__position-value' }, cell.text),
      cell.marks.length ? h('span', { class: 'center-spread__position-marks' }, cell.marks.join(' ')) : null)));
  }

  function deviationsView(analysis) {
    const view = deviationView(analysis);
    const table = h('table', { class: 'data-table center-spread__table center-spread__dev-table' },
      h('caption', { class: 'visually-hidden' }, label('每个值的偏差与偏差的平方', 'The deviation and the squared deviation of each value')),
      h('thead', {}, h('tr', {},
        headCell('i', '位置', 'position'),
        headCell('y', '数值', 'value'),
        headCell('y − ȳ', '偏差', 'deviation'),
        headCell('(y − ȳ)²', '偏差的平方', 'squared deviation'))),
      h('tbody', {}, view.rows.map((row) => h('tr', {},
        h('th', { scope: 'row', class: 'center-spread__num' }, String(row.position)),
        numberCell(row.y),
        numberCell(row.deviation),
        numberCell(row.squared)))),
      h('tfoot', {}, h('tr', {},
        h('th', { scope: 'row', class: 'center-spread__num' }, 'Σ'),
        numberCell(view.footer.sum),
        numberCell(view.footer.sumDeviation),
        numberCell(view.footer.sumSquared))));
    const body = [h('div', { class: 'table-scroll center-spread__table-wrap' }, table), view.note ? noteBox(view.note) : null];
    if (analysis.n <= OPEN_ROWS) return h('div', { class: 'center-spread__deviations' }, body);
    // Long tables fold away; the open state survives re-rendering. The listener lives and dies with this element,
    // which every render replaces.
    // 长表格可折叠，重绘后保持展开状态。监听器随这个元素一起创建和销毁（每次重绘都会替换它）。
    const details = h('details', {
      class: 'center-spread__details',
      open: state.detailsOpen,
      ontoggle: guarded(() => {
        state.detailsOpen = details.open;
      }),
    },
    h('summary', { class: 'center-spread__details-summary' },
      label(`逐个计算 (y − ȳ)²（${analysis.n} 行）`, `Work out each (y − ȳ)² (${analysis.n} rows)`)),
    body);
    return details;
  }

  // Formulas and worked lines are English and symbols ("position = 0.5 × (n + 1)", "Range = Max − Min = 220"), so
  // they carry lang="en" and screen readers read them with an English voice on the zh-CN page.
  // 公式和计算行是英文和符号，所以标上 lang="en"，读屏软件在 zh-CN 页面里也会用英文发音。
  function itemView(item, analysis) {
    if (item.kind === 'formula') return h('p', { class: 'center-spread__formula', lang: 'en' }, item.text);
    if (item.kind === 'work') {
      return h('div', { class: 'center-spread__work' }, item.lines.map((line) => h('p', {
        class: ['center-spread__work-line', /^[=≈]/.test(line) ? 'center-spread__work-line--continued' : null],
        lang: 'en',
      }, line)));
    }
    if (item.kind === 'explain') return teach(item.text, 'center-spread__explain');
    if (item.kind === 'note') return noteBox(item.text, item.tone);
    if (item.kind === 'positions') return positionsView(analysis);
    if (item.kind === 'deviations') return deviationsView(analysis);
    return null;
  }

  function renderSteps(analysis) {
    replaceContent(stepsList, centreSpreadSteps(analysis, labels).map((step) => h('li', { class: 'center-spread__step' },
      h('h5', { class: 'center-spread__step-title' }, biTitle(step.title)),
      teach(step.why, 'center-spread__why'),
      step.items.map((item) => itemView(item, analysis)),
      step.sentence ? sentenceBox(step.sentence, EXAM_SENTENCE, step.hint) : null)));
  }

  function renderResistance(analysis) {
    resistPanel.hidden = !current.swap;
    outlierLegend.hidden = !current.swap;
    if (!current.swap) {
      replaceContent(resistBody);
      return;
    }
    const report = resistanceReport(analyzeData(state.base, state.method), analysis, current.swap, labels);
    replaceContent(resistBody,
      teach(report.rule),
      h('div', { class: 'table-scroll center-spread__table-wrap' },
        h('table', { class: 'data-table center-spread__table' },
          h('caption', { class: 'visually-hidden' }, label('离群值出现前后的各项指标', 'Each measure before and after the outlier')),
          h('thead', {}, h('tr', {},
            headCell('', '指标', 'measure'),
            headCell('', '原来', 'before'),
            headCell('', '有离群值', 'with the outlier'),
            headCell('', '变化', 'change'),
            headCell('', '课件结论', 'the slides say'))),
          h('tbody', {}, report.rows.map((row) => h('tr', { class: row.changed ? 'center-spread__row--changed' : null },
            h('th', { scope: 'row' }, measureName(row)),
            numberCell(row.before),
            numberCell(row.after),
            row.changed
              ? numberCell(row.change, 'center-spread__change')
              : h('td', { class: 'center-spread__same' }, label('不变', 'no change')),
            h('td', {}, h('span', {
              class: ['center-spread__badge', row.resistant ? 'center-spread__badge--resistant' : 'center-spread__badge--sensitive'],
            }, row.resistant ? label('耐抗', 'resistant') : label('不耐抗', 'not resistant')))))))),
      teach(report.sentence, 'center-spread__resist-sentence'),
      report.note ? noteBox(report.note, 'warn') : null,
      teach(report.advice));
  }

  function render() {
    current.swap = state.outlier ? outlierSwap(state.base) : null;
    const values = current.swap ? current.swap.values : state.base;
    const analysis = analyzeData(values, state.method);
    current.analysis = analysis;
    renderPlot(plotModel(analysis, { outlier: current.swap ? current.swap.to : null, unit: model.unit }));
    renderResistance(analysis);
    renderSummary(analysis);
    renderSteps(analysis);
    if (transform) transform.render(values);
  }

  /* ---------- Actions 操作 ---------- */

  function sameData(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  // Reads the text box; `quiet` skips the message when nothing changed (the box only lost focus).
  // 读取输入框；quiet 为真且数据没有变化时（只是输入框失去焦点）不显示提示。
  function applyData({ quiet = false } = {}) {
    const parsed = parseDataText(dataInput.value);
    if (parsed.error) {
      dataInput.setAttribute('aria-invalid', 'true');
      dataStatus.show(parsed.error, 'error');
      return;
    }
    dataInput.removeAttribute('aria-invalid');
    if (quiet && sameData(parsed.values, state.base)) return;
    state.base = parsed.values;
    state.outlier = false;
    outlierButton.setAttribute('aria-pressed', 'false');
    render();
    dataStatus.show(updateMessage(current.analysis, model.unit));
  }

  function toggleOutlier() {
    state.outlier = !state.outlier;
    outlierButton.setAttribute('aria-pressed', String(state.outlier));
    render();
    dataStatus.show(outlierMessage(outlierSwap(state.base), state.outlier, model.unit));
  }

  function reset() {
    state.base = [...model.data];
    state.outlier = false;
    dataInput.value = formatDataText(state.base);
    dataInput.removeAttribute('aria-invalid');
    outlierButton.setAttribute('aria-pressed', 'false');
    render();
    dataStatus.show(RESET_MESSAGE);
  }

  function setMethod(method) {
    if (method === state.method) return;
    state.method = method;
    render();
    summaryStatus.show(methodMessage(current.analysis, model.unit));
  }

  listen(dataInput, 'keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      applyData();
    }
  });
  listen(dataInput, 'change', () => applyData({ quiet: true }));

  /* ---------- Transformation panel 变换面板 ---------- */

  function buildTransformPanel() {
    const status = statusLine();
    status.element.id = id('constant-status');
    const constantLabel = h('label', { class: 'center-spread__field-label', for: id('constant') });
    const constantInput = h('input', {
      id: id('constant'),
      class: ['input', 'center-spread__constant-input'],
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-describedby': id('constant-status'),
    });
    const operationControl = segmented({
      options: TRANSFORM_OPERATIONS.map((value) => ({
        value,
        label: value === 'add' ? label('加上 c', 'Add c') : label('乘以 k', 'Multiply by k'),
      })),
      value: state.operation,
      ariaLabel: '对每个值做什么 What to do to every value',
      size: 'sm',
      onChange: guarded((value) => setOperation(value)),
    });
    const presetButtons = TRANSFORM_PRESETS.map((preset) => button({
      label: preset.text,
      size: 'sm',
      pressed: false,
      ariaLabel: `${preset.name.zh} ${preset.name.en}`,
      className: 'center-spread__preset',
      onClick: guarded(() => applyPreset(preset)),
    }));
    const body = h('div', { class: 'center-spread__transform-body' });
    const panel = h('section', { class: 'center-spread__panel center-spread__transform', 'aria-labelledby': id('transform-title') },
      h('h4', { class: 'center-spread__panel-title', id: id('transform-title') },
        label('每个值都加上或乘以一个常数', 'Add a constant to every value, or multiply every value by it')),
      teach(GUIDE.transform, 'center-spread__panel-intro'),
      h('div', { class: 'center-spread__controls' },
        operationControl,
        h('div', { class: 'center-spread__constant' }, constantLabel, constantInput),
        h('div', { class: 'center-spread__presets', role: 'group', 'aria-labelledby': id('presets-label') },
          h('span', { class: 'center-spread__presets-label', id: id('presets-label') }, label('课件的例子', 'Slide examples')),
          presetButtons)),
      status.element,
      body);

    function syncControls() {
      replaceContent(constantLabel, state.operation === 'add' ? label('常数 c =', 'constant c =') : label('常数 k =', 'constant k ='));
      constantInput.value = formatConstant(state.constants[state.operation]);
      constantInput.removeAttribute('aria-invalid');
      setSegmentedValue(operationControl, state.operation);
      syncPresets();
    }

    function syncPresets() {
      const active = matchingPreset(state.operation, state.constants[state.operation]);
      presetButtons.forEach((presetButton, index) => presetButton.setAttribute('aria-pressed', String(index === active)));
    }

    let latest = null;

    function renderBody(values) {
      const result = transformReport(values, state.method, state.operation, state.constants[state.operation], labels);
      latest = result;
      const rowsOf = (kinds) => result.rows.filter((row) => kinds.includes(row.kind)).map((row) => h('tr', {},
        h('th', { scope: 'row' }, measureName(row)),
        numberCell(row.before),
        numberCell(row.after),
        h('td', { class: 'center-spread__rule' }, ruleText(row.rule))));
      const groupRow = (zh, en) => h('tr', { class: 'center-spread__group-row' },
        h('th', { scope: 'rowgroup', colspan: 4 }, label(zh, en)));
      replaceContent(body,
        h('p', { class: 'center-spread__preview' },
          h('span', { class: 'center-spread__symbol' }, result.expression), ': ', result.preview),
        h('div', { class: 'table-scroll center-spread__table-wrap' },
          h('table', { class: 'data-table center-spread__table' },
            h('caption', { class: 'visually-hidden' }, label('变换前后的各项指标', 'Each measure before and after the transformation')),
            h('thead', {}, h('tr', {},
              headCell('', '指标', 'measure'),
              headCell('y', '原来', 'original'),
              headCell(result.expression, '变换后', 'new'),
              headCell('', '怎么变', 'how it changes'))),
            h('tbody', {}, groupRow('位置指标', 'Measures of position'), rowsOf(['position'])),
            h('tbody', {}, groupRow('离散程度', 'Measures of spread'), rowsOf(['spread'])),
            h('tbody', {}, groupRow('补充（课件外）', 'Extra (not on the slides)'), rowsOf(['variance'])))),
        result.sentenceIsExtra ? noteBox(result.sentence, 'extra') : sentenceBox(result.sentence, SLIDE_RULE),
        noteBox(result.varianceNote, 'extra'));
      return result;
    }

    function update(values, announce) {
      const result = renderBody(values);
      syncPresets();
      if (announce) status.show(transformMessage(result, model.unit));
    }

    function setOperation(operation) {
      if (operation === state.operation) return;
      state.operation = operation;
      syncControls();
      update(currentValues(), true);
    }

    function applyPreset(preset) {
      state.operation = preset.operation;
      state.constants[preset.operation] = preset.constant;
      syncControls();
      update(currentValues(), true);
    }

    // The text last committed, so Enter followed by the browser's own change event announces only once.
    // 最近一次确认的文字，避免按 Enter 后浏览器再触发 change 时重复朗读。
    let committed = null;

    // While typing, a valid constant updates the table silently and an invalid one is only marked; the result or
    // the reason is announced once the entry is committed (Enter or leaving the box).
    // 输入过程中，有效的常数静默更新表格，无效的只做标记；确认输入（按 Enter 或离开输入框）时才朗读结果或错误原因。
    listen(constantInput, 'input', () => {
      committed = null;
      const parsed = parseConstant(constantInput.value, state.operation);
      if (parsed.error) {
        constantInput.setAttribute('aria-invalid', 'true');
        return;
      }
      constantInput.removeAttribute('aria-invalid');
      status.clear();
      state.constants[state.operation] = parsed.value;
      update(currentValues(), false);
    });

    function commitConstant() {
      if (constantInput.value === committed) return;
      committed = constantInput.value;
      const parsed = parseConstant(constantInput.value, state.operation);
      if (parsed.error) {
        constantInput.setAttribute('aria-invalid', 'true');
        status.show(parsed.error, 'error');
        return;
      }
      if (latest) status.show(transformMessage(latest, model.unit));
    }

    listen(constantInput, 'change', commitConstant);
    listen(constantInput, 'keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitConstant();
    });

    syncControls();
    return { panel, render: (values) => update(values, false) };
  }

  function currentValues() {
    return current.swap ? current.swap.values : state.base;
  }

  container.replaceChildren(root);
  render();

  return () => {
    listeners.abort();
    plot.stop();
  };
}
