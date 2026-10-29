/**
 * Pure helpers of the station hub: course link resolution and status labels from registry.json.
 * 工作站总入口的纯逻辑：根据 registry.json 解析课程链接与状态标签。
 */
import { toBi } from '../../core/text/bilingual.js';

const STATUS = {
  active: { tone: 'accent', zh: '进行中', en: 'Active', linkable: true },
  archived: { tone: 'muted', zh: '已结课', en: 'Archived', linkable: true },
  coming: { tone: 'warn', zh: '筹备中', en: 'Coming soon', linkable: false },
};

const STATUS_ALIASES = {
  current: 'active',
  live: 'active',
  open: 'active',
  past: 'archived',
  finished: 'archived',
  done: 'archived',
  planned: 'coming',
  draft: 'coming',
  upcoming: 'coming',
  'coming-soon': 'coming',
};

/**
 * Absolute http(s) URL of a course site, resolved against the study root; null when unusable.
 * 课程站点的绝对 http(s) 地址（相对 study 根目录解析）；无法使用时返回 null。
 */
export function resolveCourseHref(href, studyRoot) {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    const url = new URL(href.trim(), studyRoot);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function courseStatus(status) {
  const key = String(status ?? '').trim().toLowerCase();
  const id = STATUS[key] ? key : STATUS_ALIASES[key];
  return id ? { id, ...STATUS[id] } : null;
}

/**
 * Registry courses ready for display; entries without a code or title are skipped.
 * 可直接展示的课程列表；既没有课程代码也没有标题的条目会被跳过。
 */
export function hubCourses(registry, studyRoot) {
  const courses = Array.isArray(registry?.courses) ? registry.courses : [];
  return courses
    .filter((course) => course && typeof course === 'object')
    .map((course) => {
      const status = courseStatus(course.status);
      const href = resolveCourseHref(course.href, studyRoot);
      return {
        id: typeof course.id === 'string' ? course.id : '',
        code: typeof course.code === 'string' ? course.code : '',
        title: toBi(course.title),
        term: typeof course.term === 'string' ? course.term : '',
        school: typeof course.school === 'string' ? course.school : '',
        description: toBi(course.description),
        status,
        href: href && (!status || status.linkable) ? href : null,
      };
    })
    .filter((course) => course.code || course.title);
}
