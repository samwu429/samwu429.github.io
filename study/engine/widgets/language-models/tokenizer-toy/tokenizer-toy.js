/**
 * Widget "tokenizer-toy": a simplified subword tokenizer (lec07 p.45-46). The learner types English
 * text and sees the tokens as chips with ids, the slide-style slash notation, the character-split
 * comparison and the pieces shared by related words. Clearly marked as a toy.
 * 组件“tokenizer-toy”：简化版子词分词器（lec07 第 45-46 页）。输入英文后可以看到带编号的 token 卡片、
 * 与课件一样的斜线写法、按字母切分的对比，以及相关单词共用的片段。界面上明确标注这是简化演示。
 *
 * Config: { text: string }
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { characterCount, sharedPieces, slashNotation, tokenize, vocabularyGroups } from './tokenizer-logic.js';

const DEFAULT_TEXT = 'The student daydreamed in class.';
const MAX_INPUT = 160;

const PRESETS = [
  { label: '课件例句 Slide example', text: DEFAULT_TEXT },
  { label: 'jump 一家 jump family', text: 'jump jumps jumping jumped' },
  { label: '前缀后缀 Prefixes', text: 'Unhappy students replayed the game.' },
  { label: '生词 New word', text: 'Mississauga' },
];

const INTRO = {
  zh: '在框里输入英文，看它被切成哪些 token。每张卡片是一个 token，下面的小数字是它的编号（id）。',
  en: 'Type English text and see the tokens. Each card is one token; the small number is its id.',
};

const DEMO_NOTE = {
  zh: '这里只用一个很小的手写词表，从左往右每次取能匹配的最长片段（贪心最长匹配）。真实 LLM 的分词器是从大量文字里学出来的，切法和编号都会不一样。',
  en: 'This toy uses a tiny hand-written vocabulary and greedy longest match. Real tokenizers learn their pieces from huge amounts of text.',
};

const SLIDE_QUOTE = [
  {
    en: 'Tokenization is the first step in responding to a prompt. It breaks up words into smaller pieces that still convey meaning.',
    zh: '分词是 LLM 回应提示词的第一步：把单词拆成更小、但仍然带有意思的片段。',
  },
  {
    en: 'This allows the machine to easily notice the similarity in closely-related words.',
    zh: '这样机器就容易注意到关系很近的词之间的相似之处。',
  },
];

const KINDS = [
  { kind: 'word', zh: '整词', en: 'whole word' },
  { kind: 'piece', zh: '子词片段', en: 'subword piece' },
  { kind: 'letter', zh: '单个字母（生词拆到最小）', en: 'single letter' },
  { kind: 'punct', zh: '标点或数字', en: 'punctuation or digit' },
  { kind: 'unknown', zh: '词表里没有', en: 'not in the vocabulary' },
];

const KIND_LABELS = Object.fromEntries(KINDS.map((item) => [item.kind, `${item.zh} ${item.en}`]));
KIND_LABELS.digit = KIND_LABELS.punct;

const VOCAB_TITLES = {
  punct: '标点 Punctuation',
  digit: '数字 Digits',
  suffix: '后缀 Suffixes',
  prefix: '前缀 Prefixes',
  stem: '词根 Stems',
  word: '整词 Whole words',
  letter: '字母（兜底）Letters (fallback)',
};

let instanceCount = 0;

function teachPair(value, className, role = 'teach') {
  return h('div', { class: ['tokenizer-toy__pair', className] },
    zhNode(value.zh, role, 'p', 'tokenizer-toy__zh'),
    enNode(value.en, 'p', 'tokenizer-toy__en'));
}

// The kind is also spoken and shown by shape (see the CSS), not by background colour alone.
// token 的种类除了底色，还会被读出来，并用形状区分（见 CSS）。
function chip(token) {
  const kind = token.kind === 'digit' ? 'punct' : token.kind;
  return h('li', { class: ['tokenizer-toy__chip', `tokenizer-toy__chip--${kind}`], title: KIND_LABELS[token.kind] },
    h('span', { class: 'tokenizer-toy__chip-text', lang: 'en' }, token.text),
    h('span', { class: 'visually-hidden' }, `（${KIND_LABELS[token.kind]}）`),
    h('span', { class: 'tokenizer-toy__chip-id' },
      h('span', { class: 'visually-hidden' }, '编号 id '),
      token.id === null ? '?' : String(token.id)));
}

function wordItem(segment) {
  const split = segment.tokens.length > 1;
  return h('li', { class: ['tokenizer-toy__word', split ? 'tokenizer-toy__word--split' : null] },
    h('ol', {
      class: 'tokenizer-toy__chips',
      'aria-label': split ? `${segment.text}: ${segment.tokens.length} 个 token tokens` : undefined,
    }, segment.tokens.map(chip)),
    split ? h('span', { class: 'tokenizer-toy__source', lang: 'en', 'aria-hidden': 'true' }, segment.text) : null);
}

function legendChip(kind) {
  return h('span', { class: 'tokenizer-toy__legend-item' },
    h('span', { class: ['tokenizer-toy__legend-chip', `tokenizer-toy__chip--${kind}`], 'aria-hidden': 'true' }),
    KIND_LABELS[kind]);
}

function vocabularyPanel() {
  return h('details', { class: 'tokenizer-toy__vocab' },
    h('summary', { class: 'tokenizer-toy__vocab-summary' }, '看玩具词表 Show the toy vocabulary'),
    h('div', { class: 'tokenizer-toy__vocab-body' },
      vocabularyGroups().map((group) => h('div', { class: 'tokenizer-toy__vocab-group' },
        h('h5', { class: 'tokenizer-toy__vocab-title' }, VOCAB_TITLES[group.kind] || group.kind),
        h('ul', { class: 'tokenizer-toy__vocab-list' }, group.pieces.map((piece) => h('li', { class: 'tokenizer-toy__vocab-item' },
          h('code', { lang: 'en' }, piece.text),
          h('span', { class: 'tokenizer-toy__vocab-id' }, String(piece.id)))))))));
}

export async function mount(container, config, context) {
  await ensureStylesheet(new URL('./tokenizer-toy.css', import.meta.url));
  instanceCount += 1;
  const uid = `tokenizer-toy-${instanceCount}`;
  const configured = typeof config?.text === 'string' && config.text.trim() ? config.text : DEFAULT_TEXT;
  const initialText = configured.slice(0, MAX_INPUT);
  let announceTimer = null;

  const input = h('input', {
    type: 'text',
    id: `${uid}-input`,
    class: 'input tokenizer-toy__input',
    maxlength: MAX_INPUT,
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    lang: 'en',
  });
  input.value = initialText;

  const words = h('ol', { class: 'tokenizer-toy__words', 'aria-label': '切分结果 Tokens' });
  const count = h('p', { class: 'tokenizer-toy__count' });
  const slash = h('p', { class: 'tokenizer-toy__slash', lang: 'en' });
  const compare = h('div', { class: 'tokenizer-toy__compare' });
  const shared = h('div', { class: 'tokenizer-toy__shared' });
  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });

  function render() {
    const text = input.value;
    const result = tokenize(text);
    if (!result.tokenCount) {
      replaceContent(words);
      replaceContent(count, '输入一些英文看看 Type some English to see the tokens');
      replaceContent(slash);
      replaceContent(compare);
      replaceContent(shared);
      return result;
    }
    replaceContent(words, result.segments.map(wordItem));
    const wordCount = result.segments.filter((segment) => segment.kind === 'word').length;
    const symbolCount = result.segments.length - wordCount;
    const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    replaceContent(count,
      h('strong', { class: 'tokenizer-toy__count-number' }, String(result.tokenCount)),
      ` 个 token tokens（来自 ${wordCount} 个单词 + ${symbolCount} 个符号 from ${plural(wordCount, 'word')} + ${plural(symbolCount, 'symbol')}）`);
    // Zero-width break opportunities after each slash let long notations wrap. 斜线后留换行机会，长句也能折行。
    replaceContent(slash, result.tokens.map((token, index) => (index ? ['/', h('wbr'), token.text] : token.text)));
    const characters = characterCount(text);
    replaceContent(compare, teachPair({
      zh: `对比 p.46：如果按单个字母切，要 ${characters} 块，而且单个字母本身没有意思。`,
      en: `Compare p.46: splitting into single characters gives ${characters} pieces, and one letter carries no meaning by itself.`,
    }));
    const common = sharedPieces(result);
    replaceContent(shared, common.length
      ? h('div', { class: 'callout callout--tip tokenizer-toy__shared-box' },
        h('p', { class: 'tokenizer-toy__shared-title' }, '共用的 token Shared tokens'),
        h('ul', { class: 'tokenizer-toy__shared-list' }, common.slice(0, 4).map((item) => h('li', {},
          h('code', { lang: 'en' }, item.text),
          ` → ${item.words.join(', ')}`))),
        teachPair({
          zh: '这些词共用同一个 token，机器就容易看出它们是相关的词（p.45）。',
          en: 'Sharing a token helps the machine notice that these words are related.',
        }))
      : null);
    return result;
  }

  function scheduleAnnouncement(result) {
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      live.textContent = result.tokenCount ? `${result.tokenCount} 个 token tokens: ${slashNotation(result)}` : '';
    }, 600);
  }

  input.addEventListener('input', () => scheduleAnnouncement(render()));

  const presetButtons = PRESETS.map((preset) => button({
    label: preset.label,
    size: 'sm',
    onClick: () => {
      input.value = preset.text;
      scheduleAnnouncement(render());
    },
  }));

  const titleId = `${uid}-title`;
  const root = h('section', { class: 'tokenizer-toy', 'aria-labelledby': titleId },
    h('header', { class: 'tokenizer-toy__header' },
      h('span', { class: 'tokenizer-toy__eyebrow' }, '互动演示 Interactive'),
      h('h3', { class: 'tokenizer-toy__title', id: titleId }, biTitle({ zh: '分词：把词切成 token', en: 'Tokenization' })),
      teachPair(INTRO, 'tokenizer-toy__intro')),
    h('div', { class: 'tokenizer-toy__demo-note', role: 'note' },
      h('p', { class: 'tokenizer-toy__demo-title' }, '简化演示 Simplified demo — real tokenizers are learned from data'),
      teachPair(DEMO_NOTE)),
    h('div', { class: 'tokenizer-toy__field' },
      h('label', { class: 'tokenizer-toy__label', for: input.id }, '输入英文句子 Type an English sentence'),
      input,
      h('div', { class: 'tokenizer-toy__presets', role: 'group', 'aria-label': '例子 Examples' }, presetButtons)),
    h('div', { class: 'tokenizer-toy__result' },
      h('h4', { class: 'tokenizer-toy__subheading' }, biTitle({ zh: '切分结果', en: 'Tokens' })),
      count,
      words,
      h('div', { class: 'tokenizer-toy__slash-box' },
        h('span', { class: 'tokenizer-toy__slash-label' }, '课件写法 Slide notation'),
        slash),
      h('div', { class: 'tokenizer-toy__legend' }, ['word', 'piece', 'letter', 'punct', 'unknown'].map(legendChip))),
    compare,
    shared,
    h('div', { class: 'tokenizer-toy__quote' },
      h('span', { class: 'tokenizer-toy__quote-label' }, '课件原话 Course wording (p.45)'),
      SLIDE_QUOTE.map((line) => h('div', { class: 'tokenizer-toy__quote-line' },
        enNode(line.en, 'p', 'tokenizer-toy__quote-en'),
        zhNode(line.zh, 'gloss', 'p', 'tokenizer-toy__quote-zh')))),
    vocabularyPanel(),
    live);

  render();
  replaceContent(container, root);
  return () => window.clearTimeout(announceTimer);
}
