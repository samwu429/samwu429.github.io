/**
 * Splits mixed Chinese and English text into runs by script, so each run can carry its own `lang`
 * and language-mode role. Digits, spaces and punctuation (full-width Chinese punctuation included)
 * are neutral and join a neighbouring run. DOM-free.
 * 按文字系统把中英混排的文本拆成若干段，让每段带上自己的 lang 与语言模式角色。数字、空格与标点
 * （包括中文全角标点）是中性字符，并入相邻的段。不依赖 DOM。
 */

// Han ideographs plus the full-width digits and letters a Chinese input method types.
// 汉字，以及中文输入法打出的全角数字与字母。
const HAN = /[㐀-䶿一-鿿豈-﫿０-９Ａ-Ｚａ-ｚ\u{20000}-\u{2fa1f}]/u;
const LATIN = /[A-Za-zÀ-ÖØ-öø-ɏ]/;
const OPENING = /[([{“‘（［｛《〈「『【〔]/;

/** 'zh', 'en', or null for a neutral character. 返回 'zh'、'en'，中性字符返回 null。 */
export function scriptOf(char) {
  if (HAN.test(char)) return 'zh';
  if (LATIN.test(char)) return 'en';
  return null;
}

/**
 * Which scripts a text uses: 'zh', 'en', 'mixed', or null when it has neither (numbers, symbols).
 * 文本用到的文字系统：'zh'、'en'、'mixed'；两者都没有（只有数字或符号）时返回 null。
 */
export function scriptMix(text) {
  let zh = false;
  let en = false;
  for (const char of String(text ?? '')) {
    const script = scriptOf(char);
    if (script === 'zh') zh = true;
    else if (script === 'en') en = true;
    if (zh && en) return 'mixed';
  }
  if (zh) return 'zh';
  return en ? 'en' : null;
}

// Where a trailing group of opening brackets and quotes starts, so it moves to the run it opens.
// 末尾连续的左括号与左引号从哪里开始；这部分归入它所开启的那一段。
function openingStart(pending) {
  let index = pending.length;
  while (index > 0 && OPENING.test(pending[index - 1])) index -= 1;
  return index;
}

/**
 * Runs of [{ text, script }] whose texts join back into the input. Neutral characters between two
 * runs stay with the earlier one, except opening brackets and quotes; a text without letters is one
 * run with script null.
 * 返回 [{ text, script }]，各段文字拼起来就是原文。两段之间的中性字符归前一段，左括号与左引号除外；
 * 没有任何字母的文本整体作为一段，script 为 null。
 */
export function scriptRuns(text) {
  const runs = [];
  let current = null;
  let pending = '';
  for (const char of String(text ?? '')) {
    const script = scriptOf(char);
    if (!script) {
      pending += char;
    } else {
      if (!current) {
        current = { text: pending + char, script };
      } else if (current.script === script) {
        current.text += pending + char;
      } else {
        const split = openingStart(pending);
        current.text += pending.slice(0, split);
        runs.push(current);
        current = { text: pending.slice(split) + char, script };
      }
      pending = '';
    }
  }
  if (current) {
    current.text += pending;
    runs.push(current);
  } else if (pending) {
    runs.push({ text: pending, script: null });
  }
  return runs;
}
