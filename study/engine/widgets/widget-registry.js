/**
 * Maps widget names used in content files to their lazily loaded modules.
 * 将内容文件中的组件名映射到按需加载的模块。
 *
 * Every widget module exports `mount(container, config, context)` and may return a cleanup function.
 * 每个组件模块导出 `mount(container, config, context)`，可返回清理函数。
 */

const LOADERS = {
  'turtle-sandbox': () => import('./programming/turtle-sandbox/turtle-sandbox.js'),
  'tree-growth': () => import('./search/tree-growth/tree-growth.js'),
  'minimax-tree': () => import('./search/minimax-tree/minimax-tree.js'),
  'heuristic-score': () => import('./search/heuristic-score/heuristic-score.js'),
  'decision-boundary': () => import('./machine-learning/decision-boundary/decision-boundary.js'),
  'regression-mse': () => import('./machine-learning/regression-mse/regression-mse.js'),
  'confusion-matrix': () => import('./evaluation/confusion-matrix/confusion-matrix.js'),
  'fairness-groups': () => import('./evaluation/fairness-groups/fairness-groups.js'),
  'dice-max': () => import('./evaluation/dice-max/dice-max.js'),
  neuron: () => import('./neural-networks/neuron/neuron.js'),
  'linear-separability': () => import('./neural-networks/linear-separability/linear-separability.js'),
  'tokenizer-toy': () => import('./language-models/tokenizer-toy/tokenizer-toy.js'),
  'temperature-sampler': () => import('./language-models/temperature-sampler/temperature-sampler.js'),
  'two-way-table': () => import('./statistics/two-way-table/two-way-table.js'),
  'category-chart': () => import('./statistics/category-chart/category-chart.js'),
  histogram: () => import('./statistics/histogram/histogram.js'),
  'center-spread': () => import('./statistics/center-spread/center-spread.js'),
  boxplot: () => import('./statistics/boxplot/boxplot.js'),
  'z-score': () => import('./statistics/z-score/z-score.js'),
  'scatter-correlation': () => import('./statistics/scatter-correlation/scatter-correlation.js'),
  'least-squares-line': () => import('./statistics/least-squares-line/least-squares-line.js'),
};

export function hasWidget(name) {
  return Object.hasOwn(LOADERS, name);
}

export async function loadWidget(name) {
  if (!hasWidget(name)) throw new Error(`Unknown widget: ${name}`);
  return LOADERS[name]();
}
