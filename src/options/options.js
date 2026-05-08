'use strict';

(() => {
  const LOG_PREFIX = '[note-abstract:options]';
  const ns = globalThis.__noteAbstract || {};

  const elements = {
    form: null,
    apiKeyInput: null,
    validateBtn: null,
    clearBtn: null,
    showHideBtn: null,
    statusBox: null,
    currentStatus: null,
  };

  const setFeedback = (level, message) => {
    if (!elements.statusBox) return;
    elements.statusBox.dataset.level = level;
    elements.statusBox.textContent = message || '';
  };

  const refreshKeyStatus = async () => {
    if (!ns.Storage) {
      elements.currentStatus.textContent = 'ストレージモジュールの読み込みに失敗しました。拡張機能を再読み込みしてください。';
      elements.currentStatus.dataset.state = 'empty';
      return;
    }
    try {
      const has = await ns.Storage.hasApiKey();
      if (has) {
        elements.currentStatus.textContent = '現在 API キーが設定されています。再検証する場合は新しいキーを入力してください。';
        elements.currentStatus.dataset.state = 'set';
        elements.clearBtn.disabled = false;
      } else {
        elements.currentStatus.textContent = 'API キーは未設定です。下のフォームから登録してください。';
        elements.currentStatus.dataset.state = 'empty';
        elements.clearBtn.disabled = true;
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} refreshKeyStatus failed`, err && err.message ? err.message : err);
      elements.currentStatus.textContent = '設定状態の取得に失敗しました。';
      elements.currentStatus.dataset.state = 'empty';
    }
  };

  const validateInputShape = (key) => {
    if (!key) return 'API キーを入力してください。';
    if (key.length < 20) {
      return 'API キーが短すぎます。Google AI Studio から取得した完全なキーを入力してください。';
    }
    if (/\s/.test(key)) {
      return 'API キーに空白文字が含まれています。コピー時の余分な改行や空白を取り除いてください。';
    }
    return null;
  };

  const onValidateSubmit = async (event) => {
    event.preventDefault();
    if (!ns.Storage || !ns.GeminiClient) {
      setFeedback('error', '必要なモジュールが読み込まれていません。拡張機能を再読み込みしてください。');
      return;
    }
    const key = elements.apiKeyInput.value.trim();
    const shapeError = validateInputShape(key);
    if (shapeError) {
      setFeedback('error', shapeError);
      return;
    }

    setFeedback('info', 'Gemini API へ検証リクエストを送信しています…');
    elements.validateBtn.disabled = true;
    elements.clearBtn.disabled = true;
    try {
      const result = await ns.GeminiClient.validateApiKey(key);
      if (!result.ok) {
        setFeedback(
          'error',
          `検証に失敗しました: ${result.message || '不明なエラーです。'} キーは保存していません。`
        );
        return;
      }
      await ns.Storage.setApiKey(key);
      elements.apiKeyInput.value = '';
      elements.apiKeyInput.type = 'password';
      elements.showHideBtn.textContent = '表示';
      setFeedback('success', '検証に成功しました。API キーを暗号化して保存しました。');
      await refreshKeyStatus();
    } catch (err) {
      console.warn(`${LOG_PREFIX} validate/save failed`, err && err.message ? err.message : err);
      setFeedback(
        'error',
        `保存中にエラーが発生しました: ${err && err.message ? err.message : '詳細不明'}`
      );
      await refreshKeyStatus();
    } finally {
      elements.validateBtn.disabled = false;
    }
  };

  const onClearClick = async () => {
    if (!ns.Storage) return;
    const ok = window.confirm('保存されている API キーを削除します。よろしいですか?');
    if (!ok) return;
    try {
      await ns.Storage.clearApiKey();
      setFeedback('info', 'API キーを削除しました。');
      await refreshKeyStatus();
    } catch (err) {
      setFeedback(
        'error',
        `削除に失敗しました: ${err && err.message ? err.message : '詳細不明'}`
      );
    }
  };

  const onShowHideClick = () => {
    if (!elements.apiKeyInput) return;
    const next = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
    elements.apiKeyInput.type = next;
    elements.showHideBtn.textContent = next === 'password' ? '表示' : '隠す';
  };

  const init = () => {
    elements.form = document.getElementById('api-key-form');
    elements.apiKeyInput = document.getElementById('api-key-input');
    elements.validateBtn = document.getElementById('validate-btn');
    elements.clearBtn = document.getElementById('clear-btn');
    elements.showHideBtn = document.getElementById('show-hide-btn');
    elements.statusBox = document.getElementById('status-box');
    elements.currentStatus = document.getElementById('current-status');

    if (!elements.form || !elements.apiKeyInput) {
      console.warn(`${LOG_PREFIX} required elements missing`);
      return;
    }

    elements.form.addEventListener('submit', onValidateSubmit);
    elements.clearBtn.addEventListener('click', onClearClick);
    elements.showHideBtn.addEventListener('click', onShowHideClick);

    refreshKeyStatus();
    console.log(`${LOG_PREFIX} options page loaded`);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
