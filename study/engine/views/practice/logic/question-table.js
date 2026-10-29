/**
 * Optional data table of a question (CONTENT_SPEC 4.3): the two-way table, frequency table or R output
 * values a question refers to, printed under the prompt like the tables of a real test.
 * 题目可附带的数据表（CONTENT_SPEC 4.3）：题目要用到的列联表、频数表或 R 输出数值，像真实试卷那样印在题干下面。
 *
 * DOM-free so it runs under node --test. 不依赖 DOM，可直接用 node --test 测试。
 */

// Upper bounds that keep a question card readable on a phone. 保证手机上题目卡片可读的上限。
export const QUESTION_TABLE_LIMITS = Object.freeze({ rows: 30, columns: 12 });

function cellText(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return typeof value === 'string' ? value : '';
}

/**
 * The question's table as { headers, rows, caption }, every row padded to one width (headers stay
 * empty when the table has none), or null when the question has no usable table. `caption` is the
 * raw Bi value, or null.
 * 返回 { headers, rows, caption }，所有行补齐到同一列数（没有表头时 headers 为空数组）；题目没有可用表格时返回 null。
 * caption 为原始双语对象或 null。
 */
export function questionTable(question) {
  const table = question?.table;
  if (!table || typeof table !== 'object' || Array.isArray(table)) return null;
  const rawHeaders = Array.isArray(table.headers) ? table.headers : [];
  const rawRows = (Array.isArray(table.rows) ? table.rows : []).filter(Array.isArray).slice(0, QUESTION_TABLE_LIMITS.rows);
  if (!rawRows.length) return null;
  const columns = Math.min(QUESTION_TABLE_LIMITS.columns, Math.max(rawHeaders.length, ...rawRows.map((row) => row.length), 1));
  const pad = (row) => Array.from({ length: columns }, (_, index) => cellText(row[index]));
  const caption = table.caption && typeof table.caption === 'object' && !Array.isArray(table.caption) ? table.caption : null;
  return {
    headers: rawHeaders.length ? pad(rawHeaders) : [],
    rows: rawRows.map(pad),
    caption,
  };
}
