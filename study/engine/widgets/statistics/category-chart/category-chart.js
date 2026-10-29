/**
 * Widget "category-chart": the distribution of one categorical variable (STA220 Module 2) as a frequency
 * distribution table (frequency, relative frequency, percentage), a bar chart of counts or percentages and a pie
 * chart with percent labels. Choosing a category in the table, or clicking its bar or slice, works out its proportion
 * and percentage step by step and highlights it in the table and in both graphs.
 * 组件“category-chart”：用频数分布表（频数、相对频数、百分比）、可在频数与百分比之间切换的条形图，以及标有百分比的饼图，
 * 展示一个分类变量（STA220 第 2 单元）的分布。在表格里选一个类别（或点它的柱子、扇形），会一步一步算出它的比例和百分比，
 * 并在表格和两张图里同时标出。
 *
 * Config: { title: Bi, variable: Bi, categories: [{ label: Bi, count }], display: "bar" | "pie" | "both" }
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biStack, biTitle } from '../../../core/text/bilingual.js';
import { segmented } from '../../../components/controls/segmented.js';
import {
  formulaLine, liveRegion, outsideNote, subheading, teachPair, uniqueId, widgetFrame,
} from '../../evaluation/shared/eval-ui.js';
import { biLabel, ensureSharedStyles } from '../../machine-learning/shared/ml-ui.js';
import { createPlotFrame } from '../../machine-learning/shared/plot-frame.js';
import { categoryBand, categoryExtent } from '../shared/chart-scales.js';
import { TIMES } from '../shared/stat-format.js';
import {
  PIE_VIEW, TEXT, barAxis, barChartLabel, barValues, categorySteps, chartFlags, distributionSummary,
  frequencyDistribution, normalizeCategoryChartConfig, pieChartLabel, pieLabels, pieNote, pieSlices, roundingCheck,
  selectionAnnouncement, sliceOffset, slicePath, valueLabelsFit,
} from './category-chart-logic.js';

// Share of each category slot left empty, so adjacent bars have spaces between them (M2 p.3, p.10).
// 每个类别位置中留空的比例，让相邻的柱子之间有空隙（第 2 单元第 3、10 页）。
const BAR_GAP = 0.3;
const VALUE_SIZE = 11;
const VALUE_OFFSET = 5;
const SLICE_PULL = 6;
const NUMBERED = 'category-chart__axis-labels--numbered';
// No-break spaces keep "f / n" and "× 100" whole in the table header, so a narrow column wraps only between them.
// 不换行空格让表头里的“f / n”和“× 100”各自保持完整，窄列只会在两者之间换行。
const NBSP = '\u00a0';
const RATIO = `f${NBSP}/${NBSP}n`;

const toneClass = (index) => `category-chart__tone--${index}`;
const swatch = (index) => h('span', { class: ['category-chart__swatch', toneClass(index)], 'aria-hidden': 'true' });
const nameOf = (label) => biLabel(label.zh, label.en);
const px = (value) => value.toFixed(1);

export async function mount(container, config, context) {
  await Promise.all([
    ensureStylesheet(new URL('../../evaluation/shared/eval-ui.css', import.meta.url)),
    ensureSharedStyles(),
    ensureStylesheet(new URL('./category-chart.css', import.meta.url)),
  ]);

  const model = normalizeCategoryChartConfig(config);
  const distribution = frequencyDistribution(model.categories);
  const { rows } = distribution;
  const charts = chartFlags(model.display);
  const state = { selected: 0, mode: 'count', disposed: false };
  const live = liveRegion();
  // Every listener added here is removed by the cleanup in one call. 这里添加的监听器都由清理函数一次移除。
  const listeners = new AbortController();
  const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: listeners.signal });

  const frame = widgetFrame({ className: 'category-chart', title: model.title, intro: TEXT.intro });

  /* ---------- Frequency distribution table 频数分布表 ---------- */

  const headCell = (symbol, zh, en) => h('th', { scope: 'col', class: 'category-chart__num' },
    h('span', { class: 'category-chart__symbol', lang: 'en' }, symbol),
    h('span', { class: 'category-chart__column' }, biLabel(zh, en)));

  const rowViews = rows.map((row) => {
    const pick = h('button', { type: 'button', class: 'category-chart__pick', 'aria-pressed': 'false' },
      swatch(row.index),
      h('span', { class: 'category-chart__pick-name' }, nameOf(row.label)));
    const element = h('tr', { class: 'category-chart__row' },
      h('th', { scope: 'row', class: 'category-chart__category' }, pick),
      h('td', { class: 'category-chart__num' }, row.countText),
      h('td', { class: 'category-chart__num' }, row.proportionText),
      h('td', { class: 'category-chart__num' }, row.percentText));
    // The button is the keyboard and screen-reader control; a pointer may click anywhere on the row.
    // 按钮供键盘与读屏使用；鼠标或手指点在这一行的任何位置都可以。
    listen(element, 'click', () => select(row.index));
    return { element, pick };
  });

  const table = h('table', { class: 'data-table category-chart__table' },
    h('caption', { class: 'visually-hidden' }, biLabel('频数分布表', 'Frequency distribution table'), ': ', nameOf(model.variable)),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', class: 'category-chart__category' }, nameOf(model.variable)),
      headCell('f', '频数', 'Frequency'),
      headCell(RATIO, '相对频数（比例）', 'Relative frequency (proportion)'),
      headCell(`${RATIO} ${TIMES}${NBSP}100`, '百分比', 'Percentage'))),
    h('tbody', {}, rowViews.map((view) => view.element)),
    h('tfoot', {}, h('tr', {},
      h('th', { scope: 'row', class: 'category-chart__category' }, biLabel('总数', 'Total')),
      h('td', { class: 'category-chart__num' }, distribution.totalText),
      h('td', { class: 'category-chart__num' }, distribution.proportionTotalText),
      h('td', { class: 'category-chart__num' }, distribution.percentTotalText))));
  const rounding = roundingCheck(distribution);

  /* ---------- Worked steps 计算步骤 ---------- */

  const selectedLine = h('p', { class: 'category-chart__selected' });
  const stepsList = h('ol', { class: 'category-chart__steps' });

  const step = (title, ...content) => h('li', { class: 'category-chart__step' },
    h('p', { class: 'category-chart__step-title' }, biTitle(title)),
    content);

  function renderSteps() {
    const steps = categorySteps(distribution, state.selected);
    replaceContent(selectedLine,
      h('span', { class: 'category-chart__selected-tag' }, biLabel('选中的类别', 'Chosen category')),
      h('span', { class: 'category-chart__selected-name' }, swatch(steps.index), nameOf(steps.label)));
    replaceContent(stepsList,
      step(TEXT.stepFrequency.title,
        teachPair(TEXT.stepFrequency.body), formulaLine(steps.frequency),
        teachPair(TEXT.stepTotal), formulaLine(steps.total)),
      step(TEXT.stepProportion.title,
        teachPair(TEXT.stepProportion.body), formulaLine(steps.proportion),
        steps.warning ? h('div', { class: 'callout callout--warn category-chart__note' }, teachPair(steps.warning)) : null),
      step(TEXT.stepPercent.title,
        teachPair(TEXT.stepPercent.body), steps.percent ? formulaLine(steps.percent) : null),
      step(TEXT.stepInterpret.title,
        biStack(steps.sentence, { role: 'gloss', className: 'category-chart__sentence' }),
        teachPair(TEXT.casesTip, { className: 'category-chart__tip' })));
  }

  /* ---------- Bar chart 条形图 ---------- */

  let barFrame = null;
  let stopBarObserver = () => {};
  let fittedWidth = 0;
  const barHost = h('div', { class: 'category-chart__bar-host' });
  const axisCells = rows.map((row) => h('span', { class: 'category-chart__axis-label' },
    h('span', { class: 'category-chart__axis-name' }, nameOf(row.label)),
    h('span', { class: 'category-chart__axis-number' }, String(row.index + 1))));
  // The names under the bars repeat what the chart's text alternative already says, so readers skip them.
  // 柱子下方的名称与图表的文字替代重复，读屏软件跳过它们。
  const axisLabels = h('div', {
    class: 'category-chart__axis-labels',
    'aria-hidden': 'true',
    style: { gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` },
  }, axisCells);
  const keyItems = rows.map((row) => h('li', { class: 'category-chart__key-item' },
    h('span', { class: 'category-chart__key-number' }, String(row.index + 1)),
    swatch(row.index),
    nameOf(row.label)));
  const key = h('ul', { class: 'category-chart__key', 'aria-hidden': 'true', hidden: true }, keyItems);
  const percentNote = h('div', { class: 'category-chart__mode-note', hidden: true }, teachPair(TEXT.barPercent));

  const barHeadingId = uniqueId('category-chart-bar');
  const barPanel = charts.bar ? h('section', { class: 'category-chart__chart', 'aria-labelledby': barHeadingId },
    h('div', { class: 'category-chart__chart-head' },
      subheading({ zh: '条形图', en: 'Bar chart' }, { id: barHeadingId }),
      segmented({
        options: [
          { value: 'count', label: biLabel('频数', 'Frequency') },
          { value: 'percent', label: biLabel('百分比', 'Percent') },
        ],
        value: state.mode,
        ariaLabel: '条形图的纵轴 Bar chart y-axis',
        size: 'sm',
        className: 'category-chart__modes',
        onChange: setMode,
      })),
    h('div', { class: 'category-chart__bar-figure' },
      barHost,
      axisLabels,
      h('p', { class: 'ml-plot__title ml-plot__title--x category-chart__axis-title' }, nameOf(model.variable)),
      key),
    teachPair(TEXT.barCount, { className: 'category-chart__chart-note' }),
    percentNote) : null;

  // The plot frame has a fixed y-axis, so switching between counts and percent builds a new one.
  // 坐标框的纵轴是固定的，所以在频数与百分比之间切换时重新建一个坐标框。
  function buildBarFrame() {
    stopBarObserver();
    barFrame = createPlotFrame({
      xExtent: categoryExtent(rows.length),
      yExtent: barAxis(distribution, state.mode),
      role: 'img',
      label: barChartLabel(distribution, model.variable, state.mode),
      aspect: 0.62,
      minHeight: 220,
      maxHeight: 360,
      yTitle: state.mode === 'percent' ? biLabel('百分比', 'Percent') : biLabel('频数', 'Frequency'),
    });
    listen(barFrame.svg, 'click', onChartClick);
    replaceContent(barHost, barFrame.element);
    // A new axis can move the plot's left edge, so the names under the bars are fitted again.
    // 换了纵轴，绘图区的左边缘可能移动，所以柱子下方的名称要重新对齐。
    fittedWidth = 0;
    stopBarObserver = barFrame.observe(renderBars);
    renderBars();
  }

  function renderBars() {
    if (!barFrame) return;
    const geometry = barFrame.layout();
    const { plot } = geometry;
    const bars = barValues(distribution, state.mode);
    const slot = (plot.right - plot.left) / rows.length;
    const labelEvery = valueLabelsFit(bars, slot, VALUE_SIZE);
    const base = geometry.y(0);
    replaceContent(barFrame.layers.regions, bars.map((bar) => s('rect', {
      class: 'category-chart__hit',
      'data-index': String(bar.index),
      x: px(geometry.x(bar.index)),
      y: px(plot.top),
      width: px(slot),
      height: px(plot.bottom - plot.top),
    })));
    replaceContent(barFrame.layers.marks, bars.map((bar) => {
      const band = categoryBand(bar.index, { padding: BAR_GAP });
      const left = geometry.x(band.start);
      const top = geometry.y(bar.value);
      return s('rect', {
        class: ['category-chart__bar', toneClass(bar.index), bar.index === state.selected ? 'is-selected' : null],
        'data-index': String(bar.index),
        x: px(left),
        y: px(top),
        width: px(geometry.x(band.end) - left),
        height: px(Math.max(0, base - top)),
      });
    }));
    replaceContent(barFrame.layers.overlay, bars.map((bar) => {
      const chosen = bar.index === state.selected;
      if (!labelEvery && !chosen) return null;
      const top = geometry.y(bar.value);
      // Without room above a bar its label goes just inside the top. 柱子上方没有空间时，标签写在柱顶内侧。
      const inside = top - plot.top < VALUE_SIZE + VALUE_OFFSET;
      return s('text', {
        class: ['category-chart__value', chosen ? 'is-selected' : null],
        'data-index': String(bar.index),
        x: px(geometry.x(categoryBand(bar.index).center)),
        y: px(inside ? top + VALUE_SIZE + VALUE_OFFSET : top - VALUE_OFFSET),
        'text-anchor': 'middle',
      }, bar.text);
    }));
    if (geometry.width !== fittedWidth) fitAxisLabels(geometry);
    axisCells.forEach((cell, index) => cell.classList.toggle('is-selected', index === state.selected));
    keyItems.forEach((item, index) => item.classList.toggle('is-selected', index === state.selected));
  }

  // Names stay under their bars while every one fits its slot; otherwise the bars are numbered and a key lists the
  // names. This runs before the browser paints, so the switch never flickers.
  // 每个名称都放得下时，名称直接写在柱子下方；否则改为编号，并在下方列出编号对应的名称。在浏览器绘制之前完成，切换不会闪烁。
  function fitAxisLabels(geometry) {
    fittedWidth = geometry.width;
    axisLabels.style.paddingLeft = `${geometry.plot.left}px`;
    axisLabels.style.paddingRight = `${geometry.width - geometry.plot.right}px`;
    axisLabels.classList.remove(NUMBERED);
    const crowded = axisLabels.clientWidth > 0 && axisCells.some((cell) => (
      cell.scrollWidth > cell.clientWidth + 1 || cell.scrollHeight > cell.clientHeight + 1));
    axisLabels.classList.toggle(NUMBERED, crowded);
    key.hidden = !crowded;
  }

  // The segmented control keeps its own click listener, so a late click after the cleanup is ignored here.
  // 分段控件自带的点击监听无法统一移除，所以清理之后的点击在这里被忽略。
  function setMode(mode) {
    if (state.disposed || mode === state.mode) return;
    state.mode = mode;
    percentNote.hidden = mode !== 'percent';
    buildBarFrame();
    live.announce(mode === 'percent' ? '条形图纵轴：百分比 Bar chart y-axis: Percent' : '条形图纵轴：频数 Bar chart y-axis: Frequency');
  }

  /* ---------- Pie chart 饼图 ---------- */

  const sliceViews = new Map();
  const legendItems = rows.map((row) => h('li', { class: 'category-chart__legend-item' },
    swatch(row.index),
    h('span', { class: 'category-chart__legend-name' }, nameOf(row.label)),
    h('span', { class: 'category-chart__legend-value' }, `${row.countText} (${row.percentText})`)));
  const angleLine = h('div', { class: 'category-chart__angle' });

  const pieText = (label) => s('text', {
    class: 'category-chart__pie-label',
    'data-index': String(label.index),
    x: label.x,
    y: label.y,
    dy: '0.35em',
    'text-anchor': label.anchor,
  }, label.text);

  function buildPie() {
    if (!distribution.hasTotal) return h('div', { class: 'callout callout--info category-chart__note' }, teachPair(TEXT.pieEmpty));
    const view = PIE_VIEW;
    const labels = pieLabels(distribution, view);
    const insideLabels = new Map(labels.filter((label) => label.inside).map((label) => [label.index, label]));
    const groups = pieSlices(distribution).map((slice) => {
      const path = slicePath(slice, view);
      const shape = path
        ? s('path', { class: 'category-chart__slice', d: path })
        : s('circle', { class: 'category-chart__slice', cx: view.cx, cy: view.cy, r: view.r });
      const label = insideLabels.get(slice.index);
      const group = s('g', { class: ['category-chart__slice-group', toneClass(slice.index)], 'data-index': String(slice.index) },
        shape,
        label ? pieText(label) : null);
      sliceViews.set(slice.index, { group, slice });
      return group;
    });
    const outside = labels.filter((label) => !label.inside).map((label) => [
      s('polyline', { class: 'category-chart__leader', points: label.leader.map((point) => point.join(',')).join(' ') }),
      pieText(label),
    ]);
    const svg = s('svg', {
      class: 'category-chart__pie',
      viewBox: `0 0 ${view.width} ${view.height}`,
      role: 'img',
      'aria-label': pieChartLabel(distribution, model.variable),
    }, s('g', {}, groups), s('g', {}, outside));
    listen(svg, 'click', onChartClick);
    return svg;
  }

  const pieHeadingId = uniqueId('category-chart-pie');
  const piePanel = charts.pie ? h('section', { class: 'category-chart__chart', 'aria-labelledby': pieHeadingId },
    h('div', { class: 'category-chart__chart-head' },
      subheading({ zh: '饼图', en: 'Pie chart' }, { id: pieHeadingId })),
    h('div', { class: 'category-chart__pie-figure' }, buildPie()),
    h('ul', { class: 'category-chart__legend' }, legendItems),
    teachPair(pieNote(distribution), { className: 'category-chart__chart-note' }),
    distribution.hasTotal ? angleLine : null,
    distribution.hasTotal ? outsideNote(TEXT.pieAngle) : null) : null;

  function syncSlices() {
    for (const [index, view] of sliceViews) {
      const chosen = index === state.selected;
      view.group.classList.toggle('is-selected', chosen);
      if (!chosen) {
        view.group.removeAttribute('transform');
        continue;
      }
      const { dx, dy } = sliceOffset(view.slice, SLICE_PULL);
      view.group.setAttribute('transform', `translate(${dx} ${dy})`);
      // Drawn last, so the chosen slice's outline is not hidden under its neighbours.
      // 最后绘制，选中扇形的轮廓不会被相邻的扇形遮住。
      view.group.parentNode?.append(view.group);
    }
  }

  function renderAngle() {
    const steps = categorySteps(distribution, state.selected);
    replaceContent(angleLine, steps.angle
      ? [h('p', { class: 'category-chart__angle-title' }, biLabel('选中扇形的角度', 'Angle of the chosen slice')), formulaLine(steps.angle)]
      : null);
  }

  /* ---------- Choosing a category 选择类别 ---------- */

  function onChartClick(event) {
    const target = event.target instanceof Element ? event.target.closest('[data-index]') : null;
    if (target) select(Number(target.getAttribute('data-index')));
  }

  function select(index, { announce = true } = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) return;
    state.selected = index;
    rowViews.forEach((view, position) => {
      view.element.classList.toggle('is-selected', position === index);
      view.pick.setAttribute('aria-pressed', String(position === index));
    });
    legendItems.forEach((item, position) => item.classList.toggle('is-selected', position === index));
    syncSlices();
    renderBars();
    renderSteps();
    renderAngle();
    if (announce) live.announce(selectionAnnouncement(distribution, index));
  }

  /* ---------- Assembly 组装 ---------- */

  const summary = distributionSummary(distribution);
  const tableId = uniqueId('category-chart-table');
  const stepsId = uniqueId('category-chart-steps');
  const notesId = uniqueId('category-chart-notes');

  replaceContent(frame.body,
    model.usedDefault ? h('div', { class: 'callout callout--warn category-chart__note' }, teachPair(TEXT.fallback)) : null,
    h('section', { class: 'category-chart__section', 'aria-labelledby': tableId },
      subheading({ zh: '频数分布表', en: 'Frequency distribution table' }, { id: tableId }),
      teachPair(TEXT.pickHint, { className: 'category-chart__hint' }),
      h('div', { class: 'table-scroll category-chart__table-wrap' }, table),
      rounding ? h('div', { class: 'callout callout--info category-chart__note' }, teachPair(rounding)) : null),
    h('section', { class: 'category-chart__section', 'aria-labelledby': stepsId },
      subheading({ zh: '一步一步算', en: 'Step by step' }, { id: stepsId }),
      selectedLine,
      stepsList),
    h('div', { class: ['category-chart__charts', barPanel && piePanel ? 'category-chart__charts--both' : null] },
      barPanel,
      piePanel),
    h('div', { class: 'callout callout--tip category-chart__summary' },
      h('span', { class: 'callout__label' }, biLabel('读图', 'Interpret the graph')),
      biStack(summary, { role: 'gloss', className: 'category-chart__summary-text' })),
    h('section', { class: 'category-chart__section', 'aria-labelledby': notesId },
      subheading(TEXT.notesTitle, { id: notesId }),
      h('ul', { class: 'category-chart__notes' }, TEXT.notes.map((note) => h('li', {}, teachPair(note))))),
    live.element);
  replaceContent(container, frame.root);

  // The bar chart measures its labels, so it is built once the widget is on the page.
  // 条形图需要测量标签宽度，所以等组件放到页面上以后再建。
  if (charts.bar) buildBarFrame();
  select(0, { announce: false });

  return () => {
    state.disposed = true;
    listeners.abort();
    stopBarObserver();
  };
}
