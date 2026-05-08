'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const API_KEY_STORAGE = 'apiKeyEncrypted';
  const SETTINGS_KEY = 'settings';

  const DEFAULT_SETTINGS = Object.freeze({
    panelEnabled: true,
    enableSummary: true,
    enablePrediction: false,
    enableRelated: false,
    model: 'gemini-2.5-flash',
  });

  const localStore = () =>
    (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;

  const syncStore = () =>
    (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) || null;

  const getApiKey = async () => {
    const store = localStore();
    if (!store) return null;
    if (!ns.Crypto) return null;
    const data = await store.get(API_KEY_STORAGE);
    const enc = data && data[API_KEY_STORAGE];
    if (!enc || typeof enc !== 'string') return null;
    try {
      const plain = ns.Crypto.decrypt(enc);
      return plain || null;
    } catch (_) {
      return null;
    }
  };

  const setApiKey = async (key) => {
    if (typeof key !== 'string' || !key.trim()) {
      throw new Error('STORAGE_INVALID_API_KEY');
    }
    const store = localStore();
    if (!store) throw new Error('STORAGE_LOCAL_UNAVAILABLE');
    if (!ns.Crypto) throw new Error('STORAGE_CRYPTO_MISSING');
    const enc = ns.Crypto.encrypt(key.trim());
    await store.set({ [API_KEY_STORAGE]: enc });
  };

  const clearApiKey = async () => {
    const store = localStore();
    if (!store) return;
    await store.remove(API_KEY_STORAGE);
  };

  const hasApiKey = async () => {
    const key = await getApiKey();
    return typeof key === 'string' && key.length > 0;
  };

  const getSettings = async () => {
    const store = syncStore();
    if (!store) return { ...DEFAULT_SETTINGS };
    const data = await store.get(SETTINGS_KEY);
    const stored = (data && data[SETTINGS_KEY]) || {};
    return { ...DEFAULT_SETTINGS, ...stored };
  };

  const setSettings = async (partial) => {
    const store = syncStore();
    if (!store) throw new Error('STORAGE_SYNC_UNAVAILABLE');
    const current = await getSettings();
    const merged = { ...current, ...(partial || {}) };
    await store.set({ [SETTINGS_KEY]: merged });
    return merged;
  };

  ns.Storage = {
    getApiKey,
    setApiKey,
    clearApiKey,
    hasApiKey,
    getSettings,
    setSettings,
    DEFAULT_SETTINGS,
    KEYS: { API_KEY_STORAGE, SETTINGS_KEY },
  };
})();
