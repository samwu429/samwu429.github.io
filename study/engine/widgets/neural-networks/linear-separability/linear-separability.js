/**
 * Widget "linear-separability": try to split two classes of points with one straight line (lec07
 * p.20-25). AND and OR can be split; XOR cannot, which is why neural networks need hidden layers.
 * The line is moved by dragging its two dots or the line itself, or with the angle and shift sliders.
 * 组件“linear-separability”：试着用一条直线把两类点分开（lec07 第 20-25 页）。AND、OR 可以分开，
 * XOR 不行，这就是神经网络需要隐藏层的原因。可以拖动线上的两个圆点或整条线，也可以用角度、平移滑块。
 *
 * Config: { dataset: "and" | "or" | "xor" }
 */
import { h, s, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { icon } from '../../../core/dom/icons.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { segmented } from '../../../components/controls/segmented.js';
import {
  DATASET_NAMES,
  HIDDEN_LAYER_LINES,
  VIEW_BOX,
  bandPolygon,
  boxPolygon,
  clampToBox,
  clipLineToBox,
  clipPolygon,
  datasetPoints,
  evaluateLine,
  handlePoints,
  lineThroughPoints,
  searchLines,
} from './separability-logic.js';

const DEFAULT_LINE = Object.freeze({ angle: 90, offset: 0 });
const OFFSET_LIMIT = 1.5;

// Plot geometry in SVG units: the data square from -0.5 to 1.5 maps onto 280 x 280.
// 图的几何尺寸（SVG 单位）：数据范围 -0.5 到 1.5 映射为 280 x 280。
const PLOT = { left: 34, top: 8, size: 280, width: 320, height: 316 };
const SCALE = PLOT.size / (VIEW_BOX.max - VIEW_BOX.min);
const px = (x1) => PLOT.left + (x1 - VIEW_BOX.min) * SCALE;
const py = (x2) => PLOT.top + (VIEW_BOX.max - x2) * SCALE;

const DATASET_OPTIONS = [
  { value: 'and', label: '与 AND' },
  { value: 'or', label: '或 OR' },
  { value: 'xor', label: '异或 XOR' },
];

const INTRO = {
  zh: '只用一条直线，把 ● 和 □ 分到两边。拖动线上的圆点（或整条线），也可以用下面的滑块。',
  en: 'Use one straight line to put the circles and the squares on different sides.',
};

const DATASET_TEXT = {
  and: {
    zh: 'AND（与）：x1 和 x2 都是 1，结果才是 1（●）；其余都是 0（□）。',
    en: 'AND: the output is 1 only when both inputs are 1.',
  },
  or: {
    zh: 'OR（或）：x1、x2 至少有一个是 1，结果就是 1（●）；两个都是 0 才是 0（□）。',
    en: 'OR: the output is 1 when at least one input is 1.',
  },
  xor: {
    zh: 'XOR（异或）：x1 和 x2 不一样时是 1（●），一样时是 0（□）。课堂 TensorFlow Playground 活动里的 XOR 数据就是这种规律（p.23-25）。',
    en: 'XOR: the output is 1 when the two inputs differ, like the XOR data from the TensorFlow Playground activity.',
  },
};

const XOR_QUOTE = {
  en: "Without at least one hidden layer, a neural network can only produce a linear decision boundary. This won't work for data that is not linearly separable, like the XOR data from the activity.",
  zh: '没有至少一个隐藏层，神经网络只能画出线性（直线）的决策边界；对 XOR 这种线性不可分的数据就不行。',
};

const XOR_TEACH = {
  zh: '所以要加隐藏层（hidden layer）：p.20 说，隐藏层让网络能表示数据空间里更复杂的形状。',
  en: 'Hidden layers give us the power to represent more complicated shapes in the data space (p.20).',
};

const LINEAR_NOTE = {
  zh: '补充（课件外）：AND 和 OR 不在课件里。它们一条直线就能分开，叫线性可分（linearly separable）；没有隐藏层的网络（Perceptron，p.29）就能做到。',
  en: 'AND and OR are linearly separable, so a network with no hidden layers (a Perceptron) can learn them.',
};

const HIDDEN_TEXT = {
  zh: '补充（课件外）：这只是其中一种做法。隐藏层放两个神经元，各画一条直线：一条分出“至少一个是 1”（x1 + x2 > 0.5），一条分出“两个都是 1”（x1 + x2 > 1.5）。输出神经元再把两者合起来：落在两条线中间的就是 1。课件没讲具体做法，只说隐藏层能表示更复杂的形状。',
  en: 'One possible design: two hidden neurons each draw a line, and the output neuron says 1 only between the two lines.',
};

let instanceCount = 0;

function teachPair(value, className, role = 'teach') {
  if (!value) return null;
  return h('div', { class: ['linear-separability__pair', className] },
    zhNode(value.zh, role, 'p', 'linear-separability__zh'),
    enNode(value.en, 'p', 'linear-separability__en'));
}

function pointsAttribute(polygon) {
  return polygon.map((point) => `${px(point.x1).toFixed(1)},${py(point.x2).toFixed(1)}`).join(' ');
}

function setSegment(element, segment) {
  if (!segment) {
    element.setAttribute('hidden', '');
    return;
  }
  element.removeAttribute('hidden');
  element.setAttribute('x1', px(segment[0].x1).toFixed(1));
  element.setAttribute('y1', py(segment[0].x2).toFixed(1));
  element.setAttribute('x2', px(segment[1].x1).toFixed(1));
  element.setAttribute('y2', py(segment[1].x2).toFixed(1));
}

function legendShape(kind) {
  const shape = kind === 'one'
    ? s('circle', { cx: 9, cy: 9, r: 6.5, class: 'linear-separability__dot linear-separability__dot--one' })
    : kind === 'zero'
      ? s('rect', { x: 3, y: 3, width: 12, height: 12, class: 'linear-separability__dot linear-separability__dot--zero' })
      : s('circle', { cx: 9, cy: 9, r: 7, class: 'linear-separability__ring' });
  return s('svg', { class: 'linear-separability__legend-shape', viewBox: '0 0 18 18', 'aria-hidden': 'true', focusable: 'false' }, shape);
}

function createSlider({ id, label, min, max, step, format, onInput }) {
  const output = h('output', { class: 'linear-separability__value', for: id });
  const input = h('input', { type: 'range', id, class: 'linear-separability__range', min, max, step });
  const show = (value) => {
    output.textContent = format(value);
    input.setAttribute('aria-valuetext', format(value));
  };
  input.addEventListener('input', () => {
    const value = Number(input.value);
    show(value);
    onInput(value);
  });
  return {
    input,
    row: h('div', { class: 'linear-separability__slider' },
      h('label', { class: 'linear-separability__label', for: id }, label),
      input,
      output),
    set(value) {
      input.value = String(value);
      show(value);
    },
  };
}

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./linear-separability.css', import.meta.url));
  instanceCount += 1;
  const uid = `linear-separability-${instanceCount}`;
  const requested = String(config?.dataset ?? '').trim().toLowerCase();
  const initialDataset = DATASET_NAMES.includes(requested) ? requested : 'and';
  const state = { dataset: initialDataset, line: { ...DEFAULT_LINE }, hiddenLayer: false };
  let handles = handlePoints(state.line);
  let drag = null;
  let lastAnnouncement = '';

  const regionZero = s('polygon', { class: 'linear-separability__region linear-separability__region--zero' });
  const regionOne = s('polygon', { class: 'linear-separability__region linear-separability__region--one' });
  const hiddenLines = HIDDEN_LAYER_LINES.map(() => s('line', { class: 'linear-separability__hidden-line', hidden: true }));
  const lineHit = s('line', { class: 'linear-separability__line-hit' });
  const lineMark = s('line', { class: 'linear-separability__line' });
  const pointLayer = s('g', { class: 'linear-separability__points' });
  const handleNodes = [0, 1].map(() => {
    const hit = s('circle', { r: 22, class: 'linear-separability__handle-hit' });
    const knob = s('circle', { r: 9, class: 'linear-separability__knob' });
    return { group: s('g', { class: 'linear-separability__handle' }, hit, knob), hit, knob };
  });
  let rings = [];

  const ticks = [0, 1].map((value) => [
    s('line', { x1: px(value), x2: px(value), y1: PLOT.top, y2: PLOT.top + PLOT.size, class: 'linear-separability__grid' }),
    s('line', { x1: PLOT.left, x2: PLOT.left + PLOT.size, y1: py(value), y2: py(value), class: 'linear-separability__grid' }),
    s('text', { x: px(value), y: PLOT.top + PLOT.size + 17, class: 'linear-separability__tick', 'text-anchor': 'middle' }, String(value)),
    s('text', { x: PLOT.left - 8, y: py(value) + 4, class: 'linear-separability__tick', 'text-anchor': 'end' }, String(value)),
  ]);

  const svg = s('svg', {
    class: 'linear-separability__plot',
    viewBox: `0 0 ${PLOT.width} ${PLOT.height}`,
    role: 'img',
    focusable: 'false',
  },
  regionZero,
  regionOne,
  ticks,
  s('rect', { x: PLOT.left, y: PLOT.top, width: PLOT.size, height: PLOT.size, class: 'linear-separability__frame' }),
  s('text', { x: PLOT.left + PLOT.size, y: PLOT.top + PLOT.size + 17, class: 'linear-separability__axis', 'text-anchor': 'end' }, 'x1'),
  s('text', { x: PLOT.left - 8, y: PLOT.top + 14, class: 'linear-separability__axis', 'text-anchor': 'end' }, 'x2'),
  hiddenLines,
  lineHit,
  lineMark,
  pointLayer,
  handleNodes.map((node) => node.group));

  const status = h('div', { class: 'linear-separability__status' });
  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const searchText = h('div', { class: 'linear-separability__search', role: 'status', 'aria-live': 'polite' });
  const datasetText = h('div', { class: 'linear-separability__dataset' });
  const lectureLink = h('div', { class: 'linear-separability__lecture' });
  const hiddenExplain = h('div', { class: 'callout callout--info linear-separability__hidden-note', hidden: true }, teachPair(HIDDEN_TEXT));

  const angleSlider = createSlider({
    id: `${uid}-angle`,
    label: '角度 Angle',
    min: 0,
    max: 179,
    step: 1,
    format: (value) => `${Math.round(value)}°`,
    onInput: (value) => moveBySlider({ angle: value }),
  });
  const offsetSlider = createSlider({
    id: `${uid}-offset`,
    label: '平移 Shift',
    min: -OFFSET_LIMIT,
    max: OFFSET_LIMIT,
    step: 0.05,
    format: (value) => value.toFixed(2).replace('-', '−'),
    onInput: (value) => moveBySlider({ offset: value }),
  });

  const searchButton = button({ label: '试很多条直线 Try many lines', iconName: 'target', size: 'sm', onClick: runSearch });
  const hiddenButton = button({ label: '看隐藏层怎么分 Show a hidden-layer fix', iconName: 'eye', size: 'sm', pressed: false, onClick: toggleHiddenLayer });
  const resetButton = button({ label: '重置 Reset', iconName: 'refresh', size: 'sm', variant: 'ghost', onClick: reset });

  function syncSliders() {
    angleSlider.set(Math.min(179, Math.round(state.line.angle)));
    offsetSlider.set(Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, state.line.offset)));
  }

  function moveBySlider(change) {
    state.line = { ...state.line, ...change };
    handles = handlePoints(state.line);
    render();
  }

  function buildPoints() {
    const points = datasetPoints(state.dataset);
    rings = [];
    replaceContent(pointLayer, points.map((point) => {
      const cx = px(point.x1);
      const cy = py(point.x2);
      const ring = s('circle', { cx, cy, r: 19, class: 'linear-separability__ring', hidden: true });
      rings.push(ring);
      const shape = point.label === 1
        ? s('circle', { cx, cy, r: 12, class: 'linear-separability__dot linear-separability__dot--one' })
        : s('rect', { x: cx - 11, y: cy - 11, width: 22, height: 22, class: 'linear-separability__dot linear-separability__dot--zero' });
      const right = point.x1 === 1;
      const top = point.x2 === 1;
      return s('g', {},
        ring,
        shape,
        s('text', {
          x: cx + (right ? 17 : -17),
          y: cy + (top ? -17 : 27),
          class: 'linear-separability__coord',
          'text-anchor': right ? 'start' : 'end',
        }, `(${point.x1}, ${point.x2})`));
    }));
  }

  function setStatus(ok, title, detail) {
    replaceContent(status,
      h('p', { class: ['linear-separability__verdict', ok ? 'linear-separability__verdict--ok' : 'linear-separability__verdict--no'] },
        icon(ok ? 'check' : 'cross', { size: 18 }),
        h('span', {}, title)),
      teachPair(detail, 'linear-separability__detail'));
    const message = `${title}. ${detail.en}`;
    if (message !== lastAnnouncement) {
      lastAnnouncement = message;
      live.textContent = message;
    }
  }

  function render() {
    const points = datasetPoints(state.dataset);
    if (state.hiddenLayer) {
      regionZero.setAttribute('points', pointsAttribute(boxPolygon()));
      regionOne.setAttribute('points', pointsAttribute(bandPolygon()));
      HIDDEN_LAYER_LINES.forEach((line, index) => setSegment(hiddenLines[index], clipLineToBox(line)));
      [lineHit, lineMark].forEach((element) => element.setAttribute('hidden', ''));
      handleNodes.forEach((node) => node.group.setAttribute('hidden', ''));
      rings.forEach((ring) => ring.setAttribute('hidden', ''));
      setStatus(true, '两条线：分开了 Two lines: separated', {
        zh: '隐藏层的两个神经元各画一条线：两线中间的带子是 ●，外面是 □。',
        en: 'Two hidden neurons draw two lines: the band between them is class 1.',
      });
      svg.setAttribute('aria-label', '数据空间 Data space: XOR 的四个点被两条平行线分开 the four XOR points are split by two parallel lines');
      return;
    }

    hiddenLines.forEach((line) => line.setAttribute('hidden', ''));
    const result = evaluateLine(points, state.line);
    regionOne.setAttribute('points', pointsAttribute(clipPolygon(boxPolygon(), state.line, result.oneSide)));
    regionZero.setAttribute('points', pointsAttribute(clipPolygon(boxPolygon(), state.line, -result.oneSide)));
    const segment = clipLineToBox(state.line);
    setSegment(lineHit, segment);
    setSegment(lineMark, segment);
    handleNodes.forEach((node, index) => {
      const point = handles?.[index];
      if (!point || !segment) {
        node.group.setAttribute('hidden', '');
        return;
      }
      node.group.removeAttribute('hidden');
      for (const circle of [node.hit, node.knob]) {
        circle.setAttribute('cx', px(point.x1).toFixed(1));
        circle.setAttribute('cy', py(point.x2).toFixed(1));
      }
    });
    rings.forEach((ring, index) => {
      if (result.wrongIndices.includes(index)) ring.removeAttribute('hidden');
      else ring.setAttribute('hidden', '');
    });

    const wrong = result.wrongCount;
    if (result.separated) {
      setStatus(true, '全部分开了 All separated', {
        zh: '所有 ● 在一边，所有 □ 在另一边：一条直线就够了。',
        en: 'Every circle is on one side and every square on the other.',
      });
    } else {
      setStatus(false, '还没分开 Not separated', {
        zh: `有 ${wrong} 个点在错的一边（带虚线圈的点）。`,
        en: `${wrong} point${wrong === 1 ? ' is' : 's are'} on the wrong side (dashed ring).`,
      });
    }
    const angle = Math.round(state.line.angle);
    svg.setAttribute('aria-label', `数据空间 Data space: ${state.dataset.toUpperCase()}，直线角度 angle ${angle}°，平移 shift ${state.line.offset.toFixed(2)}；${wrong} 个点在错的一边 point(s) on the wrong side`);
  }

  function setDataset(name) {
    state.dataset = name;
    state.hiddenLayer = false;
    hiddenButton.setAttribute('aria-pressed', 'false');
    hiddenButton.hidden = name !== 'xor';
    hiddenExplain.hidden = true;
    replaceContent(searchText);
    replaceContent(datasetText, teachPair(DATASET_TEXT[name]));
    replaceContent(lectureLink, name === 'xor'
      ? h('div', { class: 'linear-separability__quote' },
        h('span', { class: 'linear-separability__quote-label' }, '课件原话 Course wording (p.25)'),
        enNode(XOR_QUOTE.en, 'p', 'linear-separability__quote-en'),
        zhNode(XOR_QUOTE.zh, 'gloss', 'p', 'linear-separability__quote-zh'),
        teachPair(XOR_TEACH, 'linear-separability__quote-teach'))
      : h('div', { class: 'callout callout--tip linear-separability__note' }, teachPair(LINEAR_NOTE)));
    setControlsDisabled(false);
    buildPoints();
    render();
  }

  function setControlsDisabled(disabled) {
    angleSlider.input.disabled = disabled;
    offsetSlider.input.disabled = disabled;
    searchButton.disabled = disabled;
  }

  function toggleHiddenLayer() {
    state.hiddenLayer = !state.hiddenLayer;
    hiddenButton.setAttribute('aria-pressed', String(state.hiddenLayer));
    hiddenExplain.hidden = !state.hiddenLayer;
    setControlsDisabled(state.hiddenLayer);
    render();
  }

  function runSearch() {
    const result = searchLines(datasetPoints(state.dataset));
    const tried = result.tried.toLocaleString('en-US');
    if (result.best) {
      state.line = { angle: result.best.angle, offset: result.best.offset };
      handles = handlePoints(state.line);
      syncSliders();
      replaceContent(searchText, teachPair({
        zh: `试了 ${tried} 条直线，有 ${result.workingCount} 条能把两类分开。图上画的是离点最远、最“稳”的一条。`,
        en: `Tried ${tried} lines: ${result.workingCount} of them work. Showing the one with the widest gap.`,
      }));
    } else {
      const wrong = result.fewestWrong;
      replaceContent(searchText, teachPair({
        zh: `试了 ${tried} 条直线，一条都分不开；最好的也有 ${wrong} 个点在错的一边。一条直线做不到。`,
        en: `Tried ${tried} lines: none works. The best still has ${wrong} point${wrong === 1 ? '' : 's'} on the wrong side.`,
      }));
    }
    render();
  }

  function reset() {
    state.line = { ...DEFAULT_LINE };
    handles = handlePoints(state.line);
    syncSliders();
    if (state.hiddenLayer) toggleHiddenLayer();
    replaceContent(searchText);
    render();
  }

  // Dragging: client coordinates are mapped back into data space through the SVG transform.
  // 拖动：通过 SVG 的变换矩阵把屏幕坐标换算回数据空间坐标。
  function toData(event) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x1: (point.x - PLOT.left) / SCALE + VIEW_BOX.min, x2: VIEW_BOX.max - (point.y - PLOT.top) / SCALE };
  }

  function startDrag(event, mode) {
    if (state.hiddenLayer || !handles) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = toData(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag = { mode, pointerId: event.pointerId, start: point, origin: handles.map((item) => ({ ...item })) };
    root.classList.add('is-dragging');
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = toData(event);
    if (!point) return;
    let next;
    if (drag.mode === 'line') {
      // Both dots move together, limited so neither leaves the plot. 两个圆点一起移动，且都不离开图框。
      let dx = point.x1 - drag.start.x1;
      let dy = point.x2 - drag.start.x2;
      for (const origin of drag.origin) {
        dx = Math.min(VIEW_BOX.max - origin.x1, Math.max(VIEW_BOX.min - origin.x1, dx));
        dy = Math.min(VIEW_BOX.max - origin.x2, Math.max(VIEW_BOX.min - origin.x2, dy));
      }
      next = drag.origin.map((origin) => ({ x1: origin.x1 + dx, x2: origin.x2 + dy }));
    } else {
      next = handles.map((item) => ({ ...item }));
      next[drag.mode] = clampToBox(point);
      const other = next[1 - drag.mode];
      if (Math.hypot(next[drag.mode].x1 - other.x1, next[drag.mode].x2 - other.x2) < 0.12) return;
    }
    const line = lineThroughPoints(next[0], next[1]);
    if (!line) return;
    handles = next;
    state.line = line;
    syncSliders();
    render();
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    root.classList.remove('is-dragging');
  }

  const dragTargets = [[lineHit, 'line'], [handleNodes[0].group, 0], [handleNodes[1].group, 1]];
  for (const [element, mode] of dragTargets) {
    // Older mobile browsers ignore touch-action on SVG children; this stops the page from scrolling mid-drag.
    // 旧版移动浏览器会忽略 SVG 子元素上的 touch-action，这里阻止拖动时页面跟着滚动。
    element.addEventListener('touchstart', (event) => {
      if (!state.hiddenLayer) event.preventDefault();
    }, { passive: false });
    element.addEventListener('pointerdown', (event) => startDrag(event, mode));
    element.addEventListener('pointermove', moveDrag);
    element.addEventListener('pointerup', endDrag);
    element.addEventListener('pointercancel', endDrag);
    element.addEventListener('lostpointercapture', endDrag);
  }

  const titleId = `${uid}-title`;
  const root = h('section', { class: 'linear-separability', 'aria-labelledby': titleId },
    h('header', { class: 'linear-separability__header' },
      h('span', { class: 'linear-separability__eyebrow' }, '互动演示 Interactive'),
      h('h3', { class: 'linear-separability__title', id: titleId }, biTitle({ zh: '线性可分：一条直线能分开吗', en: 'Linear separability' })),
      teachPair(INTRO, 'linear-separability__intro')),
    h('div', { class: 'linear-separability__dataset-row' },
      h('span', { class: 'linear-separability__dataset-label', 'aria-hidden': 'true' }, '数据 Dataset'),
      segmented({
        options: DATASET_OPTIONS,
        value: state.dataset,
        ariaLabel: '数据集 Dataset',
        size: 'sm',
        onChange: setDataset,
      })),
    datasetText,
    h('div', { class: 'linear-separability__body' },
      h('figure', { class: 'linear-separability__stage' },
        svg,
        h('figcaption', { class: 'linear-separability__legend' },
          h('span', { class: 'linear-separability__legend-item' }, legendShape('one'), '类别 1 class 1'),
          h('span', { class: 'linear-separability__legend-item' }, legendShape('zero'), '类别 0 class 0'),
          h('span', { class: 'linear-separability__legend-item' }, legendShape('ring'), '在错的一边 wrong side'))),
      h('div', { class: 'linear-separability__side' },
        status,
        h('div', { class: 'linear-separability__controls', role: 'group', 'aria-label': '移动直线 Move the line' },
          angleSlider.row,
          offsetSlider.row),
        h('div', { class: 'linear-separability__actions' }, searchButton, hiddenButton, resetButton),
        searchText)),
    hiddenExplain,
    lectureLink,
    live);

  syncSliders();
  setDataset(state.dataset);
  replaceContent(container, root);
  return () => {
    drag = null;
  };
}
