const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const runtimeName = app.isPackaged ? 'FaceScreen Recorder' : 'FaceScreen Recorder Dev';
app.setPath('userData', path.join(app.getPath('appData'), runtimeName));
app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('userData'), 'Cache'));
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on('second-instance', () => {
  if (!controlWindow || controlWindow.isDestroyed()) return;
  if (controlWindow.isMinimized()) controlWindow.restore();
  controlWindow.show();
  controlWindow.focus();
});

let controlWindow = null;
let webcamWindow = null;
let webcamBoundsTimer = null;
let sourcePickerWindow = null;
let pendingDisplayCallback = null;
let captureSourceMap = new Map();
let captureRequestId = 0;
let displayRefreshTimer = null;

function createControlWindow() {
  const saved = readStorage().controlWindowBounds || {};
  controlWindow = new BrowserWindow({
    width: 220,
    height: 300,
    x: Number.isFinite(saved.x) ? saved.x : undefined,
    y: Number.isFinite(saved.y) ? saved.y : undefined,
    minWidth: 190,
    minHeight: 72,
    frame: false,
    transparent: false,
    backgroundColor: '#302f2e',
    resizable: false,
    show: false,
    title: 'FaceScreen Recorder',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  controlWindow.setMenuBarVisibility(false);
  controlWindow.loadFile('studio.html');
  controlWindow.webContents.on('console-message', (details) => console.log('[control]', details.message || 'renderer message')); 
  controlWindow.once('ready-to-show', () => controlWindow.show());
  const saveControlBounds = () => { if (!controlWindow || controlWindow.isDestroyed()) return; const bounds = controlWindow.getBounds(); writeStorage({ ...readStorage(), controlWindowBounds: { x: bounds.x, y: bounds.y } }); };
  controlWindow.on('move', saveControlBounds);
  controlWindow.on('closed', () => {
    controlWindow = null;
    if (webcamWindow && !webcamWindow.isDestroyed()) webcamWindow.close();
  });
}

function emitWebcamBounds() {
  if (!webcamWindow || webcamWindow.isDestroyed() || !controlWindow || controlWindow.isDestroyed()) return;
  const bounds = webcamWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const maxX = Math.max(1, area.width - bounds.width);
  const maxY = Math.max(1, area.height - bounds.height);
  controlWindow.webContents.send('webcam-window-bounds', {
    x: Math.max(0, Math.min(1, (bounds.x - area.x) / maxX)),
    y: Math.max(0, Math.min(1, (bounds.y - area.y) / maxY)),
    size: Math.max(15, Math.min(50, Math.round(bounds.width / area.width * 100)))
  });
}

function snapAndSaveWebcamBounds() {
  if (!webcamWindow || webcamWindow.isDestroyed()) return;
  const bounds = webcamWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const snapDistance = 64;
  let x = bounds.x;
  let y = bounds.y;
  if (Math.abs(bounds.x - area.x) <= snapDistance) x = area.x;
  if (Math.abs(bounds.x + bounds.width - (area.x + area.width)) <= snapDistance) x = area.x + area.width - bounds.width;
  if (Math.abs(bounds.y - area.y) <= snapDistance) y = area.y;
  if (Math.abs(bounds.y + bounds.height - (area.y + area.height)) <= snapDistance) y = area.y + area.height - bounds.height;
  if (x !== bounds.x || y !== bounds.y) webcamWindow.setPosition(x, y, false);
  const finalBounds = webcamWindow.getBounds();
  writeStorage({ ...readStorage(), webcamWindowBounds: finalBounds });
  emitWebcamBounds();
}

function scheduleWebcamBounds() {
  clearTimeout(webcamBoundsTimer);
  webcamBoundsTimer = setTimeout(snapAndSaveWebcamBounds, 180);
}

function setControlLayout(mode = 'compact') {
  if (!controlWindow || controlWindow.isDestroyed()) return;
  const layouts = {
    compact: { width: 220, height: 300, resizable: false },
    expanded: { width: 360, height: 480, resizable: true },
    recording: { width: 220, height: 72, resizable: false }
  };
  const layout = layouts[mode] || layouts.compact;
  controlWindow.setResizable(true);
  controlWindow.setSize(layout.width, layout.height, true);
  controlWindow.setResizable(layout.resizable);
}
function createWebcamWindow(options = {}) {
  if (webcamWindow && !webcamWindow.isDestroyed()) {
    webcamWindow.focus();
    return;
  }
  const storage = readStorage();
  const storedBounds = storage.webcamWindowBounds || {};
  const storedSize = storage.webcamSizeVersion === 2 ? Number(storedBounds.width) : 0;
  const size = Math.max(140, Math.min(320, Number(options.size) || storedSize || 180));
  if (storage.webcamSizeVersion !== 2) writeStorage({ ...storage, webcamSizeVersion: 2 });
  webcamWindow = new BrowserWindow({
    width: size,
    height: size,
    x: Number.isFinite(storedBounds.x) ? storedBounds.x : undefined,
    y: Number.isFinite(storedBounds.y) ? storedBounds.y : undefined,
    minWidth: 140,
    minHeight: 140,
    maxWidth: 320,
    maxHeight: 320,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    show: false,
    title: 'FaceScreen Webcam',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  webcamWindow.setAlwaysOnTop(true, 'floating');
  webcamWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  webcamWindow.webContents.on('console-message', (details) => console.log('[webcam]', details.message || 'renderer message')); 
  webcamWindow.loadFile('webcam.html', { query: {
    deviceId: options.deviceId || '',
    mirror: options.mirror ? '1' : '0',
    shape: options.shape || 'circle'
  }});
  webcamWindow.once('ready-to-show', () => { webcamWindow.show(); emitWebcamBounds(); });
  webcamWindow.on('move', scheduleWebcamBounds);
  webcamWindow.on('resize', scheduleWebcamBounds);
  webcamWindow.on('closed', () => {
    webcamWindow = null;
    if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send('webcam-window-state', false);
  });
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send('webcam-window-state', true);
}

function isCurrentPicker(target) {
  return Boolean(target && !target.isDestroyed() && target === sourcePickerWindow);
}

function sendCaptureState(target, state) {
  if (isCurrentPicker(target)) target.webContents.send('capture-sources-state', state);
}

function serializeCaptureSource(source) {
  return {
    id: source.id,
    name: source.name || 'Untitled source',
    kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnail: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : '',
    icon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : ''
  };
}

async function sendCaptureSources() {
  const target = sourcePickerWindow;
  if (!isCurrentPicker(target)) return;
  const requestId = ++captureRequestId;
  sendCaptureState(target, { status: 'loading' });
  let sources;
  try {
    sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
    if (!sources.length) throw new Error('No capture sources were returned.');
  } catch (primaryError) {
    console.warn('Full capture-source enumeration failed; retrying without previews', primaryError);
    try {
      sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    } catch (fallbackError) {
      if (requestId !== captureRequestId || !isCurrentPicker(target)) return;
      captureSourceMap.clear();
      console.error('Could not enumerate capture sources', fallbackError);
      sendCaptureState(target, { status: 'error', code: 'SOURCE_ENUMERATION_FAILED', message: 'FaceScreen could not read the available screens and windows.', detail: 'Close other screen-sharing dialogs, check Windows screen-capture permissions, then try again.' });
      return;
    }
  }
  if (requestId !== captureRequestId || !isCurrentPicker(target)) return;
  if (!sources.length) {
    captureSourceMap.clear();
    sendCaptureState(target, { status: 'empty', message: 'No screens or windows are available to record.', detail: 'Open the window you want to record, then refresh the list.' });
    return;
  }
  try {
    captureSourceMap = new Map(sources.map((source) => [source.id, source]));
    sendCaptureState(target, { status: 'ready', sources: sources.map(serializeCaptureSource) });
  } catch (error) {
    captureSourceMap.clear();
    console.error('Could not prepare capture sources', error);
    sendCaptureState(target, { status: 'error', code: 'SOURCE_PREVIEW_FAILED', message: 'FaceScreen found your sources but could not prepare their previews.', detail: 'Try refreshing the list. If this continues, restart FaceScreen.' });
  }
}

function scheduleCaptureSourceRefresh() {
  clearTimeout(displayRefreshTimer);
  displayRefreshTimer = setTimeout(() => sendCaptureSources(), 250);
}

function invokeDisplayCallback(callback, result) {
  if (!callback) return;
  try { callback(result); }
  catch (error) {
    if (result && result.video) console.error('Could not start display capture', error);
    else console.debug('Display capture cancelled');
  }
}

function finishDisplayRequest(result = {}) {
  const callback = pendingDisplayCallback;
  pendingDisplayCallback = null;
  invokeDisplayCallback(callback, result);
  if (sourcePickerWindow && !sourcePickerWindow.isDestroyed()) sourcePickerWindow.close();
}

function openSourcePicker(callback) {
  const previousCallback = pendingDisplayCallback;
  pendingDisplayCallback = null;
  invokeDisplayCallback(previousCallback, {});
  if (sourcePickerWindow && !sourcePickerWindow.isDestroyed()) {
    sourcePickerWindow.removeAllListeners('closed');
    sourcePickerWindow.close();
  }
  pendingDisplayCallback = callback;
  sourcePickerWindow = new BrowserWindow({
    width: 820, height: 600, minWidth: 650, minHeight: 500, frame: false, resizable: true,
    backgroundColor: '#2d2c2a', show: false, title: 'Choose what to record', parent: controlWindow || undefined,
    webPreferences: { preload: path.join(__dirname, 'electron-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  sourcePickerWindow.setMenuBarVisibility(false);
  sourcePickerWindow.webContents.on('console-message', (details) => console.log('[source-picker]', details.message || 'renderer message'));
  sourcePickerWindow.loadFile('source-picker.html');
  sourcePickerWindow.once('ready-to-show', () => { sourcePickerWindow.show(); sourcePickerWindow.focus(); });
  sourcePickerWindow.on('closed', () => {
    captureRequestId += 1;
    sourcePickerWindow = null;
    captureSourceMap.clear();
    if (pendingDisplayCallback) { const pending = pendingDisplayCallback; pendingDisplayCallback = null; invokeDisplayCallback(pending, {}); }
  });
}

function storagePath() { return path.join(app.getPath('userData'), 'facescreen-storage.json'); }
function readStorage() {
  try { return JSON.parse(fs.readFileSync(storagePath(), 'utf8')); } catch { return {}; }
}
function writeStorage(value) {
  fs.mkdirSync(path.dirname(storagePath()), { recursive: true });
  fs.writeFileSync(storagePath(), JSON.stringify(value, null, 2));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media' || permission === 'display-capture');
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'media' || permission === 'display-capture'));
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => openSourcePicker(callback));
  screen.on('display-added', scheduleCaptureSourceRefresh);
  screen.on('display-removed', scheduleCaptureSourceRefresh);
  screen.on('display-metrics-changed', scheduleCaptureSourceRefresh);
  createControlWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createControlWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('storage-get', (_event, keys) => {
  const data = readStorage();
  if (keys == null) return data;
  if (typeof keys === 'string') return { [keys]: data[keys] };
  if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, data[key]]));
  return Object.fromEntries(Object.keys(keys).map((key) => [key, data[key] === undefined ? keys[key] : data[key]]));
});
ipcMain.handle('storage-set', (_event, values) => { writeStorage({ ...readStorage(), ...values }); });
ipcMain.handle('storage-remove', (_event, keys) => {
  const data = readStorage();
  for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
  writeStorage(data);
});
ipcMain.handle('download-blob', async (_event, payload) => {
  const result = await dialog.showSaveDialog(controlWindow, { defaultPath: payload.filename });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, Buffer.from(payload.bytes));
  return true;
});
ipcMain.handle('webcam-open', (_event, options) => { createWebcamWindow(options); return true; });
ipcMain.handle('webcam-close', () => { if (webcamWindow && !webcamWindow.isDestroyed()) webcamWindow.close(); return true; });
ipcMain.handle('webcam-is-open', () => Boolean(webcamWindow && !webcamWindow.isDestroyed()));
ipcMain.handle('webcam-resize', (event, requestedSize) => {
  if (!webcamWindow || webcamWindow.isDestroyed() || event.sender !== webcamWindow.webContents) return false;
  const size = Math.max(140, Math.min(320, Math.round(Number(requestedSize) || 180)));
  const bounds = webcamWindow.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(size, area.width);
  const height = Math.min(size, area.height);
  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - height));
  webcamWindow.setBounds({ x, y, width, height }, false);
  scheduleWebcamBounds();
  return size;
});
ipcMain.handle('webcam-toggle-size', (event) => {
  if (!webcamWindow || webcamWindow.isDestroyed() || event.sender !== webcamWindow.webContents) return false;
  const bounds = webcamWindow.getBounds();
  const targetSize = bounds.width <= 180 ? 240 : 140;
  const area = screen.getDisplayMatching(bounds).workArea;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const x = Math.max(area.x, Math.min(area.x + area.width - targetSize, Math.round(centerX - targetSize / 2)));
  const y = Math.max(area.y, Math.min(area.y + area.height - targetSize, Math.round(centerY - targetSize / 2)));
  webcamWindow.setBounds({ x, y, width: targetSize, height: targetSize }, true);
  scheduleWebcamBounds();
  return true;
});
ipcMain.handle('control-set-layout', (_event, mode) => { setControlLayout(mode); return true; });
ipcMain.on('webcam-command', (_event, command) => { if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send('webcam-command', command); });
ipcMain.on('camera-signal', (event, message) => { const fromWebcam = webcamWindow && !webcamWindow.isDestroyed() && event.sender.id === webcamWindow.webContents.id; const target = fromWebcam ? controlWindow : webcamWindow; if (target && !target.isDestroyed()) target.webContents.send('camera-signal', message); });
ipcMain.on('capture-picker-ready', (event) => {
  if (sourcePickerWindow && event.sender === sourcePickerWindow.webContents) sendCaptureSources();
});
ipcMain.on('capture-refresh', (event) => {
  if (sourcePickerWindow && event.sender === sourcePickerWindow.webContents) sendCaptureSources();
});
ipcMain.on('capture-cancel', (event) => {
  if (sourcePickerWindow && event.sender === sourcePickerWindow.webContents) finishDisplayRequest({});
});
ipcMain.on('capture-select', (event, selection = {}) => {
  if (!sourcePickerWindow || event.sender !== sourcePickerWindow.webContents) return;
  const source = captureSourceMap.get(selection.id);
  if (!source) return;
  finishDisplayRequest({ video: source, audio: selection.includeAudio ? 'loopback' : undefined });
});
ipcMain.handle('window-minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.handle('window-close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.handle('open-settings', () => shell.openExternal(process.platform === 'win32' ? 'ms-settings:privacy-webcam' : 'https://support.google.com/chrome/answer/2693767'));
