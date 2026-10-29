/**
 * In-memory stand-in for window.localStorage. `failWrites` makes setItem throw like a full or
 * blocked storage; `failReads` makes every access throw like a private window with site data blocked.
 * window.localStorage 的内存替身。`failWrites` 让 setItem 像存储已满或被禁用时一样抛错；
 * `failReads` 让每次访问都抛错，模拟禁用站点数据的隐私窗口。
 */
export function createFakeStorage(entries = {}) {
  const data = new Map(Object.entries(entries));
  const guard = () => {
    if (storage.failReads) throw new Error('SecurityError');
  };
  const storage = {
    failWrites: false,
    failReads: false,
    get length() {
      guard();
      return data.size;
    },
    key(index) {
      guard();
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      guard();
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      guard();
      if (storage.failWrites) throw new Error('QuotaExceededError');
      data.set(key, String(value));
    },
    removeItem(key) {
      guard();
      data.delete(key);
    },
    raw: data,
  };
  return storage;
}
