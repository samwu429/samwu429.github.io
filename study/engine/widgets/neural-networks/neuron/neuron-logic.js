/**
 * Pure math of one artificial neuron: weighted sum, activation functions and the written-out
 * computation shown to the learner. No DOM access, so it runs under node --test.
 * 单个人工神经元的纯数学部分：加权和、激活函数，以及展示给学习者的完整算式。不访问 DOM，可直接用 node --test 测试。
 */

export const ACTIVATIONS = ['sigmoid', 'relu', 'step'];

export const ACTIVATION_NAMES = { sigmoid: 'sigmoid', relu: 'ReLU', step: 'step' };

const DEFAULT_INPUTS = [{ name: 'x1', value: 1 }, { name: 'x2', value: 0 }];
const DEFAULT_WEIGHTS = [0.6, -0.4];
const MAX_INPUTS = 5;

const MINUS = '−';
const TIMES = '×';
const ARROW = '→';
const APPROX = '≈';

export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

export function relu(z) {
  return Math.max(0, z);
}

// All-or-nothing threshold; a sum of exactly 0 counts as firing.
// 全有或全无的阈值函数；和恰好为 0 时算作“放电”。
export function step(z) {
  return z >= 0 ? 1 : 0;
}

const FUNCTIONS = { sigmoid, relu, step };

export function activate(name, z) {
  return (FUNCTIONS[name] || sigmoid)(z);
}

function toNumber(value, fallback) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : fallback;
}

/**
 * Turns a content config into a complete, safe state; every field is optional.
 * 把内容配置整理成完整、安全的状态；每个字段都可以缺省。
 */
export function normalizeNeuronConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const usesDefaults = !Array.isArray(source.inputs) || source.inputs.length === 0;
  const rawInputs = usesDefaults ? DEFAULT_INPUTS : source.inputs;
  const inputs = rawInputs.slice(0, MAX_INPUTS).map((input, index) => {
    const item = input && typeof input === 'object' ? input : { value: input };
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `x${index + 1}`;
    return { name, value: toNumber(item.value, 0) };
  });
  const rawWeights = Array.isArray(source.weights) ? source.weights : (usesDefaults ? DEFAULT_WEIGHTS : []);
  const activation = String(source.activation ?? '').trim().toLowerCase();
  return {
    inputs,
    weights: inputs.map((_, index) => toNumber(rawWeights[index], 0)),
    bias: toNumber(source.bias, 0),
    activation: ACTIVATIONS.includes(activation) ? activation : 'sigmoid',
  };
}

/**
 * Multiply each input by its weight, add everything plus b, then apply the activation function.
 * 每个输入乘以对应权重，全部相加再加上 b，最后套用激活函数。
 */
export function computeNeuron({ inputs, weights, bias = 0, activation = 'sigmoid' }) {
  const products = inputs.map((input, index) => input.value * (weights[index] ?? 0));
  const sum = products.reduce((total, value) => total + value, 0) + bias;
  return { products, sum, output: activate(activation, sum) };
}

export function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function isApproximate(value, digits = 3) {
  return Math.abs(roundTo(value, digits) - value) > 1e-9;
}

/**
 * Rounds for display and strips trailing zeros: 0.6456 -> "0.646", 0.60 -> "0.6", -0.0001 -> "0".
 * 为显示而四舍五入并去掉末尾的 0。
 */
export function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return String(value);
  const rounded = roundTo(value, digits);
  return rounded === 0 ? '0' : String(rounded);
}

// Typographic minus sign for the learner-facing text. 面向学习者的文字使用印刷体减号。
export function displayNumber(value, digits = 3) {
  return formatNumber(value, digits).replace('-', MINUS);
}

function term(value) {
  const text = displayNumber(value);
  return text.startsWith(MINUS) ? `(${text})` : text;
}

/**
 * The whole computation in one line, e.g. "0.6 × 1 + (−0.4) × 0 + 0 = 0.6 → sigmoid(0.6) ≈ 0.646".
 * Weights come first, matching the slide notation w1x1.
 * 一行写出完整算式；权重写在前面，与课件的 w1x1 写法一致。
 */
export function describeComputation(state) {
  const { sum, output } = computeNeuron(state);
  const terms = state.inputs.map((input, index) => `${term(state.weights[index] ?? 0)} ${TIMES} ${term(input.value)}`);
  terms.push(term(state.bias ?? 0));
  const sumRelation = isApproximate(sum) ? APPROX : '=';
  const outputRelation = isApproximate(output) ? APPROX : '=';
  const name = ACTIVATION_NAMES[state.activation] || ACTIVATION_NAMES.sigmoid;
  const sumText = displayNumber(sum);
  return `${terms.join(' + ')} ${sumRelation} ${sumText} ${ARROW} ${name}(${sumText}) ${outputRelation} ${displayNumber(output)}`;
}

/**
 * Symmetric slider range wide enough for the base range and every configured value.
 * 对称的滑块范围：至少覆盖基础范围，也覆盖配置里的每个数值。
 */
export function sliderRange(values, base = 2) {
  const largest = Math.max(base, ...values.map((value) => Math.ceil(Math.abs(Number(value) || 0))));
  return { min: -largest, max: largest };
}

/**
 * Edge appearance for a weight: the sign picks the line style, the magnitude picks the thickness.
 * 权重对应的连线样式：正负决定线型，大小决定粗细。
 */
export function edgeStyle(weight, maxAbs = 2) {
  const magnitude = Math.abs(weight);
  if (magnitude < 0.005) return { sign: 'zero', width: 1.5 };
  const ratio = Math.min(1, magnitude / (maxAbs > 0 ? maxAbs : 1));
  return { sign: weight > 0 ? 'positive' : 'negative', width: roundTo(2 + 6 * ratio, 2) };
}

/**
 * Output range drawn on the activation plot (the slides plot sigmoid from 0 to 1 and ReLU from 0 to 10).
 * 激活函数小图的纵轴范围（课件里 Sigmoid 画到 1，ReLU 画到 10）。
 */
export function activationRange(name, span = 10) {
  return name === 'relu' ? { min: 0, max: span } : { min: 0, max: 1 };
}

/**
 * Points of the activation curve between -span and span; corners are exact for ReLU and step.
 * 激活函数曲线在 -span 到 span 之间的点；ReLU 与阶跃函数直接给出拐点。
 */
export function activationCurve(name, span = 10, samples = 97) {
  if (name === 'relu') return [[-span, 0], [0, 0], [span, span]];
  if (name === 'step') return [[-span, 0], [0, 0], [0, 1], [span, 1]];
  const points = [];
  for (let index = 0; index < samples; index += 1) {
    const z = -span + (2 * span * index) / (samples - 1);
    points.push([z, sigmoid(z)]);
  }
  return points;
}
