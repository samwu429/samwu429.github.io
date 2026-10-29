import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCourseRepository } from '../../../engine/core/data/course-repository.js';

const realFetch = globalThis.fetch;
let packCounter = 0;

// Serves a fake course pack from `files` (path -> JSON value, or a number for an HTTP error status,
// or 'offline' for a network failure) and counts the requests per path.
// 用 `files`（路径 -> JSON 值；数字表示 HTTP 错误状态码；'offline' 表示网络失败）模拟课程包，并统计每个路径的请求次数。
function servePack(files) {
  packCounter += 1;
  const base = `https://example.test/pack-${packCounter}/`;
  const requests = new Map();
  globalThis.fetch = async (url) => {
    const path = String(url).slice(base.length);
    requests.set(path, (requests.get(path) || 0) + 1);
    const body = files[path];
    if (body === 'offline' || body === undefined) throw new TypeError('Failed to fetch');
    if (typeof body === 'number') return { ok: false, status: body, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  return { repo: createCourseRepository(new URL(base)), requests };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const COURSE = {
  units: [
    { id: 'lec01', kind: 'lecture', number: 1, practice: 'practice/lec01.json', glossary: 'glossary/lec01.json' },
    { id: 'lec02', kind: 'lecture', number: 2, practice: 'practice/lec02.json', glossary: 'glossary/lec02.json' },
    { id: 'lab01', kind: 'lab', number: 1 },
  ],
  review: { overview: 'review/course-overview.json' },
};

test('allQuestions tags each question with its unit and reports no failures', async () => {
  const { repo } = servePack({
    'course.json': COURSE,
    'practice/lec01.json': { questions: [{ id: 'lec01-q01' }] },
    'practice/lec02.json': { questions: [{ id: 'lec02-q01' }, { id: 'lec02-q02' }] },
  });
  const questions = await repo.allQuestions();
  assert.deepEqual(questions.map((question) => [question.id, question.unitId]), [['lec01-q01', 'lec01'], ['lec02-q01', 'lec02'], ['lec02-q02', 'lec02']]);
  assert.deepEqual(questions.failedUnits, []);
  assert.equal(Object.keys(questions).includes('failedUnits'), false);
});

test('a unit whose file fails is reported instead of silently missing', async () => {
  const { repo } = servePack({
    'course.json': COURSE,
    'practice/lec01.json': { questions: [{ id: 'lec01-q01' }] },
    'practice/lec02.json': 'offline',
    'glossary/lec01.json': 500,
    'glossary/lec02.json': { terms: [{ id: 'agent', en: 'Agent' }, null] },
  });
  const questions = await repo.allQuestions();
  assert.deepEqual(questions.map((question) => question.id), ['lec01-q01']);
  assert.deepEqual(questions.failedUnits, ['lec02']);
  const terms = await repo.allTerms();
  assert.deepEqual(terms.map((term) => [term.id, term.units]), [['agent', ['lec02']]]);
  assert.deepEqual(terms.failedUnits, ['lec01']);
});

test('a file without the expected list counts as failed', async () => {
  const { repo } = servePack({
    'course.json': COURSE,
    'practice/lec01.json': { questions: 'broken' },
    'practice/lec02.json': { questions: [] },
  });
  const questions = await repo.allQuestions();
  assert.deepEqual(questions, []);
  assert.deepEqual(questions.failedUnits, ['lec01']);
});

test('allTerms merges a term defined in several units', async () => {
  const { repo } = servePack({
    'course.json': COURSE,
    'glossary/lec01.json': { terms: [{ id: 'agent', en: 'Agent', zh: '智能体' }] },
    'glossary/lec02.json': { terms: [{ id: 'agent', en: 'Agent (again)' }, { id: 'search', en: 'Search' }] },
  });
  const terms = await repo.allTerms();
  assert.deepEqual(terms.map((term) => [term.id, term.en, term.units]), [['agent', 'Agent', ['lec01', 'lec02']], ['search', 'Search', ['lec02']]]);
});

test('a retry fetches a failed file again, while a missing file (404) is not requested twice', async () => {
  const files = {
    'course.json': COURSE,
    'practice/lec01.json': 'offline',
    'practice/lec02.json': { questions: [] },
    'review/course-overview.json': 404,
  };
  const { repo, requests } = servePack(files);
  assert.deepEqual((await repo.allQuestions()).failedUnits, ['lec01']);
  files['practice/lec01.json'] = { questions: [{ id: 'lec01-q01' }] };
  const retried = await repo.allQuestions();
  assert.deepEqual(retried.failedUnits, []);
  assert.equal(requests.get('practice/lec01.json'), 2);
  assert.equal(requests.get('practice/lec02.json'), 1);

  await assert.rejects(repo.review('overview'), /HTTP 404/);
  await assert.rejects(repo.review('overview'), /HTTP 404/);
  assert.equal(requests.get('review/course-overview.json'), 1);
  assert.equal(await repo.review('cheatsheet'), null);
});
