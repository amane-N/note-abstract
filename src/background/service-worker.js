'use strict';

const LOG_PREFIX = '[note-abstract:bg]';
const NOTE_ARTICLE_RE = /^https:\/\/note\.com\/[^/]+\/n\/[^/?#]+/;

const CONTENT_SCRIPT_FILES = [
  'src/lib/crypto.js',
  'src/lib/storage.js',
  'src/lib/note-parser.js',
  'src/lib/nano-summarizer.js',
  'src/lib/gemini-client.js',
  'src/lib/predictor.js',
  'src/lib/keyword-suggester.js',
  'src/content/side-panel.js',
  'src/content/content.js',
];

const log = (...args) => {
  // ISO time HH:MM:SS.mmm prefix so we can correlate clicks with handler firings.
  const stamp = new Date().toISOString().substring(11, 23);
  console.log(LOG_PREFIX, stamp, ...args);
};

log('service worker loaded');

chrome.runtime.onInstalled.addListener((details) => {
  log('onInstalled:', details.reason);
});

chrome.runtime.onStartup.addListener(() => {
  log('onStartup');
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
    console.warn(LOG_PREFIX, 'executeScript failed', err && err.message ? err.message : err);
    return false;
  }
};

const ensureContentScripts = async (tabId) => {
  if (await pingTab(tabId)) return true;
  if (!(await injectContentScripts(tabId))) return false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sleep(60);
    if (await pingTab(tabId)) return true;
  }
  return false;
};

const flashBadge = (tabId, text, color, durationMs = 3000) => {
  try {
    chrome.action.setBadgeText({ text, tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color, tabId }).catch(() => {});
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
    }, durationMs);
  } catch (_) {
    // badge UI is a nicety only
  }
};

const dispatchToggle = async (tab, source) => {
  log(`dispatchToggle source=${source}`, {
    tabId: tab && tab.id,
    url: tab && tab.url,
  });

  if (!tab || typeof tab.id !== 'number') {
    log('dispatchToggle aborted: tab id missing');
    return;
  }

  if (!tab.url || !NOTE_ARTICLE_RE.test(tab.url)) {
    log('dispatchToggle aborted: URL is not a note article');
    flashBadge(tab.id, '!', '#f59e0b');
    return;
  }

  const ready = await ensureContentScripts(tab.id);
  if (!ready) {
    console.warn(LOG_PREFIX, 'ensureContentScripts failed for tab', tab.id);
    flashBadge(tab.id, 'X', '#dc2626');
    return;
  }

  // Fire-and-forget: content.js responds synchronously and runs the workflow async.
  chrome.tabs
    .sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' })
    .catch((err) => {
      const msg = err && err.message ? err.message : String(err);
      if (/message channel closed/i.test(msg)) return;
      console.warn(LOG_PREFIX, 'sendMessage failed', msg);
    });
  log('dispatchToggle: TOGGLE_SIDE_PANEL sent to tab', tab.id);
};

chrome.action.onClicked.addListener((tab) => {
  log('chrome.action.onClicked fired');
  dispatchToggle(tab, 'action.onClicked');
});

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command, tab) => {
    log('chrome.commands.onCommand fired', command);
    if (command !== 'toggle-panel') return;
    let activeTab = tab;
    if (!activeTab || typeof activeTab.id !== 'number') {
      // Older Chrome versions do not pass `tab` to commands.onCommand.
      const queried = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      activeTab = queried && queried[0];
    }
    dispatchToggle(activeTab, 'commands.onCommand');
  });
}

// Proactively inject the content scripts when a note article tab finishes loading
// so the very first action click / shortcut reaches a live listener — even when
// the user installed the extension after the tab was already open.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab || !tab.url || !NOTE_ARTICLE_RE.test(tab.url)) return;
  const alive = await pingTab(tabId);
  if (alive) return;
  log('proactive injection on tabs.onUpdated', tabId, tab.url);
  await injectContentScripts(tabId);
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
      console.warn(LOG_PREFIX, 'openOptionsPage failed', err && err.message ? err.message : err);
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  return false;
});
