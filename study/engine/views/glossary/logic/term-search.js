/**
 * Glossary search: text normalisation, term-name variants and relevance scoring.
 * 术语搜索：文本归一化、术语名变体与相关度打分。
 *
 * DOM-free, so the rules can be tested with node --test.
 * 不依赖 DOM，可直接用 node --test 测试。
 */
import { stripMarkup } from '../../../core/text/inline-markup.js';

/**
 * Relevance tiers returned by matchScore; higher is better, 0 means no match.
 * matchScore 返回的相关度分档；越高越相关，0 表示不匹配。
 */
export const SCORE = Object.freeze({
  EXACT: 100,
  PREFIX: 80,
  WORD: 70,
  NAME: 60,
  NAME_WORDS: 50,
  DEFINITION: 30,
  EXAMPLE: 10,
  NONE: 0,
});

/** Score given to every term when the query is empty. 查询为空时每个术语得到的分数。 */
export const EMPTY_QUERY_SCORE = 1;

const DASHES = /[‐-―−]/g;
const PARENTHESES = /\(([^()]*)\)/g;
const LATIN_START = /^[a-z0-9]/;
const LATIN_CHAR = /[a-z0-9]/;

/**
 * Lower-cases, folds full-width characters (NFKC), drops inline markup and treats - and _ as spaces,
 * so "Three-in-a-row", "three_in_a_row" and "THREE IN A ROW" compare equal.
 * 转小写、用 NFKC 把全角字符折叠为半角、去掉行内标记，并把 - 和 _ 视为空格，
 * 使 "Three-in-a-row"、"three_in_a_row" 与 "THREE IN A ROW" 等价。
 */
export function normalizeText(value) {
  return stripMarkup(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(DASHES, '-')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalised ways to name a term: the full name, the name without its brackets, each bracketed
 * alias and each part separated by "/". "State tree (game tree)" gives "state tree", "game tree", ...
 * 术语名的各种归一化写法：完整名称、去掉括号后的名称、括号里的别名，以及用 "/" 分隔的各部分。
 */
export function nameVariants(name) {
  const text = stripMarkup(name).normalize('NFKC');
  if (!text.trim()) return [];
  const aliases = [];
  const base = text.replace(PARENTHESES, (match, alias) => {
    aliases.push(alias);
    return ' ';
  });
  const pieces = [text, base, ...aliases].flatMap((piece) => [piece, ...piece.split('/')]);
  return unique(pieces.map(normalizeText).filter(Boolean));
}

/**
 * Precomputes the normalised text of one term so each keystroke only does substring checks.
 * 预先计算单个术语的归一化文本，使每次输入只需做子串比较。
 */
export function buildSearchEntry(term) {
  const source = term && typeof term === 'object' ? term : {};
  return {
    names: unique([...nameVariants(source.en), ...nameVariants(source.zh), normalizeText(source.id)].filter(Boolean)),
    details: normalizeText(joinBilingual(source.def)),
    extra: normalizeText(joinBilingual(source.example)),
  };
}

/**
 * Scores one prepared entry against an already normalised query (see SCORE for the tiers).
 * Every query word must appear somewhere; matches in the term name rank above matches in
 * the definition, which rank above matches in the example.
 * 用已归一化的查询给一个术语打分（分档见 SCORE）。查询中的每个词都必须出现；
 * 命中术语名的排在命中定义的前面，命中定义的又排在只命中例子的前面。
 */
export function matchScore(entry, query) {
  if (!query) return EMPTY_QUERY_SCORE;
  if (!entry) return SCORE.NONE;
  const names = entry.names || [];
  if (names.includes(query)) return SCORE.EXACT;
  if (names.some((name) => name.startsWith(query))) return SCORE.PREFIX;
  if (LATIN_START.test(query) && names.some((name) => startsAtWord(name, query))) return SCORE.WORD;
  if (names.some((name) => name.includes(query))) return SCORE.NAME;

  const words = query.split(' ').filter(Boolean);
  const details = entry.details || '';
  const extra = entry.extra || '';
  const inNames = (word) => names.some((name) => name.includes(word));
  if (words.every(inNames)) return SCORE.NAME_WORDS;
  if (words.every((word) => inNames(word) || details.includes(word))) return SCORE.DEFINITION;
  if (words.every((word) => inNames(word) || details.includes(word) || extra.includes(word))) return SCORE.EXAMPLE;
  return SCORE.NONE;
}

// True when the query occurs at the start of a word, e.g. "tree" in "state tree" but not in "street".
// 查询出现在某个单词开头时为真，例如 "state tree" 中的 "tree"，而 "street" 不算。
function startsAtWord(text, query) {
  let index = text.indexOf(query);
  while (index !== -1) {
    if (index === 0 || !LATIN_CHAR.test(text[index - 1])) return true;
    index = text.indexOf(query, index + 1);
  }
  return false;
}

function joinBilingual(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return [value.en, value.zh].filter((part) => typeof part === 'string').join(' ');
}

function unique(values) {
  return [...new Set(values)];
}
