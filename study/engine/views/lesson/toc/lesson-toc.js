/**
 * Lesson contents: a sticky sidebar on wide screens and, on phones, a bottom drawer opened from a
 * floating "目录" button. Links keep real hrefs but scroll inside the page instead of re-rendering the route.
 * 本课目录：宽屏时是吸顶侧栏；手机上是由悬浮“目录”按钮打开的底部抽屉。链接保留真实地址，但点击时在页内滚动，不重新渲染路由。
 */
import { h, replaceContent } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { enNode, hasText, toBi, zhNode } from '../../../core/text/bilingual.js';
import { levelBadge } from '../../../components/badges/badge.js';
import { isPlainClick, lessonHref, sectionNumber } from '../lesson-model.js';

export const stylesheet = new URL('./lesson-toc.css', import.meta.url);

let tocCounter = 0;

// The main line is the Chinese title; a section with only an English title shows that instead.
// 主行是中文标题；只有英文标题的小节改为显示英文标题。
function sectionLabel(title, fallbackId) {
  const bi = toBi(title);
  if (!hasText(bi?.zh)) return [enNode(hasText(bi?.en) ? bi.en : fallbackId, 'span', 'lesson-toc__main')];
  return [zhNode(bi.zh, 'label', 'span', 'lesson-toc__main'), enNode(bi.en, 'span', 'lesson-toc__en')];
}

/**
 * Builds the contents. `onSelect(sectionId)` is called when a section link is chosen.
 * Returns the nav element, the floating button and backdrop (both only shown on phones) and updaters.
 * 创建目录。选择某个小节时调用 onSelect(sectionId)。返回导航元素、悬浮按钮与遮罩（仅手机显示）以及更新函数。
 */
export function createLessonToc({ unitId, sections, onSelect }) {
  tocCounter += 1;
  const panelId = `lesson-toc-${tocCounter}`;
  const titleId = `${panelId}-title`;
  const entries = new Map();
  let open = false;
  let activeId = null;

  const count = h('span', { class: 'lesson-toc__count' });
  const fabCount = h('span', { class: 'lesson-toc__fab-count' });

  const list = h('ol', { class: 'lesson-toc__list', role: 'list' }, sections.map((section, index) => {
    const state = h('span', { class: 'lesson-toc__state' }, icon('circle', { size: 18 }));
    const link = h('a', {
      class: 'lesson-toc__link',
      href: lessonHref(unitId, section.id),
      onclick: (event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        setOpen(false, false);
        onSelect?.(section.id);
      },
    },
    h('span', { class: 'lesson-toc__num', 'aria-hidden': 'true' }, sectionNumber(index)),
    h('span', { class: 'lesson-toc__text' },
      sectionLabel(section.title, section.id),
      h('span', { class: 'lesson-toc__badge' }, levelBadge(section.level))),
    state);
    entries.set(section.id, { link, state, done: false });
    return h('li', { class: 'lesson-toc__item' }, link);
  }));

  const closeButton = h('button', {
    type: 'button',
    class: 'lesson-toc__close',
    'aria-label': '关闭目录 Close contents',
    onclick: () => setOpen(false, true),
  }, icon('cross', { size: 18 }));

  const element = h('nav', { class: 'lesson-toc', id: panelId, 'aria-labelledby': titleId },
    h('div', { class: 'lesson-toc__head' },
      h('p', { class: 'lesson-toc__title', id: titleId },
        h('span', { lang: 'zh-CN' }, '本课目录'),
        h('span', { class: 'lesson-toc__title-en', lang: 'en' }, 'Contents')),
      count,
      closeButton),
    list);

  const fab = h('button', {
    type: 'button',
    class: 'lesson-toc__fab',
    'aria-controls': panelId,
    'aria-expanded': 'false',
    onclick: () => setOpen(!open, open),
  }, icon('list', { size: 18 }), h('span', { class: 'lesson-toc__fab-label' }, '目录 Contents'), fabCount);

  const backdrop = h('div', { class: 'lesson-toc__backdrop', onclick: () => setOpen(false, true) });

  // Keeps a link visible inside the scrollable list without scrolling the page itself.
  // 让链接在可滚动的目录列表内可见，而不滚动整个页面。
  function keepVisible(link) {
    if (list.scrollHeight <= list.clientHeight) return;
    const top = link.offsetTop;
    const bottom = top + link.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 8);
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
  }

  function setOpen(next, restoreFocus) {
    if (open === next) return;
    open = next;
    element.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    fab.setAttribute('aria-expanded', String(open));
    if (open) {
      const current = entries.get(activeId)?.link;
      if (current) keepVisible(current);
      (current || closeButton).focus({ preventScroll: true });
    } else if (restoreFocus) {
      fab.focus({ preventScroll: true });
    }
  }

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  fab.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  // The drawer closes when keyboard focus moves somewhere else on the page.
  // 键盘焦点移到页面其他地方时，抽屉自动关闭。
  element.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (open && next instanceof Node && !element.contains(next) && next !== fab) setOpen(false, false);
  });

  return {
    element,
    fab,
    backdrop,
    setActive(sectionId) {
      if (sectionId === activeId) return;
      entries.get(activeId)?.link.removeAttribute('aria-current');
      activeId = sectionId;
      const entry = entries.get(sectionId);
      if (!entry) return;
      entry.link.setAttribute('aria-current', 'location');
      keepVisible(entry.link);
    },
    setDone(sectionId, done) {
      const entry = entries.get(sectionId);
      if (!entry || entry.done === done) return;
      entry.done = done;
      entry.link.classList.toggle('is-done', done);
      replaceContent(entry.state, done
        ? [icon('checkCircle', { size: 18 }), h('span', { class: 'visually-hidden' }, '已学会 Learned')]
        : icon('circle', { size: 18 }));
    },
    setProgress(done, total) {
      count.textContent = `${done}/${total}`;
      fabCount.textContent = `${done}/${total}`;
    },
    close() {
      setOpen(false, false);
    },
  };
}
