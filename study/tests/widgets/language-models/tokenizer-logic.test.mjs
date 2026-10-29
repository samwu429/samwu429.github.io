import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOY_VOCABULARY,
  buildVocabulary,
  characterCount,
  sharedPieces,
  slashNotation,
  splitSegments,
  tokenize,
  tokenizeSegment,
  vocabularyGroups,
} from '../../../engine/widgets/language-models/tokenizer-toy/tokenizer-logic.js';

const pieces = (text) => tokenize(text).tokens.map((token) => token.text);

test('the slide example splits exactly like the lecture', () => {
  const result = tokenize('The student daydreamed in class.');
  assert.equal(slashNotation(result), 'The/student/day/dream/ed/in/class/.');
  assert.equal(result.tokenCount, 8);
  assert.deepEqual(pieces('daydreamed'), ['day', 'dream', 'ed']);
});

test('related words share the stem jump', () => {
  assert.deepEqual(pieces('jump jumps jumping jumped'), ['jump', 'jump', 's', 'jump', 'ing', 'jump', 'ed']);
  const shared = sharedPieces(tokenize('jump jumps jumping jumped'));
  assert.equal(shared.length, 1);
  assert.equal(shared[0].text, 'jump');
  assert.deepEqual(shared[0].words, ['jump', 'jumps', 'jumping', 'jumped']);
});

test('prefixes, suffixes and apostrophes', () => {
  assert.deepEqual(pieces('unhappy'), ['un', 'happy']);
  assert.deepEqual(pieces('replayed'), ['re', 'play', 'ed']);
  assert.deepEqual(pieces("let's"), ['let', "'s"]);
  assert.deepEqual(pieces('don’t'), ['do', 'n’t']);
  assert.deepEqual(pieces('sandwiches'), ['sandwich', 'es']);
});

test('token kinds describe how each piece was used', () => {
  const [daydreamed] = tokenize('daydreamed').segments;
  assert.deepEqual(daydreamed.tokens.map((token) => token.kind), ['piece', 'piece', 'piece']);
  assert.equal(tokenize('class').tokens[0].kind, 'word');
  assert.equal(tokenize('.').tokens[0].kind, 'punct');
  assert.equal(tokenize('7').tokens[0].kind, 'digit');
});

test('unknown words fall back to smaller pieces and unknown symbols get no id', () => {
  const result = tokenize('Mississauga');
  assert.equal(result.tokens.map((token) => token.text).join(''), 'Mississauga');
  assert.ok(result.tokenCount > 3);
  assert.ok(result.tokens.some((token) => token.kind === 'letter'));
  const unknown = tokenize('你好');
  assert.equal(unknown.tokenCount, 2);
  assert.ok(unknown.tokens.every((token) => token.id === null && token.kind === 'unknown'));
});

test('ids are stable and case-insensitive', () => {
  const upper = tokenize('THE').tokens[0];
  const lower = tokenize('the').tokens[0];
  assert.equal(upper.text, 'THE');
  assert.equal(upper.id, lower.id);
  assert.equal(typeof upper.id, 'number');
  const ids = [...TOY_VOCABULARY.entries.values()].map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('segments, character counts and empty input', () => {
  assert.deepEqual(splitSegments('y=3x+1').map((segment) => segment.kind), ['word', 'symbol', 'digit', 'word', 'symbol', 'digit']);
  assert.equal(characterCount('The student daydreamed in class.'), 28);
  assert.equal(tokenize('').tokenCount, 0);
  assert.equal(tokenize(null).tokenCount, 0);
  assert.deepEqual(sharedPieces(tokenize('')), []);
});

test('a custom vocabulary is respected by greedy longest match', () => {
  const vocabulary = buildVocabulary([['stem', ['ab', 'abc']], ['letter', ['a', 'b', 'c', 'd']]]);
  assert.deepEqual(tokenizeSegment({ text: 'abcd' }, vocabulary).map((token) => token.text), ['abc', 'd']);
  assert.ok(vocabularyGroups().some((group) => group.kind === 'suffix' && group.pieces.some((piece) => piece.text === 'ing')));
});
