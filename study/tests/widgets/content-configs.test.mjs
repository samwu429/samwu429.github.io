import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { hasWidget } from '../../engine/widgets/widget-registry.js';
import { parseProgram } from '../../engine/widgets/programming/turtle-sandbox/turtle-language.js';
import { runProgram } from '../../engine/widgets/programming/turtle-sandbox/turtle-interpreter.js';
import { getPreset } from '../../engine/widgets/programming/turtle-sandbox/turtle-presets.js';
import { normalizeConfig as normalizeTreeGrowth } from '../../engine/widgets/search/tree-growth/tree-growth-logic.js';
import {
  bestMoves, evaluateTree, normalizeConfig as normalizeMinimax,
} from '../../engine/widgets/search/minimax-tree/minimax-logic.js';
import { normalizeHeuristicConfig, totalScore } from '../../engine/widgets/search/heuristic-score/heuristic-logic.js';
import {
  bestLinearSplit, classifyPoints, normalizeBoundaryConfig,
} from '../../engine/widgets/machine-learning/decision-boundary/boundary-logic.js';
import {
  meanSquaredError, normalizeRegressionConfig,
} from '../../engine/widgets/machine-learning/regression-mse/regression-logic.js';
import { formatFixed } from '../../engine/widgets/machine-learning/shared/ml-math.js';
import { normalizePresets } from '../../engine/widgets/evaluation/confusion-matrix/confusion-logic.js';
import { f1Score, precision, recall } from '../../engine/widgets/evaluation/shared/metrics.js';
import { evaluateFairness, normalizeGroups } from '../../engine/widgets/evaluation/fairness-groups/fairness-logic.js';
import {
  distributionModes, expectedMax, normalizeDiceConfig, sumDistribution,
} from '../../engine/widgets/evaluation/dice-max/dice-logic.js';
import { computeNeuron, normalizeNeuronConfig } from '../../engine/widgets/neural-networks/neuron/neuron-logic.js';
import { DATASET_NAMES } from '../../engine/widgets/neural-networks/linear-separability/separability-logic.js';
import { slashNotation, tokenize } from '../../engine/widgets/language-models/tokenizer-toy/tokenizer-logic.js';
import { normalizeCandidates } from '../../engine/widgets/language-models/temperature-sampler/temperature-logic.js';

// Every widget block of the course lessons is read here with the same pure readers the widgets use,
// so a renamed preset or config field fails in the test run instead of in the browser.
// 这里用组件自己的纯逻辑读取课程讲义里的每一个交互组件块：预设或配置字段改了名，会在测试里报错，而不是到浏览器里才发现。
const LESSONS = new URL('../../courses/csc105h5/lessons/', import.meta.url);

function widgetBlocks() {
  const blocks = [];
  for (const file of readdirSync(fileURLToPath(LESSONS)).filter((name) => name.endsWith('.json')).sort()) {
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (node && typeof node === 'object') {
        if (node.type === 'widget') blocks.push({ file, name: node.name, config: node.config });
        Object.values(node).forEach(walk);
      }
    };
    walk(JSON.parse(readFileSync(new URL(file, LESSONS), 'utf8')));
  }
  return blocks;
}

const BLOCKS = widgetBlocks();
const configsOf = (name) => BLOCKS.filter((block) => block.name === name).map((block) => block.config);
const counts = ({ tp, fp, fn, tn }) => ({ tp, fp, fn, tn });

// One reader per widget: the config must come through without anything dropped or replaced by a default.
// 每个组件一个读取检查：配置必须原样读进来，不能有内容被丢掉或换成默认值。
const READS = {
  'turtle-sandbox': (config) => {
    const preset = getPreset(config.preset);
    assert.equal(preset.id, config.preset, 'unknown preset');
    const { program, error } = parseProgram(preset.code);
    assert.equal(error, null);
    assert.equal(runProgram(program).error, null);
  },
  'tree-growth': (config) => {
    assert.deepEqual(normalizeTreeGrowth(config), { branching: config.branching, depth: config.depth });
  },
  'minimax-tree': (config) => {
    const setup = normalizeMinimax(config);
    assert.equal(setup.ok, true, `minimax config cannot be drawn: ${setup.reason}`);
    assert.equal(setup.rootPlayer, config.rootPlayer);
    assert.equal(evaluateTree(setup).values[0].length, 1);
  },
  'heuristic-score': (config) => {
    const setup = normalizeHeuristicConfig(config);
    assert.equal(setup.features.length, config.features.length);
    setup.features.forEach((feature, index) => {
      assert.equal(feature.weight, config.features[index].weight);
      assert.deepEqual(feature.counts, config.features[index].counts);
    });
  },
  'decision-boundary': (config) => {
    const model = normalizeBoundaryConfig(config);
    assert.equal(model.points.length, config.points.length);
    assert.equal(model.positive, config.positiveClass);
    assert.deepEqual(model.boundary, config.boundary);
  },
  'regression-mse': (config) => {
    const model = normalizeRegressionConfig(config);
    assert.equal(model.points.length, config.points.length);
    assert.deepEqual(model.start, config.start);
  },
  'confusion-matrix': (config) => {
    const presets = normalizePresets(config);
    assert.equal(presets.length, config.presets.length);
    presets.forEach((preset, index) => assert.deepEqual(preset.counts, counts(config.presets[index])));
  },
  'fairness-groups': (config) => {
    const groups = normalizeGroups(config);
    assert.equal(groups.length, config.groups.length);
    groups.forEach((group, index) => assert.deepEqual(group.counts, counts(config.groups[index])));
  },
  'dice-max': (config) => {
    assert.deepEqual(normalizeDiceConfig(config), { dice: config.dice, sides: config.sides, rolls: config.rolls });
  },
  neuron: (config) => {
    const neuron = normalizeNeuronConfig(config);
    assert.equal(neuron.activation, config.activation);
    assert.deepEqual(neuron.weights, config.weights);
    assert.deepEqual(neuron.inputs.map((input) => input.value), config.inputs.map((input) => input.value));
    assert.equal(neuron.bias, config.bias);
  },
  'linear-separability': (config) => {
    assert.ok(DATASET_NAMES.includes(config.dataset), `unknown dataset ${config.dataset}`);
  },
  'tokenizer-toy': (config) => {
    assert.ok(tokenize(config.text).tokenCount > 0);
  },
  'temperature-sampler': (config) => {
    const normalized = normalizeCandidates(config.candidates);
    assert.equal(normalized.usedDefault, false);
    assert.equal(normalized.items.length, config.candidates.length);
  },
};

test('the lessons contain widget blocks, and every one names a registered widget', () => {
  assert.ok(BLOCKS.length > 0, 'no widget blocks found');
  for (const block of BLOCKS) {
    assert.ok(hasWidget(block.name), `${block.file}: unknown widget ${block.name}`);
    assert.ok(Object.hasOwn(READS, block.name), `${block.file}: add a config check for ${block.name}`);
  }
});

test('every widget config is read without losing anything', () => {
  for (const block of BLOCKS) {
    assert.ok(block.config && typeof block.config === 'object', `${block.file}: ${block.name} has no config`);
    try {
      READS[block.name](block.config);
    } catch (error) {
      error.message = `${block.file} ${block.name}: ${error.message}`;
      throw error;
    }
  }
});

test('lesson configs reproduce the slide numbers: minimax 3, material +3 / +4 / +1', () => {
  const lecture = configsOf('minimax-tree').filter((config) => String(config.leaves) === '2,3,5,-9,7,5,0,-1');
  assert.ok(lecture.length > 0, 'the Lecture 3 p.42 tree is configured');
  for (const config of lecture) {
    const tree = evaluateTree(normalizeMinimax(config));
    assert.equal(tree.values[0][0], 3);
    assert.deepEqual(bestMoves(tree), [0], 'play the left move');
  }
  const scores = configsOf('heuristic-score').map((config) => totalScore(normalizeHeuristicConfig(config).features));
  assert.deepEqual([...scores].sort((a, b) => a - b), [1, 3, 4]);
});

test('lesson configs reproduce the slide numbers: Model A 6/7, Model C 5/7, validation 6/6', () => {
  const results = configsOf('decision-boundary').map((config) => {
    const model = normalizeBoundaryConfig(config);
    return { config, ...classifyPoints(model.boundary, model.points, model.positive, model.negative) };
  });
  const byLine = (w0, w1, w2) => results.filter(({ config }) => config.boundary.w0 === w0 && config.boundary.w1 === w1 && config.boundary.w2 === w2);
  const modelA = byLine(-12, 1, 0.3);
  assert.ok(modelA.length > 0);
  assert.ok(modelA.every((result) => result.correct === 6 && result.total === 7));
  const modelC = byLine(-4, 1, -0.5);
  assert.ok(modelC.length > 0);
  assert.ok(modelC.every((result) => result.correct === 5 && result.total === 7));
  const validation = results.filter((result) => result.total === 6);
  assert.ok(validation.length > 0);
  assert.ok(validation.every((result) => result.correct === 6));
  const model = normalizeBoundaryConfig(modelA[0].config);
  assert.deepEqual(bestLinearSplit(model.points, model.positive), { correct: 6, total: 7 });
});

test('lesson configs reproduce the slide numbers: MSE 37.52 and 11.92', () => {
  const regressions = configsOf('regression-mse').map(normalizeRegressionConfig);
  const start = regressions.find((model) => model.start.w0 === 19);
  assert.equal(formatFixed(meanSquaredError(start.start, start.points), 2), '37.52');
  const good = regressions.find((model) => model.start.w0 === 8.65);
  assert.equal(formatFixed(meanSquaredError(good.start, good.points, { roundY: true }), 2), '11.92');
});

test('lesson configs reproduce the slide numbers: F1 80% and 72%, Lab 5 fairness verdicts', () => {
  const presets = configsOf('confusion-matrix').flatMap((config) => normalizePresets(config));
  const model1 = presets.filter((preset) => preset.counts.tp === 28 && preset.counts.fp === 12);
  const model2 = presets.filter((preset) => preset.counts.tp === 18 && preset.counts.fp === 2);
  assert.ok(model1.length > 0 && model2.length > 0);
  for (const preset of model1) {
    assert.equal(precision(preset.counts).value, 0.7);
    assert.ok(Math.abs(recall(preset.counts).value - 28 / 30) < 1e-12);
    assert.ok(Math.abs(f1Score(preset.counts).value - 0.8) < 1e-12);
  }
  for (const preset of model2) assert.ok(Math.abs(f1Score(preset.counts).value - 0.72) < 1e-12);

  const status = (groups) => evaluateFairness(groups.map((group) => group.counts), 5).criteria.map((criterion) => criterion.status);
  const groupsList = configsOf('fairness-groups').map(normalizeGroups);
  const labModel1 = groupsList.find((groups) => groups[0].counts.tp === 400 && groups[1].counts.tp === 240);
  assert.deepEqual(status(labModel1), ['fail', 'fail', 'pass']);
  const labModel5 = groupsList.find((groups) => groups[0].counts.tp === 200 && groups[1].counts.tp === 120);
  assert.deepEqual(status(labModel5), ['pass', 'fail', 'pass']);
});

test('lesson configs reproduce the slide numbers: dice 28 and 35.4, sigmoid 0.55, tokens, loop total 8', () => {
  for (const config of configsOf('dice-max')) {
    const settings = normalizeDiceConfig(config);
    const distribution = sumDistribution(settings.dice, settings.sides);
    assert.deepEqual(distributionModes(distribution), [28]);
    assert.equal(expectedMax(distribution, settings.rolls).toFixed(1), '35.4');
  }
  const sigmoid = configsOf('neuron').find((config) => config.activation === 'sigmoid');
  assert.equal(computeNeuron(normalizeNeuronConfig(sigmoid)).output.toFixed(2), '0.55');
  const [tokenizer] = configsOf('tokenizer-toy');
  assert.equal(slashNotation(tokenize(tokenizer.text)), 'The/student/day/dream/ed/in/class/.');
  // Lecture 2 p.30 and the lesson text: 2 instructions × 4 iterations = 8 executed.
  // Lecture 2 第 30 页与讲义原文：2 条指令 × 4 次迭代 = 执行 8 条。
  assert.ok(configsOf('turtle-sandbox').some((config) => config.preset === 'loop'));
  const { program } = parseProgram(getPreset('loop').code);
  assert.equal(runProgram(program).executed, 8);
});
