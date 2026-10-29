/**
 * Where a course announces test details (scope, dates, rules), named from course.json `announcements`,
 * for example ["Quercus", "Piazza"]. DOM-free.
 * 课程在哪里公布考试信息（范围、日期、规则），名称来自 course.json 的 announcements，例如 ["Quercus", "Piazza"]。不依赖 DOM。
 */

// Wording when a course lists no channel. 课程没有列出公告渠道时的说法。
const FALLBACK = Object.freeze({ zh: '课程官方通知', en: "the course's official channels" });

/**
 * { zh, en } naming the channels: ["Quercus", "Piazza"] gives "Quercus / Piazza" and "Quercus and
 * Piazza"; three give "A / B / C" and "A, B and C"; none gives a generic phrase.
 * 返回渠道的中英名称：["Quercus", "Piazza"] 得到 “Quercus / Piazza” 与 “Quercus and Piazza”；
 * 三个渠道得到 “A / B / C” 与 “A, B and C”；没有渠道时返回通用说法。
 */
export function announcementChannels(course) {
  const names = (Array.isArray(course?.announcements) ? course.announcements : [])
    .filter((name) => typeof name === 'string' && name.trim())
    .map((name) => name.trim());
  if (!names.length) return FALLBACK;
  const en = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return { zh: names.join(' / '), en };
}
