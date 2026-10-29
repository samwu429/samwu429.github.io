/**
 * Entry point of the station hub page (study/index.html), which lists every registered course.
 * 工作站总入口（study/index.html）的启动脚本，列出所有已登记的课程。
 */
import { replaceContent } from '../core/dom/element.js';
import { fetchJson } from '../core/data/fetch-json.js';
import { createPreferencesStore } from '../core/state/preferences-store.js';
import { errorState, loadingState } from '../components/feedback/states.js';

async function bootHub() {
  const root = document.getElementById('app');
  const preferences = createPreferencesStore();
  preferences.apply();
  replaceContent(root, loadingState());
  try {
    const studyRoot = new URL('./', window.location.href);
    const [registry, view] = await Promise.all([
      fetchJson(new URL('courses/registry.json', studyRoot)),
      import('../views/hub/station-hub-view.js'),
    ]);
    await view.render(root, { registry, studyRoot, preferences });
  } catch (error) {
    replaceContent(root, errorState(error, () => window.location.reload()));
  }
}

bootHub();
