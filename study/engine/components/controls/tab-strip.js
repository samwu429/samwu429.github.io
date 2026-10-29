/**
 * Accessible tab strip (WAI-ARIA tabs pattern): arrow keys, Home and End move and activate tabs.
 * 无障碍分页条（WAI-ARIA tabs 模式）：方向键、Home、End 切换并立即激活。
 *
 * The caller owns the panels; this helper wires their ids, roles and visibility.
 * 面板由调用方创建，本工具负责设置 id、角色与显示状态。
 */
import { h } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';

export function loadTabStripStyles() {
  return ensureStylesheet(new URL('./tab-strip.css', import.meta.url));
}

/**
 * tabs: [{ id, label (string or node), iconName?, panel (element) }].
 * Returns { element, select(id) }; onSelect(id) runs after every change, including the initial one.
 * tabs 为 [{ id, label, iconName?, panel }]；返回 { element, select(id) }；每次切换（含初始）后调用 onSelect(id)。
 */
export function tabStrip({ tabs, selected, label, idPrefix, onSelect, className } = {}) {
  const buttons = new Map();
  const element = h('div', { class: ['tab-strip', className], role: 'tablist', 'aria-label': label });

  tabs.forEach((tab) => {
    const tabId = `${idPrefix}-tab-${tab.id}`;
    const panelId = `${idPrefix}-panel-${tab.id}`;
    const button = h('button', {
      type: 'button',
      role: 'tab',
      id: tabId,
      class: 'tab-strip__tab',
      'aria-controls': panelId,
      'aria-selected': 'false',
      tabindex: '-1',
      onclick: () => select(tab.id),
    }, tab.iconName ? icon(tab.iconName, { size: 16 }) : null, h('span', { class: 'tab-strip__label' }, tab.label));
    tab.panel.id = panelId;
    tab.panel.setAttribute('role', 'tabpanel');
    tab.panel.setAttribute('aria-labelledby', tabId);
    tab.panel.tabIndex = 0;
    buttons.set(tab.id, button);
    element.append(button);
  });

  function select(id, { focus = false } = {}) {
    const target = buttons.has(id) ? id : tabs[0]?.id;
    for (const tab of tabs) {
      const active = tab.id === target;
      const button = buttons.get(tab.id);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      tab.panel.hidden = !active;
    }
    const button = buttons.get(target);
    if (button) {
      if (focus) button.focus();
      // Keep the active tab visible when the strip scrolls sideways on narrow screens.
      // 窄屏下分页条横向滚动时，保证当前分页可见。
      if (typeof button.scrollIntoView === 'function' && element.isConnected) button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    onSelect?.(target);
  }

  element.addEventListener('keydown', (event) => {
    const ids = tabs.map((tab) => tab.id);
    const current = ids.indexOf(element.querySelector('[aria-selected="true"]')?.id.slice(`${idPrefix}-tab-`.length));
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % ids.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + ids.length) % ids.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    if (next === null) return;
    event.preventDefault();
    select(ids[next], { focus: true });
  });

  select(selected);
  return { element, select };
}
