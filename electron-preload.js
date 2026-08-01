const { contextBridge, ipcRenderer } = require('electron');

function callbackPromise(promise, callback) {
  promise.then((value) => { if (typeof callback === 'function') callback(value); });
  return promise;
}

const storage = {
  get(keys, callback) { return callbackPromise(ipcRenderer.invoke('storage-get', keys), callback); },
  set(values, callback) { return callbackPromise(ipcRenderer.invoke('storage-set', values), callback); },
  remove(keys, callback) { return callbackPromise(ipcRenderer.invoke('storage-remove', keys), callback); }
};

contextBridge.exposeInMainWorld('faceScreenChrome', {
  storage: { local: storage },
  downloads: {
    async download(options, callback) {
      const response = await fetch(options.url);
      const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
      const saved = await ipcRenderer.invoke('download-blob', { bytes, filename: options.filename });
      if (typeof callback === 'function') callback(saved ? 1 : undefined);
      return saved ? 1 : undefined;
    }
  },
  windows: { getCurrent(callback) { callback({ type: 'popup' }); } },
  tabs: { create() { ipcRenderer.invoke('open-settings'); } },
  runtime: {
    lastError: null,
    sendMessage(_message, callback) { if (typeof callback === 'function') callback({ ok: true }); }
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openWebcam(options) { return ipcRenderer.invoke('webcam-open', options); },
  closeWebcam() { return ipcRenderer.invoke('webcam-close'); },
  isWebcamOpen() { return ipcRenderer.invoke('webcam-is-open'); },
  toggleWebcamSize() { return ipcRenderer.invoke('webcam-toggle-size'); },
  resizeWebcam(size) { return ipcRenderer.invoke('webcam-resize', size); },
  onWebcamState(callback) { ipcRenderer.on('webcam-window-state', (_event, open) => callback(open)); },
  onWebcamBounds(callback) { ipcRenderer.on('webcam-window-bounds', (_event, bounds) => callback(bounds)); },
  sendWebcamCommand(command) { ipcRenderer.send('webcam-command', command); },
  onWebcamCommand(callback) { ipcRenderer.on('webcam-command', (_event, command) => callback(command)); },
  sendCameraSignal(message) { ipcRenderer.send('camera-signal', message); },
  onCameraSignal(callback) { ipcRenderer.on('camera-signal', (_event, message) => callback(message)); },
  onCaptureSourcesState(callback) { ipcRenderer.on('capture-sources-state', (_event, payload) => callback(payload)); },
  capturePickerReady() { ipcRenderer.send('capture-picker-ready'); },
  refreshCaptureSources() { ipcRenderer.send('capture-refresh'); },
  selectCaptureSource(selection) { ipcRenderer.send('capture-select', selection); },
  cancelCaptureSource() { ipcRenderer.send('capture-cancel'); },
  setControlLayout(mode) { return ipcRenderer.invoke('control-set-layout', mode); },
  minimize() { return ipcRenderer.invoke('window-minimize'); },
  close() { return ipcRenderer.invoke('window-close'); }
});
