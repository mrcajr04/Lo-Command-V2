/**
 * Safe local storage utility helper.
 */

export function getItem(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return fallback;
    }
    return JSON.parse(item);
  } catch (error) {
    console.error(`[Storage Helper] Error parsing key "${key}" from localStorage:`, error);
    return fallback;
  }
}

export function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`[Storage Helper] Error writing key "${key}" to localStorage:`, error);
  }
}
