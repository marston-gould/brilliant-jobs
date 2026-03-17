window.safeReadLS = function safeReadLS(key, defaultVal) {
  try {
    var raw = localStorage.getItem(key);
    if (raw === null) return defaultVal;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return raw;
    }
  } catch (e) {
    return defaultVal;
  }
};
