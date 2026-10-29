/**
 * DOM-free tidy layout for the static tree diagrams in lessons (minimax trees, concept trees).
 * 课程静态树形图的整齐布局（不依赖 DOM），用于 Minimax 树与概念树。
 *
 * Each subtree is pushed against its left siblings as far as their per-level contours allow, and
 * every parent is centred over its first and last child, so nodes on one level never overlap.
 * Text widths are estimated because the layout has to run without a browser (and in tests).
 * 每棵子树按各层轮廓尽量紧靠左边已排好的兄弟子树，父节点居中于首尾子节点之上，
 * 所以同一层的节点不会重叠。布局要在没有浏览器的环境（包括测试）中运行，因此文字宽度采用估算。
 */
import { stripMarkup } from '../../../core/text/inline-markup.js';

export const TREE_SHAPES = Object.freeze(['max', 'min', 'node', 'leaf']);
export const MAX_TREE_NODES = 63;
export const MAX_TREE_DEPTH = 10;

export const TREE_METRICS = Object.freeze({
  padding: 12,
  nodeGap: 16,
  levelGap: 24,
  labelFont: 13,
  labelLine: 17,
  labelGap: 6,
  maxLabelWidth: 132,
  valueFont: 12,
  edgeFont: 11,
  edgeLine: 14,
  edgePadX: 6,
  edgePadY: 3,
  edgeLead: 10,
  edgeGap: 4,
  maxEdgeWidth: 116,
  baseSize: Object.freeze({ max: 34, min: 34, node: 24, leaf: 22 }),
});

const WIDE_RANGES = '\\u1100-\\u115f\\u2e80-\\ua4cf\\uac00-\\ud7a3\\uf900-\\ufaff\\ufe30-\\ufe4f\\uff00-\\uff60\\uffe0-\\uffe6';
const WIDE_CHAR = new RegExp(`[${WIDE_RANGES}]`);
// A Latin word or a run of CJK characters (with its trailing space) is one token, so mixed labels
// such as "Machine Learning 机器学习" break between the languages; over-long runs are split later.
// 一个拉丁单词或一串连续的中文字符（连同其后的空格）为一个单位，中英混排的标签会在两种语言之间断行；过长的单位稍后再拆。
const TOKEN = new RegExp(`[${WIDE_RANGES}]+\\s*|[^\\s${WIDE_RANGES}]+\\s*|\\s+`, 'g');
const NO_LINE_START = /^[，。、；：！？）》」』】〕,.;:!?)\]}%]/;
// Labels that only repeat the node's shape glyph (filled or hollow triangle, square, circle) add
// nothing next to the drawn shape.
// 只重复形状符号（实心或空心的三角形、方形、圆形）的标签与画出的形状重复，不再显示。
const SHAPE_GLYPHS = {
  max: /^[\u25B2\u25B3]$/,
  min: /^[\u25BC\u25BD]$/,
  leaf: /^[\u25A0\u25A1]$/,
  node: /^[\u25CF\u25CB]$/,
};

function charWidth(char, mono) {
  const code = char.codePointAt(0);
  if (WIDE_CHAR.test(char) || code >= 0x20000) return 1;
  if (mono) return 0.62;
  if (char === ' ') return 0.32;
  if ('iljI.,:;!|\'`'.includes(char)) return 0.3;
  if ('ftr()[]{}"-'.includes(char)) return 0.4;
  if ('mwMW@%'.includes(char)) return 0.88;
  if (char >= 'A' && char <= 'Z') return 0.68;
  if (char >= '0' && char <= '9') return 0.58;
  if (code < 0x80) return 0.56;
  return 0.8;
}

/**
 * Approximate rendered width in px of one line of sans-serif (or monospace) text.
 * 估算一行无衬线（或等宽）文字的显示宽度（像素）。
 */
export function estimateTextWidth(text, fontSize = TREE_METRICS.labelFont, { mono = false } = {}) {
  let em = 0;
  for (const char of String(text ?? '')) em += charWidth(char, mono);
  return Math.ceil(em * fontSize);
}

/**
 * True for multi-line labels drawn as small boards, e.g. ". . G\nP B B": every line is made of
 * short space-separated cells. These are kept line by line and drawn in a monospace font.
 * 判断多行标签是否是小棋盘（如 ". . G\nP B B"）：每行都由空格分开的短格子组成。
 * 这类标签按原样逐行保留，并用等宽字体绘制。
 */
export function isGridLabel(text) {
  const lines = String(text ?? '').split('\n');
  if (lines.length < 2) return false;
  return lines.every((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && trimmed.length <= 15 && trimmed.split(/ +/).every((cell) => [...cell].length <= 3);
  });
}

function splitLongTokens(tokens, maxWidth, fontSize) {
  const result = [];
  for (const token of tokens) {
    if (estimateTextWidth(token.trimEnd(), fontSize) <= maxWidth) {
      result.push(token);
      continue;
    }
    let chunk = '';
    for (const char of token) {
      if (chunk && estimateTextWidth(chunk + char, fontSize) > maxWidth) {
        result.push(chunk);
        chunk = '';
      }
      chunk += char;
    }
    if (chunk) result.push(chunk);
  }
  return result;
}

/**
 * Greedy line wrapping: breaks between Latin words or between CJK characters, honours "\n",
 * and never starts a line with closing punctuation.
 * 贪心换行：在拉丁单词之间或中文字符之间断行，遵守 "\n"，且不让行首出现收尾标点。
 */
export function wrapText(text, maxWidth, fontSize = TREE_METRICS.labelFont) {
  const clean = stripMarkup(text ?? '').trim();
  if (!clean) return [];
  const lines = [];
  for (const paragraph of clean.split('\n')) {
    let line = '';
    for (const token of splitLongTokens(paragraph.match(TOKEN) || [], maxWidth, fontSize)) {
      const candidate = line + token;
      const overflows = estimateTextWidth(candidate.trimEnd(), fontSize) > maxWidth;
      if (line.trim() && overflows && !NO_LINE_START.test(token)) {
        lines.push(line.trim());
        line = token.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}

function cleanText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return '';
  return stripMarkup(value).trim();
}

/**
 * Validates a content TreeNode into a clean tree with ids, depths and default shapes
 * (nodes with children default to "node", others to "leaf"). Oversized input is cut off.
 * 把内容中的 TreeNode 整理成带 id、层级与默认形状的干净树（有子节点默认 node，否则 leaf），超大输入会被截断。
 */
export function normalizeTree(root, { maxNodes = MAX_TREE_NODES, maxDepth = MAX_TREE_DEPTH } = {}) {
  let count = 0;
  let truncated = false;
  const seen = new WeakSet();

  function visit(raw, depth, parentId) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || seen.has(raw)) return null;
    if (count >= maxNodes) {
      truncated = true;
      return null;
    }
    seen.add(raw);
    const rawChildren = Array.isArray(raw.children) ? raw.children : [];
    const node = {
      id: count,
      depth,
      parentId,
      label: cleanText(raw.label),
      value: cleanText(raw.value),
      edge: depth > 0 ? cleanText(raw.edge) : '',
      shape: TREE_SHAPES.includes(raw.shape) ? raw.shape : (rawChildren.length ? 'node' : 'leaf'),
      children: [],
    };
    count += 1;
    if (rawChildren.length && depth + 1 >= maxDepth) {
      truncated = true;
      return node;
    }
    for (const child of rawChildren) {
      const built = visit(child, depth + 1, node.id);
      if (built) node.children.push(built);
    }
    return node;
  }

  const tree = visit(root, 0, null);
  return { root: tree, count, truncated };
}

function isTriangle(shape) {
  return shape === 'max' || shape === 'min';
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function widestLine(lines, fontSize, mono = false) {
  return lines.reduce((widest, line) => Math.max(widest, estimateTextWidth(line, fontSize, { mono })), 0);
}

// Shapes grow so the value fits inside; a triangle is only 2/3 as wide at its centroid line.
// 形状会放大到能装下数值；三角形在重心那条线上只有底边的 2/3 宽。
function fitShape(shape, valueWidth, metrics) {
  const base = metrics.baseSize[shape] || metrics.baseSize.node;
  if (!valueWidth) return base;
  if (isTriangle(shape)) return Math.max(base, Math.ceil(1.6 * (valueWidth + 6)));
  return Math.max(base, Math.ceil(valueWidth + (shape === 'leaf' ? 12 : 14)));
}

// Leaves stay square while short; a long value stretches them into a low box instead of a giant square.
// 叶子在数值较短时保持正方形；数值很长时拉成扁长方框，而不是放大成巨大的正方形。
function shapeHeight(shape, width, metrics) {
  if (isTriangle(shape)) return Math.round(width * 0.87);
  if (shape === 'leaf') return Math.min(width, Math.max(metrics.baseSize.leaf, 30));
  return width;
}

function labelLines(node, metrics) {
  if (!node.label || SHAPE_GLYPHS[node.shape]?.test(node.label)) return [];
  if (node.grid) return node.label.split('\n').map((line) => line.trim());
  return wrapText(node.label, metrics.maxLabelWidth, metrics.labelFont);
}

/**
 * Vertex list of a MAX (pointing up) or MIN (pointing down) triangle, as an SVG points string.
 * MAX（尖角朝上）或 MIN（尖角朝下）三角形的顶点，返回 SVG points 字符串。
 */
export function trianglePoints(shape, cx, cy, width, height) {
  const top = round(cy - height / 2);
  const bottom = round(cy + height / 2);
  const left = round(cx - width / 2);
  const right = round(cx + width / 2);
  const corners = shape === 'min'
    ? [[left, top], [right, top], [round(cx), bottom]]
    : [[round(cx), top], [right, bottom], [left, bottom]];
  return corners.map(([x, y]) => `${x},${y}`).join(' ');
}

function valueCentre(shape, cy, height) {
  if (shape === 'max') return cy + height / 6;
  if (shape === 'min') return cy - height / 6;
  return cy;
}

// Returns the subtree contour (left/right extent per level, relative to the subtree root) and
// stores each child's offset from its parent on node.offsets.
// 返回子树轮廓（每层相对子树根的左右边界），并把每个子节点相对父节点的偏移存进 node.offsets。
function placeSubtree(node, gap) {
  const own = { left: -node.slot / 2, right: node.slot / 2 };
  if (!node.children.length) {
    node.offsets = [];
    return [own];
  }
  const contours = node.children.map((child) => placeSubtree(child, gap));
  const offsets = [0];
  const merged = contours[0].map((level) => ({ ...level }));
  for (let index = 1; index < contours.length; index += 1) {
    const contour = contours[index];
    let offset = -Infinity;
    const shared = Math.min(merged.length, contour.length);
    for (let level = 0; level < shared; level += 1) {
      offset = Math.max(offset, merged[level].right + gap - contour[level].left);
    }
    offsets.push(offset);
    contour.forEach((level, depth) => {
      const left = level.left + offset;
      const right = level.right + offset;
      if (depth < merged.length) {
        merged[depth].left = Math.min(merged[depth].left, left);
        merged[depth].right = Math.max(merged[depth].right, right);
      } else {
        merged.push({ left, right });
      }
    });
  }
  const centre = (offsets[0] + offsets[offsets.length - 1]) / 2;
  node.offsets = offsets.map((offset) => offset - centre);
  return [own, ...merged.map((level) => ({ left: level.left - centre, right: level.right - centre }))];
}

function edgeBoxHeight(lineCount, metrics) {
  return lineCount * metrics.edgeLine + 2 * metrics.edgePadY;
}

/**
 * Lays out a content tree. Returns the drawing size, positioned nodes (shape centre, wrapped label
 * lines with baselines, value baseline, optional edge tag box, triangle points) and parent-child links.
 * 计算内容树的布局。返回画布尺寸、定位后的节点（形状中心、换行后的标签及基线、数值基线、
 * 可选的边标签框、三角形顶点）以及父子连线。
 */
export function layoutTree(rawRoot, metrics = TREE_METRICS) {
  const { root, count, truncated } = normalizeTree(rawRoot);
  if (!root) return { width: 0, height: 0, nodes: [], links: [], levels: 0, count: 0, truncated: false };

  const nodes = [];
  (function collect(node) {
    nodes.push(node);
    node.children.forEach(collect);
  }(root));

  const shapeWidths = {};
  for (const node of nodes) {
    node.grid = isGridLabel(node.label);
    node.lines = labelLines(node, metrics);
    node.labelWidth = widestLine(node.lines, metrics.labelFont, node.grid);
    node.edgeLines = node.edge ? wrapText(node.edge, metrics.maxEdgeWidth, metrics.edgeFont) : [];
    node.edgeWidth = node.edgeLines.length ? widestLine(node.edgeLines, metrics.edgeFont) + 2 * metrics.edgePadX : 0;
    // Values are drawn bold, which runs about 10% wider than the estimate.
    // 数值用粗体绘制，实际宽度约比估算多 10%。
    const valueWidth = node.value ? estimateTextWidth(node.value, metrics.valueFont) * 1.1 : 0;
    shapeWidths[node.shape] = Math.max(shapeWidths[node.shape] || 0, fitShape(node.shape, valueWidth, metrics));
  }
  // One size per shape kind keeps every MAX/MIN triangle in a tree identical.
  // 同一种形状统一尺寸，使整棵树的 MAX/MIN 三角形大小一致。
  for (const node of nodes) {
    node.width = shapeWidths[node.shape];
    node.height = shapeHeight(node.shape, node.width, metrics);
    node.slot = Math.max(node.width, node.labelWidth, node.edgeWidth);
  }

  placeSubtree(root, metrics.nodeGap);
  root.x = 0;
  for (const node of nodes) {
    node.children.forEach((child, index) => {
      child.x = node.x + node.offsets[index];
    });
  }

  const levels = nodes.reduce((deepest, node) => Math.max(deepest, node.depth), 0) + 1;
  const rows = Array.from({ length: levels }, () => ({ edge: 0, shape: 0, label: 0 }));
  for (const node of nodes) {
    const row = rows[node.depth];
    row.shape = Math.max(row.shape, node.height);
    if (node.lines.length) row.label = Math.max(row.label, metrics.labelGap + node.lines.length * metrics.labelLine);
    if (node.edgeLines.length) {
      row.edge = Math.max(row.edge, metrics.edgeLead + edgeBoxHeight(node.edgeLines.length, metrics) + metrics.edgeGap);
    }
  }
  let cursor = metrics.padding;
  rows.forEach((row, index) => {
    if (index > 0) cursor += metrics.levelGap;
    row.centre = cursor + row.edge + row.shape / 2;
    row.labelTop = cursor + row.edge + row.shape + metrics.labelGap;
    cursor += row.edge + row.shape + row.label;
  });
  const height = Math.ceil(cursor + metrics.padding);

  const minLeft = nodes.reduce((min, node) => Math.min(min, node.x - node.slot / 2), Infinity);
  const maxRight = nodes.reduce((max, node) => Math.max(max, node.x + node.slot / 2), -Infinity);
  const shift = metrics.padding - minLeft;
  const width = Math.ceil(maxRight - minLeft + 2 * metrics.padding);
  const baseline = (top, lineHeight, fontSize) => top + lineHeight / 2 + fontSize * 0.35;

  const placed = nodes.map((node) => {
    const row = rows[node.depth];
    const x = round(node.x + shift);
    const y = round(row.centre);
    const shapeTop = y - node.height / 2;
    const out = {
      id: node.id,
      parentId: node.parentId,
      depth: node.depth,
      label: node.label,
      value: node.value,
      edge: node.edge,
      shape: node.shape,
      x,
      y,
      width: node.width,
      height: node.height,
      slot: round(node.slot),
      grid: node.grid,
      valueY: round(valueCentre(node.shape, y, node.height) + metrics.valueFont * 0.35),
      lines: node.lines.map((text, index) => ({
        text,
        x,
        y: round(baseline(row.labelTop + index * metrics.labelLine, metrics.labelLine, metrics.labelFont)),
      })),
      labelBottom: node.lines.length ? round(row.labelTop + node.lines.length * metrics.labelLine) : null,
      edgeTag: null,
      points: isTriangle(node.shape) ? trianglePoints(node.shape, x, y, node.width, node.height) : null,
    };
    if (node.edgeLines.length) {
      const boxHeight = edgeBoxHeight(node.edgeLines.length, metrics);
      const boxTop = shapeTop - metrics.edgeGap - boxHeight;
      out.edgeTag = {
        x: round(x - node.edgeWidth / 2),
        y: round(boxTop),
        width: round(node.edgeWidth),
        height: round(boxHeight),
        lines: node.edgeLines.map((text, index) => ({
          text,
          x,
          y: round(baseline(boxTop + metrics.edgePadY + index * metrics.edgeLine, metrics.edgeLine, metrics.edgeFont)),
        })),
      };
    }
    return out;
  });

  const byId = new Map(placed.map((node) => [node.id, node]));
  const links = placed.filter((node) => node.parentId !== null).map((node) => {
    const parent = byId.get(node.parentId);
    // Lines leave from under the parent's label so they never cross its text.
    // 连线从父节点标签下方出发，避免穿过标签文字。
    const start = parent.labelBottom !== null ? parent.labelBottom + 2 : parent.y + parent.height / 2;
    return {
      from: parent.id,
      to: node.id,
      x1: parent.x,
      y1: round(start),
      x2: node.x,
      y2: round(node.y - node.height / 2),
    };
  });

  return { width, height, nodes: placed, links, levels, count, truncated };
}

/**
 * Plain one-line description of a normalized node: label (board rows joined by " / "), MAX/MIN role, value.
 * 用一行纯文本描述整理后的节点：标签（棋盘各行用 " / " 连接）、MAX/MIN 角色与数值。
 */
export function describeNode(node) {
  const label = String(node?.label || '?').split('\n').map((line) => line.trim()).filter(Boolean).join(' / ') || '?';
  const role = node?.shape === 'max' ? ' MAX' : node?.shape === 'min' ? ' MIN' : '';
  const value = node?.value ? ` = ${node.value}` : '';
  return `${label}${role}${value}`;
}

/**
 * One-paragraph bilingual summary for the diagram's aria-label: size, then the nodes level by level.
 * 供图表 aria-label 使用的一段双语摘要：先说规模，再逐层列出节点。
 */
export function describeTree(rawRoot) {
  const { root, count } = normalizeTree(rawRoot);
  if (!root) return '树形图 Tree diagram';
  const levels = [];
  (function walk(node) {
    if (!levels[node.depth]) levels[node.depth] = [];
    levels[node.depth].push(describeNode(node));
    node.children.forEach(walk);
  }(root));
  const parts = levels.map((names, index) => `第 ${index + 1} 层 Level ${index + 1}: ${names.join(', ')}`);
  return `树形图 Tree diagram, ${count} 个节点 nodes, ${levels.length} 层 levels. ${parts.join('; ')}.`;
}
