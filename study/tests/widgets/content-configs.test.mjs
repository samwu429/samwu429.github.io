import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { hasWidget, loadWidget } from '../../engine/widgets/widget-registry.js';
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
import { normalizeTwoWayTableConfig } from '../../engine/widgets/statistics/two-way-table/two-way-table-logic.js';
import { normalizeCategoryChartConfig } from '../../engine/widgets/statistics/category-chart/category-chart-logic.js';
import { normalizeHistogramConfig } from '../../engine/widgets/statistics/histogram/histogram-logic.js';
import {
  formatDataText, normalizeCenterSpreadConfig, parseDataText,
} from '../../engine/widgets/statistics/center-spread/center-spread-logic.js';
import { normalizeBoxplotConfig } from '../../engine/widgets/statistics/boxplot/boxplot-logic.js';
import { normalizeZScoreConfig } from '../../engine/widgets/statistics/z-score/z-score-logic.js';
import { normalizeScatterConfig } from '../../engine/widgets/statistics/scatter-correlation/scatter-correlation-logic.js';
import { normalizeLeastSquaresConfig } from '../../engine/widgets/statistics/least-squares-line/least-squares-line-logic.js';

// Every widget block of every course pack's lessons is read here with the same pure readers the widgets use,
// so a renamed preset or config field fails in the test run instead of in the browser. A pack whose lessons
// are not written yet simply adds no blocks.
// 这里用组件自己的纯逻辑读取每个课程包讲义里的每一个交互组件块：预设或配置字段改了名，会在测试里报错，而不是到浏览器里才发现。
// 讲义还没写好的课程包只是不贡献任何组件块。
const COURSES = new URL('../../courses/', import.meta.url);

function lessonFiles() {
  const files = [];
  const packs = readdirSync(fileURLToPath(COURSES), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const pack of packs.map((entry) => entry.name).sort()) {
    const lessons = new URL(`${pack}/lessons/`, COURSES);
    if (!existsSync(fileURLToPath(lessons))) continue;
    for (const name of readdirSync(fileURLToPath(lessons)).filter((file) => file.endsWith('.json')).sort()) {
      files.push({ file: `${pack}/${name}`, url: new URL(name, lessons) });
    }
  }
  return files;
}

function widgetBlocks() {
  const blocks = [];
  for (const { file, url } of lessonFiles()) {
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (node && typeof node === 'object') {
        if (node.type === 'widget') blocks.push({ file, name: node.name, config: node.config });
        Object.values(node).forEach(walk);
      }
    };
    walk(JSON.parse(readFileSync(url, 'utf8')));
  }
  return blocks;
}

const BLOCKS = widgetBlocks();
const configsOf = (name) => BLOCKS.filter((block) => block.name === name).map((block) => block.config);
const counts = ({ tp, fp, fn, tn }) => ({ tp, fp, fn, tn });

// The statistics widgets share their label fields, which the validator requires as Bi values with both languages,
// and a plain-string unit; both must come through as written (surrounding spaces aside).
// 统计组件共用这些标签字段（校验器要求两种语言都有的双语值）和纯文本单位；两者都必须原样读进来（首尾空格除外）。
const LABEL_KEYS = ['title', 'variable', 'rowVariable', 'columnVariable', 'xLabel', 'yLabel', 'xName', 'yName'];
const SUMMARY_KEYS = ['min', 'q1', 'median', 'q3', 'max'];
const SUMMARY_STATISTICS = ['xbar', 'sx', 'ybar', 'sy', 'r'];
const pointPair = ({ x, y }) => [x, y];

function sameLabel(actual, expected, field) {
  const trimmed = (value) => ({ zh: String(value?.zh ?? '').trim(), en: String(value?.en ?? '').trim() });
  assert.deepEqual(trimmed(actual), trimmed(expected), `${field} is not read as written`);
}

function keepsLabels(model, config) {
  for (const key of LABEL_KEYS) {
    if (Object.hasOwn(config, key) && Object.hasOwn(model, key)) sameLabel(model[key], config[key], key);
  }
}

function keepsUnit(model, config) {
  if (!Object.hasOwn(config, 'unit')) return;
  assert.equal(typeof config.unit, 'string', 'unit must be a plain string');
  assert.equal(model.unit, config.unit.trim(), 'unit is not read as written');
}

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
  'two-way-table': (config) => {
    const model = normalizeTwoWayTableConfig(config);
    assert.equal(model.usedExample, false, 'no usable counts, the midterm table is shown instead');
    assert.equal(model.rows.length, config.rows.length);
    assert.equal(model.columns.length, config.columns.length);
    model.rows.forEach((label, index) => sameLabel(label, config.rows[index], `rows[${index}]`));
    model.columns.forEach((label, index) => sameLabel(label, config.columns[index], `columns[${index}]`));
    assert.deepEqual(model.counts, config.counts);
    if (Object.hasOwn(config, 'decimals')) assert.equal(model.decimals, config.decimals, 'decimals must be a whole number from 2 to 6');
    assert.equal(model.start, config.start ?? 'counts');
    keepsLabels(model, config);
  },
  'category-chart': (config) => {
    const model = normalizeCategoryChartConfig(config);
    assert.equal(model.usedDefault, false, 'fewer than two usable categories, the slide example is shown instead');
    assert.equal(model.categories.length, config.categories.length);
    model.categories.forEach((category, index) => {
      sameLabel(category.label, config.categories[index].label, `categories[${index}].label`);
      assert.equal(category.count, config.categories[index].count);
    });
    assert.equal(model.display, config.display ?? 'both');
    keepsLabels(model, config);
  },
  histogram: (config) => {
    const model = normalizeHistogramConfig(config);
    assert.equal(model.usedDefault, false, 'no usable data, the slide example is shown instead');
    assert.deepEqual(model.data, config.data);
    if (Object.hasOwn(config, 'binWidth')) {
      assert.equal(model.widthAdjusted, false, 'binWidth would draw more than 60 bars or a single bar');
      assert.equal(model.binWidth, config.binWidth);
    }
    if (Object.hasOwn(config, 'start')) assert.equal(model.start, config.start);
    assert.equal(model.closed, config.closed ?? 'right');
    assert.deepEqual(model.views, [...new Set(config.views ?? ['histogram'])]);
    if (Object.hasOwn(config, 'leafUnit')) {
      assert.equal(model.leafUnitAdjusted, false, 'leafUnit must be a power of ten whose display fits');
      assert.equal(model.leafUnit, config.leafUnit);
    }
    keepsUnit(model, config);
    keepsLabels(model, config);
  },
  'center-spread': (config) => {
    const model = normalizeCenterSpreadConfig(config);
    assert.equal(model.usesExample, false, 'fewer than 3 usable values, the slide example is shown instead');
    assert.deepEqual(model.data, config.data);
    // The data box shows the values as text and reads them back, so that text must give the same numbers.
    // 数据框把这些值写成文字、再读回来，所以这段文字必须给出同样的数。
    assert.deepEqual(parseDataText(formatDataText(model.data)).values, config.data);
    assert.equal(model.quartiles, config.quartiles ?? 'hand');
    if (Object.hasOwn(config, 'transform')) assert.equal(model.transform, config.transform, 'transform must be true or false');
    keepsUnit(model, config);
    keepsLabels(model, config);
  },
  boxplot: (config) => {
    const model = normalizeBoxplotConfig(config);
    assert.equal(model.usedDefault, false, 'no usable group, the slide example is shown instead');
    assert.equal(model.groups.length, config.groups.length);
    model.groups.forEach((group, index) => {
      const source = config.groups[index];
      sameLabel(group.name, source.name, `groups[${index}].name`);
      if (Object.hasOwn(source, 'data')) {
        assert.equal(group.kind, 'data');
        assert.deepEqual(group.values, source.data);
      } else {
        assert.equal(group.kind, 'summary');
        assert.deepEqual(SUMMARY_KEYS.map((key) => group.summary[key]), SUMMARY_KEYS.map((key) => source.summary[key]));
        assert.deepEqual(group.whiskers, source.whiskers ?? null, 'whiskers are not read as written');
        assert.deepEqual(group.outliers, [...(source.outliers ?? [])].sort((a, b) => a - b));
      }
    });
    assert.equal(model.quartiles, config.quartiles ?? 'hand');
    keepsUnit(model, config);
    keepsLabels(model, config);
  },
  'z-score': (config) => {
    const model = normalizeZScoreConfig(config);
    assert.equal(model.usedDefault, false, 'no usable distribution, the slide example is shown instead');
    const numbers = ({ mean, sd, value }) => [mean, sd, value];
    if (Object.hasOwn(config, 'compare')) {
      assert.equal(model.mode, 'compare');
      assert.deepEqual(model.entries.map(numbers), config.compare.map(numbers));
      model.entries.forEach((entry, index) => sameLabel(entry.name, config.compare[index].name, `compare[${index}].name`));
    } else {
      assert.equal(model.mode, 'single');
      assert.deepEqual([model.mean, model.sd, model.values], [config.mean, config.sd, config.values]);
    }
    keepsUnit(model, config);
    keepsLabels(model, config);
  },
  'scatter-correlation': (config) => {
    const model = normalizeScatterConfig(config);
    assert.equal(model.usesDefaultData, false, 'r cannot be computed, the slide example is shown instead');
    assert.deepEqual(model.points.map(pointPair), config.points);
    keepsLabels(model, config);
  },
  'least-squares-line': (config) => {
    const model = normalizeLeastSquaresConfig(config);
    assert.equal(model.usedDefault, false, 'neither usable points nor a usable summary, the slide example is shown instead');
    if (Object.hasOwn(config, 'points')) {
      assert.equal(model.mode, 'data');
      assert.deepEqual(model.points.map(pointPair), config.points);
    } else {
      assert.equal(model.mode, 'summary');
      assert.deepEqual(model.summary, Object.fromEntries(SUMMARY_STATISTICS.map((key) => [key, config.summary[key]])));
    }
    keepsLabels(model, config);
  },
};

test('the lessons contain widget blocks, and every one names a registered widget', () => {
  assert.ok(BLOCKS.length > 0, 'no widget blocks found');
  for (const block of BLOCKS) {
    assert.ok(hasWidget(block.name), `${block.file}: unknown widget ${block.name}`);
    assert.ok(Object.hasOwn(READS, block.name), `${block.file}: add a config check for ${block.name}`);
  }
});

// Checked for every reader, so a widget no lesson uses yet is still known to load.
// 对每一个读取检查都验证一遍，所以还没有讲义用到的组件也能确认可以加载。
test('every widget with a config check is registered and its module exports mount', async () => {
  for (const name of Object.keys(READS)) {
    assert.ok(hasWidget(name), `${name} is not in the widget registry`);
    const module = await loadWidget(name);
    assert.equal(typeof module.mount, 'function', `${name} does not export mount`);
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
