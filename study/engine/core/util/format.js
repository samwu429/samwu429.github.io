/**
 * Formatting helpers for countdowns, timers and option letters.
 * 倒计时、计时器与选项字母的格式化工具。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole calendar days from today (local time) to an ISO date (YYYY-MM-DD); negative when past.
 * 从今天（本地时间）到 ISO 日期（YYYY-MM-DD）的整天数；已过去时为负数。
 */
export function daysUntil(isoDate, now = new Date()) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  if (!year || !month || !day) return null;
  const target = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / DAY_MS);
}

export function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Exam-style option letter: 0 -> "A", 25 -> "Z"; later options are numbered ("27"), and anything
 * that is not an option index gives "?".
 * 考试样式的选项字母：0 为 "A"，25 为 "Z"；之后的选项改用数字（如 "27"），不是选项下标的值返回 "?"。
 */
export function optionLetter(index) {
  if (!Number.isInteger(index) || index < 0) return '?';
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}
