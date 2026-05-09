'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const API_KEY_STORAGE = 'apiKeyEncrypted';
  const SETTINGS_KEY = 'settings';
  const HISTORY_KEY = 'history';
  const HISTORY_LIMIT = 1000;

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

  // ---------------------------------------------------------------------------
  // History API
  // ---------------------------------------------------------------------------

  const _readHistory = async () => {
    const store = localStore();
    if (!store) return [];
    const data = await store.get(HISTORY_KEY);
    const list = data && data[HISTORY_KEY];
    return Array.isArray(list) ? list : [];
  };

  const _writeHistory = async (list) => {
    const store = localStore();
    if (!store) throw new Error('STORAGE_LOCAL_UNAVAILABLE');
    await store.set({ [HISTORY_KEY]: list });
  };

  const addHistory = async (entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('STORAGE_INVALID_ENTRY');
    }
    const store = localStore();
    if (!store) throw new Error('STORAGE_LOCAL_UNAVAILABLE');

    const list = await _readHistory();

    // Find existing entry with same URL (UPSERT).
    const idx = typeof entry.url === 'string'
      ? list.findIndex((e) => e.url === entry.url)
      : -1;

    let saved;
    if (idx >= 0) {
      // Merge: keep createdAt from existing, update other fields.
      const existing = list[idx];
      const merged = { ...existing };
      for (const [key, val] of Object.entries(entry)) {
        if (val !== undefined && key !== 'createdAt') {
          merged[key] = val;
        }
      }
      list[idx] = merged;
      saved = merged;
    } else {
      // New entry — assign id and createdAt.
      const clean = {};
      for (const [key, val] of Object.entries(entry)) {
        if (val !== undefined) {
          clean[key] = val;
        }
      }
      clean.id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      clean.createdAt = new Date().toISOString();
      list.push(clean);
      saved = clean;
    }

    // Trim to HISTORY_LIMIT (oldest first by createdAt).
    if (list.length > HISTORY_LIMIT) {
      list.sort((a, b) => {
        const ta = a.createdAt || '';
        const tb = b.createdAt || '';
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });
      list.splice(0, list.length - HISTORY_LIMIT);
    }

    await _writeHistory(list);
    return saved;
  };

  const getHistory = async (filters) => {
    const list = await _readHistory();
    const { limit, offset = 0, sort = 'desc' } = filters || {};

    const sorted = [...list].sort((a, b) => {
      const ta = a.createdAt || '';
      const tb = b.createdAt || '';
      if (sort === 'asc') return ta < tb ? -1 : ta > tb ? 1 : 0;
      return ta > tb ? -1 : ta < tb ? 1 : 0;
    });

    const sliced = sorted.slice(offset);
    return typeof limit === 'number' ? sliced.slice(0, limit) : sliced;
  };

  const searchHistory = async (query) => {
    const list = await _readHistory();
    const q = (typeof query === 'string' ? query : '').trim().toLowerCase();

    const filtered = q
      ? list.filter((entry) => {
          const fields = [
            entry.title || '',
            entry.summary || '',
            entry.prediction || '',
            ...(Array.isArray(entry.keyPoints) ? entry.keyPoints : []),
            ...(Array.isArray(entry.keywords) ? entry.keywords : []),
          ];
          return fields.some((f) => String(f).toLowerCase().includes(q));
        })
      : [...list];

    return filtered.sort((a, b) => {
      const ta = a.createdAt || '';
      const tb = b.createdAt || '';
      return ta > tb ? -1 : ta < tb ? 1 : 0;
    });
  };

  const deleteHistory = async (id) => {
    const list = await _readHistory();
    const next = list.filter((e) => e.id !== id);
    await _writeHistory(next);
  };

  const clearHistory = async () => {
    await _writeHistory([]);
  };

  ns.Storage = {
    getApiKey,
    setApiKey,
    clearApiKey,
    hasApiKey,
    getSettings,
    setSettings,
    DEFAULT_SETTINGS,
    addHistory,
    getHistory,
    searchHistory,
    deleteHistory,
    clearHistory,
    HISTORY_LIMIT,
    KEYS: { API_KEY_STORAGE, SETTINGS_KEY, HISTORY_KEY },
  };
})();
