/**
 * DOM-free helpers shared by the unit list and the lesson page: labels, links, ordering and the
 * choice of the section currently being read.
 * 单元列表与课程页共用的纯逻辑（不依赖 DOM）：标签、链接、排序，以及判断当前正在阅读的小节。
 */
import { groupByKind, isKnownKind, kindGroupTitle, unitLabels, unitNumber } from '../../core/text/unit-labels.js';
import { isRouteId } from '../../core/util/ids.js';

export function lessonHref(unitId, sectionId) {
  if (!isRouteId(unitId)) return '#/learn';
  return isRouteId(sectionId) ? `#/learn/${unitId}/${sectionId}` : `#/learn/${unitId}`;
}

export function practiceHref(unitId) {
  return isRouteId(unitId) ? `#/practice/run?units=${unitId}` : '#/practice';
}

/**
 * "Lecture 3" / "Module 3" / "Lab 2" label of a unit or lesson, as a bilingual value (see
 * core/text/unit-labels.js); a unit of an unknown kind is called "单元 n" / "Unit n" on lesson pages.
 * 单元或讲义的类别标签（如“第 3 讲 Lecture 3”“模块 3 Module 3”“实验 2 Lab 2”，见 core/text/unit-labels.js），
 * 返回双语值；类型未知的单元在课程页上称为“单元 n”/“Unit n”。
 */
export function unitKindLabel(unit) {
  const label = unitLabels(unit);
  if (label.known) return { zh: label.zh, en: label.en };
  const number = unitNumber(unit);
  return number === null ? { zh: '单元', en: 'Unit' } : { zh: `单元 ${number}`, en: `Unit ${number}` };
}

/**
 * Kind label of an opened lesson: the lesson file's own kind and number when they are usable,
 * otherwise those of its course.json unit.
 * 打开的讲义的类别标签：讲义文件自己的类型与编号可用时优先，否则用 course.json 中对应单元的。
 */
export function lessonKindLabel(lesson, unit) {
  return unitKindLabel({
    kind: isKnownKind(lesson?.kind) ? lesson.kind : unit?.kind,
    number: Number.isInteger(lesson?.number) ? lesson.number : unit?.number,
  });
}

/**
 * Drops a leading "Lab 1:" / "Lab 1：" from a title, because the page already shows the kind label.
 * The prefix is only removed when it is followed by a colon and something remains after it.
 * 去掉标题开头的“Lab 1:”或“Lab 1：”，因为页面已经单独显示了类别标签。只有后面跟着冒号且去掉后仍有内容时才删除。
 */
export function stripKindPrefix(text, kind) {
  if (typeof text !== 'string') return text;
  const trimmed = text.trimStart();
  for (const label of [kind?.en, kind?.zh]) {
    if (!label || !trimmed.toLowerCase().startsWith(label.toLowerCase())) continue;
    const rest = trimmed.slice(label.length).trimStart();
    if (!rest.startsWith(':') && !rest.startsWith('：')) continue;
    const remaining = rest.slice(1).trim();
    if (remaining) return remaining;
  }
  return text;
}

export function displayTitle(title, kind) {
  if (!title || typeof title !== 'object') return title;
  return { ...title, zh: stripKindPrefix(title.zh, kind), en: stripKindPrefix(title.en, kind) };
}

/**
 * Splits units into one titled group per kind, in the display order of core/text/unit-labels.js
 * (lectures, modules, labs, tutorials, workshops, then other), keeping course order inside a group
 * and dropping empty groups. Returns [{ kind, title, units }].
 * 按 core/text/unit-labels.js 的显示顺序把单元按类型分组并加上标题（讲课、模块、实验、辅导、工作坊，最后是其他），
 * 组内保持课程顺序，并去掉空组。返回 [{ kind, title, units }]。
 */
export function groupUnits(units) {
  return groupByKind(units).map((group) => ({ kind: group.kind, title: kindGroupTitle(group.kind), units: group.units }));
}

/**
 * Style variant of a unit card: labs keep their own look, while lectures, modules and every other
 * kind share the main-unit look, whose class keeps its original name "lecture".
 * 单元卡片的样式：实验保留自己的样式；讲课、模块及其他类型共用主要单元的样式，其类名沿用原来的 "lecture"。
 */
export function unitCardVariant(kind) {
  return kind === 'lab' ? 'lab' : 'lecture';
}

/**
 * Previous and next unit in course order, exactly as course.json lists them.
 * 按 course.json 中的课程顺序返回上一个与下一个单元。
 */
export function neighbourUnits(units, unitId) {
  const list = Array.isArray(units) ? units.filter((unit) => unit && typeof unit === 'object') : [];
  const index = list.findIndex((unit) => unit.id === unitId);
  if (index < 0) return { previous: null, next: null };
  return { previous: list[index - 1] || null, next: list[index + 1] || null };
}

export function sectionNumber(index) {
  return String(index + 1).padStart(2, '0');
}

/**
 * Keeps renderable sections and guarantees each one a unique, route-safe id (ids become DOM ids
 * and progress keys, so duplicates or odd characters would break both).
 * 保留可渲染的小节，并保证每个小节都有唯一且可用于路由的 id（id 同时用作 DOM id 和进度键）。
 */
export function normalizeSections(sections) {
  const seen = new Set();
  const result = [];
  (Array.isArray(sections) ? sections : []).forEach((section, index) => {
    if (!section || typeof section !== 'object') return;
    const base = isRouteId(section.id) ? section.id : `s${sectionNumber(index)}`;
    let id = base;
    for (let copy = 2; seen.has(id); copy += 1) id = `${base}-${copy}`;
    seen.add(id);
    result.push({ ...section, id, blocks: Array.isArray(section.blocks) ? section.blocks : [] });
  });
  return result;
}

/**
 * The section to treat as "being read": the first one, in page order, inside the reading band.
 * 判定“正在阅读”的小节：按页面顺序，取第一个落在阅读区域内的小节。
 */
export function chooseActiveSection(orderedIds, visibleIds) {
  const visible = visibleIds instanceof Set ? visibleIds : new Set(visibleIds || []);
  return (Array.isArray(orderedIds) ? orderedIds : []).find((id) => visible.has(id)) || null;
}

export function minutesLabel(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value);
  return { zh: `约 ${rounded} 分钟`, en: `about ${rounded} min` };
}

export function slidesLabel(slides) {
  if (slides === undefined || slides === null) return '';
  const text = String(slides).trim();
  return text ? `p.${text}` : '';
}

/**
 * True for an unmodified primary click, so in-page links still open in a new tab on ctrl/cmd-click.
 * 仅对未按修饰键的左键点击返回 true，按住 Ctrl/Cmd 点击时仍可在新标签页打开链接。
 */
export function isPlainClick(event) {
  return Boolean(event) && (event.button === undefined || event.button === 0)
    && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
