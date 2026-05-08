'use strict';

const LOG_PREFIX = '[note-abstract:bg]';

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`${LOG_PREFIX} onInstalled: ${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
  console.log(`${LOG_PREFIX} onStartup`);
});

console.log(`${LOG_PREFIX} service worker loaded`);
