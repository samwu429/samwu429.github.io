/**
 * Declarative DOM construction that never parses HTML strings.
 * 以声明式方式构建 DOM，全程不解析 HTML 字符串，从源头避免 XSS。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
// "//host" and "/\host" are protocol-relative (cross-origin), so a leading slash must not be followed by either.
// "//host" 与 "/\host" 是省略协议的跨站地址，因此开头的斜杠后面不能再跟斜杠或反斜杠。
const SAFE_URL = /^(#|\.{1,2}\/|\/(?![/\\])|[a-z0-9-]+(\.[a-z0-9-]+)*\/|https?:\/\/|mailto:)/i;

/**
 * True for values that may become an href or src: hashes, same-site relative paths, http(s) and mailto.
 * 判断能否作为 href 或 src：锚点、站内相对路径、http(s) 与 mailto 地址。
 */
export function isSafeUrl(value) {
  return SAFE_URL.test(String(value));
}

/**
 * Creates an HTML element with properties and children.
 * 创建带属性与子节点的 HTML 元素。
 *
 * Props: `class` (string or array), `text`, `dataset`, `style` (object),
 * `on<Event>` listeners, boolean attributes, everything else as attributes.
 * 属性约定：class、text、dataset、style 对象、on 开头的事件监听、布尔属性，其余按普通属性设置。
 */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  applyProps(element, props);
  appendChildren(element, children);
  return element;
}

/**
 * Creates an SVG element in the SVG namespace.
 * 在 SVG 命名空间中创建元素。
 */
export function s(tag, attributes = {}, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  applyProps(element, attributes);
  appendChildren(element, children);
  return element;
}

/**
 * Appends nodes or text to a parent, skipping null/false and flattening arrays.
 * 向父节点追加子节点或文本，自动跳过 null/false 并展开嵌套数组。
 */
export function appendChildren(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/**
 * Replaces all children of an element.
 * 替换元素的全部子节点。
 */
export function replaceContent(element, ...children) {
  element.replaceChildren();
  return appendChildren(element, children);
}

function applyProps(element, props) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') {
      const names = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
      if (names) element.setAttribute('class', names);
    } else if (key === 'text') {
      element.textContent = String(value);
    } else if (key === 'dataset') {
      Object.assign(element.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('on')) {
      // Only functions become listeners; a string would turn into an inline handler, so it is dropped.
      // 只有函数会注册为事件监听；字符串会变成内联事件代码，因此直接丢弃。
      if (typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'href' || key === 'src') {
      // Only same-site relative paths, hashes and http(s) URLs may become navigable attributes.
      // 只有站内相对路径、锚点与 http(s) 地址可以成为可跳转属性，拒绝 javascript: 等协议。
      const url = String(value);
      if (isSafeUrl(url)) element.setAttribute(key, url);
    } else if (value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
}
