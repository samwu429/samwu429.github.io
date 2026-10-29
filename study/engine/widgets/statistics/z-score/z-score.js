/**
 * Widget "z-score": z-scores as a measure of position (STA220 Module 4 p.25-39).
 * - One distribution: pick or type a value y, follow z = (y − ȳ) / s step by step, see y on a number line
 *   marked at ȳ ± 1, 2, 3 s, read the exam sentence and the z-score rule for outliers, and turn a z-score
 *   back into y (p.37).
 * - Several distributions ("compare"): turn each value into a z-score and see which one is relatively
 *   higher, next to the two unfair ways of comparing from p.34.
 * 组件“z-score”：z 分数——位置的度量（STA220 第 4 单元第 25-39 页）。
 * - 一个分布：选择或输入一个值 y，一步步算出 z = (y − ȳ) / s，在标有 ȳ ± 1、2、3 s 的数轴上看到 y 的位置，
 *   读出考试用的解释句和判断离群值的 z 分数规则，还可以由 z 反推 y（第 37 页）。
 * - 多个分布（compare）：把每个值换成 z 分数，看谁的相对位置更高，并和第 34 页两种不公平的比较方法对照。
 *
 * Config: { title: Bi, variable: Bi, unit: "kcal", mean: 251, sd: 50.06, values: [400, 180] }
 *      or { title: Bi, compare: [{ name: Bi, mean: 70, sd: 8, value: 82 }, { name: Bi, mean: 60, sd: 5, value: 68 }] }
 * Every number and sentence comes from z-score-logic.js; this module only builds and updates the DOM.
 * 所有数字和句子都来自 z-score-logic.js；本模块只负责构建和更新 DOM。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, scriptText, uiText, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import {
  DEFAULT_REVERSE_Z, announcement, axisScale, axisSpan, axisTicks, compareValues, comparisonText, formatDeviation,
  formatGiven, formatZ, interpretZ, labelCenter, labelStride, normalizeZScoreConfig, numberLineDescription,
  parseNumberInput, placeOnAxis, pointLabel, reverseFromZ, withUnit, zDetails, zRule, zSteps, zWorking,
} from './z-score-logic.js';

let mountCount = 0;

// Width used before the widget is on the page and can be measured. 组件挂到页面、能测量宽度之前使用的宽度。
const FALLBACK_WIDTH = 480;

// Rows of one number line, in pixels: the point label, the tick values, the line with its bands, the z-scores.
// 一条数轴各行的位置（像素）：点的标签、刻度数值、数轴与色带、z 分数。
const STRIP = Object.freeze({
  height: 100,
  padding: 18,
  labelY: 15,
  valueY: 37,
  lineY: 60,
  band: 11,
  tick: 6,
  meanTick: 11,
  zY: 91,
});

const DEFAULT_TITLES = {
  single: { zh: 'z 分数：离平均数有几个标准差', en: 'z-score: how many standard deviations from the mean' },
  compare: { zh: '用 z 分数比较来自不同分布的值', en: 'Comparing values from different distributions with z-scores' },
};

const LEVEL_LABELS = {
  none: { zh: '不算离群值', en: 'not flagged', iconName: 'check' },
  suspect: { zh: '可疑离群值', en: 'suspect outlier', iconName: 'alert' },
  'highly-suspect': { zh: '高度可疑离群值', en: 'highly suspect outlier', iconName: 'alert' },
};

const POSITION_LABELS = {
  above: { zh: '高于平均数', en: 'above the mean' },
  below: { zh: '低于平均数', en: 'below the mean' },
  at: { zh: '等于平均数', en: 'equal to the mean' },
  none: { zh: '无法计算', en: 'cannot be computed' },
};

const WAY_LABELS = {
  raw: { zh: '比原始数值 y', en: 'Compare the raw values y' },
  deviation: { zh: '比离平均数的距离 y − ȳ', en: 'Compare the distances from the mean, y − ȳ' },
  z: { zh: '比 z 分数', en: 'Compare the z-scores' },
};

/* ---------- Small builders 小型构件 ---------- */

/** Short UI label: Chinese first, English after. 简短界面文字：中文在前、英文在后。 */
function label(zh, en, role = 'label') {
  return [zhNode(zh, role), ' ', enNode(en)];
}

/** Chinese teaching sentence with its English version on the next line. 中文讲解句，下一行是对应的英文。 */
function pair(zh, en, className) {
  return h('p', { class: ['z-score__pair', className] },
    zhNode(zh, 'teach', 'span', 'z-score__zh'),
    enNode(en, 'span', 'z-score__en'));
}

/** Formula or worked numbers in monospace; English runs are marked lang="en". 等宽字体的公式或算式，英文部分标为 lang="en"。 */
function math(text, className) {
  return h('span', { class: ['z-score__math', className] }, uiText(text));
}

function heading(zh, en, id) {
  return h('h4', { class: 'z-score__heading', id }, label(zh, en));
}

/**
 * An English sentence to write on the test, with its Chinese meaning below (blurred in English practice mode).
 * 考试时要写的英文句子，下面是中文意思（英文练习模式下模糊）。
 */
function examSentence(en, zh) {
  return h('p', { class: 'z-score__exam-sentence' },
    enNode(en, 'span', 'z-score__exam-en'),
    zhNode(zh, 'gloss', 'span', 'z-score__exam-zh'));
}

/** Outlier-rule verdict with an icon and words, so it never depends on colour alone. 带图标和文字的判断结果，不只靠颜色。 */
function levelBadge(level) {
  const meta = LEVEL_LABELS[level] || LEVEL_LABELS.none;
  return h('span', { class: ['z-score__badge', `z-score__badge--${level}`] },
    icon(meta.iconName, { size: 14 }), label(meta.zh, meta.en));
}

function fairBadge(fair) {
  return h('span', { class: ['z-score__badge', fair ? 'z-score__badge--fair' : 'z-score__badge--unfair'] },
    icon(fair ? 'check' : 'cross', { size: 14 }), fair ? label('公平', 'fair') : label('不公平', 'not fair'));
}

function headCell(content) {
  return h('th', { scope: 'col' }, content);
}

/**
 * Polite live region. Repeating the same message is still announced because a no-break space is toggled.
 * 礼貌型朗读区域。末尾交替添加不换行空格，相同的消息也会再次播报。
 */
function liveRegion() {
  const element = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let toggle = false;
  return {
    element,
    announce(text) {
      toggle = !toggle;
      element.textContent = `${text}${toggle ? '\u00a0' : ''}`;
    },
  };
}

/**
 * Labelled number box. Typing updates the widget as soon as the text reads as a number; leaving the box with
 * text it cannot read (a full-width digit typed with a Chinese input method, an empty box) puts the last
 * number back and says why.
 * 带标签的数字框。输入的内容一旦能读成数字，组件就立即更新；离开输入框时如果内容读不懂（中文输入法打出的全角数字、空框），
 * 就恢复上一个数并说明原因。
 */
function numberField({ id, labelNodes, value, step = 'any', unit = '', signal, onValue, onCommit }) {
  let current = value;
  const hint = h('p', { class: 'z-score__hint', 'aria-live': 'polite' });
  const input = h('input', {
    id,
    class: 'input z-score__input',
    type: 'number',
    step,
    autocomplete: 'off',
    value: String(value),
  });
  input.addEventListener('input', () => {
    const next = parseNumberInput(input.value);
    if (next === null) return;
    replaceContent(hint);
    current = next;
    onValue(next);
  }, { signal });
  input.addEventListener('change', () => {
    const next = parseNumberInput(input.value);
    if (next === null || input.validity?.badInput) {
      input.value = String(current);
      replaceContent(hint,
        zhNode('没有读到数字，已恢复原来的数。请用英文输入法输入 0–9、小数点和负号 -。', 'teach', 'span'), ' ',
        enNode('No number was read, so the previous value is back. Type the digits 0–9, a point and - with an English keyboard.', 'span'));
      return;
    }
    onCommit(next);
  }, { signal });
  const element = h('div', { class: 'field z-score__field' },
    h('label', { class: 'field__label', for: id }, labelNodes),
    h('div', { class: 'z-score__input-row' },
      input,
      unit ? h('span', { class: 'z-score__unit', 'aria-hidden': 'true' }, uiText(unit)) : null),
    hint);
  return {
    element,
    set(next) {
      current = next;
      input.value = String(next);
      replaceContent(hint);
    },
  };
}

/**
 * Redraws after the width of `element` changes (frame-throttled); returns a function that stops observing.
 * 元素宽度变化后重画（按动画帧节流）；返回停止监听的函数。
 */
function observeWidth(element, onResize) {
  if (typeof ResizeObserver !== 'function') return () => {};
  let frame = 0;
  let width = Math.round(element.clientWidth);
  const observer = new ResizeObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const measured = Math.round(element.clientWidth);
      if (measured > 0 && measured !== width) {
        width = measured;
        onResize();
      }
    });
  });
  observer.observe(element);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
  };
}

function measuredWidth(element) {
  const width = Math.round(element.clientWidth);
  return width > 0 ? width : FALLBACK_WIDTH;
}

/* ---------- Number line 数轴 ---------- */

/** A dot on the line, or an arrow at its end when the value lies beyond it. 数轴上的点；值超出数轴时在末端画箭头。 */
function marker(scale, span, z, isCurrent) {
  const place = placeOnAxis(z, span);
  if (!place.visible) return null;
  const x = scale.x(place.z);
  const className = ['z-score__dot', isCurrent ? 'z-score__dot--current' : null];
  if (place.side !== 0) {
    const tip = (x + 3 * place.side).toFixed(1);
    const back = (x - 8 * place.side).toFixed(1);
    return s('path', { class: className, d: `M${back} ${STRIP.lineY - 7} L${tip} ${STRIP.lineY} L${back} ${STRIP.lineY + 7} Z` });
  }
  return s('circle', { class: className, cx: x.toFixed(1), cy: STRIP.lineY, r: isCurrent ? 7 : 4.5 });
}

/**
 * Draws one number line into `svg`: ticks at ȳ + k·s with their values above and their z-scores below, the
 * optional outlier-rule bands, the other given values as small dots, and the current value as a large dot
 * joined to the mean and labelled with y and z.
 * 在 svg 中画一条数轴：ȳ + k·s 处的刻度（上方写数值、下方写 z 分数）、可选的离群值规则色带、其他给定值（小点），
 * 以及当前值（大点，与平均数相连，并标出 y 和 z）。
 */
function drawNumberLine(svg, { width, span, mean, sd, unit, current, others = [], bands = false }) {
  const scale = axisScale(width, span, STRIP.padding);
  const ticks = axisTicks(mean, sd, span);
  const valueStride = labelStride(scale.unit, ticks.map((tick) => tick.valueLabel));
  const zStride = labelStride(scale.unit, ticks.map((tick) => tick.zLabel));
  const at = (z) => scale.x(z).toFixed(1);
  const band = (from, to, modifier) => s('rect', {
    class: ['z-score__band', `z-score__band--${modifier}`],
    x: at(from),
    y: STRIP.lineY - STRIP.band,
    width: (scale.x(to) - scale.x(from)).toFixed(1),
    height: 2 * STRIP.band,
  });
  const currentZ = zDetails(current, mean, sd).z;
  const place = placeOnAxis(currentZ, span);
  const text = pointLabel(current, mean, sd);

  svg.setAttribute('viewBox', `0 0 ${width} ${STRIP.height}`);
  svg.setAttribute('aria-label', numberLineDescription({ mean, sd, span, values: [current, ...others], unit }));
  replaceContent(svg,
    bands ? [band(-3, -2, 'suspect'), band(2, 3, 'suspect'), band(-span, -3, 'highly'), band(3, span, 'highly')] : null,
    s('line', { class: 'z-score__axis', x1: scale.left, x2: scale.right, y1: STRIP.lineY, y2: STRIP.lineY }),
    ticks.map((tick) => {
      const half = tick.k === 0 ? STRIP.meanTick : STRIP.tick;
      return s('line', {
        class: ['z-score__tick', tick.k === 0 ? 'z-score__tick--mean' : null],
        x1: at(tick.k), x2: at(tick.k), y1: STRIP.lineY - half, y2: STRIP.lineY + half,
      });
    }),
    ticks.filter((tick) => tick.k % valueStride === 0).map((tick) => s('text', {
      class: ['z-score__tick-value', tick.k === 0 ? 'z-score__tick-value--mean' : null], x: at(tick.k), y: STRIP.valueY, 'text-anchor': 'middle',
    }, tick.valueLabel)),
    ticks.filter((tick) => tick.k % zStride === 0).map((tick) => s('text', {
      class: ['z-score__tick-z', tick.k === 0 ? 'z-score__tick-z--mean' : null], x: at(tick.k), y: STRIP.zY, 'text-anchor': 'middle',
    }, tick.zLabel)),
    place.visible && place.z !== 0
      ? s('line', { class: 'z-score__reach', x1: at(0), x2: at(place.z), y1: STRIP.lineY, y2: STRIP.lineY })
      : null,
    others.map((value) => marker(scale, span, zDetails(value, mean, sd).z, false)),
    marker(scale, span, currentZ, true),
    place.visible ? s('text', {
      class: 'z-score__point-label',
      x: labelCenter(scale.x(place.z), text.length, width).toFixed(1),
      y: STRIP.labelY,
      'text-anchor': 'middle',
    }, text) : null);
}

function numberLineSvg() {
  return s('svg', { class: 'z-score__svg', role: 'img', 'aria-label': '' });
}

/* ---------- Shared panels 共用面板 ---------- */

function headerBlock(model, titleId) {
  const intro = model.mode === 'compare'
    ? [
      '这几个值来自不同的分布，平均数和标准差都不一样，直接比数值并不公平。先把每个值换成 z 分数，再比较谁的相对位置更高。可以改每个 y 试试。',
      'These values come from different distributions with different means and standard deviations, so comparing the raw numbers is not fair. Turn each value into a z-score first, then compare. Try changing each y.',
    ]
    : [
      '点一个给定的值，或者在框里自己输入 y。下面会一步步算出它的 z 分数，数轴会标出 y 离平均数有几个标准差。',
      'Pick a given value or type your own y. The steps compute its z-score, and the number line shows how many standard deviations y is from the mean.',
    ];
  return h('header', { class: 'z-score__header' },
    h('p', { class: 'z-score__eyebrow' }, label('互动演示', 'Interactive')),
    h('h3', { class: 'z-score__title', id: titleId }, biTitle(model.title || DEFAULT_TITLES[model.mode])),
    model.variable && model.mode === 'compare'
      ? h('p', { class: 'z-score__variable' }, label('变量', 'Variable'), ': ', biTitle(model.variable))
      : null,
    pair(intro[0], intro[1], 'z-score__intro'));
}

function formulaPanel(headingId) {
  return h('section', { class: 'z-score__panel', 'aria-labelledby': headingId },
    heading('公式', 'Formula', headingId),
    h('p', { class: 'z-score__formula' },
      math('z = (observation − mean) / standard deviation', 'z-score__formula-words'),
      zhNode('z =（观测值 − 平均数）÷ 标准差', 'gloss', 'span', 'z-score__formula-zh')),
    h('ul', { class: 'z-score__symbols' },
      h('li', {}, label('样本数据', 'Sample data'), ': ', math('z = (y − ȳ) / s')),
      h('li', {}, label('总体数据', 'Population data'), ': ', math('z = (y − μ) / σ'))),
    pair(
      'z 分数（**z-score**，也叫标准化值 **standardized data value**）是一种位置的度量（**measure of position**）：'
        + '它告诉你一个观测值离平均数有几个标准差。比平均数高，z 是正数；比平均数低，z 是负数。'
        + 'z 不带原来的单位（比如 kcal）：它数的是“几个标准差”。',
      'A z-score is a measure of position: the number of standard deviations an observation is from the mean. '
        + 'Values above the mean have positive z-scores and values below the mean negative ones. '
        + 'A z-score has no units such as kcal: it is in units of standard deviation.'),
    pair(
      'y = 观测值（observation）；ȳ = 样本平均数（sample mean）；s = 样本标准差（sample standard deviation，Module 3 写作大写 S）；'
        + 'μ 和 σ = 总体（population）的平均数和标准差。',
      'y = observation; ȳ = sample mean; s = sample standard deviation (written S in Module 3); μ and σ = population mean and standard deviation.',
      'z-score__notation'));
}

/* ---------- One distribution 一个分布 ---------- */

function singleView(model, { ids, signal, announce }) {
  const { mean, sd, unit, values } = model;
  const state = { index: 0, value: values[0], reverseZ: DEFAULT_REVERSE_Z };
  const matchIndex = (value) => {
    const index = values.findIndex((item) => item === value);
    return index >= 0 ? index : null;
  };

  /* Picker 选值 */
  const chips = values.map((value, index) => {
    const chip = button({
      label: withUnit(formatGiven(value), unit), size: 'sm', pressed: index === 0, className: 'z-score__chip',
    });
    chip.addEventListener('click', () => {
      choose(value, index);
      valueField.set(value);
      announce(announcement(value, mean, sd, unit));
    }, { signal });
    return chip;
  });
  const valueField = numberField({
    id: ids.value,
    labelNodes: [label('观测值 y，可以自己改', 'Observation y, you can edit it'), unit ? [' (', uiText(unit), ')'] : null],
    value: state.value,
    unit,
    signal,
    onValue: (next) => choose(next, matchIndex(next)),
    onCommit: (next) => announce(announcement(next, mean, sd, unit)),
  });
  const lineSvg = numberLineSvg();
  const lineHost = h('div', { class: 'z-score__lines' }, lineSvg);
  // The "other values" key is shown only while other given values are drawn as small dots.
  // 只有图上画着其他给定值（小点）时，才显示“其他给定值”这一项图例。
  const othersKey = h('li', {}, h('span', { class: 'z-score__swatch z-score__swatch--dot', 'aria-hidden': 'true' }),
    label('其他给定值', 'other given values'));
  const legend = h('ul', { class: 'z-score__legend' },
    h('li', {}, h('span', { class: 'z-score__swatch z-score__swatch--current', 'aria-hidden': 'true' }), label('选中的值', 'selected value')),
    othersKey,
    h('li', {}, h('span', { class: 'z-score__swatch z-score__swatch--suspect', 'aria-hidden': 'true' }),
      math('2 < |z| ≤ 3'), ' ', label('可疑离群值', 'suspect outlier')),
    h('li', {}, h('span', { class: 'z-score__swatch z-score__swatch--highly', 'aria-hidden': 'true' }),
      math('|z| > 3'), ' ', label('高度可疑离群值', 'highly suspect outlier')));

  const explore = h('section', { class: 'z-score__panel', 'aria-labelledby': ids.explore },
    heading('选一个值，看它在数轴上的位置', 'Pick a value and see where it sits', ids.explore),
    h('p', { class: 'z-score__given' },
      model.variable ? [biTitle(model.variable, { className: 'z-score__given-name' }), ' '] : null,
      h('span', { class: 'z-score__given-item' }, label('平均数', 'mean'), ' ', math(`ȳ = ${withUnit(formatGiven(mean), unit)}`)),
      h('span', { class: 'z-score__given-item' }, label('标准差', 'standard deviation'), ' ', math(`s = ${withUnit(formatGiven(sd), unit)}`))),
    h('div', { class: 'z-score__picker' },
      h('span', { class: 'z-score__picker-label', id: ids.chips }, label('给定的值', 'Given values')),
      h('div', { class: 'z-score__chips', role: 'group', 'aria-labelledby': ids.chips }, chips)),
    valueField.element,
    h('figure', { class: 'z-score__figure' },
      lineHost,
      h('figcaption', { class: 'z-score__caption' }, pair(
        '相邻两条竖线相隔 1 个标准差 s。上面一排是 y 的值（ȳ ± 1s、2s、3s……），下面一排是对应的 z 分数；z = 0 那条线就是平均数 ȳ。',
        'Neighbouring ticks are 1 standard deviation s apart. The top row gives values of y (ȳ ± 1s, 2s, 3s, ...), the bottom row their z-scores; the tick at z = 0 is the mean ȳ.'))),
    legend);

  /* Steps 步骤 */
  const workingLine = h('p', { class: 'z-score__working' });
  const stepsList = h('ol', { class: 'z-score__steps' });
  const resultLine = h('p', { class: 'z-score__result' });
  const examBody = h('div', { class: 'z-score__exam-body' });
  const ruleBody = h('div', { class: 'z-score__rule-body' });
  const steps = h('section', { class: 'z-score__panel', 'aria-labelledby': ids.steps },
    heading('一步一步算 z', 'Compute z step by step', ids.steps),
    workingLine,
    stepsList,
    resultLine,
    h('div', { class: 'z-score__exam' },
      h('p', { class: 'z-score__exam-title' }, label('考试这样写', 'Write it like this')),
      examBody),
    h('div', { class: 'z-score__rule' },
      h('h5', { class: 'z-score__subheading' }, label('z 分数规则：是不是离群值？', 'z-score rule: is it an outlier?')),
      ruleBody,
      pair(
        '注意：这个规则只适用于钟形、对称的分布（bell-shaped symmetric distribution）。它和箱线图的栅栏（fences）规则可能给出不同的结论。',
        'Use this rule only for a bell-shaped, symmetric distribution. It can disagree with the boxplot fences.',
        'z-score__caveat')));

  /* Table of the given values 给定值表格 */
  const rows = values.map((value) => {
    const details = zDetails(value, mean, sd);
    const position = POSITION_LABELS[details.direction] || POSITION_LABELS.none;
    const level = LEVEL_LABELS[details.level];
    return h('tr', {},
      h('th', { scope: 'row', class: 'z-score__num' }, uiText(withUnit(formatGiven(value), unit))),
      h('td', { class: 'z-score__num' }, uiText(formatDeviation(details.deviation, unit))),
      h('td', { class: 'z-score__num' }, formatZ(details.z)),
      h('td', {}, label(position.zh, position.en)),
      h('td', {}, label(level.zh, level.en)));
  });
  const table = h('section', { class: 'z-score__panel', 'aria-labelledby': ids.table },
    heading('所有给定值的 z 分数', 'z-scores of all given values', ids.table),
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data-table z-score__table' },
        h('caption', { class: 'visually-hidden' }, label('每个给定值的 y − ȳ、z 和位置', 'y − ȳ, z and position of each given value')),
        h('thead', {}, h('tr', {},
          headCell('y'),
          headCell(math('y − ȳ')),
          headCell('z'),
          headCell(label('位置', 'Position')),
          headCell(label('z 分数规则', 'z-score rule')))),
        h('tbody', {}, rows))));

  /* Reverse 反推 */
  const reverseLine = h('p', { class: 'z-score__working' });
  const reverseSentence = h('div', { class: 'z-score__reverse-sentence' });
  const reverseField = numberField({
    id: ids.reverse,
    labelNodes: label('z 分数', 'z-score'),
    value: state.reverseZ,
    step: '0.1',
    signal,
    onValue: (next) => {
      state.reverseZ = next;
      renderReverse();
    },
    onCommit: (next) => {
      const reverse = reverseFromZ(next, mean, sd, unit);
      announce(`${reverse.zh} ${reverse.en}`);
    },
  });
  const reverse = h('section', { class: 'z-score__panel', 'aria-labelledby': ids.reversePanel },
    heading('反过来：已知 z 求 y', 'Reverse: from a z-score back to y', ids.reversePanel),
    pair(
      '把公式倒过来：y = ȳ + z × s。比如 z = 2 就是“比平均数高 2 个标准差”的那个值，也就是数轴上 z = 2 那条竖线。',
      'Turn the formula around: y = ȳ + z × s. For example, z = 2 is the value 2 standard deviations above the mean: the tick at z = 2 on the number line.'),
    reverseField.element,
    reverseLine,
    reverseSentence);

  function choose(value, index) {
    state.value = value;
    state.index = index;
    render();
  }

  function drawLines() {
    const others = values.filter((_, index) => index !== state.index);
    const zs = [state.value, ...values].map((value) => zDetails(value, mean, sd).z);
    othersKey.hidden = !others.length;
    drawNumberLine(lineSvg, {
      width: measuredWidth(lineHost), span: axisSpan(zs), mean, sd, unit, current: state.value, others, bands: true,
    });
  }

  function renderReverse() {
    const result = reverseFromZ(state.reverseZ, mean, sd, unit);
    replaceContent(reverseLine, math(result.line));
    replaceContent(reverseSentence, pair(result.zh, result.en));
  }

  function render() {
    chips.forEach((chip, index) => chip.setAttribute('aria-pressed', String(index === state.index)));
    rows.forEach((row, index) => {
      row.classList.toggle('z-score__row--current', index === state.index);
      if (index === state.index) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    const working = zWorking(state.value, mean, sd);
    replaceContent(workingLine, math(working.line));
    replaceContent(stepsList, zSteps(state.value, mean, sd, unit).map((step) => h('li', { class: 'z-score__step' },
      h('p', { class: 'z-score__step-math' }, math(step.math)),
      pair(step.zh, step.en))));
    replaceContent(resultLine, label('结果', 'Result'), ': ', math(`z ${working.result}`, 'z-score__result-value'));
    const sentence = interpretZ(state.value, mean, sd, unit);
    replaceContent(examBody,
      examSentence(sentence.en, sentence.zh),
      sentence.template ? h('p', { class: 'z-score__template' },
        h('span', { class: 'z-score__template-label' }, label('套用老师的句式', 'Instructor\'s pattern')), ' ',
        enNode(sentence.template, 'span', 'z-score__template-en')) : null,
      sentence.template ? pair('把方括号换成题目里的变量（variable）和研究对象（case）。', 'Replace the brackets with the variable and the case from the question.', 'z-score__template-hint') : null);
    const rule = zRule(zDetails(state.value, mean, sd).z);
    replaceContent(ruleBody,
      levelBadge(rule.level),
      pair(rule.zh, rule.en),
      h('p', { class: 'z-score__extreme' },
        h('span', { class: 'z-score__extreme-label' }, label('是极端值吗？', 'Extreme value?')), ' ',
        enNode(rule.extreme.en, 'span', 'z-score__exam-en'), ' ',
        zhNode(rule.extreme.zh, 'gloss', 'span', 'z-score__exam-zh')));
    drawLines();
  }

  function reset() {
    state.reverseZ = DEFAULT_REVERSE_Z;
    reverseField.set(DEFAULT_REVERSE_Z);
    valueField.set(values[0]);
    choose(values[0], 0);
    renderReverse();
  }

  renderReverse();
  return {
    panels: [explore, steps, table, reverse],
    lineHost,
    render,
    drawLines,
    reset,
  };
}

/* ---------- Several distributions 多个分布 ---------- */

function compareView(model, { ids, signal, announce }) {
  const { entries, unit } = model;
  const values = entries.map((entry) => entry.value);
  const currentEntries = () => entries.map((entry, index) => ({ ...entry, value: values[index] }));

  /* Cards 卡片 */
  const cards = entries.map((entry, index) => {
    // The field names its distribution without a value written into the name, which stops being true once the
    // learner types another value. 输入框标签使用不含数值的名称：学习者改了数值以后，名称里写的数值就不再对了。
    const nameZh = entry.sentenceName.zh || entry.sentenceName.en;
    const nameEn = entry.sentenceName.en || entry.sentenceName.zh;
    const field = numberField({
      id: `${ids.value}-${index}`,
      // A name may be English only, so the Chinese label is split by script for the language modes.
      // 名称可能只有英文，所以中文标签按文字拆分，让语言模式正确处理每一段。
      labelNodes: [scriptText(`${nameZh} 的值 y`, { role: 'label' }), ' ', enNode(`Value y for ${nameEn}`)],
      value: entry.value,
      unit,
      signal,
      onValue: (next) => {
        values[index] = next;
        render();
      },
      onCommit: (next) => announce(announcement(next, entry.mean, entry.sd, unit)),
    });
    const working = h('p', { class: 'z-score__working' });
    const sentence = h('div', { class: 'z-score__card-sentence' });
    const badge = h('p', { class: 'z-score__top', hidden: true },
      icon('arrowUp', { size: 14 }), label('相对位置最高', 'relatively highest'));
    const element = h('article', { class: 'z-score__card', 'aria-labelledby': `${ids.value}-${index}-name` },
      h('h5', { class: 'z-score__card-title', id: `${ids.value}-${index}-name` }, biTitle(entry.name)),
      h('p', { class: 'z-score__given' },
        h('span', { class: 'z-score__given-item' }, label('平均数', 'mean'), ' ', math(`ȳ = ${withUnit(formatGiven(entry.mean), unit)}`)),
        h('span', { class: 'z-score__given-item' }, label('标准差', 'SD'), ' ', math(`s = ${withUnit(formatGiven(entry.sd), unit)}`))),
      field.element,
      working,
      sentence,
      badge);
    return { element, field, working, sentence, badge };
  });

  /* Lined-up number lines 对齐的数轴 */
  const lines = entries.map((entry) => ({
    entry,
    svg: numberLineSvg(),
  }));
  const lineHost = h('div', { class: 'z-score__lines' },
    lines.map((line) => h('div', { class: 'z-score__line-row' },
      h('p', { class: 'z-score__line-name' }, biTitle(line.entry.name), ' ',
        math(`ȳ = ${withUnit(formatGiven(line.entry.mean), unit)}, s = ${withUnit(formatGiven(line.entry.sd), unit)}`)),
      line.svg)));
  const linesPanel = h('section', { class: 'z-score__panel', 'aria-labelledby': ids.explore },
    heading('按标准差对齐的数轴', 'Number lines lined up by standard deviations', ids.explore),
    h('figure', { class: 'z-score__figure' },
      lineHost,
      h('figcaption', { class: 'z-score__caption' }, pair(
        '每条数轴都按自己的平均数和标准差画，相邻竖线相隔 1 个标准差，所以上下对齐的位置 z 相同：点越靠右，相对位置越高。',
        'Each line uses its own mean and standard deviation, with ticks 1 standard deviation apart, so the lines are lined up by z: the further right a point is, the relatively higher it is.'))));

  /* Conclusion 结论 */
  const conclusionBody = h('div', { class: 'z-score__conclusion' });
  const examBody = h('div', { class: 'z-score__exam-body' });
  const waysList = h('ul', { class: 'z-score__ways' });
  const conclusion = h('section', { class: 'z-score__panel', 'aria-labelledby': ids.steps },
    heading('谁的相对位置更高？', 'Which value is relatively higher?', ids.steps),
    conclusionBody,
    h('div', { class: 'z-score__exam' },
      h('p', { class: 'z-score__exam-title' }, label('考试这样写（数值越高越好时，比如考试分数）', 'Write it like this (when higher is better, such as exam scores)')),
      examBody),
    h('h5', { class: 'z-score__subheading' }, label('三种比较方法', 'Three ways to compare')),
    waysList);

  /* Table 表格 */
  const tableBody = h('tbody', {});
  const table = h('section', { class: 'z-score__panel', 'aria-labelledby': ids.table },
    heading('并排比较', 'Side by side', ids.table),
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data-table z-score__table' },
        h('caption', { class: 'visually-hidden' }, label('每个值的平均数、标准差、y − ȳ、z 和排名', 'Mean, standard deviation, y − ȳ, z and rank of each value')),
        h('thead', {}, h('tr', {},
          headCell(label('分布', 'Distribution')),
          headCell('y'),
          headCell('ȳ'),
          headCell('s'),
          headCell(math('y − ȳ')),
          headCell('z'),
          headCell(label('按 z 排名', 'Rank by z')))),
        tableBody)));

  function drawLines() {
    const width = measuredWidth(lineHost);
    const span = axisSpan(currentEntries().map((entry) => zDetails(entry.value, entry.mean, entry.sd).z));
    lines.forEach((line, index) => {
      drawNumberLine(line.svg, {
        width, span, mean: line.entry.mean, sd: line.entry.sd, unit, current: values[index],
      });
    });
  }

  function render() {
    const result = compareValues(currentEntries());
    const text = comparisonText(result, unit);
    cards.forEach((card, index) => {
      const entry = entries[index];
      replaceContent(card.working, math(zWorking(values[index], entry.mean, entry.sd).line));
      const sentence = interpretZ(values[index], entry.mean, entry.sd, unit);
      replaceContent(card.sentence, examSentence(sentence.en, sentence.zh));
      const isTop = result.top.includes(index);
      card.badge.hidden = !isTop;
      card.element.classList.toggle('z-score__card--top', isTop);
    });
    replaceContent(conclusionBody,
      pair(text.conclusion.zh, text.conclusion.en, 'z-score__conclusion-text'),
      text.chain ? h('p', { class: 'z-score__chain' }, label('z 从大到小', 'z from largest to smallest'), ': ', math(text.chain)) : null);
    replaceContent(examBody, text.exam.en ? examSentence(text.exam.en, text.exam.zh) : null);
    replaceContent(waysList, text.ways.map((way) => h('li', { class: ['z-score__way', way.fair ? 'z-score__way--fair' : 'z-score__way--unfair'] },
      h('p', { class: 'z-score__way-head' },
        h('span', { class: 'z-score__way-name' }, label(WAY_LABELS[way.id].zh, WAY_LABELS[way.id].en)),
        fairBadge(way.fair)),
      h('p', { class: 'z-score__way-pick' },
        label('选出', 'picks'), ': ',
        way.picks.map((item, position) => [
          position ? ', ' : null,
          math(item.text),
          ' ',
          biTitle(entries[item.index].sentenceName, { className: 'z-score__way-entry' }),
        ])),
      pair(way.reason.zh, way.reason.en))));
    replaceContent(tableBody, result.rows.map((row, index) => h('tr', { class: result.top.includes(index) ? 'z-score__row--current' : null },
      h('th', { scope: 'row' }, biTitle(entries[index].name)),
      h('td', { class: 'z-score__num' }, uiText(withUnit(formatGiven(row.value), unit))),
      h('td', { class: 'z-score__num' }, uiText(withUnit(formatGiven(row.mean), unit))),
      h('td', { class: 'z-score__num' }, uiText(withUnit(formatGiven(row.sd), unit))),
      h('td', { class: 'z-score__num' }, uiText(formatDeviation(row.deviation, unit))),
      h('td', { class: 'z-score__num' }, formatZ(row.z, result.zDigits)),
      h('td', { class: 'z-score__num' }, String(result.ranks[index])))));
    drawLines();
  }

  function reset() {
    entries.forEach((entry, index) => {
      values[index] = entry.value;
      cards[index].field.set(entry.value);
    });
    render();
  }

  return {
    panels: [h('div', { class: 'z-score__cards' }, cards.map((card) => card.element)), linesPanel, conclusion, table],
    lineHost,
    render,
    drawLines,
    reset,
  };
}

/* ---------- Mount 挂载 ---------- */

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./z-score.css', import.meta.url));
  mountCount += 1;
  const prefix = `z-score-${mountCount}`;
  const ids = {
    title: `${prefix}-title`,
    formula: `${prefix}-formula`,
    explore: `${prefix}-explore`,
    chips: `${prefix}-chips`,
    value: `${prefix}-value`,
    steps: `${prefix}-steps`,
    table: `${prefix}-table`,
    reverse: `${prefix}-reverse`,
    reversePanel: `${prefix}-reverse-panel`,
  };
  const model = normalizeZScoreConfig(config);
  // Every listener is registered with this signal, so the cleanup removes them all at once.
  // 所有事件监听都用这个 signal 注册，清理时一次全部移除。
  const controller = new AbortController();
  const live = liveRegion();
  const tools = { ids, signal: controller.signal, announce: live.announce };
  const view = model.mode === 'compare' ? compareView(model, tools) : singleView(model, tools);

  const resetButton = button({ label: '恢复初始数值 Reset', iconName: 'refresh', variant: 'ghost', size: 'sm' });
  resetButton.addEventListener('click', () => {
    view.reset();
    live.announce('已恢复初始数值。 Back to the starting values.');
  }, { signal: controller.signal });

  const root = h('section', { class: 'z-score', 'aria-labelledby': ids.title },
    headerBlock(model, ids.title),
    formulaPanel(ids.formula),
    view.panels,
    h('div', { class: 'z-score__actions' }, resetButton),
    live.element);

  container.replaceChildren(root);
  view.render();
  const stopObserving = observeWidth(view.lineHost, view.drawLines);

  return () => {
    controller.abort();
    stopObserving();
  };
}
