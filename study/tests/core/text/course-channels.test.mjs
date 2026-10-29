import { test } from 'node:test';
import assert from 'node:assert/strict';

import { announcementChannels } from '../../../engine/core/text/course-channels.js';

test('two channels read as "A / B" in Chinese and "A and B" in English', () => {
  assert.deepEqual(announcementChannels({ announcements: ['Quercus', 'Piazza'] }), { zh: 'Quercus / Piazza', en: 'Quercus and Piazza' });
});

test('one channel is named on its own and three are listed', () => {
  assert.deepEqual(announcementChannels({ announcements: [' Quercus '] }), { zh: 'Quercus', en: 'Quercus' });
  assert.deepEqual(announcementChannels({ announcements: ['Quercus', 'Piazza', 'Email'] }),
    { zh: 'Quercus / Piazza / Email', en: 'Quercus, Piazza and Email' });
});

test('a course without usable channels gets the generic wording', () => {
  for (const course of [undefined, {}, { announcements: 'Quercus' }, { announcements: ['', 3, null] }]) {
    assert.deepEqual(announcementChannels(course), { zh: '课程官方通知', en: "the course's official channels" });
  }
});
