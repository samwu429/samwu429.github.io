/**
 * Widget "two-way-table": the contingency table of STA220 Module 2 (M2 p.21-45, midterm 2025 Q1-Q6). It shows
 * the counts with their totals and the three kinds of percentages; selecting any number writes out its fraction
 * and names the denominator. The row and column views add the segmented bar chart of the conditional
 * distributions, the association note and the difference and ratio of two groups. Practice mode asks
 * test-style questions ("Among the cases with A, what is the proportion with B?").
 * 组件“two-way-table”：STA220 第 2 单元的列联表（第 21-45 页，2025 年期中第 1-6 题）。显示带合计的计数和三种百分比；
 * 选中任何一个数字都会写出它的分数并指出分母。行视图和列视图还有条件分布的分段条形图、关联说明和两组的差与比。
 * 练习模式出考试式的题目（“在 A 的个体中，B 的比例是多少？”）。
 *
 * Config (content-spec 5.4): { title, rowVariable, columnVariable, rows: [Bi], columns: [Bi], counts: [[n]],
 * decimals, start }. Every number and sentence comes from two-way-table-logic.js.
 * 配置见内容规范 5.4；所有数字和句子都来自 two-way-table-logic.js。
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { optionLetter } from '../../../core/util/format.js';
import { button } from '../../../components/controls/button.js';
import { segmented } from '../../../components/controls/segmented.js';
import {
  CHOICE_TIP, associationSummary, buildTable, cellDisplay, compareGroups, comparisonChoices, conditionalBars,
  defaultComparison, describeCell, generateQuestion, judgeAnswer, normalizeTwoWayTableConfig, plainLabel,
  revealAnswer, tableShape, viewGuide,
} from './two-way-table-logic.js';

let instanceCount = 0;

// Segments narrower than this share of their bar (in percent) carry no printed percentage.
// 比这更窄的段（占整根条的百分比）不印百分数。
const MIN_LABEL_WIDTH = 9;

const MODES = [
  { value: 'explore', zh: '探索', en: 'Explore', title: '看计数和百分比 See the counts and percentages' },
  { value: 'practice', zh: '练习', en: 'Practice', title: '考试式的选择题 Test-style questions' },
];

const VIEWS = [
  { value: 'counts', zh: '计数', en: 'Counts', title: '每个格子里的个数 Number of cases in each cell' },
  { value: 'total', zh: '总百分比', en: '% of Total', title: '格子 ÷ 总数 Cell ÷ grand total' },
  { value: 'row', zh: '行百分比', en: '% of Row', title: '格子 ÷ 行合计 Cell ÷ row total' },
  { value: 'column', zh: '列百分比', en: '% of Column', title: '格子 ÷ 列合计 Cell ÷ column total' },
];

const TOTAL_LABEL = { zh: '合计', en: 'Total' };

const INTRO = {
  zh: '点表格里的任何一个数字（合计也可以），下面会写出它是怎么算出来的、分母是哪一个合计。用表格上方的按钮在计数和三种百分比之间切换。',
  en: 'Select any number in the table, totals included, to see how it is computed and which total is the denominator. The buttons above the table switch between the counts and the three kinds of percentages.',
};

const EXAMPLE_NOTICE = {
  zh: '这个演示的配置里没有可用的计数，所以先显示 2025 年期中考试第 1-6 题的表格。',
  en: 'This demo has no usable counts in its configuration, so the table of the 2025 midterm (questions 1-6) is shown.',
};

const KEY_HINT = {
  zh: '键盘：用 Tab 进入表格，方向键在格子之间移动，Home / End 跳到这一行的开头或结尾。',
  en: 'Keyboard: Tab into the table and use the arrow keys; Home and End jump to the start or end of the row.',
};

const MARK_LEGEND = {
  zh: '底色 = 分子（或被加起来的数）；粗框 = 分母；浅色条带 = 正在读的那一行或那一列；虚线框 = 选错的选项用错的数。',
  en: 'Shaded = numerator (or the numbers added up); thick frame = denominator; tinted band = the row or column being read; dashed frame = the number a wrong option used.',
};

const COMPARE_TITLE = { zh: '比较两组：差与比', en: 'Compare two groups: difference and ratio' };
const COMPARE_INTRO = {
  zh: '选两组和一个类别，比较这个类别在两组中的条件比例（第 2 单元第 36-45 页）。',
  en: 'Choose two groups and one category to compare its conditional proportion in the two groups (M2 p.36-45).',
};

const PRACTICE_TITLE = { zh: '练习：这个比例是多少？', en: 'Practice: what is the proportion?' };
const PRACTICE_INTRO = {
  zh: '题目和选项都是英文，和考试一样。先自己算，再选；选错了会告诉你错在哪里，可以再选一次。',
  en: 'Questions and options are in English, as on the test. Work out the answer, then choose; a wrong choice names the mistake and you can try again.',
};
const NO_QUESTION = {
  zh: '这张表里的比例只有 0 和 1，出不了练习题。',
  en: 'Every proportion in this table is 0 or 1, so there is no practice question.',
};

const MARKS = {
  correct: { iconName: 'check', text: '正确答案 Correct answer' },
  wrong: { iconName: 'cross', text: '不正确 Incorrect' },
};

/* ---------- Small builders 小型构件 ---------- */

/** Short UI label: Chinese first, English after; `role` is the Chinese role class. 简短的界面文字：中文在前、英文在后。 */
function label(zh, en, role = 'label') {
  return [zhNode(zh, role), hasText(zh) && hasText(en) ? ' ' : null, enNode(en)];
}

function biLabel(value, role = 'label') {
  return value ? label(value.zh, value.en, role) : null;
}

/** Chinese teaching sentence with its English version below. 中文讲解句，下面是对应的英文句。 */
function pair(value, className, role = 'teach') {
  if (!value || (!hasText(value.zh) && !hasText(value.en))) return null;
  return h('div', { class: ['two-way-table__pair', className] },
    zhNode(value.zh, role, 'p', 'two-way-table__pair-zh'),
    enNode(value.en, 'p', 'two-way-table__pair-en'));
}

/**
 * A name from the content (a variable or a category): English first, as the test is in English, then the
 * Chinese gloss, which stays visible when there is no English.
 * 内容里的名称（变量或类别）：英文在前（考试用英文），后面是中文释义；没有英文时中文始终可见。
 */
function dataName(value, className) {
  if (!value) return null;
  return h('span', { class: ['two-way-table__name', className] },
    enNode(value.en, 'span', 'two-way-table__name-en'),
    zhNode(value.zh, hasText(value.en) ? 'gloss' : 'label', 'span', 'two-way-table__name-zh'));
}

/** A content name as plain text for select options: "First · 头等舱". 下拉选项用的纯文本名称。 */
function optionName(value) {
  return [value?.en, value?.zh].filter(hasText).map((text) => stripMarkup(text)).join(' · ');
}

function formula(text) {
  return h('p', { class: 'two-way-table__formula', lang: 'en' }, text);
}

function markContent(state) {
  const mark = MARKS[state];
  if (!mark) return [];
  return [icon(mark.iconName, { size: 18 }), h('span', { class: 'visually-hidden' }, mark.text)];
}

/**
 * Polite live region; toggling a trailing no-break space makes a repeated message speak again.
 * 礼貌型朗读区域；末尾交替加一个不换行空格，让重复的消息也会再读一次。
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

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./two-way-table.css', import.meta.url));
  instanceCount += 1;
  const uid = `two-way-table-${instanceCount}`;
  const model = normalizeTwoWayTableConfig(config);
  const table = buildTable(model);
  const lastRow = table.rowCount;
  const lastColumn = table.columnCount;
  const live = liveRegion();
  const removers = [];
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    removers.push(() => target.removeEventListener(type, handler));
  };

  const state = {
    mode: 'explore',
    view: model.start,
    selected: { row: 0, column: 0 },
    // One comparison per conditional view, kept while the learner switches views.
    // 每个条件视图各记一组比较选择，切换视图时保留。
    comparisons: { row: null, column: null },
    practice: { question: null, tried: new Set(), solved: false, revealed: false, lastPick: null, number: 0, firstTry: 0 },
  };
  const currentInfo = () => describeCell(model, table, state.view, state.selected.row, state.selected.column);

  /* ---------- Header and controls 标题与控件 ---------- */

  const titleId = `${uid}-title`;
  const header = h('header', { class: 'two-way-table__header' },
    h('p', { class: 'two-way-table__eyebrow' }, label('互动演示', 'Interactive')),
    h('h3', { class: 'two-way-table__title', id: titleId }, biTitle(model.title)),
    pair(INTRO, 'two-way-table__intro'),
    model.usedExample ? h('div', { class: 'callout callout--warn two-way-table__notice' }, pair(EXAMPLE_NOTICE)) : null);

  const modeControl = segmented({
    options: MODES.map((mode) => ({ value: mode.value, label: label(mode.zh, mode.en), title: mode.title })),
    value: state.mode,
    ariaLabel: '模式 Mode',
    className: 'two-way-table__modes',
    onChange: setMode,
  });

  const meta = h('div', { class: 'two-way-table__meta' },
    h('p', { class: 'two-way-table__variable-line' },
      h('span', { class: 'two-way-table__key' }, label('行变量', 'Row variable')), dataName(model.rowVariable)),
    h('p', { class: 'two-way-table__variable-line' },
      h('span', { class: 'two-way-table__key' }, label('列变量', 'Column variable')), dataName(model.columnVariable)),
    pair(tableShape(model), 'two-way-table__shape'));

  const viewControl = segmented({
    options: VIEWS.map((view) => ({ value: view.value, label: label(view.zh, view.en), title: view.title })),
    value: state.view,
    ariaLabel: '表格显示什么 What the table shows',
    className: 'two-way-table__views',
    onChange: setView,
  });
  const guide = h('div', { class: 'two-way-table__guide' });
  const choiceTip = h('div', { class: 'callout callout--tip two-way-table__tip' }, pair(CHOICE_TIP));
  const viewPanel = h('div', { class: 'two-way-table__view-panel' }, viewControl, guide, choiceTip);

  /* ---------- Table 表格 ---------- */

  // One button per number, totals included; the table keeps one Tab stop and the arrow keys move inside it.
  // 每个数字（包括合计）都是一个按钮；整张表只占一个 Tab 位置，用方向键在表内移动。
  const cells = Array.from({ length: lastRow + 1 }, (_, row) => Array.from({ length: lastColumn + 1 }, (_, column) => {
    const count = h('span', { class: 'two-way-table__count' });
    const share = h('span', { class: 'two-way-table__share' });
    const percent = h('span', { class: 'two-way-table__percent' });
    const cellButton = h('button', {
      type: 'button',
      class: 'two-way-table__cell',
      tabindex: '-1',
      dataset: { row: String(row), column: String(column) },
    }, count, share, percent);
    const slot = h('td', {
      class: ['two-way-table__slot', column === lastColumn ? 'is-row-total' : null, row === lastRow ? 'is-column-total' : null],
    }, cellButton);
    return { slot, button: cellButton, count, share, percent };
  }));

  const tableElement = h('table', { class: 'data-table two-way-table__table' },
    h('caption', { class: 'visually-hidden' },
      `${plainLabel(model.title)}. 行 Rows: ${plainLabel(model.rowVariable)}; 列 Columns: ${plainLabel(model.columnVariable)}`),
    h('colgroup', {}, h('col')),
    h('colgroup', { span: String(lastColumn) }),
    h('colgroup', {}, h('col')),
    h('thead', {},
      h('tr', {},
        h('td', { class: 'two-way-table__corner' }),
        h('th', { scope: 'colgroup', colspan: String(lastColumn), class: 'two-way-table__variable' }, dataName(model.columnVariable)),
        h('td', { class: 'two-way-table__corner is-row-total' })),
      h('tr', {},
        h('th', { scope: 'col', class: 'two-way-table__variable two-way-table__variable--row' }, dataName(model.rowVariable)),
        model.columns.map((name) => h('th', { scope: 'col', class: 'two-way-table__column-head' }, dataName(name))),
        h('th', { scope: 'col', class: 'two-way-table__column-head is-row-total' }, dataName(TOTAL_LABEL)))),
    h('tbody', {}, model.rows.map((name, row) => h('tr', {},
      h('th', { scope: 'row', class: 'two-way-table__row-head' }, dataName(name)),
      cells[row].map((cell) => cell.slot)))),
    h('tfoot', {}, h('tr', {},
      h('th', { scope: 'row', class: 'two-way-table__row-head is-column-total' }, dataName(TOTAL_LABEL)),
      cells[lastRow].map((cell) => cell.slot))));

  // Both are teaching sentences, not labels, so their Chinese is blurred in English practice mode like every hint.
  // 两者都是讲解句而不是标签，所以和其他提示一样，英文练习模式下中文会被模糊。
  const keyHint = h('p', { class: 'kbd-hint two-way-table__hint' }, biLabel(KEY_HINT, 'teach'));
  const markLegend = h('p', { class: 'two-way-table__mark-legend' }, biLabel(MARK_LEGEND, 'teach'));
  const detailTitleId = `${uid}-detail-title`;
  const detail = h('section', { class: 'two-way-table__detail', 'aria-labelledby': detailTitleId });
  const work = h('div', { class: 'two-way-table__work' },
    h('div', { class: 'two-way-table__table-area' },
      h('div', { class: 'table-scroll two-way-table__table-wrap' }, tableElement),
      keyHint,
      markLegend),
    detail);

  /* ---------- Chart, comparison and practice panels 图、比较与练习面板 ---------- */

  const chartTitleId = `${uid}-chart-title`;
  const chartPanel = h('section', { class: 'two-way-table__panel', 'aria-labelledby': chartTitleId, hidden: true });

  const compareTitleId = `${uid}-compare-title`;
  const compareFields = h('div', { class: 'two-way-table__compare-fields' });
  const compareResult = h('div', { class: 'two-way-table__compare-result' });
  const comparePanel = h('section', { class: 'two-way-table__panel', 'aria-labelledby': compareTitleId, hidden: true },
    h('h4', { class: 'two-way-table__subheading', id: compareTitleId }, biTitle(COMPARE_TITLE)),
    pair(COMPARE_INTRO, 'two-way-table__panel-intro'),
    compareFields,
    compareResult);
  let compareSelects = null;
  let selectCount = 0;

  const practiceTitleId = `${uid}-practice-title`;
  const questionId = `${uid}-question`;
  const progress = h('p', { class: 'two-way-table__progress' });
  const questionBox = h('div', { class: 'two-way-table__question', id: questionId });
  const optionsBox = h('div', { class: 'two-way-table__options', role: 'group', 'aria-labelledby': questionId });
  const feedback = h('div', { class: 'two-way-table__feedback', role: 'status', 'aria-live': 'polite' });
  const hintBox = h('div', { class: 'two-way-table__practice-hint' });
  const assistButton = button({
    label: '显示中文 Show Chinese', iconName: 'translate', variant: 'ghost', size: 'sm', pressed: false, onClick: toggleAssist,
  });
  const newButton = button({ label: '换一题 New question', iconName: 'shuffle', variant: 'primary', onClick: () => newQuestion(true) });
  const revealButton = button({ label: '看答案 Show answer', iconName: 'eye', onClick: reveal });
  const practicePanel = h('section', { class: 'two-way-table__panel two-way-table__practice', 'aria-labelledby': practiceTitleId, hidden: true },
    h('div', { class: 'two-way-table__practice-head' },
      h('h4', { class: 'two-way-table__subheading', id: practiceTitleId }, biTitle(PRACTICE_TITLE)),
      assistButton),
    pair(PRACTICE_INTRO, 'two-way-table__panel-intro'),
    progress,
    questionBox,
    optionsBox,
    feedback,
    hintBox,
    h('div', { class: 'two-way-table__actions' }, newButton, revealButton));
  let optionButtons = [];

  const root = h('section', { class: 'two-way-table', 'aria-labelledby': titleId },
    header,
    h('div', { class: 'two-way-table__toolbar' }, modeControl),
    meta,
    viewPanel,
    work,
    chartPanel,
    comparePanel,
    practicePanel,
    live.element);

  /* ---------- Table rendering 表格绘制 ---------- */

  const keyOf = (address) => `${address.row}:${address.column}`;

  // Practice marks the worked fraction once the question is answered, or the cells a wrong pick used wrongly.
  // 练习时，答对或看答案后标出正确的分数；选错时标出这个选项用错的格子。
  function practiceMarks() {
    const { question, solved, revealed, lastPick } = state.practice;
    const none = { numerator: [], denominator: [], wrong: [], band: null };
    if (!question) return none;
    if (solved || revealed) {
      const answer = question.options[question.answer];
      return { ...none, numerator: answer.numeratorCells, denominator: [answer.denominatorCell] };
    }
    const picked = lastPick === null ? null : question.options[lastPick];
    return picked && !picked.correct ? { ...none, wrong: picked.wrongCells } : none;
  }

  // Variable names are part of a cell's name, since two variables often share labels such as Yes and No.
  // 格子的无障碍名称里带上变量名，因为两个变量常常用同样的类别名（例如 Yes 和 No）。
  function cellLabel(row, column, display) {
    const rowPart = row < lastRow ? `${plainLabel(model.rowVariable)} = ${plainLabel(model.rows[row])}` : plainLabel(TOTAL_LABEL);
    const columnPart = column < lastColumn
      ? `${plainLabel(model.columnVariable)} = ${plainLabel(model.columns[column])}`
      : plainLabel(TOTAL_LABEL);
    const where = `${rowPart}, ${columnPart}`;
    if (!display.share) return `${where}: ${display.countText}`;
    const value = display.share.defined ? `${display.share.proportion} = ${display.share.percent}` : '无法计算 undefined';
    return `${where}: ${value}; 计数 count ${display.countText}`;
  }

  function renderTable(info) {
    const explore = state.mode === 'explore';
    const view = explore ? state.view : 'counts';
    const marks = explore ? { ...info.highlight, wrong: [] } : practiceMarks();
    const numerator = new Set(marks.numerator.map(keyOf));
    const denominator = new Set(marks.denominator.map(keyOf));
    const wrong = new Set(marks.wrong.map(keyOf));
    tableElement.dataset.view = view;
    for (let row = 0; row <= lastRow; row += 1) {
      for (let column = 0; column <= lastColumn; column += 1) {
        const cell = cells[row][column];
        const display = cellDisplay(model, table, view, row, column);
        const key = `${row}:${column}`;
        const selected = explore && row === state.selected.row && column === state.selected.column;
        const inBand = Boolean(marks.band) && (marks.band.axis === 'row' ? marks.band.index === row : marks.band.index === column);
        cell.count.textContent = display.countText;
        cell.share.hidden = !display.share;
        cell.percent.hidden = !display.share?.defined;
        cell.share.textContent = display.share ? display.share.proportion : '';
        cell.percent.textContent = display.share?.defined ? display.share.percent : '';
        cell.slot.classList.toggle('is-band', inBand);
        cell.slot.classList.toggle('is-numerator', numerator.has(key));
        cell.slot.classList.toggle('is-denominator', denominator.has(key));
        cell.slot.classList.toggle('is-wrong', wrong.has(key));
        cell.button.disabled = !explore;
        cell.button.tabIndex = selected ? 0 : -1;
        cell.button.setAttribute('aria-pressed', String(selected));
        cell.button.setAttribute('aria-label', cellLabel(row, column, display));
      }
    }
  }

  /* ---------- Explanation 说明 ---------- */

  function renderGuide() {
    replaceContent(guide, pair(viewGuide(model, state.view)));
    choiceTip.hidden = state.view !== 'row' && state.view !== 'column';
  }

  function renderDetail(info) {
    replaceContent(detail,
      h('p', { class: 'two-way-table__detail-eyebrow' }, label('选中的数字', 'Selected number')),
      h('h4', { class: 'two-way-table__detail-title', id: detailTitleId }, biTitle(info.heading)),
      h('p', { class: 'two-way-table__term' }, biLabel(info.term, 'teach')),
      pair(info.summary),
      h('div', { class: 'two-way-table__lines' }, info.lines.map((line) => h('div', { class: 'two-way-table__line' },
        line.label ? h('p', { class: 'two-way-table__line-label' }, biLabel(line.label, 'teach')) : null,
        formula(line.formula),
        pair(line.sentence)))),
      info.note ? h('div', { class: 'two-way-table__note' }, pair(info.note)) : null);
  }

  /* ---------- Segmented bar chart 分段条形图 ---------- */

  function renderChart() {
    const data = state.mode === 'explore' ? conditionalBars(model, table, state.view) : null;
    chartPanel.hidden = !data;
    if (!data) return;
    const summary = associationSummary(model, table, state.view);
    replaceContent(chartPanel,
      h('h4', { class: 'two-way-table__subheading', id: chartTitleId }, biTitle(data.title)),
      // The bars are drawn with HTML so long bilingual labels can wrap; the aria-label lists every percentage.
      // 条形用 HTML 画，较长的双语标签可以换行；aria-label 列出全部百分数。
      h('div', { class: 'two-way-table__chart', role: 'img', 'aria-label': data.description },
        data.bars.map((bar) => h('div', { class: ['two-way-table__bar-row', bar.marginal ? 'is-marginal' : null] },
          h('div', { class: 'two-way-table__bar-label' },
            dataName(bar.label),
            h('span', { class: 'two-way-table__bar-n' }, `n = ${bar.totalText}`)),
          h('div', { class: 'two-way-table__bar' }, bar.empty
            ? h('span', { class: 'two-way-table__bar-empty' }, label('没有个体', 'No cases'))
            : bar.segments.map((segment) => h('span', {
              class: ['two-way-table__segment', `two-way-table__segment--${segment.index}`],
              style: { width: `${segment.width}%` },
            }, segment.width >= MIN_LABEL_WIDTH ? segment.label : null)))))),
      h('div', { class: 'two-way-table__legend' },
        h('p', { class: 'two-way-table__legend-title' }, label('图例', 'Legend'), ': ', dataName(data.categoryVariable)),
        h('ul', { class: 'two-way-table__legend-list' }, data.categories.map((category, index) => h('li', { class: 'two-way-table__legend-item' },
          h('span', { class: ['two-way-table__swatch', `two-way-table__segment--${index}`], 'aria-hidden': 'true' }),
          dataName(category))))),
      summary ? h('div', { class: 'two-way-table__association' },
        h('p', { class: 'two-way-table__association-title' }, label('有没有关联？', 'Is there an association?')),
        pair(summary.sentence),
        pair(summary.rule, 'two-way-table__rule')) : null);
  }

  /* ---------- Difference and ratio 差与比 ---------- */

  function selectField(text, items, value, onChange) {
    selectCount += 1;
    const id = `${uid}-select-${selectCount}`;
    const select = h('select', { id, class: 'select two-way-table__select', onchange: () => onChange(Number(select.value)) },
      items.map((item) => h('option', { value: String(item.index), selected: item.index === value }, optionName(item.label))));
    return {
      select,
      field: h('div', { class: 'field two-way-table__field' }, h('label', { class: 'field__label', for: id }, biLabel(text)), select),
    };
  }

  // The selects are rebuilt only when the view changes, so a choice or Swap never moves the focus.
  // 只有切换视图时才重建下拉框，所以选择或交换都不会移走焦点。
  function renderCompare() {
    const choices = state.mode === 'explore' ? comparisonChoices(model, table, state.view) : null;
    const usable = Boolean(choices) && choices.groups.length >= 2;
    comparePanel.hidden = !usable;
    if (!usable) return;
    if (!state.comparisons[state.view]) state.comparisons[state.view] = defaultComparison(choices);
    const selection = state.comparisons[state.view];
    const update = (key) => (value) => {
      state.comparisons[state.view] = { ...state.comparisons[state.view], [key]: value };
      renderCompareResult(true);
    };
    const first = selectField({ zh: '第一组（p₁）', en: 'Group 1 (p₁)' }, choices.groups, selection.first, update('first'));
    const second = selectField({ zh: '第二组（p₂）', en: 'Group 2 (p₂)' }, choices.groups, selection.second, update('second'));
    const category = selectField({ zh: '比较哪个类别', en: 'Category' }, choices.categories, selection.category, update('category'));
    compareSelects = { first: first.select, second: second.select };
    replaceContent(compareFields, first.field, second.field, category.field,
      h('div', { class: 'two-way-table__swap' }, button({ label: '交换 Swap', variant: 'secondary', size: 'sm', onClick: swapGroups })));
    renderCompareResult(false);
  }

  function swapGroups() {
    const current = state.comparisons[state.view];
    if (!current || !compareSelects) return;
    state.comparisons[state.view] = { ...current, first: current.second, second: current.first };
    compareSelects.first.value = String(current.second);
    compareSelects.second.value = String(current.first);
    renderCompareResult(true);
  }

  function resultBlock(...children) {
    return h('div', { class: 'two-way-table__result-block' }, children);
  }

  function renderCompareResult(announce) {
    const result = compareGroups(model, table, state.view, state.comparisons[state.view]);
    if (!result) {
      replaceContent(compareResult);
      return;
    }
    if (result.sameGroup) {
      replaceContent(compareResult, h('div', { class: 'callout callout--warn two-way-table__note' }, pair(result.message)));
      if (announce) live.announce(`${result.message.zh} ${result.message.en}`);
      return;
    }
    replaceContent(compareResult,
      resultBlock(
        h('p', { class: 'two-way-table__line-label' }, biLabel(result.p1.label, 'teach')),
        formula(result.p1.formula),
        h('p', { class: 'two-way-table__line-label' }, biLabel(result.p2.label, 'teach')),
        formula(result.p2.formula)),
      resultBlock(
        h('p', { class: 'two-way-table__result-title' }, biLabel(result.differenceTerm, 'teach')),
        formula(result.difference.formula),
        pair(result.difference.sentence)),
      resultBlock(
        h('p', { class: 'two-way-table__result-title' }, biLabel(result.ratioTerm, 'teach')),
        formula(result.ratio.formula),
        pair(result.ratio.sentence),
        result.ratio.tip ? h('div', { class: 'callout callout--tip two-way-table__note' }, pair(result.ratio.tip)) : null,
        result.ratio.roundingNote ? h('div', { class: 'callout callout--warn two-way-table__note' }, pair(result.ratio.roundingNote)) : null));
    if (announce) live.announce(result.announce);
  }

  /* ---------- Practice 练习 ---------- */

  function renderProgress() {
    const { number, firstTry } = state.practice;
    replaceContent(progress, number
      ? [label(`第 ${number} 题`, `Question ${number}`), ' · ', label(`一次答对 ${firstTry} 题`, `right on the first try: ${firstTry}`)]
      : null);
  }

  function renderQuestion() {
    const { question } = state.practice;
    replaceContent(feedback);
    replaceContent(hintBox);
    renderProgress();
    revealButton.disabled = !question;
    if (!question) {
      optionButtons = [];
      replaceContent(questionBox, pair(NO_QUESTION));
      replaceContent(optionsBox);
      return;
    }
    replaceContent(questionBox,
      h('p', { class: 'two-way-table__question-en' }, enNode(question.prompt.en)),
      zhNode(question.prompt.zh, 'assist', 'p', 'two-way-table__question-zh'));
    optionButtons = question.options.map((option, index) => h('button', {
      type: 'button',
      class: 'two-way-table__option',
      onclick: () => choose(index),
    },
    h('span', { class: 'two-way-table__letter' }, optionLetter(index)),
    h('span', { class: 'two-way-table__option-text', lang: 'en' }, option.text),
    h('span', { class: 'two-way-table__mark' })));
    replaceContent(optionsBox, optionButtons);
  }

  // aria-disabled (not disabled) keeps a judged option focusable, so its result can still be read.
  // 用 aria-disabled 而不是 disabled：判过的选项仍可聚焦，读屏用户可以回看结果。
  function syncOptions() {
    const { question, tried, solved, revealed } = state.practice;
    optionButtons.forEach((optionButton, index) => {
      const option = question.options[index];
      const markState = option.correct && (solved || revealed) ? 'correct' : (!option.correct && tried.has(index) ? 'wrong' : null);
      if (markState) optionButton.dataset.state = markState;
      else delete optionButton.dataset.state;
      if (solved || revealed || markState) optionButton.setAttribute('aria-disabled', 'true');
      else optionButton.removeAttribute('aria-disabled');
      replaceContent(optionButton.querySelector('.two-way-table__mark'), markContent(markState));
    });
  }

  function newQuestion(announce) {
    const previous = state.practice.question;
    const question = generateQuestion(model, table, Math.random, { avoid: previous ? previous.key : null });
    state.practice = {
      ...state.practice,
      question,
      tried: new Set(),
      solved: false,
      revealed: false,
      lastPick: null,
      number: state.practice.number + (question ? 1 : 0),
    };
    renderQuestion();
    if (state.mode === 'practice') renderTable(null);
    if (announce && question) live.announce(`第 ${state.practice.number} 题 Question ${state.practice.number}: ${question.prompt.en}`);
  }

  function choose(index) {
    const practice = state.practice;
    const { question } = practice;
    if (!question || practice.solved || practice.revealed || practice.tried.has(index)) return;
    const result = judgeAnswer(question, index);
    if (!result) return;
    practice.tried.add(index);
    practice.lastPick = index;
    if (result.correct) {
      practice.solved = true;
      if (practice.tried.size === 1) practice.firstTry += 1;
    }
    syncOptions();
    replaceContent(feedback, h('div', { class: ['two-way-table__verdict', result.correct ? 'is-correct' : 'is-wrong'] },
      icon(result.correct ? 'check' : 'cross', { size: 18 }),
      pair(result.feedback)));
    replaceContent(hintBox, result.correct ? null : h('div', { class: 'callout callout--tip two-way-table__note' }, pair(question.hint)));
    renderProgress();
    renderTable(null);
  }

  function reveal() {
    const practice = state.practice;
    if (!practice.question || practice.solved || practice.revealed) return;
    practice.revealed = true;
    syncOptions();
    replaceContent(feedback, h('div', { class: 'two-way-table__verdict is-revealed' },
      icon('eye', { size: 18 }),
      pair(revealAnswer(practice.question))));
    replaceContent(hintBox);
    renderTable(null);
  }

  function toggleAssist() {
    const on = !practicePanel.classList.contains('show-assist');
    practicePanel.classList.toggle('show-assist', on);
    assistButton.setAttribute('aria-pressed', String(on));
  }

  /* ---------- State changes 状态变化 ---------- */

  function renderAll() {
    const explore = state.mode === 'explore';
    const info = explore ? currentInfo() : null;
    viewPanel.hidden = !explore;
    detail.hidden = !explore;
    keyHint.hidden = !explore;
    practicePanel.hidden = explore;
    work.classList.toggle('is-single', !explore);
    renderTable(info);
    if (explore) {
      renderGuide();
      renderDetail(info);
    }
    renderChart();
    renderCompare();
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    if (mode === 'practice' && !state.practice.question) newQuestion(false);
    renderAll();
    live.announce(mode === 'practice' ? '练习模式 Practice mode' : '探索模式 Explore mode');
  }

  function setView(view) {
    if (view === state.view) return;
    state.view = view;
    renderAll();
    const option = VIEWS.find((item) => item.value === view);
    live.announce(`${option.zh} ${option.en}: ${option.title}`);
  }

  function select(row, column, focus) {
    state.selected = { row, column };
    const info = currentInfo();
    renderTable(info);
    renderDetail(info);
    if (focus) cells[row][column].button.focus();
    live.announce(info.announce);
  }

  const cellOf = (event) => (event.target instanceof Element ? event.target.closest('.two-way-table__cell') : null);

  listen(tableElement, 'click', (event) => {
    const target = cellOf(event);
    if (!target || state.mode !== 'explore') return;
    select(Number(target.dataset.row), Number(target.dataset.column), false);
  });

  // Arrow keys move like a grid and stop at the edges; Ctrl+Home and Ctrl+End jump to the corners.
  // 方向键按网格移动，到边缘就停；Ctrl+Home 与 Ctrl+End 跳到表格的两个角。
  listen(tableElement, 'keydown', (event) => {
    const target = cellOf(event);
    if (!target || state.mode !== 'explore') return;
    const row = Number(target.dataset.row);
    const column = Number(target.dataset.column);
    const moves = {
      ArrowRight: [row, Math.min(lastColumn, column + 1)],
      ArrowLeft: [row, Math.max(0, column - 1)],
      ArrowDown: [Math.min(lastRow, row + 1), column],
      ArrowUp: [Math.max(0, row - 1), column],
      Home: event.ctrlKey ? [0, 0] : [row, 0],
      End: event.ctrlKey ? [lastRow, lastColumn] : [row, lastColumn],
    };
    if (!Object.hasOwn(moves, event.key)) return;
    event.preventDefault();
    const [nextRow, nextColumn] = moves[event.key];
    select(nextRow, nextColumn, true);
  });

  // The first practice question is drawn when the learner opens practice mode.
  // 第一道练习题在学习者打开练习模式时才抽取。
  renderAll();
  replaceContent(container, root);

  return () => {
    removers.splice(0).forEach((remove) => remove());
  };
}
