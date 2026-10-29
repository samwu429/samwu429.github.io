import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASK, answerVariants, hasVisibleClue, maskAnswer } from '../../../engine/views/flashcards/logic/answer-mask.js';

test('answerVariants lists the full name, the bare name and aliases, longest first', () => {
  assert.deepEqual(answerVariants('State tree (game tree)'), ['State tree (game tree)', 'State tree', 'game tree']);
  assert.deepEqual(answerVariants('**Minimax**'), ['Minimax']);
  assert.deepEqual(answerVariants('A'), []);
  assert.deepEqual(answerVariants(undefined), []);
});

test('maskAnswer hides the English term inside Chinese text, ignoring case', () => {
  assert.equal(maskAnswer('Minimax（极小化极大算法）', 'Minimax'), `${MASK}（极小化极大算法）`);
  assert.equal(maskAnswer('用 heuristic 打分', 'Heuristic (heuristic evaluation function)'), `用 ${MASK} 打分`);
  assert.equal(maskAnswer('画成 STATE TREE 或 game tree', 'State tree (game tree)'), `画成 ${MASK} 或 ${MASK}`);
});

test('maskAnswer treats spaces, hyphens and underscores alike and covers plurals', () => {
  assert.equal(maskAnswer('数 three_in_a_row 的个数', 'Three-in-a-row'), `数 ${MASK} 的个数`);
  assert.equal(maskAnswer('这些 features 很重要', 'Feature'), `这些 ${MASK} 很重要`);
});

test('maskAnswer only replaces whole words', () => {
  assert.equal(maskAnswer('statement 和 state', 'State'), `statement 和 ${MASK}`);
  assert.equal(maskAnswer('**state**', 'State'), `**${MASK}**`);
});

test('maskAnswer escapes regular-expression characters in the term', () => {
  assert.equal(maskAnswer('学 C++ 和 C', 'C++'), `学 ${MASK} 和 C`);
  assert.equal(maskAnswer('无关文字', '(.*)'), '无关文字');
});

test('maskAnswer returns the input when there is nothing to hide', () => {
  assert.equal(maskAnswer('状态', 'State'), '状态');
  assert.equal(maskAnswer('', 'State'), '');
  assert.equal(maskAnswer(undefined, 'State'), '');
  assert.equal(maskAnswer('状态', ''), '状态');
});

test('hasVisibleClue is false when only blanks and punctuation are left', () => {
  assert.equal(hasVisibleClue(`${MASK}（极小化极大算法）`), true);
  assert.equal(hasVisibleClue(`${MASK}（${MASK}）`), false);
  assert.equal(hasVisibleClue(''), false);
  assert.equal(hasVisibleClue(undefined), false);
});
