import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseStatus, hubCourses, resolveCourseHref } from '../../../engine/views/hub/hub-logic.js';

const STUDY_ROOT = new URL('https://topphi.com/study/');

test('resolveCourseHref resolves relative links against the study root', () => {
  assert.equal(resolveCourseHref('../csc105h5/', STUDY_ROOT), 'https://topphi.com/csc105h5/');
  assert.equal(resolveCourseHref('https://example.org/x/', STUDY_ROOT), 'https://example.org/x/');
  assert.equal(resolveCourseHref('javascript:alert(1)', STUDY_ROOT), null);
  assert.equal(resolveCourseHref('', STUDY_ROOT), null);
  assert.equal(resolveCourseHref(undefined, STUDY_ROOT), null);
});

test('courseStatus maps known statuses and aliases', () => {
  assert.equal(courseStatus('active').zh, '进行中');
  assert.equal(courseStatus('Planned').id, 'coming');
  assert.equal(courseStatus('past').id, 'archived');
  assert.equal(courseStatus('coming').linkable, false);
  assert.equal(courseStatus('mystery'), null);
  assert.equal(courseStatus(undefined), null);
});

test('hubCourses normalises registry entries', () => {
  const courses = hubCourses({
    courses: [
      { id: 'csc105h5', code: 'CSC105H5', title: { zh: '人工智能素养', en: 'AI Literacy' }, href: '../csc105h5/', status: 'active', description: { zh: '描述', en: 'Description' } },
      { id: 'next', code: 'MAT135', href: '../mat135/', status: 'coming' },
      { id: 'nothing' },
      null,
    ],
  }, STUDY_ROOT);
  assert.equal(courses.length, 2);
  assert.equal(courses[0].href, 'https://topphi.com/csc105h5/');
  assert.deepEqual(courses[0].title, { zh: '人工智能素养', en: 'AI Literacy' });
  assert.equal(courses[0].status.id, 'active');
  assert.equal(courses[1].href, null);
  assert.equal(courses[1].title, null);
  assert.deepEqual(hubCourses(null, STUDY_ROOT), []);
});
