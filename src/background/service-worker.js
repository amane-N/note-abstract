'use strict';

const LOG_PREFIX = '[note-abstract:bg]';
const NOTE_ARTICLE_RE = /^https:\/\/note\.com\/[^/]+\/n\/[^/?#]+/;

console.log(`${LOG_PREFIX} service worker loaded`);

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`${LOG_PREFIX} onInstalled: ${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
  console.log(`${LOG_PREFIX} onStartup`);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || typeof tab.id !== 'number') return;
  if (!tab.url || !NOTE_ARTICLE_RE.test(tab.url)) {
    console.log(`${LOG_PREFIX} action clicked on non-note tab: ${tab.url || '(no url)'}`);
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' });
  } catch (err) {
    console.warn(`${LOG_PREFIX} sendMessage failed`, err && err.message ? err.message : err);
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
