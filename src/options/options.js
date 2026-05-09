'use strict';

(() => {
  const LOG_PREFIX = '[note-abstract:options]';
  const ns = globalThis.__noteAbstract || {};

  const HISTORY_PAGE_SIZE = 20;

  const elements = {
    form: null,
    apiKeyInput: null,
    validateBtn: null,
    clearBtn: null,
    showHideBtn: null,
    statusBox: null,
    currentStatus: null,
    licenseForm: null,
    licenseInput: null,
    licenseActivateBtn: null,
    licenseDeactivateBtn: null,
    licenseStatus: null,
    licenseBadge: null,
    licenseFeedback: null,
    // History elements
    historyLockedArea: null,
    historyUnlockedArea: null,
    historyBadge: null,
    historySearchInput: null,
    historySearchClearBtn: null,
    historyExportJsonBtn: null,
    historyExportCsvBtn: null,
    historyClearAllBtn: null,
    historyPrevBtn: null,
    historyNextBtn: null,
    historyPageLabel: null,
    historyTableBody: null,
    historyEmptyMsg: null,
    historyModalOverlay: null,
    historyModalClose: null,
    historyModalTitle: null,
    historyModalBody: null,
  };

  // History state
  let _historyAllEntries = [];
  let _historyCurrentPage = 0;

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

  const setLicenseFeedback = (level, message) => {
    if (!elements.licenseFeedback) return;
    elements.licenseFeedback.dataset.level = level;
    elements.licenseFeedback.textContent = message || '';
  };

  const refreshLicenseStatus = async () => {
    if (!ns.License) {
      if (elements.licenseStatus) {
        elements.licenseStatus.textContent =
          'ライセンスモジュールの読み込みに失敗しました。拡張機能を再読み込みしてください。';
        elements.licenseStatus.dataset.state = 'empty';
      }
      return;
    }
    try {
      const info = await ns.License.getLicenseInfo();
      const isPremium = info.status === ns.License.STATUS_PREMIUM;
      if (elements.licenseBadge) {
        elements.licenseBadge.dataset.state = isPremium ? 'premium' : 'free';
        elements.licenseBadge.textContent = isPremium ? '有料層' : '無料層';
      }
      if (elements.licenseStatus) {
        if (isPremium) {
          const ts = info.activatedAt
            ? new Date(info.activatedAt).toLocaleString()
            : '日時不明';
          elements.licenseStatus.dataset.state = 'set';
          elements.licenseStatus.textContent = `有料層が有効です (有効化日時: ${ts})。履歴機能などの追加機能が利用できます。`;
        } else {
          elements.licenseStatus.dataset.state = 'empty';
          elements.licenseStatus.textContent =
            '現在は無料層です。ライセンスコードを入力して有効化すると、履歴などの追加機能が解放されます。';
        }
      }
      if (elements.licenseDeactivateBtn) {
        elements.licenseDeactivateBtn.disabled = !isPremium;
      }
    } catch (err) {
      if (elements.licenseStatus) {
        elements.licenseStatus.textContent = 'ライセンス状態の取得に失敗しました。';
        elements.licenseStatus.dataset.state = 'empty';
      }
    }
  };

  const onLicenseActivate = async (event) => {
    event.preventDefault();
    if (!ns.License) {
      setLicenseFeedback('error', 'ライセンスモジュールが読み込まれていません。拡張機能を再読み込みしてください。');
      return;
    }
    const code = (elements.licenseInput.value || '').trim();
    if (!code) {
      setLicenseFeedback('error', 'ライセンスコードを入力してください。');
      return;
    }
    setLicenseFeedback('info', 'ライセンスコードを検証しています…');
    elements.licenseActivateBtn.disabled = true;
    try {
      const result = await ns.License.activateLicense(code);
      if (!result.ok) {
        setLicenseFeedback('error', result.message || 'ライセンスを有効化できませんでした。');
        return;
      }
      elements.licenseInput.value = '';
      setLicenseFeedback('success', '有料層を有効化しました。履歴などの追加機能をご利用いただけます。');
      await refreshLicenseStatus();
    } catch (err) {
      setLicenseFeedback(
        'error',
        `ライセンスの有効化中にエラーが発生しました: ${err && err.message ? err.message : '詳細不明'}`
      );
    } finally {
      elements.licenseActivateBtn.disabled = false;
    }
  };

  // ---------------------------------------------------------------------------
  // History functions
  // ---------------------------------------------------------------------------

  const refreshHistorySection = async () => {
    if (!ns.License) return;
    try {
      const isPremium = await ns.License.isPremium();
      if (elements.historyLockedArea) elements.historyLockedArea.hidden = !!isPremium;
      if (elements.historyUnlockedArea) elements.historyUnlockedArea.hidden = !isPremium;
      if (elements.historyBadge) {
        elements.historyBadge.dataset.state = isPremium ? 'premium' : 'free';
        elements.historyBadge.textContent = isPremium ? '有料層' : '有料層で開放';
      }
      if (isPremium) {
        await loadHistory();
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} refreshHistorySection failed`, err && err.message ? err.message : err);
    }
  };

  const loadHistory = async () => {
    if (!ns.Storage) return;
    try {
      const query = (elements.historySearchInput && elements.historySearchInput.value) || '';
      const entries = query.trim()
        ? await ns.Storage.searchHistory(query.trim())
        : await ns.Storage.getHistory();
      _historyAllEntries = entries;
      _historyCurrentPage = 0;
      renderHistoryPage();
    } catch (err) {
      console.warn(`${LOG_PREFIX} loadHistory failed`, err && err.message ? err.message : err);
    }
  };

  const renderHistoryPage = () => {
    const total = _historyAllEntries.length;
    const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
    if (_historyCurrentPage >= totalPages) _historyCurrentPage = totalPages - 1;

    const start = _historyCurrentPage * HISTORY_PAGE_SIZE;
    const pageEntries = _historyAllEntries.slice(start, start + HISTORY_PAGE_SIZE);

    if (elements.historyPageLabel) {
      if (total === 0) {
        elements.historyPageLabel.textContent = '0 件';
      } else {
        elements.historyPageLabel.textContent =
          `${start + 1}–${Math.min(start + pageEntries.length, total)} / ${total} 件 (${_historyCurrentPage + 1}/${totalPages} ページ)`;
      }
    }
    if (elements.historyPrevBtn) {
      elements.historyPrevBtn.disabled = _historyCurrentPage <= 0;
    }
    if (elements.historyNextBtn) {
      elements.historyNextBtn.disabled = _historyCurrentPage >= totalPages - 1;
    }

    const tbody = elements.historyTableBody;
    if (!tbody) return;
    tbody.innerHTML = '';

    if (pageEntries.length === 0) {
      if (elements.historyEmptyMsg) elements.historyEmptyMsg.hidden = false;
      if (document.getElementById('history-table')) {
        document.getElementById('history-table').style.display = 'none';
      }
      return;
    }

    if (elements.historyEmptyMsg) elements.historyEmptyMsg.hidden = true;
    if (document.getElementById('history-table')) {
      document.getElementById('history-table').style.display = '';
    }

    pageEntries.forEach((entry) => {
      const tr = document.createElement('tr');

      // Date
      const tdDate = document.createElement('td');
      try {
        tdDate.textContent = entry.createdAt
          ? new Date(entry.createdAt).toLocaleString('ja-JP')
          : '—';
      } catch (_) {
        tdDate.textContent = entry.createdAt || '—';
      }
      tr.appendChild(tdDate);

      // Title
      const tdTitle = document.createElement('td');
      tdTitle.textContent = entry.title || entry.url || '(タイトル不明)';
      tdTitle.title = entry.title || '';
      tr.appendChild(tdTitle);

      // Type badges
      const tdType = document.createElement('td');
      tdType.style.whiteSpace = 'nowrap';
      if (entry.summary) {
        const b = document.createElement('span');
        b.className = 'type-badge';
        b.textContent = '要約';
        tdType.appendChild(b);
      }
      if (entry.prediction) {
        const b = document.createElement('span');
        b.className = 'type-badge';
        b.textContent = '予測';
        tdType.appendChild(b);
      }
      if (Array.isArray(entry.keywords) && entry.keywords.length > 0) {
        const b = document.createElement('span');
        b.className = 'type-badge';
        b.textContent = '関連';
        tdType.appendChild(b);
      }
      tr.appendChild(tdType);

      // Actions
      const tdActions = document.createElement('td');
      tdActions.style.whiteSpace = 'nowrap';

      const detailBtn = document.createElement('button');
      detailBtn.textContent = '詳細';
      detailBtn.style.marginRight = '4px';
      detailBtn.addEventListener('click', () => openHistoryModal(entry));
      tdActions.appendChild(detailBtn);

      const delBtn = document.createElement('button');
      delBtn.textContent = '削除';
      delBtn.className = 'danger';
      delBtn.addEventListener('click', async () => {
        if (!window.confirm('この履歴エントリを削除しますか?')) return;
        try {
          await ns.Storage.deleteHistory(entry.id);
          await loadHistory();
        } catch (err) {
          console.warn(`${LOG_PREFIX} deleteHistory failed`, err && err.message ? err.message : err);
        }
      });
      tdActions.appendChild(delBtn);

      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  };

  const openHistoryModal = (entry) => {
    const overlay = elements.historyModalOverlay;
    const titleEl = elements.historyModalTitle;
    const body = elements.historyModalBody;
    if (!overlay || !body) return;

    if (titleEl) titleEl.textContent = entry.title || '(タイトル不明)';
    body.innerHTML = '';

    const addField = (label, value) => {
      if (!value && value !== 0) return;
      const wrap = document.createElement('div');
      wrap.className = 'modal-field';
      const lEl = document.createElement('div');
      lEl.className = 'modal-label';
      lEl.textContent = label;
      const vEl = document.createElement('div');
      vEl.className = 'modal-value';
      vEl.textContent = String(value);
      wrap.appendChild(lEl);
      wrap.appendChild(vEl);
      body.appendChild(wrap);
    };

    const addLinkField = (label, url) => {
      if (!url) return;
      const wrap = document.createElement('div');
      wrap.className = 'modal-field';
      const lEl = document.createElement('div');
      lEl.className = 'modal-label';
      lEl.textContent = label;
      const vEl = document.createElement('div');
      vEl.className = 'modal-value';
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = url;
      vEl.appendChild(a);
      wrap.appendChild(lEl);
      wrap.appendChild(vEl);
      body.appendChild(wrap);
    };

    addLinkField('URL', entry.url);
    try {
      addField('保存日時', entry.createdAt ? new Date(entry.createdAt).toLocaleString('ja-JP') : '');
    } catch (_) {
      addField('保存日時', entry.createdAt || '');
    }
    addField('要約', entry.summary);
    if (Array.isArray(entry.keyPoints) && entry.keyPoints.length > 0) {
      addField('キーポイント', entry.keyPoints.join('\n'));
    }
    addField('予測', entry.prediction);
    if (Array.isArray(entry.keywords) && entry.keywords.length > 0) {
      addField('関連キーワード', entry.keywords.join(', '));
    }
    if (entry.templateId) {
      addField('テンプレート ID', entry.templateId);
    }

    overlay.hidden = false;
  };

  const closeHistoryModal = () => {
    if (elements.historyModalOverlay) {
      elements.historyModalOverlay.hidden = true;
    }
  };

  const exportHistoryJson = async () => {
    try {
      const query = (elements.historySearchInput && elements.historySearchInput.value) || '';
      const entries = query.trim()
        ? await ns.Storage.searchHistory(query.trim())
        : await ns.Storage.getHistory();
      const json = JSON.stringify(entries, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      a.download = `history-${ts}.json`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn(`${LOG_PREFIX} exportHistoryJson failed`, err && err.message ? err.message : err);
    }
  };

  const exportHistoryCsv = async () => {
    try {
      const query = (elements.historySearchInput && elements.historySearchInput.value) || '';
      const entries = query.trim()
        ? await ns.Storage.searchHistory(query.trim())
        : await ns.Storage.getHistory();

      const cols = ['id', 'url', 'title', 'createdAt', 'summary', 'keyPoints', 'prediction', 'keywords', 'templateId'];

      const escCsv = (val) => {
        const s = (val === null || val === undefined) ? '' : String(val);
        if (s.includes('"') || s.includes(',') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const rows = [cols.map(escCsv).join(',')];
      entries.forEach((e) => {
        rows.push(cols.map((col) => {
          if (col === 'keyPoints') {
            return escCsv(Array.isArray(e.keyPoints) ? e.keyPoints.join(' ') : (e.keyPoints || ''));
          }
          if (col === 'keywords') {
            return escCsv(Array.isArray(e.keywords) ? e.keywords.join(' ') : (e.keywords || ''));
          }
          return escCsv(e[col]);
        }).join(','));
      });

      // BOM + UTF-8
      const bom = '﻿';
      const csv = bom + rows.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      a.download = `history-${ts}.csv`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn(`${LOG_PREFIX} exportHistoryCsv failed`, err && err.message ? err.message : err);
    }
  };

  const onLicenseDeactivate = async () => {
    if (!ns.License) return;
    const ok = window.confirm('現在の有料層ライセンスを解除します。よろしいですか?');
    if (!ok) return;
    try {
      const result = await ns.License.deactivateLicense();
      if (!result.ok) {
        setLicenseFeedback('error', result.message || 'ライセンスを解除できませんでした。');
        return;
      }
      setLicenseFeedback('info', 'ライセンスを解除しました。無料層に戻りました。');
      await refreshLicenseStatus();
    } catch (err) {
      setLicenseFeedback(
        'error',
        `解除中にエラーが発生しました: ${err && err.message ? err.message : '詳細不明'}`
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
    elements.licenseForm = document.getElementById('license-form');
    elements.licenseInput = document.getElementById('license-input');
    elements.licenseActivateBtn = document.getElementById('license-activate-btn');
    elements.licenseDeactivateBtn = document.getElementById('license-deactivate-btn');
    elements.licenseStatus = document.getElementById('license-status');
    elements.licenseBadge = document.getElementById('license-badge');
    elements.licenseFeedback = document.getElementById('license-feedback');

    // History elements
    elements.historyLockedArea = document.getElementById('history-locked-area');
    elements.historyUnlockedArea = document.getElementById('history-unlocked-area');
    elements.historyBadge = document.getElementById('history-badge');
    elements.historySearchInput = document.getElementById('history-search-input');
    elements.historySearchClearBtn = document.getElementById('history-search-clear-btn');
    elements.historyExportJsonBtn = document.getElementById('history-export-json-btn');
    elements.historyExportCsvBtn = document.getElementById('history-export-csv-btn');
    elements.historyClearAllBtn = document.getElementById('history-clear-all-btn');
    elements.historyPrevBtn = document.getElementById('history-prev-btn');
    elements.historyNextBtn = document.getElementById('history-next-btn');
    elements.historyPageLabel = document.getElementById('history-page-label');
    elements.historyTableBody = document.getElementById('history-table-body');
    elements.historyEmptyMsg = document.getElementById('history-empty-msg');
    elements.historyModalOverlay = document.getElementById('history-modal-overlay');
    elements.historyModalClose = document.getElementById('history-modal-close');
    elements.historyModalTitle = document.getElementById('history-modal-title');
    elements.historyModalBody = document.getElementById('history-modal-body');

    if (!elements.form || !elements.apiKeyInput) {
      console.warn(`${LOG_PREFIX} required elements missing`);
      return;
    }

    elements.form.addEventListener('submit', onValidateSubmit);
    elements.clearBtn.addEventListener('click', onClearClick);
    elements.showHideBtn.addEventListener('click', onShowHideClick);

    if (elements.licenseForm) {
      elements.licenseForm.addEventListener('submit', onLicenseActivate);
    }
    if (elements.licenseDeactivateBtn) {
      elements.licenseDeactivateBtn.addEventListener('click', onLicenseDeactivate);
    }

    // History event handlers
    if (elements.historySearchInput) {
      let searchDebounce = null;
      elements.historySearchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => loadHistory(), 300);
      });
    }
    if (elements.historySearchClearBtn) {
      elements.historySearchClearBtn.addEventListener('click', async () => {
        if (elements.historySearchInput) elements.historySearchInput.value = '';
        await loadHistory();
      });
    }
    if (elements.historyExportJsonBtn) {
      elements.historyExportJsonBtn.addEventListener('click', exportHistoryJson);
    }
    if (elements.historyExportCsvBtn) {
      elements.historyExportCsvBtn.addEventListener('click', exportHistoryCsv);
    }
    if (elements.historyClearAllBtn) {
      elements.historyClearAllBtn.addEventListener('click', async () => {
        if (!ns.Storage) return;
        if (!window.confirm('すべての履歴を削除します。この操作は元に戻せません。よろしいですか?')) return;
        try {
          await ns.Storage.clearHistory();
          await loadHistory();
        } catch (err) {
          console.warn(`${LOG_PREFIX} clearHistory failed`, err && err.message ? err.message : err);
        }
      });
    }
    if (elements.historyPrevBtn) {
      elements.historyPrevBtn.addEventListener('click', () => {
        if (_historyCurrentPage > 0) {
          _historyCurrentPage -= 1;
          renderHistoryPage();
        }
      });
    }
    if (elements.historyNextBtn) {
      elements.historyNextBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(_historyAllEntries.length / HISTORY_PAGE_SIZE));
        if (_historyCurrentPage < totalPages - 1) {
          _historyCurrentPage += 1;
          renderHistoryPage();
        }
      });
    }
    if (elements.historyModalClose) {
      elements.historyModalClose.addEventListener('click', closeHistoryModal);
    }
    if (elements.historyModalOverlay) {
      elements.historyModalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.historyModalOverlay) closeHistoryModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.historyModalOverlay && !elements.historyModalOverlay.hidden) {
        closeHistoryModal();
      }
    });

    // Listen for license / history changes to keep the UI in sync — covers
    // both the side-panel writing new entries and any storage edit performed
    // from the same page via the Storage API.
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes) return;
        if ('license' in changes) {
          refreshHistorySection().catch(() => {});
          refreshLicenseStatus().catch(() => {});
        }
        if ('history' in changes) {
          loadHistory().catch(() => {});
        }
      });
    }

    refreshKeyStatus();
    refreshLicenseStatus();
    refreshHistorySection();
    console.log(`${LOG_PREFIX} options page loaded`);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
