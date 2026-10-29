/**
 * heuristic-score widget: a weighted-sum heuristic in the course's material-advantage format,
 * Score = sum of weight × (count for A − count for B), with editable counts and weights.
 * heuristic-score 组件：课程“子力优势”格式的加权和启发式，分数 = Σ 权重 × (A 的数量 − B 的数量)，数量和权重都能调。
 *
 * Config: { title: Bi, players: [Bi, Bi], features: [{ name: Bi, weight: number, counts: [a, b] }],
 *          symbols?: [string, string] (default ["A", "B"]), formulaName?: string (default "Score") }
 * 可选的 symbols 与 formulaName 让公式和课件写法一致，例如 "Material Advantage = 1 × [(# W pawns) − (# B pawns)]"。
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { icon } from '../../../core/dom/icons.js';
import { biTitle, enNode, hasText, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import {
  COUNT_LIMITS,
  WEIGHT_LIMITS,
  advantageShare,
  clampCount,
  clampWeight,
  exceedsRewardRange,
  formatNumber,
  formulaLines,
  normalizeHeuristicConfig,
  parseNumber,
  scoreTone,
  termExpression,
  termValue,
  totalScore,
} from './heuristic-logic.js';

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./heuristic-score.css', import.meta.url));
  const setup = normalizeHeuristicConfig(config);
  const [playerA, playerB] = setup.players;
  const [symbolA, symbolB] = setup.symbols;
  const nameA = textPair(playerA);
  const nameB = textPair(playerB);
  const initial = setup.features.map((feature) => ({ weight: feature.weight, counts: [...feature.counts] }));
  const features = setup.features.map((feature) => ({ ...feature, counts: [...feature.counts] }));

  const root = h('div', { class: 'heuristic-score' },
    h('p', { class: 'heuristic-score__title' }, biTitle(setup.title)),
    playerChips(playerA, playerB, setup.symbols));

  if (!features.length) {
    root.append(sentence('这个打分器还没有任何特征（feature）。', 'This heuristic has no features yet.', 'heuristic-score__empty'));
    container.append(root);
    return undefined;
  }

  const numberHint = h('p', { class: 'heuristic-score__number-hint', 'aria-live': 'polite' });
  const rows = features.map(buildRow);
  const formula = h('div', { class: 'formula heuristic-score__formula' });
  const totalValue = h('span', { class: 'heuristic-score__total-value' });
  const barFill = h('span', { class: 'heuristic-score__bar-fill' });
  const verdict = h('div', { class: 'heuristic-score__verdict', 'aria-live': 'polite' });
  const rangeNote = h('p', { class: 'callout callout--warn heuristic-score__range', hidden: true },
    zhNode('注意：按课程约定，heuristic 应在 −100 和 +100 之间；±100 只留给确定的赢或输。', 'teach', 'span'),
    enNode('Note: by the course convention, a heuristic stays between −100 and +100; ±100 is only for a guaranteed win or loss.', 'span'));

  root.append(
    sentence(`每一项 = 权重 × (${symbolA} 的数量 − ${symbolB} 的数量)。永远是 ${symbolA} 减 ${symbolB}，最后把所有项加起来。`,
      `Each term = weight × (count for ${symbolA} − count for ${symbolB}). Always ${symbolA} minus ${symbolB}, then add up all the terms.`,
      'heuristic-score__how'),
    h('div', { class: 'heuristic-score__table' },
      tableHead(playerA, playerB, setup.symbols),
      h('ul', { class: 'heuristic-score__rows' }, rows.map((row) => row.element))),
    numberHint,
    h('div', { class: 'heuristic-score__result' },
      formula,
      h('div', { class: 'heuristic-score__total' },
        h('span', { class: 'heuristic-score__total-label' }, zhNode('分数', 'label'), ' ', enNode('Score')),
        totalValue),
      h('div', { class: 'heuristic-score__meter', 'aria-hidden': 'true' },
        h('div', { class: 'heuristic-score__bar' }, barFill, h('span', { class: 'heuristic-score__bar-mid' })),
        h('div', { class: 'heuristic-score__bar-labels' },
          h('span', {}, h('b', {}, symbolA), ' ', zhNode('占优', 'label'), ' ', enNode('ahead')),
          h('span', {}, '0'),
          h('span', {}, h('b', {}, symbolB), ' ', zhNode('占优', 'label'), ' ', enNode('ahead')))),
      verdict,
      rangeNote),
    h('div', { class: 'heuristic-score__footer' },
      h('p', { class: 'heuristic-score__note' },
        zhNode('heuristic 只是估计，不是保证：分数高也不代表一定赢。', 'teach', 'span'),
        enNode('A heuristic is only an estimate, not a guarantee.', 'span')),
      button({ label: '恢复初始数字 Reset', iconName: 'refresh', variant: 'ghost', size: 'sm', onClick: reset })));

  // A number box returns '' for text it cannot read (a full-width minus, Chinese digits); the box then
  // puts the old number back, so say why instead of reverting silently.
  // 数字框读不懂的内容（全角减号、中文数字）会变成空字符串，随后恢复原来的数；这里说明原因，而不是悄悄恢复。
  function showNumberHint() {
    replaceContent(numberHint,
      zhNode('刚才输入的内容不是能读懂的数字，已恢复原来的数。请切换到英文输入法，用 0–9、小数点和 - 号输入。', 'teach', 'span'), ' ',
      enNode('That was not a number the box could read, so the old value is back. Use an English keyboard: digits 0–9, a point and -.', 'span'));
  }

  function changed(apply) {
    return (value) => {
      apply(value);
      replaceContent(numberHint);
      refresh();
    };
  }

  function buildRow(feature) {
    const name = textPair(feature.name);
    const term = h('span', { class: 'heuristic-score__term' });
    const steppers = [
      stepper({
        value: feature.weight,
        limits: WEIGHT_LIMITS,
        normalize: clampWeight,
        label: `${name.zh} 的权重 Weight of ${name.en}`,
        onChange: changed((value) => { feature.weight = value; }),
        onUnreadable: showNumberHint,
      }),
      stepper({
        value: feature.counts[0],
        limits: COUNT_LIMITS,
        normalize: clampCount,
        integer: true,
        label: `${symbolA} ${nameA.zh} 的 ${name.zh} 数量 Count of ${name.en} for ${symbolA}, ${nameA.en}`,
        onChange: changed((value) => { feature.counts[0] = value; }),
        onUnreadable: showNumberHint,
      }),
      stepper({
        value: feature.counts[1],
        limits: COUNT_LIMITS,
        normalize: clampCount,
        integer: true,
        label: `${symbolB} ${nameB.zh} 的 ${name.zh} 数量 Count of ${name.en} for ${symbolB}, ${nameB.en}`,
        onChange: changed((value) => { feature.counts[1] = value; }),
        onUnreadable: showNumberHint,
      }),
    ];
    const element = h('li', { class: 'heuristic-score__row' },
      h('div', { class: 'heuristic-score__name' }, biTitle(feature.name)),
      h('div', { class: 'heuristic-score__fields' },
        field([zhNode('权重', 'label'), ' ', enNode('Weight')], steppers[0].element),
        field([h('b', {}, symbolA), ' ', shortName(playerA)], steppers[1].element),
        field([h('b', {}, symbolB), ' ', shortName(playerB)], steppers[2].element)),
      term);
    return { element, term, feature, steppers };
  }

  function refresh() {
    for (const row of rows) {
      const value = termValue(row.feature);
      row.term.textContent = `${termExpression(row.feature)} = ${formatNumber(value)}`;
      row.term.className = `heuristic-score__term is-${scoreTone(value)}`;
    }
    const lines = formulaLines(features, { name: setup.formulaName, symbols: setup.symbols });
    replaceContent(formula,
      h('span', { class: 'heuristic-score__formula-line heuristic-score__formula-line--symbolic' }, lines.symbolic),
      h('span', { class: 'heuristic-score__formula-line' }, lines.substituted),
      h('span', { class: 'heuristic-score__formula-line' }, lines.terms),
      h('span', { class: 'heuristic-score__formula-line heuristic-score__formula-line--total' }, lines.total));
    const total = totalScore(features);
    const tone = scoreTone(total);
    totalValue.textContent = formatNumber(total, { signed: true });
    totalValue.className = `heuristic-score__total-value is-${tone}`;
    barFill.style.width = `${(advantageShare(total) * 100).toFixed(1)}%`;
    replaceContent(verdict, verdictSentence(total, tone, nameA, nameB, setup.symbols));
    rangeNote.hidden = !exceedsRewardRange(total);
  }

  function reset() {
    rows.forEach((row, index) => {
      row.feature.weight = initial[index].weight;
      row.feature.counts = [...initial[index].counts];
      row.steppers[0].set(row.feature.weight);
      row.steppers[1].set(row.feature.counts[0]);
      row.steppers[2].set(row.feature.counts[1]);
    });
    replaceContent(numberHint);
    refresh();
  }

  refresh();
  container.append(root);
  return undefined;
}

/**
 * Number box with minus and plus buttons. Typing updates the score live; leaving the box writes
 * back the clamped value, and `onUnreadable` reports text the box could not read as a number.
 * The buttons use aria-disabled so focus is kept at the limits.
 * 带减号和加号按钮的数字框。输入时分数实时更新；离开输入框时写回限制范围内的值，读不懂的内容通过 onUnreadable 报告。
 * 按钮用 aria-disabled，到达上下限时不会丢失焦点。
 */
function stepper({ value, limits, normalize, integer = false, label, onChange, onUnreadable }) {
  let current = value;
  const restore = () => {
    if (input.validity && input.validity.badInput) onUnreadable?.();
    input.value = String(current);
  };
  const input = h('input', {
    type: 'number',
    class: 'heuristic-score__input',
    min: limits.min,
    max: limits.max,
    step: integer ? 1 : 'any',
    inputmode: integer ? 'numeric' : undefined,
    autocomplete: 'off',
    'aria-label': label,
    oninput: () => {
      if (parseNumber(input.value) === null) return;
      commit(normalize(input.value, current), false);
    },
    onchange: restore,
    onblur: restore,
  });
  const decrease = h('button', {
    type: 'button',
    class: 'heuristic-score__step',
    'aria-label': `减少 Decrease: ${label}`,
    onclick: () => commit(normalize(current - 1, current), true),
  }, icon('minus', { size: 16 }));
  const increase = h('button', {
    type: 'button',
    class: 'heuristic-score__step',
    'aria-label': `增加 Increase: ${label}`,
    onclick: () => commit(normalize(current + 1, current), true),
  }, icon('plus', { size: 16 }));

  function sync() {
    setAriaDisabled(decrease, current <= limits.min);
    setAriaDisabled(increase, current >= limits.max);
  }

  function commit(next, writeBack) {
    if (next !== current) {
      current = next;
      onChange(current);
    }
    if (writeBack) input.value = String(current);
    sync();
  }

  input.value = String(current);
  sync();
  return {
    element: h('div', { class: 'heuristic-score__stepper' }, decrease, input, increase),
    set(next) {
      current = next;
      input.value = String(current);
      sync();
    },
  };
}

function setAriaDisabled(element, disabled) {
  if (disabled) element.setAttribute('aria-disabled', 'true');
  else element.removeAttribute('aria-disabled');
}

// A Chinese teaching sentence with its English version on the next line.
// 一句中文讲解，下一行是对应的英文。
function sentence(zh, en, className) {
  return h('p', { class: ['heuristic-score__sentence', className] },
    zhNode(zh, 'teach', 'span'),
    enNode(en, 'span'));
}

// Both languages of a name, each falling back to the other, for labels and sentences.
// 名称的中英两种写法，缺一种时用另一种代替，用于标签和句子。
function textPair(value) {
  const zh = hasText(value.zh) ? value.zh : value.en;
  const en = hasText(value.en) ? value.en : value.zh;
  return { zh, en };
}

function shortName(player) {
  return hasText(player.zh) ? zhNode(player.zh, 'label') : enNode(player.en);
}

function field(labelNodes, control) {
  return h('div', { class: 'heuristic-score__field' },
    h('span', { class: 'heuristic-score__field-label', 'aria-hidden': 'true' }, labelNodes),
    control);
}

function playerChips(playerA, playerB, [symbolA, symbolB]) {
  const chip = (tag, player, modifier) => h('li', { class: ['heuristic-score__player', `heuristic-score__player--${modifier}`] },
    h('span', { class: 'heuristic-score__tag' }, tag),
    biTitle(player, { className: 'heuristic-score__player-name' }));
  return h('ul', { class: 'heuristic-score__players', 'aria-label': '双方 Players' },
    chip(symbolA, playerA, 'a'),
    chip(symbolB, playerB, 'b'));
}

// Column headings for the wide layout; narrow screens label each box instead.
// 宽屏布局的列标题；窄屏改为在每个输入框上方标注。
function tableHead(playerA, playerB, [symbolA, symbolB]) {
  return h('div', { class: 'heuristic-score__head', 'aria-hidden': 'true' },
    h('span', {}, zhNode('特征', 'label'), ' ', enNode('Feature')),
    h('span', {}, zhNode('权重', 'label'), ' ', enNode('Weight')),
    h('span', {}, h('b', {}, symbolA), ' ', shortName(playerA)),
    h('span', {}, h('b', {}, symbolB), ' ', shortName(playerB)),
    h('span', {}, zhNode('这一项', 'label'), ' ', enNode('Term')));
}

function verdictSentence(total, tone, nameA, nameB, [symbolA, symbolB]) {
  const shown = formatNumber(total, { signed: true });
  if (tone === 'positive') {
    return sentence(`分数 ${shown} 是正数，对 ${symbolA} 有利：${nameA.zh} 占优势。`,
      `The score ${shown} is positive, so it is good for ${symbolA}: ${nameA.en} is ahead.`, 'heuristic-score__sentence--lead');
  }
  if (tone === 'negative') {
    return sentence(`分数 ${shown} 是负数，对 ${symbolB} 有利：${nameB.zh} 占优势，对 ${symbolA} 不利。`,
      `The score ${shown} is negative, so it is good for ${symbolB}: ${nameB.en} is ahead, which is bad for ${symbolA}.`, 'heuristic-score__sentence--lead');
  }
  return sentence('分数是 0：双方一样好（**equal position**）。', 'The score is 0: an equal position.', 'heuristic-score__sentence--lead');
}
