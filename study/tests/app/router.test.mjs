import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePath } from '../../engine/app/router.js';
import { ROUTES } from '../../engine/app/routes.js';

function match(path, url) {
  const { regex, keys } = compilePath(path);
  const found = regex.exec(url);
  if (!found) return null;
  return Object.fromEntries(keys.map((key, index) => [key, found[index + 1]]).filter(([, value]) => value !== undefined));
}

test('root path matches only the root', () => {
  assert.deepEqual(match('/', '/'), {});
  assert.equal(match('/', '/learn'), null);
});

test('required and optional params are captured', () => {
  assert.deepEqual(match('/learn/:unitId/:sectionId?', '/learn/lec03'), { unitId: 'lec03' });
  assert.deepEqual(match('/learn/:unitId/:sectionId?', '/learn/lec03/s02-state-tree'), { unitId: 'lec03', sectionId: 's02-state-tree' });
});

test('params reject characters outside lowercase kebab-case', () => {
  assert.equal(match('/learn/:unitId', '/learn/LEC03'), null);
  assert.equal(match('/learn/:unitId', '/learn/lec03%3Cscript%3E'), null);
  assert.equal(match('/glossary/:termId?', '/glossary/a--b'), null);
});

test('static practice route is not shadowed by other routes', () => {
  const runRoute = ROUTES.find((route) => route.name === 'practice-run');
  assert.ok(compilePath(runRoute.path).regex.test('/practice/run'));
  const firstMatch = ROUTES.find((route) => compilePath(route.path).regex.test('/practice/run'));
  assert.equal(firstMatch.name, 'practice-run');
});

test('every route has a unique name and a lazy loader', () => {
  const names = new Set(ROUTES.map((route) => route.name));
  assert.equal(names.size, ROUTES.length);
  for (const route of ROUTES) assert.equal(typeof route.load, 'function');
});
