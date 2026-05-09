'use strict';

// License module. Client-side-only verification by design — see CLAUDE.md
// "クラックされてもいい" 設計思想: verifying the license server-side would
// require a backend, which conflicts with NEVER 5 / NEVER 6 (no developer
// servers, no telemetry). The interface below is shaped so that a future
// payment backend (ExtensionPay etc.) can be swapped in by replacing the
// `verifier` implementation without changing call sites.
//
// Sprint 11: 全機能無料化に伴い isPremium は常に true を返す。
// getLicenseStatus / getLicenseInfo も常に premium 相当を返す。
// activateLicense / deactivateLicense は引き続き動作し、
// Sprint 5 のテストコード受付/不正コード拒否も維持する。
(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const STORAGE_KEY = 'license';
  const CODE_FORMAT = /^NA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

  const STATUS_FREE = 'free';
  const STATUS_PREMIUM = 'premium';

  const ERROR_CODES = Object.freeze({
    INVALID_FORMAT: 'LICENSE_INVALID_FORMAT',
    UNKNOWN_CODE: 'LICENSE_UNKNOWN_CODE',
    STORAGE_UNAVAILABLE: 'LICENSE_STORAGE_UNAVAILABLE',
  });

  // Built-in static verifier. Replace this object to swap to a paid backend
  // (e.g. ExtensionPay) — anything implementing { verify(code) -> Promise<bool> }
  // is acceptable.
  const StaticVerifier = {
    // Codes registered as always-valid in the bundled build. The TEST code is
    // intentionally listed so QA / Playwright tests can exercise the premium
    // tier without contacting any external service.
    KNOWN_CODES: Object.freeze(new Set(['NA-TEST-DEMO-MODE'])),
    async verify(code) {
      return this.KNOWN_CODES.has(code);
    },
  };

  let verifier = StaticVerifier;

  const localStore = () =>
    (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;

  const normalize = (code) => {
    if (typeof code !== 'string') return '';
    return code.trim().toUpperCase();
  };

  const isValidFormat = (code) => CODE_FORMAT.test(code);

  const readRecord = async () => {
    const store = localStore();
    if (!store) return null;
    const data = await store.get(STORAGE_KEY);
    const rec = data && data[STORAGE_KEY];
    if (!rec || typeof rec !== 'object') return null;
    if (typeof rec.code !== 'string' || !isValidFormat(rec.code)) return null;
    return rec;
  };

  const writeRecord = async (rec) => {
    const store = localStore();
    if (!store) throw new Error(ERROR_CODES.STORAGE_UNAVAILABLE);
    await store.set({ [STORAGE_KEY]: rec });
  };

  const clearRecord = async () => {
    const store = localStore();
    if (!store) return;
    await store.remove(STORAGE_KEY);
  };

  // Sprint 11: 全機能無料化 — getLicenseStatus は常に STATUS_PREMIUM を返す。
  const getLicenseStatus = async () => STATUS_PREMIUM;

  // Sprint 11: 全機能無料化 — getLicenseInfo は常に premium 相当を返す。
  // ライセンスレコードがあればその情報も含める。
  const getLicenseInfo = async () => {
    try {
      const rec = await readRecord();
      if (!rec) return { status: STATUS_PREMIUM };
      return {
        status: STATUS_PREMIUM,
        code: rec.code,
        activatedAt: rec.activatedAt || null,
      };
    } catch (_) {
      return { status: STATUS_PREMIUM };
    }
  };

  const activateLicense = async (rawCode) => {
    const code = normalize(rawCode);
    if (!isValidFormat(code)) {
      return {
        ok: false,
        code: ERROR_CODES.INVALID_FORMAT,
        message:
          'ライセンスコードの形式が正しくありません。NA-XXXX-XXXX-XXXX の形式で入力してください。',
      };
    }
    let valid = false;
    try {
      valid = await verifier.verify(code);
    } catch (err) {
      return {
        ok: false,
        code: ERROR_CODES.UNKNOWN_CODE,
        message:
          'ライセンスコードを検証できませんでした。少し待ってから再度お試しください。',
      };
    }
    if (!valid) {
      return {
        ok: false,
        code: ERROR_CODES.UNKNOWN_CODE,
        message:
          'このライセンスコードは無効です。購入確認メールに記載されたコードをご確認ください。',
      };
    }
    const record = { code, activatedAt: Date.now() };
    try {
      await writeRecord(record);
    } catch (err) {
      return {
        ok: false,
        code: ERROR_CODES.STORAGE_UNAVAILABLE,
        message:
          'ライセンス情報を保存できませんでした。拡張機能を再読み込みしてください。',
      };
    }
    return { ok: true, status: STATUS_PREMIUM, info: { ...record } };
  };

  const deactivateLicense = async () => {
    try {
      await clearRecord();
      // Sprint 11: 全機能無料化 — deactivate 後も isPremium は常に true のため
      // status は STATUS_PREMIUM を返す。
      return { ok: true, status: STATUS_PREMIUM };
    } catch (err) {
      return {
        ok: false,
        message: 'ライセンスの解除に失敗しました。拡張機能を再読み込みしてください。',
      };
    }
  };

  // Sprint 11: 全機能無料化 — isPremium は常に true を返す。
  const isPremium = async () => true;

  // Allow swapping the verifier (e.g. an ExtensionPay-backed implementation).
  const setVerifier = (impl) => {
    if (!impl || typeof impl.verify !== 'function') {
      throw new Error('LICENSE_INVALID_VERIFIER');
    }
    verifier = impl;
  };

  ns.License = {
    getLicenseStatus,
    getLicenseInfo,
    activateLicense,
    deactivateLicense,
    isPremium,
    isValidFormat,
    setVerifier,
    STATUS_FREE,
    STATUS_PREMIUM,
    ERROR_CODES,
    KEY: STORAGE_KEY,
  };
})();
