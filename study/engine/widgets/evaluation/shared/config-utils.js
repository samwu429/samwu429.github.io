/**
 * Defensive readers for widget configs written by content authors.
 * 读取内容作者编写的组件配置时使用的防御性工具。
 *
 * Content is data and may be incomplete, so every reader falls back to a safe default
 * instead of throwing. DOM-free.
 * 内容只是数据，可能不完整，因此每个读取函数都回退到安全默认值而不是抛出异常；不依赖 DOM。
 */

const HAN = /[㐀-鿿]/;

/**
 * Returns a bilingual value { zh, en }. A plain string is accepted and placed by script
 * (Chinese characters go to zh); anything unusable yields the fallback.
 * 返回 { zh, en } 双语值。也接受普通字符串（含汉字放入 zh，否则放入 en）；无法使用时返回后备值。
 */
export function toBi(value, fallback = { zh: '', en: '' }) {
  if (typeof value === 'string' && value.trim()) {
    return HAN.test(value) ? { zh: value, en: '' } : { zh: '', en: value };
  }
  if (value && typeof value === 'object') {
    const zh = typeof value.zh === 'string' ? value.zh : '';
    const en = typeof value.en === 'string' ? value.en : '';
    if (zh.trim() || en.trim()) return { zh, en };
  }
  return { ...fallback };
}

// Only numbers and numeric strings count. Number(null), Number('') and Number(false) are all 0, which
// would quietly turn a blank config field into the minimum instead of the default.
// 只接受数字和数字字符串。Number(null)、Number('')、Number(false) 都是 0，否则空着的配置项会悄悄变成最小值而不是默认值。
function readNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const number = Number(value.trim());
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

export function clampInteger(value, min, max, fallback) {
  const number = readNumber(value);
  if (number === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function clampNumber(value, min, max, fallback) {
  const number = readNumber(value);
  if (number === null) return fallback;
  return Math.min(max, Math.max(min, number));
}

/** Spreadsheet-style letter for the index-th item: 0 -> A, 1 -> B. 第 index 项的字母编号。 */
export function letterFor(index) {
  return String.fromCharCode(65 + (index % 26));
}
