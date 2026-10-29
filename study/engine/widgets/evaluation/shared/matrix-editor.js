/**
 * Editable 2 x 2 confusion matrix in the slide layout: PREDICTED rows, ACTUAL columns,
 * with row and column totals (the denominators of precision and recall).
 * 课件布局的可编辑 2 x 2 四格表：行 = 预测，列 = 实际，并附行/列合计（即精确率、召回率的分母）。
 *
 * Returns { element, getCounts, setCounts, setHighlight }. `onChange` fires while typing,
 * `onCommit` when an edit is finished (change event), which is when screen readers get a summary.
 * 返回 { element, getCounts, setCounts, setHighlight }。输入时触发 onChange，
 * 编辑完成（change 事件）时触发 onCommit，此时再向读屏软件播报摘要。
 */
import { h } from '../../../core/dom/element.js';
import { enNode, zhNode } from '../../../core/text/bilingual.js';
import { uniqueId } from './eval-ui.js';
import { CELL_KEYS, MAX_COUNT, normalizeCounts, sanitizeCount } from './metrics.js';

const CELL_INFO = {
  tp: { abbr: 'TP', en: 'True Positive', zh: '真阳性', correct: true },
  fp: { abbr: 'FP', en: 'False Positive', zh: '假阳性', correct: false },
  fn: { abbr: 'FN', en: 'False Negative', zh: '假阴性', correct: false },
  tn: { abbr: 'TN', en: 'True Negative', zh: '真阴性', correct: true },
};

// Each total is named after the cells it adds up, so highlights can find "their" total.
// 每个合计以它相加的格子命名，便于高亮时找到对应的合计格。
const TOTALS = {
  predictedPositive: { cells: ['tp', 'fp'], formula: 'TP + FP' },
  predictedNegative: { cells: ['fn', 'tn'], formula: 'FN + TN' },
  actualPositive: { cells: ['tp', 'fn'], formula: 'TP + FN' },
  actualNegative: { cells: ['fp', 'tn'], formula: 'FP + TN' },
  all: { cells: ['tp', 'fp', 'fn', 'tn'], formula: 'N' },
};

function sameSet(a, b) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function headerCell(scope, en, zh, extraClass) {
  return h('th', { scope, class: ['eval-matrix__head', `eval-matrix__head--${scope}`, extraClass] },
    h('span', { class: 'eval-matrix__head-en', lang: 'en' }, en),
    zhNode(zh, 'gloss', 'span', 'eval-matrix__head-zh'));
}

export function createMatrixEditor({ counts, onChange, onCommit, compact = false, caption } = {}) {
  const id = uniqueId('eval-matrix');
  let current = normalizeCounts(counts);
  const inputs = {};
  const cells = {};
  const totalCells = {};
  const totalValues = {};

  function editableCell(key) {
    const info = CELL_INFO[key];
    const inputId = `${id}-${key}`;
    const input = h('input', {
      id: inputId,
      class: 'eval-matrix__input',
      type: 'number',
      inputmode: 'numeric',
      min: 0,
      max: MAX_COUNT,
      step: 1,
      value: String(current[key]),
      oninput: () => {
        current = { ...current, [key]: sanitizeCount(input.value) };
        renderTotals();
        onChange?.({ ...current });
      },
      // Show the cleaned value (no blanks, negatives or decimals) once editing ends.
      // 编辑结束后显示清理过的数值（不留空白、负数或小数）。
      onchange: () => {
        input.value = String(current[key]);
        onCommit?.({ ...current });
      },
    });
    inputs[key] = input;
    cells[key] = h('td', {
      class: ['eval-matrix__cell', `eval-matrix__cell--${key}`, info.correct ? 'is-correct' : 'is-error'],
      dataset: { cell: key },
    },
    h('label', { class: 'eval-matrix__label', for: inputId },
      h('span', { class: 'eval-matrix__abbr', lang: 'en' }, info.abbr),
      compact ? null : enNode(info.en, 'span', 'eval-matrix__name'),
      zhNode(info.zh, 'gloss', 'span', 'eval-matrix__zh')),
    input);
    return cells[key];
  }

  function totalCell(key) {
    totalValues[key] = h('span', { class: 'eval-matrix__total-value' }, '0');
    totalCells[key] = h('td', {
      class: ['eval-matrix__total', key === 'all' ? 'eval-matrix__total--all' : null],
      dataset: { total: key },
      title: key === 'all' ? 'N = TP + FP + FN + TN' : undefined,
    },
    totalValues[key],
    h('span', { class: 'eval-matrix__total-formula', lang: 'en' }, TOTALS[key].formula));
    return totalCells[key];
  }

  function renderTotals() {
    for (const [key, { cells: parts }] of Object.entries(TOTALS)) {
      totalValues[key].textContent = String(parts.reduce((sum, part) => sum + current[part], 0));
    }
  }

  const captionNode = h('caption', { class: 'eval-matrix__caption' },
    caption || null,
    zhNode('行 = 预测，列 = 实际', 'label', 'span', 'eval-matrix__caption-zh'),
    enNode('Rows: PREDICTED · Columns: ACTUAL', 'span', 'eval-matrix__caption-en'));

  const table = h('table', { class: 'eval-matrix__table' },
    captionNode,
    h('colgroup', {},
      h('col', { class: 'eval-matrix__col-head' }),
      h('col', { class: 'eval-matrix__col-cell' }),
      h('col', { class: 'eval-matrix__col-cell' }),
      h('col', { class: 'eval-matrix__col-total' })),
    h('thead', {},
      h('tr', {},
        h('td', { class: 'eval-matrix__corner' }),
        headerCell('col', 'ACTUAL = POSITIVE', '实际为正'),
        headerCell('col', 'ACTUAL = NEGATIVE', '实际为负'),
        headerCell('col', 'Total', '合计', 'eval-matrix__head--total'))),
    h('tbody', {},
      h('tr', {},
        headerCell('row', 'PREDICTED = POSITIVE', '预测为正'),
        editableCell('tp'),
        editableCell('fp'),
        totalCell('predictedPositive')),
      h('tr', {},
        headerCell('row', 'PREDICTED = NEGATIVE', '预测为负'),
        editableCell('fn'),
        editableCell('tn'),
        totalCell('predictedNegative')),
      h('tr', { class: 'eval-matrix__totals-row' },
        headerCell('row', 'Total', '合计', 'eval-matrix__head--total'),
        totalCell('actualPositive'),
        totalCell('actualNegative'),
        totalCell('all'))));

  const element = h('div', { class: ['eval-matrix', compact ? 'eval-matrix--compact' : null] },
    h('div', { class: 'eval-matrix__scroll' }, table));

  renderTotals();

  return {
    element,

    getCounts() {
      return { ...current };
    },

    setCounts(next) {
      current = normalizeCounts(next);
      for (const key of CELL_KEYS) inputs[key].value = String(current[key]);
      renderTotals();
    },

    /**
     * Marks the cells a metric uses: { numerator: [...], denominator: [...] }, or null to clear.
     * 标出某个指标用到的格子：传入分子、分母格子列表；传 null 清除。
     */
    setHighlight(spec) {
      const numerator = spec?.numerator || [];
      const denominator = spec?.denominator || [];
      for (const key of CELL_KEYS) {
        cells[key].classList.toggle('is-numerator', numerator.includes(key));
        cells[key].classList.toggle('is-denominator', denominator.includes(key));
      }
      for (const [key, { cells: parts }] of Object.entries(TOTALS)) {
        totalCells[key].classList.toggle('is-denominator', Boolean(spec) && sameSet(parts, denominator));
      }
      element.classList.toggle('is-highlighting', Boolean(spec));
    },
  };
}
