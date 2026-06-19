// ui/Storage.js
// 跨环境的轻量持久化封装：浏览器用 localStorage，Node/测试环境退化为内存对象。
// 只做 JSON 存取，不含业务逻辑。

const memory = new Map();

function hasLocal() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch (_) {
    return false;
  }
}

export const Storage = {
  get(key, fallback = null) {
    try {
      const raw = hasLocal() ? localStorage.getItem(key) : memory.get(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  },

  set(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (hasLocal()) localStorage.setItem(key, raw);
      else memory.set(key, raw);
    } catch (_) {
      memory.set(key, raw);
    }
  },

  remove(key) {
    try {
      if (hasLocal()) localStorage.removeItem(key);
      else memory.delete(key);
    } catch (_) {
      memory.delete(key);
    }
  },
};
