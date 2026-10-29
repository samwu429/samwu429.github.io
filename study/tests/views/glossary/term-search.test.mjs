import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_QUERY_SCORE,
  SCORE,
  buildSearchEntry,
  matchScore,
  nameVariants,
  normalizeText,
} from '../../../engine/views/glossary/logic/term-search.js';

const STATE_TREE = {
  id: 'state-tree',
  en: 'State tree (game tree)',
  zh: '状态树（游戏树）',
  def: { en: 'A diagram used to visualize **search**. Each state is a node.', zh: '把搜索画成树：每个状态是一个节点（**node**）。' },
  example: { zh: '推箱子的部分状态树。', en: 'A partial Sokoban tree.' },
};

test('normalizeText lower-cases, strips markup and folds full-width characters', () => {
  assert.equal(normalizeText('**State** `tree`'), 'state tree');
  assert.equal(normalizeText('状态树（游戏树）'), '状态树(游戏树)');
  assert.equal(normalizeText('ＡＢＣ　Def'), 'abc def');
});

test('normalizeText treats hyphens, dashes and underscores as spaces', () => {
  assert.equal(normalizeText('Three-in-a-row'), 'three in a row');
  assert.equal(normalizeText('three_in_a_row'), 'three in a row');
  assert.equal(normalizeText('win – loss'), 'win loss');
  assert.equal(normalizeText('  many   spaces\n here '), 'many spaces here');
});

test('normalizeText copes with missing or non-string values', () => {
  assert.equal(normalizeText(undefined), '');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(42), '42');
});

test('nameVariants yields the full name, the bracket-free name and each alias', () => {
  const variants = nameVariants('State tree (game tree)');
  assert.ok(variants.includes('state tree (game tree)'));
  assert.ok(variants.includes('state tree'));
  assert.ok(variants.includes('game tree'));
  const chinese = nameVariants('状态树（游戏树）');
  assert.ok(chinese.includes('状态树'));
  assert.ok(chinese.includes('游戏树'));
});

test('nameVariants splits alternatives separated by a slash', () => {
  const variants = nameVariants('（游戏的）规则 / 动态');
  assert.ok(variants.includes('规则'));
  assert.ok(variants.includes('动态'));
  assert.ok(variants.includes('游戏的'));
  assert.deepEqual(nameVariants(''), []);
  assert.deepEqual(nameVariants(undefined), []);
});

test('buildSearchEntry indexes names, id, definition and example', () => {
  const entry = buildSearchEntry(STATE_TREE);
  assert.ok(entry.names.includes('state tree'));
  assert.ok(entry.names.includes('状态树'));
  assert.ok(entry.details.includes('visualize search'));
  assert.ok(entry.details.includes('节点(node)'));
  assert.ok(entry.extra.includes('sokoban'));
});

test('buildSearchEntry tolerates absent optional fields', () => {
  const entry = buildSearchEntry({ id: 'bare', en: 'Bare' });
  assert.deepEqual(entry.names, ['bare']);
  assert.equal(entry.details, '');
  assert.equal(entry.extra, '');
  assert.deepEqual(buildSearchEntry(null).names, []);
});

test('matchScore ranks name matches above definition and example matches', () => {
  const entry = buildSearchEntry(STATE_TREE);
  assert.equal(matchScore(entry, 'game tree'), SCORE.EXACT);
  assert.equal(matchScore(entry, 'state'), SCORE.PREFIX);
  assert.equal(matchScore(entry, 'tree'), SCORE.WORD);
  assert.equal(matchScore(entry, 'ree'), SCORE.NAME);
  assert.equal(matchScore(entry, 'tree game'), SCORE.NAME_WORDS);
  assert.equal(matchScore(entry, 'diagram'), SCORE.DEFINITION);
  assert.equal(matchScore(entry, 'tree diagram'), SCORE.DEFINITION);
  assert.equal(matchScore(entry, 'sokoban'), SCORE.EXAMPLE);
  assert.equal(matchScore(entry, 'regression'), SCORE.NONE);
});

test('matchScore works for Chinese queries and the term id', () => {
  const entry = buildSearchEntry(STATE_TREE);
  assert.equal(matchScore(entry, normalizeText('游戏树')), SCORE.EXACT);
  assert.equal(matchScore(entry, normalizeText('态树')), SCORE.NAME);
  assert.equal(matchScore(entry, normalizeText('节点')), SCORE.DEFINITION);
  assert.equal(matchScore(entry, normalizeText('state-tree')), SCORE.EXACT);
  assert.equal(matchScore(buildSearchEntry({ id: 'win-threat', en: 'Win threat (win_threat)' }), normalizeText('win_threat')), SCORE.EXACT);
});

test('matchScore is case-insensitive and ignores markup once the query is normalised', () => {
  const entry = buildSearchEntry(STATE_TREE);
  assert.equal(matchScore(entry, normalizeText('VISUALIZE **Search**')), SCORE.DEFINITION);
  assert.equal(matchScore(entry, normalizeText('STATE TREE')), SCORE.EXACT);
});

test('matchScore matches everything for an empty query and nothing for a missing entry', () => {
  assert.equal(matchScore(buildSearchEntry(STATE_TREE), ''), EMPTY_QUERY_SCORE);
  assert.equal(matchScore(null, 'tree'), SCORE.NONE);
});
