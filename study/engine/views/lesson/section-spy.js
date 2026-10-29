/**
 * Reports which lesson section is being read by watching a "reading band" just below the sticky
 * header with an IntersectionObserver. Returns a function that disconnects the observer.
 * 用 IntersectionObserver 观察吸顶页头下方的一条“阅读带”，报告当前正在阅读的小节。返回断开观察器的函数。
 */
import { chooseActiveSection } from './lesson-model.js';

// Used until the shell has measured its header (see trackHeaderHeight in app/shell.js).
// 外壳测出页头实际高度之前使用的默认值（见 app/shell.js 的 trackHeaderHeight）。
const FALLBACK_HEADER_PX = 112;
const BAND_GAP_PX = 8;

// The band starts under the sticky header, whose height changes when it wraps, and ends 55% down the viewport.
// 阅读带从吸顶页头下方开始（页头折行时高度会变），到视口 55% 的高度结束。
function readingBand() {
  const value = Number.parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue('--header-height'));
  const header = Number.isFinite(value) && value > 0 ? value : FALLBACK_HEADER_PX;
  return `-${Math.round(header + BAND_GAP_PX)}px 0px -55% 0px`;
}

export function observeSections(elements, onChange) {
  if (typeof window.IntersectionObserver !== 'function' || !elements.length) return () => {};
  const order = elements.map((element) => element.id);
  const visible = new Set();
  let current = null;
  let band = '';
  let observer = null;

  function connect() {
    band = readingBand();
    visible.clear();
    observer = new window.IntersectionObserver((entries) => {
      if (readingBand() !== band) {
        reconnect();
        return;
      }
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      const next = chooseActiveSection(order, visible);
      if (next && next !== current) {
        current = next;
        onChange(next);
      }
    }, { rootMargin: band, threshold: 0 });
    elements.forEach((element) => observer.observe(element));
  }

  // The margin of an observer is fixed, so it is rebuilt once the header height has changed
  // (checked on resize and whenever a section crosses the band).
  // 观察器的边距创建后不能修改，因此页头高度变化后重新创建（在窗口尺寸变化和小节穿过阅读带时检查）。
  function reconnect() {
    observer.disconnect();
    connect();
  }

  function onResize() {
    if (readingBand() !== band) reconnect();
  }

  connect();
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener('resize', onResize);
    observer.disconnect();
  };
}
