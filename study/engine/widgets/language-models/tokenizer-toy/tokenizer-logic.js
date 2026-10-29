/**
 * Toy subword tokenizer: a small hand-written vocabulary plus greedy longest-match from the left.
 * Real LLM tokenizers learn their vocabulary from data; this one only illustrates the idea
 * ("daydreamed" -> day / dream / ed). DOM-free.
 * 玩具版子词分词器：一个很小的手写词表，加上从左到右的“贪心最长匹配”。真实 LLM 的分词器是从数据中学出词表的，
 * 这里只用来说明思路（"daydreamed" -> day / dream / ed）。不依赖 DOM。
 */

const PUNCTUATION = ['.', ',', '!', '?', ';', ':', "'", '"', '(', ')', '-', '/', '&', '%', '$', '#', '@', '+', '=', '*', '<', '>', '[', ']', '_'];
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SUFFIXES = ['s', 'es', 'ed', 'ing', 'er', 'est', 'ly', 'ness', 'ful', 'less', 'able', 'ment', 'tion', "'s", "'t", "n't", "'re", "'ll", "'ve", "'m", "'d"];
const PREFIXES = ['un', 're', 'dis', 'mis', 'pre', 'non'];
const STEMS = [
  'day', 'dream', 'jump', 'play', 'walk', 'talk', 'read', 'learn', 'teach', 'think', 'help', 'work',
  'look', 'want', 'need', 'love', 'like', 'happy', 'kind', 'use', 'train', 'predict', 'count', 'light',
  'rain', 'night', 'friend', 'sandwich', 'pizza', 'order', 'answer', 'question', 'label', 'plot', 'word',
  'token', 'test', 'paint', 'cook', 'clean', 'open', 'fair', 'care', 'hope',
];
const WORDS = [
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'i', 'you', 'he', 'she', 'we',
  'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their', 'what', 'which', 'who',
  'how', 'why', 'when', 'where', 'not', 'no', 'yes', 'do', 'does', 'did', 'have', 'has', 'had', 'can',
  'will', 'would', 'should', 'could', 'all', 'one', 'some', 'many', 'more', 'most', 'very', 'so', 'if',
  'then', 'than', 'there', 'here', 'up', 'out', 'about', 'into', 'over', 'under', 'after', 'before',
  'always', 'never', 'real', 'until', 'unit', 'student', 'class', 'teacher', 'school', 'lesson', 'lunch',
  'cat', 'dog', 'mat', 'sat', 'sit', 'car', 'wash', 'game', 'book', 'home', 'time', 'let', 'make', 'simple',
  'axes', 'height', 'width', 'soup', 'tacos', 'salad', 'pasta', 'sushi', 'nothing', 'model', 'data',
  'computer', 'machine', 'network', 'brain', 'neuron', 'language', 'exam', 'idea', 'good', 'new', 'big',
];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const GROUPS = [
  ['punct', PUNCTUATION],
  ['digit', DIGITS],
  ['suffix', SUFFIXES],
  ['prefix', PREFIXES],
  ['stem', STEMS],
  ['word', WORDS],
  ['letter', LETTERS],
];

/**
 * Builds the lookup table; ids follow list order and the first occurrence of a piece wins.
 * 建立查找表；编号按列表顺序分配，同一片段只保留第一次出现。
 */
export function buildVocabulary(groups = GROUPS) {
  const entries = new Map();
  for (const [kind, pieces] of groups) {
    for (const piece of pieces) {
      if (!entries.has(piece)) entries.set(piece, { piece, kind, id: entries.size + 1 });
    }
  }
  const longest = Math.max(...[...entries.keys()].map((piece) => piece.length));
  return { entries, longest };
}

export const TOY_VOCABULARY = buildVocabulary();

export const MAX_TEXT_LENGTH = 400;

// Words may contain inner apostrophes (let's, don't); digits and other symbols stand alone.
// 单词可以包含中间的撇号（let's、don't）；数字与其他符号各自单独成段。
const SEGMENT = /[A-Za-z]+(?:['’][A-Za-z]+)*|\d|\S/gu;

export function splitSegments(text) {
  const source = String(text ?? '').slice(0, MAX_TEXT_LENGTH);
  return [...source.matchAll(SEGMENT)].map((match) => {
    const value = match[0];
    let kind = 'symbol';
    if (/^[A-Za-z]/.test(value)) kind = 'word';
    else if (/^\d$/.test(value)) kind = 'digit';
    return { text: value, kind };
  });
}

function displayKind(entry, tokenText, segment) {
  if (!entry) return 'unknown';
  if (entry.kind === 'punct' || entry.kind === 'digit') return entry.kind;
  if (tokenText.length === segment.text.length) return 'word';
  if (entry.kind === 'letter' || (entry.kind === 'word' && tokenText.length === 1)) return 'letter';
  return 'piece';
}

/**
 * Greedy longest match inside one segment: at each position take the longest vocabulary piece;
 * a character missing from the vocabulary becomes an "unknown" token.
 * 在一个片段内做贪心最长匹配：每个位置取词表中最长的片段；词表里没有的字符变成“未知” token。
 */
export function tokenizeSegment(segment, vocabulary = TOY_VOCABULARY) {
  const chars = [...segment.text];
  const lower = chars.map((char) => (char === '’' ? "'" : char.toLowerCase()));
  const tokens = [];
  let position = 0;
  while (position < chars.length) {
    let taken = null;
    const maxLength = Math.min(vocabulary.longest, chars.length - position);
    for (let length = maxLength; length >= 1; length -= 1) {
      const entry = vocabulary.entries.get(lower.slice(position, position + length).join(''));
      if (entry) {
        taken = { entry, length };
        break;
      }
    }
    const length = taken ? taken.length : 1;
    const text = chars.slice(position, position + length).join('');
    tokens.push({
      text,
      id: taken ? taken.entry.id : null,
      kind: displayKind(taken?.entry, text, { text: segment.text }),
    });
    position += length;
  }
  return tokens;
}

/**
 * Tokenizes a whole text. Spaces separate segments and are not tokens, as on the slide
 * ("The/student/day/dream/ed/in/class/.").
 * 对整段文字分词。空格只用于分隔，本身不算 token，与课件写法一致。
 */
export function tokenize(text, vocabulary = TOY_VOCABULARY) {
  const segments = splitSegments(text).map((segment) => ({
    ...segment,
    tokens: tokenizeSegment(segment, vocabulary),
  }));
  const tokens = segments.flatMap((segment) => segment.tokens);
  return { segments, tokens, tokenCount: tokens.length };
}

export function slashNotation(result) {
  return result.tokens.map((token) => token.text).join('/');
}

// Pieces if the text were cut into single characters (spaces excluded). 按单个字符切分时的块数（不计空格）。
export function characterCount(text) {
  return [...String(text ?? '').slice(0, MAX_TEXT_LENGTH)].filter((char) => !/\s/u.test(char)).length;
}

/**
 * Tokens shared by two or more different words, e.g. "jump" in jump / jumps / jumping / jumped.
 * 被两个及以上不同单词共用的 token，例如 jump、jumps、jumping、jumped 中的 "jump"。
 */
export function sharedPieces(result) {
  const byId = new Map();
  for (const segment of result.segments) {
    if (segment.kind !== 'word') continue;
    const word = segment.text.toLowerCase();
    for (const token of segment.tokens) {
      if (token.id === null || (token.kind !== 'word' && token.kind !== 'piece')) continue;
      const key = token.id;
      if (!byId.has(key)) byId.set(key, { text: token.text.toLowerCase(), id: token.id, words: [] });
      const item = byId.get(key);
      if (!item.words.includes(word)) item.words.push(word);
    }
  }
  return [...byId.values()]
    .filter((item) => item.words.length >= 2)
    .sort((a, b) => b.words.length - a.words.length || a.id - b.id);
}

/**
 * Vocabulary grouped by kind, for the "show the toy vocabulary" panel.
 * 按类别分组的词表，供“查看玩具词表”面板使用。
 */
export function vocabularyGroups(vocabulary = TOY_VOCABULARY) {
  const groups = new Map();
  for (const entry of vocabulary.entries.values()) {
    if (!groups.has(entry.kind)) groups.set(entry.kind, []);
    groups.get(entry.kind).push({ text: entry.piece, id: entry.id });
  }
  return [...groups.entries()].map(([kind, pieces]) => ({ kind, pieces }));
}
