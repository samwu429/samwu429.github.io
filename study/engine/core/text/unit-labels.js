/**
 * The one place that names course units: "第 3 讲 / Lecture 3 / Lec 3", "实验 2 / Lab 2 / Lab 2".
 * Views format these parts for their own needs. DOM-free.
 * 课程单元命名的唯一来源：“第 3 讲 / Lecture 3 / Lec 3”“实验 2 / Lab 2 / Lab 2”。各视图按需组合这些部分。不依赖 DOM。
 */

const KINDS = Object.freeze({
  lecture: Object.freeze({ zh: (number) => `第 ${number} 讲`, zhBare: '讲课', en: 'Lecture', short: 'Lec' }),
  lab: Object.freeze({ zh: (number) => `实验 ${number}`, zhBare: '实验', en: 'Lab', short: 'Lab' }),
  tutorial: Object.freeze({ zh: (number) => `辅导 ${number}`, zhBare: '辅导', en: 'Tutorial', short: 'Tut' }),
  workshop: Object.freeze({ zh: (number) => `工作坊 ${number}`, zhBare: '工作坊', en: 'Workshop', short: 'Wks' }),
});

/** The unit number as a positive integer (numeric strings allowed), otherwise null. 单元编号（正整数，允许数字字符串），否则为 null。 */
export function unitNumber(unit) {
  const raw = unit?.number;
  if (raw === null || raw === undefined || raw === '') return null;
  const number = Number(raw);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * Names of a unit from course.json:
 *   zh, en   - "第 3 讲" / "Lecture 3"; a known kind without a number gives "讲课" / "Lecture";
 *              anything else gives the unit id (or `fallbackId`)
 *   short    - "Lec 3"; without a known kind and number, the upper-cased id
 *   known    - true when the kind is a lecture, lab, tutorial or workshop
 *   numbered - true when the kind is known and the unit has a number
 * 单元的名称：zh、en 为“第 3 讲”/“Lecture 3”，已知类型但没有编号时为“讲课”/“Lecture”，其他情况为单元 id（或 fallbackId）；
 * short 为“Lec 3”，没有已知类型与编号时为大写的 id；known 表示类型已知；numbered 表示类型已知且有编号。
 */
export function unitLabels(unit, fallbackId = '') {
  const id = String((unit && typeof unit === 'object' ? unit.id : null) || fallbackId || '');
  const kind = unit && typeof unit === 'object' && Object.hasOwn(KINDS, unit.kind) ? KINDS[unit.kind] : null;
  const number = kind ? unitNumber(unit) : null;
  if (kind && number !== null) {
    return { zh: kind.zh(number), en: `${kind.en} ${number}`, short: `${kind.short} ${number}`, known: true, numbered: true };
  }
  if (kind) return { zh: kind.zhBare, en: kind.en, short: id.toUpperCase(), known: true, numbered: false };
  return { zh: id, en: id, short: id.toUpperCase(), known: false, numbered: false };
}

/** Just the { zh, en } pair of unitLabels(), for bilingual titles and links. 只取 unitLabels() 的 { zh, en }，用于双语标题与链接。 */
export function unitName(unit, fallbackId = '') {
  const { zh, en } = unitLabels(unit, fallbackId);
  return { zh, en };
}
