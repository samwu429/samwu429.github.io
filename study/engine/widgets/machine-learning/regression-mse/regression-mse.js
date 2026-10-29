/**
 * Widget "regression-mse": linear regression y = w0 + w1x1 with the error segments (y − t), the mean
 * squared error written out like the slides, and gradient descent that follows the slides' 5 steps.
 * 组件“回归与 MSE”：线性回归 y = w0 + w1x1、误差线 (y − t)、按课件写法展开的均方误差，
 * 以及按课件 5 个步骤进行的梯度下降。
 *
 * Gradient descent always uses exact predictions (the true MSE gradient), so every step lowers the
 * MSE; the "like the slides" option only changes how the table and the written sum round y.
 * 梯度下降始终使用精确的预测值（真实的 MSE 梯度），所以每一步都会降低 MSE；
 * “像课件一样”选项只改变表格和展开式里 y 的取整方式。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { button } from '../../../components/controls/button.js';
import {
  autoStepsForTick, directionOf, formatMseWork, gradientStep, hasConverged, leastSquaresFit, learningRateOptions,
  meanSquaredError, mseGradient, normalizeRegressionConfig, predictY, regressionRows, regressionSliderSpecs,
  summarizeRows, visibleLine,
} from './regression-logic.js';
import {
  APPROX, MINUS, TIMES, clamp, downsample, formatFixed, formatLinear, formatNonZero, formatSigned, formatTrim,
  niceExtent, roundTo,
} from '../shared/ml-math.js';
import {
  biLabel, biText, biValue, ensureSharedStyles, legendIcon, mathText, teachPair,
} from '../shared/ml-ui.js';
import { paramSlider } from '../shared/param-slider.js';
import { createPlotFrame } from '../shared/plot-frame.js';

const MAX_AUTO_STEPS = 60000;
const MAX_HISTORY = 200000;
// The first ticks of an auto run are slow so single steps can be seen; later ticks batch many steps.
// 自动运行的前几帧放慢，便于看清单步；之后每帧合并许多步。
const SLOW_TICKS = 4;
const SLOW_INTERVAL = 320;
const FAST_INTERVAL = 60;

// Slide 25, "Essentially, the algorithm for gradient descent is:". 第 25 页的梯度下降算法。
const STEPS = [
  {
    zh: '给所有参数（w0、w1）一个起始值。课件里是随机设定；这里用上面的起始直线。',
    en: 'Start with all parameters (w0, w1, …) set randomly.',
  },
  { zh: '用训练集里的每一个点计算代价（MSE）。', en: 'Check the cost using every point in the training set.' },
  {
    zh: '对每个参数，判断应该增大还是减小，才能让代价变小。',
    en: 'For each parameter, decide if it should be increased or decreased to reduce cost.',
  },
  { zh: '把每个参数增大或减小一小步。', en: 'Increase or decrease each parameter by a small amount.' },
  { zh: '回到第 2 步重复，直到参数接近正确。', en: 'Repeat from Step 2 until the parameters are close to correct.' },
];

let mountCount = 0;

const equalsOrApprox = (value, digits = 2) => (Math.abs(value - roundTo(value, digits)) < 1e-9 ? '=' : APPROX);
const stepsText = (steps) => `${steps} ${steps === 1 ? 'step' : 'steps'}`;

/** Signed change with enough decimals to stay visible: "+0.1829", "−0.002". 带符号的变化量，保证可见。 */
function formatChange(value, digits) {
  const text = formatNonZero(value, digits);
  return value > 0 && roundTo(value, 12) !== 0 ? `+${text}` : text;
}

/** Two values printed with just enough decimals to tell them apart. 打印两个数，位数足以区分它们。 */
function formatPair(before, after) {
  let digits = 2;
  while (digits < 6 && formatFixed(before, digits) === formatFixed(after, digits)) digits += 1;
  return [formatFixed(before, digits), formatFixed(after, digits)];
}

export async function mount(container, config) {
  await Promise.all([
    ensureStylesheet(new URL('./regression-mse.css', import.meta.url)),
    ensureSharedStyles(),
  ]);
  mountCount += 1;

  const model = normalizeRegressionConfig(config);
  const { points } = model;
  const count = points.length;
  const best = leastSquaresFit(points);
  const bestMse = meanSquaredError(best, points);
  const rates = learningRateOptions(points);
  const specs = regressionSliderSpecs(points, model.start, best);
  const digits = { w0: specs.w0.digits, w1: specs.w1.digits };

  // Axes cover the data plus both ends of the start and best lines, without letting a very steep
  // start line squash the data.
  // 坐标范围包含数据以及起始直线、最佳直线的两端，但不让很陡的起始直线把数据压扁。
  const xExtent = niceExtent(points.map((point) => point.x));
  const targets = points.map((point) => point.t);
  const tLow = count ? Math.min(...targets) : 0;
  const tHigh = count ? Math.max(...targets) : 1;
  const tSpan = Math.max(tHigh - tLow, 1);
  const lineEnds = [model.start, best]
    .flatMap((w) => [predictY(w, xExtent.min), predictY(w, xExtent.max)])
    .map((value) => clamp(value, tLow - tSpan, tHigh + tSpan));
  const yExtent = niceExtent([...targets, ...lineEnds]);
  const box = { xMin: xExtent.min, xMax: xExtent.max, yMin: yExtent.min, yMax: yExtent.max };

  const state = {
    w: { ...model.start },
    roundY: false,
    rate: rates.defaultRate,
    steps: 0,
    history: [meanSquaredError(model.start, points)],
    last: null,
    running: false,
    hovered: null,
    focused: null,
    pinned: null,
  };
  const activeIndex = () => state.hovered ?? state.focused ?? state.pinned;
  const lineText = (w, extra = 0) => formatLinear([
    { coef: w.w0, symbol: '', digits: digits.w0 + extra },
    { coef: w.w1, symbol: 'x1', digits: digits.w1 + extra },
  ], { fixed: true, keepZero: true });
  // Arrow keys visit the points from left to right, so keyboard order follows the picture.
  // 方向键按从左到右的顺序访问各点，键盘顺序与图上位置一致。
  const navOrder = points.map((point) => point.index)
    .sort((a, b) => points[a].x - points[b].x || points[a].t - points[b].t);
  const formatRate = (rate) => formatTrim(rate, 9);
  const currentMse = () => state.history[state.history.length - 1];

  /* ---------- Equation 方程 ---------- */
  const equationNow = h('p', { class: 'regression-mse__equation-line regression-mse__equation-line--now' });
  const header = h('div', { class: 'ml-panel regression-mse__equation' },
    h('p', { class: 'ml-eyebrow' }, biLabel('线性回归', 'Linear regression')),
    h('p', { class: 'regression-mse__equation-line' },
      h('span', { class: 'regression-mse__tag' }, biLabel('模型', 'Model')),
      mathText('y = w0 + w1x1')),
    equationNow);

  /* ---------- Plot 图 ---------- */
  const frame = createPlotFrame({
    xExtent,
    yExtent,
    role: 'group',
    label: '',
    xTitle: [biValue(model.xLabel), icon('arrowRight', { size: 14 })],
    yTitle: [icon('arrowUp', { size: 14 }), biValue(model.yLabel)],
  });

  // Points work like the decision-boundary points: hover or tap to show, Enter or Space to pin,
  // arrow keys to move between them (one Tab stop for the whole set).
  // 数据点的用法和决策边界组件一致：悬停或点按显示，Enter 或空格固定，方向键在点之间移动（整组只占一个 Tab 位置）。
  const pointNodes = points.map((point) => {
    const node = s('g', { class: 'regression-mse__point-group', tabindex: '-1', role: 'button' },
      s('circle', { class: 'regression-mse__hit', r: 14 }),
      s('circle', { class: 'regression-mse__focus-ring', r: 11 }),
      s('circle', { class: 'regression-mse__point', r: 5.5 }));
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
    node.addEventListener('click', () => togglePinned(point.index));
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

  function setRoving(index) {
    pointNodes.forEach((node, nodeIndex) => node.setAttribute('tabindex', nodeIndex === index ? '0' : '-1'));
  }

  function togglePinned(index) {
    state.pinned = state.pinned === index ? null : index;
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
      togglePinned(index);
    } else if (event.key === 'Escape' && state.pinned !== null) {
      state.pinned = null;
      render();
    } else if (Object.hasOwn(moves, event.key)) {
      event.preventDefault();
      const target = navOrder[(moves[event.key] + navOrder.length) % navOrder.length];
      setRoving(target);
      pointNodes[target].focus();
    }
  }

  // Tapping empty space releases a pinned point. 点击空白处取消固定的点。
  frame.svg.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.regression-mse__point-group')) return;
    if (state.pinned === null) return;
    state.pinned = null;
    render();
  });

  const legend = h('ul', { class: 'ml-legend' },
    h('li', { class: 'ml-legend__item' },
      legendIcon(() => s('circle', { class: 'regression-mse__point', cx: 10, cy: 10, r: 5 })),
      h('span', {}, biLabel('数据点：目标值 t', 'data point: target t'))),
    h('li', { class: 'ml-legend__item' },
      legendIcon(() => s('line', { class: 'regression-mse__line', x1: 2, y1: 16, x2: 18, y2: 4 })),
      h('span', {}, biLabel('直线：预测值 y', 'line: prediction y'))),
    h('li', { class: 'ml-legend__item' },
      legendIcon(() => s('line', { class: 'regression-mse__residual', x1: 10, y1: 3, x2: 10, y2: 17 })),
      h('span', {}, biLabel(`红线：误差 y ${MINUS} t`, `red: error y ${MINUS} t`))));
  const pointHint = teachPair(
    '把鼠标移到点上或点一下，就能在图上看到它的 t、y 和误差（键盘：Tab 进入，方向键切换，Enter 固定）。',
    'Hover or tap a point to label its t, y and error (keyboard: Tab, then the arrow keys; Enter pins it).',
    'regression-mse__hint');

  /* ---------- Controls 控件 ---------- */
  const sliders = {
    w0: paramSlider({
      symbol: 'w0', hint: biLabel('截距', 'intercept'), ...specs.w0, value: state.w.w0,
      onChange: (value) => setParameter('w0', value),
    }),
    w1: paramSlider({
      symbol: 'w1', hint: biLabel('斜率', 'slope'), ...specs.w1, value: state.w.w1,
      onChange: (value) => setParameter('w1', value),
    }),
  };

  const stepButton = button({
    label: biLabel('梯度下降一步', 'One gradient-descent step'),
    iconName: 'arrowRight',
    variant: 'primary',
    onClick: stepOnce,
  });
  const autoButton = button({ label: biLabel('自动', 'Auto run'), iconName: 'play', onClick: toggleAuto });
  const resetButton = button({ label: biLabel('复位', 'Reset'), iconName: 'refresh', variant: 'ghost', onClick: reset });

  const rateId = `regression-mse-rate-${mountCount}`;
  const rateSelect = h('select', {
    id: rateId,
    class: 'select regression-mse__rate',
    onchange: () => {
      state.rate = Number(rateSelect.value);
      render();
    },
  }, rates.options.map((rate) => h('option', { value: String(rate), selected: rate === state.rate }, formatRate(rate))));
  const rateField = h('div', { class: 'field regression-mse__field' },
    h('label', { class: 'field__label', for: rateId }, biLabel('学习率（每一步迈多大）', 'Learning rate (step size)')),
    rateSelect,
    h('p', { class: 'regression-mse__hint' }, biLabel(
      '课件只说“一小步”，学习率是课件外的补充。这里的选项都足够小，保证每一步 MSE 都会下降。',
      'The slides just say "a small amount"; the learning rate is extra. Every option here is small enough that each step lowers the MSE.',
      'teach')));

  const status = h('p', { class: 'ml-status regression-mse__status', role: 'status', 'aria-live': 'polite' });

  /* ---------- MSE panel 均方误差面板 ---------- */
  const mseValue = h('p', { class: 'regression-mse__mse-value' });
  const mseWork = h('p', { class: 'regression-mse__mse-work' });
  const mseNote = h('div', { class: 'regression-mse__mse-note' });
  const roundInput = h('input', {
    type: 'checkbox',
    onchange: () => {
      state.roundY = roundInput.checked;
      render();
    },
  });
  const msePanel = h('section', { class: 'ml-panel regression-mse__mse', 'aria-label': '均方误差 Mean squared error' },
    h('p', { class: 'ml-eyebrow' }, biLabel('均方误差', 'Mean squared error (MSE)')),
    mseValue,
    mseWork,
    mseNote,
    h('label', { class: 'check-row regression-mse__round' },
      roundInput,
      h('span', {}, biLabel('像课件一样：先把每个 y 取一位小数', 'Like the slides: round each y to 1 decimal first'))));

  /* ---------- Gradient-descent steps 梯度下降步骤 ---------- */
  const stepLines = STEPS.map(() => h('p', { class: 'regression-mse__step-live' }));
  const sparkLine = s('polyline', { class: 'regression-mse__spark-line', 'vector-effect': 'non-scaling-stroke' });
  const sparkText = h('p', { class: 'regression-mse__spark-text' });
  const gradientWork = h('div', { class: 'regression-mse__gradient' });
  const stepsPanel = h('section', { class: 'ml-panel regression-mse__gd', 'aria-label': '梯度下降 Gradient descent' },
    h('p', { class: 'ml-eyebrow' }, biLabel('梯度下降的 5 个步骤', 'Gradient descent in 5 steps')),
    h('ol', { class: 'regression-mse__steps' }, STEPS.map((step, index) => h('li', { class: 'regression-mse__step' },
      teachPair(step.zh, step.en),
      stepLines[index]))),
    h('div', { class: 'regression-mse__history' },
      h('p', { class: 'regression-mse__history-title' }, biLabel('MSE 的变化', 'MSE history')),
      s('svg', { class: 'regression-mse__spark', viewBox: '0 0 100 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
        s('line', { class: 'regression-mse__spark-base', x1: 0, y1: 38, x2: 100, y2: 38, 'vector-effect': 'non-scaling-stroke' }),
        sparkLine),
      sparkText),
    h('details', { class: 'regression-mse__extra' },
      h('summary', { class: 'regression-mse__summary' },
        biLabel('补充（课件外）：电脑怎么知道该增大还是减小？', 'Extra: how does it know which way to go?')),
      teachPair(
        '补充（课件外）：电脑看 MSE 的“坡度”（梯度 gradient）。某个参数的坡度是正数，说明它变大时 MSE 也会变大，所以要减小它；坡度是负数就增大它。每一步的改变量 = 学习率 × 坡度。这些公式课件没有讲，不用背，理解思路即可。',
        'The slope (gradient) of the MSE gives the direction: if it is positive, decrease the parameter; if it is negative, increase it. Change = learning rate × slope. These formulas are not on the slides.'),
      gradientWork));

  /* ---------- Table 表格 ---------- */
  const headCell = (symbol, zh, en) => h('th', { scope: 'col' },
    h('span', { class: 'regression-mse__th-symbol' }, mathText(symbol)),
    h('span', { class: 'regression-mse__th-name' }, biLabel(zh, en)));
  const rowViews = points.map((point) => {
    const cells = {
      x: h('td', { class: 'regression-mse__num' }),
      t: h('td', { class: 'regression-mse__num' }),
      y: h('td', { class: 'regression-mse__num' }),
      error: h('td', { class: 'regression-mse__num' }),
      squared: h('td', { class: 'regression-mse__num' }),
    };
    const row = h('tr', {}, h('th', { scope: 'row', class: 'regression-mse__num' }, String(point.index + 1)),
      cells.x, cells.t, cells.y, cells.error, cells.squared);
    row.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      state.hovered = point.index;
      render();
    });
    row.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse' || state.hovered !== point.index) return;
      state.hovered = null;
      render();
    });
    return { row, cells };
  });
  const sumCell = h('td', { class: 'regression-mse__num' });
  const meanCell = h('td', { class: 'regression-mse__num' });
  const table = h('table', { class: 'data-table regression-mse__table' },
    h('caption', { class: 'visually-hidden' }, biLabel('每个点的预测值、误差与平方误差', 'Prediction, error and squared error of every point')),
    h('thead', {}, h('tr', {},
      headCell('i', '点', 'point'),
      headCell('x1', '输入', 'input'),
      headCell('t', '目标值', 'target'),
      headCell('y', '预测值', 'prediction'),
      headCell(`y ${MINUS} t`, '误差', 'error'),
      headCell(`(y ${MINUS} t)²`, '平方误差', 'squared error'))),
    h('tbody', {}, rowViews.map((view) => view.row)),
    h('tfoot', {},
      h('tr', {},
        h('th', { scope: 'row', colspan: 5 }, biLabel('平方误差之和', 'Sum of squared errors')),
        sumCell),
      h('tr', {},
        h('th', { scope: 'row', colspan: 5 }, biLabel(`除以点数 N = ${count}`, `divide by N = ${count}`), ' = MSE'),
        meanCell)));

  const root = h('div', { class: 'ml-widget regression-mse' },
    header,
    h('div', { class: 'regression-mse__body' },
      h('div', { class: 'ml-panel regression-mse__figure' }, frame.element, legend, pointHint),
      h('div', { class: 'regression-mse__side' },
        h('div', { class: 'ml-panel ml-sliders' },
          h('p', { class: 'ml-eyebrow' }, biLabel('自己移动直线', 'Move the line yourself')),
          sliders.w0.element,
          sliders.w1.element),
        h('div', { class: 'ml-panel regression-mse__train' },
          h('p', { class: 'ml-eyebrow' }, biLabel('让电脑一步步找', 'Let gradient descent find it')),
          h('div', { class: 'regression-mse__buttons' }, stepButton, autoButton, resetButton),
          rateField,
          status))),
    msePanel,
    stepsPanel,
    h('div', { class: 'table-scroll regression-mse__table-wrap' }, table));

  /* ---------- Drawing 绘制 ---------- */
  function drawMarks(geometry, exactRows) {
    const active = activeIndex();
    const span = yExtent.max - yExtent.min;
    const segment = visibleLine(state.w, box);
    replaceContent(frame.layers.marks,
      exactRows.map((row) => s('line', {
        class: ['regression-mse__residual', active === row.index ? 'is-active' : null],
        x1: geometry.x(row.x).toFixed(1),
        x2: geometry.x(row.x).toFixed(1),
        y1: geometry.y(row.t).toFixed(1),
        // Far-away predictions are pulled in; the clip path hides everything outside the plot anyway.
        // 很远的预测值被收回到图附近；超出图的部分本来就会被裁掉。
        y2: geometry.y(clamp(row.exactY, yExtent.min - span, yExtent.max + span)).toFixed(1),
      })),
      segment ? s('line', {
        class: 'regression-mse__line',
        x1: geometry.x(segment[0][0]).toFixed(1),
        y1: geometry.y(segment[0][1]).toFixed(1),
        x2: geometry.x(segment[1][0]).toFixed(1),
        y2: geometry.y(segment[1][1]).toFixed(1),
      }) : null);
  }

  function drawPoints(geometry, exactRows) {
    const active = activeIndex();
    for (const point of points) {
      const node = pointNodes[point.index];
      const row = exactRows[point.index];
      node.setAttribute('transform', `translate(${geometry.x(point.x).toFixed(1)} ${geometry.y(point.t).toFixed(1)})`);
      node.classList.toggle('is-active', active === point.index);
      node.setAttribute('aria-pressed', String(state.pinned === point.index));
      node.setAttribute('aria-label', `点 ${point.index + 1} Point ${point.index + 1}: x1 = ${formatTrim(point.x, 3)}, `
        + `t = ${formatTrim(point.t, 3)}, y = ${formatTrim(row.exactY, 2)}, y ${MINUS} t = ${formatSigned(row.exactY - row.t, 2, { trim: true })}`);
    }
  }

  // Labels "t" and "y" for the highlighted point, like slides 18-19, plus its error.
  // 给被选中的点标出 “t” 和 “y”（与第 18-19 页一致），并写出它的误差。
  function drawLabels(geometry, exactRows) {
    const index = activeIndex();
    if (index === null) {
      replaceContent(frame.layers.overlay);
      return;
    }
    const row = exactRows[index];
    const { plot } = geometry;
    const px = geometry.x(row.x);
    const pt = geometry.y(row.t);
    const pyRaw = geometry.y(row.exactY);
    const lineVisible = pyRaw >= plot.top && pyRaw <= plot.bottom;
    const py = clamp(pyRaw, plot.top, plot.bottom);
    const onRight = px < (plot.left + plot.right) / 2;
    const anchor = onRight ? 'start' : 'end';
    const offset = onRight ? 10 : -10;
    const label = (text, x, y, modifier) => s('text', {
      class: `regression-mse__label regression-mse__label--${modifier}`, x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': anchor,
    }, text);
    replaceContent(frame.layers.overlay,
      label('t', px + offset, pt + 4, 't'),
      lineVisible && Math.abs(pyRaw - pt) > 14 ? label('y', px + offset, py + 4, 'y') : null,
      Math.abs(py - pt) > 34
        ? label(`y ${MINUS} t = ${formatSigned(row.exactY - row.t, 2, { trim: true })}`, px + offset, (pt + py) / 2 + 4, 'error')
        : null);
  }

  /* ---------- Text panels 文字面板 ---------- */
  function renderEquation() {
    replaceContent(equationNow,
      h('span', { class: 'regression-mse__tag' }, biLabel('现在', 'Now')),
      mathText(`y = ${lineText(state.w)}`));
  }

  function renderMse(rows) {
    const exact = currentMse();
    replaceContent(mseValue,
      state.roundY ? h('span', { class: 'regression-mse__mse-tag' }, biLabel('精确值', 'exact')) : null,
      mathText(count ? `MSE ${equalsOrApprox(exact)} ${formatFixed(exact, 2)}` : 'MSE = —'));
    replaceContent(mseWork,
      state.roundY ? h('span', { class: 'regression-mse__mse-tag' }, biLabel('课件算法', 'slide method')) : null,
      mathText(formatMseWork(rows)));
    replaceContent(mseNote, state.roundY
      ? teachPair(
        '课件算法：每个 y 先取一位小数，再算误差和平方，考试按这个写。上面的“精确值”没有四舍五入，梯度下降用的也是精确值，所以两者可能略有不同。',
        'Slide method: each y is rounded to 1 decimal before the errors are squared; write it this way on the exam. The exact value above is not rounded, and gradient descent also uses exact values, so the two can differ slightly.')
      : teachPair(
        '这里用精确的 y 计算，没有先四舍五入。课件先把每个 y 取一位小数，结果可能略有不同：勾选下面的选项就能对照。',
        'Exact y values are used here. The slides first round each y to 1 decimal, which can change the result slightly: tick the box below to compare.'));
  }

  function renderTable(rows, summary) {
    const active = activeIndex();
    for (const row of rows) {
      const { cells, row: element } = rowViews[row.index];
      cells.x.textContent = formatTrim(row.x, 3);
      cells.t.textContent = formatTrim(row.t, 3);
      cells.y.textContent = state.roundY ? formatFixed(row.y, 1) : formatTrim(row.y, 3);
      cells.error.textContent = state.roundY ? formatSigned(row.error, 1) : formatSigned(row.error, 3, { trim: true });
      cells.squared.textContent = formatFixed(row.squared, 2);
      element.classList.toggle('is-active', active === row.index);
    }
    sumCell.textContent = count ? formatFixed(summary.sum, 2) : '—';
    meanCell.textContent = count
      ? `${formatFixed(summary.sum, 2)} / ${count} ${equalsOrApprox(summary.mse)} ${formatFixed(summary.mse, 2)}`
      : '—';
  }

  function directionNodes(symbol, derivative) {
    const direction = directionOf(derivative);
    const words = {
      decrease: biLabel('应该减小', 'decrease'),
      increase: biLabel('应该增大', 'increase'),
      hold: biLabel('不用变', 'stay'),
    };
    return h('span', { class: `regression-mse__direction regression-mse__direction--${direction}` },
      mathText(symbol), ' ', words[direction]);
  }

  function renderSteps() {
    const gradient = mseGradient(state.w, points);
    const mse = currentMse();
    replaceContent(stepLines[0],
      biLabel('起始值', 'start'), ': ',
      mathText(`w0 = ${formatFixed(model.start.w0, digits.w0)}, w1 = ${formatFixed(model.start.w1, digits.w1)}`));
    replaceContent(stepLines[1],
      biLabel('现在', 'now'), ': ',
      mathText(`MSE ${equalsOrApprox(mse)} ${formatFixed(mse, 2)}`), ' ',
      biLabel(`（全部 ${count} 个点）`, `(all ${count} points)`));
    replaceContent(stepLines[2], count
      ? [directionNodes('w0', gradient.d0), h('span', { 'aria-hidden': 'true' }, ' · '), directionNodes('w1', gradient.d1)]
      : biLabel('没有数据点', 'No data points'));
    if (state.last) {
      const { before, after } = state.last;
      const change = (key, places) => `${key}: ${formatFixed(before[key], places)} → ${formatFixed(after[key], places)} `
        + `(${formatChange(after[key] - before[key], places)})`;
      replaceContent(stepLines[3],
        biLabel('上一步', 'last step'), ': ',
        mathText(`${change('w0', digits.w0 + 1)}; ${change('w1', digits.w1 + 1)}`), ' ',
        biLabel(`学习率 ${formatRate(state.rate)}`, `learning rate ${formatRate(state.rate)}`));
    } else {
      replaceContent(stepLines[3], biLabel('还没有走：按“梯度下降一步”试试。', 'No step yet: press One gradient-descent step.'));
    }
    replaceContent(stepLines[4],
      biLabel(`已走 ${state.steps} 步`, `${stepsText(state.steps)} so far`),
      count && isConverged() ? [' · ', h('strong', {}, biLabel('参数已接近正确', 'parameters are close to correct')),
        ' · ', biLabel('精确的最佳直线', 'exact best line'), ': ', mathText(`y ${APPROX} ${lineText(best, 1)}`)] : null);
  }

  function renderHistory() {
    const values = downsample(state.history, 120);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = high - low;
    const coords = values.length > 1
      ? values.map((value, index) => {
        const x = (index / (values.length - 1)) * 100;
        const y = span > 0 ? 4 + (1 - (value - low) / span) * 32 : 20;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      : ['0,20', '100,20'];
    sparkLine.setAttribute('points', coords.join(' '));
    const first = state.history[0];
    const last = currentMse();
    replaceContent(sparkText,
      mathText(`MSE ${formatFixed(first, 2)} → ${formatFixed(last, 2)}`), ' · ',
      biLabel(`${state.steps} 步`, stepsText(state.steps)));
  }

  function renderGradient() {
    const gradient = mseGradient(state.w, points);
    replaceContent(gradientWork,
      h('p', {}, mathText(`∂MSE/∂w0 = (2/N) Σ (y ${MINUS} t) = ${formatNonZero(gradient.d0, 2)}`)),
      h('p', {}, mathText(`∂MSE/∂w1 = (2/N) Σ (y ${MINUS} t) ${TIMES} x1 = ${formatNonZero(gradient.d1, 2)}`)),
      h('p', {}, mathText(`w0 ← w0 ${MINUS} η ${TIMES} ∂MSE/∂w0, w1 ← w1 ${MINUS} η ${TIMES} ∂MSE/∂w1 (η = ${formatRate(state.rate)})`)));
  }

  function render() {
    const geometry = frame.layout();
    const rows = regressionRows(state.w, points, { roundY: state.roundY });
    const exactRows = state.roundY ? regressionRows(state.w, points) : rows;
    drawMarks(geometry, exactRows);
    drawPoints(geometry, exactRows);
    drawLabels(geometry, exactRows);
    renderEquation();
    renderMse(rows);
    renderTable(rows, summarizeRows(rows));
    renderSteps();
    renderHistory();
    renderGradient();
    frame.svg.setAttribute('aria-label', `数据点与直线 Data points and the line y = ${lineText(state.w)}; `
      + `MSE ${equalsOrApprox(currentMse())} ${formatFixed(currentMse(), 2)}. ${biText(model.xLabel)}; ${biText(model.yLabel)}`);
  }

  /* ---------- Actions 操作 ---------- */
  function isConverged() {
    return hasConverged(state.w, best, { mse: currentMse(), bestMse, digits });
  }

  function syncSliders() {
    sliders.w0.setValue(state.w.w0);
    sliders.w1.setValue(state.w.w1);
  }

  function restartHistory() {
    state.steps = 0;
    state.last = null;
    state.history = [meanSquaredError(state.w, points)];
  }

  function setParameter(key, value) {
    stopAuto();
    state.w = { ...state.w, [key]: value };
    restartHistory();
    render();
  }

  function takeStep() {
    const before = state.w;
    const { next } = gradientStep(state.w, points, state.rate, rates.limit);
    state.w = next;
    state.steps += 1;
    state.last = { before, after: next };
    state.history.push(meanSquaredError(next, points));
    if (state.history.length > MAX_HISTORY) state.history = downsample(state.history, MAX_HISTORY / 2);
  }

  function stepOnce() {
    if (!count || state.running) return;
    const before = currentMse();
    takeStep();
    syncSliders();
    render();
    const [from, to] = formatPair(before, currentMse());
    replaceContent(status,
      biLabel(`第 ${state.steps} 步`, `Step ${state.steps}`), ': ',
      mathText(`MSE ${from} → ${to}`));
  }

  let frameId = 0;
  let tick = 0;
  let lastTick = 0;
  let runSteps = 0;
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function syncAutoButton() {
    replaceContent(autoButton,
      icon(state.running ? 'stop' : 'play'),
      h('span', { class: 'btn__label' }, state.running ? biLabel('停止', 'Stop') : biLabel('自动', 'Auto run')));
    autoButton.disabled = !count;
    stepButton.disabled = !count || state.running;
  }

  function toggleAuto() {
    if (state.running) stopAuto('user');
    else startAuto();
  }

  function startAuto() {
    if (!count || state.running) return;
    if (isConverged()) {
      replaceContent(status, biLabel(
        '参数已经接近正确了。先拖动滑块换一条线，再试试自动运行。',
        'The parameters are already close to correct. Move a slider first, then try again.'));
      return;
    }
    state.running = true;
    tick = 0;
    lastTick = 0;
    runSteps = 0;
    syncAutoButton();
    replaceContent(status, biLabel('自动运行中……', 'Auto running…'));
    frameId = requestAnimationFrame(loop);
  }

  function loop(time) {
    frameId = 0;
    if (!state.running) return;
    if (!root.isConnected) {
      stopAuto();
      return;
    }
    const interval = tick < SLOW_TICKS ? SLOW_INTERVAL : FAST_INTERVAL;
    if (!lastTick || time - lastTick >= interval) {
      lastTick = time;
      const batch = autoStepsForTick(tick) * (reducedMotion ? 4 : 1);
      tick += 1;
      let reason = null;
      for (let index = 0; index < batch; index += 1) {
        takeStep();
        runSteps += 1;
        if (isConverged()) {
          reason = 'converged';
          break;
        }
        if (runSteps >= MAX_AUTO_STEPS) {
          reason = 'limit';
          break;
        }
      }
      syncSliders();
      render();
      if (reason) {
        stopAuto(reason);
        return;
      }
    }
    frameId = requestAnimationFrame(loop);
  }

  /** Stops an auto run; `reason` picks the status message (none when the learner changed something). 停止自动运行。 */
  function stopAuto(reason) {
    const wasRunning = state.running;
    state.running = false;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    syncAutoButton();
    if (!wasRunning || !reason) return;
    const mse = formatFixed(currentMse(), 2);
    // The slides stop as soon as the parameters are close to correct, so their last printed digit can
    // differ from the exact best line (lecture 5 slide 31 reads w0 = 8.65; the exact best is about 8.643).
    // 课件在参数“接近正确”时就停下，所以最后一位读数可能和精确的最佳直线不同（第 5 讲第 31 页写 w0 = 8.65，精确值约 8.643）。
    const exactBest = `y ${APPROX} ${lineText(best, 1)}`;
    const messages = {
      converged: [
        `参数已接近正确，自动停止：共 ${state.steps} 步，MSE ${APPROX} ${mse}。精确的最佳直线是 ${exactBest}；`
          + '梯度下降只要“接近正确”就可以停，所以课件上停下时的读数，最后一位可能和这里不一样。',
        `The parameters are close to correct. Stopped after ${stepsText(state.steps)}, MSE ${APPROX} ${mse}. `
          + `The exact best line is ${exactBest}; gradient descent may stop anywhere close to it, so a slide's last digit can differ.`,
      ],
      limit: [
        `已走到 ${MAX_AUTO_STEPS} 步上限，MSE 还在慢慢下降（现在 ${APPROX} ${mse}）。`,
        `Step limit reached; the MSE is still slowly going down (now ${APPROX} ${mse}).`,
      ],
      user: [
        `已停止：第 ${state.steps} 步，MSE ${APPROX} ${mse}。`,
        `Stopped at step ${state.steps}, MSE ${APPROX} ${mse}.`,
      ],
    };
    replaceContent(status, biLabel(...(messages[reason] || messages.user)));
  }

  function reset() {
    stopAuto();
    state.w = { ...model.start };
    state.pinned = null;
    restartHistory();
    syncSliders();
    render();
    replaceContent(status, biLabel('已恢复到起始直线。', 'Back to the starting line.'));
  }

  container.replaceChildren(root);
  syncAutoButton();
  if (!count) replaceContent(status, biLabel('没有数据点。', 'No data points.'));
  render();
  const stopObserving = frame.observe(render);

  return () => {
    stopAuto();
    stopObserving();
  };
}
