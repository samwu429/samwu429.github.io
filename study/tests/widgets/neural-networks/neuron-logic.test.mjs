import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activate,
  activationCurve,
  activationRange,
  computeNeuron,
  describeComputation,
  edgeStyle,
  formatNumber,
  isApproximate,
  normalizeNeuronConfig,
  relu,
  sigmoid,
  sliderRange,
  step,
} from '../../../engine/widgets/neural-networks/neuron/neuron-logic.js';

const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('activation functions match the lecture graphs', () => {
  assert.equal(sigmoid(0), 0.5);
  close(sigmoid(2), 0.8807970779778823);
  close(sigmoid(-5), 0.0066928509242848554);
  assert.equal(relu(-3), 0);
  assert.equal(relu(10), 10);
  assert.equal(step(-0.01), 0);
  assert.equal(step(0), 1);
  assert.equal(step(4), 1);
  assert.equal(activate('relu', -1), 0);
  assert.equal(activate('unknown', 0), 0.5);
});

test('computeNeuron multiplies, adds b, then activates', () => {
  const state = normalizeNeuronConfig({
    inputs: [{ name: 'x1', value: 1 }, { name: 'x2', value: 1 }],
    weights: [0.6, -0.4],
    bias: 0,
    activation: 'sigmoid',
  });
  const result = computeNeuron(state);
  assert.deepEqual(result.products, [0.6, -0.4]);
  close(result.sum, 0.2);
  close(result.output, sigmoid(0.2));
  assert.equal(computeNeuron({ ...state, activation: 'relu', weights: [0.6, -1] }).output, 0);
  assert.equal(computeNeuron({ ...state, activation: 'step', bias: 0.5 }).output, 1);
});

test('describeComputation writes the whole computation in one line', () => {
  const state = normalizeNeuronConfig({
    inputs: [{ name: 'x1', value: 1 }, { name: 'x2', value: 0 }],
    weights: [0.6, -0.4],
    bias: 0,
    activation: 'sigmoid',
  });
  assert.equal(describeComputation(state), '0.6 × 1 + (−0.4) × 0 + 0 = 0.6 → sigmoid(0.6) ≈ 0.646');
  assert.equal(
    describeComputation({ ...state, activation: 'relu', bias: -1 }),
    '0.6 × 1 + (−0.4) × 0 + (−1) = −0.4 → ReLU(−0.4) = 0',
  );
  assert.equal(describeComputation({ ...state, activation: 'step' }), '0.6 × 1 + (−0.4) × 0 + 0 = 0.6 → step(0.6) = 1');
});

test('float noise does not leak into the displayed numbers', () => {
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(0.6 - 0.4), '0.2');
  assert.equal(formatNumber(-0.00001), '0');
  assert.equal(formatNumber(0.6456563), '0.646');
  assert.equal(isApproximate(0.6 - 0.4), false);
  assert.equal(isApproximate(sigmoid(0.6)), true);
});

test('normalizeNeuronConfig fills every missing field', () => {
  const empty = normalizeNeuronConfig(undefined);
  assert.deepEqual(empty.inputs, [{ name: 'x1', value: 1 }, { name: 'x2', value: 0 }]);
  assert.deepEqual(empty.weights, [0.6, -0.4]);
  assert.equal(empty.bias, 0);
  assert.equal(empty.activation, 'sigmoid');

  const partial = normalizeNeuronConfig({ inputs: [2, { value: 'x' }, { name: ' size ', value: '1.5' }], weights: [1], activation: 'tanh' });
  assert.deepEqual(partial.inputs, [{ name: 'x1', value: 2 }, { name: 'x2', value: 0 }, { name: 'size', value: 1.5 }]);
  assert.deepEqual(partial.weights, [1, 0, 0]);
  assert.equal(partial.activation, 'sigmoid');

  const many = normalizeNeuronConfig({ inputs: [1, 2, 3, 4, 5, 6, 7], weights: [] });
  assert.equal(many.inputs.length, 5);
  assert.equal(normalizeNeuronConfig({ activation: 'ReLU' }).activation, 'relu');
});

test('sliderRange widens to fit configured values', () => {
  assert.deepEqual(sliderRange([1, 0], 2), { min: -2, max: 2 });
  assert.deepEqual(sliderRange([4.2, -1], 2), { min: -5, max: 5 });
  assert.deepEqual(sliderRange([], 3), { min: -3, max: 3 });
});

test('edgeStyle encodes sign as style and magnitude as width', () => {
  assert.deepEqual(edgeStyle(0, 2), { sign: 'zero', width: 1.5 });
  const weak = edgeStyle(0.2, 2);
  const strong = edgeStyle(-2, 2);
  assert.equal(weak.sign, 'positive');
  assert.equal(strong.sign, 'negative');
  assert.ok(strong.width > weak.width);
  assert.equal(edgeStyle(9, 2).width, 8);
});

test('activation curves and ranges follow the slide axes', () => {
  assert.deepEqual(activationRange('relu'), { min: 0, max: 10 });
  assert.deepEqual(activationRange('sigmoid'), { min: 0, max: 1 });
  assert.deepEqual(activationCurve('relu'), [[-10, 0], [0, 0], [10, 10]]);
  assert.deepEqual(activationCurve('step'), [[-10, 0], [0, 0], [0, 1], [10, 1]]);
  const curve = activationCurve('sigmoid', 10, 5);
  assert.equal(curve.length, 5);
  assert.equal(curve[2][0], 0);
  assert.equal(curve[2][1], 0.5);
});
