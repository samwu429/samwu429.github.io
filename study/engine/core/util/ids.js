/**
 * The id format shared by routes, storage keys and content links: lowercase kebab-case such as
 * "lec03" or "s02-state-tree". Path params of the hash router only accept this form.
 * 路由、存储键与内容链接共用的 id 格式：小写短横线形式，例如 "lec03"、"s02-state-tree"。哈希路由的路径参数只接受这种格式。
 */

export const ROUTE_ID_SOURCE = '[a-z0-9]+(?:-[a-z0-9]+)*';

const ROUTE_ID = new RegExp(`^${ROUTE_ID_SOURCE}$`);

export function isRouteId(value) {
  return typeof value === 'string' && ROUTE_ID.test(value);
}
