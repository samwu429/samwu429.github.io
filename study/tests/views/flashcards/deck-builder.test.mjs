import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS,
  buildDeck,
  readStatuses,
  statusCounts,
  termsInUnits,
} from '../../../engine/views/flashcards/logic/deck-builder.js';

const TERMS = [
  { id: 'agent', units: ['lec01'] },
  { id: 'search', units: ['lec03', 'lab03'] },
  { id: 'minimax', units: ['lec03'] },
  { id: 'heuristic', units: ['lec03'] },
  { id: 'feature', units: ['lab03'] },
  { id: 'accuracy', units: ['lab04'] },
];

const STATUSES = new Map([
  ['agent', STATUS.KNOWN],
  ['search', STATUS.LEARNING],
  ['minimax', STATUS.KNOWN],
  ['feature', STATUS.LEARNING],
]);
const statusOf = (id) => STATUSES.get(id) || null;

// Deterministic pseudo-random source (linear congruential generator).
// 可复现的伪随机数（线性同余生成器）。
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test('termsInUnits keeps terms from any selected unit; empty selection keeps all', () => {
  assert.deepEqual(termsInUnits(TERMS, ['lab03']).map((term) => term.id), ['search', 'feature']);
  assert.equal(termsInUnits(TERMS, []).length, TERMS.length);
  assert.deepEqual(termsInUnits([null, { id: 'x' }, { units: ['lec01'] }], ['lec01']), []);
});

test('statusCounts splits known, learning and fresh cards', () => {
  assert.deepEqual(statusCounts(TERMS, statusOf), { total: 6, known: 2, learning: 2, fresh: 2 });
  assert.deepEqual(statusCounts([], statusOf), { total: 0, known: 0, learning: 0, fresh: 0 });
});

test('buildDeck in course order filters by unit', () => {
  assert.deepEqual(buildDeck(TERMS, { units: ['lec03'], shuffle: false }), ['search', 'minimax', 'heuristic']);
  assert.deepEqual(buildDeck(TERMS, { shuffle: false }), TERMS.map((term) => term.id));
});

test('buildDeck can leave out known cards', () => {
  assert.deepEqual(
    buildDeck(TERMS, { onlyUnfamiliar: true, statusOf, shuffle: false }),
    ['search', 'heuristic', 'feature', 'accuracy'],
  );
});

test('buildDeck keeps cards that need work when the size limit cuts the deck', () => {
  // Learning cards first, then fresh ones; known cards only fill what is left.
  // 先保留“不熟过”的卡，再保留没学过的，已认识的只用来补足剩余名额。
  assert.deepEqual(buildDeck(TERMS, { statusOf, size: 3, shuffle: false }), ['search', 'heuristic', 'feature']);
  assert.deepEqual(buildDeck(TERMS, { statusOf, size: 5, shuffle: false }), ['agent', 'search', 'heuristic', 'feature', 'accuracy']);
});

test('buildDeck shuffles deterministically with an injected random source', () => {
  const first = buildDeck(TERMS, { random: seeded(42) });
  const second = buildDeck(TERMS, { random: seeded(42) });
  assert.deepEqual(first, second);
  assert.deepEqual([...first].sort(), TERMS.map((term) => term.id).sort());
  const limited = buildDeck(TERMS, { statusOf, size: 2, random: seeded(3) });
  assert.deepEqual([...limited].sort(), ['feature', 'search']);
});

test('buildDeck ignores invalid sizes and duplicate terms', () => {
  const withDuplicate = [...TERMS, { id: 'agent', units: ['lec01'] }];
  assert.equal(buildDeck(withDuplicate, { shuffle: false, size: 0 }).length, TERMS.length);
  assert.equal(buildDeck(withDuplicate, { shuffle: false, size: Number.NaN }).length, TERMS.length);
  assert.deepEqual(buildDeck(undefined), []);
});

test('readStatuses reads every stored status once when the store offers flashcards()', () => {
  let reads = 0;
  const progress = {
    flashcards() {
      reads += 1;
      return { agent: { status: 'known', at: 1 }, constructor: { status: 'learning', at: 2 } };
    },
    flashcard() {
      throw new Error('per-term reads should not be needed');
    },
    exportData() {
      throw new Error('the backup export should not be needed');
    },
  };
  const statuses = readStatuses(progress, ['agent', 'search', 'constructor', 'toString']);
  assert.equal(reads, 1);
  assert.equal(statuses.get('agent'), 'known');
  assert.equal(statuses.get('search'), null);
  assert.equal(statuses.get('constructor'), 'learning');
  assert.equal(statuses.get('toString'), null);
});

test('readStatuses treats an empty or broken store as "nothing stored"', () => {
  assert.equal(readStatuses({ flashcards: () => ({}) }, ['agent']).get('agent'), null);
  assert.equal(readStatuses({ flashcards: () => null }, ['agent']).get('agent'), null);
});

test('readStatuses falls back to per-term reads when the bulk read fails', () => {
  const progress = {
    flashcards() {
      throw new Error('storage blocked');
    },
    flashcard: (id) => (id === 'search' ? { status: 'learning' } : null),
  };
  const statuses = readStatuses(progress, ['agent', 'search']);
  assert.equal(statuses.get('agent'), null);
  assert.equal(statuses.get('search'), 'learning');
  assert.equal(readStatuses(null, ['agent']).get('agent'), null);
});
