/**
 * Hash router: maps "#/learn/lec03/s02-state?x=1" to a route, path params and query params.
 * 哈希路由：将 "#/learn/lec03/s02-state?x=1" 解析为路由、路径参数与查询参数。
 *
 * Path params only accept lowercase kebab-case ids, so a crafted URL cannot inject odd values.
 * 路径参数只接受小写短横线格式的 id，防止构造的链接注入异常值。
 */
import { ROUTE_ID_SOURCE } from '../core/util/ids.js';

const PARAM = `(${ROUTE_ID_SOURCE})`;

export function compilePath(path) {
  const keys = [];
  const source = path.split('/').filter(Boolean).map((segment) => {
    if (!segment.startsWith(':')) return `/${segment}`;
    const optional = segment.endsWith('?');
    keys.push(segment.slice(1).replace('?', ''));
    return optional ? `(?:/${PARAM})?` : `/${PARAM}`;
  }).join('');
  return { regex: new RegExp(`^${source || '/'}/?$`), keys };
}

export function createRouter(routes, { onRoute, onNotFound }) {
  const compiled = routes.map((route) => ({ route, ...compilePath(route.path) }));

  function resolve() {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart = ''] = raw.split('?');
    const path = pathPart || '/';
    for (const { route, regex, keys } of compiled) {
      const match = regex.exec(path);
      if (!match) continue;
      const params = {};
      keys.forEach((key, index) => {
        if (match[index + 1] !== undefined) params[key] = match[index + 1];
      });
      return { route, params, query: new URLSearchParams(queryPart), path };
    }
    return null;
  }

  function handle() {
    const resolved = resolve();
    if (resolved) onRoute(resolved);
    else onNotFound?.(window.location.hash);
  }

  return {
    start() {
      window.addEventListener('hashchange', handle);
      handle();
    },
    refresh: handle,
    navigate(path) {
      const target = `#${path}`;
      if (window.location.hash === target) handle();
      else window.location.hash = path;
    },
  };
}
