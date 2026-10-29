import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GAP,
  RATING,
  againCount,
  createSession,
  currentCard,
  isFinished,
  rateCard,
  requeueIndex,
  sessionStats,
} from '../../../engine/views/flashcards/logic/deck-queue.js';

const { AGAIN, KNOW } = RATING;

test('createSession keeps the order and drops duplicates and invalid ids', () => {
  const session = createSession(['a', 'b', 'a', '', null, 7, 'c']);
  assert.deepEqual(session.deck, ['a', 'b', 'c']);
  assert.deepEqual(session.queue, ['a', 'b', 'c']);
  assert.equal(currentCard(session), 'a');
  assert.equal(isFinished(session), false);
  assert.equal(isFinished(createSession()), true);
  assert.equal(currentCard(createSession([])), null);
});

test('"Know" retires the current card', () => {
  const session = rateCard(createSession(['a', 'b']), KNOW);
  assert.deepEqual(session.queue, ['b']);
  assert.deepEqual(session.known, ['a']);
  assert.equal(session.reviews, 1);
});

test('"Again" brings the card back after a few other cards', () => {
  const session = rateCard(createSession(['a', 'b', 'c', 'd', 'e', 'f']), AGAIN);
  assert.equal(DEFAULT_GAP, 3);
  assert.deepEqual(session.queue, ['b', 'c', 'd', 'a', 'e', 'f']);
  assert.equal(againCount(session, 'a'), 1);
  assert.deepEqual(session.known, []);
});

test('"Again" near the end of the queue goes to the end', () => {
  const session = rateCard(createSession(['a', 'b']), AGAIN);
  assert.deepEqual(session.queue, ['b', 'a']);
  const alone = rateCard(createSession(['x']), AGAIN);
  assert.deepEqual(alone.queue, ['x']);
  assert.equal(currentCard(alone), 'x');
});

test('a custom gap is respected', () => {
  const session = rateCard(createSession(['a', 'b', 'c', 'd']), AGAIN, { gap: 1 });
  assert.deepEqual(session.queue, ['b', 'a', 'c', 'd']);
});

test('rateCard never mutates the previous session', () => {
  const start = createSession(['a', 'b', 'c']);
  const snapshot = JSON.stringify(start);
  rateCard(start, AGAIN);
  rateCard(start, KNOW);
  assert.equal(JSON.stringify(start), snapshot);
});

test('unknown ratings and finished sessions are returned unchanged', () => {
  const start = createSession(['a']);
  assert.equal(rateCard(start, 'maybe'), start);
  const done = rateCard(start, KNOW);
  assert.equal(isFinished(done), true);
  assert.equal(rateCard(done, KNOW), done);
});

test('requeueIndex clamps to the cards still waiting and sanitises the gap', () => {
  assert.equal(requeueIndex(10, 3), 3);
  assert.equal(requeueIndex(2, 3), 2);
  assert.equal(requeueIndex(0, 3), 0);
  assert.equal(requeueIndex(10, 0), DEFAULT_GAP);
  assert.equal(requeueIndex(10, Number.NaN), DEFAULT_GAP);
  assert.equal(requeueIndex(-4, 3), 0);
});

test('ids that collide with Object.prototype names are counted correctly', () => {
  const session = rateCard(createSession(['constructor', 'to-string']), AGAIN);
  assert.equal(againCount(session, 'constructor'), 1);
  assert.equal(againCount(session, 'hasOwnProperty'), 0);
  assert.equal(againCount(null, 'a'), 0);
});

test('a full round ends with every card known and summarises first tries', () => {
  let session = createSession(['a', 'b', 'c']);
  session = rateCard(session, AGAIN); // a -> back of the queue: b c a
  session = rateCard(session, KNOW); // b known
  session = rateCard(session, KNOW); // c known
  session = rateCard(session, AGAIN); // a again, alone: a
  session = rateCard(session, KNOW); // a known
  assert.equal(isFinished(session), true);
  const stats = sessionStats(session);
  assert.deepEqual(
    { total: stats.total, known: stats.known, remaining: stats.remaining, neededAgain: stats.neededAgain, firstTry: stats.firstTry, reviews: stats.reviews, finished: stats.finished },
    { total: 3, known: 3, remaining: 0, neededAgain: 1, firstTry: 2, reviews: 5, finished: true },
  );
  assert.deepEqual(stats.missedIds, ['a']);
  assert.deepEqual(stats.reviewIds, ['a']);
});

test('sessionStats of a round ended early lists missed and unseen cards for review', () => {
  let session = createSession(['a', 'b', 'c', 'd']);
  session = rateCard(session, KNOW); // a known
  session = rateCard(session, AGAIN); // b again
  const stats = sessionStats(session);
  assert.equal(stats.finished, false);
  assert.equal(stats.known, 1);
  assert.equal(stats.remaining, 3);
  assert.equal(stats.firstTry, 1);
  assert.deepEqual(stats.missedIds, ['b']);
  assert.deepEqual(stats.reviewIds, ['b', 'c', 'd']);
});

test('sessionStats copes with a missing session', () => {
  const stats = sessionStats(null);
  assert.equal(stats.total, 0);
  assert.equal(stats.finished, true);
  assert.deepEqual(stats.reviewIds, []);
});
