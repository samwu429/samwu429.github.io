/**
 * Widget "histogram" (STA220 Module 3): one quantitative variable drawn as a histogram whose bin width, start
 * and boundary rule can be changed, with the frequency table, mean and median markers, percentages read from
 * the bars, and the dotplot and stem-and-leaf views of the same data. Every number and sentence comes from
 * histogram-logic.js; this module only builds and updates the DOM.
 * 组件“直方图”（STA220 第 3 单元）：把一个定量变量画成直方图，可以改组距、起点和区间规则；配有频数表、平均数与中位数标记、
 * 从柱子读百分比，以及同一组数据的点图和茎叶图。所有数字和句子都来自 histogram-logic.js，本模块只负责搭建和更新 DOM。
 *
 * Config (content-spec 5.4): { title, variable, unit, data, binWidth, start, closed, views, leafUnit }.
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biStack, biTitle, uiText } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { segmented, setSegmentedValue } from '../../../components/controls/segmented.js';
import { loadTabStripStyles, tabStrip } from '../../../components/controls/tab-strip.js';
import { clamp, decimalsOf, niceExtent } from '../../machine-learning/shared/ml-math.js';
import { biLabel, ensureSharedStyles, legendIcon, teachPair } from '../../machine-learning/shared/ml-ui.js';
import { createPlotFrame } from '../../machine-learning/shared/plot-frame.js';
import { countExtent } from '../shared/chart-scales.js';
import { formatTrim } from '../shared/stat-format.js';
import {
  DATA_LIMITS, MAX_DISPLAY_BINS, READING_RELATIONS, binDetail, binFacts, binWidthOptions, centreSummary,
  centreTexts, cutOptions, dotplotStacks, dotplotText, edgeDigits, frequencyRows, histogramAltText,
  histogramLayout, layoutAnnouncement, leafUnitOptions, normalizeHistogramConfig, readFromBins, readableRelations,
  readingText, relationWords, sameValue, startOptions, stemAnnouncement, stemDisplay, stemText, summaryLabels,
} from './histogram-logic.js';

// Average glyph width in pixels of the 11 px edge and count numbers, for thinning labels that would collide.
// 11 px 边界数字与频数数字的平均字宽（像素），用来在会重叠时隔几个显示一个。
const TICK_CHAR_PX = 7;
// Dot radius limits of the dotplot in pixels. 点图圆点半径的上下限（像素）。
const DOT_RADIUS = Object.freeze({ min: 1.5, max: 7 });

const VIEW_LABELS = Object.freeze({
  histogram: { zh: '直方图', en: 'Histogram' },
  dotplot: { zh: '点图', en: 'Dotplot' },
  stemleaf: { zh: '茎叶图', en: 'Stem-and-leaf' },
});

const TEXT = Object.freeze({
  intro: {
    zh: '直方图（histogram）把数值切成一样宽的组（bin），再数一数每组有多少个个案（case）：柱子越高，那一段的数据越多。改一改组距和起点，看同一组数据画出来的样子怎么变；点一根柱子，看它里面有哪些值。',
    en: 'A histogram slices the values into bins of equal width and counts the cases in each bin. Change the bin width and the start to see how the picture of the same data changes; select a bar to see the values inside it.',
  },
  width: {
    zh: '组数“不要太少，也不要太多”，通常 5 到 30 组。试试最小和最大的组距：柱子太多会出现很多缺口，太少会把形状藏起来。',
    en: 'Not too few bins and not too many, usually 5 to 30. Try the smallest and the largest width: too many bars leave gaps everywhere, too few hide the shape.',
  },
  closed: {
    zh: '(a, b] 表示“多于 a、最多 b”，是 R 的 hist() 默认的分组，课件用的就是它；[a, b) 表示“至少 a、少于 b”。',
    en: '(a, b] means more than a and at most b, the default of R\'s hist() used on the slides; [a, b) means at least a and less than b.',
  },
  select: {
    zh: '点一根柱子（或者按 Tab 进入柱子，再用方向键），下面会说出这一组的区间和里面的值。',
    en: 'Select a bar (or Tab to the bars and use the arrow keys) to see its interval and the values inside it.',
  },
  reading: {
    zh: '课件第 13-20 页的问题：百分之多少的个案“最多 200”“多于 300”“至少 300”？选一个条件和分界点，看能不能直接从柱子读出来。',
    en: 'Questions like Module 3, p.13-20: what percentage of the cases are at most 200, more than 300, at least 300? Choose a condition and a cut point and see whether the bars can answer it.',
  },
  stem: {
    zh: '茎叶图（stem-and-leaf display）像一张横过来的直方图，却保留了每一个原始值：竖线左边是茎（stem），右边是叶（leaf，最后一位数字）。',
    en: 'A stem-and-leaf display is like a histogram on its side that keeps every raw value: the stem is left of the bar, the leaf (the last digit) right of it.',
  },
  sort: {
    zh: '先把数据从小到大排好，再按位置找中位数。',
    en: 'Sort the data from smallest to largest, then find the median by its position.',
  },
  shapeTip: {
    zh: '选择题里形状常用这五个选项：Bell-shaped and symmetric、Normal、Symmetric but not bell-shaped、Skewed to the right、Skewed to the left。偏向哪边，看较长的尾巴在哪边。',
    en: 'Multiple-choice shape questions often use these five options: Bell-shaped and symmetric, Normal, Symmetric but not bell-shaped, Skewed to the right, Skewed to the left. The skew is named after the side of the longer tail.',
  },
});

// The course's shape words (Module 3, p.10-12), in our own words. 课程里描述形状的词（第 3 单元第 10-12 页），用自己的话解释。
const SHAPE_WORDS = Object.freeze([
  { zh: '单峰（unimodal）：只有一个峰，也就是只有一段最高。', en: 'Unimodal: one peak.' },
  { zh: '双峰（bimodal）：有两个峰，常常说明数据里混着两组（第 12 页：低糖和高糖的麦片）。', en: 'Bimodal: two peaks, often two groups mixed in the data (p.12: low-sugar and high-sugar cereals).' },
  { zh: '多峰（multimodal）：三个或更多的峰。', en: 'Multimodal: three or more peaks.' },
  { zh: '均匀（uniform）：没有明显的峰，所有柱子差不多一样高。', en: 'Uniform: no clear peak; all the bars are about the same height.' },
  { zh: '对称（symmetric）：沿中间对折，左右两边差不多能重合。', en: 'Symmetric: fold the graph along the middle and the two sides match closely.' },
  { zh: '右偏（skewed to the right）：右边的尾巴更长，大部分数据在左边。', en: 'Skewed to the right: the longer tail is on the right; most values are on the left.' },
  { zh: '左偏（skewed to the left）：左边的尾巴更长，大部分数据在右边。', en: 'Skewed to the left: the longer tail is on the left; most values are on the right.' },
]);

let mountCount = 0;

const px = (value) => value.toFixed(1);
const numberLabel = (value) => formatTrim(value, decimalsOf(value));
const pair = (value, className) => teachPair(value.zh, value.en, className);

/**
 * A formula or worked step in monospace that wraps instead of overflowing. Its words and units are English
 * ("ȳ = 251 kcal"), so it carries lang="en" and screen readers use an English voice on the zh-CN page.
 * 等宽字体的算式，会换行而不撑破布局。其中的单词和单位是英文（“ȳ = 251 kcal”），所以标上 lang="en"，
 * 读屏软件在 zh-CN 页面里也会用英文发音。
 */
function math(text, className) {
  return h('span', { class: ['histogram__math', className], lang: 'en' }, text);
}

/**
 * "考试这样写": an English sentence to write on the test, with its Chinese gloss below. `body` may be a live
 * region that receives the sentence later.
 * “考试这样写”：考试要写的英文句子，下面是中文释义。body 可以是之后才放入句子的播报区域。
 */
function examSentence(value, body = h('div', {})) {
  if (value) replaceContent(body, biStack(value));
  return h('div', { class: 'histogram__exam' },
    h('p', { class: 'histogram__tag' }, biLabel('考试这样写', 'Write it like this')),
    body);
}

/**
 * Renders the widget into `container` and returns a cleanup function that stops the resize observers.
 * `context` is the lesson context every widget receives; this widget needs nothing from it.
 * 把组件渲染进 container，返回一个停止尺寸监听的清理函数。context 是每个组件都会收到的课程上下文，本组件用不到。
 */
export async function mount(container, config, context) {
  await Promise.all([
    ensureStylesheet(new URL('./histogram.css', import.meta.url)),
    ensureSharedStyles(),
    loadTabStripStyles(),
  ]);
  mountCount += 1;
  const uid = `histogram-${mountCount}`;

  const model = normalizeHistogramConfig(config);
  const { data, unit } = model;
  const summary = centreSummary(data);
  const labels = summaryLabels(summary, unit);
  const state = {
    width: model.binWidth,
    anchor: model.start,
    closed: model.closed,
    selected: null,
    showMean: true,
    showMedian: true,
    // The first question is one the bars can answer, like "at most 200" on M3 p.14.
    // 第一个问题是柱子能回答的，就像第 3 单元第 14 页的“最多 200”。
    relation: readableRelations(model.closed)[0],
    cut: null,
    leafUnit: model.leafUnit,
    split: model.split,
  };
  let layout = histogramLayout(data, { width: state.width, start: state.anchor, closed: state.closed });
  const stops = [];

  /* ---------- Shared pieces 共用部分 ---------- */

  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let liveToggle = false;
  // A non-breaking space toggled at the end makes a repeated message be announced again.
  // 末尾交替添加不换行空格，使相同的消息也会再次播报。
  function announce(value) {
    liveToggle = !liveToggle;
    live.textContent = `${value.zh} ${value.en}${liveToggle ? '\u00a0' : ''}`;
  }

  // uiText marks the Latin part of the unit lang="en" ("(kcal)"); a unit such as "$" or "%" has nothing to mark.
  // uiText 把单位里的拉丁字母部分标为 lang="en"（“(kcal)”）；“$”“%”这样的单位没有需要标注的部分。
  const axisTitle = () => [
    biLabel(model.variable.zh, model.variable.en),
    unit ? h('span', { class: 'histogram__unit' }, uiText(`(${unit})`)) : null,
  ];

  // Mean and median markers are shared by the histogram and the dotplot; each view has its own checkboxes,
  // kept in step. The legend under each plot names the lines (colour and dash), so no text sits inside the plot
  // where it could cover the counts above the bars.
  // 平均数和中位数标记由直方图和点图共用；每个视图有自己的复选框，彼此保持同步。图下方的图例说明每条线（颜色和虚实），
  // 所以图里不放文字，以免盖住柱子上方的频数。
  const markerBoxes = { mean: [], median: [] };
  const redrawers = [];

  function activeMarkers() {
    const markers = [];
    if (state.showMean) markers.push({ kind: 'mean', value: summary.mean });
    if (state.showMedian) markers.push({ kind: 'median', value: summary.median });
    return markers;
  }

  function setMarker(kind, shown) {
    if (kind === 'mean') state.showMean = shown;
    else state.showMedian = shown;
    for (const box of markerBoxes[kind]) box.checked = shown;
    for (const redraw of redrawers) redraw();
  }

  function markerToggles() {
    const toggle = (kind, zh, en, text) => {
      const box = h('input', {
        type: 'checkbox',
        checked: kind === 'mean' ? state.showMean : state.showMedian,
        onchange: () => setMarker(kind, box.checked),
      });
      markerBoxes[kind].push(box);
      return h('label', { class: 'histogram__toggle' },
        box,
        legendIcon(() => s('line', { class: `histogram__marker histogram__marker--${kind}`, x1: 10, y1: 1, x2: 10, y2: 19 }), 'histogram__swatch'),
        h('span', { class: 'histogram__toggle-text' }, biLabel(zh, en), ' ', math(text)));
    };
    return h('div', { class: 'histogram__legend', role: 'group', 'aria-label': '在图上画出的标记线 Lines drawn on the plot' },
      toggle('mean', '平均数', 'Mean', labels.mean),
      toggle('median', '中位数', 'Median', labels.median));
  }

  function markerLines({ x, plot }) {
    return activeMarkers().map((marker) => s('line', {
      class: `histogram__marker histogram__marker--${marker.kind}`,
      x1: px(x(marker.value)),
      x2: px(x(marker.value)),
      y1: plot.top,
      y2: plot.bottom,
    }));
  }

  /* ---------- Histogram view 直方图视图 ---------- */

  function histogramView() {
    const widthChoices = binWidthOptions(data, model.binWidth, { start: model.start, closed: model.closed });
    const widthLabelId = `${uid}-width`;
    const widthControl = segmented({
      options: widthChoices.map((width) => ({ value: String(width), label: numberLabel(width) })),
      value: String(state.width),
      size: 'sm',
      className: 'histogram__segmented',
      onChange: (value) => {
        state.width = Number(value);
        relayout();
      },
    });
    widthControl.setAttribute('aria-labelledby', widthLabelId);

    const startId = `${uid}-start`;
    const startSelect = h('select', {
      id: startId,
      class: 'select histogram__select',
      onchange: () => {
        state.anchor = Number(startSelect.value);
        relayout();
      },
    });

    const closedLabelId = `${uid}-closed`;
    const closedControl = segmented({
      options: [
        { value: 'right', label: '(a, b]', title: '右闭 right-closed' },
        { value: 'left', label: '[a, b)', title: '左闭 left-closed' },
      ],
      value: state.closed,
      size: 'sm',
      className: 'histogram__segmented',
      onChange: (value) => {
        state.closed = value;
        relayout();
      },
    });
    closedControl.setAttribute('aria-labelledby', closedLabelId);

    const resetButton = button({
      label: biLabel('复原', 'Reset'),
      iconName: 'refresh',
      variant: 'ghost',
      size: 'sm',
      onClick: () => {
        state.width = model.binWidth;
        state.anchor = model.start;
        state.closed = model.closed;
        setSegmentedValue(widthControl, String(state.width));
        setSegmentedValue(closedControl, state.closed);
        relayout();
      },
    });

    const controls = h('div', { class: 'histogram__controls' },
      h('div', { class: 'histogram__control' },
        h('span', { class: 'histogram__control-label', id: widthLabelId }, biLabel('组距', 'Bin width')),
        widthControl),
      h('div', { class: 'histogram__control' },
        h('label', { class: 'histogram__control-label', for: startId }, biLabel('第一组从哪里开始', 'First bin starts at')),
        startSelect),
      h('div', { class: 'histogram__control' },
        h('span', { class: 'histogram__control-label', id: closedLabelId }, biLabel('区间规则', 'Bins')),
        closedControl),
      resetButton);

    /* Figure 图 */
    const figureHost = h('div', { class: 'histogram__figure' });
    let frame = null;
    let binNodes = [];
    let stopObserving = () => {};
    stops.push(() => stopObserving());

    function binNode(bin) {
      const info = binDetail(bin, layout, { decimals: summary.decimals });
      const node = s('g', {
        class: 'histogram__bin',
        role: 'button',
        tabindex: '-1',
        'aria-pressed': 'false',
        'aria-label': `${info.interval}（${info.inequality}）：频数 frequency ${bin.count}`,
      },
      s('rect', { class: 'histogram__bin-hit' }),
      s('rect', { class: 'histogram__bin-ring' }));
      node.addEventListener('click', () => selectBin(state.selected === bin.index ? null : bin.index));
      node.addEventListener('focus', () => setRoving(bin.index));
      node.addEventListener('keydown', (event) => onBinKey(event, bin.index));
      return node;
    }

    function setRoving(index) {
      binNodes.forEach((node, nodeIndex) => node.setAttribute('tabindex', nodeIndex === index ? '0' : '-1'));
    }

    // Arrow keys move along the bars and show each one; Enter or Space toggles the selection; Escape clears it.
    // 方向键沿着柱子移动并显示每一根；Enter 或空格切换选中；Escape 取消选中。
    function onBinKey(event, index) {
      const last = binNodes.length - 1;
      const moves = {
        ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: last,
      };
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectBin(state.selected === index ? null : index);
      } else if (event.key === 'Escape' && state.selected !== null) {
        selectBin(null);
      } else if (Object.hasOwn(moves, event.key)) {
        event.preventDefault();
        const target = clamp(moves[event.key], 0, last);
        setRoving(target);
        binNodes[target].focus();
        selectBin(target);
      }
    }

    function rebuildFigure() {
      stopObserving();
      const alt = histogramAltText(layout, model.variable);
      frame = createPlotFrame({
        xExtent: { min: layout.edges[0], max: layout.edges[layout.edges.length - 1], step: layout.width, ticks: [] },
        // Half a count of headroom keeps the count printed above the tallest bar inside the picture.
        // 多留半个计数的空间，最高柱子上方的数字才不会跑出图外。
        yExtent: countExtent(layout.maxCount + 0.5),
        role: 'group',
        label: `${alt.zh} ${alt.en}`,
        aspect: 0.6,
        minHeight: 220,
        maxHeight: 360,
        xTitle: axisTitle(),
        yTitle: biLabel('频数', 'Frequency'),
      });
      binNodes = layout.bins.map(binNode);
      if (binNodes.length) binNodes[0].setAttribute('tabindex', '0');
      frame.layers.points.append(...binNodes);
      replaceContent(figureHost, frame.element);
      draw();
      stopObserving = frame.observe(draw);
    }

    function draw() {
      if (!frame) return;
      const geometry = frame.layout();
      const { x, y, plot } = geometry;
      const base = y(0);
      replaceContent(frame.layers.marks,
        layout.bins.map((bin) => (bin.count ? s('rect', {
          class: ['histogram__bar', state.selected === bin.index ? 'is-selected' : null],
          x: px(x(bin.lower)),
          y: px(y(bin.count)),
          width: px(x(bin.upper) - x(bin.lower)),
          height: px(base - y(bin.count)),
        }) : null)),
        markerLines(geometry));
      replaceContent(frame.layers.overlay, edgeLabels(geometry), countLabels(geometry));
      layout.bins.forEach((bin, index) => {
        const node = binNodes[index];
        const [hit, ring] = node.children;
        const left = x(bin.lower);
        const width = x(bin.upper) - left;
        const top = bin.count ? y(bin.count) : base - 12;
        setBox(hit, left, plot.top, width, plot.bottom - plot.top);
        setBox(ring, left + 1.5, top - 1.5, Math.max(0, width - 3), base - top + 1.5);
        node.classList.toggle('is-selected', state.selected === bin.index);
        node.setAttribute('aria-pressed', String(state.selected === bin.index));
      });
    }

    function setBox(rect, x, y, width, height) {
      rect.setAttribute('x', px(x));
      rect.setAttribute('y', px(y));
      rect.setAttribute('width', px(width));
      rect.setAttribute('height', px(height));
    }

    // Edge numbers under the bars, thinned out when they would collide on a narrow screen.
    // 柱子下面的边界数字；窄屏上会挤在一起时隔几个显示一个。
    function edgeLabels({ x, plot }) {
      const digits = edgeDigits(layout);
      const texts = layout.edges.map((edge) => formatTrim(edge, digits));
      const widths = texts.map((text) => TICK_CHAR_PX * text.length);
      const room = layout.edges.length > 1 ? x(layout.edges[1]) - x(layout.edges[0]) : Infinity;
      const every = Math.max(1, Math.ceil((Math.max(...widths) + 8) / room));
      const shown = layout.edges.map((_, index) => index % every === 0);
      // A last label that would be cut off is right-aligned; the label before it then gives way if they would touch.
      // 最后一个标签居中会被截掉时改为右对齐；这时如果和前一个标签碰到，前一个标签让位。
      const last = layout.edges.length - 1;
      const lastAt = x(layout.edges[last]);
      const alignEnd = shown[last] && lastAt + widths[last] / 2 > plot.right + 14;
      const previous = shown.lastIndexOf(true, last - 1);
      if (alignEnd && previous >= 0 && x(layout.edges[previous]) + widths[previous] / 2 + 6 > lastAt - widths[last]) {
        shown[previous] = false;
      }
      return layout.edges.map((edge, index) => {
        if (!shown[index]) return null;
        const at = x(edge);
        return [
          s('line', { class: 'histogram__tick', x1: px(at), x2: px(at), y1: plot.bottom, y2: plot.bottom + 5 }),
          s('text', {
            class: 'histogram__edge',
            x: px(at),
            y: plot.bottom + 17,
            'text-anchor': index === last && alignEnd ? 'end' : 'middle',
          }, texts[index]),
        ];
      });
    }

    // Counts above the bars like hist(labels = TRUE) on M3 p.14, with 0 over a gap, when they fit.
    // 像第 3 单元第 14 页的 hist(labels = TRUE) 一样在柱子上方写出频数，缺口上方写 0；放不下时不写。
    function countLabels({ x, y }) {
      const room = x(layout.edges[1]) - x(layout.edges[0]);
      if (room < TICK_CHAR_PX * String(layout.maxCount).length + 2) return null;
      return layout.bins.map((bin) => s('text', {
        class: ['histogram__count', bin.count ? null : 'is-zero'],
        x: px((x(bin.lower) + x(bin.upper)) / 2),
        y: px(y(bin.count) - 5),
        'text-anchor': 'middle',
      }, String(bin.count)));
    }

    /* Selected bar 选中的柱子 */
    const detail = h('div', { class: 'histogram__detail' });

    function renderDetail() {
      detail.classList.toggle('is-empty', state.selected === null);
      if (state.selected === null) {
        replaceContent(detail, pair(TEXT.select, 'histogram__hint'));
        return;
      }
      const info = binDetail(layout.bins[state.selected], layout, { decimals: summary.decimals });
      replaceContent(detail,
        h('p', { class: 'histogram__detail-head' },
          math(info.interval, 'histogram__detail-interval'), ' ', math(info.inequality)),
        teachPair(`这一组的值${info.meaning.zh}。`, `The values in this bin are ${info.meaning.en}.`),
        h('p', { class: 'histogram__detail-line' },
          h('span', { class: 'histogram__detail-label' }, biLabel('频数', 'Frequency')), ' ', math(info.frequency)),
        h('p', { class: 'histogram__detail-line' },
          h('span', { class: 'histogram__detail-label' }, biLabel('组里的值', 'Values')), ' ',
          info.values ? math(info.values) : biLabel('没有：这一组是缺口（gap）', 'none: this bin is a gap'),
          info.hidden ? [' ', biLabel(`另外还有 ${info.hidden} 个`, `and ${info.hidden} more`)] : null));
    }

    function selectBin(index) {
      state.selected = index;
      draw();
      rowNodes.forEach((row, rowIndex) => row.classList.toggle('is-selected', rowIndex === index));
      renderDetail();
    }

    /* Facts and frequency table 事实与频数表 */
    const facts = h('ul', { class: 'histogram__facts' });

    function renderFacts() {
      const { peak, gaps } = binFacts(layout);
      replaceContent(facts, h('li', {}, pair(peak)), h('li', {}, pair(gaps)));
    }

    const headCell = (zh, en) => h('th', { scope: 'col' }, biLabel(zh, en));
    const tableBody = h('tbody');
    const tableFoot = h('tfoot');
    let rowNodes = [];
    const table = h('table', { class: 'data-table histogram__table' },
      h('caption', { class: 'visually-hidden' }, '频数表 Frequency table'),
      h('thead', {}, h('tr', {},
        headCell('组（区间）', 'Bin'),
        headCell('频数', 'Frequency'),
        headCell('相对频数', 'Relative frequency'),
        headCell('百分比', 'Percent'),
        headCell('累积相对频数', 'Cumulative relative frequency'))),
      tableBody,
      tableFoot);

    function renderTable() {
      const { rows, total } = frequencyRows(layout);
      const cell = (text) => h('td', { class: 'histogram__num' }, text);
      rowNodes = rows.map((row) => h('tr', { class: [row.gap ? 'is-gap' : null, state.selected === row.index ? 'is-selected' : null] },
        h('th', { scope: 'row', class: 'histogram__num' }, row.interval),
        cell(row.count),
        cell(row.relative),
        cell(row.percent),
        cell(row.cumulative)));
      replaceContent(tableBody, rowNodes);
      replaceContent(tableFoot, h('tr', {},
        h('th', { scope: 'row' }, biLabel('合计', 'Total')),
        cell(total.count),
        cell(total.relative),
        cell(total.percent),
        h('td', {})));
    }

    /* Reading a percentage from the bars 从柱子读百分比 */
    const relationId = `${uid}-relation`;
    const cutId = `${uid}-cut`;
    const relationSelect = h('select', {
      id: relationId,
      class: 'select histogram__select',
      onchange: () => {
        state.relation = relationSelect.value;
        announceAnswer(renderReading());
      },
    }, READING_RELATIONS.map((relation) => {
      const words = relationWords(relation);
      return h('option', { value: relation, selected: relation === state.relation }, `${words.zh} ${words.en} (${words.symbol})`);
    }));
    const cutSelect = h('select', {
      id: cutId,
      class: 'select histogram__select',
      onchange: () => {
        state.cut = Number(cutSelect.value);
        announceAnswer(renderReading());
      },
    });
    const question = h('div', { class: 'histogram__question' });
    const steps = h('ol', { class: 'histogram__steps' });
    const warning = h('div', { class: 'histogram__warning', hidden: true });
    // A change of condition or cut point is announced in one sentence, the answer, not the whole working. The answer
    // box is not a live region of its own: a new bin width, start or rule rewrites it too, and that change already
    // has its own announcement (layoutAnnouncement), so it would otherwise be read twice.
    // 改变条件或分界点时只播报一句话（答案），而不是整个计算过程。答案框本身不是播报区域：改组距、起点或区间规则也会重写它，
    // 而这些改变已经有自己的播报（layoutAnnouncement），否则会读两遍。
    const answer = h('div', {});
    const answerBox = examSentence(null, answer);

    function announceAnswer(text) {
      if (text) announce(text.answer);
    }

    // The cut point survives a new layout when it is still an edge between two bins; otherwise the first edge is used.
    // 新的分组里分界点仍是两组之间的边界时保留它，否则改用第一条边界。
    function syncCuts() {
      const cuts = cutOptions(layout);
      state.cut = cuts.find((cut) => sameValue(cut, state.cut)) ?? cuts[0] ?? null;
      const digits = edgeDigits(layout);
      replaceContent(cutSelect, cuts.map((cut) => h('option', { value: String(cut), selected: sameValue(cut, state.cut) }, formatTrim(cut, digits))));
      if (state.cut !== null) cutSelect.value = String(state.cut);
      cutSelect.disabled = !cuts.length;
      relationSelect.disabled = !cuts.length;
    }

    // Returns the texts shown (readingText), or null when there is no edge to cut at.
    // 返回显示的文字（readingText）；没有可以切开的边界时返回 null。
    function renderReading() {
      const reading = state.cut === null ? null : readFromBins(layout, data, { relation: state.relation, cut: state.cut });
      answerBox.hidden = !reading;
      if (!reading) {
        replaceContent(question, teachPair('现在只有一组，没有可以切开的边界。换一个更小的组距试试。', 'There is only one bin, so there is no edge to cut at. Try a smaller bin width.'));
        replaceContent(steps);
        replaceContent(answer);
        warning.hidden = true;
        return null;
      }
      const text = readingText(reading, layout, { unit });
      replaceContent(question, biStack(text.question));
      replaceContent(steps, text.steps.map((step) => h('li', { class: 'histogram__step' }, pair(step))));
      warning.hidden = !text.warning;
      replaceContent(warning, text.warning ? pair(text.warning) : null);
      replaceContent(answer, biStack(text.answer));
      return text;
    }

    const reading = h('section', { class: 'histogram__reading', 'aria-labelledby': `${uid}-reading-title` },
      h('h4', { class: 'histogram__heading', id: `${uid}-reading-title` }, biLabel('从柱子读百分比', 'Read a percentage from the bars')),
      pair(TEXT.reading, 'histogram__hint'),
      h('div', { class: 'histogram__controls' },
        h('div', { class: 'histogram__control' },
          h('label', { class: 'histogram__control-label', for: relationId }, biLabel('条件', 'Condition')),
          relationSelect),
        h('div', { class: 'histogram__control' },
          h('label', { class: 'histogram__control-label', for: cutId }, biLabel('分界点', 'Cut point')),
          cutSelect)),
      question,
      steps,
      warning,
      answerBox);

    /* Rebuilding after a change 改变后重新搭建 */
    function syncStarts() {
      const starts = startOptions(data, state.width, state.anchor);
      const digits = Math.max(0, ...starts.map((value) => decimalsOf(value)));
      replaceContent(startSelect, starts.map((value) => h('option', { value: String(value), selected: sameValue(value, layout.start) }, formatTrim(value, digits))));
      const current = starts.find((value) => sameValue(value, layout.start));
      if (current !== undefined) startSelect.value = String(current);
      startSelect.disabled = starts.length < 2;
    }

    function relayout(announceChange = true) {
      layout = histogramLayout(data, { width: state.width, start: state.anchor, closed: state.closed });
      state.selected = null;
      syncStarts();
      rebuildFigure();
      renderTable();
      renderFacts();
      renderDetail();
      syncCuts();
      renderReading();
      if (announceChange) announce(layoutAnnouncement(layout));
    }

    redrawers.push(draw);
    relayout(false);

    return h('div', { class: 'histogram__view' },
      pair(TEXT.width, 'histogram__hint'),
      controls,
      pair(TEXT.closed, 'histogram__hint'),
      h('div', { class: 'histogram__figure-box' }, figureHost, markerToggles()),
      detail,
      facts,
      h('section', { class: 'histogram__block', 'aria-labelledby': `${uid}-table-title` },
        h('h4', { class: 'histogram__heading', id: `${uid}-table-title` }, biLabel('频数表', 'Frequency table')),
        h('div', { class: 'table-scroll histogram__table-wrap' }, table)),
      reading);
  }

  /* ---------- Dotplot view 点图视图 ---------- */

  function dotplotView() {
    const dots = dotplotStacks(data);
    const text = dotplotText(dots, model.variable);
    const xExtent = niceExtent(data, { anchorZero: false });
    const frame = createPlotFrame({
      xExtent,
      yExtent: countExtent(dots.maxCount + 0.5),
      label: `${text.alt.zh} ${text.alt.en}`,
      aspect: 0.5,
      minHeight: 200,
      maxHeight: 320,
      xTitle: axisTitle(),
      yTitle: biLabel('个数', 'Count'),
    });

    // Dots fill at most 90% of one count step and of one column, so neighbours never overlap.
    // 圆点最多占一格计数和一列宽度的 90%，相邻的点不会重叠。
    function draw() {
      const geometry = frame.layout();
      const { x, y } = geometry;
      const step = y(0) - y(1);
      const column = Number.isFinite(dots.width) ? Math.abs(x(xExtent.min + dots.width) - x(xExtent.min)) : Infinity;
      const radius = clamp(0.45 * Math.min(step, column), DOT_RADIUS.min, DOT_RADIUS.max);
      replaceContent(frame.layers.marks,
        dots.stacks.map((stack) => Array.from({ length: stack.count }, (_, level) => s('circle', {
          class: 'histogram__dot', cx: px(x(stack.value)), cy: px(y(level + 0.5)), r: radius.toFixed(2),
        }))),
        markerLines(geometry));
    }

    redrawers.push(draw);
    draw();
    stops.push(frame.observe(draw));

    const hiddenTable = h('table', { class: 'visually-hidden' },
      h('caption', {}, '点图的数据 Dotplot data'),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, dots.grouped ? '区间 Interval' : '数值 Value'),
        h('th', { scope: 'col' }, '点数 Dots'))),
      h('tbody', {}, text.rows.map((row) => h('tr', {}, h('th', { scope: 'row' }, row.label), h('td', {}, String(row.count))))));

    return h('div', { class: 'histogram__view' },
      h('div', { class: 'histogram__figure-box' }, frame.element, markerToggles()),
      pair(text.note, 'histogram__hint'),
      hiddenTable);
  }

  /* ---------- Stem-and-leaf view 茎叶图视图 ---------- */

  function stemView() {
    const leafChoices = leafUnitOptions(data, model.leafUnit);
    const leafLabelId = `${uid}-leaf`;
    const leafControl = leafChoices.length > 1 ? segmented({
      options: leafChoices.map((leafUnit) => ({ value: String(leafUnit), label: numberLabel(leafUnit) })),
      value: String(state.leafUnit),
      size: 'sm',
      className: 'histogram__segmented',
      onChange: (value) => {
        state.leafUnit = Number(value);
        renderStem(true);
      },
    }) : null;
    leafControl?.setAttribute('aria-labelledby', leafLabelId);
    const splitBox = h('input', {
      type: 'checkbox',
      checked: state.split,
      onchange: () => {
        state.split = splitBox.checked;
        renderStem(true);
      },
    });

    const note = h('p', { class: 'histogram__r-note', lang: 'en' });
    const body = h('tbody');
    const notes = h('div', { class: 'histogram__stem-notes' });
    const leafValue = h('span', { class: 'histogram__math' });

    function renderStem(announceChange) {
      const display = stemDisplay(data, { leafUnit: state.leafUnit, split: state.split });
      const text = stemText(display, { unit, decimals: summary.decimals });
      note.textContent = display.note;
      leafValue.textContent = numberLabel(display.leafUnit);
      replaceContent(body, display.lines.map((line) => h('tr', { class: line.count ? null : 'is-empty' },
        h('th', { scope: 'row', class: 'histogram__stem' }, line.label),
        h('td', { class: 'histogram__leaves' },
          h('span', { 'aria-hidden': 'true' }, line.leafText),
          h('span', { class: 'visually-hidden' }, line.count ? line.leaves.join(' ') : '没有叶 no leaves')),
        h('td', { class: 'histogram__stem-count' }, String(line.count)))));
      replaceContent(notes,
        text.key ? pair(text.key) : null,
        text.ends ? pair(text.ends) : null,
        text.rounded ? h('div', { class: 'histogram__warning' }, pair(text.rounded)) : null,
        text.tilt ? pair(text.tilt, 'histogram__hint') : null);
      if (announceChange) announce(stemAnnouncement(display));
    }

    renderStem(false);

    return h('div', { class: 'histogram__view' },
      pair(TEXT.stem, 'histogram__hint'),
      h('div', { class: 'histogram__controls' },
        h('div', { class: 'histogram__control' },
          h('span', { class: 'histogram__control-label', id: leafLabelId }, biLabel('叶的单位', 'Leaf unit')),
          leafControl ?? leafValue),
        h('label', { class: 'histogram__check' },
          splitBox,
          h('span', {}, biLabel('把每个茎拆成两行（叶 0-4 和 5-9）', 'Split each stem into two lines (leaves 0-4 and 5-9)')))),
      h('div', { class: 'histogram__stem-box' },
        note,
        h('div', { class: 'table-scroll histogram__stem-wrap' },
          h('table', { class: 'histogram__stem-table' },
            h('caption', { class: 'visually-hidden' }, '茎叶图 Stem-and-leaf display'),
            h('thead', {}, h('tr', {},
              h('th', { scope: 'col' }, biLabel('茎', 'Stem')),
              h('th', { scope: 'col' }, biLabel('叶', 'Leaf')),
              h('th', { scope: 'col' }, biLabel('个数', 'Count')))),
            body))),
      notes);
  }

  /* ---------- Centre panel 中心面板 ---------- */

  function centrePanel() {
    const texts = centreTexts(summary, { variable: model.variable, unit });
    return h('section', { class: 'histogram__centre', 'aria-labelledby': `${uid}-centre-title` },
      h('h4', { class: 'histogram__heading', id: `${uid}-centre-title` }, biLabel('中心：平均数和中位数', 'Centre: mean and median')),
      h('div', { class: 'histogram__centre-grid' },
        h('article', { class: 'histogram__card' },
          h('p', { class: 'histogram__card-title' }, biLabel('平均数', 'Mean')),
          h('p', { class: 'histogram__work' }, math(texts.meanWork)),
          examSentence(texts.meanSentence)),
        h('article', { class: 'histogram__card' },
          h('p', { class: 'histogram__card-title' }, biLabel('中位数', 'Median')),
          pair(TEXT.sort, 'histogram__hint'),
          h('p', { class: 'histogram__work' }, biLabel('位置', 'Position'), ' ', math(texts.medianPosition)),
          pair(texts.medianRule),
          examSentence(texts.medianSentence))),
      pair(texts.placeholderHint, 'histogram__hint'),
      h('div', { class: 'histogram__tip' }, pair(texts.hint), pair(texts.caution)),
      h('div', { class: 'histogram__describe' },
        h('p', { class: 'histogram__card-title' }, biLabel('描述分布：形状、中心、分散、离群值', 'Describe the distribution')),
        h('p', { class: 'histogram__describe-lead', lang: 'en' }, 'Based on the histogram of data:'),
        h('dl', { class: 'histogram__describe-list' }, texts.describe.map((line) => h('div', { class: 'histogram__describe-row' },
          h('dt', {}, biLabel(line.label.zh, line.label.en)),
          h('dd', {}, biStack(line.text)))))),
      h('details', { class: 'histogram__guide' },
        h('summary', { class: 'histogram__guide-summary' }, biLabel('描述形状的词', 'Words for the shape')),
        h('ul', { class: 'histogram__guide-list' }, SHAPE_WORDS.map((word) => h('li', {}, pair(word)))),
        pair(TEXT.shapeTip, 'histogram__hint')));
  }

  /* ---------- Assembly 组装 ---------- */

  const notices = [
    model.usedDefault && {
      zh: '配置里没有可用的数据，这里显示课件的例子：30 个 Tim Hortons 甜甜圈的热量（第 3 单元第 5 页）。',
      en: 'The config has no usable data, so the course example is shown: the calories of 30 Tim Hortons donuts (Module 3, p.5).',
    },
    model.truncated && {
      zh: `数据超过 ${DATA_LIMITS.max} 个，只用前 ${DATA_LIMITS.max} 个。`,
      en: `More than ${DATA_LIMITS.max} values were given; only the first ${DATA_LIMITS.max} are used.`,
    },
    model.widthAdjusted && {
      zh: `配置的组距会画出超过 ${MAX_DISPLAY_BINS} 根柱子或只有一根柱子，所以改用 R 的默认组距。`,
      en: `The configured bin width would draw more than ${MAX_DISPLAY_BINS} bars or a single bar, so R's default width is used.`,
    },
    model.leafUnitAdjusted && model.views.includes('stemleaf') && {
      zh: '配置的叶单位不是 10 的整数次幂（例如 0.1、1、10），或者放不下，所以改用默认的叶单位。',
      en: 'The configured leaf unit is not a power of ten (such as 0.1, 1 or 10) or does not fit, so the default leaf unit is used.',
    },
  ].filter(Boolean);

  // Values such as "ȳ = 251 kcal" mark their Latin part lang="en". 像“ȳ = 251 kcal”这样的值把拉丁字母部分标为 lang="en"。
  const stat = (zh, en, value) => h('div', { class: 'histogram__stat' },
    h('dt', { class: 'histogram__stat-label' }, biLabel(zh, en)),
    h('dd', { class: 'histogram__stat-value' }, uiText(value)));

  const builders = { histogram: histogramView, dotplot: dotplotView, stemleaf: stemView };
  const views = model.views.map((id) => ({ id, label: biLabel(VIEW_LABELS[id].zh, VIEW_LABELS[id].en), panel: builders[id]() }));
  const tabs = views.length > 1 ? tabStrip({
    tabs: views,
    selected: views[0].id,
    label: '图的种类 Views',
    idPrefix: uid,
    className: 'histogram__tabs',
  }) : null;

  const titleId = `${uid}-title`;
  const root = h('section', { class: 'histogram', 'aria-labelledby': titleId },
    h('header', { class: 'histogram__header' },
      h('p', { class: 'histogram__eyebrow' }, biLabel('互动演示', 'Interactive')),
      h('h3', { class: 'histogram__title', id: titleId }, biTitle(model.title)),
      pair(TEXT.intro, 'histogram__intro')),
    notices.length ? h('div', { class: 'histogram__notice' }, notices.map((notice) => pair(notice))) : null,
    h('dl', { class: 'histogram__stats' },
      stat('个案数', 'Cases', labels.n),
      stat('平均数', 'Mean', labels.mean),
      stat('中位数', 'Median', labels.median),
      stat('最小值', 'Minimum', labels.min),
      stat('最大值', 'Maximum', labels.max)),
    tabs ? tabs.element : null,
    views.map((view) => view.panel),
    centrePanel(),
    live);

  container.replaceChildren(root);
  // Drawing waits until the widget is in the page, where the plots can measure their real width.
  // 组件放进页面后再画一次，这时图才能量到真实宽度。
  for (const redraw of redrawers) redraw();

  return () => {
    for (const stop of stops) stop();
  };
}
