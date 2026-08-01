chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.set({ installedAt: Date.now() });
});

var STUDIO_URL = chrome.runtime.getURL('studio.html');

async function savedStudioBounds() {
  var result = await chrome.storage.local.get('studioWindowBounds'); var b = result.studioWindowBounds || {};
  return { width: Math.min(480, Math.max(360, Number(b.width) || 420)), height: Math.min(560, Math.max(520, Number(b.height) || 540)), left: Number.isFinite(b.left) ? b.left : undefined, top: Number.isFinite(b.top) ? b.top : undefined };
}

async function findStudioTab() {
  var tabs = await chrome.tabs.query({}); return tabs.find(function (tab) { return tab.url === STUDIO_URL; }) || null;
}

async function openStudioWindow() {
  var existing = await findStudioTab();
  if (existing) { await chrome.windows.update(existing.windowId, { focused: true }); await chrome.tabs.update(existing.id, { active: true }); return existing.windowId; }
  var bounds = await savedStudioBounds(); var options = { url: STUDIO_URL, type: 'popup', focused: true, width: bounds.width, height: bounds.height };
  if (bounds.left !== undefined) options.left = bounds.left; if (bounds.top !== undefined) options.top = bounds.top;
  var created = await chrome.windows.create(options); return created.id;
}

async function detachStudioTab(tab) {
  if (!tab || !tab.id) return openStudioWindow();
  var currentWindow = await chrome.windows.get(tab.windowId); if (currentWindow.type === 'popup') { await chrome.windows.update(tab.windowId, { focused: true }); return tab.windowId; }
  var bounds = await savedStudioBounds(); var options = { tabId: tab.id, type: 'popup', focused: true, width: bounds.width, height: bounds.height };
  if (bounds.left !== undefined) options.left = bounds.left; if (bounds.top !== undefined) options.top = bounds.top;
  var created = await chrome.windows.create(options); return created.id;
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message) return false;
  if (message.type === 'open-studio') { openStudioWindow().then(function (windowId) { sendResponse({ ok: true, windowId: windowId }); }).catch(function (error) { sendResponse({ ok: false, error: error.message }); }); return true; }
  if (message.type === 'detach-studio') { detachStudioTab(sender.tab).then(function (windowId) { sendResponse({ ok: true, windowId: windowId }); }).catch(function (error) { sendResponse({ ok: false, error: error.message }); }); return true; }
  return false;
});

chrome.windows.onBoundsChanged.addListener(async function (windowInfo) {
  try { if (windowInfo.type !== 'popup') return; var tabs = await chrome.tabs.query({ windowId: windowInfo.id });
    if (!tabs.some(function (tab) { return tab.url === STUDIO_URL; })) return;
    chrome.storage.local.set({ studioWindowBounds: { left: windowInfo.left, top: windowInfo.top, width: windowInfo.width, height: windowInfo.height } });
  } catch (error) { console.debug('Studio bounds were not saved', error); }
});
