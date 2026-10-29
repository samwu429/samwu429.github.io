/**
 * Widget "fairness-groups": one editable confusion matrix per group, the per-group rates behind
 * demographic parity, predictive parity and equalized odds (lec06 p.40-42), and a verdict for each
 * criterion within an adjustable tolerance. Individual fairness (p.43) is explained, not judged.
 * 组件“fairness-groups”：每个群体一张可编辑的四格表，计算人口统计均等、预测均等、均等几率所需的各组比例
 * （lec06 第 40-42 页），并在可调容差内判断每条标准是否成立。个体公平（第 43 页）只解释、不判断。
 *
 * Config: { groups: [{ name: {zh, en}, tp, fp, fn, tn }], tolerance?: number (percentage points, default 5) }
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biStack, biTitle } from '../../../core/text/bilingual.js';
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { button } from '../../../components/controls/button.js';
import { emptyState } from '../../../components/feedback/states.js';
import { letterFor } from '../shared/config-utils.js';
import { liveRegion, outsideNote, statusBadge, statusText, subheading, teachPair, uniqueId, widgetFrame } from '../shared/eval-ui.js';
import { createMatrixEditor } from '../shared/matrix-editor.js';
import { formatPercent, formatPoints, MINUS } from '../shared/metric-format.js';
import {
  evaluateFairness,
  normalizeGroups,
  normalizeTolerance,
  tradeoffCase,
  TOLERANCE_MAX,
  TOLERANCE_MIN,
  TOLERANCE_STEP,
} from './fairness-logic.js';

// Lab model cards print every rate with one decimal (80.0%), so this widget does too.
// 实验课的模型卡片统一保留一位小数（80.0%），本组件保持一致。
const PERCENT = { digits: 1, trim: false };

const RATES = [
  { id: 'selectionRate', title: { zh: '选中率', en: 'Selection rate' }, formula: '(TP + FP) / N', criterion: 'demographic-parity' },
  { id: 'precision', title: { zh: '精确率', en: 'Precision' }, formula: 'TP / (TP + FP)', criterion: 'predictive-parity' },
  { id: 'truePositiveRate', title: { zh: '真阳性率', en: 'True positive rate (TPR)' }, formula: 'TP / (TP + FN)', criterion: 'equalized-odds' },
  { id: 'falsePositiveRate', title: { zh: '假阳性率', en: 'False positive rate (FPR)' }, formula: 'FP / (FP + TN)', criterion: 'equalized-odds' },
];

const RATE_BY_ID = Object.fromEntries(RATES.map((rate) => [rate.id, rate]));

const CRITERIA_INFO = {
  'demographic-parity': {
    title: { zh: '人口统计均等', en: 'Demographic parity' },
    definition: {
      en: 'Outcomes are predicted at the same rates for every group.',
      zh: '每个群体被预测为正（被选中）的比例都一样。',
    },
  },
  'predictive-parity': {
    title: { zh: '预测均等', en: 'Predictive parity' },
    definition: {
      en: 'Outcomes have the same predictive meaning (TP/(TP+FP)) for every group.',
      zh: '“预测为正”在每个群体里同样可靠：精确率 TP / (TP + FP) 一样。',
    },
  },
  'equalized-odds': {
    title: { zh: '均等几率', en: 'Equalized odds' },
    definition: {
      en: 'True positive rate (TP/(TP+FN)) and false positive rate (FP/(FP+TN)) are the same for every group.',
      zh: '每个群体的真阳性率和假阳性率都一样，两个都要满足。',
    },
  },
};

const RATE_NOTE = {
  zh: 'N = TP + FP + FN + TN，即这一组的总人数。选中率对应人口统计均等，精确率对应预测均等，真阳性率和假阳性率一起对应均等几率。',
  en: 'N is the group size. Selection rate: demographic parity. Precision: predictive parity. TPR and FPR together: equalized odds.',
};

function plainName(value) {
  const zh = stripMarkup(value.zh || '');
  const en = stripMarkup(value.en || '');
  return zh && en && zh !== en ? `${zh} ${en}` : (zh || en);
}

function percentText(part) {
  return part.value === null ? '无法计算' : formatPercent(part.value, PERCENT);
}

function toleranceText(tolerance) {
  return `±${tolerance.toFixed(1)} pp`;
}

/**
 * Outside-the-slides explanation matched to the current numbers (see tradeoffCase).
 * 与当前数字匹配的课件外补充解释（见 tradeoffCase）。
 */
function tradeoffNote(kind, baseRates) {
  const shares = `各组“实际为正的比例”(TP + FN) / N（现在：${baseRates}）`;
  switch (kind) {
    case 'same-base':
      return {
        zh: `${shares}相同，这时几种群体标准有可能同时成立；一旦这个比例不同，它们通常就会互相冲突。试试把某一组的 FN 改大。`,
        en: 'With the same share of actual positives the criteria can hold together; when the shares differ, they usually conflict.',
      };
    case 'random':
      return {
        zh: `${shares}不一样，但这个模型在每组里 TPR 都等于 FPR：选谁和这个人是不是真的为正无关，像随机抽签。这时选中率就等于 TPR，所以人口统计均等和均等几率可以同时成立，但模型并没有真正分辨出谁是正例。`,
        en: 'Here TPR equals FPR in every group: the model picks people regardless of who is actually positive, like a random draw. Then both criteria can hold, but the model does not really tell positives apart.',
      };
    case 'conflict':
      return {
        zh: `${shares}不一样时，如果 TPR 和 FPR 在各组都一样（均等几率成立），选中率一般就会不一样（人口统计均等不成立）。`,
        en: 'When groups have different shares of actual positives, equal TPR and FPR usually mean different selection rates.',
      };
    default:
      return null;
  }
}

function verdictText(result, tolerance) {
  const info = CRITERIA_INFO[result.id];
  const limit = toleranceText(tolerance);
  switch (result.status) {
    case 'pass':
      return { zh: `所有差距都在 ${limit} 以内，所以${info.title.zh}成立。`, en: `Every gap is within ${limit}, so ${info.title.en.toLowerCase()} holds.` };
    case 'fail':
      return { zh: `有差距超出 ${limit}，所以${info.title.zh}不成立。`, en: `A gap is larger than ${limit}, so ${info.title.en.toLowerCase()} does not hold.` };
    case 'insufficient':
      return { zh: '至少要有两个群体才能比较。', en: 'At least two groups are needed for a comparison.' };
    default:
      return { zh: '有一组的这个比例分母为 0（比如没有人被预测为正），算不出来，所以无法判断。', en: "One group's rate divides by 0, so this cannot be judged." };
  }
}

export async function mount(container, config, context) {
  await Promise.all([
    ensureStylesheet(new URL('../shared/eval-ui.css', import.meta.url)),
    ensureStylesheet(new URL('../shared/matrix-editor.css', import.meta.url)),
    ensureStylesheet(new URL('./fairness-groups.css', import.meta.url)),
  ]);

  const groups = normalizeGroups(config);
  const initialTolerance = normalizeTolerance(config?.tolerance);
  let tolerance = initialTolerance;
  let counts = groups.map((group) => ({ ...group.counts }));
  const live = liveRegion();

  const frame = widgetFrame({
    className: 'fairness-groups',
    title: { zh: '分组检查公平性', en: 'Fairness across groups' },
    intro: {
      zh: '每个群体一张四格表。改动数字或拖动容差，看看三种群体公平标准哪些成立。',
      en: 'One confusion matrix per group. Edit the counts or the tolerance and see which criteria hold.',
    },
  });

  if (!groups.length) {
    replaceContent(frame.body, emptyState({
      title: '没有群体数据 No group data',
      body: '这个演示需要至少一个群体的 TP、FP、FN、TN。This demo needs the counts of at least one group.',
    }));
    replaceContent(container, frame.root);
    return;
  }

  /* ---------- Group cards 各群体卡片 ---------- */

  function groupCard(group, index) {
    const letter = letterFor(index);
    const titleId = uniqueId('fairness-groups-group');
    const rateViews = {};
    const editor = createMatrixEditor({
      counts: group.counts,
      compact: true,
      caption: h('span', { class: 'visually-hidden' }, `${letter} ${plainName(group.name)}：`),
      onChange: (next) => {
        counts[index] = next;
        refresh();
      },
      onCommit: () => live.announce(verdictSummary()),
    });
    const rates = h('dl', { class: 'fairness-groups__rates' }, RATES.map((rate) => {
      const value = h('span', { class: 'fairness-groups__rate-value' });
      const fraction = h('span', { class: 'fairness-groups__rate-fraction', lang: 'en' });
      rateViews[rate.id] = { value, fraction };
      return h('div', { class: 'fairness-groups__rate', dataset: { criterion: rate.criterion } },
        h('dt', { class: 'fairness-groups__rate-name' },
          biTitle(rate.title),
          h('span', { class: 'fairness-groups__rate-formula', lang: 'en' }, rate.formula)),
        h('dd', { class: 'fairness-groups__rate-result' }, value, fraction));
    }));
    const extra = h('p', { class: 'fairness-groups__extra' });
    const card = h('article', { class: 'fairness-groups__group', 'aria-labelledby': titleId },
      h('h4', { class: 'fairness-groups__group-title', id: titleId },
        h('span', { class: 'fairness-groups__letter' }, letter),
        biTitle(group.name)),
      editor.element,
      rates,
      extra);
    return { card, editor, rateViews, extra };
  }

  const groupViews = groups.map(groupCard);

  function renderGroup(view, metrics) {
    for (const rate of RATES) {
      const part = metrics[rate.id];
      view.rateViews[rate.id].value.textContent = percentText(part);
      view.rateViews[rate.id].value.classList.toggle('is-undefined', part.value === null);
      view.rateViews[rate.id].fraction.textContent = `${part.numerator} / ${part.denominator}`;
    }
    replaceContent(view.extra,
      h('span', {}, `N = ${metrics.total}`),
      h('span', {}, `准确率 Accuracy ${percentText(metrics.accuracy)}`),
      h('span', {}, `实际为正 Actual positives ${percentText(metrics.actualPositiveRate)}`));
  }

  /* ---------- Tolerance 容差 ---------- */

  const sliderId = uniqueId('fairness-groups-tolerance');
  const toleranceOutput = h('output', { class: 'fairness-groups__tolerance-value', for: sliderId });
  const slider = h('input', {
    id: sliderId,
    class: 'fairness-groups__slider',
    type: 'range',
    min: TOLERANCE_MIN,
    max: TOLERANCE_MAX,
    step: TOLERANCE_STEP,
    value: String(tolerance),
    oninput: () => {
      tolerance = normalizeTolerance(slider.value);
      refresh();
    },
    onchange: () => live.announce(verdictSummary()),
  });

  const toleranceControl = h('div', { class: 'fairness-groups__tolerance' },
    h('div', { class: 'fairness-groups__tolerance-head' },
      h('label', { class: 'fairness-groups__tolerance-label', for: sliderId },
        h('span', { lang: 'zh-CN' }, '容差'),
        h('span', { lang: 'en' }, 'Tolerance')),
      toleranceOutput),
    slider,
    teachPair({
      zh: '各组的比例相差不超过这么多个百分点（pp），就当作“一样”。真实数据几乎不会完全相等。',
      en: 'Rates within this many percentage points (pp) count as equal; real data is almost never exactly equal.',
    }, { className: 'fairness-groups__tolerance-help' }));

  /* ---------- Criteria 公平标准 ---------- */

  function criterionCard(id) {
    const info = CRITERIA_INFO[id];
    const titleId = uniqueId('fairness-groups-criterion');
    const badgeHost = h('div', { class: 'fairness-groups__badge' });
    const comparisons = h('div', { class: 'fairness-groups__comparisons' });
    const verdict = h('div', { class: 'fairness-groups__verdict' });
    const card = h('article', { class: 'fairness-groups__criterion', 'aria-labelledby': titleId },
      h('div', { class: 'fairness-groups__criterion-head' },
        h('h5', { class: 'fairness-groups__criterion-title', id: titleId }, biTitle(info.title)),
        badgeHost),
      biStack(info.definition, { role: 'gloss', className: 'fairness-groups__definition' }),
      comparisons,
      verdict);
    return { id, card, badgeHost, comparisons, verdict };
  }

  const criterionViews = Object.keys(CRITERIA_INFO).map(criterionCard);

  const individualTitleId = uniqueId('fairness-groups-criterion');
  const individualCard = h('article', { class: ['fairness-groups__criterion', 'fairness-groups__criterion--individual'], 'aria-labelledby': individualTitleId },
    h('div', { class: 'fairness-groups__criterion-head' },
      h('h5', { class: 'fairness-groups__criterion-title', id: individualTitleId }, biTitle({ zh: '个体公平', en: 'Individual fairness' })),
      statusBadge('info')),
    biStack({
      en: 'Similar individuals across different groups receive similar outcomes.',
      zh: '相似的个人，不管属于哪个群体，都得到相似的结果。',
    }, { role: 'gloss', className: 'fairness-groups__definition' }),
    teachPair({
      zh: '四格表只数“每个格子里有多少人”，看不出两个相似的人有没有得到同样的决定，所以这里只解释、不判断：要看模型是怎样对待每一个人的。',
      en: 'The tables only count people per cell, so they cannot show whether two similar people got the same decision.',
    }, { className: 'fairness-groups__verdict' }));

  function comparisonRow(part, metricsList) {
    const rate = RATE_BY_ID[part.metric];
    const chips = metricsList.map((metrics, index) => h('li', {
      class: [
        'fairness-groups__chip',
        part.defined && index === part.highIndex ? 'is-high' : null,
        part.defined && index === part.lowIndex ? 'is-low' : null,
      ],
    },
    h('span', { class: 'fairness-groups__chip-letter' }, letterFor(index)),
    h('span', { class: 'fairness-groups__chip-value' }, percentText(metrics[part.metric]))));

    let gap;
    if (!part.defined) {
      gap = h('p', { class: 'fairness-groups__gap' }, '无法比较 Cannot compare');
    } else {
      const label = part.gap !== null
        ? `差距 Gap: A ${MINUS} B = ${formatPoints(part.gap)}`
        : `最大差距 Largest gap: ${letterFor(part.highIndex)} ${MINUS} ${letterFor(part.lowIndex)} = ${formatPoints(part.spread, { signed: false })}`;
      const limit = toleranceText(tolerance);
      gap = h('p', { class: 'fairness-groups__gap' },
        h('span', { class: 'fairness-groups__gap-value' }, label),
        h('span', { class: 'fairness-groups__gap-limit' }, part.within ? `在 ${limit} 以内 within` : `超出 ${limit} beyond`));
    }

    return h('div', {
      class: ['fairness-groups__comparison', part.defined ? (part.within ? 'is-within' : 'is-outside') : 'is-undefined'],
    },
    h('p', { class: 'fairness-groups__comparison-name' },
      biTitle(rate.title),
      h('span', { class: 'fairness-groups__rate-formula', lang: 'en' }, rate.formula)),
    h('ul', { class: 'fairness-groups__chips' }, chips),
    gap);
  }

  /* ---------- Trade-off 取舍 ---------- */

  const tradeoffTitleId = uniqueId('fairness-groups-tradeoff');
  const tradeoffSummary = h('p', { class: 'fairness-groups__summary' });
  const baseRateNote = h('div', { class: 'fairness-groups__base-rates' });
  const tradeoff = h('section', { class: 'fairness-groups__tradeoff', 'aria-labelledby': tradeoffTitleId },
    subheading({ zh: '为什么很难全都满足', en: 'Why they rarely all hold' }, { id: tradeoffTitleId }),
    tradeoffSummary,
    h('blockquote', { class: 'eval-quote' },
      biStack({
        en: 'Although we might like to optimize for all forms of fairness, they are often at odds with each other. (This was the case for the COMPAS example.) They also typically come at some cost to overall accuracy.',
        zh: '我们希望各种公平都满足，但它们经常互相冲突（COMPAS 就是这样），而且通常要付出一些总体准确率的代价。',
      }, { role: 'gloss' }),
      h('span', { class: 'eval-quote__source' }, 'Lecture 6, p.44')),
    teachPair({
      zh: '没有唯一正确的答案：由模型设计者根据利益相关者（**stakeholders**）的需要，决定优先哪一种公平、愿意付出什么代价。',
      en: 'There is no single right answer to fairness: designers choose what to prioritize for the stakeholders.',
    }),
    baseRateNote);

  /* ---------- Recompute 重新计算 ---------- */

  let latest = null;

  function verdictSummary() {
    if (!latest) return '';
    const parts = latest.criteria.map((result) => `${CRITERIA_INFO[result.id].title.zh} ${statusText(result.status)}`);
    return `容差 Tolerance ${toleranceText(tolerance)}：${parts.join('，')}`;
  }

  function refresh() {
    latest = evaluateFairness(counts, tolerance);
    toleranceOutput.textContent = toleranceText(tolerance);
    slider.setAttribute('aria-valuetext', `±${tolerance.toFixed(1)} 个百分点 percentage points`);
    groupViews.forEach((view, index) => renderGroup(view, latest.metrics[index]));

    for (const view of criterionViews) {
      const result = latest.criteria.find((entry) => entry.id === view.id);
      view.card.dataset.status = result.status;
      replaceContent(view.badgeHost, statusBadge(result.status));
      replaceContent(view.comparisons, result.parts.map((part) => comparisonRow(part, latest.metrics)));
      replaceContent(view.verdict, teachPair(verdictText(result, tolerance)));
    }

    const passing = latest.criteria.filter((result) => result.status === 'pass').length;
    const accuracyText = `总体准确率 Overall accuracy ${percentText(latest.overallAccuracy)}`;
    replaceContent(tradeoffSummary, groups.length >= 2
      ? [
        h('span', { class: 'fairness-groups__summary-count' }, `${passing} / ${latest.criteria.length}`),
        h('span', {}, ` 条群体公平标准现在成立 group criteria hold now · ${accuracyText}`),
      ]
      : h('span', {}, accuracyText));

    const baseRates = latest.metrics.map((metrics, index) => `${letterFor(index)} ${percentText(metrics.actualPositiveRate)}`).join('，');
    const note = tradeoffNote(tradeoffCase(latest), baseRates);
    replaceContent(baseRateNote, note ? outsideNote(note) : null);
  }

  const resetButton = button({
    label: '恢复原始数字 Reset',
    iconName: 'refresh',
    variant: 'ghost',
    size: 'sm',
    onClick: () => {
      counts = groups.map((group) => ({ ...group.counts }));
      groupViews.forEach((view, index) => view.editor.setCounts(counts[index]));
      tolerance = initialTolerance;
      slider.value = String(tolerance);
      refresh();
      live.announce(`已恢复 Reset. ${verdictSummary()}`);
    },
  });

  const criteriaTitleId = uniqueId('fairness-groups-criteria');

  replaceContent(frame.body,
    h('div', { class: 'fairness-groups__groups' }, groupViews.map((view) => view.card)),
    teachPair(RATE_NOTE, { className: 'fairness-groups__rate-note' }),
    h('section', { class: 'fairness-groups__criteria-area', 'aria-labelledby': criteriaTitleId },
      subheading({ zh: '三种群体公平标准', en: 'Group fairness criteria' }, { id: criteriaTitleId }),
      h('div', { class: 'fairness-groups__controls' }, toleranceControl, resetButton),
      h('div', { class: 'fairness-groups__criteria' }, criterionViews.map((view) => view.card), individualCard)),
    tradeoff,
    live.element);

  refresh();
  replaceContent(container, frame.root);
}
