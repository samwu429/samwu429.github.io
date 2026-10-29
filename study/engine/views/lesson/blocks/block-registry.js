/**
 * Maps lesson block types to their renderers and renders an unobtrusive fallback for anything unknown.
 * 将课程内容块类型映射到各自的渲染函数；未知类型渲染为不显眼的兜底内容。
 *
 * Renderers receive (block, scope). The scope carries the view context, unique ids, an "attached"
 * hook and cleanup registration, so blocks with live parts (widgets, observers) are torn down with the page.
 * 渲染函数接收 (block, scope)。scope 提供视图上下文、唯一 id、“已挂到页面”回调与清理函数登记，
 * 让带有动态部分（交互组件、观察器）的内容块随页面一起销毁。
 */
import { h } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { enNode, zhNode } from '../../../core/text/bilingual.js';
import * as lessonBlock from './lesson-block.js';
import * as analogyBlock from './analogy-block.js';
import * as checkBlock from './check-block.js';
import * as codeBlock from './code-block.js';
import * as discussBlock from './discuss-block.js';
import * as examBlock from './exam-block.js';
import * as exampleBlock from './example-block.js';
import * as flowBlock from './flow-block.js';
import * as formulaBlock from './formula-block.js';
import * as listBlock from './list-block.js';
import * as noteBlock from './note-block.js';
import * as pitfallBlock from './pitfall-block.js';
import * as tableBlock from './table-block.js';
import * as termsBlock from './terms-block.js';
import * as textBlock from './text-block.js';
import * as treeBlock from './tree-block.js';
import * as widgetBlock from './widget-block.js';

const RENDERERS = Object.freeze({
  text: textBlock,
  analogy: analogyBlock,
  terms: termsBlock,
  exam: examBlock,
  example: exampleBlock,
  pitfall: pitfallBlock,
  list: listBlock,
  table: tableBlock,
  formula: formulaBlock,
  code: codeBlock,
  flow: flowBlock,
  tree: treeBlock,
  check: checkBlock,
  discuss: discussBlock,
  note: noteBlock,
  widget: widgetBlock,
});

export const BLOCK_TYPES = Object.freeze(Object.keys(RENDERERS));

export function hasBlockRenderer(type) {
  return typeof type === 'string' && Object.hasOwn(RENDERERS, type);
}

/**
 * Loads the stylesheet of every block type (small files, fetched in parallel and only once).
 * 加载所有内容块类型的样式表（文件很小，并行获取且只加载一次）。
 */
export function ensureBlockStyles() {
  const urls = [lessonBlock.stylesheet, ...Object.values(RENDERERS).map((module) => module.stylesheet)];
  return Promise.all(urls.map((url) => ensureStylesheet(url)));
}

function runSafely(fn) {
  try {
    fn();
  } catch (error) {
    console.error(error);
  }
}

let uidCounter = 0;

/**
 * Creates the per-page scope shared by all block renderers. Call attach() once the blocks are in the
 * document and dispose() when the page goes away.
 * 创建所有内容块共享的页面级 scope。内容块插入文档后调用 attach()，离开页面时调用 dispose()。
 */
export function createBlockScope(context, { unitId = null } = {}) {
  const cleanups = [];
  const attachCallbacks = [];
  let attached = false;
  let disposed = false;

  return {
    context,
    unitId,
    get disposed() {
      return disposed;
    },
    uid(prefix = 'lesson-block') {
      uidCounter += 1;
      return `${prefix}-${uidCounter}`;
    },
    addCleanup(fn) {
      if (typeof fn !== 'function') return;
      if (disposed) runSafely(fn);
      else cleanups.push(fn);
    },
    whenAttached(fn) {
      if (typeof fn !== 'function' || disposed) return;
      if (attached) runSafely(fn);
      else attachCallbacks.push(fn);
    },
    attach() {
      if (attached || disposed) return;
      attached = true;
      attachCallbacks.splice(0).forEach(runSafely);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      attachCallbacks.length = 0;
      cleanups.splice(0).reverse().forEach(runSafely);
    },
  };
}

// Unknown or broken blocks still show any plain text they carry, so no teaching content is lost.
// 未知或出错的内容块仍会显示其中的纯文本，避免讲解内容丢失。
function renderFallback(block) {
  const type = block && typeof block === 'object' && typeof block.type === 'string' ? block.type : '?';
  return h('div', { class: ['lesson-block', 'lesson-block--unknown'], dataset: { block: type, revealScope: '' } },
    block && typeof block === 'object' ? zhNode(block.zh, 'teach', 'p') : null,
    block && typeof block === 'object' ? enNode(block.en, 'p') : null,
    h('p', { class: 'lesson-block__unknown-note' }, `这部分内容暂时无法显示 This part cannot be shown yet (${type})`));
}

export function renderBlock(block, scope) {
  if (!block || typeof block !== 'object' || !hasBlockRenderer(block.type)) return renderFallback(block);
  try {
    const node = RENDERERS[block.type].render(block, scope);
    if (!(node instanceof Element)) return renderFallback(block);
    node.classList.add('lesson-block');
    node.dataset.block = block.type;
    // In English practice mode Alt+Z reveals one block's Chinese (app/language-reveal.js).
    // 英文练习模式下，Alt+Z 显示一个内容块里的中文（见 app/language-reveal.js）。
    node.dataset.revealScope = '';
    return node;
  } catch (error) {
    console.error(error);
    return renderFallback(block);
  }
}

export function renderBlocks(blocks, scope) {
  return Array.isArray(blocks) ? blocks.map((block) => renderBlock(block, scope)) : [];
}
