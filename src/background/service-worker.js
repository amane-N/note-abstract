'use strict';

const LOG_PREFIX = '[note-abstract:bg]';
const NOTE_ARTICLE_RE = /^https:\/\/note\.com\/[^/]+\/n\/[^/?#]+/;

const CONTENT_SCRIPT_FILES = [
  'src/lib/crypto.js',
  'src/lib/storage.js',
  'src/lib/note-parser.js',
  'src/lib/nano-summarizer.js',
  'src/content/side-panel.js',
  'src/content/content.js',
];

console.log(`${LOG_PREFIX} service worker loaded`);

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`${LOG_PREFIX} onInstalled: ${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
  console.log(`${LOG_PREFIX} onStartup`);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pingTab = async (tabId) => {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return !!(response && response.ok);
  } catch (_) {
    return false;
  }
};

const injectContentScripts = async (tabId) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPT_FILES,
    });
    return true;
  } catch (err) {
    console.warn(`${LOG_PREFIX} executeScript failed`, err && err.message ? err.message : err);
    return false;
  }
};

const ensureContentScripts = async (tabId) => {
  if (await pingTab(tabId)) return true;
  const injected = await injectContentScripts(tabId);
  if (!injected) return false;
  // Allow content scripts to register their message listeners.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sleep(60);
    if (await pingTab(tabId)) return true;
  }
  return false;
};

const flashBadge = async (tabId, text, color, durationMs = 3000) => {
  try {
    await chrome.action.setBadgeText({ text, tabId });
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
    }, durationMs);
  } catch (_) {
    // Ignore badge errors; UI nicety only.
  }
};

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || typeof tab.id !== 'number') return;

  if (!tab.url || !NOTE_ARTICLE_RE.test(tab.url)) {
    console.log(`${LOG_PREFIX} action clicked on non-article tab: ${tab.url || '(no url)'}`);
    if (tab.id) {
      await flashBadge(tab.id, '!', '#f59e0b');
    }
    return;
  }

  const ready = await ensureContentScripts(tab.id);
  if (!ready) {
    console.warn(`${LOG_PREFIX} could not ensure content scripts on tab ${tab.id}`);
    await flashBadge(tab.id, 'X', '#dc2626');
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' });
  } catch (err) {
    console.warn(`${LOG_PREFIX} sendMessage failed`, err && err.message ? err.message : err);
    await flashBadge(tab.id, 'X', '#dc2626');
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'OPEN_OPTIONS_PAGE') {
    try {
      if (typeof chrome.runtime.openOptionsPage === 'function') {
        chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'openOptionsPage unavailable' });
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} openOptionsPage failed`, err && err.message ? err.message : err);
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  return false;
});
