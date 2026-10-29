/**
 * Namespaced JSON storage on top of localStorage that never throws.
 * 基于 localStorage 的命名空间 JSON 存储，任何情况下都不抛出异常。
 *
 * Storage can be unavailable (private windows, blocked site data) or full (the origin is shared with
 * other pages), so every access is guarded. localStorage stays the source of truth, which keeps tabs
 * in step; a value whose last write failed is served from memory until a later write succeeds, so the
 * learner never sees an older saved value replace what they just did.
 * 存储可能不可用（隐私窗口、站点数据被禁用）或已满（同一域名下还有其他页面），因此每次访问都做防护。
 * 以 localStorage 为准，多个标签页之间保持一致；某个值最近一次写入失败时，在之后写入成功之前一直从内存读取，
 * 学习者刚做的操作不会被更早保存的旧值顶替。
 *
 * `storage` defaults to window.localStorage and can be injected (tests).
 * `storage` 默认为 window.localStorage，可以注入（用于测试）。
 */

const PREFIX = 'topphi-study';

function parse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function createLocalStore(namespace, storage) {
  // JSON text of every value written in this session, and the keys whose last write failed.
  // 本次会话写入的每个值的 JSON 文本，以及最近一次写入失败的键。
  const memory = new Map();
  const unsaved = new Set();
  const keyOf = (key) => `${PREFIX}:${namespace}:${key}`;
  const backend = () => storage ?? window.localStorage;

  return {
    get(key, fallback) {
      if (!unsaved.has(key)) {
        try {
          const raw = backend().getItem(keyOf(key));
          return raw === null ? fallback : JSON.parse(raw);
        } catch {
          // Storage is unavailable or holds broken JSON; use the copy in memory. 存储不可用或 JSON 损坏，改用内存副本。
        }
      }
      return memory.has(key) ? parse(memory.get(key), fallback) : fallback;
    },

    /** Returns true when the value reached localStorage. 值成功写入 localStorage 时返回 true。 */
    set(key, value) {
      let text;
      try {
        text = JSON.stringify(value);
      } catch {
        return false;
      }
      memory.set(key, text);
      try {
        backend().setItem(keyOf(key), text);
        unsaved.delete(key);
        return true;
      } catch {
        unsaved.add(key);
        return false;
      }
    },

    remove(key) {
      memory.delete(key);
      try {
        backend().removeItem(keyOf(key));
        unsaved.delete(key);
      } catch {
        // The stored copy may survive, so the key reads as empty from now on. 存储里的旧值可能还在，此后该键按空值读取。
        unsaved.add(key);
      }
    },

    keys() {
      const found = new Set();
      try {
        const store = backend();
        const prefix = keyOf('');
        for (let index = 0; index < store.length; index += 1) {
          const fullKey = store.key(index);
          if (fullKey && fullKey.startsWith(prefix)) found.add(fullKey.slice(prefix.length));
        }
      } catch {
        for (const key of memory.keys()) found.add(key);
      }
      for (const key of unsaved) {
        if (memory.has(key)) found.add(key);
        else found.delete(key);
      }
      return [...found];
    },
  };
}
