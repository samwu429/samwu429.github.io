/**
 * Widget "neuron": one artificial neuron (lec07 p.5, p.9). Inputs x1, x2, ... are multiplied by the
 * weights w1, w2, ..., added together with b, and the activation function turns the sum into the output.
 * Sliders change every number; the diagram, the activation plot and the written-out computation follow.
 * 组件“neuron”：一个人工神经元（lec07 第 5、9 页）。输入 x1, x2… 乘以权重 w1, w2…，与 b 相加，
 * 再由激活函数把和变成输出。滑块可以改每个数字，示意图、激活函数小图和完整算式同步更新。
 *
 * Config: { inputs: [{ name, value }], weights: [number], bias: number, activation: "sigmoid" | "relu" | "step" }
 */
import { h, s, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { segmented } from '../../../components/controls/segmented.js';
import {
  ACTIVATION_NAMES,
  activationCurve,
  activationRange,
  computeNeuron,
  describeComputation,
  displayNumber,
  edgeStyle,
  normalizeNeuronConfig,
  roundTo,
  sliderRange,
} from './neuron-logic.js';

const PLOT_SPAN = 10;

const ACTIVATION_OPTIONS = [
  { value: 'sigmoid', label: 'Sigmoid' },
  { value: 'relu', label: 'ReLU' },
  { value: 'step', label: '阶跃 Step' },
];

const INTRO = {
  zh: '拖动滑块改输入、权重和 b：先乘，再加，最后交给激活函数，看输出怎么变。',
  en: 'Move the sliders: multiply, add, then apply the activation function.',
};

const ACTIVATION_NOTES = {
  sigmoid: {
    zh: 'Sigmoid 是 S 形曲线：输出总在 0 和 1 之间，随加权和平滑变化，不是“全有或全无”。',
    en: 'S-shaped: the output is always between 0 and 1 and changes smoothly.',
  },
  relu: {
    zh: 'ReLU（Rectified Linear Unit）：加权和是负数就输出 0；是正数就原样输出。',
    en: 'A negative sum gives 0; a positive sum passes through unchanged.',
  },
  step: {
    zh: '补充（课件外）：阶跃函数只输出 0 或 1（和 ≥ 0 就是 1），像生物神经元的“放或不放”。课件强调人工激活函数不是这样全有或全无的，这里只用来对比。',
    en: 'Only 0 or 1, like a biological neuron that fires or does not. Shown only for comparison.',
  },
};

const BIAS_NOTE = {
  zh: 'b 是课件图里加在和上的一项（`w1x1 + w2x2 + ··· + b`），课件没有解释。补充（课件外）：它常被叫作偏置（bias），能把加权和整体抬高或压低。',
  en: 'b is the extra term in the slide formula; it is often called the bias.',
};

// Diagram geometry in SVG units; the SVG scales to the available width. A narrower layout is drawn
// as well and shown on phones (see neuron.css), so its text is not scaled down to an unreadable size.
// 示意图的几何尺寸（SVG 单位），SVG 会按可用宽度缩放。另外画一个更窄的版本在手机上显示（见 neuron.css），
// 这样文字不会被缩到看不清。
const WIDE = {
  width: 420,
  rowGap: 64,
  minCy: 120,
  headerY: [13, 26],
  inputX: 4,
  inputWidth: 84,
  pillHeight: 34,
  weightsX: 136,
  sumX: 218,
  sumR: 28,
  actX: 274,
  actWidth: 56,
  actHeight: 44,
  outX: 384,
  outR: 30,
};

// The narrow layout has room for up to three input rows; with more, only the wide drawing is made.
// 窄版最多放得下三行输入；输入更多时只画宽版。
const COMPACT_MAX_INPUTS = 3;

const COMPACT = {
  width: 340,
  rowGap: 64,
  minCy: 126,
  headerY: [14, 29],
  inputX: 2,
  inputWidth: 84,
  pillHeight: 32,
  weightsX: 121,
  sumX: 180,
  sumR: 24,
  actX: 222,
  actWidth: 44,
  actHeight: 40,
  outX: 306,
  outR: 24,
};

let instanceCount = 0;

function teachPair(value, className, role = 'teach') {
  return h('div', { class: ['neuron__pair', className] },
    zhNode(value.zh, role, 'p', 'neuron__zh'),
    enNode(value.en, 'p', 'neuron__en'));
}

// Slider step: 0.1 unless a configured number needs finer steps. 滑块步长：默认 0.1，配置数字更精细时改为 0.01。
function stepFor(values) {
  return values.every((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9) ? 0.1 : 0.01;
}

function createSlider({ id, symbol, hint, range, step, onInput }) {
  const output = h('output', { class: 'neuron__value', for: id });
  const input = h('input', { type: 'range', id, class: 'neuron__range', min: range.min, max: range.max, step });
  const show = (value) => {
    const text = displayNumber(value, 2);
    output.textContent = text;
    input.setAttribute('aria-valuetext', `${symbol} = ${text}`);
  };
  input.addEventListener('input', () => {
    const value = roundTo(Number(input.value), 2);
    show(value);
    onInput(value);
  });
  const row = h('div', { class: 'neuron__slider' },
    h('label', { class: 'neuron__label', for: id },
      h('span', { class: 'neuron__symbol' }, symbol),
      h('span', { class: 'neuron__hint' }, hint)),
    input,
    output);
  return {
    row,
    set(value) {
      input.value = String(value);
      show(value);
    },
  };
}

function arrowPoints(tip, angle, size) {
  const backX = tip.x - Math.cos(angle) * size;
  const backY = tip.y - Math.sin(angle) * size;
  const spreadX = -Math.sin(angle) * size * 0.55;
  const spreadY = Math.cos(angle) * size * 0.55;
  return [
    `${tip.x.toFixed(1)},${tip.y.toFixed(1)}`,
    `${(backX + spreadX).toFixed(1)},${(backY + spreadY).toFixed(1)}`,
    `${(backX - spreadX).toFixed(1)},${(backY - spreadY).toFixed(1)}`,
  ].join(' ');
}

function curvePath(name, box) {
  const range = activationRange(name, PLOT_SPAN);
  return activationCurve(name, PLOT_SPAN).map(([z, value], index) => {
    const x = box.left + ((z + PLOT_SPAN) / (2 * PLOT_SPAN)) * (box.right - box.left);
    const y = box.bottom - ((value - range.min) / (range.max - range.min)) * (box.bottom - box.top);
    return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

/**
 * Builds the neuron diagram once in the given geometry; update() only changes attributes and text.
 * `variant` is "wide" or "compact" when both drawings exist (CSS shows one of them), else "single".
 * 按给定的几何尺寸只构建一次神经元示意图；update() 只修改属性和文字。
 * 两张图都有时 variant 为 "wide" 或 "compact"（由 CSS 显示其中一张），只有一张时为 "single"。
 */
function createDiagram(uid, inputs, G, variant) {
  const count = inputs.length;
  const half = ((count - 1) / 2) * G.rowGap;
  const cy = Math.max(G.minCy, half + 52);
  const height = Math.max(cy + half + 29, cy + 62);
  const rowY = inputs.map((_, index) => cy - half + index * G.rowGap);
  const levelId = `${uid}-${variant}-level`;

  const headers = [
    [G.inputX + G.inputWidth / 2, '输入', 'inputs'],
    [G.weightsX, '权重', 'weights'],
    [G.sumX, '加权和', 'sum'],
    [G.actX + G.actWidth / 2, '激活函数', 'activation'],
    [G.outX, '输出', 'output'],
  ].map(([x, zh, en]) => s('g', { class: 'neuron__column' },
    s('text', { x, y: G.headerY[0], class: 'neuron__column-zh', 'text-anchor': 'middle' }, zh),
    s('text', { x, y: G.headerY[1], class: 'neuron__column-en', 'text-anchor': 'middle' }, en)));

  const edges = rowY.map((y) => {
    const line = s('line', { class: 'neuron__edge' });
    const arrow = s('polygon', { class: 'neuron__arrow' });
    const label = s('text', { class: 'neuron__edge-label', 'text-anchor': 'middle' });
    const dx = G.sumX - (G.inputX + G.inputWidth);
    const dy = cy - y;
    const length = Math.hypot(dx, dy);
    return { line, arrow, label, y, ux: dx / length, uy: dy / length, length };
  });

  const inputNodes = rowY.map((y) => {
    const text = s('text', { x: G.inputX + G.inputWidth / 2, y: y + 5, class: 'neuron__node-text', 'text-anchor': 'middle' });
    return {
      text,
      group: s('g', {},
        s('rect', { x: G.inputX, y: y - G.pillHeight / 2, width: G.inputWidth, height: G.pillHeight, rx: G.pillHeight / 2, class: 'neuron__node' }),
        text),
    };
  });

  const biasY = cy - 72;
  const biasText = s('text', { x: G.sumX, y: biasY + 5, class: 'neuron__node-text', 'text-anchor': 'middle' });
  const sumText = s('text', { x: G.sumX, y: cy + 50, class: 'neuron__value-text', 'text-anchor': 'middle' });
  const actBox = { left: G.actX + 6, right: G.actX + G.actWidth - 6, top: cy - 14, bottom: cy + 14 };
  const actCurve = s('path', { class: 'neuron__mini-curve' });
  const actName = s('text', { x: G.actX + G.actWidth / 2, y: cy + 40, class: 'neuron__caption', 'text-anchor': 'middle' });
  const levelRect = s('rect', { x: G.outX - G.outR, width: G.outR * 2 });
  const outText = s('text', { x: G.outX, y: cy + 5, class: 'neuron__value-text', 'text-anchor': 'middle' });

  const svg = s('svg', {
    class: ['neuron__diagram', `neuron__diagram--${variant}`],
    viewBox: `0 0 ${G.width} ${height}`,
    role: 'img',
    focusable: 'false',
  },
  s('defs', {}, s('clipPath', { id: levelId }, levelRect)),
  headers,
  edges.map((edge) => [edge.line, edge.arrow]),
  edges.map((edge) => edge.label),
  inputNodes.map((node) => node.group),
  s('rect', { x: G.sumX - 38, y: biasY - 14, width: 76, height: 28, rx: 14, class: 'neuron__node neuron__node--bias' }),
  biasText,
  s('line', { x1: G.sumX, y1: biasY + 14, x2: G.sumX, y2: cy - G.sumR - 9, class: 'neuron__edge neuron__edge--flow' }),
  s('polygon', { points: arrowPoints({ x: G.sumX, y: cy - G.sumR - 1 }, Math.PI / 2, 9), class: 'neuron__arrow neuron__arrow--flow' }),
  s('circle', { cx: G.sumX, cy, r: G.sumR, class: 'neuron__node neuron__node--sum' }),
  s('text', { x: G.sumX, y: cy + 8, class: 'neuron__sigma', 'text-anchor': 'middle' }, 'Σ'),
  sumText,
  s('line', { x1: G.sumX + G.sumR, y1: cy, x2: G.actX - 9, y2: cy, class: 'neuron__edge neuron__edge--flow' }),
  s('polygon', { points: arrowPoints({ x: G.actX - 1, y: cy }, 0, 9), class: 'neuron__arrow neuron__arrow--flow' }),
  s('rect', { x: G.actX, y: cy - G.actHeight / 2, width: G.actWidth, height: G.actHeight, rx: 8, class: 'neuron__node neuron__node--activation' }),
  actCurve,
  actName,
  s('line', { x1: G.actX + G.actWidth, y1: cy, x2: G.outX - G.outR - 9, y2: cy, class: 'neuron__edge neuron__edge--flow' }),
  s('polygon', { points: arrowPoints({ x: G.outX - G.outR - 1, y: cy }, 0, 9), class: 'neuron__arrow neuron__arrow--flow' }),
  s('circle', { cx: G.outX, cy, r: G.outR, class: 'neuron__node neuron__node--output' }),
  s('circle', { cx: G.outX, cy, r: G.outR - 2, class: 'neuron__level', 'clip-path': `url(#${levelId})` }),
  outText);

  function update(state, result, ranges) {
    state.inputs.forEach((input, index) => {
      inputNodes[index].text.textContent = `${input.name} = ${displayNumber(input.value, 2)}`;
      const edge = edges[index];
      const weight = state.weights[index];
      const style = edgeStyle(weight, ranges.weight);
      const startX = G.inputX + G.inputWidth;
      const size = 7 + style.width * 0.8;
      const tip = { x: G.sumX - edge.ux * (G.sumR + 1), y: cy - edge.uy * (G.sumR + 1) };
      edge.line.setAttribute('x1', startX);
      edge.line.setAttribute('y1', edge.y);
      edge.line.setAttribute('x2', (tip.x - edge.ux * size * 0.7).toFixed(1));
      edge.line.setAttribute('y2', (tip.y - edge.uy * size * 0.7).toFixed(1));
      edge.line.setAttribute('stroke-width', style.width);
      edge.line.setAttribute('class', `neuron__edge neuron__edge--${style.sign}`);
      edge.arrow.setAttribute('points', arrowPoints(tip, Math.atan2(edge.uy, edge.ux), size));
      edge.arrow.setAttribute('class', `neuron__arrow neuron__arrow--${style.sign}`);
      const along = edge.length * 0.42;
      const lift = 9 + style.width / 2;
      edge.label.setAttribute('x', (startX + edge.ux * along + edge.uy * lift).toFixed(1));
      edge.label.setAttribute('y', (edge.y + edge.uy * along - edge.ux * lift).toFixed(1));
      edge.label.textContent = `w${index + 1} = ${displayNumber(weight, 2)}`;
    });
    biasText.textContent = `b = ${displayNumber(state.bias, 2)}`;
    sumText.textContent = displayNumber(result.sum);
    actCurve.setAttribute('d', curvePath(state.activation, actBox));
    actName.textContent = ACTIVATION_NAMES[state.activation];
    outText.textContent = displayNumber(result.output);
    // The filled share of the output circle shows the output strength. 输出圆被填满的比例表示输出强度。
    const level = Math.max(0, Math.min(1, result.output / activationRange(state.activation, PLOT_SPAN).max));
    const fill = level * G.outR * 2;
    levelRect.setAttribute('y', (cy + G.outR - fill).toFixed(1));
    levelRect.setAttribute('height', fill.toFixed(1));
    const parts = state.inputs.map((input, index) => `${input.name} = ${displayNumber(input.value, 2)}, w${index + 1} = ${displayNumber(state.weights[index], 2)}`);
    svg.setAttribute('aria-label', `神经元示意图 Neuron diagram: ${parts.join('; ')}; b = ${displayNumber(state.bias, 2)}; sum = ${displayNumber(result.sum)}; ${ACTIVATION_NAMES[state.activation]} output = ${displayNumber(result.output)}`);
  }

  return { svg, update };
}

/**
 * Activation-function plot with the current (sum, output) point, on the slide's -10..10 axis.
 * 激活函数曲线图，标出当前的（加权和, 输出）点，横轴与课件一样是 -10 到 10。
 */
function createPlot() {
  const box = { left: 40, right: 250, top: 24, bottom: 132 };
  const xOf = (z) => box.left + ((z + PLOT_SPAN) / (2 * PLOT_SPAN)) * (box.right - box.left);
  const curve = s('path', { class: 'neuron__curve' });
  const yTicks = s('g', {});
  const guideX = s('line', { class: 'neuron__guide' });
  const guideY = s('line', { class: 'neuron__guide' });
  const point = s('circle', { r: 6, class: 'neuron__point' });
  const xTicks = [-10, -5, 0, 5, 10].map((z) => s('g', {},
    s('line', { x1: xOf(z), x2: xOf(z), y1: box.top, y2: box.bottom, class: z === 0 ? 'neuron__axis' : 'neuron__grid' }),
    s('text', { x: xOf(z), y: box.bottom + 16, class: 'neuron__tick', 'text-anchor': 'middle' }, String(z).replace('-', '−'))));
  const svg = s('svg', { class: 'neuron__plot', viewBox: '0 0 260 168', role: 'img', focusable: 'false' },
    s('text', { x: 4, y: 12, class: 'neuron__axis-title' }, '输出 output'),
    s('text', { x: box.right, y: 164, class: 'neuron__axis-title', 'text-anchor': 'end' }, '加权和 sum'),
    xTicks,
    yTicks,
    s('rect', { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, class: 'neuron__plot-frame' }),
    curve,
    guideX,
    guideY,
    point);

  function update(name, sum, output) {
    const range = activationRange(name, PLOT_SPAN);
    const yOf = (value) => box.bottom - ((value - range.min) / (range.max - range.min)) * (box.bottom - box.top);
    const ticks = range.max === 1 ? [0, 0.5, 1] : [0, 5, 10];
    replaceContent(yTicks, ticks.map((value) => s('g', {},
      s('line', { x1: box.left, x2: box.right, y1: yOf(value), y2: yOf(value), class: 'neuron__grid' }),
      s('text', { x: box.left - 6, y: yOf(value) + 4, class: 'neuron__tick', 'text-anchor': 'end' }, String(value)))));
    curve.setAttribute('d', curvePath(name, box));
    const clamped = Math.abs(sum) > PLOT_SPAN || output > range.max;
    const x = xOf(Math.max(-PLOT_SPAN, Math.min(PLOT_SPAN, sum)));
    const y = yOf(Math.max(range.min, Math.min(range.max, output)));
    point.setAttribute('cx', x.toFixed(1));
    point.setAttribute('cy', y.toFixed(1));
    point.setAttribute('class', clamped ? 'neuron__point neuron__point--clamped' : 'neuron__point');
    guideX.setAttribute('x1', x.toFixed(1));
    guideX.setAttribute('x2', x.toFixed(1));
    guideX.setAttribute('y1', box.bottom);
    guideX.setAttribute('y2', y.toFixed(1));
    guideY.setAttribute('x1', box.left);
    guideY.setAttribute('x2', x.toFixed(1));
    guideY.setAttribute('y1', y.toFixed(1));
    guideY.setAttribute('y2', y.toFixed(1));
    const outside = clamped ? '（超出图的范围 off the chart）' : '';
    svg.setAttribute('aria-label', `${ACTIVATION_NAMES[name]} 曲线 curve; 当前点 current point: sum ${displayNumber(sum)}, output ${displayNumber(output)}${outside}`);
  }

  return { svg, update };
}

function legendSample(kind, width = 4) {
  return s('svg', { class: 'neuron__legend-line', viewBox: '0 0 36 12', 'aria-hidden': 'true', focusable: 'false' },
    s('line', { x1: 2, y1: 6, x2: 34, y2: 6, class: `neuron__edge neuron__edge--${kind}`, 'stroke-width': width }));
}

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./neuron.css', import.meta.url));
  instanceCount += 1;
  const uid = `neuron-${instanceCount}`;
  const initial = normalizeNeuronConfig(config);
  const state = {
    inputs: initial.inputs.map((input) => ({ ...input })),
    weights: [...initial.weights],
    bias: initial.bias,
    activation: initial.activation,
  };

  const inputRange = sliderRange(initial.inputs.map((input) => input.value), 2);
  const weightRange = sliderRange(initial.weights, 2);
  const biasRange = sliderRange([initial.bias], 2);
  const ranges = { weight: weightRange.max };

  const diagrams = state.inputs.length <= COMPACT_MAX_INPUTS
    ? [createDiagram(uid, state.inputs, WIDE, 'wide'), createDiagram(uid, state.inputs, COMPACT, 'compact')]
    : [createDiagram(uid, state.inputs, WIDE, 'single')];
  const plot = createPlot();
  const formulaText = h('p', { class: 'neuron__formula-text', lang: 'en' });
  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const activationNote = h('div', { class: 'neuron__activation-note' });
  let announceTimer = null;

  function update() {
    const result = computeNeuron(state);
    const computation = describeComputation(state);
    diagrams.forEach((diagram) => diagram.update(state, result, ranges));
    plot.update(state.activation, result.sum, result.output);
    formulaText.textContent = computation;
    // Announce once the learner pauses, not on every slider step. 学习者停下来后再朗读，而不是每挪一步都读。
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      live.textContent = computation;
    }, 700);
  }

  const inputSliders = state.inputs.map((input, index) => createSlider({
    id: `${uid}-x${index + 1}`,
    symbol: input.name,
    hint: '输入 input',
    range: inputRange,
    step: stepFor(initial.inputs.map((item) => item.value)),
    onInput: (value) => {
      state.inputs[index].value = value;
      update();
    },
  }));
  const weightSliders = state.weights.map((_, index) => createSlider({
    id: `${uid}-w${index + 1}`,
    symbol: `w${index + 1}`,
    hint: '权重 weight',
    range: weightRange,
    step: stepFor(initial.weights),
    onInput: (value) => {
      state.weights[index] = value;
      update();
    },
  }));
  const biasSlider = createSlider({
    id: `${uid}-b`,
    symbol: 'b',
    hint: '加进和里 added',
    range: biasRange,
    step: stepFor([initial.bias]),
    onInput: (value) => {
      state.bias = value;
      update();
    },
  });

  function setActivation(name) {
    state.activation = name;
    replaceContent(activationNote, teachPair(ACTIVATION_NOTES[name], 'neuron__note-pair'));
    update();
  }

  const activationControl = segmented({
    options: ACTIVATION_OPTIONS,
    value: state.activation,
    ariaLabel: '激活函数 Activation function',
    size: 'sm',
    className: 'neuron__activation-switch',
    onChange: setActivation,
  });

  function reset() {
    initial.inputs.forEach((input, index) => {
      state.inputs[index].value = input.value;
      inputSliders[index].set(input.value);
    });
    initial.weights.forEach((weight, index) => {
      state.weights[index] = weight;
      weightSliders[index].set(weight);
    });
    state.bias = initial.bias;
    biasSlider.set(initial.bias);
    const option = activationControl.querySelector(`[data-value="${initial.activation}"]`);
    if (option) option.click();
    else update();
  }

  inputSliders.forEach((slider, index) => slider.set(state.inputs[index].value));
  weightSliders.forEach((slider, index) => slider.set(state.weights[index]));
  biasSlider.set(state.bias);

  const titleId = `${uid}-title`;
  const controlsTitleId = `${uid}-controls`;
  const root = h('section', { class: 'neuron', 'aria-labelledby': titleId },
    h('header', { class: 'neuron__header' },
      h('span', { class: 'neuron__eyebrow' }, '互动演示 Interactive'),
      h('h3', { class: 'neuron__title', id: titleId }, biTitle({ zh: '人工神经元', en: 'Artificial neuron' })),
      teachPair(INTRO, 'neuron__intro')),
    h('figure', { class: 'neuron__stage' },
      diagrams.map((diagram) => diagram.svg),
      h('figcaption', { class: 'neuron__legend' },
        h('span', { class: 'neuron__legend-item' }, legendSample('positive'), '实线 = 正权重，兴奋 excitatory'),
        h('span', { class: 'neuron__legend-item' }, legendSample('negative'), '虚线 = 负权重，抑制 inhibitory'),
        h('span', { class: 'neuron__legend-item' }, legendSample('positive', 1.5), legendSample('positive', 7), '越粗 = 影响越大 by how much'))),
    h('div', { class: 'neuron__formula' },
      h('p', { class: 'neuron__formula-steps' }, '先乘，再加，最后激活 Multiply, add, then activate'),
      formulaText),
    h('div', { class: 'neuron__workbench' },
      h('div', { class: 'neuron__controls', role: 'group', 'aria-labelledby': controlsTitleId },
        h('h4', { class: 'neuron__subheading', id: controlsTitleId }, biTitle({ zh: '调数字', en: 'Adjust the numbers' })),
        state.inputs.map((_, index) => h('div', { class: 'neuron__pair-group' }, inputSliders[index].row, weightSliders[index].row)),
        h('div', { class: 'neuron__pair-group' }, biasSlider.row),
        button({ label: '恢复初始值 Reset', iconName: 'refresh', size: 'sm', variant: 'ghost', onClick: reset, className: 'neuron__reset' })),
      h('div', { class: 'neuron__activation' },
        h('h4', { class: 'neuron__subheading' }, biTitle({ zh: '激活函数', en: 'Activation function' })),
        activationControl,
        plot.svg,
        activationNote)),
    h('div', { class: 'callout neuron__bias-note' }, teachPair(BIAS_NOTE, 'neuron__note-pair')),
    live);

  setActivation(state.activation);
  window.clearTimeout(announceTimer);
  replaceContent(container, root);
  return () => window.clearTimeout(announceTimer);
}
