import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  MAX_IMPORT_BYTES,
  buildExport,
  exportFileName,
  isEmptySummary,
  parseImport,
  sanitizeProgress,
  summarizeProgress,
} from '../../../engine/views/settings/progress-transfer.js';

const SAMPLE = {
  sections: { 'lec01/s01-intro': 1761600000000, 'lec01/s02-agents': 1761600000001, 'plan-test2/d0-t0': 1761600000002 },
  attempts: { 'lec01-q01': { tries: 2, correct: 1, last: 'right', at: 1761600000003 } },
  mistakes: ['lec01-q02'],
  flashcards: { overfitting: { status: 'known', at: 1761600000004 } },
  lastVisited: { unitId: 'lec01', sectionId: 's02-agents', at: 1761600000005 },
};

test('summarizeProgress separates study plan ticks from lesson sections', () => {
  assert.deepEqual(summarizeProgress(SAMPLE), { sections: 2, planTasks: 1, questions: 1, mistakes: 1, flashcards: 1 });
  const empty = summarizeProgress({});
  assert.deepEqual(empty, { sections: 0, planTasks: 0, questions: 0, mistakes: 0, flashcards: 0 });
  assert.equal(isEmptySummary(empty), true);
  assert.equal(isEmptySummary(summarizeProgress(SAMPLE)), false);
});

test('buildExport wraps the data in a versioned envelope', () => {
  const now = new Date(Date.UTC(2026, 9, 28, 12));
  const payload = buildExport('csc105h5', { ...SAMPLE, junk: 1, mistakes: 'broken' }, now);
  assert.equal(payload.format, EXPORT_FORMAT);
  assert.equal(payload.version, EXPORT_VERSION);
  assert.equal(payload.courseId, 'csc105h5');
  assert.equal(payload.exportedAt, '2026-10-28T12:00:00.000Z');
  assert.deepEqual(Object.keys(payload.data).sort(), ['attempts', 'flashcards', 'lastVisited', 'sections']);
});

test('exportFileName uses the local date and a safe course id', () => {
  const now = new Date(2026, 9, 8, 9);
  assert.equal(exportFileName('csc105h5', now), 'topphi-csc105h5-progress-2026-10-08.json');
  assert.equal(exportFileName('../evil', now), 'topphi-course-progress-2026-10-08.json');
});

test('parseImport round-trips an export', () => {
  const text = JSON.stringify(buildExport('csc105h5', SAMPLE));
  const result = parseImport(text, 'csc105h5');
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, SAMPLE);
  assert.deepEqual(result.summary, summarizeProgress(SAMPLE));
  assert.equal(result.dropped, 0);
  assert.equal(typeof result.exportedAt, 'string');
});

test('parseImport accepts a bare progress object and reports what it skipped', () => {
  const result = parseImport(JSON.stringify({
    sections: { 'lec01/s01': 1, bad: 2, 'lec02/s01': 'yesterday', 'lec03/s01': true },
    mistakes: ['a', 'a', 3],
    attempts: { q1: { tries: 1, correct: 5 }, q2: { tries: -1, correct: 0 } },
    extra: true,
  }), 'csc105h5');
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.sections, { 'lec01/s01': 1, 'lec03/s01': 1 });
  assert.deepEqual(result.data.mistakes, ['a']);
  assert.deepEqual(result.data.attempts, { q1: { tries: 1, correct: 1 } });
  assert.equal(result.dropped, 5);
  assert.deepEqual(result.ignoredKeys, ['extra']);
  assert.equal(result.exportedAt, null);
});

test('parseImport rejects files that are not progress exports', () => {
  assert.equal(parseImport('not json', 'csc105h5').code, 'not-json');
  assert.equal(parseImport('[1, 2]', 'csc105h5').code, 'not-progress');
  assert.equal(parseImport('{"id": "csc105h5", "units": []}', 'csc105h5').code, 'not-progress');
  assert.equal(parseImport('{}', 'csc105h5').code, 'empty');
  assert.equal(parseImport(JSON.stringify({ format: 'something-else', data: SAMPLE }), 'csc105h5').code, 'not-progress');
  assert.equal(parseImport(JSON.stringify({ mistakes: 'lec01-q01' }), 'csc105h5').code, 'damaged');
  assert.equal(parseImport(JSON.stringify({ sections: [] }), 'csc105h5').code, 'damaged');
  assert.equal(parseImport(42, 'csc105h5').code, 'not-json');
  assert.equal(parseImport(' '.repeat(MAX_IMPORT_BYTES + 1), 'csc105h5').code, 'too-large');
});

test('parseImport rejects newer versions and other courses with readable messages', () => {
  const newer = parseImport(JSON.stringify({ ...buildExport('csc105h5', SAMPLE), version: EXPORT_VERSION + 1 }), 'csc105h5');
  assert.equal(newer.code, 'version');
  const other = parseImport(JSON.stringify(buildExport('mat135h5', SAMPLE)), 'csc105h5');
  assert.equal(other.ok, false);
  assert.equal(other.code, 'other-course');
  assert.match(other.message.zh, /mat135h5/);
  assert.match(other.message.en, /mat135h5/);
  const hostile = parseImport(JSON.stringify({ ...buildExport('csc105h5', SAMPLE), courseId: '<img src=x>' }), 'csc105h5');
  assert.match(hostile.message.en, /unknown/);
});

test('sanitizeProgress is strict by default and lenient on request', () => {
  assert.equal(sanitizeProgress({ flashcards: [] }), null);
  assert.deepEqual(sanitizeProgress({ flashcards: [], mistakes: ['x'] }, { lenient: true }), {
    data: { mistakes: ['x'] }, dropped: 0, ignoredKeys: ['flashcards'],
  });
  assert.deepEqual(sanitizeProgress({ lastVisited: 'lec01' }).data, {});
  assert.deepEqual(sanitizeProgress({ lastVisited: null }).data, { lastVisited: null });
  assert.equal(sanitizeProgress(null), null);
});
