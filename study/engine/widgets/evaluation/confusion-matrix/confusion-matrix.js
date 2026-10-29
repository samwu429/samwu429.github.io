/**
 * Widget "confusion-matrix": an editable PREDICTED x ACTUAL grid (lec06 p.30) with live accuracy,
 * precision, recall and F1, each shown with its slide formula and the numbers substituted in.
 * Presets come from the content; two presets can be compared side by side.
 * 组件“confusion-matrix”：可编辑的“行 = 预测、列 = 实际”四格表（lec06 第 30 页），实时计算准确率、
 * 精确率、召回率和 F1，并显示课件公式与代入数字后的算式。预设来自内容文件，可并排对比两个预设。
 *
 * Config: { presets: [{ name: {zh, en}, tp, fp, fn, tn }] }
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { icon } from '../../../core/dom/icons.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { button } from '../../../components/controls/button.js';
import { formulaLine, liveRegion, subheading, teachPair, uniqueId, widgetFrame } from '../shared/eval-ui.js';
import { createMatrixEditor } from '../shared/matrix-editor.js';
import { FORMULAS, formatPercent, formulaLines } from '../shared/metric-format.js';
import { CELL_KEYS, METRIC_CELLS, summarize } from '../shared/metrics.js';
import { compareCounts, initialCounts, matchingPreset, normalizePresets } from './confusion-logic.js';

const METRICS = [
  {
    id: 'accuracy',
    title: { zh: '准确率', en: 'Accuracy' },
    meaning: { zh: '所有样本里，模型猜对了多少（TP 和 TN 都算猜对）。', en: 'Out of all examples, how many did the model get right?' },
    focus: { zh: '用到全部四个格子；分子是对角线上猜对的 TP + TN。', en: 'Uses all four cells; the numerator is the diagonal TP + TN.' },
  },
  {
    id: 'precision',
    title: { zh: '精确率', en: 'Precision' },
    meaning: { zh: '预测为正的里面，有多少真是正。', en: 'Of everything predicted positive, how much is really positive?' },
    focus: { zh: '只看第一行（PREDICTED = POSITIVE）：TP 除以这一行的合计 TP + FP。', en: 'Only the first row (PREDICTED = POSITIVE): TP divided by TP + FP.' },
  },
  {
    id: 'recall',
    title: { zh: '召回率', en: 'Recall' },
    meaning: { zh: '真正为正的里面，抓到了多少。', en: 'Of all actual positives, how many did the model catch?' },
    focus: { zh: '只看第一列（ACTUAL = POSITIVE）：TP 除以这一列的合计 TP + FN。', en: 'Only the first column (ACTUAL = POSITIVE): TP divided by TP + FN.' },
  },
  {
    id: 'f1',
    title: { zh: 'F1 分数', en: 'F1 score' },
    meaning: { zh: '把精确率和召回率合成一个分数：两个都高，F1 才高；只要有一个低，F1 就被拉低。', en: 'Combines precision and recall: F1 is high only when both are high.' },
    focus: { zh: '用到 TP、FP、FN 三个格子，完全不看 TN。', en: 'Uses TP, FP and FN; it never looks at TN.' },
  },
];

const METRIC_BY_ID = Object.fromEntries(METRICS.map((info) => [info.id, info]));

const UNDEFINED_TEXT = {
  accuracy: { zh: '四个格子都是 0：还没有任何样本，分母为 0，准确率无法计算。', en: 'All four cells are 0, so the denominator is 0 and accuracy is undefined.' },
  precision: { zh: 'TP + FP = 0：模型一个“正”都没有预测，分母为 0，精确率无法计算。', en: 'TP + FP = 0: no positive predictions, so precision is undefined.' },
  recall: { zh: 'TP + FN = 0：数据里没有实际为正的样本，分母为 0，召回率无法计算。', en: 'TP + FN = 0: no actual positives, so recall is undefined.' },
  f1: {
    precision: { zh: '精确率无法计算（TP + FP = 0），所以 F1 也无法计算。', en: 'Precision is undefined, so F1 is undefined too.' },
    recall: { zh: '召回率无法计算（TP + FN = 0），所以 F1 也无法计算。', en: 'Recall is undefined, so F1 is undefined too.' },
    'zero-sum': { zh: 'TP = 0，精确率和召回率都是 0：分母 Precision + Recall = 0，F1 无法计算。', en: 'Precision and recall are both 0, so the denominator is 0 and F1 is undefined.' },
  },
};

const CELL_NAMES = {
  tp: 'TP 真阳性',
  fp: 'FP 假阳性',
  fn: 'FN 假阴性',
  tn: 'TN 真阴性',
};

function plainName(value) {
  const zh = stripMarkup(value.zh || '');
  const en = stripMarkup(value.en || '');
  return zh && en && zh !== en ? `${zh} · ${en}` : (zh || en);
}

function percentOrUndefined(value) {
  return value === null ? '无法计算 undefined' : formatPercent(value);
}

export async function mount(container, config, context) {
  await Promise.all([
    ensureStylesheet(new URL('../shared/eval-ui.css', import.meta.url)),
    ensureStylesheet(new URL('../shared/matrix-editor.css', import.meta.url)),
    ensureStylesheet(new URL('./confusion-matrix.css', import.meta.url)),
  ]);

  const presets = normalizePresets(config);
  let counts = initialCounts(presets);
  let pinnedMetric = null;
  const live = liveRegion();

  const frame = widgetFrame({
    className: 'confusion-matrix',
    title: { zh: '混淆矩阵（四格表）', en: 'Confusion matrix' },
    intro: {
      zh: '改四个格子里的数字，或者点一个预设；下面的指标和代入数字的公式会立刻重算。',
      en: 'Edit the four cells or pick a preset; every metric and formula updates at once.',
    },
  });

  function summaryText() {
    const summary = summarize(counts);
    return `准确率 Accuracy ${percentOrUndefined(summary.accuracy.value)}，精确率 Precision ${percentOrUndefined(summary.precision.value)}，`
      + `召回率 Recall ${percentOrUndefined(summary.recall.value)}，F1 ${percentOrUndefined(summary.f1.value)}`;
  }

  /* ---------- Matrix and highlight hint 四格表与高亮提示 ---------- */

  const matrix = createMatrixEditor({
    counts,
    onChange: (next) => {
      counts = next;
      update();
    },
    onCommit: () => live.announce(summaryText()),
  });

  const hint = h('div', { class: 'confusion-matrix__hint' });

  function renderHint(metricId) {
    const info = metricId ? METRIC_BY_ID[metricId] : null;
    if (!info) {
      replaceContent(hint, teachPair({
        zh: '提示：点指标卡上的“标出”，看看公式用了哪几个格子。对角线（TP、TN）是猜对的，另外两格（FP、FN）是猜错的。',
        en: 'Tip: press Highlight on a metric to see which cells its formula uses.',
      }));
      return;
    }
    const legend = METRIC_CELLS[metricId].numerator.length
      ? '黄底 = 分子 numerator · 蓝框 = 分母 denominator'
      : '蓝框 = 用到的格子 cells used';
    replaceContent(hint,
      h('p', { class: 'confusion-matrix__hint-title' }, biTitle(info.title)),
      teachPair(info.focus),
      h('p', { class: 'confusion-matrix__legend' }, legend));
  }

  function showHighlight(metricId) {
    matrix.setHighlight(metricId ? METRIC_CELLS[metricId] : null);
    renderHint(metricId);
  }

  /* ---------- Metric cards 指标卡片 ---------- */

  const cardViews = {};

  function togglePinned(metricId) {
    pinnedMetric = pinnedMetric === metricId ? null : metricId;
    for (const [id, view] of Object.entries(cardViews)) {
      view.toggle.setAttribute('aria-pressed', String(id === pinnedMetric));
      view.card.classList.toggle('is-pinned', id === pinnedMetric);
    }
    showHighlight(pinnedMetric);
    live.announce(pinnedMetric
      ? `已标出 Highlighting: ${METRIC_BY_ID[pinnedMetric].title.zh} ${METRIC_BY_ID[pinnedMetric].title.en}`
      : '已取消标出 Highlight off');
  }

  function metricCard(info) {
    const titleId = uniqueId('confusion-matrix-metric');
    const value = h('p', { class: 'confusion-matrix__value' });
    const substituted = formulaLine('');
    const warning = h('div', { class: ['callout', 'callout--warn', 'confusion-matrix__warning'], hidden: true });
    const toggle = button({
      label: '标出 Highlight',
      iconName: 'eye',
      variant: 'ghost',
      size: 'sm',
      pressed: false,
      className: 'confusion-matrix__toggle',
      ariaLabel: `在表中标出${info.title.zh}用到的格子 Highlight the cells used by ${info.title.en}`,
      onClick: () => togglePinned(info.id),
    });
    // Mouse users get a quick preview on hover; the toggle button is the keyboard and touch path.
    // 鼠标悬停即可预览；键盘与触屏用户使用“标出”按钮。
    const card = h('article', {
      class: 'confusion-matrix__metric',
      dataset: { metric: info.id },
      'aria-labelledby': titleId,
      onpointerenter: (event) => {
        if (event.pointerType === 'mouse') showHighlight(info.id);
      },
      onpointerleave: (event) => {
        if (event.pointerType === 'mouse') showHighlight(pinnedMetric);
      },
    },
    h('div', { class: 'confusion-matrix__metric-head' },
      h('h4', { class: 'confusion-matrix__metric-title', id: titleId }, biTitle(info.title)),
      toggle),
    value,
    formulaLine(FORMULAS[info.id], { general: true }),
    substituted,
    warning,
    teachPair(info.meaning, { className: 'confusion-matrix__meaning' }));
    cardViews[info.id] = { card, value, substituted, warning, toggle };
    return card;
  }

  const metricsGrid = h('div', { class: 'confusion-matrix__metrics' }, METRICS.map(metricCard));

  /* ---------- Presets 预设 ---------- */

  const presetLabelId = uniqueId('confusion-matrix-presets');
  const presetButtons = presets.map((preset) => button({
    label: biTitle(preset.name),
    variant: 'secondary',
    size: 'sm',
    pressed: false,
    className: 'confusion-matrix__preset',
    onClick: () => applyCounts(preset.counts, `已载入 Loaded: ${plainName(preset.name)}。`),
  }));

  function syncPresets() {
    const active = matchingPreset(presets, counts);
    presetButtons.forEach((presetButton, index) => presetButton.setAttribute('aria-pressed', String(index === active)));
  }

  function applyCounts(next, message) {
    counts = { ...next };
    matrix.setCounts(counts);
    update();
    live.announce(`${message}${summaryText()}`);
  }

  /* ---------- Side-by-side comparison 并排对比 ---------- */

  const canCompare = presets.length >= 2;
  let compareOpen = false;
  let leftIndex = 0;
  let rightIndex = 1;
  const compareId = uniqueId('confusion-matrix-compare');
  const compareHeadingId = uniqueId('confusion-matrix-compare-title');
  const compareTable = h('div', { class: 'confusion-matrix__compare-table-host' });
  const compareNotes = h('div', { class: ['callout', 'callout--tip', 'confusion-matrix__compare-notes'] });

  function presetSelect(labelText, selectedIndex, onSelect) {
    const selectId = uniqueId('confusion-matrix-select');
    const select = h('select', {
      id: selectId,
      class: 'select',
      onchange: () => onSelect(Number(select.value)),
    }, presets.map((preset, index) => h('option', { value: String(index), selected: index === selectedIndex }, plainName(preset.name))));
    return h('div', { class: ['field', 'confusion-matrix__select'] },
      h('label', { class: 'field__label', for: selectId }, labelText),
      select);
  }

  // The higher value is marked with a check and a word, not only with the highlight colour.
  // 较高的值除了底色，还用对勾和文字标出。
  function compareCell(part, isHigher) {
    const hasFraction = typeof part.numerator === 'number';
    return h('td', { class: ['confusion-matrix__compare-cell', isHigher ? 'is-higher' : null] },
      h('span', { class: 'confusion-matrix__compare-value' }, part.value === null ? '—' : formatPercent(part.value)),
      hasFraction ? h('span', { class: 'confusion-matrix__compare-fraction' }, `${part.numerator} / ${part.denominator}`) : null,
      isHigher ? h('span', { class: 'confusion-matrix__compare-higher' },
        icon('check', { size: 12 }), zhNode('较高', 'label'), ' ', enNode('higher')) : null);
  }

  function renderCompare() {
    const left = presets[leftIndex];
    const right = presets[rightIndex];
    const result = compareCounts(left.counts, right.counts);
    const countRows = CELL_KEYS.map((key) => h('tr', {},
      h('th', { scope: 'row' }, CELL_NAMES[key]),
      h('td', { class: 'confusion-matrix__compare-count' }, String(left.counts[key])),
      h('td', { class: 'confusion-matrix__compare-count' }, String(right.counts[key]))));
    const metricRows = result.rows.map((row) => h('tr', {},
      h('th', { scope: 'row' }, biTitle(METRIC_BY_ID[row.id].title)),
      compareCell(row.a, row.better === 'a'),
      compareCell(row.b, row.better === 'b')));

    replaceContent(compareTable,
      h('div', { class: 'table-scroll' },
        h('table', { class: ['data-table', 'confusion-matrix__compare-grid'] },
          h('caption', { class: 'visually-hidden' }, '两个预设的计数与指标 Counts and metrics of two presets'),
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, '指标 Metric'),
            h('th', { scope: 'col' }, biTitle(left.name)),
            h('th', { scope: 'col' }, biTitle(right.name)))),
          h('tbody', {}, countRows, metricRows))),
      h('p', { class: 'confusion-matrix__compare-legend' },
        icon('check', { size: 12 }), ' ', zhNode('较高 = 两者中较高的那个值', 'label'), ' ', enNode('higher = the higher of the two values')));

    replaceContent(compareNotes,
      h('span', { class: 'callout__label' }, '怎么选 Which one is better?'),
      result.sameAccuracy ? teachPair({
        zh: '这两个准确率完全一样，但 FP 和 FN 不一样：只看准确率，看不出模型犯的是哪一种错。',
        en: 'The accuracy is the same, but FP and FN differ: accuracy alone hides which kind of error a model makes.',
      }) : null,
      teachPair({
        zh: '漏掉一个真正的正例（FN）代价很大时，比如严重的病需要早发现，选召回率高的；误报（FP）代价很大时，比如进一步检查很贵，选精确率高的。',
        en: 'If missing a positive (FN) is costly, such as a serious disease, prefer higher recall. If a false alarm (FP) is costly, such as expensive further testing, prefer higher precision.',
      }));
  }

  const comparePanel = canCompare ? h('section', {
    id: compareId,
    class: 'confusion-matrix__compare',
    'aria-labelledby': compareHeadingId,
    hidden: true,
  },
  subheading({ zh: '并排对比两个预设', en: 'Compare two presets side by side' }, { id: compareHeadingId }),
  presets.length > 2 ? h('div', { class: 'confusion-matrix__selects' },
    presetSelect('左边 Left', leftIndex, (index) => {
      leftIndex = index;
      renderCompare();
    }),
    presetSelect('右边 Right', rightIndex, (index) => {
      rightIndex = index;
      renderCompare();
    })) : null,
  compareTable,
  compareNotes) : null;

  const compareToggle = canCompare ? button({
    label: '并排对比 Compare presets',
    iconName: 'grid',
    variant: 'secondary',
    size: 'sm',
    className: 'confusion-matrix__compare-toggle',
    onClick: () => {
      compareOpen = !compareOpen;
      compareToggle.setAttribute('aria-expanded', String(compareOpen));
      comparePanel.hidden = !compareOpen;
      if (compareOpen) renderCompare();
    },
  }) : null;
  if (compareToggle) {
    compareToggle.setAttribute('aria-expanded', 'false');
    compareToggle.setAttribute('aria-controls', compareId);
  }

  const resetButton = button({
    label: '恢复初始数字 Reset',
    iconName: 'refresh',
    variant: 'ghost',
    size: 'sm',
    onClick: () => applyCounts(initialCounts(presets), '已恢复 Reset. '),
  });

  /* ---------- Recompute 重新计算 ---------- */

  function update() {
    const summary = summarize(counts);
    const lines = formulaLines(counts, { digits: 1, trim: true });
    for (const info of METRICS) {
      const view = cardViews[info.id];
      const part = summary[info.id];
      const undefinedValue = part.value === null;
      view.value.textContent = undefinedValue ? '无法计算 Undefined' : formatPercent(part.value);
      view.value.classList.toggle('is-undefined', undefinedValue);
      view.substituted.textContent = lines[info.id] || '';
      view.substituted.hidden = !lines[info.id];
      if (undefinedValue) {
        const text = info.id === 'f1' ? UNDEFINED_TEXT.f1[part.reason] : UNDEFINED_TEXT[info.id];
        replaceContent(view.warning, teachPair(text));
      }
      view.warning.hidden = !undefinedValue;
    }
    syncPresets();
  }

  replaceContent(frame.body,
    h('div', { class: 'confusion-matrix__toolbar' },
      presets.length ? h('div', { class: 'confusion-matrix__presets', role: 'group', 'aria-labelledby': presetLabelId },
        h('span', { class: 'confusion-matrix__presets-label', id: presetLabelId }, '预设 Presets'),
        presetButtons) : null,
      h('div', { class: 'confusion-matrix__actions' }, compareToggle, resetButton)),
    h('div', { class: 'confusion-matrix__grid-area' }, matrix.element, hint),
    metricsGrid,
    comparePanel,
    live.element);

  renderHint(null);
  update();
  replaceContent(container, frame.root);
}
