/**
 * Hides the English answer inside a Chinese prompt for "ZH to EN" recall cards, because many
 * Chinese names and explanations quote the English term, e.g. "Minimax（极小化极大算法）".
 * 在“中→英”回想卡的中文提示里遮住英文答案：很多中文名称和解释会直接写出英文术语，
 * 例如 "Minimax（极小化极大算法）"。
 *
 * DOM-free.
 * 不依赖 DOM。
 */
import { stripMarkup } from '../../../core/text/inline-markup.js';

export const MASK = '＿＿＿';

const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const SEPARATORS = /[\s_\-‐-―−]+/;

/**
 * Spellings of the English answer worth hiding, longest first: the full name, the name without
 * brackets, each bracketed alias and each "/" part. Pieces without Latin letters or digits are skipped.
 * 需要遮住的英文答案写法，按长度从长到短：完整名称、去掉括号的名称、括号里的别名，以及 "/" 分隔的各部分；
 * 不含拉丁字母或数字的片段会被跳过。
 */
export function answerVariants(termEn) {
  const text = stripMarkup(termEn).normalize('NFKC');
  const aliases = [];
  const base = text.replace(/\(([^()]*)\)/g, (match, alias) => {
    aliases.push(alias);
    return ' ';
  });
  const pieces = [text, base, ...aliases]
    .flatMap((piece) => [piece, ...piece.split('/')])
    .map((piece) => piece.replace(/\s+/g, ' ').trim())
    .filter((piece) => piece.length >= 2 && /[A-Za-z0-9]/.test(piece));
  return [...new Set(pieces)].sort((a, b) => b.length - a.length);
}

/**
 * Replaces whole-word, case-insensitive occurrences of the English answer (and its plural)
 * with MASK. Spaces, hyphens and underscores inside the answer match each other.
 * 把英文答案（含复数形式）按整词、不区分大小写替换为 MASK；答案中的空格、连字符与下划线可互相匹配。
 */
export function maskAnswer(text, termEn) {
  const source = typeof text === 'string' ? text : '';
  const variants = answerVariants(termEn);
  if (!source || !variants.length) return source;
  const alternatives = variants.map((variant) => variant
    .split(SEPARATORS)
    .filter(Boolean)
    .map((word) => word.replace(REGEXP_SPECIAL, '\\$&'))
    .join('[\\s_\\-]+'));
  // A captured leading character stands in for a lookbehind, which older Safari versions lack.
  // 用捕获前一个字符代替后行断言，因为旧版 Safari 不支持后行断言。
  const pattern = new RegExp(`(^|[^A-Za-z0-9])(?:${alternatives.join('|')})(?:e?s)?(?![A-Za-z0-9])`, 'gi');
  return source.replace(pattern, (match, lead) => `${lead}${MASK}`);
}

/**
 * True when a masked prompt still has something to read besides blanks and punctuation.
 * 遮挡后的提示除了空白和标点之外仍有可读内容时返回 true。
 */
export function hasVisibleClue(text) {
  if (typeof text !== 'string') return false;
  return text.split(MASK).join('').replace(/[\s\p{P}\p{S}]/gu, '').length > 0;
}
