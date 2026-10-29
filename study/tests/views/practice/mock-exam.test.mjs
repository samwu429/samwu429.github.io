import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOCK_DEFAULTS,
  MOCK_LIMITS,
  allocateBalanced,
  composeMockExam,
  crossedMilestone,
  mockAvailability,
  normalizeMockSettings,
  remainingSeconds,
} from '../../../engine/views/practice/logic/mock-exam.js';
import { createRng } from '../../../engine/views/practice/logic/rng.js';

function unitQuestions(unitId, objective, written) {
  const list = [];
  for (let index = 0; index < objective; index += 1) {
    list.push({ id: `${unitId}-q${String(list.length + 1).padStart(2, '0')}`, unitId, type: ['mcq', 'tf', 'multi', 'calc'][index % 4] });
  }
  for (let index = 0; index < written; index += 1) {
    list.push({ id: `${unitId}-q${String(list.length + 1).padStart(2, '0')}`, unitId, type: index % 2 ? 'long' : 'short' });
  }
  return list;
}

const BANK = [
  ...unitQuestions('lec01', 20, 4),
  ...unitQuestions('lec02', 20, 4),
  ...unitQuestions('lec03', 3, 1),
  ...unitQuestions('lab01', 10, 2),
];
const byId = new Map(BANK.map((question) => [question.id, question]));

test('allocateBalanced: even split when every unit has room', () => {
  const counts = allocateBalanced([{ key: 'a', available: 10 }, { key: 'b', available: 10 }, { key: 'c', available: 10 }], 9, createRng(1));
  assert.deepEqual([...counts.values()], [3, 3, 3]);
  const uneven = allocateBalanced([{ key: 'a', available: 10 }, { key: 'b', available: 10 }, { key: 'c', available: 10 }], 10, createRng(1));
  const values = [...uneven.values()];
  assert.equal(values.reduce((sum, value) => sum + value, 0), 10);
  assert.ok(Math.max(...values) - Math.min(...values) <= 1);
});

test('allocateBalanced: small units pass their share on', () => {
  const counts = allocateBalanced([{ key: 'a', available: 1 }, { key: 'b', available: 20 }, { key: 'c', available: 20 }], 11, createRng(3));
  assert.equal(counts.get('a'), 1);
  assert.equal(counts.get('b') + counts.get('c'), 10);
  assert.ok(Math.abs(counts.get('b') - counts.get('c')) <= 1);
});

test('allocateBalanced: totals above capacity, zero and bad input', () => {
  const capped = allocateBalanced([{ key: 'a', available: 2 }, { key: 'b', available: 3 }], 50, createRng(5));
  assert.deepEqual(Object.fromEntries(capped), { a: 2, b: 3 });
  assert.deepEqual(Object.fromEntries(allocateBalanced([{ key: 'a', available: 2 }], 0)), { a: 0 });
  assert.deepEqual(Object.fromEntries(allocateBalanced([{ key: 'a', available: 'x' }], 3)), { a: 0 });
  assert.equal(allocateBalanced(null, 3).size, 0);
});

test('composeMockExam: requested counts, objective first, no duplicates', () => {
  const paper = composeMockExam(BANK, { units: ['lec01', 'lec02', 'lec03'], objectiveCount: 20, writtenCount: 3, seed: 7 });
  assert.equal(paper.objectiveIds.length, 20);
  assert.equal(paper.writtenIds.length, 3);
  assert.deepEqual(paper.questionIds, [...paper.objectiveIds, ...paper.writtenIds]);
  assert.equal(new Set(paper.questionIds).size, 23);
  for (const id of paper.objectiveIds) assert.ok(['mcq', 'tf', 'multi', 'calc'].includes(byId.get(id).type));
  for (const id of paper.writtenIds) assert.ok(['short', 'long'].includes(byId.get(id).type));
  for (const id of paper.questionIds) assert.notEqual(byId.get(id).unitId, 'lab01');
  assert.deepEqual(paper.shortfall, { objective: 0, written: 0 });
});

test('composeMockExam: balanced across units, small units give way', () => {
  const paper = composeMockExam(BANK, { units: ['lec01', 'lec02', 'lec03'], objectiveCount: 20, writtenCount: 3, seed: 11 });
  assert.equal(paper.allocation.lec03.objective, 3);
  assert.ok(Math.abs(paper.allocation.lec01.objective - paper.allocation.lec02.objective) <= 1);
  assert.equal(paper.allocation.lec01.objective + paper.allocation.lec02.objective, 17);
  assert.deepEqual([paper.allocation.lec01.written, paper.allocation.lec02.written, paper.allocation.lec03.written].sort(), [1, 1, 1]);
});

test('composeMockExam: deterministic for a seed, ordered by unit then bank order', () => {
  const settings = { units: ['lec02', 'lec01'], objectiveCount: 12, writtenCount: 2, seed: 99 };
  const first = composeMockExam(BANK, settings);
  const second = composeMockExam(BANK, settings);
  assert.deepEqual(first, second);
  const order = first.objectiveIds.map((id) => [byId.get(id).unitId, BANK.indexOf(byId.get(id))]);
  for (let index = 1; index < order.length; index += 1) {
    const [unitA, bankA] = order[index - 1];
    const [unitB, bankB] = order[index];
    const unitRank = (unit) => settings.units.indexOf(unit);
    assert.ok(unitRank(unitA) < unitRank(unitB) || (unitA === unitB && bankA < bankB));
  }
  const other = composeMockExam(BANK, { ...settings, seed: 100 });
  assert.equal(other.objectiveIds.length, 12);
});

test('composeMockExam: shortfall when the bank is too small', () => {
  const paper = composeMockExam(BANK, { units: ['lec03'], objectiveCount: 10, writtenCount: 3, seed: 1 });
  assert.equal(paper.objectiveIds.length, 3);
  assert.equal(paper.writtenIds.length, 1);
  assert.deepEqual(paper.shortfall, { objective: 7, written: 2 });
  const empty = composeMockExam(BANK, { units: [], seed: 1 });
  assert.deepEqual(empty.questionIds, []);
  assert.deepEqual(composeMockExam(null, { units: ['lec01'] }).questionIds, []);
});

test('mockAvailability counts objective and written questions per chosen unit', () => {
  const availability = mockAvailability(BANK, ['lec03', 'lab01']);
  assert.equal(availability.objective, 13);
  assert.equal(availability.written, 3);
  assert.deepEqual(availability.perUnit.get('lec03'), { objective: 3, written: 1 });
  assert.equal(mockAvailability(BANK, []).objective, 0);
});

test('normalizeMockSettings clamps counts and minutes', () => {
  assert.deepEqual(normalizeMockSettings({ units: ['lec01', 'lec01', ''], objectiveCount: '25', writtenCount: '-2', minutes: '999' }), {
    units: ['lec01'], objectiveCount: 25, writtenCount: 0, minutes: MOCK_LIMITS.minutesMax,
  });
  assert.deepEqual(normalizeMockSettings(), { units: [], ...MOCK_DEFAULTS });
  assert.equal(normalizeMockSettings({ objectiveCount: 500 }).objectiveCount, MOCK_LIMITS.objectiveMax);
});

test('timer helpers: remaining seconds and milestone crossings', () => {
  assert.equal(remainingSeconds(10_000, 0), 10);
  assert.equal(remainingSeconds(10_000, 9_001), 1);
  assert.equal(remainingSeconds(10_000, 12_000), 0);
  assert.equal(remainingSeconds(null, 0), null);
  assert.equal(crossedMilestone(301, 299), 300);
  assert.equal(crossedMilestone(299, 298), null);
  assert.equal(crossedMilestone(700, 50), 60);
  assert.equal(crossedMilestone(601, 600), 600);
  assert.equal(crossedMilestone(null, 10), null);
});
