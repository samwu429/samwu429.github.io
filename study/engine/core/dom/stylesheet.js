/**
 * Loads a stylesheet once, so views and widgets can ship their own CSS lazily.
 * 只加载一次样式表，让视图与交互组件按需携带各自的 CSS。
 */

const loaded = new Map();

export function ensureStylesheet(url) {
  const href = String(url);
  if (!loaded.has(href)) {
    loaded.set(href, new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      // A missing stylesheet must not block rendering, so errors resolve too.
      // 样式缺失不应阻塞渲染，因此加载失败同样视为完成。
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      document.head.append(link);
    }));
  }
  return loaded.get(href);
}
