/**
 * Widget "boxplot" (STA220 Module 4): the five-number summary, IQR, inner and outer fences, suspect and highly
 * suspect outliers and whiskers, drawn step by step for one group in the order of M4 p.14, and side-by-side boxplots
 * of up to four groups on one shared value axis. Q1 and Q3 come by hand (median of each half) or as R prints them.
 * 组件“箱线图”（STA220 第 4 单元）：五数概括、IQR、内外栅栏、可疑与高度可疑离群值和须线，按第 4 单元第 14 页的顺序
 * 一步步画出一组的箱线图；最多四组的箱线图并排画在同一条数值轴上。Q1、Q3 可以手算（每一半的中位数），也可以按 R 的输出。
 *
 * Config (content-spec section 5.4): { title, variable, unit, quartiles: "hand" | "r7", groups: [{ name, data }] or
 * [{ name, summary: { min, q1, median, q3, max }, n (optional count, as favstats prints it), whiskers: [low, high],
 * outliers: [...] }] }. Every number, step and sentence comes from boxplot-logic.js; this module only draws them and
 * wires the controls.
 * 配置见 content-spec 第 5.4 节（给定五数概括的组可以带可选的 n，即 favstats 打印的个数）。所有数字、步骤和句子都来自
 * boxplot-logic.js；本模块只负责绘制和控件。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biStack, biTitle } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { segmented, setSegmentedValue } from '../../../components/controls/segmented.js';
import { biLabel, ensureSharedStyles, legendIcon, teachPair } from '../../machine-learning/shared/ml-ui.js';
import { createPlotFrame } from '../../machine-learning/shared/plot-frame.js';
import { categoryExtent } from '../shared/chart-scales.js';
import {
  FINISHED_PARTS, METHOD_NAMES, axisTitle, bandPosition, boxplotExtent, buildModels, chartDescription, compareGroups,
  constructionSteps, defaultOrientation, describeSentences, dotStacks, fenceMarks, fitLabel, groupAtBand, hasRawData,
  normalizeBoxplotConfig, partsAt, readoutAt, shapeClues, sortedCells, stageAfterChange, stepStatus,
} from './boxplot-logic.js';

const INTRO = {
  zh: '箱线图（**boxplot**）把五数概括画成一个箱子和两条须线（**whisker**）。先按“从第 1 步开始”，再一直按“下一步”，'
    + '就能照第 4 单元第 14 页的顺序一步步画：先算 IQR 和栅栏（**fence**），再找离群值（**outlier**），最后画须线。',
  en: 'A boxplot draws the five-number summary as a box with two whiskers. Press Start at step 1, then Next, to build it '
    + 'in the order of M4 p.14: the IQR and the fences first, then the outliers, then the whiskers.',
};
const GROUPS_INTRO = {
  zh: '几组的箱线图画在同一条数值轴上，方便比较中位数、IQR、全距和离群值（第 4 单元第 18 页）。选一组（或点图里它的箱子），下面就显示这一组的作图步骤。',
  en: 'The boxplots share one value axis, so medians, IQRs, ranges and outliers can be compared (M4 p.18). '
    + 'Pick a group, or click its box, to see its steps.',
};
const DEFAULT_NOTE = {
  zh: '配置里没有可以画的数据，这里先显示第 4 单元的 Tim Hortons 甜甜圈例子。',
  en: 'The config has no data to draw, so the Module 4 Tim Hortons donut example is shown.',
};
const METHOD_NOTE = {
  zh: '第 4 单元第 6 页说：R 用另一种（更高级的）算法算四分位数，所以手算的 Q1、Q3 可能和 R 的输出不一样，这很正常。'
    + '课程用 R 得到四分位数：题目给了 R 的输出，就用 R 的数。切换上面的按钮，比较两种方法。',
  en: "M4 p.6: R uses a different (more advanced) algorithm for quartiles, so a hand answer can differ from R's output; "
    + "that is expected. The course uses R to get quartiles: when a question shows R output, use R's numbers. "
    + 'Switch the method above to compare.',
};
const STEPS_HINT = {
  zh: '点任意一步的标题，图就画到那一步；当前这一步有底色。',
  en: 'Select a step title to draw the boxplot up to that step; the current step is shaded.',
};
const SORTED_HINT = {
  hand: {
    zh: '绿色底是前一半，蓝色底是后一半，红线把两半分开（像第 4 单元第 6 页那样）。标着 Q1、Median、Q3 的方块就是这几个数用到的位置。',
    en: 'Green chips are the lower half, blue chips the upper half, and the red bar splits them (as on M4 p.6). '
      + 'Chips tagged Q1, Median and Q3 are the positions those numbers use.',
  },
  odd: {
    zh: 'n 是奇数，中间标着 Median 的那个数不属于任何一半。',
    en: 'With an odd n, the chip tagged Median belongs to neither half.',
  },
  r7: {
    zh: '标着 Q1、Q3 的是 R 的规则用到的相邻位置，四分位数落在它们之间（只标一个时就等于那个数）。',
    en: "Chips tagged Q1 and Q3 are the neighbouring positions R's rule uses; the quartile lies between them (or equals the one tagged).",
  },
};
const WRITE_HINT = {
  zh: '这些英文句子照着老师的句式写成，考试时换成题目的情境和单位就能用。',
  en: "These sentences follow the instructor's patterns; use the context and units of the question on a test.",
};
const SHAPE_NOTE = {
  zh: '形状按较长的那条“尾巴”命名：较大一侧的须线更长、离群值也在高处，说明右偏（**skewed to the right**）；反过来就是左偏。'
    + '要看整个图来判断，不要只看一个线索（第 4 单元第 10、24 页）。',
  en: 'Name the shape after the longer tail: a longer upper whisker and high outliers suggest right skew; the opposite '
    + 'suggests left skew. Judge from the whole picture, not from one clue (M4 p.10, p.24).',
};
const CONTEXT_NOTE = {
  zh: '离群值要看情境：分组以后，一个值可能在自己组里是离群值，在全部数据里却不是（第 4 单元第 18 页）。',
  en: 'Outliers depend on context: a value can be an outlier within its group but not in the overall data (M4 p.18).',
};
// Tags on the sorted-data chips, so the marked positions do not depend on colour alone.
// 排序数据方块上的标签，让标出的位置不只靠颜色区分。
const CHIP_TAGS = { q1: 'Q1', median: 'Median', q3: 'Q3', suspect: 'suspect', 'highly-suspect': 'highly suspect' };

// Where the parts of one boxplot sit across its category band, as shares of the band.
// 一个箱线图的各部分在类别带中的位置（占类别带宽度的比例）。
const BAND = Object.freeze({
  boxStart: 0.3,
  boxEnd: 0.7,
  centre: 0.5,
  capStart: 0.4,
  capEnd: 0.6,
  fenceStart: 0.08,
  fenceEnd: 0.92,
  bracket: 0.84,
  edge: 0.18,
});
const POINT_RADIUS = 4.5;
const DOT_RADIUS = 3;
// Pixels between stacked tied values: outliers and data dots (the dots shrink to fit a narrow band).
// 相同值堆叠时的像素间距：离群值和数据点（类别带很窄时数据点间距会缩小）。
const POINT_GAP = 10;
const DOT_GAP = 7;
const BRACKET_TICK = 5;
const EDGE_SIZE = 9;
// Approximate width of one character of the 11 px monospace bracket labels. 量尺标签（11 px 等宽字体）每个字符的大致宽度。
const LABEL_CHAR = 7;

let mountCount = 0;

/** Plot size: horizontal boxplots grow with the number of groups, vertical ones keep the usual aspect. 图的尺寸。 */
function frameOptions(count, orientation) {
  if (orientation === 'vertical') return { aspect: 0.7, minHeight: 260, maxHeight: 400 };
  return { aspect: 0.2 + 0.1 * count, minHeight: 110 + 70 * count, maxHeight: 170 + 90 * count };
}

/* ---------- SVG shapes, placed with ctx.at(value, band) 用 ctx.at(value, band) 定位的 SVG 图形 ---------- */

function segment(ctx, [fromValue, fromBand], [toValue, toBand], className) {
  const [x1, y1] = ctx.at(fromValue, fromBand);
  const [x2, y2] = ctx.at(toValue, toBand);
  return s('line', { class: className, x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1) });
}

// A rectangle between two values and two band positions; a zero IQR still shows as a thin box, as R draws it.
// 两个数值、两个类别位置之间的矩形；IQR 为 0 时仍画成一条细箱子，与 R 一致。
function rectangle(ctx, fromValue, toValue, fromBand, toBand, className) {
  const [xa, ya] = ctx.at(fromValue, fromBand);
  const [xb, yb] = ctx.at(toValue, toBand);
  return s('rect', {
    class: className,
    x: Math.min(xa, xb).toFixed(1),
    y: Math.min(ya, yb).toFixed(1),
    width: Math.max(1, Math.abs(xb - xa)).toFixed(1),
    height: Math.max(1, Math.abs(yb - ya)).toFixed(1),
  });
}

function diamond(ctx, value, band) {
  const [x, y] = ctx.at(value, band);
  return s('path', { class: 'boxplot__extreme', d: `M${x.toFixed(1)} ${(y - 5).toFixed(1)} l5 5 l-5 5 l-5 -5 Z` });
}

// A measuring bracket beside the box with ticks pointing at it and an optional short label ("IQR", "1.5 × IQR");
// the label is turned to run along the bracket in a vertical chart.
// 箱子旁边的量尺：两端的小刻度指向箱子，可附一个短标签；竖放时标签沿量尺方向旋转。
function bracket(ctx, fromValue, toValue, band, text) {
  const [x1, y1] = ctx.at(fromValue, band);
  const [x2, y2] = ctx.at(toValue, band);
  const [dx, dy] = ctx.horizontal ? [0, BRACKET_TICK] : [-BRACKET_TICK, 0];
  const tick = (x, y) => s('line', { x1: x.toFixed(1), y1: y.toFixed(1), x2: (x + dx).toFixed(1), y2: (y + dy).toFixed(1) });
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  let label = null;
  if (text && ctx.horizontal) {
    label = s('text', {
      class: 'boxplot__bracket-label', x: midX.toFixed(1), y: (midY - 5).toFixed(1), 'text-anchor': 'middle',
    }, text);
  } else if (text) {
    label = s('text', {
      class: 'boxplot__bracket-label',
      x: (midX + 13).toFixed(1),
      y: midY.toFixed(1),
      'text-anchor': 'middle',
      transform: `rotate(-90 ${(midX + 13).toFixed(1)} ${midY.toFixed(1)})`,
    }, text);
  }
  return s('g', { class: 'boxplot__bracket' },
    s('line', { x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1) }),
    tick(x1, y1),
    tick(x2, y2),
    label);
}

// A small triangle at the edge of the plot, pointing out towards a fence that lies beyond the axis.
// 图边缘的小三角，指向落在数值轴以外的栅栏。
function edgeMarker(ctx, mark, band) {
  const value = mark.side === 'low' ? ctx.extent.min : ctx.extent.max;
  const [x, y] = ctx.at(value, band + BAND.edge);
  const outward = mark.side === 'low' ? -1 : 1;
  // Pixel direction of "outwards" along the value axis: x grows to the right, y grows downwards.
  // 沿数值轴“向外”的像素方向：x 向右增大，y 向下增大。
  const [ux, uy] = ctx.horizontal ? [outward, 0] : [0, -outward];
  const tipX = x - ux;
  const tipY = y - uy;
  const baseX = tipX - ux * EDGE_SIZE;
  const baseY = tipY - uy * EDGE_SIZE;
  const half = EDGE_SIZE / 2;
  const corners = [[tipX, tipY], [baseX - uy * half, baseY + ux * half], [baseX + uy * half, baseY - ux * half]];
  return s('polygon', {
    class: `boxplot__fence-edge boxplot__fence-edge--${mark.kind}`,
    points: corners.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' '),
  });
}

function fenceShapes(ctx, model, band, parts) {
  const shapes = [];
  for (const mark of fenceMarks(model, ctx.extent)) {
    if (!(mark.kind === 'inner' ? parts.innerFences : parts.outerFences)) continue;
    if (mark.inside) {
      shapes.push(segment(ctx, [mark.value, band + BAND.fenceStart], [mark.value, band + BAND.fenceEnd],
        `boxplot__fence boxplot__fence--${mark.kind}`));
    } else {
      shapes.push(edgeMarker(ctx, mark, band));
    }
  }
  return shapes;
}

function boxShapes(ctx, model, band, parts, emphasis) {
  const shapes = [];
  const low = band + BAND.boxStart;
  const high = band + BAND.boxEnd;
  const centre = band + BAND.centre;
  if (parts.whiskers) {
    for (const [quartile, end] of [[model.q1, model.whiskers.lower], [model.q3, model.whiskers.upper]]) {
      if (!Number.isFinite(end)) continue;
      shapes.push(segment(ctx, [quartile, centre], [end, centre], 'boxplot__whisker'));
      shapes.push(segment(ctx, [end, band + BAND.capStart], [end, band + BAND.capEnd], 'boxplot__whisker'));
    }
  }
  if (parts.box) {
    shapes.push(rectangle(ctx, model.q1, model.q3, low, high, ['boxplot__box', emphasis ? 'is-selected' : null]));
  } else if (parts.quartileLines) {
    shapes.push(segment(ctx, [model.q1, low], [model.q1, high], 'boxplot__quartile'));
    shapes.push(segment(ctx, [model.q3, low], [model.q3, high], 'boxplot__quartile'));
  }
  if (parts.median) shapes.push(segment(ctx, [model.median, low], [model.median, high], 'boxplot__median'));
  if (parts.minmax) shapes.push(diamond(ctx, model.min, centre), diamond(ctx, model.max, centre));
  if (parts.iqrBracket) shapes.push(bracket(ctx, model.q1, model.q3, band + BAND.bracket, 'IQR'));
  if (parts.stepBrackets) {
    // Both brackets are 1.5 × IQR long; when they are too short for two labels, only the upper one is labelled.
    // 两段量尺都是 1.5 × IQR 长；短到放不下两个标签时，只给上面那一段加标签。
    const text = '1.5 × IQR';
    const room = ctx.span(model.q3, model.fences.upperInner) >= text.length * LABEL_CHAR + 8;
    shapes.push(bracket(ctx, model.fences.lowerInner, model.q1, band + BAND.bracket, room ? text : null));
    shapes.push(bracket(ctx, model.q3, model.fences.upperInner, band + BAND.bracket, text));
  }
  return shapes;
}

// Data dots while building (tied values stacked across the band) and the outliers as circles.
// 作图过程中的数据点（相同的值沿类别带堆叠），以及画成圆圈的离群值。
function pointShapes(ctx, model, band, parts) {
  const shapes = [];
  const centre = band + BAND.centre;
  if (parts.dots && model.sorted) {
    const stacks = dotStacks(model.sorted);
    const tallest = Math.max(1, ...stacks.map((dot) => dot.count));
    const gap = Math.min(DOT_GAP, (ctx.bandPixels * 0.8) / tallest);
    for (const dot of stacks) {
      const [cx, cy] = ctx.across(ctx.at(dot.value, centre), (dot.slot - (dot.count - 1) / 2) * gap);
      shapes.push(s('circle', { class: 'boxplot__dot', cx: cx.toFixed(1), cy: cy.toFixed(1), r: DOT_RADIUS }));
    }
  }
  if (parts.points) {
    // model.points and dotStacks() are both ascending, so the i-th stack entry is the i-th point.
    // model.points 与 dotStacks() 的结果都按从小到大排列，第 i 个堆叠位置就是第 i 个点。
    dotStacks(model.points.map((point) => point.value)).forEach((stack, index) => {
      const [cx, cy] = ctx.across(ctx.at(stack.value, centre), (stack.slot - (stack.count - 1) / 2) * POINT_GAP);
      shapes.push(s('circle', {
        class: `boxplot__point boxplot__point--${model.points[index].level}`,
        cx: cx.toFixed(1),
        cy: cy.toFixed(1),
        r: POINT_RADIUS,
      }));
    });
  }
  return shapes;
}

// A group name as an HTML label; a name written the same in both languages is shown once.
// 组名的 HTML 标签；两种语言写法相同时只显示一次。
function nameLabel(name) {
  return biLabel(name.zh === name.en ? '' : name.zh, name.en);
}

// An exam sentence: the English to write on a test, with its Chinese gloss under it.
// 考试句子：上面是考试时照着写的英文，下面是中文释义。
function sentenceBlock(sentence) {
  return biStack({ zh: sentence.zh, en: sentence.en }, { className: 'boxplot__sentence' });
}

function nameSpans(name) {
  return [
    name.zh ? s('tspan', { class: 'zh zh-label', lang: 'zh-CN' }, name.zh) : null,
    name.zh && name.en ? ' ' : null,
    name.en ? s('tspan', { class: 'en', lang: 'en' }, name.en) : null,
  ];
}

// Group names: at the top left of each band in a horizontal chart, under each box in a vertical one.
// 组名：横放时写在每个类别带的左上角，竖放时写在每个箱子下方。
function groupLabel(ctx, model, band, selected) {
  const className = ['boxplot__group-label', selected ? 'is-selected' : null];
  const { plot } = ctx.geometry;
  if (ctx.horizontal) {
    const [, top] = ctx.at(ctx.extent.min, band + 1);
    return s('text', { class: className, x: (plot.left + 6).toFixed(1), y: (top + 14).toFixed(1) },
      nameSpans(fitLabel(model.name, plot.right - plot.left - 12)));
  }
  const [x] = ctx.at(ctx.extent.min, band + BAND.centre);
  return s('text', { class: className, x: x.toFixed(1), y: (plot.bottom + 18).toFixed(1), 'text-anchor': 'middle' },
    nameSpans(fitLabel(model.name, ctx.bandPixels - 6)));
}

/* ---------- Widget 组件 ---------- */

export async function mount(container, config, context) {
  await Promise.all([
    ensureStylesheet(new URL('./boxplot.css', import.meta.url)),
    ensureSharedStyles(),
  ]);
  mountCount += 1;
  const uid = `boxplot-${mountCount}`;
  // Every listener added here goes through one signal, so the cleanup removes them all at once.
  // 这里添加的每个监听都使用同一个 signal，清理时一次全部移除。
  const listeners = new AbortController();
  const on = (target, type, handler) => target.addEventListener(type, handler, { signal: listeners.signal });
  let disposed = false;

  const setup = normalizeBoxplotConfig(config);
  const labels = { variable: setup.variable, unit: setup.unit };
  const groupCount = setup.groups.length;
  const rawData = hasRawData(setup.groups);
  const state = { method: setup.quartiles, selected: 0, orientation: defaultOrientation(setup.groups), stage: 0 };
  let models = buildModels(setup.groups, state.method);
  let steps = constructionSteps(models[0]);
  state.stage = steps.length - 1;
  let extent = boxplotExtent(models);
  let frame = null;
  let stopObserving = () => {};
  let stepViews = [];
  let tableRows = [];

  /* ---------- Header and controls 标题与控件 ---------- */
  const titleId = `${uid}-title`;
  const header = h('header', { class: 'boxplot__header' },
    h('p', { class: 'ml-eyebrow' }, biLabel('互动演示', 'Interactive')),
    h('h3', { class: 'boxplot__title', id: titleId }, biTitle(setup.title)),
    teachPair(INTRO.zh, INTRO.en, 'boxplot__intro'),
    groupCount > 1 ? teachPair(GROUPS_INTRO.zh, GROUPS_INTRO.en, 'boxplot__intro') : null,
    setup.usedDefault
      ? h('div', { class: 'callout callout--info boxplot__default' }, teachPair(DEFAULT_NOTE.zh, DEFAULT_NOTE.en))
      : null);

  // A segmented control named by the visible label above it. 由上方可见标签命名的分段控件。
  function control(name, zh, en, element) {
    const labelId = `${uid}-${name}`;
    element.setAttribute('aria-labelledby', labelId);
    return h('div', { class: 'boxplot__control' },
      h('span', { class: 'boxplot__control-label', id: labelId }, biLabel(zh, en)),
      element);
  }

  const groupPicker = groupCount > 1 ? segmented({
    options: models.map((model) => ({ value: String(model.index), label: nameLabel(model.name) })),
    value: '0',
    size: 'sm',
    className: 'boxplot__segmented',
    onChange: (value) => selectGroup(Number(value)),
  }) : null;
  const methodPicker = rawData ? segmented({
    options: ['hand', 'r7'].map((method) => ({
      value: method,
      label: biLabel(METHOD_NAMES[method].zh, METHOD_NAMES[method].en),
    })),
    value: state.method,
    size: 'sm',
    className: 'boxplot__segmented',
    onChange: setMethod,
  }) : null;
  const orientationPicker = segmented({
    options: [
      { value: 'horizontal', label: biLabel('横放', 'Horizontal') },
      { value: 'vertical', label: biLabel('竖放', 'Vertical') },
    ],
    value: state.orientation,
    size: 'sm',
    className: 'boxplot__segmented',
    onChange: setOrientation,
  });
  const controls = h('div', { class: 'boxplot__controls' },
    groupPicker ? control('group', '作图步骤看哪一组', 'Group for the steps', groupPicker) : null,
    methodPicker ? control('method', 'Q1 和 Q3 怎么得到', 'How Q1 and Q3 are found', methodPicker) : null,
    control('orientation', '箱线图的方向', 'Orientation', orientationPicker));
  const methodNote = rawData
    ? h('div', { class: 'callout callout--tip boxplot__method-note' },
      h('span', { class: 'callout__label' }, biLabel('手算和 R 不一样？', 'Hand or R?')),
      teachPair(METHOD_NOTE.zh, METHOD_NOTE.en))
    : null;

  /* ---------- Chart, readout and stepper 图、读数与步进按钮 ---------- */
  const plotSlot = h('div', { class: 'boxplot__plot' });
  const legend = h('ul', { class: 'ml-legend boxplot__legend' });
  const readout = h('ul', { class: 'boxplot__readout', 'aria-label': '到这一步为止找出的数 Numbers found so far' });
  const status = h('p', { class: 'boxplot__status', role: 'status', 'aria-live': 'polite' });
  const stepButtons = {
    first: button({ label: biLabel('从第 1 步开始', 'Start at step 1'), iconName: 'undo', variant: 'ghost', size: 'sm' }),
    previous: button({ label: biLabel('上一步', 'Previous'), iconName: 'arrowLeft', size: 'sm' }),
    next: button({ label: biLabel('下一步', 'Next'), iconName: 'arrowRight', variant: 'primary', size: 'sm' }),
    last: button({ label: biLabel('完整的箱线图', 'Finished boxplot'), iconName: 'skipForward', variant: 'ghost', size: 'sm' }),
  };
  on(stepButtons.first, 'click', () => goTo(0));
  on(stepButtons.previous, 'click', () => goTo(state.stage - 1));
  on(stepButtons.next, 'click', () => goTo(state.stage + 1));
  on(stepButtons.last, 'click', () => goTo(steps.length - 1));
  const figure = h('div', { class: 'ml-panel boxplot__figure' },
    plotSlot,
    legend,
    readout,
    h('div', { class: 'boxplot__stepper' }, stepButtons.first, stepButtons.previous, stepButtons.next, stepButtons.last),
    status);

  /* ---------- Panels 面板 ---------- */
  const sortedPanel = h('section', { class: 'ml-panel boxplot__panel boxplot__sorted', 'aria-labelledby': `${uid}-sorted` });
  const stepsHeading = h('h4', { class: 'boxplot__heading', id: `${uid}-steps` });
  const stepList = h('ol', { class: 'boxplot__steps' });
  const stepsPanel = h('section', { class: 'ml-panel boxplot__panel', 'aria-labelledby': `${uid}-steps` },
    stepsHeading,
    teachPair(STEPS_HINT.zh, STEPS_HINT.en, 'boxplot__hint'),
    stepList);
  const writePanel = h('section', { class: 'ml-panel boxplot__panel', 'aria-labelledby': `${uid}-write` });
  const comparePanel = h('section', { class: 'ml-panel boxplot__panel', 'aria-labelledby': `${uid}-compare` });

  const root = h('section', { class: ['boxplot', groupCount > 1 ? 'boxplot--groups' : null], 'aria-labelledby': titleId },
    header,
    controls,
    methodNote,
    figure,
    sortedPanel,
    stepsPanel,
    writePanel,
    comparePanel);

  /* ---------- Plot frame 坐标框 ---------- */

  // Builds the plot for the current orientation and quartile method; the value axis depends on both.
  // 按当前方向和四分位数方法建立坐标框；数值轴取决于这两者。
  function buildFrame() {
    stopObserving();
    extent = boxplotExtent(models);
    const horizontal = state.orientation === 'horizontal';
    const bands = categoryExtent(groupCount);
    const title = axisTitle(labels);
    const valueTitle = title.zh || title.en ? biLabel(title.zh, title.en) : null;
    frame = createPlotFrame({
      xExtent: horizontal ? extent : bands,
      yExtent: horizontal ? bands : extent,
      role: 'img',
      label: '',
      ...frameOptions(groupCount, state.orientation),
      xTitle: horizontal ? valueTitle : (groupCount > 1 ? biLabel('分组', 'Group') : null),
      yTitle: horizontal ? null : valueTitle,
    });
    frame.svg.classList.add('boxplot__svg');
    on(frame.svg, 'click', onChartClick);
    replaceContent(plotSlot, frame.element);
    renderLegend();
    stopObserving = frame.observe(draw);
  }

  function renderLegend() {
    const offAxis = models.some((model) => fenceMarks(model, extent).some((mark) => !mark.inside));
    const givenInside = models.some((model) => model.points.some((point) => point.level === 'none'));
    const item = (draw, zh, en) => h('li', { class: 'ml-legend__item' }, legendIcon(draw), h('span', {}, biLabel(zh, en)));
    const circle = (className, r) => () => s('circle', { class: className, cx: 10, cy: 10, r });
    const vertical = (className) => () => s('line', { class: className, x1: 10, y1: 1, x2: 10, y2: 19 });
    replaceContent(legend,
      item(() => s('rect', { class: 'boxplot__box', x: 3, y: 5, width: 14, height: 10 }), '箱子：Q1 到 Q3', 'box: Q1 to Q3'),
      item(() => s('line', { class: 'boxplot__median', x1: 10, y1: 3, x2: 10, y2: 17 }), '中位数', 'median'),
      item(() => [
        s('line', { class: 'boxplot__whisker', x1: 2, y1: 10, x2: 17, y2: 10 }),
        s('line', { class: 'boxplot__whisker', x1: 17, y1: 5, x2: 17, y2: 15 }),
      ], '须线', 'whisker'),
      rawData ? item(circle('boxplot__dot', DOT_RADIUS), '数据值（作图过程中）', 'data value (while building)') : null,
      item(circle('boxplot__point boxplot__point--suspect', 5), '可疑离群值', 'suspect outlier'),
      item(circle('boxplot__point boxplot__point--highly-suspect', 5), '高度可疑离群值', 'highly suspect outlier'),
      givenInside
        ? item(circle('boxplot__point boxplot__point--none', 5), '给出的图中单独画出的点', 'point from the given boxplot')
        : null,
      item(vertical('boxplot__fence boxplot__fence--inner'), '内栅栏', 'inner fence'),
      item(vertical('boxplot__fence boxplot__fence--outer'), '外栅栏', 'outer fence'),
      offAxis
        ? item(() => s('polygon', { class: 'boxplot__fence-edge boxplot__fence-edge--outer', points: '18,10 9,5 9,15' }),
          '栅栏在图外，三角指向它', 'fence beyond the axis')
        : null);
  }

  /* ---------- Drawing 绘制 ---------- */
  function draw() {
    if (disposed || !frame) return;
    const geometry = frame.layout();
    const horizontal = state.orientation === 'horizontal';
    const valueScale = horizontal ? geometry.x : geometry.y;
    const bandScale = horizontal ? geometry.y : geometry.x;
    const ctx = {
      geometry,
      horizontal,
      extent,
      bandPixels: Math.abs(bandScale(1) - bandScale(0)),
      at: (value, band) => (horizontal ? [valueScale(value), bandScale(band)] : [bandScale(band), valueScale(value)]),
      span: (from, to) => Math.abs(valueScale(to) - valueScale(from)),
      // Moves a point across its band by `pixels`: up in a horizontal chart, right in a vertical one.
      // 让点沿类别带方向移动 pixels 像素：横放时向上，竖放时向右。
      across: ([x, y], pixels) => (horizontal ? [x, y - pixels] : [x + pixels, y]),
    };
    const regions = [];
    const marks = [];
    const points = [];
    const overlay = [];
    models.forEach((model, index) => {
      const band = bandPosition(index, groupCount, state.orientation);
      const selected = index === state.selected;
      const parts = selected ? partsAt(steps, state.stage) : FINISHED_PARTS;
      if (groupCount > 1 && selected) regions.push(rectangle(ctx, extent.min, extent.max, band, band + 1, 'boxplot__band'));
      marks.push(...fenceShapes(ctx, model, band, parts));
      marks.push(...boxShapes(ctx, model, band, parts, selected && groupCount > 1));
      points.push(...pointShapes(ctx, model, band, parts));
      if (groupCount > 1) overlay.push(groupLabel(ctx, model, band, selected));
    });
    replaceContent(frame.layers.regions, regions);
    replaceContent(frame.layers.marks, marks);
    replaceContent(frame.layers.points, points);
    replaceContent(frame.layers.overlay, overlay);
    frame.svg.setAttribute('aria-label',
      chartDescription(models, labels, { steps, stage: state.stage, selected: state.selected }));
    renderReadout();
  }

  function renderReadout() {
    const model = models[state.selected];
    // The spaces between the parts keep "n 30" apart when a screen reader reads the item as one line.
    // 各部分之间的空格让读屏软件把一项读成“n 30”，而不是连在一起。
    const items = readoutAt(model, steps, state.stage, extent).map((item) => h('li', { class: 'boxplot__readout-item' },
      h('span', { class: 'boxplot__readout-label' }, biLabel(item.label.zh, item.label.en)),
      ' ',
      typeof item.value === 'string'
        ? h('span', { class: 'boxplot__readout-value', lang: 'en' }, item.value)
        : h('span', { class: 'boxplot__readout-value' }, biLabel(item.value.zh, item.value.en)),
      item.note ? [' ', h('span', { class: 'boxplot__readout-note' }, biLabel(item.note.zh, item.note.en))] : null));
    replaceContent(readout, items);
  }

  // Selecting a band in the chart picks its group, a pointer shortcut for the group buttons above.
  // 点图中的类别带就选中那一组，这是上方分组按钮的鼠标快捷方式。
  function onChartClick(event) {
    if (disposed || groupCount < 2 || !frame) return;
    const geometry = frame.layout();
    const box = frame.svg.getBoundingClientRect();
    if (!box.width) return;
    const scale = geometry.width / box.width;
    const value = state.orientation === 'horizontal'
      ? geometry.y.invert((event.clientY - box.top) * scale)
      : geometry.x.invert((event.clientX - box.left) * scale);
    const index = groupAtBand(value, groupCount, state.orientation);
    if (index >= 0) selectGroup(index);
  }

  /* ---------- Steps and status 步骤与状态 ---------- */
  function renderLine(line) {
    if (line.type === 'math') return h('p', { class: 'boxplot__math', lang: 'en' }, line.text);
    if (line.type === 'extra') {
      return h('div', { class: 'callout callout--info boxplot__extra' }, teachPair(line.zh, line.en));
    }
    return teachPair(line.zh, line.en, 'boxplot__teach');
  }

  function renderSteps() {
    const model = models[state.selected];
    replaceContent(stepsHeading,
      biLabel('作图步骤', 'Construction steps'),
      groupCount > 1 ? [h('span', { class: 'boxplot__heading-group' }, nameLabel(model.name))] : null);
    stepViews = steps.map((step, index) => {
      const head = h('button', { type: 'button', class: 'boxplot__step-head' },
        h('span', { class: 'boxplot__step-number' }, String(index + 1)),
        ' ',
        h('span', { class: 'boxplot__step-title' }, biLabel(step.title.zh, step.title.en)));
      on(head, 'click', () => goTo(index));
      const item = h('li', { class: 'boxplot__step' },
        head,
        h('div', { class: 'boxplot__step-body' }, step.lines.map(renderLine)));
      return { item, head };
    });
    replaceContent(stepList, stepViews.map((view) => view.item));
    syncSteps();
  }

  function syncSteps() {
    stepViews.forEach(({ item, head }, index) => {
      const current = index === state.stage;
      item.classList.toggle('is-current', current);
      if (current) head.setAttribute('aria-current', 'step');
      else head.removeAttribute('aria-current');
    });
    // aria-disabled keeps focus on a button that reaches the first or the last step.
    // 用 aria-disabled 而不是 disabled，到达第一步或最后一步时焦点不会丢失。
    const atStart = state.stage <= 0;
    const atEnd = state.stage >= steps.length - 1;
    stepButtons.first.setAttribute('aria-disabled', String(atStart));
    stepButtons.previous.setAttribute('aria-disabled', String(atStart));
    stepButtons.next.setAttribute('aria-disabled', String(atEnd));
    stepButtons.last.setAttribute('aria-disabled', String(atEnd));
  }

  function renderStatus() {
    const current = stepStatus(steps, state.stage);
    const model = models[state.selected];
    // The dots only separate the parts visually; screen readers hear the words alone.
    // 圆点只是视觉上的分隔，读屏软件只读文字。
    const separator = () => [' ', h('span', { 'aria-hidden': 'true' }, '·'), ' '];
    replaceContent(status,
      groupCount > 1 ? [h('strong', {}, nameLabel(model.name)), separator()] : null,
      biLabel(current.zh, current.en),
      current.detail ? [separator(), h('span', { class: 'boxplot__status-math', lang: 'en' }, current.detail)] : null);
  }

  /* ---------- Sorted data, sentences and comparison 排序数据、句子与对比 ---------- */
  function chip(cell) {
    const tags = [...cell.marks, ...(cell.level === 'none' ? [] : [cell.level])].map((key) => CHIP_TAGS[key]);
    return h('li', {
      class: [
        'boxplot__chip',
        cell.half ? `boxplot__chip--${cell.half}` : null,
        cell.split ? 'boxplot__chip--split' : null,
        ...cell.marks.map((mark) => `boxplot__chip--${mark}`),
        cell.level === 'none' ? null : `boxplot__chip--${cell.level}`,
      ],
    },
    h('span', { class: 'boxplot__chip-position' }, String(cell.position)),
    h('span', { class: 'visually-hidden' }, ': '),
    h('span', { class: 'boxplot__chip-value' }, cell.text),
    tags.length ? [' ', h('span', { class: 'boxplot__chip-tag', lang: 'en' }, tags.join(', '))] : null);
  }

  function renderSorted() {
    const model = models[state.selected];
    const cells = sortedCells(model);
    sortedPanel.hidden = !cells.length;
    if (!cells.length) {
      replaceContent(sortedPanel);
      return;
    }
    const hint = model.method === 'hand' ? SORTED_HINT.hand : SORTED_HINT.r7;
    const odd = model.method === 'hand' && model.quartiles.medianExcluded;
    replaceContent(sortedPanel,
      h('h4', { class: 'boxplot__heading', id: `${uid}-sorted` },
        biLabel('排序后的数据', 'Sorted data'),
        h('span', { class: 'boxplot__heading-group', lang: 'en' }, `sort(), n = ${model.n}`)),
      teachPair(hint.zh, hint.en, 'boxplot__hint'),
      odd ? teachPair(SORTED_HINT.odd.zh, SORTED_HINT.odd.en, 'boxplot__hint') : null,
      h('div', {
        class: 'boxplot__chips-scroll',
        role: 'region',
        tabindex: '0',
        'aria-label': `排序后的 ${model.n} 个数 ${model.n} sorted values`,
      }, h('ol', { class: 'boxplot__chips', lang: 'en' }, cells.map(chip))));
  }

  function renderWrite() {
    const model = models[state.selected];
    const clues = shapeClues(model);
    replaceContent(writePanel,
      h('h4', { class: 'boxplot__heading', id: `${uid}-write` },
        biLabel('考试这样写', 'Write it like this'),
        groupCount > 1 ? h('span', { class: 'boxplot__heading-group' }, nameLabel(model.name)) : null),
      teachPair(WRITE_HINT.zh, WRITE_HINT.en, 'boxplot__hint'),
      h('div', { class: 'boxplot__sentences' }, describeSentences(model, labels, { groupCount }).map(sentenceBlock)),
      h('p', { class: 'boxplot__subheading' }, biLabel('形状线索', 'Shape clues')),
      teachPair(clues.zh, clues.en, 'boxplot__teach'),
      teachPair(SHAPE_NOTE.zh, SHAPE_NOTE.en, 'boxplot__hint'));
  }

  function renderComparison() {
    const { rows, sentences } = compareGroups(models, labels);
    const headingText = groupCount > 1
      ? biLabel('各组的五数概括', 'Five-number summary of each group')
      : biLabel('五数概括', 'Five-number summary');
    const head = (zh, en) => h('th', { scope: 'col' }, biLabel(zh, en));
    const cell = (value) => (typeof value === 'string'
      ? h('td', { lang: 'en' }, value)
      : h('td', {}, biLabel(value.zh, value.en)));
    tableRows = rows.map((row) => h('tr', {},
      h('th', { scope: 'row' },
        nameLabel(row.name),
        row.given ? h('span', { class: 'boxplot__given' }, biLabel('给出的概括', 'given summary')) : null),
      cell(row.n), cell(row.min), cell(row.q1), cell(row.median), cell(row.q3), cell(row.max), cell(row.iqr),
      cell(row.range), cell(row.whiskers), cell(row.suspect), cell(row.highlySuspect)));
    const table = h('table', { class: 'data-table boxplot__table' },
      h('caption', { class: 'visually-hidden' }, headingText),
      h('thead', {}, h('tr', {},
        head('组', 'Group'), head('', 'n'), head('最小值', 'Min'), head('', 'Q1'), head('中位数', 'Median'), head('', 'Q3'),
        head('最大值', 'Max'), head('', 'IQR'), head('全距', 'Range'), head('须线', 'Whiskers'),
        head('可疑离群值', 'Suspect outliers'), head('高度可疑离群值', 'Highly suspect outliers'))),
      h('tbody', {}, tableRows));
    const unitNote = setup.unit
      ? biLabel(`单位：${setup.unit}。“—”表示没有（或没有给出）。`, `Unit: ${setup.unit}. A dash means none (or not given).`)
      : biLabel('“—”表示没有（或没有给出）。', 'A dash means none (or not given).');
    replaceContent(comparePanel,
      h('h4', { class: 'boxplot__heading', id: `${uid}-compare` }, headingText),
      h('p', { class: 'boxplot__hint' }, unitNote),
      h('div', { class: 'table-scroll boxplot__table-wrap' }, table),
      sentences.length ? [
        h('p', { class: 'boxplot__subheading' }, biLabel('比较各组', 'Comparing the groups')),
        h('div', { class: 'boxplot__sentences' }, sentences.map(sentenceBlock)),
        teachPair(CONTEXT_NOTE.zh, CONTEXT_NOTE.en, 'boxplot__hint'),
      ] : null);
    syncComparison();
  }

  // Marks the selected group's row without rebuilding the table, so its horizontal scroll position stays.
  // 只标出选中组的那一行，不重建表格，表格的横向滚动位置保持不变。
  function syncComparison() {
    tableRows.forEach((row, index) => row.classList.toggle('is-selected', groupCount > 1 && index === state.selected));
  }

  function renderGroupPanels() {
    renderSorted();
    renderSteps();
    renderWrite();
    renderStatus();
  }

  /* ---------- Actions 操作 ---------- */
  function goTo(stage) {
    if (disposed) return;
    const next = Math.max(0, Math.min(steps.length - 1, stage));
    if (next === state.stage) return;
    state.stage = next;
    syncSteps();
    renderStatus();
    draw();
  }

  function selectGroup(index) {
    if (disposed || index === state.selected || !models[index]) return;
    const next = constructionSteps(models[index]);
    state.stage = stageAfterChange(steps, state.stage, next);
    steps = next;
    state.selected = index;
    if (groupPicker) setSegmentedValue(groupPicker, String(index));
    renderGroupPanels();
    syncComparison();
    draw();
  }

  function setMethod(method) {
    if (disposed || method === state.method || !METHOD_NAMES[method]) return;
    state.method = method;
    models = buildModels(setup.groups, method);
    const next = constructionSteps(models[state.selected]);
    state.stage = stageAfterChange(steps, state.stage, next);
    steps = next;
    buildFrame();
    renderGroupPanels();
    renderComparison();
    draw();
  }

  function setOrientation(orientation) {
    if (disposed || orientation === state.orientation) return;
    state.orientation = orientation;
    buildFrame();
    draw();
  }

  buildFrame();
  renderGroupPanels();
  renderComparison();
  container.replaceChildren(root);
  draw();

  return () => {
    disposed = true;
    listeners.abort();
    stopObserving();
  };
}
