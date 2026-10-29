/**
 * Responsive SVG plot frame shared by the machine-learning widgets: background, dashed grid, axes,
 * tick numbers and drawing layers, with the axis titles as bilingual HTML above and below the plot.
 * 机器学习类组件共用的自适应 SVG 坐标框：背景、虚线网格、坐标轴、刻度数字与绘图图层；
 * 坐标轴名称以双语 HTML 放在图的上方和下方。
 *
 * The viewBox always equals the rendered pixel size, so text and strokes stay the same size on a
 * phone and on a desktop; `observe` redraws when the available width changes.
 * viewBox 始终等于实际像素尺寸，所以手机和电脑上的文字与线条大小一致；宽度变化时由 observe 触发重绘。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { clamp, decimalsOf, formatTrim, linearScale } from './ml-math.js';

let frameCount = 0;
const FALLBACK_WIDTH = 480;
const CHAR_WIDTH = 7;

export function createPlotFrame({
  xExtent, yExtent, label, role = 'img', aspect = 0.72, minHeight = 230, maxHeight = 420, xTitle, yTitle,
}) {
  frameCount += 1;
  const clipId = `ml-plot-clip-${frameCount}`;
  const clipRect = s('rect');
  const grid = s('g', { class: 'ml-plot__grid', 'aria-hidden': 'true' });
  const axes = s('g', { class: 'ml-plot__axes', 'aria-hidden': 'true' });
  const layers = {
    regions: s('g', { class: 'ml-plot__layer' }),
    marks: s('g', { class: 'ml-plot__layer' }),
    points: s('g', { class: 'ml-plot__layer' }),
    overlay: s('g', { class: 'ml-plot__layer', 'aria-hidden': 'true' }),
  };
  const svg = s('svg', { class: 'ml-plot__svg', role, 'aria-label': label },
    s('defs', {}, s('clipPath', { id: clipId }, clipRect)),
    grid,
    s('g', { 'clip-path': `url(#${clipId})` }, layers.regions, layers.marks),
    axes,
    layers.points,
    layers.overlay);
  const canvas = h('div', { class: 'ml-plot__canvas' }, svg);
  const element = h('div', { class: 'ml-plot' },
    yTitle ? h('p', { class: 'ml-plot__title ml-plot__title--y' }, yTitle) : null,
    canvas,
    xTitle ? h('p', { class: 'ml-plot__title ml-plot__title--x' }, xTitle) : null);

  const xDigits = decimalsOf(xExtent.step);
  const yDigits = decimalsOf(yExtent.step);
  const yLabels = yExtent.ticks.map((tick) => formatTrim(tick, yDigits));
  const left = 14 + CHAR_WIDTH * Math.max(1, ...yLabels.map((text) => text.length));
  let geometry = null;

  function drawFrame(plot, x, y) {
    const width = plot.right - plot.left;
    const height = plot.bottom - plot.top;
    replaceContent(grid,
      s('rect', { class: 'ml-plot__bg', x: plot.left, y: plot.top, width, height }),
      xExtent.ticks.map((tick) => s('line', { class: 'ml-plot__gridline', x1: x(tick), x2: x(tick), y1: plot.top, y2: plot.bottom })),
      yExtent.ticks.map((tick) => s('line', { class: 'ml-plot__gridline', x1: plot.left, x2: plot.right, y1: y(tick), y2: y(tick) })));

    // Thin out tick numbers when they would collide on a narrow screen.
    // 窄屏上刻度数字会挤在一起时，隔一个显示一个。
    const xGap = width / Math.max(1, xExtent.ticks.length - 1);
    const xLongest = Math.max(...xExtent.ticks.map((tick) => formatTrim(tick, xDigits).length));
    const xEvery = xGap < CHAR_WIDTH * xLongest + 8 ? 2 : 1;
    const yEvery = height / Math.max(1, yExtent.ticks.length - 1) < 16 ? 2 : 1;
    replaceContent(axes,
      s('line', { class: 'ml-plot__axis', x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom }),
      s('line', { class: 'ml-plot__axis', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom }),
      xExtent.ticks.map((tick, index) => (index % xEvery ? null : s('text', {
        class: 'ml-plot__tick', x: x(tick), y: plot.bottom + 17, 'text-anchor': 'middle',
      }, formatTrim(tick, xDigits)))),
      yExtent.ticks.map((tick, index) => (index % yEvery ? null : s('text', {
        class: 'ml-plot__tick', x: plot.left - 6, y: y(tick), dy: '0.32em', 'text-anchor': 'end',
      }, yLabels[index]))));
  }

  /**
   * Measures the canvas and returns { width, height, plot, x, y }; the frame is redrawn only when the
   * width changed. Before the widget is attached the width is unknown, so a fallback is used.
   * 测量画布并返回 { width, height, plot, x, y }；只有宽度变化时才重画坐标框。组件挂到页面之前宽度未知，使用后备宽度。
   */
  function layout() {
    const measured = Math.round(canvas.clientWidth);
    const width = measured > 0 ? measured : FALLBACK_WIDTH;
    if (geometry && geometry.width === width) return geometry;
    const height = Math.round(clamp(width * aspect, minHeight, maxHeight));
    const plot = { left, top: 12, right: width - 16, bottom: height - 28 };
    const x = linearScale([xExtent.min, xExtent.max], [plot.left, plot.right]);
    const y = linearScale([yExtent.min, yExtent.max], [plot.bottom, plot.top]);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clipRect.setAttribute('x', plot.left);
    clipRect.setAttribute('y', plot.top);
    clipRect.setAttribute('width', plot.right - plot.left);
    clipRect.setAttribute('height', plot.bottom - plot.top);
    drawFrame(plot, x, y);
    geometry = { width, height, plot, x, y };
    return geometry;
  }

  /** Calls `onResize` after the canvas width changes; returns a function that stops observing. 宽度变化后回调，返回停止监听的函数。 */
  function observe(onResize) {
    if (typeof ResizeObserver !== 'function') return () => {};
    let pending = 0;
    const observer = new ResizeObserver(() => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        const measured = Math.round(canvas.clientWidth);
        if (measured > 0 && (!geometry || geometry.width !== measured)) onResize();
      });
    });
    observer.observe(canvas);
    return () => {
      if (pending) cancelAnimationFrame(pending);
      observer.disconnect();
    };
  }

  return { element, svg, layers, layout, observe };
}
