import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerIndex, judgeChoice, optionStates } from '../../../../engine/views/lesson/blocks/check-logic.js';

test('only an index pointing at a real option counts as an answer', () => {
  assert.equal(answerIndex(1, 4), 1);
  assert.equal(answerIndex(0, 3), 0);
  assert.equal(answerIndex(4, 4), null);
  assert.equal(answerIndex(-1, 4), null);
  assert.equal(answerIndex(1.5, 4), null);
  assert.equal(answerIndex('1', 4), null);
  assert.equal(answerIndex(true, 4), null);
});

test('a choice is correct, wrong, or unknown without a valid answer', () => {
  assert.equal(judgeChoice(2, 2), 'correct');
  assert.equal(judgeChoice(2, 0), 'wrong');
  assert.equal(judgeChoice(null, 0), 'unknown');
});

test('after a wrong pick the right answer is still revealed', () => {
  assert.deepEqual(optionStates(1, 0, 4), ['wrong', 'correct', 'dimmed', 'dimmed']);
  assert.deepEqual(optionStates(1, 1, 3), ['dimmed', 'correct', 'dimmed']);
  assert.deepEqual(optionStates(null, 2, 3), ['dimmed', 'dimmed', 'chosen']);
  assert.deepEqual(optionStates(0, 0, 0), []);
});
