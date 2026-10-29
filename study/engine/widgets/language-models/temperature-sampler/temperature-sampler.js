/**
 * Widget "temperature-sampler": the next-token probability distribution of an LLM (lec07 p.52) and
 * how the temperature setting reshapes it. The learner samples one token (appended to the context)
 * or 100 tokens at once to see how often each candidate wins.
 * 组件“temperature-sampler”：LLM 下一个 token 的概率分布（lec07 第 52 页），以及温度如何改变这个分布。
 * 可以抽 1 个 token（接到上下文后面），也可以一次抽 100 个，看每个候选被选中的次数。
 *
 * Config: { context: string, candidates: [{ token, prob }] }
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { renderInline } from '../../../core/text/inline-markup.js';
import { button } from '../../../components/controls/button.js';
import {
  DEFAULT_CONTEXT,
  MAX_TEMPERATURE,
  MIN_TEMPERATURE,
  applyTemperature,
  clampTemperature,
  formatPercent,
  joinParts,
  normalizeCandidates,
  sampleCounts,
  sampleIndex,
  temperatureRegime,
} from './temperature-logic.js';

const BATCH_SIZE = 100;
const HISTORY_SIZE = 8;

const INTRO = {
  zh: 'LLM 的输出是“下一个 token 的概率分布”。拖动温度，看柱子怎么变；再点“生成”抽一个 token。',
  en: 'The output of an LLM is a probability distribution over the next token. Change the temperature, then sample.',
};

const REGIME_TEXT = {
  greedy: {
    zh: '温度非常低：几乎每次都选第一名。课件说，总选最可能的 token，回答就没有变化（no diversity）。',
    en: 'Very low temperature: the top token wins almost every time, so there is no diversity.',
  },
  low: {
    zh: '低温：排第一的 token 更容易被选中，回答更稳定。',
    en: 'Low temperature: the top answer is more likely.',
  },
  neutral: {
    zh: 'T = 1：就是模型原本给出的概率。',
    en: "T = 1: the model's original probabilities.",
  },
  high: {
    zh: '高温：排在后面的 token 更容易被选中，回答更多样。',
    en: 'Higher temperature: answers farther down the list are more likely to be picked.',
  },
};

const SLIDE_QUOTE = {
  en: 'At a low temperature, the top answer is more likely. At higher temperatures, answers farther down the list are more likely to be picked.',
  zh: '温度低时，排第一的答案更可能被选中；温度高时，排在后面的答案更可能被选中。',
};

const LOOP_NOTE = {
  zh: '选出一个 token 后，LLM 会把它接到上下文末尾，再从头算下一个 token（p.54）。这个演示只演示这一步，所以再抽一次会替换掉刚才的 token。',
  en: 'After picking a token, the LLM appends it to the context and starts again (p.54). This demo shows only this one step.',
};

const FORMULA_NOTE = {
  zh: '补充（课件外）：这里把每个概率 p 变成 p^(1/T)，再按比例缩放让总和回到 100%。T < 1 时大的更大、小的更小；T > 1 时差距变小。课件只讲温度的效果，不用背这个算法。',
  en: 'Each probability p becomes p^(1/T), then everything is rescaled to add up to 100%.',
};

let instanceCount = 0;

function teachPair(value, className, role = 'teach') {
  return h('div', { class: ['temperature-sampler__pair', className] },
    zhNode(value.zh, role, 'p', 'temperature-sampler__zh'),
    enNode(value.en, 'p', 'temperature-sampler__en'));
}

function createRow(item) {
  const bar = h('span', { class: 'temperature-sampler__bar' });
  const mark = h('span', { class: 'temperature-sampler__mark' });
  const percent = h('span', { class: 'temperature-sampler__percent' });
  const original = h('span', { class: 'temperature-sampler__original' });
  const count = h('span', { class: 'temperature-sampler__count' });
  const tag = h('span', { class: 'temperature-sampler__tag', hidden: true }, '抽中 picked');
  const row = h('li', { class: 'temperature-sampler__row' },
    h('span', { class: 'temperature-sampler__token' },
      h('span', { class: 'temperature-sampler__token-text', lang: 'en' }, item.token),
      tag),
    h('span', { class: 'temperature-sampler__track', 'aria-hidden': 'true' }, bar, mark),
    h('span', { class: 'temperature-sampler__numbers' }, percent, original),
    count);
  return { row, bar, mark, percent, original, count, tag };
}

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./temperature-sampler.css', import.meta.url));
  instanceCount += 1;
  const uid = `temperature-sampler-${instanceCount}`;
  const normalized = normalizeCandidates(config?.candidates);
  const items = normalized.items;
  const baseProbs = items.map((item) => item.prob);
  const configuredContext = typeof config?.context === 'string' ? config.context : '';
  const contextText = normalized.usedDefault || !configuredContext.trim() ? DEFAULT_CONTEXT : configuredContext;

  const state = { temperature: 1, picked: -1, counts: null, countsTemperature: null, history: [] };
  let lastRegime = '';

  const contextLine = h('p', { class: 'temperature-sampler__context-text', lang: 'en' });
  const regimeNote = h('div', { class: 'temperature-sampler__regime', 'aria-live': 'polite' });
  const rows = items.map(createRow);
  const countsCaption = h('p', { class: 'temperature-sampler__counts-caption', hidden: true });
  const status = h('div', { class: 'temperature-sampler__status', role: 'status', 'aria-live': 'polite' });
  const history = h('p', { class: 'temperature-sampler__history', hidden: true });

  const sliderId = `${uid}-temperature`;
  const sliderValue = h('output', { class: 'temperature-sampler__value', for: sliderId });
  const slider = h('input', {
    type: 'range',
    id: sliderId,
    class: 'temperature-sampler__range',
    min: MIN_TEMPERATURE,
    max: MAX_TEMPERATURE,
    step: 0.1,
  });
  slider.value = String(state.temperature);

  const currentProbs = () => applyTemperature(baseProbs, state.temperature);

  function renderContext() {
    if (state.picked < 0) {
      replaceContent(contextLine,
        renderInline(contextText.replace(/\s+$/u, '')),
        ' ',
        h('span', { class: 'temperature-sampler__blank' }, '___'),
        h('span', { class: 'visually-hidden' }, '（下一个 token 待定 next token not chosen yet）'));
      return;
    }
    const parts = joinParts(contextText, items[state.picked].token);
    replaceContent(contextLine,
      renderInline(parts.base),
      parts.separator,
      h('mark', { class: 'temperature-sampler__new' }, parts.token));
  }

  function renderRows() {
    const probs = currentProbs();
    rows.forEach((row, index) => {
      row.bar.style.width = `${(probs[index] * 100).toFixed(2)}%`;
      row.mark.style.left = `${(baseProbs[index] * 100).toFixed(2)}%`;
      row.percent.textContent = formatPercent(probs[index]);
      replaceContent(row.original,
        h('span', { class: 'visually-hidden' }, '原本 original '),
        `T=1: ${formatPercent(baseProbs[index])}`);
      const picked = index === state.picked;
      row.row.classList.toggle('temperature-sampler__row--picked', picked);
      row.tag.hidden = !picked;
      replaceContent(row.count, state.counts
        ? [h('span', { class: 'visually-hidden' }, '抽中次数 picks '), `×${state.counts[index]}`]
        : null);
    });
    if (state.counts) {
      countsCaption.hidden = false;
      replaceContent(countsCaption,
        zhNode(`右边的 × 数字：最近一次抽 ${BATCH_SIZE} 次（T = ${state.countsTemperature.toFixed(1)}）里各被选中几次。`, 'teach'), ' ',
        enNode(`The × numbers count picks in the last ${BATCH_SIZE} samples.`));
    } else {
      countsCaption.hidden = true;
    }
  }

  function renderRegime() {
    const regime = temperatureRegime(state.temperature, Math.max(...currentProbs()));
    if (regime === lastRegime) return;
    lastRegime = regime;
    replaceContent(regimeNote, teachPair(REGIME_TEXT[regime]));
  }

  function renderHistory() {
    history.hidden = state.history.length === 0;
    replaceContent(history,
      h('span', { class: 'temperature-sampler__history-label' }, '最近抽到 Recent picks: '),
      state.history.map((token, index) => [index ? ' · ' : null, h('span', { lang: 'en' }, token)]));
  }

  function setTemperature(value) {
    state.temperature = clampTemperature(Math.round(value * 10) / 10);
    sliderValue.textContent = `T = ${state.temperature.toFixed(1)}`;
    slider.setAttribute('aria-valuetext', `温度 temperature T = ${state.temperature.toFixed(1)}`);
    if (state.counts && state.countsTemperature !== state.temperature) {
      // Old counts describe another temperature, so they would mislead. 旧计数对应别的温度，会误导，因此清空。
      state.counts = null;
      state.countsTemperature = null;
    }
    renderRows();
    renderRegime();
  }

  function sampleOnce() {
    const probs = currentProbs();
    const index = sampleIndex(probs, Math.random);
    if (index < 0) return;
    state.picked = index;
    state.history = [items[index].token, ...state.history].slice(0, HISTORY_SIZE);
    renderContext();
    renderRows();
    renderHistory();
    replaceContent(status, teachPair({
      zh: `抽中“${items[index].token}”：在 T = ${state.temperature.toFixed(1)} 时它的概率是 ${formatPercent(probs[index])}。`,
      en: `Sampled "${items[index].token}" (probability ${formatPercent(probs[index])} at T = ${state.temperature.toFixed(1)}).`,
    }));
  }

  function sampleBatch() {
    const probs = currentProbs();
    state.counts = sampleCounts(probs, BATCH_SIZE, Math.random);
    state.countsTemperature = state.temperature;
    renderRows();
    const top = state.counts[0];
    const others = BATCH_SIZE - top;
    const rest = items.length - 1;
    replaceContent(status, teachPair({
      zh: `抽了 ${BATCH_SIZE} 次（T = ${state.temperature.toFixed(1)}）：第一名“${items[0].token}”被选中 ${top} 次，其余 ${rest} 个一共 ${others} 次。次数大致跟着柱子走，但每次都不完全一样，因为是随机的。`,
      en: `${BATCH_SIZE} samples at T = ${state.temperature.toFixed(1)}: "${items[0].token}" won ${top} times; the other ${rest} shared ${others}.`,
    }));
  }

  function clearSamples() {
    state.picked = -1;
    state.counts = null;
    state.countsTemperature = null;
    state.history = [];
    renderContext();
    renderRows();
    renderHistory();
    replaceContent(status);
  }

  slider.addEventListener('input', () => setTemperature(Number(slider.value)));

  const notes = [];
  if (normalized.rescaled) {
    notes.push(teachPair({
      zh: `配置里的概率加起来是 ${formatPercent(normalized.rawSum)}，这里按比例换算成 100%。`,
      en: 'The configured probabilities were rescaled to add up to 100%.',
    }, 'temperature-sampler__fine-print'));
  }

  const titleId = `${uid}-title`;
  const root = h('section', { class: 'temperature-sampler', 'aria-labelledby': titleId },
    h('header', { class: 'temperature-sampler__header' },
      h('span', { class: 'temperature-sampler__eyebrow' }, '互动演示 Interactive'),
      h('h3', { class: 'temperature-sampler__title', id: titleId }, biTitle({ zh: '温度：下一个 token 怎么选', en: 'Temperature and the next token' })),
      teachPair(INTRO, 'temperature-sampler__intro')),
    h('div', { class: 'temperature-sampler__context' },
      h('span', { class: 'temperature-sampler__context-label' }, '上下文 Context'),
      contextLine),
    h('div', { class: 'temperature-sampler__controls' },
      h('div', { class: 'temperature-sampler__slider' },
        h('label', { class: 'temperature-sampler__label', for: sliderId }, '温度 Temperature'),
        slider,
        sliderValue),
      h('div', { class: 'temperature-sampler__scale', 'aria-hidden': 'true' },
        h('span', {}, `${MIN_TEMPERATURE} 低 low`),
        h('span', {}, '1'),
        h('span', {}, `${MAX_TEMPERATURE} 高 high`)),
      regimeNote),
    h('div', { class: 'temperature-sampler__chart' },
      h('h4', { class: 'temperature-sampler__subheading' }, biTitle({ zh: '下一个 token 的概率', en: 'Next-token probabilities' })),
      h('ol', { class: 'temperature-sampler__rows' }, rows.map((row) => row.row)),
      h('p', { class: 'temperature-sampler__legend' },
        h('span', { class: 'temperature-sampler__legend-bar', 'aria-hidden': 'true' }),
        h('span', {}, zhNode('实心柱 = 当前温度下的概率', 'label'), ' ', enNode('bar = probability now')),
        h('span', { class: 'temperature-sampler__legend-mark', 'aria-hidden': 'true' }),
        h('span', {}, zhNode('竖线 = T = 1 时的原始概率', 'label'), ' ', enNode('line = original (T = 1)'))),
      countsCaption),
    h('div', { class: 'temperature-sampler__actions' },
      button({ label: '生成 Sample', iconName: 'play', variant: 'primary', onClick: sampleOnce }),
      button({ label: `抽 ${BATCH_SIZE} 次 Sample × ${BATCH_SIZE}`, iconName: 'bolt', onClick: sampleBatch }),
      button({ label: '清空 Clear', iconName: 'refresh', variant: 'ghost', size: 'sm', onClick: clearSamples })),
    status,
    history,
    teachPair(LOOP_NOTE, 'temperature-sampler__loop'),
    h('div', { class: 'temperature-sampler__quote' },
      h('span', { class: 'temperature-sampler__quote-label' }, '课件原话 Course wording (p.52)'),
      enNode(SLIDE_QUOTE.en, 'p', 'temperature-sampler__quote-en'),
      zhNode(SLIDE_QUOTE.zh, 'gloss', 'p', 'temperature-sampler__quote-zh')),
    h('details', { class: 'temperature-sampler__details' },
      h('summary', { class: 'temperature-sampler__summary' }, '温度怎么改变概率 How is it computed?'),
      teachPair(FORMULA_NOTE, 'temperature-sampler__formula-note')),
    notes);

  setTemperature(state.temperature);
  renderContext();
  renderHistory();
  replaceContent(container, root);
  return () => {};
}
