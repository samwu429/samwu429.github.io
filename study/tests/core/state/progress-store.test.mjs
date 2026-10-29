import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_UNIT_PREFIX, createProgressStore } from '../../../engine/core/state/progress-store.js';
import { createFakeStorage } from './fake-storage.mjs';

function setup(entries) {
  const storage = createFakeStorage(entries);
  const events = new EventTarget();
  const seen = [];
  const progress = createProgressStore('csc105h5', { storage, events });
  events.addEventListener(progress.EVENT, (event) => seen.push(event.detail.type));
  return { storage, progress, seen };
}

test('sections are marked, unmarked and counted per unit', () => {
  const { progress, seen } = setup();
  assert.equal(progress.setSectionDone('lec01', 's01-intro', true), true);
  progress.setSectionDone('lec01', 's02-agents', true);
  progress.setSectionDone('lec02', 's01-search', true);
  assert.equal(progress.isSectionDone('lec01', 's01-intro'), true);
  assert.deepEqual(progress.unitProgress('lec01', ['s01-intro', 's02-agents', 's03-rules']), { done: 2, total: 3 });
  progress.setSectionDone('lec01', 's01-intro', false);
  assert.equal(progress.isSectionDone('lec01', 's01-intro'), false);
  assert.deepEqual(progress.unitProgress('lec01', []), { done: 0, total: 0 });
  assert.deepEqual(seen, ['section', 'section', 'section', 'section']);
});

test('a wrong answer enters the mistake book and a later right answer removes it', () => {
  const { progress } = setup();
  assert.equal(progress.recordAnswer('lec01-q01', false), true);
  progress.recordAnswer('lec01-q02', false);
  assert.deepEqual(progress.mistakes(), ['lec01-q01', 'lec01-q02']);
  progress.recordAnswer('lec01-q01', true);
  assert.deepEqual(progress.mistakes(), ['lec01-q02']);
  const attempt = progress.attempt('lec01-q01');
  assert.equal(attempt.tries, 2);
  assert.equal(attempt.correct, 1);
  assert.equal(attempt.last, 'right');
  assert.equal(progress.attempt('lec09-q01'), null);
  assert.deepEqual(Object.keys(progress.attempts()), ['lec01-q01', 'lec01-q02']);
});

test('removeMistake drops one id and leaves the attempts alone', () => {
  const { progress, seen } = setup();
  progress.recordAnswer('lec01-q01', false);
  progress.recordAnswer('lec01-q02', false);
  progress.removeMistake('lec01-q01');
  assert.deepEqual(progress.mistakes(), ['lec01-q02']);
  assert.equal(progress.attempt('lec01-q01').tries, 1);
  assert.equal(seen.at(-1), 'mistake');
});

test('flashcards() returns every stored status at once', () => {
  const { progress } = setup();
  assert.deepEqual(progress.flashcards(), {});
  progress.setFlashcard('agent', 'known');
  progress.setFlashcard('search', 'learning');
  assert.deepEqual(Object.keys(progress.flashcards()), ['agent', 'search']);
  assert.equal(progress.flashcard('agent').status, 'known');
  assert.equal(progress.flashcard('minimax'), null);
});

test('writes report false when storage is full, and the change still holds for the visit', () => {
  const { storage, progress } = setup();
  progress.recordAnswer('lec01-q01', false);
  storage.failWrites = true;
  assert.equal(progress.recordAnswer('lec01-q01', true), false);
  assert.deepEqual(progress.mistakes(), []);
  assert.equal(progress.attempt('lec01-q01').tries, 2);
  assert.equal(progress.setFlashcard('agent', 'known'), false);
  assert.equal(progress.flashcard('agent').status, 'known');
});

test('importData merges keys and reports whether they were saved', () => {
  const { storage, progress, seen } = setup();
  progress.recordAnswer('lec01-q01', false);
  assert.equal(progress.importData({ flashcards: { agent: { status: 'known' } } }), true);
  assert.deepEqual(progress.mistakes(), ['lec01-q01']);
  assert.equal(progress.flashcard('agent').status, 'known');
  storage.failWrites = true;
  assert.equal(progress.importData({ mistakes: [] }), false);
  assert.equal(progress.importData(null), false);
  assert.equal(seen.filter((type) => type === 'import').length, 2);
});

test('replaceAll swaps in the imported progress and removes keys it does not contain', () => {
  const { progress, seen } = setup();
  progress.recordAnswer('lec01-q01', false);
  progress.setLastVisited('lec01', 's01-intro');
  const data = { sections: { 'lec02/s01-search': 1 }, mistakes: ['lec02-q03'] };
  assert.equal(progress.replaceAll(data), true);
  assert.deepEqual(progress.exportData(), data);
  assert.equal(progress.attempt('lec01-q01'), null);
  assert.equal(progress.lastVisited(), null);
  assert.equal(seen.at(-1), 'import');
});

test('replaceAll keeps the previous progress when a write fails', () => {
  const { storage, progress, seen } = setup();
  progress.recordAnswer('lec01-q01', false);
  progress.setSectionDone('lec01', 's01-intro', true);
  const before = progress.exportData();
  const eventsBefore = seen.length;
  storage.failWrites = true;
  assert.equal(progress.replaceAll({ sections: {}, mistakes: ['other'], flashcards: { agent: { status: 'known' } } }), false);
  storage.failWrites = false;
  assert.deepEqual(progress.exportData(), before);
  assert.deepEqual(progress.mistakes(), ['lec01-q01']);
  assert.equal(progress.flashcard('agent'), null);
  assert.equal(seen.length, eventsBefore);
  assert.equal(progress.replaceAll('nope'), false);
});

test('reset clears every key of the course and only that course', () => {
  const storage = createFakeStorage({ 'topphi-study:other-course:mistakes': '["x"]' });
  const progress = createProgressStore('csc105h5', { storage, events: new EventTarget() });
  progress.recordAnswer('lec01-q01', false);
  progress.setSectionDone(`${PLAN_UNIT_PREFIX}test2`, 'd0-t0', true);
  progress.reset();
  assert.deepEqual(progress.exportData(), {});
  assert.equal(storage.raw.get('topphi-study:other-course:mistakes'), '["x"]');
});

test('the store works without an event target', () => {
  const progress = createProgressStore('csc105h5', { storage: createFakeStorage(), events: null });
  assert.equal(progress.setSectionDone('lec01', 's01', true), true);
  assert.equal(PLAN_UNIT_PREFIX, 'plan-');
});
