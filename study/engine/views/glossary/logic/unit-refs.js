/**
 * Short unit labels ("Lec 3", "Lab 2"), slide references and unit lists read from URLs.
 * 单元短标签（"Lec 3"、"Lab 2"）、课件页码引用，以及从链接参数读取的单元列表。
 *
 * Shared by the glossary and flashcards views; DOM-free.
 * 术语表与闪卡页面共用，不依赖 DOM。
 */
import { unitLabels } from '../../../core/text/unit-labels.js';

/**
 * Returns "Lec 3" / "Lab 2" from a course.json unit (core/text/unit-labels.js); unknown kinds fall
 * back to the upper-cased unit id.
 * 根据 course.json 中的单元返回 "Lec 3" / "Lab 2"（见 core/text/unit-labels.js）；未知类型回退为大写的单元 id。
 */
export function unitShortLabel(unit, fallbackId = '') {
  return unitLabels(unit, fallbackId).short;
}

/**
 * Formats a slide range such as "19-22" or "3, 7, 11" as "p.19-22"; empty input gives "".
 * 把 "19-22"、"3, 7, 11" 这样的页码格式化为 "p.19-22"；没有页码时返回空字符串。
 */
export function formatSlides(slides) {
  const text = slides === undefined || slides === null ? '' : String(slides).trim();
  return text ? `p.${text}` : '';
}

/**
 * "Lec 3 · p.19-22", or just "Lec 3" when the slides are unknown.
 * 返回 "Lec 3 · p.19-22"；页码未知时只返回 "Lec 3"。
 */
export function sourceLabel(unit, slides, fallbackId = '') {
  const label = unitShortLabel(unit, fallbackId);
  const pages = formatSlides(slides);
  return pages ? `${label} · ${pages}` : label;
}

/**
 * One-line bilingual unit title for tooltips, e.g. "搜索与博弈 Search".
 * 用于提示文字的一行双语单元标题，例如 "搜索与博弈 Search"。
 */
export function unitTitleText(unit) {
  const title = unit && unit.title;
  if (!title) return '';
  if (typeof title === 'string') return title;
  return [title.zh, title.en].filter((part) => typeof part === 'string' && part.trim()).join(' ');
}

/**
 * Reads a comma-separated unit list from a URL parameter, keeping only known ids, in course order.
 * 从链接参数读取逗号分隔的单元列表，只保留已知的 id，并按课程顺序排列。
 */
export function parseUnitParam(value, validIds = []) {
  if (!value) return [];
  const requested = new Set(String(value).split(',').map((part) => part.trim()).filter(Boolean));
  return [...new Set(validIds)].filter((id) => requested.has(id));
}

/**
 * Builds a hash route with query parameters, e.g. ('/glossary', { unit: ['lec03', 'lab03'] })
 * gives "#/glossary?unit=lec03,lab03". Empty values and empty arrays are left out.
 * 生成带查询参数的哈希路由，例如 ('/glossary', { unit: ['lec03', 'lab03'] }) 得到 "#/glossary?unit=lec03,lab03"；
 * 空值与空数组会被省略。
 */
export function hashWithQuery(path, params = {}) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
    const text = Array.isArray(value) ? value.map((item) => encodeURIComponent(String(item))).join(',') : encodeURIComponent(String(value));
    parts.push(`${encodeURIComponent(key)}=${text}`);
  }
  return `#${path}${parts.length ? `?${parts.join('&')}` : ''}`;
}

/**
 * Filter choices for units that actually have terms: course order first, then any unit
 * that only appears in the data. `counts` maps unit id to number of terms.
 * 生成有术语的单元筛选项：先按课程顺序，再补上只在数据中出现的单元。`counts` 为单元 id 到术语数的映射。
 */
export function unitChoices(courseUnits, counts) {
  const units = Array.isArray(courseUnits) ? courseUnits.filter((unit) => unit && unit.id) : [];
  const known = new Set(units.map((unit) => unit.id));
  const choices = units
    .filter((unit) => counts.has(unit.id))
    .map((unit) => ({ id: unit.id, label: unitShortLabel(unit), title: unitTitleText(unit), count: counts.get(unit.id) }));
  for (const [id, count] of counts) {
    if (!known.has(id)) choices.push({ id, label: unitShortLabel(null, id), title: '', count });
  }
  return choices;
}
