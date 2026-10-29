import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBranchMap,
  countdown,
  datedAssessments,
  monthDay,
  overallProgress,
  parseIsoDate,
  relativeDay,
  resolveContinue,
  splitUnits,
  startUnit,
  totalWeight,
} from '../../../engine/views/home/home-logic.js';

const NOW = new Date(2026, 9, 28, 15, 30);

const UNITS = [
  { id: 'lec01', kind: 'lecture', number: 1, branch: 'foundations', sectionIds: ['s01-a', 's02-b'] },
  { id: 'lec02', kind: 'lecture', number: 2, branch: 'symbolic', sectionIds: ['s01-a'] },
  { id: 'lec03', kind: 'lecture', number: 3, branch: 'symbolic', sectionIds: [] },
  { id: 'lec04', kind: 'lecture', number: 4, branch: 'ml' },
  { id: 'lec06', kind: 'lecture', number: 6, branch: 'ml' },
  { id: 'lab02', kind: 'lab', number: 2, branch: 'symbolic' },
  { id: 'lab01', kind: 'lab', number: 1, branch: 'foundations' },
  { id: 'lab05', kind: 'lab', number: 5, branch: 'ml' },
  { id: 'lec07', kind: 'lecture', number: 7, branch: 'llm' },
];

const BRANCHES = [
  { id: 'foundations', title: { zh: '基础', en: 'Foundations' } },
  { id: 'symbolic', title: { zh: '符号', en: 'Symbolic' } },
  { id: 'ml', title: { zh: '机器学习', en: 'ML' } },
  { id: 'llm', title: { zh: '大模型', en: 'LLMs' } },
];

test('parseIsoDate rejects impossible dates', () => {
  assert.deepEqual(parseIsoDate('2026-11-10'), { year: 2026, month: 11, day: 10 });
  assert.equal(parseIsoDate('2026-02-31'), null);
  assert.equal(parseIsoDate('2026-13-01'), null);
  assert.equal(parseIsoDate('Nov 10'), null);
  assert.equal(parseIsoDate(null), null);
});

test('monthDay gives Chinese and English labels', () => {
  assert.deepEqual(monthDay('2026-11-10'), { zh: '11月10日', en: 'Nov 10' });
  assert.deepEqual(monthDay('2026-01-05'), { zh: '1月5日', en: 'Jan 5' });
  assert.equal(monthDay(null), null);
});

test('countdown covers past, today, tomorrow and later', () => {
  assert.deepEqual(countdown('2026-11-10', NOW), { state: 'upcoming', days: 13, zh: '还有 13 天', en: 'in 13 days' });
  assert.equal(countdown('2026-10-29', NOW).zh, '明天');
  assert.equal(countdown('2026-10-28', NOW).state, 'today');
  assert.equal(countdown('2026-10-06', NOW).state, 'past');
  assert.equal(countdown('2026-10-06', NOW).zh, '已结束');
  assert.equal(countdown('not a date', NOW), null);
});

test('datedAssessments sorts by date, skips undated items and flags the next one', () => {
  const list = datedAssessments([
    { id: 'paper', date: '2026-12-08' },
    { id: 'labs', date: null },
    { id: 'test2', date: '2026-11-10' },
    { id: 'test1', date: '2026-10-06' },
    null,
  ], NOW);
  assert.deepEqual(list.map((entry) => entry.assessment.id), ['test1', 'test2', 'paper']);
  assert.deepEqual(list.map((entry) => entry.isNext), [false, true, false]);
  assert.equal(list[0].countdown.state, 'past');
  assert.deepEqual(list[1].day, { zh: '11月10日', en: 'Nov 10' });
});

test('datedAssessments flags nothing when every date has passed', () => {
  const list = datedAssessments([{ id: 'a', date: '2026-01-01' }], NOW);
  assert.equal(list[0].isNext, false);
});

test('totalWeight sums numeric weights only', () => {
  assert.equal(totalWeight([{ weight: 20 }, { weight: 15 }, { weight: '10' }, { weight: null }, {}]), 35);
  assert.equal(totalWeight(undefined), 0);
});

test('splitUnits groups and sorts without mutating the input', () => {
  const copy = UNITS.map((unit) => ({ ...unit }));
  const order = UNITS.map((unit) => unit.id);
  const groups = splitUnits([...UNITS, { id: 'extra-1', kind: 'review' }, { id: 'Bad Id', kind: 'lecture' }]);
  assert.deepEqual(groups.map((group) => group.kind), ['lecture', 'lab', 'other']);
  assert.deepEqual(groups[0].units.map((unit) => unit.id), ['lec01', 'lec02', 'lec03', 'lec04', 'lec06', 'lec07']);
  assert.deepEqual(groups[1].units.map((unit) => unit.id), ['lab01', 'lab02', 'lab05']);
  assert.deepEqual(groups[2].units.map((unit) => unit.id), ['extra-1']);
  assert.deepEqual(UNITS, copy);
  assert.deepEqual(UNITS.map((unit) => unit.id), order);
});

test('splitUnits gives modules their own group before labs, and other kinds keep course order', () => {
  const groups = splitUnits([
    { id: 'extra-b', kind: 'reading' },
    { id: 'lab01', kind: 'lab', number: 1 },
    { id: 'mod02', kind: 'module', number: 2 },
    { id: 'extra-a' },
    { id: 'mod01', kind: 'module', number: 1 },
  ]);
  assert.deepEqual(groups.map((group) => [group.kind, group.units.map((unit) => unit.id)]), [
    ['module', ['mod01', 'mod02']],
    ['lab', ['lab01']],
    ['other', ['extra-b', 'extra-a']],
  ]);
  assert.deepEqual(splitUnits(undefined), []);
});

test('startUnit is the lowest-numbered lecture or module, else the first unit in course order', () => {
  assert.equal(startUnit(UNITS).id, 'lec01');
  assert.equal(startUnit([{ id: 'lab01', kind: 'lab', number: 1 }, { id: 'mod03', kind: 'module', number: 3 }, { id: 'mod01', kind: 'module', number: 1 }]).id, 'mod01');
  assert.equal(startUnit([{ id: 'lab02', kind: 'lab', number: 2 }, { id: 'lab01', kind: 'lab', number: 1 }]).id, 'lab02');
  assert.equal(startUnit([{ id: 'Bad Id', kind: 'lecture', number: 1 }]), null);
  assert.equal(startUnit(undefined), null);
});

test('overallProgress sums only units that list their sections', () => {
  const calls = [];
  const result = overallProgress(UNITS, (unitId, sectionIds) => {
    calls.push(unitId);
    return { done: unitId === 'lec01' ? 1 : 0, total: sectionIds.length };
  });
  assert.deepEqual(result, { done: 1, total: 3 });
  assert.deepEqual(calls, ['lec01', 'lec02']);
});

test('resolveContinue builds a lesson link and ignores stale or odd records', () => {
  assert.deepEqual(resolveContinue({ unitId: 'lec02', sectionId: 's01-a', at: 5 }, UNITS), {
    unit: UNITS[1], sectionId: 's01-a', href: '#/learn/lec02/s01-a', at: 5,
  });
  assert.equal(resolveContinue({ unitId: 'lec02', sectionId: null }, UNITS).href, '#/learn/lec02');
  assert.equal(resolveContinue({ unitId: 'lec02', sectionId: '../x' }, UNITS).href, '#/learn/lec02');
  assert.equal(resolveContinue({ unitId: 'lec99' }, UNITS), null);
  assert.equal(resolveContinue(null, UNITS), null);
  assert.equal(resolveContinue('lec02', UNITS), null);
});

test('relativeDay counts calendar days', () => {
  assert.deepEqual(relativeDay(new Date(2026, 9, 28, 1).getTime(), NOW), { zh: '今天', en: 'today' });
  assert.deepEqual(relativeDay(new Date(2026, 9, 27, 23).getTime(), NOW), { zh: '昨天', en: 'yesterday' });
  assert.deepEqual(relativeDay(new Date(2026, 9, 20).getTime(), NOW), { zh: '8 天前', en: '8 days ago' });
  assert.equal(relativeDay(new Date(2026, 10, 2).getTime(), NOW), null);
  assert.equal(relativeDay('yesterday', NOW), null);
});

test('buildBranchMap groups units by course branch and matches overview branches by id', () => {
  const map = buildBranchMap({
    courseBranches: BRANCHES,
    units: UNITS,
    overviewBranches: [{ id: 'symbolic', title: { zh: '另一个标题', en: 'Other' }, summary: { zh: '搜索', en: 'Search' }, lessons: ['lec02'] }],
  });
  assert.deepEqual(map.branches.map((branch) => branch.id), ['foundations', 'symbolic', 'ml', 'llm']);
  const symbolic = map.branches[1];
  assert.deepEqual(symbolic.units.map((unit) => unit.id), ['lec02', 'lec03', 'lab02']);
  assert.deepEqual(symbolic.title, { zh: '符号', en: 'Symbolic' });
  assert.deepEqual(symbolic.summary, { zh: '搜索', en: 'Search' });
  assert.equal(map.branches[0].summary, null);
  assert.deepEqual(map.threads, []);
  assert.deepEqual(map.others, []);
});

test('buildBranchMap matches renamed branches by lesson overlap and keeps cross-cutting ones as threads', () => {
  const map = buildBranchMap({
    courseBranches: BRANCHES,
    units: UNITS,
    overviewBranches: [
      { id: 'ethics', title: { zh: '伦理', en: 'Ethics' }, summary: { zh: '贯穿', en: 'Across' }, lessons: ['lec01', 'lec06', 'lab05', 'lec07'] },
      { id: 'machine-learning', summary: { zh: '学习', en: 'Learning' }, lessons: ['lec04', 'lec06', 'lab05'] },
      { id: 'generative', summary: { zh: '生成', en: 'Generative' }, lessons: ['lec07', 'lec07'] },
      { id: 'ghost', summary: { zh: '无', en: 'None' }, lessons: ['lec42'] },
    ],
  });
  const byId = Object.fromEntries(map.branches.map((branch) => [branch.id, branch]));
  assert.deepEqual(byId.ml.summary, { zh: '学习', en: 'Learning' });
  assert.deepEqual(byId.llm.summary, { zh: '生成', en: 'Generative' });
  assert.equal(byId.symbolic.summary, null);
  assert.deepEqual(map.threads.map((thread) => thread.id), ['ethics', 'ghost']);
  assert.deepEqual(map.threads[0].units.map((unit) => unit.id), ['lec01', 'lec06', 'lab05', 'lec07']);
  assert.deepEqual(map.threads[1].units, []);
});

test('buildBranchMap collects units of unknown branches and falls back to overview branches', () => {
  const withStray = buildBranchMap({ courseBranches: BRANCHES, units: [...UNITS, { id: 'lec08', kind: 'lecture', number: 8, branch: 'robots' }] });
  assert.deepEqual(withStray.others.map((unit) => unit.id), ['lec08']);

  const fallback = buildBranchMap({
    courseBranches: [],
    units: UNITS,
    overviewBranches: [{ id: 'symbolic', title: { zh: '符号', en: 'Symbolic' }, lessons: ['lec02', 'lab02', 'nope'] }],
  });
  assert.deepEqual(fallback.branches.map((branch) => branch.units.map((unit) => unit.id)), [['lec02', 'lab02']]);
  assert.equal(fallback.others.length, UNITS.length - 2);

  const empty = buildBranchMap();
  assert.deepEqual(empty, { branches: [], threads: [], others: [] });
});
