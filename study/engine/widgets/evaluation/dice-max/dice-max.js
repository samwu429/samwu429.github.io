/**
 * Widget "dice-max": the lec06 activity "Consequences of Choosing the Maximum" (p.23-27).
 * Roll 8 dice once, then repeatedly "record 10 rolls and keep the max"; the histogram of maxima
 * sits well above the single-roll histogram, which is why the best model's validation accuracy
 * over-reports and a separate test set is needed.
 * 组件“dice-max”：lec06 活动“选最大值的后果”（第 23-27 页）。先掷一次 8 个骰子，再反复“记录 10 次取最大”；
 * 最大值的分布明显落在单次分布的右边，这就是被选中模型的验证准确率会高估、需要单独测试集的原因。
 *
 * Config: { dice: 8, sides: 6, rolls: 10 }
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biStack, biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { liveRegion, subheading, teachPair, uniqueId, widgetFrame } from '../shared/eval-ui.js';
import { formatPercent, roundTo } from '../shared/metric-format.js';
import {
  addSample,
  axisTicks,
  createHistogram,
  DEFAULT_DICE_CONFIG,
  distributionMean,
  distributionModes,
  histogramMean,
  histogramPeak,
  maxDistribution,
  normalizeDiceConfig,
  pipPositions,
  probabilityAbove,
  resetHistogram,
  rollDice,
  runMaxExperiment,
  shareAbove,
  sumDistribution,
  sumOf,
} from './dice-logic.js';

const BATCH_SIZES = [100, 1000];
const ROLL_ANIMATION_MS = 450;

/** 28 stays "28", 35.3953 becomes "35.4". 整数保持原样，其余保留一位小数。 */
function formatValue(value, digits = 1) {
  const rounded = roundTo(value, digits);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
}

function signed(value) {
  const text = formatValue(Math.abs(value));
  if (roundTo(value, 1) === 0) return '0';
  return value > 0 ? `+${text}` : `−${text}`;
}

/**
 * One die drawn in SVG: pips for faces up to 6, the number itself for larger dice, blank before rolling.
 * 用 SVG 画一个骰子：6 点以内画圆点，更大的骰子直接写数字，未掷时为空白。
 */
function dieFace(face, sides) {
  const pips = face ? pipPositions(face) : null;
  const drawNumber = Boolean(face) && (sides > 6 || !pips);
  return s('svg', {
    class: ['dice-max__die', face ? null : 'is-blank'],
    viewBox: '0 0 100 100',
    'aria-hidden': 'true',
    focusable: 'false',
  },
  s('rect', { class: 'dice-max__die-body', x: 5, y: 5, width: 90, height: 90, rx: 16 }),
  drawNumber
    ? s('text', { class: 'dice-max__die-number', x: 50, y: 54, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, String(face))
    : (pips || []).map(([cx, cy]) => s('circle', { class: 'dice-max__pip', cx, cy, r: 9 })));
}

export async function mount(container, config, context) {
  await Promise.all([
    ensureStylesheet(new URL('../shared/eval-ui.css', import.meta.url)),
    ensureStylesheet(new URL('./dice-max.css', import.meta.url)),
  ]);

  const settings = normalizeDiceConfig(config);
  const { dice, sides, rolls } = settings;
  const isSlideSetup = dice === DEFAULT_DICE_CONFIG.dice && sides === DEFAULT_DICE_CONFIG.sides && rolls === DEFAULT_DICE_CONFIG.rolls;

  // Exact reference values, computed rather than typed in.
  // 精确参考值，由计算得到而不是手写。
  const exact = sumDistribution(dice, sides);
  const expectedSingle = distributionMean(exact);
  const modes = distributionModes(exact);
  const maxExact = maxDistribution(exact, rolls);
  const expectedMaximum = distributionMean(maxExact);
  const theoryShareAbove = probabilityAbove(maxExact, expectedSingle);
  const singleText = formatValue(expectedSingle);
  const maxText = formatValue(expectedMaximum);

  const singles = createHistogram(exact.min, exact.max);
  const maxima = createHistogram(exact.min, exact.max);
  let lastFaces = null;
  let lastRound = null;
  let rounds = 0;
  let animationTimer = null;
  const live = liveRegion();

  const frame = widgetFrame({
    className: 'dice-max',
    title: { zh: '选最大值的后果', en: 'Consequences of choosing the maximum' },
    intro: {
      zh: `课件活动：一次掷 ${dice} 个 ${sides} 面骰子（D${sides}），把点数加起来。先掷一次；再“记录 ${rolls} 次取最大”，多做几轮，比较下面两张分布图。`,
      en: `Roll ${dice} D${sides} and add them up. Roll once, then record ${rolls} rolls and keep the max, many times, and compare the two histograms.`,
    },
  });

  /* ---------- Step 1: roll once 第一步：掷一次 ---------- */

  const tray = h('div', { class: 'dice-max__tray', role: 'img' });
  // Narrow screens show the dice in two even rows (4 + 4 for 8 dice), wide screens in one row.
  // 窄屏把骰子排成整齐的两行（8 个时为 4 + 4），宽屏排成一行。
  tray.style.setProperty('--dice-count', String(dice));
  tray.style.setProperty('--dice-half', String(dice > 4 ? Math.ceil(dice / 2) : dice));
  const sumLine = h('p', { class: 'dice-max__sum' });

  function renderTray() {
    const faces = lastFaces || new Array(dice).fill(null);
    replaceContent(tray, faces.map((face) => dieFace(face, sides)));
    tray.setAttribute('aria-label', lastFaces
      ? `${dice} 个骰子 dice: ${lastFaces.join(', ')}`
      : '还没有掷骰子 Not rolled yet');
    if (!lastFaces) {
      replaceContent(sumLine, h('span', { class: 'dice-max__sum-label' }, '总和 Total'), ' ?');
      return;
    }
    replaceContent(sumLine,
      h('span', { class: 'dice-max__sum-label' }, '总和 Total'),
      h('span', { class: 'dice-max__sum-terms', lang: 'en' }, `${lastFaces.join(' + ')} =`),
      h('strong', { class: 'dice-max__sum-value' }, String(sumOf(lastFaces))));
  }

  function animateTray() {
    window.clearTimeout(animationTimer);
    tray.classList.remove('is-rolling');
    // Reading layout restarts the CSS animation when the button is pressed again quickly.
    // 读取一次布局，快速连按时可以重新开始 CSS 动画。
    void tray.offsetWidth;
    tray.classList.add('is-rolling');
    animationTimer = window.setTimeout(() => tray.classList.remove('is-rolling'), ROLL_ANIMATION_MS);
  }

  function rollOnce() {
    lastFaces = rollDice(dice, sides);
    const total = sumOf(lastFaces);
    addSample(singles, total);
    renderTray();
    animateTray();
    renderCharts();
    live.announce(`总和 Total ${total}`);
  }

  const stepOneTitleId = uniqueId('dice-max-step');
  const stepOne = h('section', { class: 'dice-max__step', 'aria-labelledby': stepOneTitleId },
    subheading({ zh: '第一步：掷一次', en: 'Step 1: Roll once' }, { id: stepOneTitleId }),
    h('div', { class: 'dice-max__row' },
      button({ label: `掷 ${dice} 个骰子 Roll ${dice} dice`, iconName: 'play', variant: 'primary', onClick: rollOnce }),
      h('p', { class: 'dice-max__expect' },
        h('span', {}, '单次期望 Expected'),
        h('strong', {}, singleText))),
    tray,
    sumLine);

  /* ---------- Step 2: record N rolls, keep the max 第二步：记录 N 次取最大 ---------- */

  const roundList = h('ol', { class: 'dice-max__round', 'aria-label': `最近一轮的 ${rolls} 次总和 The ${rolls} totals of the latest round` });
  const roundResult = h('div', { class: 'dice-max__round-result' });
  const counters = h('p', { class: 'dice-max__counters' });

  function renderRound() {
    if (!lastRound) {
      replaceContent(roundList);
      roundList.hidden = true;
      replaceContent(roundResult, teachPair({
        zh: `点“记录 ${rolls} 次取最大”：一下子掷 ${rolls} 次，只留下最大的那个总和。`,
        en: `Press the button to roll ${rolls} times and keep only the largest total.`,
      }));
    } else {
      roundList.hidden = false;
      replaceContent(roundList, lastRound.sums.map((sum, index) => h('li', {
        class: ['dice-max__roll', index === lastRound.maxIndex ? 'is-max' : null],
      },
      h('span', { class: 'dice-max__roll-index', 'aria-hidden': 'true' }, `#${index + 1}`),
      h('span', { class: 'dice-max__roll-sum' }, String(sum)),
      index === lastRound.maxIndex ? h('span', { class: 'visually-hidden' }, '（最大 max）') : null)));
      const difference = lastRound.max - expectedSingle;
      const same = roundTo(difference, 1) === 0;
      replaceContent(roundResult,
        h('span', {}, '这一轮的最大值 Max of this round: '),
        h('strong', { class: 'dice-max__round-max' }, String(lastRound.max)),
        h('span', {},
          zhNode(same
            ? `（和期望 ${singleText} 一样）`
            : `（比期望 ${singleText} ${difference > 0 ? '高' : '低'} ${formatValue(Math.abs(difference))}）`, 'teach'), ' ',
          enNode(same
            ? `(the same as the expected ${singleText})`
            : `(${signed(difference)} compared with the expected ${singleText})`)));
    }
    counters.textContent = `已掷 Rolls: ${singles.n} · 已完成轮数 Rounds: ${rounds}`;
  }

  function runRounds(count) {
    let round = null;
    for (let index = 0; index < count; index += 1) {
      round = runMaxExperiment(settings);
      round.sums.forEach((sum) => addSample(singles, sum));
      addSample(maxima, round.max);
    }
    rounds += count;
    lastRound = round;
    renderRound();
    renderCharts();
    if (count === 1) {
      live.announce(`${rolls} 次中最大 Max of ${rolls}: ${round.max}`);
    } else {
      live.announce(`完成 ${count} 轮 Done ${count} rounds. 最大值平均 Average max ${formatValue(histogramMean(maxima))}`);
    }
  }

  function clearAll() {
    resetHistogram(singles);
    resetHistogram(maxima);
    lastFaces = null;
    lastRound = null;
    rounds = 0;
    renderTray();
    renderRound();
    renderCharts();
    live.announce('已清空 Cleared');
  }

  const stepTwoTitleId = uniqueId('dice-max-step');
  const stepTwo = h('section', { class: 'dice-max__step', 'aria-labelledby': stepTwoTitleId },
    subheading({ zh: `第二步：记录 ${rolls} 次取最大`, en: `Step 2: Record ${rolls} rolls and keep the max` }, { id: stepTwoTitleId }),
    h('div', { class: 'dice-max__row' },
      button({ label: `记录 ${rolls} 次取最大 Record ${rolls} rolls, keep the max`, iconName: 'list', variant: 'primary', onClick: () => runRounds(1) }),
      BATCH_SIZES.map((size) => button({
        label: `再做 ${size} 轮 Repeat ×${size}`,
        iconName: 'refresh',
        variant: 'secondary',
        size: 'sm',
        onClick: () => runRounds(size),
      })),
      button({ label: '清空 Clear', iconName: 'cross', variant: 'ghost', size: 'sm', onClick: clearAll })),
    roundList,
    roundResult,
    counters);

  /* ---------- Histograms 分布图 ---------- */

  const span = exact.max - exact.min + 1;
  const position = (value) => `${(((value - exact.min + 0.5) / span) * 100).toFixed(3)}%`;
  const ticks = axisTicks(exact.min, exact.max);

  function histogramChart({ title, variant, histogram, markers, describe }) {
    const titleId = uniqueId('dice-max-chart');
    const stats = h('p', { class: 'dice-max__chart-stats' });
    const bars = histogram.counts.map((_, index) => h('span', { class: 'dice-max__bar', dataset: { value: String(exact.min + index) } }));
    const empty = h('p', { class: 'dice-max__empty' }, '还没有数据 No data yet');
    const plot = h('div', { class: 'dice-max__plot', role: 'img' },
      h('div', { class: 'dice-max__bars' }, bars),
      markers.map((marker) => h('div', {
        class: ['dice-max__marker', `dice-max__marker--${marker.tone}`],
        style: { left: position(marker.value) },
      }, h('span', { class: 'dice-max__marker-label' }, marker.label))),
      empty);
    const tableHost = h('div', { class: ['table-scroll', 'dice-max__table'] });
    const details = h('details', { class: 'dice-max__details' },
      h('summary', {}, '看数据表 Data table'),
      tableHost);

    function renderTable() {
      const rows = histogram.counts
        .map((count, index) => ({ value: exact.min + index, count }))
        .filter((row) => row.count > 0);
      replaceContent(tableHost, rows.length
        ? h('table', { class: 'data-table' },
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, '总和 Total'),
            h('th', { scope: 'col' }, '次数 Count'),
            h('th', { scope: 'col' }, '占比 Share'))),
          h('tbody', {}, rows.map((row) => h('tr', {},
            h('td', {}, String(row.value)),
            h('td', {}, String(row.count)),
            h('td', {}, formatPercent(row.count / histogram.n, { digits: 1, trim: false }))))))
        : h('p', { class: 'dice-max__table-empty' }, '还没有数据 No data yet'));
    }

    details.addEventListener('toggle', () => {
      if (details.open) renderTable();
    });

    const element = h('figure', { class: ['dice-max__chart', `dice-max__chart--${variant}`], 'aria-labelledby': titleId },
      h('figcaption', { class: 'dice-max__chart-head' },
        h('span', { class: 'dice-max__chart-title', id: titleId }, biTitle(title)),
        stats),
      plot,
      h('div', { class: 'dice-max__axis', 'aria-hidden': 'true' },
        ticks.map((tick) => h('span', { class: 'dice-max__tick', style: { left: position(tick) } }, String(tick)))),
      details);

    function update() {
      const peak = histogramPeak(histogram);
      histogram.counts.forEach((count, index) => {
        const bar = bars[index];
        bar.style.height = peak ? `${((count / peak) * 100).toFixed(2)}%` : '0%';
        bar.classList.toggle('has-data', count > 0);
        bar.title = `${exact.min + index}: ${count}`;
      });
      const mean = histogramMean(histogram);
      stats.textContent = `n = ${histogram.n} · 平均 Average ${mean === null ? '—' : formatValue(mean)}`;
      empty.hidden = histogram.n > 0;
      plot.setAttribute('aria-label', describe(histogram, mean));
      if (details.open) renderTable();
    }

    return { element, update };
  }

  const singleChart = histogramChart({
    title: { zh: '单次掷出的总和', en: 'Totals of single rolls' },
    variant: 'single',
    histogram: singles,
    markers: [{ value: expectedSingle, label: singleText, tone: 'expected' }],
    describe: (histogram, mean) => (histogram.n
      ? `单次总和的分布：${histogram.n} 次，平均 ${formatValue(mean)}。Single-roll totals: ${histogram.n} rolls, average ${formatValue(mean)}.`
      : '单次总和的分布：还没有数据 No data yet'),
  });

  const maxChart = histogramChart({
    title: { zh: `每轮 ${rolls} 次里的最大值`, en: `Max of each round of ${rolls}` },
    variant: 'max',
    histogram: maxima,
    markers: [
      { value: expectedSingle, label: singleText, tone: 'expected' },
      { value: expectedMaximum, label: maxText, tone: 'max' },
    ],
    describe: (histogram, mean) => (histogram.n
      ? `最大值的分布：${histogram.n} 轮，平均 ${formatValue(mean)}，比 ${singleText} 高。Maxima: ${histogram.n} rounds, average ${formatValue(mean)}.`
      : '最大值的分布：还没有数据 No data yet'),
  });

  const observedMax = h('strong', { class: 'dice-max__stat-value' });
  const observedMaxNote = h('span', { class: 'dice-max__stat-note' });
  const observedShare = h('strong', { class: 'dice-max__stat-value' });

  const modeNote = modes.length === 1 && Math.abs(modes[0] - expectedSingle) < 1e-9
    ? (isSlideSetup ? '课件第 24 页：Most likely value: 28' : '也是最可能的值 also the most likely value')
    : `最可能的值 Most likely: ${modes.join(' / ')}`;

  function stat(label, value, note) {
    return h('div', { class: 'dice-max__stat' },
      h('span', { class: 'dice-max__stat-label' }, label),
      value,
      note);
  }

  const statsPanel = h('div', { class: 'dice-max__stats' },
    stat('单次期望 Expected single roll', h('strong', { class: 'dice-max__stat-value' }, singleText),
      h('span', { class: 'dice-max__stat-note' }, modeNote)),
    stat(`${rolls} 次最大值的期望 Expected max of ${rolls}`, h('strong', { class: 'dice-max__stat-value is-max' }, maxText),
      h('span', { class: 'dice-max__stat-note' }, isSlideSetup
        ? '课件第 26 页 slide p.26'
        : `与 ${singleText} 相差 difference ${signed(expectedMaximum - expectedSingle)}`)),
    stat('你的最大值平均 Your average max', observedMax, observedMaxNote),
    stat(`最大值高于 ${singleText} 的轮数 Rounds with max above ${singleText}`, observedShare,
      h('span', { class: 'dice-max__stat-note' }, `理论 Theory ${formatPercent(theoryShareAbove, { digits: 1, trim: false })}`)));

  function renderCharts() {
    singleChart.update();
    maxChart.update();
    const mean = histogramMean(maxima);
    observedMax.textContent = mean === null ? '—' : formatValue(mean);
    observedMaxNote.textContent = mean === null
      ? '先做几轮 Run a few rounds'
      : `与 ${singleText} 相差 difference ${signed(mean - expectedSingle)}`;
    const share = shareAbove(maxima, expectedSingle);
    observedShare.textContent = share === null ? '—' : formatPercent(share, { digits: 1, trim: false });
  }

  const chartsTitleId = uniqueId('dice-max-charts');
  const charts = h('section', { class: 'dice-max__charts', 'aria-labelledby': chartsTitleId },
    subheading({ zh: '两张分布图对比', en: 'Compare the two histograms' }, { id: chartsTitleId }),
    teachPair({
      zh: `两张图的横轴一样（总和 ${exact.min} 到 ${exact.max}）。竖线 ${singleText} 是单次的期望；下面那张图的 ${maxText} 是“${rolls} 次取最大”的期望。`,
      en: `Both charts share the same axis. The line at ${singleText} is the expected single roll; ${maxText} is the expected max of ${rolls} rolls.`,
    }, { className: 'dice-max__charts-intro' }),
    singleChart.element,
    maxChart.element,
    statsPanel);

  /* ---------- Lesson 结论 ---------- */

  const lessonTitleId = uniqueId('dice-max-lesson');
  const lesson = h('section', { class: 'dice-max__lesson', 'aria-labelledby': lessonTitleId },
    subheading({ zh: '这和选模型有什么关系', en: 'What this has to do with choosing a model' }, { id: lessonTitleId }),
    h('ol', { class: 'dice-max__steps' },
      h('li', {}, teachPair({
        zh: `掷一次（${dice} 个骰子的总和）≈ 一个模型在验证集上的准确率：有真实水平，也有运气。`,
        en: "One roll is like one model's validation accuracy: real skill plus luck.",
      })),
      h('li', {}, teachPair({
        zh: `记录 ${rolls} 次取最大 ≈ 训练 ${rolls} 个模型，挑验证准确率最高的那一个。`,
        en: `Keeping the max of ${rolls} rolls is like picking the best of ${rolls} models on the validation set.`,
      })),
      h('li', {}, teachPair({
        zh: `最大值几乎总比 ${singleText} 高：挑出来的“最好成绩”里混进了好运气，所以被选中模型的验证准确率会高估它的真实表现。`,
        en: "The max is almost always above the typical value, so the chosen model's validation accuracy over-reports its true performance.",
      }))),
    h('blockquote', { class: 'eval-quote' },
      biStack({
        en: 'We should be aware that when we are given a validation accuracy, true performance is likely to be worse!',
        zh: '拿到一个验证准确率时要清楚：真实表现很可能更差！',
      }, { role: 'gloss' }),
      h('span', { class: 'eval-quote__source' }, 'Lecture 6, p.26')),
    h('div', { class: ['callout', 'callout--tip', 'dice-max__takeaway'] },
      h('span', { class: 'callout__label' }, '所以 So'),
      teachPair({
        zh: '最终准确率要在测试集（**test set**）上报告：测试集既没参与训练，也没参与挑模型，所以不会被“挑最大”抬高。常见划分：训练 / 验证 / 测试 = 60 / 20 / 20。',
        en: 'Report the final accuracy on a **test set**, a segment of the dataset not used for training or validation. A 60/20/20 split is common.',
      })));

  replaceContent(frame.body, stepOne, stepTwo, charts, lesson, live.element);

  renderTray();
  renderRound();
  renderCharts();
  replaceContent(container, frame.root);

  return () => {
    window.clearTimeout(animationTimer);
  };
}
