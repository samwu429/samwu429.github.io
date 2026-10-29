/**
 * Minimal inline SVG icon set (24x24 stroke icons) so the UI needs no icon font or emoji.
 * 极简内联 SVG 图标集（24x24 线性图标），界面无需图标字体或表情符号。
 */
import { s } from './element.js';

const PATHS = {
  home: ['M3 11l9-8 9 8', 'M5 10v10h14V10'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 5v16'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  cards: ['M7 4h12v14H7z', 'M4 7v13h12'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  translate: ['M4 5h8', 'M8 3v2', 'M6 5c0 4 3 7 6 8', 'M10 5c-1 4-4 7-7 8', 'M13 21l4-9 4 9', 'M14.5 18h5'],
  speaker: ['M4 9v6h4l5 4V5L8 9z', 'M16 9a4 4 0 0 1 0 6', 'M18.5 6.5a8 8 0 0 1 0 11'],
  check: ['M5 12l5 5L20 7'],
  cross: ['M6 6l12 12', 'M18 6L6 18'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  arrowLeft: ['M19 12H5', 'M11 6l-6 6 6 6'],
  chevronDown: ['M6 9l6 6 6-6'],
  clock: ['M12 7v5l3 2', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
  sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M12 1v2', 'M12 21v2', 'M4.2 4.2l1.4 1.4', 'M18.4 18.4l1.4 1.4', 'M1 12h2', 'M21 12h2', 'M4.2 19.8l1.4-1.4', 'M18.4 5.6l1.4-1.4'],
  play: ['M7 4l13 8-13 8z'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12h.01'],
  map: ['M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z', 'M9 4v14', 'M15 6v14'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  calendar: ['M4 6h16v15H4z', 'M4 10h16', 'M8 3v5', 'M16 3v5'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  printer: ['M6 9V3h12v6', 'M6 18H4v-8h16v8h-2', 'M6 14h12v7H6z'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  upload: ['M12 20V9', 'M7 14l5-5 5 5', 'M5 4h14'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  alert: ['M12 3l10 18H2z', 'M12 10v4', 'M12 17h.01'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  shuffle: ['M16 3h5v5', 'M4 20L21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4.2-4.2'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5.5', 'M12 7.5h.01'],
  chat: ['M4 5h16v11H10l-4.5 4v-4H4z'],
  code: ['M8 7l-5 5 5 5', 'M16 7l5 5-5 5', 'M14 4l-4 16'],
  help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6', 'M12 17h.01'],
  sigma: ['M18 5H6l6 7-6 7h12'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  tree: ['M9 3h6v5H9z', 'M12 8v4', 'M6 12h12', 'M6 12v3', 'M18 12v3', 'M3 15h6v5H3z', 'M15 15h6v5h-6z'],
  sliders: ['M4 6h9', 'M17 6h3', 'M15 4v4', 'M4 12h3', 'M11 12h9', 'M9 10v4', 'M4 18h11', 'M19 18h1', 'M17 16v4'],
  circle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  checkCircle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 12.5l2.7 2.7L16.5 9.5'],
  bookmark: ['M6 3h12v18l-6-4-6 4z'],
  stop: ['M6 6h12v12H6z'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  pause: ['M8 5v14', 'M16 5v14'],
  stepForward: ['M6 5l9 7-9 7z', 'M18 5v14'],
  skipForward: ['M4 5l8 7-8 7z', 'M12 5l8 7-8 7z', 'M20 5v14'],
  undo: ['M9 14L4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
};

/**
 * Returns an inline SVG icon element; unknown names render nothing.
 * 返回内联 SVG 图标元素；未知名称不渲染任何内容。
 */
export function icon(name, { size = 18, label } = {}) {
  const paths = PATHS[name];
  if (!paths) return null;
  return s('svg', {
    class: 'icon',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': label ? undefined : 'true',
    role: label ? 'img' : undefined,
    'aria-label': label,
  }, paths.map((d) => s('path', { d })));
}
