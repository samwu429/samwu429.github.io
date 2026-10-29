/**
 * Slot for an interactive demo. When the block comes near the viewport it lazily imports the widget
 * registry, loads the named widget and calls mount(host, config, context); the returned cleanup is
 * handed to the lesson scope. Loading and failure states keep the page usable if a demo breaks.
 * 交互演示插槽。内容块接近视口时才按需导入组件注册表、加载对应组件并调用 mount(host, config, context)，
 * 返回的清理函数交给课程页统一回收。加载中与失败状态保证某个演示出错时页面仍然可用。
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { zhNode } from '../../../core/text/bilingual.js';
import { button } from '../../../components/controls/button.js';
import { loadingState } from '../../../components/feedback/states.js';
import { asBi, blockTag, secondaryEn } from './lesson-block.js';

export const stylesheet = new URL('./widget-block.css', import.meta.url);

// Start loading a little before the demo scrolls into view, so it is usually ready on arrival.
// 在演示滚动进入视口前提前开始加载，通常滚到时已经准备好。
const PRELOAD_MARGIN = '400px 0px';

function whenNearViewport(element, callback, scope) {
  if (typeof window.IntersectionObserver !== 'function') {
    callback();
    return;
  }
  const observer = new window.IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    callback();
  }, { rootMargin: PRELOAD_MARGIN });
  observer.observe(element);
  scope.addCleanup(() => observer.disconnect());
}

function notice(text, action) {
  return h('div', { class: 'widget-block__notice', role: 'status' },
    h('p', { class: 'widget-block__notice-text' }, text),
    action || null);
}

export function render(block, scope) {
  const name = typeof block.name === 'string' ? block.name.trim() : '';
  const config = block.config && typeof block.config === 'object' && !Array.isArray(block.config) ? block.config : {};
  const caption = asBi(block.caption);
  const stage = h('div', { class: 'widget-block__stage', 'aria-busy': 'true' }, loadingState('正在准备演示… Preparing demo'));
  let started = false;

  async function mount() {
    const spinner = loadingState('正在加载演示… Loading demo');
    const host = h('div', { class: 'widget-block__host' });
    replaceContent(stage, host, spinner);
    stage.setAttribute('aria-busy', 'true');
    try {
      const registry = await import('../../../widgets/widget-registry.js');
      if (scope.disposed) return;
      if (!registry.hasWidget(name)) {
        replaceContent(stage, notice(`这个互动演示暂时不可用 This demo is not available (${name || '?'})`));
        return;
      }
      const module = await registry.loadWidget(name);
      if (scope.disposed) return;
      if (typeof module.mount !== 'function') throw new Error(`Widget "${name}" has no mount()`);
      const cleanup = await module.mount(host, config, scope.context);
      // If the page was left while the demo was mounting, addCleanup runs the cleanup at once.
      // 如果挂载期间已经离开页面，addCleanup 会立即执行清理。
      scope.addCleanup(cleanup);
      spinner.remove();
    } catch (error) {
      console.error(error);
      if (scope.disposed) return;
      replaceContent(stage, notice('这个互动演示没能加载 The demo could not load.', button({
        label: '重试 Retry',
        iconName: 'refresh',
        size: 'sm',
        onClick: () => mount(),
      })));
    } finally {
      stage.removeAttribute('aria-busy');
    }
  }

  const root = h('div', { class: 'widget-block', dataset: { widget: name } },
    caption
      ? h('div', { class: 'widget-block__caption' },
        blockTag({ zh: '试一试', en: 'Try it', iconName: 'sliders', tone: 'accent' }),
        zhNode(caption.zh, 'teach', 'p', 'widget-block__caption-zh'),
        secondaryEn(caption.en))
      : blockTag({ zh: '试一试', en: 'Try it', iconName: 'sliders', tone: 'accent' }),
    stage);

  scope.whenAttached(() => whenNearViewport(root, () => {
    if (started || scope.disposed) return;
    started = true;
    mount();
  }, scope));
  return root;
}
