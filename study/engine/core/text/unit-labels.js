/**
 * The one place that names course units and their kinds: "第 3 讲 / Lecture 3 / Lec 3",
 * "模块 2 / Module 2 / Mod 2", "实验 2 / Lab 2 / Lab 2", plus the group title of each kind and the
 * order in which groups are shown. Views format these parts for their own needs. DOM-free.
 * 课程单元及其类型命名的唯一来源：“第 3 讲 / Lecture 3 / Lec 3”“模块 2 / Module 2 / Mod 2”“实验 2 / Lab 2 / Lab 2”，
 * 以及每类单元的分组标题和分组的显示顺序。各视图按需组合这些部分。不依赖 DOM。
 */

// zh, zhBare, en and short name a single unit; group is the title of a list of such units; zhWhich
// asks which units of the kind, as in 真实测验考哪几讲.
// zh、zhBare、en、short 用于称呼单个单元；group 是这类单元成组时的标题；zhWhich 用于询问是哪几个这类单元，如“真实测验考哪几讲”。
const KINDS = Object.freeze({
  lecture: Object.freeze({
    zh: (number) => `第 ${number} 讲`, zhBare: '讲课', en: 'Lecture', short: 'Lec',
    group: Object.freeze({ zh: '讲课', en: 'Lectures' }), zhWhich: '哪几讲',
  }),
  module: Object.freeze({
    zh: (number) => `模块 ${number}`, zhBare: '模块', en: 'Module', short: 'Mod',
    group: Object.freeze({ zh: '模块', en: 'Modules' }), zhWhich: '哪几个模块',
  }),
  lab: Object.freeze({
    zh: (number) => `实验 ${number}`, zhBare: '实验', en: 'Lab', short: 'Lab',
    group: Object.freeze({ zh: '实验', en: 'Labs' }), zhWhich: '哪几个实验',
  }),
  tutorial: Object.freeze({
    zh: (number) => `辅导 ${number}`, zhBare: '辅导', en: 'Tutorial', short: 'Tut',
    group: Object.freeze({ zh: '辅导', en: 'Tutorials' }), zhWhich: '哪几次辅导',
  }),
  workshop: Object.freeze({
    zh: (number) => `工作坊 ${number}`, zhBare: '工作坊', en: 'Workshop', short: 'Wks',
    group: Object.freeze({ zh: '工作坊', en: 'Workshops' }), zhWhich: '哪几次工作坊',
  }),
});

/** Known unit kinds in the order their groups are shown; any other kind comes after them. 已知单元类型的分组显示顺序；其他类型排在它们之后。 */
export const KIND_ORDER = Object.freeze(['lecture', 'module', 'lab', 'tutorial', 'workshop']);

/** Group kind of every unit whose kind is unknown or missing. 类型未知或缺失的单元所在分组的类型名。 */
export const OTHER_KIND = 'other';

const OTHER_TITLE = Object.freeze({ zh: '其他', en: 'Other' });

// Lectures and modules carry the teaching of a course; labs, tutorials and workshops accompany them.
// 讲课与模块承载课程的主要教学；实验、辅导与工作坊是配套单元。
const MAIN_KINDS = Object.freeze(['lecture', 'module']);

/** The unit number as a positive integer (numeric strings allowed), otherwise null. 单元编号（正整数，允许数字字符串），否则为 null。 */
export function unitNumber(unit) {
  const raw = unit?.number;
  if (raw === null || raw === undefined || raw === '') return null;
  const number = Number(raw);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/** True for the kinds named here: lecture, module, lab, tutorial and workshop. 是否为这里能命名的已知类型（讲课、模块、实验、辅导、工作坊）。 */
export function isKnownKind(kind) {
  return Object.hasOwn(KINDS, kind);
}

/** True for the main teaching units, lectures and modules. 是否为主要教学单元（讲课或模块）。 */
export function isMainKind(kind) {
  return MAIN_KINDS.includes(kind);
}

/**
 * Plural title of a group of units, e.g. { zh: '讲课', en: 'Lectures' }; unknown kinds share { zh: '其他', en: 'Other' }.
 * 一组单元的标题（复数），例如 { zh: '讲课', en: 'Lectures' }；未知类型共用 { zh: '其他', en: 'Other' }。
 */
export function kindGroupTitle(kind) {
  return isKnownKind(kind) ? KINDS[kind].group : OTHER_TITLE;
}

/**
 * Chinese words asking which units of a kind, e.g. '哪几讲', '哪几个模块'; unknown kinds give '哪些单元'.
 * 询问“哪几个这类单元”的中文说法，例如“哪几讲”“哪几个模块”；未知类型为“哪些单元”。
 */
export function whichUnitsZh(kind) {
  return isKnownKind(kind) ? KINDS[kind].zhWhich : '哪些单元';
}

/**
 * Units grouped by kind in display order: one group per known kind (KIND_ORDER), then one OTHER_KIND
 * group for every unit of an unknown or missing kind. Units keep their given order inside a group;
 * entries that are not objects and empty groups are left out. Returns [{ kind, units }].
 * 按显示顺序把单元按类型分组：每种已知类型一组（KIND_ORDER），类型未知或缺失的单元合成最后的 OTHER_KIND 组。
 * 组内保持传入的顺序；非对象条目与空组会被去掉。返回 [{ kind, units }]。
 */
export function groupByKind(units) {
  const groups = [...KIND_ORDER, OTHER_KIND].map((kind) => ({ kind, units: [] }));
  for (const unit of Array.isArray(units) ? units : []) {
    if (!unit || typeof unit !== 'object') continue;
    const kind = isKnownKind(unit.kind) ? unit.kind : OTHER_KIND;
    groups.find((group) => group.kind === kind).units.push(unit);
  }
  return groups.filter((group) => group.units.length > 0);
}

/**
 * The unit kinds of a course for running text, in display order: { zh: '讲课和实验', en: 'lecture and lab' }.
 * Without units, or with a unit of an unknown kind, the course is described as { zh: '单元', en: 'unit' }.
 * 用于正文的课程单元类型，按显示顺序，例如 { zh: '讲课和实验', en: 'lecture and lab' }。
 * 没有单元或含有未知类型的单元时，统称为 { zh: '单元', en: 'unit' }。
 */
export function kindsText(units) {
  const kinds = groupByKind(units).map((group) => group.kind);
  if (!kinds.length || !kinds.every(isKnownKind)) return { zh: '单元', en: 'unit' };
  return {
    zh: joinWords(kinds.map((kind) => KINDS[kind].zhBare), '、', '和'),
    en: joinWords(kinds.map((kind) => KINDS[kind].en.toLowerCase()), ', ', ' and '),
  };
}

function joinWords(words, separator, lastSeparator) {
  return words.length > 1 ? `${words.slice(0, -1).join(separator)}${lastSeparator}${words[words.length - 1]}` : words.join('');
}

/**
 * Names of a unit from course.json:
 *   zh, en   - "第 3 讲" / "Lecture 3"; a known kind without a number gives "讲课" / "Lecture";
 *              anything else gives the unit id (or `fallbackId`)
 *   short    - "Lec 3"; without a known kind and number, the upper-cased id
 *   known    - true when the kind is a lecture, module, lab, tutorial or workshop
 *   numbered - true when the kind is known and the unit has a number
 * 单元的名称：zh、en 为“第 3 讲”/“Lecture 3”，已知类型但没有编号时为“讲课”/“Lecture”，其他情况为单元 id（或 fallbackId）；
 * short 为“Lec 3”，没有已知类型与编号时为大写的 id；known 表示类型已知；numbered 表示类型已知且有编号。
 */
export function unitLabels(unit, fallbackId = '') {
  const id = String((unit && typeof unit === 'object' ? unit.id : null) || fallbackId || '');
  const kind = unit && typeof unit === 'object' && isKnownKind(unit.kind) ? KINDS[unit.kind] : null;
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
