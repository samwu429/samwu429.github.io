/**
 * Fetches same-origin JSON once per URL and shares the pending promise.
 * 按 URL 只请求一次同源 JSON，并复用进行中的请求。
 */

const cache = new Map();

export function fetchJson(url) {
  const key = String(url);
  if (!cache.has(key)) {
    const request = fetch(key, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status} while loading ${key}`), { status: response.status });
        return response.json();
      })
      .catch((error) => {
        // A file that is not there (404) stays remembered for this visit, so pages that ask for it
        // again do not repeat the request; other failures are evicted so a later retry can succeed.
        // 不存在的文件（404）在本次访问中记住结果，再次请求它的页面不会重复发请求；其他失败会被移出缓存，便于之后重试成功。
        if (error?.status !== 404) cache.delete(key);
        throw error;
      });
    cache.set(key, request);
  }
  return cache.get(key);
}
