/**
 * Entry point of a course site. The host page declares the course on <body>:
 *   <body data-course="csc105h5" data-study-root="../study/">
 * 课程站点入口。宿主页面在 <body> 上声明课程 id 与工作站根目录。
 *
 * Boot order: preferences -> course pack -> shell -> router. Each route renders into a fresh
 * container and may return a cleanup function (timers, listeners) that runs on navigation.
 * 启动顺序：偏好 -> 课程包 -> 外壳 -> 路由。每个路由渲染到全新容器，可返回清理函数（定时器、监听器），在跳转时执行。
 */
import { h, replaceContent } from '../core/dom/element.js';
import { createCourseRepository } from '../core/data/course-repository.js';
import { createProgressStore } from '../core/state/progress-store.js';
import { createPreferencesStore } from '../core/state/preferences-store.js';
import { stopSpeaking } from '../core/text/speech.js';
import { isRouteId } from '../core/util/ids.js';
import { errorState, loadingState } from '../components/feedback/states.js';
import { createRouter } from './router.js';
import { ROUTES } from './routes.js';
import { createShell } from './shell.js';
import { installLanguageReveal } from './language-reveal.js';

async function boot() {
  const root = document.getElementById('app');
  const courseId = document.body.dataset.course || '';
  if (!isRouteId(courseId)) {
    replaceContent(root, errorState(new Error('Invalid course id on <body data-course>.')));
    return;
  }

  const preferences = createPreferencesStore();
  preferences.apply();
  installLanguageReveal(preferences);

  const studyRoot = new URL(document.body.dataset.studyRoot || '../study/', window.location.href);
  const courseBase = new URL(`courses/${courseId}/`, studyRoot);
  const repo = createCourseRepository(courseBase);

  replaceContent(root, loadingState());
  let course;
  try {
    course = await repo.course();
  } catch (error) {
    replaceContent(root, errorState(error, () => window.location.reload()));
    return;
  }

  const shell = createShell(root, { course, studyRoot, preferences });
  const baseTitle = `${course.shortCode || course.code} 复习站 · Topphi Study`;

  const context = {
    courseId,
    course,
    studyRoot,
    courseBase,
    repo,
    progress: createProgressStore(courseId),
    preferences,
    setTitle(text) {
      document.title = text ? `${text} · ${baseTitle}` : baseTitle;
    },
    navigate(path) {
      router.navigate(path);
    },
    // Renders the current route again, e.g. after a failed load. 重新渲染当前路由，例如加载失败之后重试。
    refresh() {
      router.refresh();
    },
  };

  let cleanup = null;
  let renderToken = 0;

  async function renderRoute({ route, params, query }) {
    renderToken += 1;
    const token = renderToken;
    // Reading aloud belongs to the page being left. 朗读属于正在离开的页面。
    stopSpeaking();
    if (typeof cleanup === 'function') {
      try {
        cleanup();
      } catch (error) {
        console.error(error);
      }
    }
    cleanup = null;
    shell.setActiveNav(route.nav);
    context.setTitle('');
    replaceContent(shell.main, loadingState());
    try {
      const module = await route.load();
      // A newer navigation may have started while the module was loading.
      // 模块加载期间可能已发生新的跳转，此时放弃本次渲染。
      if (token !== renderToken) return;
      const container = h('div', { class: `view view--${route.name}` });
      replaceContent(shell.main, container);
      const result = await module.render(container, context, params, query);
      if (token !== renderToken) {
        if (typeof result === 'function') result();
        return;
      }
      cleanup = typeof result === 'function' ? result : null;
      if (!params.sectionId && !params.termId) window.scrollTo({ top: 0 });
      shell.main.focus({ preventScroll: true });
    } catch (error) {
      if (token !== renderToken) return;
      console.error(error);
      replaceContent(shell.main, errorState(error, () => router.refresh()));
    }
  }

  const router = createRouter(ROUTES, {
    onRoute: renderRoute,
    onNotFound: () => router.navigate('/'),
  });
  router.start();
}

boot();
