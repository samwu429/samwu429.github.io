/**
 * Widget "decision-boundary": the linear decision boundary w0 + w1x1 + w2x2 = 0 in a 2-D data space
 * (lecture 4, slides 43-47). The learner moves the line with sliders and watches the predicted regions,
 * the misclassified points, accuracy and classification error update live.
 * 组件“决策边界”：二维数据空间里的线性决策边界 w0 + w1x1 + w2x2 = 0（第 4 讲第 43-47 页）。
 * 学生用滑块移动直线，实时看到预测区域、分错的点、准确率与分类错误率的变化。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { badge } from '../../../components/badges/badge.js';
import { button } from '../../../components/controls/button.js';
import {
  accuracySummary, bestLinearSplit, boundaryExtent, boundarySegment, boundarySliderSpecs, classifyPoints,
  clipToHalfPlane, formatBoundaryEquation, formatFeatureVector, formatFraction, formatScoreWork, hasBoundaryLine,
  normalizeBoundaryConfig, rectPolygon,
} from './boundary-logic.js';
import { APPROX, MINUS, clamp, formatNonZero, formatPercent, roundTo } from '../shared/ml-math.js';
import {
  biLabel, biText, biValue, ensureSharedStyles, legendIcon, markerShape, mathText, teachPair,
} from '../shared/ml-ui.js';
import { paramSlider } from '../shared/param-slider.js';
import { createPlotFrame } from '../shared/plot-frame.js';

const SHAPES = ['circle', 'square', 'triangle', 'diamond'];
const TONES = ['a', 'b', 'c', 'd'];
const WEIGHTS = ['w0', 'w1', 'w2'];
const LESS_OR_EQUAL = '≤';

let mountCount = 0;

/** "≈ 85.7%" or "= 100%": "=" only when the percentage is exact to one decimal. 百分数精确时用“=”，否则用“≈”。 */
function percentWork(ratio) {
  const value = ratio * 100;
  return `${Math.abs(value - roundTo(value, 1)) < 1e-9 ? '=' : APPROX} ${formatPercent(ratio)}`;
}

export async function mount(container, config) {
  await Promise.all([
    ensureStylesheet(new URL('./decision-boundary.css', import.meta.url)),
    ensureSharedStyles(),
  ]);
  mountCount += 1;

  const model = normalizeBoundaryConfig(config);
  const extent = boundaryExtent(model.points);
  const specs = boundarySliderSpecs(model.boundary, extent.rect);
  const digits = { w0: specs.w0.digits, w1: specs.w1.digits, w2: specs.w2.digits };
  const classIndex = new Map(model.classes.map((item, index) => [item.id, index]));
  const styleOf = (cls) => {
    const index = classIndex.get(cls) ?? 0;
    return { shape: SHAPES[index % SHAPES.length], tone: TONES[index % TONES.length] };
  };
  const labelOf = (cls) => model.classes.find((item) => item.id === cls)?.label ?? { zh: '', en: String(cls) };
  // Arrow keys visit the points from left to right, so keyboard order follows the picture.
  // 方向键按从左到右的顺序访问各点，键盘顺序与图上位置一致。
  const navOrder = model.points.map((point) => point.index)
    .sort((a, b) => model.points[a].x - model.points[b].x || model.points[a].y - model.points[b].y);

  const state = { w: { ...model.boundary }, hovered: null, focused: null, selected: null, showBest: false };
  let latest = classifyPoints(state.w, model.points, model.positive, model.negative);
  let announcedCorrect = latest.correct;
  let best = null;

  const shownIndex = () => state.hovered ?? state.focused ?? state.selected;

  /* ---------- Equation and decision rule 方程与判定规则 ---------- */
  const equationNow = h('p', { class: 'decision-boundary__equation-line decision-boundary__equation-line--now' });
  const ruleItem = (cls, comparison) => h('li', { class: 'decision-boundary__rule' },
    legendIcon(() => s('rect', {
      class: `decision-boundary__swatch decision-boundary__region--${styleOf(cls).tone}`, x: 1, y: 3, width: 18, height: 14, rx: 2,
    })),
    mathText(`w0 + w1x1 + w2x2 ${comparison} 0`),
    h('span', { class: 'decision-boundary__arrow', 'aria-hidden': 'true' }, '→'),
    h('span', {}, biLabel('预测', 'predict'), ' ', h('strong', {}, biValue(labelOf(cls)))));

  const header = h('div', { class: 'ml-panel decision-boundary__equation' },
    h('p', { class: 'ml-eyebrow' }, biLabel('线性决策边界', 'Linear decision boundary')),
    h('p', { class: 'decision-boundary__equation-line' },
      h('span', { class: 'decision-boundary__tag' }, biLabel('模型', 'Model')),
      mathText('w0 + w1x1 + w2x2 = 0')),
    equationNow,
    h('ul', { class: 'decision-boundary__rules' },
      ruleItem(model.positive, '>'),
      ruleItem(model.negative, LESS_OR_EQUAL)));

  /* ---------- Plot 散点图 ---------- */
  const frame = createPlotFrame({
    xExtent: extent.x,
    yExtent: extent.y,
    role: 'group',
    label: `数据空间散点图 Data space scatter plot. x: ${biText(model.xLabel)}; y: ${biText(model.yLabel)}`,
    xTitle: [biValue(model.xLabel), icon('arrowRight', { size: 14 })],
    yTitle: [icon('arrowUp', { size: 14 }), biValue(model.yLabel)],
  });

  const pointNodes = model.points.map((point) => {
    const { shape, tone } = styleOf(point.cls);
    const marker = markerShape(shape);
    marker.setAttribute('class', `decision-boundary__marker decision-boundary__marker--${tone}`);
    const node = s('g', { class: 'decision-boundary__point', tabindex: '-1', role: 'button' },
      s('circle', { class: 'decision-boundary__hit', r: 16 }),
      s('circle', { class: 'decision-boundary__wrong-ring', r: 11.5 }),
      s('circle', { class: 'decision-boundary__focus-ring', r: 15 }),
      marker);
    node.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      state.hovered = point.index;
      render();
    });
    node.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse' || state.hovered !== point.index) return;
      state.hovered = null;
      render();
    });
    node.addEventListener('click', () => toggleSelected(point.index));
    node.addEventListener('focus', () => {
      state.focused = point.index;
      setRoving(point.index);
      render();
    });
    node.addEventListener('blur', () => {
      if (state.focused !== point.index) return;
      state.focused = null;
      render();
    });
    node.addEventListener('keydown', (event) => onPointKey(event, point.index));
    return node;
  });
  if (navOrder.length) pointNodes[navOrder[0]].setAttribute('tabindex', '0');
  frame.layers.points.append(...pointNodes);

  // Tapping empty space releases a pinned point. 点击空白处取消固定的点。
  frame.svg.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.decision-boundary__point')) return;
    if (state.selected === null) return;
    state.selected = null;
    render();
  });

  function setRoving(index) {
    pointNodes.forEach((node, nodeIndex) => node.setAttribute('tabindex', nodeIndex === index ? '0' : '-1'));
  }

  function toggleSelected(index) {
    state.selected = state.selected === index ? null : index;
    render();
  }

  function onPointKey(event, index) {
    const position = navOrder.indexOf(index);
    const moves = {
      ArrowRight: position + 1, ArrowDown: position + 1, ArrowLeft: position - 1, ArrowUp: position - 1,
      Home: 0, End: navOrder.length - 1,
    };
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleSelected(index);
    } else if (event.key === 'Escape' && state.selected !== null) {
      state.selected = null;
      render();
    } else if (Object.hasOwn(moves, event.key)) {
      event.preventDefault();
      const target = navOrder[(moves[event.key] + navOrder.length) % navOrder.length];
      setRoving(target);
      pointNodes[target].focus();
    }
  }

  const legend = h('ul', { class: 'ml-legend' },
    model.classes.map((item) => {
      const { shape, tone } = styleOf(item.id);
      return h('li', { class: 'ml-legend__item' },
        legendIcon(() => {
          const marker = markerShape(shape, 5.5);
          marker.setAttribute('class', `decision-boundary__marker decision-boundary__marker--${tone}`);
          return s('g', { transform: 'translate(10 10)' }, marker);
        }),
        h('span', {}, biValue(item.label)));
    }),
    h('li', { class: 'ml-legend__item' },
      legendIcon(() => s('circle', { class: 'decision-boundary__wrong-ring decision-boundary__wrong-ring--legend', cx: 10, cy: 10, r: 7.5 })),
      h('span', {}, biLabel('分错的点', 'Misclassified'))),
    h('li', { class: 'ml-legend__item' },
      legendIcon(() => s('line', { class: 'decision-boundary__line', x1: 2, y1: 17, x2: 18, y2: 3 })),
      h('span', {}, biLabel('决策边界', 'Decision boundary'))));

  const readout = h('div', { class: 'decision-boundary__readout' });

  /* ---------- Sliders and metrics 滑块与指标 ---------- */
  const hints = {
    w0: biLabel('常数项', 'constant'),
    w1: biLabel('x1 的权重', 'weight of x1'),
    w2: biLabel('x2 的权重', 'weight of x2'),
  };
  const sliders = Object.fromEntries(WEIGHTS.map((key) => [key, paramSlider({
    symbol: key,
    hint: hints[key],
    ...specs[key],
    value: state.w[key],
    onChange: (value) => {
      state.w = { ...state.w, [key]: value };
      render();
    },
  })]));

  const noLineNote = teachPair(
    'w1 和 w2 都是 0：没有边界线，所有点都被预测成同一类。',
    'w1 and w2 are both 0: there is no line, so every point gets the same prediction.',
    'decision-boundary__note');
  noLineNote.hidden = true;

  // Each metric shows the slide's definition (lecture 4, slide 46) above the live substitution.
  // 每个指标先写课件定义（第 4 讲第 46 页），下面是实时代入的数字。
  const counts = h('p', { class: 'decision-boundary__counts' });
  const accuracyValue = h('span', { class: 'decision-boundary__metric-value' });
  const accuracyWork = h('p', { class: 'decision-boundary__metric-work' });
  const errorValue = h('span', { class: 'decision-boundary__metric-value' });
  const errorWork = h('p', { class: 'decision-boundary__metric-work' });
  const metrics = h('div', { class: 'decision-boundary__metrics' },
    h('div', { class: 'decision-boundary__metric' },
      h('p', { class: 'decision-boundary__metric-head' }, h('span', {}, biLabel('准确率', 'Accuracy')), accuracyValue),
      h('p', { class: 'decision-boundary__definition' },
        mathText('accuracy = number of correct predictions / total number of predictions')),
      accuracyWork),
    h('div', { class: 'decision-boundary__metric decision-boundary__metric--error' },
      h('p', { class: 'decision-boundary__metric-head' }, h('span', {}, biLabel('分类错误率', 'Classification error')), errorValue),
      h('p', { class: 'decision-boundary__definition' }, mathText(`classification error = 1 ${MINUS} accuracy`)),
      errorWork));

  const bestId = `decision-boundary-best-${mountCount}`;
  const bestPanel = h('div', { id: bestId, class: 'decision-boundary__best', hidden: true });
  const bestButton = button({
    label: biLabel('直线最多能分对几个？', 'Best a straight line can do'),
    iconName: 'target',
    size: 'sm',
    onClick: () => {
      state.showBest = !state.showBest;
      render();
    },
  });
  bestButton.setAttribute('aria-expanded', 'false');
  bestButton.setAttribute('aria-controls', bestId);

  const resetButton = button({
    label: biLabel('复位', 'Reset'),
    iconName: 'refresh',
    size: 'sm',
    onClick: () => {
      state.w = { ...model.boundary };
      WEIGHTS.forEach((key) => sliders[key].setValue(state.w[key]));
      render();
      live.textContent = '已恢复到最初的直线 Reset to the starting line';
    },
  });

  /* ---------- Per-point table 逐点检查表 ---------- */
  const tableBody = h('tbody');
  const details = h('details', { class: 'decision-boundary__details' },
    h('summary', { class: 'decision-boundary__summary' },
      biLabel('逐点检查', 'Check every point'), ` (${model.points.length})`),
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data-table decision-boundary__table' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, '#'),
          h('th', { scope: 'col' }, biLabel('特征向量', 'Feature vector')),
          h('th', { scope: 'col' }, biLabel('实际类别', 'Actual')),
          h('th', { scope: 'col' }, mathText('w0 + w1x1 + w2x2')),
          h('th', { scope: 'col' }, biLabel('预测', 'Predicted')),
          h('th', { scope: 'col' }, biLabel('结果', 'Result')))),
        tableBody)));

  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });

  const root = h('div', { class: 'ml-widget decision-boundary' },
    header,
    h('div', { class: 'decision-boundary__body' },
      h('div', { class: 'ml-panel decision-boundary__figure' }, frame.element, legend, readout),
      h('div', { class: 'decision-boundary__side' },
        h('div', { class: 'ml-panel ml-sliders' },
          h('p', { class: 'ml-eyebrow' }, biLabel('移动直线', 'Move the line')),
          WEIGHTS.map((key) => sliders[key].element),
          noLineNote),
        counts,
        metrics,
        h('div', { class: 'decision-boundary__actions' }, resetButton, bestButton),
        bestPanel)),
    details,
    live);

  /* ---------- Drawing 绘制 ---------- */
  function drawRegions(geometry) {
    const full = rectPolygon(extent.rect);
    let positive = [];
    let negative = [];
    if (hasBoundaryLine(state.w)) {
      positive = clipToHalfPlane(full, state.w, 1);
      negative = clipToHalfPlane(full, state.w, -1);
    } else if (state.w.w0 > 0) {
      positive = full;
    } else {
      negative = full;
    }
    const region = (polygon, cls) => (polygon.length ? s('polygon', {
      class: `decision-boundary__region decision-boundary__region--${styleOf(cls).tone}`,
      points: polygon.map(([x, y]) => `${geometry.x(x).toFixed(1)},${geometry.y(y).toFixed(1)}`).join(' '),
    }) : null);
    replaceContent(frame.layers.regions, region(positive, model.positive), region(negative, model.negative));
  }

  function drawLine(geometry) {
    const segment = boundarySegment(state.w, extent.rect);
    replaceContent(frame.layers.marks, segment ? s('line', {
      class: 'decision-boundary__line',
      x1: geometry.x(segment[0][0]).toFixed(1),
      y1: geometry.y(segment[0][1]).toFixed(1),
      x2: geometry.x(segment[1][0]).toFixed(1),
      y2: geometry.y(segment[1][1]).toFixed(1),
    }) : null);
  }

  function pointLabel(row) {
    return `点 ${row.index + 1} Point ${row.index + 1}: ${formatFeatureVector(row)}; `
      + `实际 actual ${biText(labelOf(row.cls))}; 预测 predicted ${biText(labelOf(row.predicted))}; `
      + `${row.correct ? '分对 correct' : '分错 wrong'}`;
  }

  function drawPoints(geometry) {
    const shown = shownIndex();
    for (const row of latest.rows) {
      const node = pointNodes[row.index];
      node.setAttribute('transform', `translate(${geometry.x(row.x).toFixed(1)} ${geometry.y(row.y).toFixed(1)})`);
      node.classList.toggle('is-wrong', !row.correct);
      node.classList.toggle('is-shown', shown === row.index);
      node.setAttribute('aria-pressed', String(state.selected === row.index));
      node.setAttribute('aria-label', pointLabel(row));
    }
  }

  // The feature vector of the shown point, written next to it on the plot.
  // 在图上被查看的点旁边写出它的特征向量。
  function drawTag(geometry) {
    const index = shownIndex();
    if (index === null) {
      replaceContent(frame.layers.overlay);
      return;
    }
    const point = model.points[index];
    const text = formatFeatureVector(point);
    const width = 7.4 * text.length + 14;
    const height = 22;
    const px = geometry.x(point.x);
    const py = geometry.y(point.y);
    const left = clamp(px - width / 2, 2, geometry.width - width - 2);
    const top = py - 20 - height >= 2 ? py - 20 - height : py + 20;
    replaceContent(frame.layers.overlay,
      s('rect', { class: 'decision-boundary__tag-bg', x: left.toFixed(1), y: top.toFixed(1), width: width.toFixed(1), height, rx: 4 }),
      s('text', { class: 'decision-boundary__tag-text', x: (left + width / 2).toFixed(1), y: (top + 15).toFixed(1), 'text-anchor': 'middle' }, text));
  }

  /* ---------- Text panels 文字面板 ---------- */
  function renderEquation() {
    replaceContent(equationNow,
      h('span', { class: 'decision-boundary__tag' }, biLabel('现在', 'Now')),
      mathText(formatBoundaryEquation(state.w, digits)));
  }

  function renderMetrics() {
    const summary = accuracySummary(latest.correct, latest.total);
    if (!summary.total) {
      replaceContent(counts, biLabel('没有数据点', 'No data points'));
      replaceContent(accuracyValue, '—');
      replaceContent(errorValue, '—');
      replaceContent(accuracyWork);
      replaceContent(errorWork);
      return;
    }
    const { correct, wrong, total } = summary;
    replaceContent(counts,
      h('span', {}, biLabel('分对', 'correct'), ' ', h('strong', {}, String(correct))),
      h('span', {}, biLabel('分错', 'wrong'), ' ', h('strong', {}, String(wrong))),
      h('span', {}, biLabel('总数', 'total'), ' ', h('strong', {}, String(total))));
    replaceContent(accuracyValue, formatPercent(summary.accuracy));
    replaceContent(errorValue, formatPercent(summary.error));
    replaceContent(accuracyWork, mathText(
      `accuracy = correct / total = ${formatFraction(correct, total)} ${percentWork(summary.accuracy)}`));
    replaceContent(errorWork, mathText(
      `classification error = 1 ${MINUS} ${formatFraction(correct, total)} = `
      + `${formatFraction(wrong, total)} ${percentWork(summary.error)}`));
  }

  function renderReadout() {
    if (!model.points.length) {
      replaceContent(readout, teachPair('没有数据点。', 'No data points.'));
      return;
    }
    const index = shownIndex();
    if (index === null) {
      replaceContent(readout, teachPair(
        '把鼠标移到某个点上，或点一下它（键盘：Tab 进入，方向键切换），就能看到它的特征向量和分类过程。',
        'Hover or tap a point (keyboard: Tab, then the arrow keys) to see its feature vector and how it is classified.',
        'decision-boundary__hint'));
      return;
    }
    const row = latest.rows[index];
    const comparison = row.score > 0 ? '> 0' : `${LESS_OR_EQUAL} 0`;
    replaceContent(readout,
      h('p', { class: 'decision-boundary__readout-title' },
        h('strong', {}, biLabel(`点 ${index + 1}`, `Point ${index + 1}`)),
        row.correct ? badge(biLabel('分对', 'Correct'), 'accent') : badge(biLabel('分错', 'Wrong'), 'danger')),
      h('dl', { class: 'decision-boundary__facts' },
        h('dt', {}, biLabel('特征向量', 'Feature vector')),
        h('dd', {}, mathText(`[x1, x2] = ${formatFeatureVector(row)}`)),
        h('dt', {}, biLabel('实际类别', 'Actual class')),
        h('dd', {}, biValue(labelOf(row.cls))),
        h('dt', {}, biLabel('代入', 'Plug in')),
        h('dd', {}, mathText(`${formatScoreWork(state.w, row, digits)} ${comparison}`)),
        h('dt', {}, biLabel('预测', 'Predicted')),
        h('dd', {}, biValue(labelOf(row.predicted)))));
  }

  function renderTable() {
    replaceContent(tableBody, latest.rows.map((row) => h('tr', { class: row.correct ? null : 'is-wrong' },
      h('td', {}, String(row.index + 1)),
      h('td', { class: 'decision-boundary__num' }, formatFeatureVector(row)),
      h('td', {}, biValue(labelOf(row.cls))),
      h('td', { class: 'decision-boundary__num' }, formatNonZero(row.score, 2)),
      h('td', {}, biValue(labelOf(row.predicted))),
      h('td', {}, h('span', { class: ['decision-boundary__verdict', row.correct ? 'is-correct' : 'is-wrong'] },
        icon(row.correct ? 'check' : 'cross', { size: 14 }),
        biLabel(row.correct ? '对' : '错', row.correct ? 'correct' : 'wrong'))))));
  }

  function renderBest() {
    bestPanel.hidden = !state.showBest;
    bestButton.setAttribute('aria-expanded', String(state.showBest));
    if (!state.showBest) return;
    best ??= bestLinearSplit(model.points, model.positive);
    const now = formatFraction(latest.correct, latest.total);
    if (!best.total) {
      replaceContent(bestPanel, teachPair('没有数据点。', 'No data points.'));
    } else if (best.correct === best.total) {
      replaceContent(bestPanel, teachPair(
        `存在一条直线能把全部 ${best.total} 个点分对。你现在的直线分对 ${now}。`,
        `Some straight line gets all ${best.total} points right. Your line now gets ${now}.`));
    } else {
      const most = formatFraction(best.correct, best.total);
      replaceContent(bestPanel,
        teachPair(
          `任何一条直线最多只能分对 ${most}（准确率 ${formatPercent(best.correct / best.total)}）。你现在的直线分对 ${now}。`,
          `No straight line can do better than ${most} (accuracy ${formatPercent(best.correct / best.total)}). Your line now gets ${now}.`),
        teachPair(
          '这组数据不能被一条直线完全分开；想全部分对，需要更弯的边界（比如二次曲线）。',
          'This data cannot be split perfectly by one straight line; a curved boundary (for example quadratic) is needed.'));
    }
  }

  function announce() {
    if (latest.correct === announcedCorrect) return;
    announcedCorrect = latest.correct;
    const summary = accuracySummary(latest.correct, latest.total);
    live.textContent = `分对 ${latest.correct}/${latest.total}，准确率 ${formatPercent(summary.accuracy)}。`
      + ` ${latest.correct} of ${latest.total} correct, accuracy ${formatPercent(summary.accuracy)}.`;
  }

  function render() {
    latest = classifyPoints(state.w, model.points, model.positive, model.negative);
    const geometry = frame.layout();
    drawRegions(geometry);
    drawLine(geometry);
    drawPoints(geometry);
    drawTag(geometry);
    noLineNote.hidden = hasBoundaryLine(state.w);
    renderEquation();
    renderMetrics();
    renderReadout();
    renderTable();
    renderBest();
    announce();
  }

  container.replaceChildren(root);
  render();
  const stopObserving = frame.observe(render);

  return () => {
    stopObserving();
  };
}
