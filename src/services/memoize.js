const memoize = (fn, { maxSize = 10 } = {}) => {
  const cache = new Map();
  return async (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      const val = cache.get(key);
      cache.delete(key);
      cache.set(key, val);
      return val;
    }
    const result = await fn.apply(this, args);
    cache.set(key, result);
    if (cache.size > maxSize) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    return result;
  };
};

module.exports = memoize;
