/**
 * Widget "least-squares-line": the least-squares regression line of STA220 Module 5. With data it draws the
 * scatterplot and the line, works out b1 = r · s_y / s_x and b0 = ȳ − b1 · x̄ step by step, shows the residual
 * e = y − ŷ of a selected point as a vertical segment, a residual plot with the residual table, R² = r², the
 * interpretation sentences, a prediction box with the extrapolation check, and a "try your own line" mode that
 * compares its sum of squared residuals with the least-squares line. From summary statistics (the exam style)
 * it shows the steps, the equation, the sentences and the prediction.
 * 组件“最小二乘直线”：STA220 第 5 单元的最小二乘回归直线。有数据时画出散点图和直线，一步步算出 b1 = r · s_y / s_x
 * 与 b0 = ȳ − b1 · x̄；选中一个点时用竖线显示它的残差 e = y − ŷ；另有残差图和残差表、R² = r²、解释句、带外推检查的
 * 预测框，以及与最小二乘直线比较残差平方和的“自己画一条直线”模式。只有概括统计量（考试题型）时，显示计算步骤、方程、
 * 解释句和预测。
 *
 * Config: { title, xLabel, yLabel, xName, yName: Bi, points: [[x, y], ...] }, or from summary statistics
 * { title, xName, yName: Bi, summary: { xbar, sx, ybar, sy, r } }.
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, scriptText, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { segmented } from '../../../components/controls/segmented.js';
import {
  biLabel, biText, biValue, ensureSharedStyles, legendIcon, teachPair,
} from '../../machine-learning/shared/ml-ui.js';
import { paramSlider } from '../../machine-learning/shared/param-slider.js';
import { createPlotFrame } from '../../machine-learning/shared/plot-frame.js';
import {
  compareWithBest, defaultPredictionX, equationLegend, equationText, fitLine, fitSentences, lineResiduals, lineSteps,
  normalizeLeastSquaresConfig, ownLineSpecs, plotExtents, pointDescription, pointOrder, predictionFor, rangeText,
  residualExtents, residualPlotDescription, residualRowsText, residualWork, scatterDescription, sentenceNames,
  visibleSegment,
} from './least-squares-line-logic.js';

// Pause before the live region reads out a value that changes while a slider is dragged or a number typed.
// 拖动滑块或输入数字时，等这么久再让朗读区域读出新结果。
const ANNOUNCE_DELAY = 450;

const TEXT = {
  eyebrow: { zh: '互动演示', en: 'Interactive' },
  introData: {
    zh: '每个点是一个观测 (x, y)。最小二乘直线（least-squares line）ŷ = b0 + b1x 是最贴近这些点的一条直线：先看它怎么一步步算出来，再点一个点看它的残差（residual），最后自己拖一条直线比一比。',
    en: 'Each dot is one observation (x, y). The least-squares line ŷ = b0 + b1x fits the dots best: see how it is computed, select a dot to see its residual, then try your own line.',
  },
  introSummary: {
    zh: '考试常常只给概括统计量（summary statistics）：两个平均数、两个标准差和相关系数 r。下面用它们一步步算出斜率（slope）b1 和截距（intercept）b0，写出回归方程，再做预测（prediction）。',
    en: 'Tests often give only summary statistics: the two means, the two standard deviations and r. Use them to compute the slope b1 and the intercept b0, write the equation and make a prediction.',
  },
  example: {
    zh: '这里显示的是课件第 5 单元第 33-44 页的药物含量与反应时间例子。',
    en: 'This is the drug amount and reaction time example of Module 5 (slides 33-44).',
  },
  modes: {
    best: { zh: '最小二乘直线', en: 'Least-squares line' },
    own: { zh: '自己画一条直线', en: 'Try your own line' },
  },
  modeGroup: '要画哪条直线 Which line to draw',
  hint: {
    zh: '把鼠标移到点上或点一下，看它的预测值 ŷ 和残差 e。键盘：Tab 进入，方向键换点，Enter 固定，Esc 取消。',
    en: 'Hover or tap a dot to see its ŷ and residual e. Keyboard: Tab in, arrow keys to move, Enter to pin, Escape to release.',
  },
  equation: { zh: '回归方程', en: 'Regression equation' },
  rounded: { zh: '保留两位小数', en: 'Rounded to 2 decimals' },
  selectedBest: { zh: '选中的点：残差', en: 'Selected point: residual' },
  selectedOwn: { zh: '选中的点：用你的直线算残差', en: 'Selected point: residual from your line' },
  residualRule: { zh: '残差 = 观测值 − 预测值', en: 'Residual = observed value − predicted value' },
  noSelection: {
    zh: '还没有选中的点：点一下图上的任意一个点。',
    en: 'No point selected yet: select any dot on the plot.',
  },
  own: { zh: '自己画一条直线', en: 'Try your own line' },
  ownIntro: {
    zh: '拖动两个滑块改变你的直线。红色竖线是每个点的残差；残差平方和 Σe² 越小，直线越贴近这些点。',
    en: 'Move the two sliders to change your line. The red segments are the residuals; the smaller the sum of squared residuals Σe², the closer the line is to the dots.',
  },
  ownLine: { zh: '你的直线', en: 'Your line' },
  showBest: { zh: '同时画出最小二乘直线（虚线）', en: 'Also draw the least-squares line (dashed)' },
  resetOwn: { zh: '回到水平线', en: 'Back to the flat line' },
  ownExtra: {
    zh: '补充（课件外）：“最小二乘”（least squares）的意思是：在所有直线中，它让残差平方和 Σe² = Σ(y − ŷ)² 最小。看看你能不能让 Σe² 更小？',
    en: 'Extra: "least squares" means that of all lines, this one makes the sum of squared residuals Σe² = Σ(y − ŷ)² as small as possible. Can you get a smaller Σe²?',
  },
  steps: { zh: '这条直线是怎么算出来的', en: 'How the line is computed' },
  formulaExtra: {
    zh: '补充（课件外）：b1 = r × (y 的标准差) ÷ (x 的标准差)、b0 = ȳ − b1 × x̄ 是由概括统计量求最小二乘直线的标准公式。如果题目直接给出方程（例如 ŷ = 13.31 + 0.69x），直接代入就行。',
    en: 'Extra: these are the standard formulas for the least-squares line from summary statistics. If a question gives the equation (such as ŷ = 13.31 + 0.69x), just use it.',
  },
  sentences: { zh: '考试这样写', en: 'How to write it on the test' },
  slopeLabel: { zh: '解释斜率（slope）', en: 'Interpret the slope' },
  interceptLabel: { zh: '解释截距（intercept）', en: 'Interpret the intercept' },
  rSquaredLabel: { zh: '决定系数（coefficient of determination）R²', en: 'Coefficient of determination R²' },
  rSquaredReminder: {
    zh: 'R² = r² 永远不会是负数；它说的是 y 的变化中有多大比例能由这条直线解释，不是 r 本身。',
    en: 'R² = r² is never negative; it is the share of the variation in y explained by the line, not r itself.',
  },
  prediction: { zh: '预测（prediction）', en: 'Prediction' },
  predictionInput: { zh: '输入一个 x 值', en: 'Enter a value of x' },
  observedRange: { zh: '观测到的 x 范围', en: 'Observed range of x' },
  notANumber: { zh: '请输入一个数。', en: 'Enter a number.' },
  tooLarge: { zh: '这个数太大了，请输入一个小一些的数。', en: 'This number is too large; enter a smaller one.' },
  extrapolation: { zh: '外推', en: 'Extrapolation' },
  insideRange: { zh: '在范围之内', en: 'Inside the range' },
  rangeUnknown: { zh: '注意', en: 'Note' },
  residualPlot: { zh: '残差图（residual plot）', en: 'Residual plot' },
  residualPlotIntro: {
    zh: '残差图把每个点的残差 e 画在纵轴上，中间的横线是 e = 0。点在横线上方，残差为正；在下方，残差为负。这张图用的是最小二乘直线。',
    en: 'A residual plot puts each residual e on the vertical axis; the middle line is e = 0. Dots above it have positive residuals, dots below negative ones. This plot uses the least-squares line.',
  },
  axisGroup: '残差图的横轴 Horizontal axis of the residual plot',
  axisX: { zh: '残差对 x', en: 'residuals vs x' },
  axisFitted: { zh: '残差对拟合值 ŷ', en: 'residuals vs fitted values ŷ' },
  fittedNote: {
    zh: 'R 的残差图常把拟合值 ŷ（fitted values）放在横轴。ŷ = b0 + b1x 只是把 x 换了一个刻度，所以图的样子不变（b1 < 0 时左右翻转）；两种图检查的内容完全一样。',
    en: 'R often puts the fitted values ŷ on the horizontal axis. Since ŷ = b0 + b1x is x on another scale, the picture keeps its shape (mirrored left to right when b1 < 0); both check the same things.',
  },
  checksTitle: { zh: '看残差图检查两件事', en: 'Two things to check in a residual plot' },
  checks: [
    {
      zh: '残差的平均数为 0（检查线性 linearity）：如果残差随机地散布在 0 的上下、看不出明显的规律（no major pattern），线性的假设成立。',
      en: 'Residuals have mean zero (linearity): if the residuals are randomly scattered around 0 with no major pattern, the linearity assumption is met.',
    },
    {
      zh: '残差的方差不变（constant variance）：如果残差上下散开的程度从左到右都差不多（没有喇叭形），方差不变的假设成立。',
      en: 'Residuals have constant variance: if the residuals are evenly spread out from left to right (no fan shape), the constant-variance assumption is met.',
    },
  ],
  tableBest: { zh: '最小二乘直线下每个点的预测值与残差', en: 'Prediction and residual of every point, least-squares line' },
  tableOwn: { zh: '你的直线下每个点的预测值与残差', en: 'Prediction and residual of every point, your line' },
  legend: {
    point: { zh: '数据点 (x, y)', en: 'data point (x, y)' },
    best: { zh: '最小二乘直线', en: 'least-squares line' },
    own: { zh: '你的直线', en: 'your line' },
    residual: { zh: '残差：点到直线的竖直距离', en: 'residual: vertical distance to the line' },
    mean: { zh: '平均点 (x̄, ȳ)', en: 'mean point (x̄, ȳ)' },
    range: { zh: '观测到的 x 范围', en: 'observed range of x' },
    prediction: { zh: '预测', en: 'prediction' },
  },
  residualAxis: { zh: '残差 e = y − ŷ', en: 'residual e = y − ŷ' },
  fittedAxis: { zh: '拟合值 ŷ', en: 'fitted values ŷ' },
};

const COLUMNS = [
  { symbol: 'i', name: { zh: '点', en: 'point' } },
  { symbol: 'x', name: { zh: '解释变量', en: 'explanatory' } },
  { symbol: 'y', name: { zh: '观测值', en: 'observed' } },
  { symbol: 'ŷ', name: { zh: '预测值', en: 'predicted' } },
  { symbol: 'e = y − ŷ', name: { zh: '残差', en: 'residual' } },
  { symbol: 'e²', name: { zh: '残差平方', en: 'squared residual' } },
];

let idCount = 0;

function nextId(prefix) {
  idCount += 1;
  return `${prefix}-${idCount}`;
}

// Indexed symbols of the formulas become subscripts: b0, b1, s_x, s_y, z_x and z_y.
// 公式里带下标的符号写成下标：b0、b1、s_x、s_y、z_x、z_y。
const SUBSCRIPT = /\b(b)([01])(?![\d.])|\b([sz])_([xy])\b/g;

/** Formula text with its subscripts, in the formula font. 带下标的公式文字，使用公式字体。 */
function mathNode(text, className) {
  const source = String(text ?? '');
  const span = h('span', { class: ['least-squares-line__math', className], lang: 'en' });
  let last = 0;
  for (const match of source.matchAll(SUBSCRIPT)) {
    if (match.index > last) span.append(source.slice(last, match.index));
    span.append(match[1] ?? match[3], h('sub', {}, match[2] ?? match[4]));
    last = match.index + match[0].length;
  }
  if (last < source.length) span.append(source.slice(last));
  return span;
}

/** An English sentence to write on the test, with its Chinese gloss below. 考试要写的英文句子，下面是中文释义。 */
function examSentence(sentence, className) {
  if (!sentence) return null;
  return h('div', { class: ['least-squares-line__exam', className] },
    enNode(sentence.en, 'p', 'least-squares-line__exam-en'),
    zhNode(sentence.zh, 'gloss', 'p', 'least-squares-line__exam-zh'));
}

/** A titled panel; the heading labels the section for screen readers. 带标题的面板，标题同时为读屏软件标注这一区域。 */
function panel(title, className, ...children) {
  const id = nextId('least-squares-line-heading');
  return h('section', { class: ['ml-panel', 'least-squares-line__panel', className], 'aria-labelledby': id },
    h('h4', { class: 'least-squares-line__panel-title', id }, biLabel(title.zh, title.en)),
    ...children);
}

/** A callout whose label carries an icon, so its meaning never rests on colour alone. 标签带图标的提示框，含义不只靠颜色表达。 */
function callout(tone, iconName, label, text) {
  return h('div', { class: ['callout', `callout--${tone}`, 'least-squares-line__callout'] },
    h('span', { class: 'callout__label least-squares-line__callout-label' }, icon(iconName, { size: 14 }), biLabel(label.zh, label.en)),
    teachPair(text.zh, text.en));
}

/**
 * Polite live region. Values that change while a slider is dragged are read once the learner pauses; a
 * non-breaking space toggled at the end lets the same message be read again.
 * 礼貌型朗读区域。拖动滑块时不断变化的值，等学习者停下来才读出；末尾交替添加不换行空格，使相同的消息也能再次朗读。
 */
function createAnnouncer() {
  const element = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let timer = 0;
  let toggle = false;
  const say = (text) => {
    toggle = !toggle;
    element.textContent = `${text}${toggle ? '\u00a0' : ''}`;
  };
  return {
    element,
    now(text) {
      window.clearTimeout(timer);
      say(text);
    },
    soon(text) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => say(text), ANNOUNCE_DELAY);
    },
    dispose() {
      window.clearTimeout(timer);
    },
  };
}

export async function mount(container, config, context) {
  await Promise.all([
    ensureSharedStyles(),
    ensureStylesheet(new URL('./least-squares-line.css', import.meta.url)),
  ]);

  const model = normalizeLeastSquaresConfig(config);
  const fit = fitLine(model);
  const names = sentenceNames(model);
  const sentences = fitSentences(fit, names);
  const isData = model.mode === 'data';
  const { points } = model;
  const resultDigits = fit.digits.result;
  const tableDigits = { resultDigits, xDigits: fit.digits.x, yDigits: fit.digits.y };

  // Listeners added here are removed together by the cleanup; the observers stop there too.
  // 这里添加的事件监听由清理函数统一移除，尺寸监听也在那里停止。
  const listeners = new AbortController();
  const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: listeners.signal });
  const stoppers = [];
  const live = createAnnouncer();

  const specs = isData ? ownLineSpecs(fit, points) : null;
  const state = {
    mode: 'best',
    own: specs ? { ...specs.start } : null,
    showBest: false,
    hovered: null,
    focused: null,
    pinned: null,
    predictX: String(defaultPredictionX(fit)),
    residualAxis: 'x',
  };
  const activeIndex = () => state.hovered ?? state.focused ?? state.pinned;
  const currentLine = () => (state.mode === 'own' ? state.own : fit);

  /* ---------- Header 标题 ---------- */
  const titleId = nextId('least-squares-line-title');
  const header = h('header', { class: 'least-squares-line__header' },
    h('p', { class: 'least-squares-line__eyebrow' }, biLabel(TEXT.eyebrow.zh, TEXT.eyebrow.en)),
    h('h3', { class: 'least-squares-line__title', id: titleId }, biTitle(model.title)),
    teachPair(isData ? TEXT.introData.zh : TEXT.introSummary.zh, isData ? TEXT.introData.en : TEXT.introSummary.en,
      'least-squares-line__intro'),
    model.usedDefault ? teachPair(TEXT.example.zh, TEXT.example.en, 'least-squares-line__example') : null);

  /* ---------- Equation panel 回归方程面板 ---------- */
  const workEquation = equationText(fit);
  const reportEquation = equationText(fit, { report: true });
  const legendText = equationLegend(names);
  const equationPanel = panel(TEXT.equation, 'least-squares-line__equation-panel',
    h('p', { class: 'least-squares-line__equation' }, mathNode(workEquation)),
    reportEquation !== workEquation
      ? h('p', { class: 'least-squares-line__equation-report' },
        h('span', { class: 'least-squares-line__tag' }, biLabel(TEXT.rounded.zh, TEXT.rounded.en)),
        mathNode(reportEquation))
      : null,
    h('p', { class: 'least-squares-line__names' }, biLabel(legendText.zh, legendText.en, 'gloss')),
    sentences.rSquared.work ? h('p', { class: 'least-squares-line__r2' }, mathNode(sentences.rSquared.work)) : null);

  /* ---------- Steps panel 计算步骤面板 ---------- */
  const steps = lineSteps(fit);
  const stepsPanel = panel(TEXT.steps, 'least-squares-line__steps-panel',
    h('ol', { class: 'least-squares-line__steps' }, steps.map((step) => h('li', { class: 'least-squares-line__step' },
      h('p', { class: 'least-squares-line__step-title' }, biLabel(step.title.zh, step.title.en)),
      step.rows.map((row) => h('div', { class: 'least-squares-line__step-row' },
        row.formula ? mathNode(row.formula, 'least-squares-line__formula') : null,
        row.work ? mathNode(row.work, 'least-squares-line__work') : null)),
      step.note ? teachPair(step.note.zh, step.note.en, 'least-squares-line__step-note') : null))),
    h('div', { class: 'callout callout--info least-squares-line__extra' }, teachPair(TEXT.formulaExtra.zh, TEXT.formulaExtra.en)));

  /* ---------- Sentences panel 解释句面板 ---------- */
  const sentenceItem = (label, ...children) => h('li', { class: 'least-squares-line__sentence' },
    h('p', { class: 'least-squares-line__sentence-label' }, biLabel(label.zh, label.en)),
    ...children);
  const { slope, intercept, rSquared } = sentences;
  const sentencesPanel = panel(TEXT.sentences, 'least-squares-line__sentences-panel',
    h('ul', { class: 'least-squares-line__sentences' },
      slope ? sentenceItem(TEXT.slopeLabel, examSentence(slope)) : null,
      intercept ? sentenceItem(TEXT.interceptLabel, examSentence(intercept),
        teachPair(intercept.note.zh, intercept.note.en, 'least-squares-line__sentence-note')) : null,
      sentenceItem(TEXT.rSquaredLabel,
        rSquared.work ? h('p', { class: 'least-squares-line__sentence-work' }, mathNode(rSquared.work)) : null,
        examSentence(rSquared.sentence),
        teachPair(TEXT.rSquaredReminder.zh, TEXT.rSquaredReminder.en, 'least-squares-line__sentence-note'))));

  /* ---------- Prediction panel 预测面板 ---------- */
  const inputId = nextId('least-squares-line-x');
  const rangeId = nextId('least-squares-line-range');
  const observed = rangeText(fit);
  const predictInput = h('input', {
    id: inputId,
    class: 'input least-squares-line__input',
    type: 'number',
    step: 'any',
    inputmode: 'decimal',
    value: state.predictX,
    'aria-describedby': observed ? rangeId : null,
  });
  const predictionResult = h('div', { class: 'least-squares-line__prediction-result' });
  const predictionPanel = panel(TEXT.prediction, 'least-squares-line__prediction-panel',
    h('div', { class: 'field least-squares-line__field' },
      h('label', { class: 'field__label', for: inputId }, biLabel(TEXT.predictionInput.zh, TEXT.predictionInput.en)),
      predictInput,
      observed
        ? h('p', { class: 'least-squares-line__range-info', id: rangeId },
          biLabel(`${TEXT.observedRange.zh}：${observed.zh}`, `${TEXT.observedRange.en}: ${observed.en}`))
        : null),
    predictionResult);

  function prediction() {
    return predictionFor(fit, state.predictX, names);
  }

  const refusal = (result) => (result.reason === 'too-large' ? TEXT.tooLarge : TEXT.notANumber);

  function renderPrediction() {
    const result = prediction();
    if (!result.ok) {
      const message = refusal(result);
      replaceContent(predictionResult,
        h('p', { class: 'least-squares-line__invalid' }, icon('alert', { size: 14 }), biLabel(message.zh, message.en)));
      return;
    }
    const outside = result.position === 'below' || result.position === 'above';
    const tone = { inside: ['tip', 'check', TEXT.insideRange], unknown: ['info', 'info', TEXT.rangeUnknown] };
    const [kind, iconName, label] = outside ? ['warn', 'alert', TEXT.extrapolation] : tone[result.position];
    replaceContent(predictionResult,
      h('p', { class: 'least-squares-line__prediction-work' }, mathNode(result.work)),
      examSentence(result.sentence),
      callout(kind, iconName, label, result.note));
  }

  function announcePrediction() {
    const result = prediction();
    live.soon(result.ok
      ? `${result.work}。${biText(result.sentence)} ${biText(result.note)}`
      : biText(refusal(result)));
  }

  listen(predictInput, 'input', () => {
    state.predictX = predictInput.value;
    renderPrediction();
    if (isData) drawMain();
    announcePrediction();
  });

  const root = h('section', { class: 'least-squares-line', 'aria-labelledby': titleId }, header);

  if (!isData) {
    root.append(
      h('div', { class: 'least-squares-line__summary-body' }, equationPanel, stepsPanel),
      sentencesPanel,
      predictionPanel,
      live.element);
    container.replaceChildren(root);
    renderPrediction();
    return () => {
      listeners.abort();
      live.dispose();
    };
  }

  /* ---------- Scatterplot 散点图 ---------- */
  const extents = plotExtents(points, fit);
  const box = { xMin: extents.x.min, xMax: extents.x.max, yMin: extents.y.min, yMax: extents.y.max };
  const ySpan = extents.y.max - extents.y.min;
  const mainFrame = createPlotFrame({
    xExtent: extents.x,
    yExtent: extents.y,
    role: 'group',
    label: '',
    xTitle: [biValue(model.xLabel), icon('arrowRight', { size: 14 })],
    yTitle: [icon('arrowUp', { size: 14 }), biValue(model.yLabel)],
  });
  const order = pointOrder(points);

  // Points work like the regression-mse points: hover or tap to show, Enter or Space to pin, arrow keys to
  // move between them (one Tab stop for the whole set), Escape to release.
  // 数据点的用法与 regression-mse 组件一致：悬停或点按显示，Enter 或空格固定，方向键在点之间移动（整组只占一个 Tab 位置），Esc 取消。
  const pointNodes = points.map((point) => {
    const node = s('g', { class: 'least-squares-line__point-group', tabindex: '-1', role: 'button' },
      s('circle', { class: 'least-squares-line__hit', r: 14 }),
      s('circle', { class: 'least-squares-line__focus-ring', r: 11 }),
      s('circle', { class: 'least-squares-line__point', r: 5.5 }));
    listen(node, 'pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      state.hovered = point.index;
      render();
    });
    listen(node, 'pointerleave', (event) => {
      if (event.pointerType !== 'mouse' || state.hovered !== point.index) return;
      state.hovered = null;
      render();
    });
    listen(node, 'click', () => togglePinned(point.index));
    // Focus takes over from a hover left behind by a resting mouse, so the panel shows the point just read out.
    // The screen reader reads the point's name (its coordinates, ŷ and e) on focus, so the live region adds only
    // the residual sentence.
    // 获得焦点时取代静止鼠标留下的悬停，面板显示的就是刚刚读出的那个点。读屏软件聚焦时会读出点的名称（坐标、ŷ 和 e），
    // 所以朗读区域只补充残差的那句话。
    listen(node, 'focus', () => {
      state.focused = point.index;
      state.hovered = null;
      setRoving(point.index);
      render();
      announcePoint(point.index, { nameRead: true });
    });
    listen(node, 'blur', () => {
      if (state.focused !== point.index) return;
      state.focused = null;
      render();
    });
    listen(node, 'keydown', (event) => onPointKey(event, point.index));
    return node;
  });
  if (order.length) pointNodes[order[0]].setAttribute('tabindex', '0');
  mainFrame.layers.points.append(...pointNodes);

  function setRoving(index) {
    pointNodes.forEach((node, nodeIndex) => node.setAttribute('tabindex', nodeIndex === index ? '0' : '-1'));
  }

  // A focused point was already read out when it got focus, so pinning it does not repeat that.
  // 获得焦点的点在聚焦时已经读过，固定它时不再重复。
  function togglePinned(index) {
    state.pinned = state.pinned === index ? null : index;
    render();
    if (state.pinned !== null && state.focused !== index) announcePoint(index);
  }

  function onPointKey(event, index) {
    const position = order.indexOf(index);
    const moves = {
      ArrowRight: position + 1, ArrowDown: position + 1, ArrowLeft: position - 1, ArrowUp: position - 1,
      Home: 0, End: order.length - 1,
    };
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePinned(index);
    } else if (event.key === 'Escape' && state.pinned !== null) {
      state.pinned = null;
      render();
    } else if (Object.hasOwn(moves, event.key)) {
      event.preventDefault();
      const target = order[(moves[event.key] + order.length) % order.length];
      setRoving(target);
      pointNodes[target].focus();
    }
  }

  // `nameRead`: the point's accessible name (pointDescription, set in drawMain) has just been read with its focus,
  // so only the residual sentence is new.
  // nameRead：点的无障碍名称（pointDescription，在 drawMain 中设置）刚刚随焦点读过，只有残差那句话是新的。
  function announcePoint(index, { nameRead = false } = {}) {
    const work = residualWork(currentLine(), points[index], { resultDigits });
    const sentence = work.sentence ? biText(work.sentence) : '';
    if (nameRead) {
      if (sentence) live.now(sentence);
      return;
    }
    live.now(`${pointDescription(currentLine(), points[index], { resultDigits })}。${sentence}`);
  }

  // Tapping empty space releases a pinned point. 点击空白处取消固定的点。
  listen(mainFrame.svg, 'click', (event) => {
    if (event.target instanceof Element && event.target.closest('.least-squares-line__point-group')) return;
    if (state.pinned === null) return;
    state.pinned = null;
    render();
  });

  const legendItem = (draw, label) => h('li', { class: 'ml-legend__item' }, legendIcon(draw), h('span', {}, biLabel(label.zh, label.en)));
  // The legend lists only what is drawn: the own-line mode swaps the lines and leaves out the prediction.
  // 图例只列出画出来的东西：自己画直线模式会换掉直线，并且不画预测。
  const lineIcon = (modifier) => () => s('line', {
    class: ['least-squares-line__line', `least-squares-line__line--${modifier}`], x1: 2, y1: 16, x2: 18, y2: 4,
  });
  const legendItems = {
    best: legendItem(lineIcon('best'), TEXT.legend.best),
    reference: legendItem(lineIcon('reference'), TEXT.legend.best),
    own: legendItem(lineIcon('own'), TEXT.legend.own),
    prediction: legendItem(() => s('path', { class: 'least-squares-line__predict-marker', d: 'M10 4 L16 10 L10 16 L4 10 Z' }), TEXT.legend.prediction),
  };
  const legend = h('ul', { class: 'ml-legend least-squares-line__legend' },
    legendItem(() => s('circle', { class: 'least-squares-line__point', cx: 10, cy: 10, r: 5 }), TEXT.legend.point),
    legendItems.best,
    legendItems.reference,
    legendItems.own,
    legendItem(() => s('line', { class: 'least-squares-line__residual', x1: 10, y1: 3, x2: 10, y2: 17 }), TEXT.legend.residual),
    legendItem(() => s('path', { class: 'least-squares-line__mean', d: 'M4 10 H16 M10 4 V16' }), TEXT.legend.mean),
    legendItem(() => s('rect', { class: 'least-squares-line__range', x: 3, y: 2, width: 14, height: 16 }), TEXT.legend.range),
    legendItems.prediction);

  function syncLegend() {
    const own = state.mode === 'own';
    legendItems.best.hidden = own;
    legendItems.reference.hidden = !(own && state.showBest);
    legendItems.own.hidden = !own;
    legendItems.prediction.hidden = own;
  }

  const figure = h('div', { class: 'ml-panel least-squares-line__figure' },
    mainFrame.element,
    legend,
    teachPair(TEXT.hint.zh, TEXT.hint.en, 'least-squares-line__hint'));

  /* ---------- Mode switch 模式切换 ---------- */
  const modeSwitch = segmented({
    options: ['best', 'own'].map((value) => ({ value, label: biLabel(TEXT.modes[value].zh, TEXT.modes[value].en) })),
    value: state.mode,
    ariaLabel: TEXT.modeGroup,
    className: 'least-squares-line__modes',
    onChange: (value) => {
      state.mode = value;
      render();
      live.now(biText(TEXT.modes[value]));
    },
  });

  /* ---------- Selected point 选中的点 ---------- */
  const selectedTitle = h('h4', { class: 'least-squares-line__panel-title', id: nextId('least-squares-line-heading') });
  const selectedBody = h('div', { class: 'least-squares-line__selected-body' });
  const selectedPanel = h('section', {
    class: 'ml-panel least-squares-line__panel least-squares-line__selected',
    'aria-labelledby': selectedTitle.id,
  },
  selectedTitle,
  h('p', { class: 'least-squares-line__rule' },
    biLabel(TEXT.residualRule.zh, TEXT.residualRule.en), ' ', mathNode('e = y − ŷ')),
  selectedBody);

  function renderSelected() {
    const title = state.mode === 'own' ? TEXT.selectedOwn : TEXT.selectedBest;
    replaceContent(selectedTitle, biLabel(title.zh, title.en));
    const index = activeIndex();
    if (index === null) {
      replaceContent(selectedBody, teachPair(TEXT.noSelection.zh, TEXT.noSelection.en, 'least-squares-line__muted'));
      return;
    }
    const work = residualWork(currentLine(), points[index], { resultDigits });
    replaceContent(selectedBody,
      scriptText(pointDescription(currentLine(), points[index], { resultDigits }), {
        role: 'label', tag: 'p', className: 'least-squares-line__selected-point',
      }),
      work.lines.map((line) => h('p', { class: 'least-squares-line__selected-work' }, mathNode(line))),
      work.sentence ? teachPair(work.sentence.zh, work.sentence.en, `least-squares-line__verdict least-squares-line__verdict--${work.kind}`) : null);
  }

  /* ---------- Own line 自己的直线 ---------- */
  const sliders = {
    b0: paramSlider({
      symbol: 'b₀', hint: biLabel('截距', 'intercept'), ...specs.b0, value: state.own.b0,
      onChange: (value) => setOwn('b0', value),
    }),
    b1: paramSlider({
      symbol: 'b₁', hint: biLabel('斜率', 'slope'), ...specs.b1, value: state.own.b1,
      onChange: (value) => setOwn('b1', value),
    }),
  };
  const ownEquation = h('p', { class: 'least-squares-line__own-equation' });
  const ownCompare = h('div', { class: 'least-squares-line__own-compare' });
  const showBestInput = h('input', { type: 'checkbox' });
  listen(showBestInput, 'change', () => {
    state.showBest = showBestInput.checked;
    render();
  });
  const resetButton = button({
    label: biLabel(TEXT.resetOwn.zh, TEXT.resetOwn.en),
    iconName: 'refresh',
    variant: 'ghost',
    size: 'sm',
    onClick: () => {
      state.own = { ...specs.start };
      sliders.b0.setValue(state.own.b0);
      sliders.b1.setValue(state.own.b1);
      render();
      live.now(biText(compareWithBest(state.own, fit, points, { resultDigits }).message));
    },
  });
  const ownPanel = panel(TEXT.own, 'least-squares-line__own',
    teachPair(TEXT.ownIntro.zh, TEXT.ownIntro.en, 'least-squares-line__muted'),
    h('div', { class: 'ml-sliders least-squares-line__sliders' }, sliders.b0.element, sliders.b1.element),
    ownEquation,
    ownCompare,
    h('label', { class: 'check-row least-squares-line__check' }, showBestInput, h('span', {}, biLabel(TEXT.showBest.zh, TEXT.showBest.en))),
    h('div', { class: 'least-squares-line__actions' }, resetButton),
    h('div', { class: 'callout callout--info least-squares-line__extra' }, teachPair(TEXT.ownExtra.zh, TEXT.ownExtra.en)));

  function setOwn(key, value) {
    state.own = { ...state.own, [key]: value };
    render();
    live.soon(biText(compareWithBest(state.own, fit, points, { resultDigits }).message));
  }

  function renderOwn() {
    const comparison = compareWithBest(state.own, fit, points, { resultDigits });
    replaceContent(ownEquation,
      h('span', { class: 'least-squares-line__tag' }, biLabel(TEXT.ownLine.zh, TEXT.ownLine.en)),
      mathNode(equationText(state.own)));
    replaceContent(ownCompare,
      h('p', { class: 'least-squares-line__sse' },
        mathNode(`Σe² ${comparison.ownSign} ${comparison.ownText}`, 'least-squares-line__sse-own'),
        h('span', { class: 'least-squares-line__sse-best' },
          biLabel(TEXT.legend.best.zh, TEXT.legend.best.en), ' ', mathNode(`Σe² ${comparison.bestSign} ${comparison.bestText}`))),
      teachPair(comparison.message.zh, comparison.message.en,
        `least-squares-line__compare least-squares-line__compare--${comparison.status}`));
  }

  /* ---------- Residual plot and table 残差图与残差表 ---------- */
  const residualFrames = {};
  const residualHosts = {};
  for (const axis of ['x', 'fitted']) {
    const range = residualExtents(fit.rows, axis, extents.x);
    const frame = createPlotFrame({
      xExtent: range.x,
      yExtent: range.y,
      role: 'img',
      label: biText(residualPlotDescription(fit, axis)),
      aspect: 0.42,
      minHeight: 170,
      maxHeight: 280,
      xTitle: [axis === 'fitted' ? biLabel(TEXT.fittedAxis.zh, TEXT.fittedAxis.en) : biValue(model.xLabel), icon('arrowRight', { size: 14 })],
      yTitle: [icon('arrowUp', { size: 14 }), biLabel(TEXT.residualAxis.zh, TEXT.residualAxis.en)],
    });
    residualFrames[axis] = frame;
    residualHosts[axis] = h('div', { class: 'least-squares-line__residual-host', hidden: axis !== state.residualAxis }, frame.element);
  }
  const fittedNote = teachPair(TEXT.fittedNote.zh, TEXT.fittedNote.en, 'least-squares-line__muted');
  fittedNote.hidden = state.residualAxis !== 'fitted';
  const axisSwitch = segmented({
    options: [
      { value: 'x', label: biLabel(TEXT.axisX.zh, TEXT.axisX.en) },
      { value: 'fitted', label: biLabel(TEXT.axisFitted.zh, TEXT.axisFitted.en) },
    ],
    value: state.residualAxis,
    ariaLabel: TEXT.axisGroup,
    size: 'sm',
    className: 'least-squares-line__axis-switch',
    onChange: (value) => {
      state.residualAxis = value;
      residualHosts.x.hidden = value !== 'x';
      residualHosts.fitted.hidden = value !== 'fitted';
      fittedNote.hidden = value !== 'fitted';
      render();
    },
  });

  const headCell = (column) => h('th', { scope: 'col' },
    mathNode(column.symbol, 'least-squares-line__th-symbol'),
    h('span', { class: 'least-squares-line__th-name' }, biLabel(column.name.zh, column.name.en)));
  const rowViews = points.map((point) => {
    const cells = ['x', 'y', 'yHat', 'residual', 'squared']
      .map((key) => [key, h('td', { class: 'least-squares-line__num' })]);
    const row = h('tr', {}, h('th', { scope: 'row', class: 'least-squares-line__num' }, String(point.index + 1)),
      cells.map(([, cell]) => cell));
    listen(row, 'pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      state.hovered = point.index;
      render();
    });
    listen(row, 'pointerleave', (event) => {
      if (event.pointerType !== 'mouse' || state.hovered !== point.index) return;
      state.hovered = null;
      render();
    });
    return { row, cells: Object.fromEntries(cells) };
  });
  const tableCaption = h('caption', { class: 'least-squares-line__caption' });
  const sumResidualCell = h('td', { class: 'least-squares-line__num' });
  const sseCell = h('td', { class: 'least-squares-line__num' });
  const footRow = (symbol, zh, en, cell) => h('tr', {},
    h('th', { scope: 'row', colspan: 5 }, mathNode(symbol), ' ', biLabel(zh, en)),
    cell);
  const table = h('table', { class: 'data-table least-squares-line__table' },
    tableCaption,
    h('thead', {}, h('tr', {}, COLUMNS.map(headCell))),
    h('tbody', {}, rowViews.map((view) => view.row)),
    h('tfoot', {},
      footRow('Σe', '残差之和', 'sum of residuals', sumResidualCell),
      footRow('Σe²', '残差平方和', 'sum of squared residuals', sseCell)));

  const residualPanel = panel(TEXT.residualPlot, 'least-squares-line__residual-panel',
    teachPair(TEXT.residualPlotIntro.zh, TEXT.residualPlotIntro.en, 'least-squares-line__muted'),
    axisSwitch,
    h('div', { class: 'least-squares-line__residual-plots' }, residualHosts.x, residualHosts.fitted),
    fittedNote,
    h('div', { class: 'least-squares-line__checks' },
      h('p', { class: 'least-squares-line__checks-title' }, biLabel(TEXT.checksTitle.zh, TEXT.checksTitle.en)),
      h('ol', { class: 'least-squares-line__check-list' },
        TEXT.checks.map((check) => h('li', {}, teachPair(check.zh, check.en))))),
    h('div', { class: 'table-scroll least-squares-line__table-wrap' }, table));

  /* ---------- Drawing 绘制 ---------- */
  const keepNear = (value) => Math.min(extents.y.max + ySpan, Math.max(extents.y.min - ySpan, value));

  function lineNode(line, modifier, { x, y }) {
    const segment = visibleSegment(line, box);
    if (!segment) return null;
    return s('line', {
      class: ['least-squares-line__line', `least-squares-line__line--${modifier}`],
      x1: x(segment[0][0]).toFixed(1),
      y1: y(segment[0][1]).toFixed(1),
      x2: x(segment[1][0]).toFixed(1),
      y2: y(segment[1][1]).toFixed(1),
    });
  }

  function predictionMarks(geometry) {
    if (state.mode !== 'best') return null;
    const result = prediction();
    if (!result.ok) return null;
    const { plot, x, y } = geometry;
    const px = x(result.x);
    if (px < plot.left || px > plot.right) return null;
    const py = y(keepNear(result.yHat));
    const at = (value) => value.toFixed(1);
    return [
      s('line', { class: 'least-squares-line__guide', x1: at(px), x2: at(px), y1: plot.bottom, y2: at(py) }),
      s('line', { class: 'least-squares-line__guide', x1: plot.left, x2: at(px), y1: at(py), y2: at(py) }),
      s('path', {
        class: 'least-squares-line__predict-marker',
        d: `M${at(px)} ${at(py - 6)} L${at(px + 6)} ${at(py)} L${at(px)} ${at(py + 6)} L${at(px - 6)} ${at(py)} Z`,
      }),
    ];
  }

  function drawMain() {
    const geometry = mainFrame.layout();
    const { plot, x, y } = geometry;
    const line = currentLine();
    const rows = lineResiduals(line, points);
    const active = activeIndex();
    const left = x(fit.xMin);
    const right = x(fit.xMax);
    replaceContent(mainFrame.layers.regions,
      s('rect', { class: 'least-squares-line__range', x: left.toFixed(1), y: plot.top, width: (right - left).toFixed(1), height: plot.bottom - plot.top }),
      [left, right].map((edge) => s('line', { class: 'least-squares-line__range-edge', x1: edge.toFixed(1), x2: edge.toFixed(1), y1: plot.top, y2: plot.bottom })));
    const meanX = x(fit.xbar);
    const meanY = y(fit.ybar);
    replaceContent(mainFrame.layers.marks,
      rows.map((row) => s('line', {
        class: ['least-squares-line__residual', active === row.index ? 'is-active' : null],
        x1: x(row.x).toFixed(1),
        x2: x(row.x).toFixed(1),
        y1: y(row.y).toFixed(1),
        y2: y(keepNear(row.yHat)).toFixed(1),
      })),
      state.mode === 'own' && state.showBest ? lineNode(fit, 'reference', geometry) : null,
      lineNode(line, state.mode === 'own' ? 'own' : 'best', geometry),
      s('path', {
        class: 'least-squares-line__mean',
        d: `M${(meanX - 7).toFixed(1)} ${meanY.toFixed(1)} H${(meanX + 7).toFixed(1)} `
          + `M${meanX.toFixed(1)} ${(meanY - 7).toFixed(1)} V${(meanY + 7).toFixed(1)}`,
      }),
      predictionMarks(geometry));
    for (const point of points) {
      const node = pointNodes[point.index];
      node.setAttribute('transform', `translate(${x(point.x).toFixed(1)} ${y(point.y).toFixed(1)})`);
      node.classList.toggle('is-active', active === point.index);
      node.setAttribute('aria-pressed', String(state.pinned === point.index));
      node.setAttribute('aria-label', pointDescription(line, point, { resultDigits }));
    }
    drawLabels(geometry, line);
    mainFrame.svg.setAttribute('aria-label', biText(scatterDescription(fit, line, { own: state.mode === 'own' })));
    syncLegend();
  }

  // Labels "y" and "ŷ" for the highlighted point, and its residual e between them.
  // 给选中的点标出“y”和“ŷ”，并在两者之间写出它的残差 e。
  function drawLabels(geometry, line) {
    const index = activeIndex();
    if (index === null) {
      replaceContent(mainFrame.layers.overlay);
      return;
    }
    const work = residualWork(line, points[index], { resultDigits });
    const { plot } = geometry;
    const px = geometry.x(work.x);
    const pyPoint = geometry.y(work.y);
    const pyRaw = geometry.y(work.yHat);
    const lineVisible = pyRaw >= plot.top && pyRaw <= plot.bottom;
    const pyLine = Math.min(plot.bottom, Math.max(plot.top, pyRaw));
    const onRight = px < (plot.left + plot.right) / 2;
    const label = (text, yPosition, modifier) => s('text', {
      class: ['least-squares-line__label', `least-squares-line__label--${modifier}`],
      x: (px + (onRight ? 10 : -10)).toFixed(1),
      y: yPosition.toFixed(1),
      'text-anchor': onRight ? 'start' : 'end',
    }, text);
    replaceContent(mainFrame.layers.overlay,
      label('y', pyPoint + 4, 'y'),
      lineVisible && Math.abs(pyRaw - pyPoint) > 14 ? label('ŷ', pyLine + 4, 'yhat') : null,
      Math.abs(pyLine - pyPoint) > 34 ? label(`e = ${work.residualText}`, (pyPoint + pyLine) / 2 + 4, 'e') : null);
  }

  function drawResidualPlot(axis) {
    const frame = residualFrames[axis];
    const { plot, x, y } = frame.layout();
    const active = activeIndex();
    replaceContent(frame.layers.marks,
      s('line', { class: 'least-squares-line__zero', x1: plot.left, x2: plot.right, y1: y(0).toFixed(1), y2: y(0).toFixed(1) }));
    replaceContent(frame.layers.points, fit.rows.map((row) => s('circle', {
      class: ['least-squares-line__residual-point', active === row.index ? 'is-active' : null],
      cx: x(axis === 'fitted' ? row.yHat : row.x).toFixed(1),
      cy: y(row.residual).toFixed(1),
      r: active === row.index ? 6.5 : 4.5,
    })));
  }

  function renderTable() {
    const text = residualRowsText(currentLine(), points, tableDigits);
    const caption = state.mode === 'own' ? TEXT.tableOwn : TEXT.tableBest;
    replaceContent(tableCaption, biLabel(caption.zh, caption.en));
    const active = activeIndex();
    for (const row of text.rows) {
      const view = rowViews[row.index];
      for (const key of ['x', 'y', 'yHat', 'residual', 'squared']) view.cells[key].textContent = row[key];
      view.row.classList.toggle('is-active', active === row.index);
    }
    sumResidualCell.textContent = text.sumResiduals;
    sseCell.textContent = text.sse;
  }

  function render() {
    const own = state.mode === 'own';
    ownPanel.hidden = !own;
    drawMain();
    drawResidualPlot('x');
    drawResidualPlot('fitted');
    renderSelected();
    renderTable();
    if (own) renderOwn();
    renderPrediction();
  }

  // The own-line sliders come first in the side column, so on a phone they sit right under the plot they move.
  // 自己画直线的滑块放在侧栏最前面，手机上它们就紧挨在所控制的图下方。
  ownPanel.hidden = true;
  root.append(
    modeSwitch,
    h('div', { class: 'least-squares-line__body' },
      figure,
      h('div', { class: 'least-squares-line__side' }, ownPanel, equationPanel, selectedPanel)),
    stepsPanel,
    sentencesPanel,
    predictionPanel,
    residualPanel,
    live.element);
  container.replaceChildren(root);
  render();
  stoppers.push(mainFrame.observe(render), residualFrames.x.observe(render), residualFrames.fitted.observe(render));

  return () => {
    listeners.abort();
    stoppers.forEach((stop) => stop());
    live.dispose();
  };
}
