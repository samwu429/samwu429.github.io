/**
 * Axis extents for statistics charts that the machine-learning plot frame does not build by itself. DOM-free.
 * 统计图表需要、而机器学习坐标框本身不提供的坐标范围；不依赖 DOM。
 *
 * Every extent has the plot frame's shape { min, max, step, ticks }, so it goes straight into
 * createPlotFrame({ xExtent, yExtent }) from widgets/machine-learning/shared/plot-frame.js:
 * - countExtent: a frequency axis from 0 with whole-number ticks (histograms, dotplots, bar charts of counts),
 *   where niceExtent would tick small counts at 0, 0.5, 1, ...;
 * - categoryExtent with categoryBand: a category axis in data units, where category i fills [i, i + 1] and its
 *   bar or box is drawn inside categoryBand(i) (bar charts, segmented bars, side-by-side boxplots).
 * 每个范围都采用坐标框的结构 { min, max, step, ticks }，可以直接传给 plot-frame.js 的 createPlotFrame({ xExtent, yExtent })：
 * - countExtent：从 0 开始、刻度为整数的频数轴（直方图、点图、计数条形图）；niceExtent 遇到小计数会标 0、0.5、1……；
 * - categoryExtent 与 categoryBand：以数据单位表示的类别轴，第 i 个类别占 [i, i + 1]，
 *   它的柱子或箱子画在 categoryBand(i) 之内（条形图、分段条形图、并排箱线图）。
 */
import { niceStep, toNumber } from '../../machine-learning/shared/ml-math.js';

/**
 * Frequency axis from 0 to a round maximum ≥ maxCount, ticked in whole steps of 1, 2, 5, 10, 20, 25, 50, ...
 * The 11 donuts of the tallest R histogram bar give 0 to 12, every 2.
 * 从 0 到不小于 maxCount 的整齐上限的频数轴，刻度间距为整数（1、2、5、10、20、25、50……）。
 * R 直方图最高的柱子有 11 个甜甜圈，得到 0 到 12、每 2 一格。
 */
export function countExtent(maxCount, { targetTicks = 5 } = {}) {
  const top = Math.max(0, toNumber(maxCount, 0));
  let step = top > 0 ? niceStep(top, targetTicks) : 1;
  // Counts are whole numbers: a step below 1 becomes 1, and 2.5 becomes 2 (25 and 250 are kept).
  // 计数都是整数：小于 1 的间距改为 1，2.5 改为 2（25、250 保留）。
  if (step < 1) step = 1;
  else if (!Number.isInteger(step)) step = Math.floor(step);
  const max = Math.max(step, Math.ceil(top / step - 1e-9) * step);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step);
  return { min: 0, max, step, ticks };
}

/**
 * Category axis for `count` categories: [0, count] with no numeric ticks, so the frame draws no numbers and
 * the widget labels the categories itself.
 * count 个类别的类别轴：范围 [0, count]，没有数字刻度，坐标框不画数字，由组件自己标注类别。
 */
export function categoryExtent(count) {
  const size = Math.max(1, Math.floor(toNumber(count, 1)));
  return { min: 0, max: size, step: 1, ticks: [] };
}

/**
 * Where category `index` draws its bar or box, in data units: { start, end, center }, leaving `padding`
 * (a share of the slot, 0 to 0.9) as space between neighbouring categories.
 * 第 index 个类别的柱子或箱子所在位置（数据单位）：{ start, end, center }；padding（占一个类别宽度的比例，0 到 0.9）留作相邻类别之间的空隙。
 */
export function categoryBand(index, { padding = 0.3 } = {}) {
  const position = toNumber(index, 0);
  const gap = Math.min(0.9, Math.max(0, toNumber(padding, 0.3))) / 2;
  return { start: position + gap, end: position + 1 - gap, center: position + 0.5 };
}
