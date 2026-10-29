import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrangeTerms,
  collectSources,
  countByUnit,
  letterOf,
  prepareEntries,
  sortKey,
} from '../../../engine/views/glossary/logic/term-list.js';

const UNIT_ORDER = ['lec01', 'lec03', 'lab03', 'lab04'];

// Shaped like repo.allTerms(): merged terms in course order, each with units[].
// 与 repo.allTerms() 的结果同形：按课程顺序合并的术语，每项带 units[]。
const TERMS = [
  { id: 'agent', en: 'Agent', zh: '智能体', def: { en: 'Something that acts.', zh: '会行动的东西。' }, slides: '4', units: ['lec01'] },
  { id: 'minimax', en: 'Minimax', zh: 'Minimax（极小化极大算法）', def: { en: 'Carries values up the tree.', zh: '从下往上算值。' }, slides: '30-41', units: ['lec03', 'lab03'] },
  { id: 'heuristic', en: 'Heuristic', zh: '启发式', def: { en: 'Estimates the goodness of a state.', zh: '估分。' }, slides: '44', units: ['lec03'] },
  { id: 'combined', en: "'Combined' heuristic", zh: '组合启发式', def: { en: 'A weighted sum used in the lab.', zh: '加权和。' }, units: ['lab03'] },
  { id: 'accuracy', en: 'Accuracy', zh: '准确率', def: { en: 'Share of correct predictions.', zh: '预测对的比例。' }, slides: '9', units: ['lab04'] },
  { id: 'f1', en: '2-player game', zh: '双人游戏', def: { en: 'A game for two players.', zh: '两人对战。' }, units: ['lec03'] },
];

const UNIT_FILES = [
  { unitId: 'lec01', terms: [{ id: 'agent', slides: '4' }] },
  { unitId: 'lec03', terms: [{ id: 'f1' }, { id: 'heuristic', slides: '44' }, { id: 'minimax', slides: '30-41' }] },
  { unitId: 'lab03', terms: [{ id: 'combined' }, { id: 'minimax', slides: '5' }, { id: 'minimax', slides: '99' }] },
  { unitId: 'lab04', terms: [{ id: 'accuracy', slides: '9' }] },
];

const ids = (items) => items.map((entry) => entry.term.id);

test('sortKey and letterOf ignore leading quotes and put digits under "#"', () => {
  assert.equal(sortKey("'Combined' heuristic"), "combined' heuristic");
  assert.equal(letterOf(sortKey("'Combined' heuristic")), 'C');
  assert.equal(letterOf(sortKey('2-player game')), '#');
  assert.equal(letterOf(''), '#');
});

test('collectSources keeps per-unit slides and positions, once per unit', () => {
  const sources = collectSources(UNIT_FILES);
  assert.deepEqual(sources.get('minimax'), [
    { unitId: 'lec03', slides: '30-41', order: 2 },
    { unitId: 'lab03', slides: '5', order: 1 },
  ]);
  assert.deepEqual(sources.get('combined'), [{ unitId: 'lab03', slides: '', order: 0 }]);
  assert.equal(collectSources([null, { unitId: 'x' }, { terms: [] }]).size, 0);
});

test('prepareEntries falls back to the merged slides for the first unit only', () => {
  const entries = prepareEntries(TERMS);
  const minimax = entries.find((entry) => entry.term.id === 'minimax');
  assert.deepEqual(minimax.sources.map((source) => [source.unitId, source.slides]), [['lec03', '30-41'], ['lab03', '']]);
});

test('prepareEntries prefers per-unit sources and skips invalid or duplicate terms', () => {
  const entries = prepareEntries([...TERMS, null, { en: 'No id' }, { ...TERMS[0] }], collectSources(UNIT_FILES));
  assert.equal(entries.length, TERMS.length);
  const minimax = entries.find((entry) => entry.term.id === 'minimax');
  assert.deepEqual(minimax.sources.map((source) => [source.unitId, source.slides]), [['lec03', '30-41'], ['lab03', '5']]);
  assert.deepEqual(prepareEntries(undefined), []);
});

test('countByUnit counts a shared term in each of its units', () => {
  const counts = countByUnit(prepareEntries(TERMS));
  assert.equal(counts.get('lec03'), 3);
  assert.equal(counts.get('lab03'), 2);
  assert.equal(counts.get('lab04'), 1);
});

test('arrangeTerms groups A-Z by first letter without a query', () => {
  const result = arrangeTerms(prepareEntries(TERMS), { unitOrder: UNIT_ORDER });
  assert.equal(result.total, 6);
  assert.equal(result.count, 6);
  assert.deepEqual(result.groups.map((group) => group.letter), ['#', 'A', 'C', 'H', 'M']);
  assert.deepEqual(ids(result.groups[1].items), ['accuracy', 'agent']);
});

test('arrangeTerms ranks search results in one group, best match first', () => {
  const result = arrangeTerms(prepareEntries(TERMS), { query: 'heuristic', unitOrder: UNIT_ORDER });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].kind, 'results');
  assert.deepEqual(ids(result.groups[0].items), ['heuristic', 'combined']);
});

test('arrangeTerms matches definitions and Chinese text, ignoring case', () => {
  const entries = prepareEntries(TERMS);
  assert.deepEqual(ids(arrangeTerms(entries, { query: 'WEIGHTED SUM' }).groups[0].items), ['combined']);
  assert.deepEqual(ids(arrangeTerms(entries, { query: '准确' }).groups[0].items), ['accuracy']);
  const none = arrangeTerms(entries, { query: 'zzz' });
  assert.equal(none.count, 0);
  assert.deepEqual(none.groups, []);
});

test('arrangeTerms filters by unit, keeping shared terms', () => {
  const result = arrangeTerms(prepareEntries(TERMS), { units: ['lab03'], unitOrder: UNIT_ORDER });
  assert.equal(result.count, 2);
  assert.deepEqual(result.groups.flatMap((group) => ids(group.items)), ['combined', 'minimax']);
});

test('arrangeTerms by unit follows course order and per-unit positions', () => {
  const entries = prepareEntries(TERMS, collectSources(UNIT_FILES));
  const result = arrangeTerms(entries, { sort: 'unit', unitOrder: UNIT_ORDER });
  assert.deepEqual(result.groups.map((group) => group.unitId), ['lec01', 'lec03', 'lab03', 'lab04']);
  assert.deepEqual(ids(result.groups[1].items), ['f1', 'heuristic', 'minimax']);
  // Minimax is listed once, under its first unit. Minimax 只出现一次，归入第一个单元。
  assert.deepEqual(ids(result.groups[2].items), ['combined']);
});

test('arrangeTerms by unit places a shared term under the first selected unit', () => {
  const entries = prepareEntries(TERMS, collectSources(UNIT_FILES));
  const result = arrangeTerms(entries, { sort: 'unit', units: ['lab03', 'lab04'], unitOrder: UNIT_ORDER });
  assert.deepEqual(result.groups.map((group) => group.unitId), ['lab03', 'lab04']);
  assert.deepEqual(ids(result.groups[0].items), ['combined', 'minimax']);
});

test('arrangeTerms by unit ranks matches inside each unit group', () => {
  const entries = prepareEntries(TERMS, collectSources(UNIT_FILES));
  const result = arrangeTerms(entries, { sort: 'unit', query: 'heuristic', unitOrder: UNIT_ORDER });
  assert.deepEqual(result.groups.map((group) => [group.unitId, ids(group.items)]), [
    ['lec03', ['heuristic']],
    ['lab03', ['combined']],
  ]);
});

test('arrangeTerms puts units missing from the course order last', () => {
  const entries = prepareEntries([{ id: 'x', en: 'X', units: ['extra'] }, ...TERMS]);
  const result = arrangeTerms(entries, { sort: 'unit', unitOrder: UNIT_ORDER });
  assert.equal(result.groups[result.groups.length - 1].unitId, 'extra');
});
