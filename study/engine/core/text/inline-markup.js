/**
 * Renders the content inline markup (**bold**, `code`, line breaks) into DOM nodes.
 * 将内容中的行内标记（**粗体**、`代码`、换行）渲染为 DOM 节点。
 *
 * Content files are data, so text always becomes text nodes; no HTML is ever interpreted.
 * 内容文件只是数据，文字一律作为文本节点插入，绝不解释任何 HTML。
 */

const TOKEN = /(\*\*.+?\*\*|`[^`\n]+`|\n)/g;

/**
 * DOM-free parse of the markup: [{ type: 'text' | 'strong' | 'code' | 'break', text?, children? }].
 * Bold may contain code; code is always literal.
 * 不依赖 DOM 的标记解析结果：[{ type: 'text' | 'strong' | 'code' | 'break', text?, children? }]。粗体里可以有代码，代码内容一律按原样保留。
 */
export function inlineTokens(text) {
  const tokens = [];
  if (text === undefined || text === null) return tokens;
  for (const part of String(text).split(TOKEN)) {
    if (!part) continue;
    if (part === '\n') {
      tokens.push({ type: 'break' });
    } else if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      tokens.push({ type: 'strong', children: inlineTokens(part.slice(2, -2)) });
    } else if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      tokens.push({ type: 'code', text: part.slice(1, -1) });
    } else {
      tokens.push({ type: 'text', text: part });
    }
  }
  return tokens;
}

function appendTokens(parent, tokens) {
  for (const token of tokens) {
    if (token.type === 'break') {
      parent.append(document.createElement('br'));
    } else if (token.type === 'strong') {
      const strong = document.createElement('strong');
      appendTokens(strong, token.children);
      parent.append(strong);
    } else if (token.type === 'code') {
      const code = document.createElement('code');
      code.textContent = token.text;
      parent.append(code);
    } else {
      parent.append(document.createTextNode(token.text));
    }
  }
  return parent;
}

export function renderInline(text) {
  return appendTokens(document.createDocumentFragment(), inlineTokens(text));
}

/**
 * Removes markup characters, for search indexes, speech and aria labels.
 * 去除标记符号，供搜索索引、朗读与无障碍标签使用。
 */
export function stripMarkup(text) {
  return String(text ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1');
}
