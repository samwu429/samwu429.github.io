/**
 * Pure logic of progress backup: the export envelope, import validation and progress summaries.
 * 进度备份的纯逻辑：导出文件格式、导入校验与进度汇总。
 *
 * Imports are validated key by key because other views iterate these values directly; a wrong shape
 * (for example `mistakes` not being an array) would break them, so such files are rejected.
 * 导入时逐项校验，因为其他视图会直接遍历这些数据；形状不对（如 mistakes 不是数组）会让页面出错，因此拒绝这类文件。
 */
import { PLAN_UNIT_PREFIX } from '../../core/state/progress-store.js';
import { isRouteId } from '../../core/util/ids.js';

export const EXPORT_FORMAT = 'topphi-study-progress';
export const EXPORT_VERSION = 1;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const MAX_ID_LENGTH = 200;
const KNOWN_KEYS = ['sections', 'attempts', 'mistakes', 'flashcards', 'lastVisited'];

const MESSAGES = {
  'too-large': { zh: '文件太大，不像是复习站导出的进度文件。', en: 'The file is too large to be a progress export.' },
  'not-json': { zh: '这不是有效的 JSON 文件。', en: 'This is not a valid JSON file.' },
  'not-progress': { zh: '这个文件不是复习站导出的进度文件。', en: 'This file is not a progress export from this station.' },
  version: { zh: '这个文件来自更新版本的复习站，暂时无法导入。', en: 'This file comes from a newer version of the station.' },
  damaged: { zh: '文件里的进度数据格式不对，可能已经损坏。', en: 'The progress data in this file is damaged.' },
  empty: { zh: '文件里没有可以导入的学习进度。', en: 'The file contains no progress to import.' },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function failure(code, extra) {
  return { ok: false, code, message: extra || MESSAGES[code] };
}

// Each validator returns null when the top-level type is wrong, otherwise the kept value and the dropped entry count.
// 每个校验函数在顶层类型错误时返回 null，否则返回保留下来的值与丢弃的条目数。
const VALIDATORS = {
  sections(value) {
    if (!isPlainObject(value)) return null;
    const kept = {};
    let dropped = 0;
    for (const [key, stamp] of Object.entries(value)) {
      if (isId(key) && /^[^/\s]+\/[^/\s]+$/.test(key) && (Number.isFinite(stamp) || stamp === true)) kept[key] = stamp === true ? 1 : stamp;
      else dropped += 1;
    }
    return { value: kept, dropped };
  },

  attempts(value) {
    if (!isPlainObject(value)) return null;
    const kept = {};
    let dropped = 0;
    for (const [questionId, entry] of Object.entries(value)) {
      if (!isId(questionId) || !isPlainObject(entry) || !isCount(entry.tries) || !isCount(entry.correct)) {
        dropped += 1;
        continue;
      }
      const clean = { tries: entry.tries, correct: Math.min(entry.correct, entry.tries) };
      if (entry.last === 'right' || entry.last === 'wrong') clean.last = entry.last;
      if (Number.isFinite(entry.at)) clean.at = entry.at;
      kept[questionId] = clean;
    }
    return { value: kept, dropped };
  },

  mistakes(value) {
    if (!Array.isArray(value)) return null;
    const kept = [...new Set(value.filter(isId))];
    return { value: kept, dropped: value.length - kept.length };
  },

  flashcards(value) {
    if (!isPlainObject(value)) return null;
    const kept = {};
    let dropped = 0;
    for (const [termId, entry] of Object.entries(value)) {
      if (isId(termId) && isPlainObject(entry) && typeof entry.status === 'string' && entry.status.length <= 40) {
        kept[termId] = Number.isFinite(entry.at) ? { status: entry.status, at: entry.at } : { status: entry.status };
      } else {
        dropped += 1;
      }
    }
    return { value: kept, dropped };
  },

  // A broken bookmark is harmless, so it is dropped instead of failing the whole import.
  // 上次访问记录损坏并无大碍，直接丢弃，不让整个导入失败。
  lastVisited(value) {
    if (value === null) return { value: null, dropped: 0 };
    if (!isPlainObject(value) || !isId(value.unitId)) return { value: undefined, dropped: 1 };
    return {
      value: {
        unitId: value.unitId,
        sectionId: isId(value.sectionId) ? value.sectionId : null,
        at: Number.isFinite(value.at) ? value.at : 0,
      },
      dropped: 0,
    };
  },
};

/**
 * Keeps only the known progress keys with valid shapes. A known key with the wrong type makes the
 * result null, unless `lenient` is set (used for exports), which skips that key instead.
 * 只保留形状正确的已知进度键。已知键类型错误时返回 null；设置 lenient（导出时使用）则只跳过该键。
 */
export function sanitizeProgress(raw, { lenient = false } = {}) {
  if (!isPlainObject(raw)) return null;
  const data = {};
  const ignoredKeys = [];
  let dropped = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_KEYS.includes(key)) {
      ignoredKeys.push(key);
      continue;
    }
    const result = VALIDATORS[key](value);
    if (!result) {
      if (!lenient) return null;
      ignoredKeys.push(key);
      continue;
    }
    dropped += result.dropped;
    if (result.value !== undefined) data[key] = result.value;
  }
  return { data, dropped, ignoredKeys };
}

export function summarizeProgress(data) {
  const sectionKeys = isPlainObject(data?.sections) ? Object.keys(data.sections) : [];
  const planTasks = sectionKeys.filter((key) => key.startsWith(PLAN_UNIT_PREFIX)).length;
  return {
    sections: sectionKeys.length - planTasks,
    planTasks,
    questions: isPlainObject(data?.attempts) ? Object.keys(data.attempts).length : 0,
    mistakes: Array.isArray(data?.mistakes) ? data.mistakes.length : 0,
    flashcards: isPlainObject(data?.flashcards) ? Object.keys(data.flashcards).length : 0,
  };
}

export function isEmptySummary(summary) {
  return !summary.sections && !summary.planTasks && !summary.questions && !summary.mistakes && !summary.flashcards;
}

export function buildExport(courseId, data, now = new Date()) {
  const clean = sanitizeProgress(data, { lenient: true });
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    courseId,
    exportedAt: now.toISOString(),
    data: clean ? clean.data : {},
  };
}

export function exportFileName(courseId, now = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const safeId = isRouteId(courseId) ? courseId : 'course';
  return `topphi-${safeId}-progress-${stamp}.json`;
}

/**
 * Parses and validates an imported file. Accepts the export envelope or a bare progress object.
 * 解析并校验导入文件；既接受导出时的外层格式，也接受直接的进度对象。
 */
export function parseImport(text, courseId) {
  if (typeof text !== 'string') return failure('not-json');
  if (text.length > MAX_IMPORT_BYTES) return failure('too-large');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure('not-json');
  }
  if (!isPlainObject(parsed)) return failure('not-progress');

  let raw = parsed;
  let exportedAt = null;
  if (Object.hasOwn(parsed, 'format')) {
    if (parsed.format !== EXPORT_FORMAT) return failure('not-progress');
    if (!Number.isInteger(parsed.version) || parsed.version < 1) return failure('not-progress');
    if (parsed.version > EXPORT_VERSION) return failure('version');
    if (parsed.courseId !== courseId) {
      const other = isRouteId(String(parsed.courseId)) ? parsed.courseId : 'unknown';
      return failure('other-course', {
        zh: `这是另一门课（${other}）的进度文件，不能导入到这门课。`,
        en: `This file belongs to another course (${other}).`,
      });
    }
    raw = parsed.data;
    exportedAt = typeof parsed.exportedAt === 'string' && !Number.isNaN(Date.parse(parsed.exportedAt)) ? parsed.exportedAt : null;
  }

  const clean = sanitizeProgress(raw);
  if (!clean) return failure('damaged');
  if (!Object.keys(clean.data).length) return failure(Object.keys(raw || {}).length ? 'not-progress' : 'empty');
  return {
    ok: true,
    data: clean.data,
    summary: summarizeProgress(clean.data),
    dropped: clean.dropped,
    ignoredKeys: clean.ignoredKeys,
    exportedAt,
  };
}
