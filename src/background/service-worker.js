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
