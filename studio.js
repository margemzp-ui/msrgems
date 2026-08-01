(function () {
  'use strict';

  var chromeApi = window.faceScreenChrome || window.chrome;

  var isElectronRuntime = Boolean((window.electronAPI && window.electronAPI.isElectron) || /Electron/i.test(navigator.userAgent));
  if (isElectronRuntime) document.documentElement.classList.add('electron-app');

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    canvas: $('previewCanvas'), screenVideo: $('screenVideo'), cameraVideo: $('cameraVideo'), empty: $('emptyPreview'),
    countdown: $('countdown'), recordBadge: $('recordBadge'), statusDot: $('statusDot'), statusText: $('statusText'), detachStudio: $('detachStudioBtn'),
    timer: $('timer'), sessionState: $('sessionState'), start: $('startBtn'), stop: $('stopBtn'), pause: $('pauseBtn'), miniPause: $('miniPauseBtn'), miniStop: $('miniStopBtn'), previewCamera: $('previewCameraBtn'), floatCamera: $('floatCameraBtn'),
    snapshot: $('snapshotBtn'), cameraField: $('cameraField'), cameraSelect: $('cameraSelect'), micEnabled: $('micEnabled'),
    micField: $('micField'), autoWebcam: $('autoWebcam'), micSelect: $('micSelect'), micMeter: $('micMeter'), micMeterStatus: $('micMeterStatus'), systemAudioDot: $('systemAudioDot'), systemAudioStatus: $('systemAudioStatus'), cameraReady: $('cameraReadyState'), micReady: $('micReadyState'), lighting: $('lightingState'), framing: $('framingState'), quickBar: $('cameraQuickBar'), quickCamera: $('quickCameraBtn'), quickMic: $('quickMicBtn'), quickMirror: $('quickMirrorBtn'), quickShape: $('quickShapeBtn'), coach: $('cameraCoach'), dismissCoach: $('dismissCameraCoach'), pipSection: $('pipSection'), pipEnabled: $('pipEnabled'), pipControls: $('pipControls'), mirrorCamera: $('mirrorCamera'), pipShape: $('pipShape'),
    pipPosition: $('pipPosition'), pipSize: $('pipSize'), pipSizeValue: $('pipSizeValue'), quality: $('qualityPreset'), resolution: $('resolutionSelect'), fps: $('fpsSelect'), bitrate: $('bitrateSelect'),
    previewEnabled: $('previewEnabled'), hardwareAcceleration: $('hardwareAcceleration'), hardwareStatus: $('hardwareStatus'), hardwareDetails: $('hardwareDetails'), hardwareStatusDot: $('hardwareStatusDot'), performanceProfile: $('performanceProfile'), performanceStatus: $('performanceStatus'), performanceDetails: $('performanceDetails'), performanceStatusDot: $('performanceStatusDot'), reset: $('resetBtn'), result: $('resultPanel'), resultMeta: $('resultMeta'),
    resultTitle: $('resultTitle'), downloadAgain: $('downloadAgainBtn'), dismissResult: $('dismissResultBtn'), recentList: $('recentList'), clearHistory: $('clearHistoryBtn'),
    settingsToggle: $('settingsToggleBtn'), toolboxToggle: $('toolboxToggleBtn'), settingsPanel: $('settingsPanel'), toolboxPanel: $('toolboxPanel')
  };
  var ctx = els.canvas.getContext('2d', { alpha: false, desynchronized: true });
  var state = { mode: 'screen', displayStream: null, cameraStream: null, micStream: null, audioCtx: null, analyser: null, meterFrame: 0, meterLastAt: 0, recorder: null, recordingPipeline: '', chunks: [], writer: null, animation: 0, lastFrameAt: 0, renderCost: 0, adaptiveUntil: 0, timerId: 0, startedAt: 0, pausedAt: 0, pausedTotal: 0, lastBlobUrl: '', lastFilename: '', lastOpfsName: '', stopping: false, micUnavailable: false, gpuAvailable: false, deviceTier: 'balanced', previewOnly: false, cameraOn: true, cameraPermissionBlocked: false, pipCustom: null, draggingPip: null, lightingTimer: 0, documentPipWindow: null, cameraPeer: null, cameraPeerCandidates: [] };

  function setStatus(text, kind) {
    els.statusText.textContent = text;
    els.statusDot.classList.toggle('recording', kind === 'recording');
  }
  function setSession(text) { els.sessionState.textContent = text; }
  function setCameraPreviewButton(active) { els.previewCamera.setAttribute('aria-pressed', active ? 'true' : 'false'); els.previewCamera.setAttribute('aria-label', active ? 'Stop camera preview' : 'Start camera preview'); els.previewCamera.title = active ? 'Stop camera preview' : 'Start camera preview'; }
  function setToolButtonLabel(button, label) { var text = button.querySelector('span'); if (text) text.textContent = label; else button.textContent = label; }
  function setFloatingWindowUi(floating) { els.detachStudio.classList.toggle('floating', floating); els.detachStudio.disabled = floating; els.detachStudio.setAttribute('aria-label', floating ? 'Move widget using the window title bar' : 'Detach widget'); els.detachStudio.title = floating ? 'Move FaceScreen using the window title bar.' : 'Detach FaceScreen into a movable Chrome window.'; }
  function detectWindowMode() { chromeApi.windows.getCurrent(function (windowInfo) { setFloatingWindowUi(windowInfo.type === 'popup'); }); }
  function detachStudio() { if (state.recorder && state.recorder.state !== 'inactive') { showError(new Error('Stop the recording before changing widget mode.')); return; } els.detachStudio.disabled = true; chromeApi.runtime.sendMessage({ type: 'detach-studio' }, function (response) { var runtimeMessage = chromeApi.runtime.lastError && chromeApi.runtime.lastError.message; if (runtimeMessage && /message port closed|receiving end does not exist/i.test(runtimeMessage)) { setTimeout(detectWindowMode, 300); return; } if (runtimeMessage || (response && response.ok === false)) { els.detachStudio.disabled = false; showError(new Error((response && response.error) || runtimeMessage || 'Could not detach FaceScreen.')); return; } setTimeout(detectWindowMode, 100); }); }
  function rawQuality() {
    var height = Number(els.resolution.value), fps = Number(els.fps.value), bitrate = Number(els.bitrate.value);
    return { height: height, fps: fps, bitrate: bitrate * 1000000, width: height === 480 ? 640 : Math.round(height * 16 / 9) };
  }
  function detectDeviceTier() { var cores = navigator.hardwareConcurrency || 4, memory = Number(navigator.deviceMemory) || 0; state.deviceTier = cores <= 4 || (memory > 0 && memory <= 4) ? 'low' : cores <= 8 || (memory > 0 && memory <= 8) ? 'balanced' : 'high'; return { tier: state.deviceTier, cores: cores, memory: memory }; }
  function quality() { var requested = rawQuality(); return { height: requested.height, fps: requested.fps, bitrate: requested.bitrate, width: requested.width, capped: false }; }
  function previewFrameRate() { var profile = els.performanceProfile.value; if (profile === 'economy') return 5; if (profile === 'balanced') return 8; if (profile === 'quality') return 15; return state.deviceTier === 'low' ? 5 : state.deviceTier === 'balanced' ? 8 : 15; }
  function usesDirectRecording() { return state.mode === 'screen' && state.displayStream && state.displayStream.getVideoTracks().length > 0; }
  function updatePerformanceStatus() { var device = detectDeviceTier(), actual = quality(), previewFps = previewFrameRate(), label = device.tier === 'low' ? 'Low-resource preview profile' : device.tier === 'high' ? 'High-capacity preview profile' : 'Balanced preview profile'; els.performanceStatus.textContent = label; els.performanceStatusDot.classList.remove('warn'); els.performanceDetails.textContent = 'Export preserved at ' + actual.height + 'p Â· ' + actual.fps + ' FPS Â· ' + Math.round(actual.bitrate / 1000000) + ' Mbps. Live preview uses up to ' + previewFps + ' FPS on this ' + device.cores + '-core device.'; document.documentElement.classList.toggle('reduced-effects', previewFps <= 8); }
  function setCanvasSize() { var q = quality(); els.canvas.width = q.width; els.canvas.height = q.height; }
  async function updateHardwareAccelerationStatus() {
    els.canvas.classList.toggle('gpu-preferred', els.hardwareAcceleration.checked);
    if (!els.hardwareAcceleration.checked) { els.hardwareStatusDot.className = 'off'; els.hardwareStatus.textContent = 'GPU preference disabled'; els.hardwareDetails.textContent = 'Chrome may still accelerate rendering or encoding automatically.'; return; }
    var probe = document.createElement('canvas'); var gl = probe.getContext('webgl2', { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true }) || probe.getContext('webgl', { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true }); state.gpuAvailable = !!gl;
    var q = quality(), codec = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'vp9' : 'vp8'; var info = null;
    // MediaRecorder.isTypeSupported above is the reliable cross-runtime capability check.
    var accelerated = state.gpuAvailable || (info && info.powerEfficient); els.hardwareStatusDot.className = accelerated ? 'on' : 'off';
    if (info && info.powerEfficient) { els.hardwareStatus.textContent = 'Hardware-efficient encoding available'; els.hardwareDetails.textContent = q.height + 'p at ' + q.fps + ' FPS is reported as power efficient by Chrome.'; }
    else if (state.gpuAvailable) { els.hardwareStatus.textContent = 'GPU compositing available'; els.hardwareDetails.textContent = 'High-performance WebGL is available; encoder acceleration is controlled by Chrome.'; }
    else { els.hardwareStatus.textContent = 'Hardware acceleration not confirmed'; els.hardwareDetails.textContent = 'Facescreen Recorder will safely use standard browser compositing.'; }
  }
  function paintEmpty() { ctx.fillStyle = '#03060b'; ctx.fillRect(0, 0, els.canvas.width, els.canvas.height); }
  function currentBaseVideo() { return state.mode === 'camera' ? els.cameraVideo : els.screenVideo; }

  function drawCover(video, x, y, w, h) {
    if (!video.videoWidth || !video.videoHeight) return;
    var scale = Math.max(w / video.videoWidth, h / video.videoHeight);
    var sw = w / scale, sh = h / scale;
    var sx = (video.videoWidth - sw) / 2, sy = (video.videoHeight - sh) / 2;
    ctx.drawImage(video, sx, sy, sw, sh, x, y, w, h);
  }
  function drawCameraCover(video, x, y, w, h) { if (!state.cameraOn) return; if (!els.mirrorCamera.checked) { drawCover(video, x, y, w, h); return; } ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); drawCover(video, 0, 0, w, h); ctx.restore(); }
  function drawContain(video, x, y, w, h) {
    if (!video.videoWidth || !video.videoHeight) return;
    var scale = Math.min(w / video.videoWidth, h / video.videoHeight);
    var dw = video.videoWidth * scale, dh = video.videoHeight * scale;
    ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  function pipRect() {
    var cw = els.canvas.width, ch = els.canvas.height, ratio = Number(els.pipSize.value) / 100;
    var w = Math.round(cw * ratio), h = els.pipShape.value === 'circle' ? w : Math.round(w * 9 / 16);
    var gap = Math.round(cw * .025), pos = els.pipPosition.value;
    if (state.pipCustom) return { x: state.pipCustom.x * (cw - w), y: state.pipCustom.y * (ch - h), w: w, h: h };
    return { x: pos.endsWith('r') ? cw - w - gap : gap, y: pos.startsWith('b') ? ch - h - gap : gap, w: w, h: h };
  }
  function roundedPath(x, y, w, h, radius) {
    var r = Math.min(radius, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function renderFrame(timestamp) {
    var recording = state.recorder && state.recorder.state === 'recording';
    var compositeRecording = recording && state.recordingPipeline === 'composite';
    var targetFps = compositeRecording ? quality().fps : state.previewOnly && isElectronRuntime && document.body.classList.contains('webcam-floating') ? 2 : previewFrameRate();
    if (!recording && performance.now() < state.adaptiveUntil) targetFps = Math.min(targetFps, 5);
    var interval = 1000 / targetFps; var now = timestamp || performance.now();
    if (state.lastFrameAt && now - state.lastFrameAt < interval) { state.animation = requestAnimationFrame(renderFrame); return; } state.lastFrameAt = now; var renderStarted = performance.now();
    paintEmpty();
    var base = currentBaseVideo();
    if (base && base.readyState >= 2) {
      if (state.mode === 'camera') drawCameraCover(base, 0, 0, els.canvas.width, els.canvas.height);
      else drawContain(base, 0, 0, els.canvas.width, els.canvas.height);
    }
    if (state.mode === 'pip' && els.pipEnabled.checked && els.cameraVideo.readyState >= 2) {
      var r = pipRect(); ctx.save();
      if (els.pipShape.value === 'circle') { ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); ctx.clip(); }
      else if (els.pipShape.value === 'rounded') { roundedPath(r.x, r.y, r.w, r.h, Math.round(r.w * .08)); ctx.clip(); }
      drawCameraCover(els.cameraVideo, r.x, r.y, r.w, r.h); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(2, els.canvas.width / 500);
      if (els.pipShape.value === 'circle') { ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
      else { roundedPath(r.x, r.y, r.w, r.h, els.pipShape.value === 'rounded' ? Math.round(r.w * .08) : 0); ctx.stroke(); }
    }
    var cost = performance.now() - renderStarted; state.renderCost = state.renderCost ? state.renderCost * .9 + cost * .1 : cost; if (!recording && state.renderCost > interval * .72 && performance.now() > state.adaptiveUntil) { state.adaptiveUntil = performance.now() + 2500; els.performanceStatus.textContent = 'Reducing live preview load'; els.performanceStatusDot.classList.add('warn'); setTimeout(updatePerformanceStatus, 2700); } else if (compositeRecording && state.renderCost > interval * .9) { els.performanceStatus.textContent = 'Export quality preserved â€” close other apps if frames become uneven'; els.performanceStatusDot.classList.add('warn'); }
    state.animation = requestAnimationFrame(renderFrame);
  }

  function setMode(mode) {
    if (state.recorder && state.recorder.state !== 'inactive') return;
    if (mode === 'screen' && state.previewOnly) stopCameraPreview();
    state.mode = mode;
    document.querySelectorAll('.mode').forEach(function (button) { var active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-checked', active ? 'true' : 'false'); });
    els.cameraField.hidden = mode === 'screen'; $('cameraReadiness').hidden = mode === 'screen'; els.pipSection.hidden = mode !== 'pip'; els.previewCamera.hidden = false; els.canvas.classList.toggle('pip-draggable', mode === 'pip');
    if (mode === 'pip') chromeApi.storage.local.get('cameraCoachSeen', function (result) { if (!result.cameraCoachSeen) els.coach.hidden = false; }); else els.coach.hidden = true; savePrefs();
  }
  function setControls(recording) {
    els.start.hidden = recording; els.stop.hidden = !recording; els.pause.hidden = !recording;
    els.previewCamera.hidden = recording; els.floatCamera.hidden = !state.cameraStream;
    document.body.classList.toggle('recording-mini', recording);
    if (isElectronRuntime && window.electronAPI) window.electronAPI.sendWebcamCommand({ type: 'recording', enabled: recording });
    if (recording) closePanels();
    syncElectronLayout(recording ? 'recording' : undefined);
    document.querySelectorAll('.mode, select, input').forEach(function (control) { control.disabled = recording; });
    els.snapshot.disabled = !state.displayStream && !state.cameraStream;
  }
  async function listDevices() {
    try {
      var devices = await navigator.mediaDevices.enumerateDevices();
      fillSelect(els.cameraSelect, devices.filter(function (d) { return d.kind === 'videoinput'; }), 'Default camera');
      fillSelect(els.micSelect, devices.filter(function (d) { return d.kind === 'audioinput'; }), 'Default microphone');
    } catch (error) { console.warn('Device enumeration failed', error); }
  }
  function fillSelect(select, devices, fallback) {
    var selected = select.value; select.innerHTML = '';
    devices.forEach(function (device, index) { var option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || fallback + ' ' + (index + 1); select.appendChild(option); });
    if (!devices.length) { var option = document.createElement('option'); option.value = ''; option.textContent = fallback; select.appendChild(option); }
    if ([].some.call(select.options, function (o) { return o.value === selected; })) select.value = selected;
  }
  function attachStream(video, stream) { video.srcObject = stream; return video.play(); }
  function updateSystemAudio(hasAudio) { els.systemAudioDot.className = hasAudio ? 'on' : 'off'; els.systemAudioStatus.textContent = hasAudio ? 'Shared source audio included' : 'No source audio - enable Share audio in Chrome when available'; }
  function startMicMeter() {
    if (!state.micStream) return;
    if (!state.audioCtx) state.audioCtx = new AudioContext();
    state.analyser = state.audioCtx.createAnalyser(); state.analyser.fftSize = 256;
    state.audioCtx.createMediaStreamSource(state.micStream).connect(state.analyser);
    var data = new Uint8Array(state.analyser.frequencyBinCount);
    function drawMeter(now) { if (!state.analyser) return; if (!state.meterLastAt || now - state.meterLastAt >= 66) { state.meterLastAt = now; state.analyser.getByteTimeDomainData(data); var sum = 0; for (var i = 0; i < data.length; i++) { var sample = (data[i] - 128) / 128; sum += sample * sample; } var level = Math.min(100, Math.sqrt(sum / data.length) * 260); els.micMeter.style.width = level + '%'; els.micMeterStatus.textContent = level > 3 ? 'Active' : 'Quiet'; } state.meterFrame = requestAnimationFrame(drawMeter); }
    state.meterFrame = requestAnimationFrame(drawMeter);
  }
  function setReady(el, text, kind) { el.textContent = text; el.className = kind || ''; }
  function startLightingCheck() { clearInterval(state.lightingTimer); var sample = document.createElement('canvas'); sample.width = 24; sample.height = 14; var sampleCtx = sample.getContext('2d', { willReadFrequently: true }); function check() { if (!state.cameraStream || els.cameraVideo.readyState < 2) return; sampleCtx.drawImage(els.cameraVideo, 0, 0, sample.width, sample.height); var pixels = sampleCtx.getImageData(0, 0, sample.width, sample.height).data, total = 0; for (var i = 0; i < pixels.length; i += 4) total += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722; var average = total / (pixels.length / 4); if (average < 55) setReady(els.lighting, 'Too dark', 'warn'); else if (average > 220) setReady(els.lighting, 'Too bright', 'warn'); else setReady(els.lighting, 'Good', 'ready'); } check(); var slowDiagnostics = els.performanceProfile.value === 'economy' || (els.performanceProfile.value === 'auto' && state.deviceTier === 'low'); state.lightingTimer = setInterval(check, slowDiagnostics ? 3500 : 1800); }
  async function startCameraPreview() {
    if (state.cameraStream) { stopCameraPreview(); return; }
    try {
      setStatus('Requesting camera preview', 'busy'); var q = quality(); state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: els.cameraSelect.value ? { exact: els.cameraSelect.value } : undefined, width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.fps } }, audio: false }); state.cameraPermissionBlocked = false; await attachStream(els.cameraVideo, state.cameraStream); state.previewOnly = true; state.cameraOn = true; els.quickCamera.setAttribute('aria-pressed', 'true'); els.quickCamera.textContent = 'Camera on'; setReady(els.cameraReady, 'Ready', 'ready'); setReady(els.framing, 'Adjust in preview', 'ready');
      if (els.micEnabled.checked) { try { state.micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: els.micSelect.value ? { exact: els.micSelect.value } : undefined, echoCancellation: true, noiseSuppression: true }, video: false }); startMicMeter(); setReady(els.micReady, 'Active', 'ready'); els.quickMic.setAttribute('aria-pressed', 'true'); els.quickMic.textContent = 'Mic on'; } catch (error) { setReady(els.micReady, 'Blocked', 'warn'); els.quickMic.setAttribute('aria-pressed', 'false'); els.quickMic.textContent = 'Mic off'; } } else { setReady(els.micReady, 'Disabled', ''); els.quickMic.setAttribute('aria-pressed', 'false'); els.quickMic.textContent = 'Mic off'; }
      els.empty.hidden = true; els.quickBar.hidden = false; setCameraPreviewButton(true); els.floatCamera.hidden = false; els.snapshot.disabled = false; startLightingCheck(); setStatus('Camera preview ready', 'ready'); setSession('Check framing and audio'); return true;
    } catch (error) { if (error.name === 'NotAllowedError') { showCameraPermissionHelp(); return; } setReady(els.cameraReady, 'Unavailable', 'warn'); showError(new Error('Camera preview failed: ' + error.message)); }
  }
  function stopCameraPreview() { if (state.recorder && state.recorder.state !== 'inactive') return; [state.cameraStream, state.micStream].forEach(function (stream) { if (stream) stream.getTracks().forEach(function (track) { track.stop(); }); }); state.cameraStream = state.micStream = null; state.previewOnly = false; els.cameraVideo.srcObject = null; clearInterval(state.lightingTimer); state.analyser = null; cancelAnimationFrame(state.meterFrame); if (state.audioCtx) state.audioCtx.close().catch(function () {}); state.audioCtx = null; els.quickBar.hidden = true; els.floatCamera.hidden = true; setCameraPreviewButton(false); els.empty.hidden = false; els.snapshot.disabled = true; setReady(els.cameraReady, 'Not checked', ''); setReady(els.micReady, 'Not checked', ''); setReady(els.lighting, 'Not checked', ''); setReady(els.framing, 'Use live preview', ''); setStatus('Ready to capture', 'ready'); setSession('Not started'); }
  async function acquireSources() {
    var q = quality(); state.micUnavailable = false; if (state.mode === 'camera') { els.systemAudioDot.className = 'off'; els.systemAudioStatus.textContent = 'Camera mode uses microphone audio only'; }
    if (state.mode !== 'camera') {
      setSession('Select a screen, window, or tab');
      try {
        state.displayStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: q.fps } }, audio: true });
      } catch (error) {
        if (error.name === 'NotAllowedError') throw new Error('Screen sharing was cancelled. Click Start recording and choose a source in Chrome\'s share dialog.');
        throw new Error('Chrome could not start screen sharing: ' + error.message);
      }
      await attachStream(els.screenVideo, state.displayStream);
      updateSystemAudio(state.displayStream.getAudioTracks().length > 0);
      state.displayStream.getVideoTracks()[0].addEventListener('ended', function () { if (state.recorder && state.recorder.state !== 'inactive') stopRecording(); else cleanupStreams(); });
    }
    if ((state.mode === 'camera' || (state.mode === 'pip' && els.pipEnabled.checked)) && !state.cameraStream) {
      setSession('Requesting camera access');
      try {
        state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: els.cameraSelect.value ? { exact: els.cameraSelect.value } : undefined, width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.fps } }, audio: false });
      } catch (error) {
        if (error.name === 'NotAllowedError') { showCameraPermissionHelp(); throw cameraBlockedError(); }
        if (error.name === 'NotFoundError') throw new Error('No usable camera was found. Connect a camera or choose Screen mode.');
        throw new Error('Chrome could not start the camera: ' + error.message);
      }
      await attachStream(els.cameraVideo, state.cameraStream);
      setReady(els.cameraReady, 'Ready', 'ready'); setReady(els.framing, 'Adjust in preview', 'ready'); startLightingCheck();
    }
    if (els.micEnabled.checked && !state.micStream) {
      setSession('Requesting microphone access');
      try {
        state.micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: els.micSelect.value ? { exact: els.micSelect.value } : undefined, echoCancellation: true, noiseSuppression: true }, video: false });
        startMicMeter();
        setReady(els.micReady, 'Active', 'ready');
      } catch (error) {
        console.warn('Microphone unavailable; continuing without it.', error);
        state.micUnavailable = true;
        setStatus('Microphone blocked - recording without it', 'busy');
      }
    }
    await listDevices(); els.empty.hidden = true; els.snapshot.disabled = false; if (state.cameraStream) { els.quickBar.hidden = false; els.floatCamera.hidden = false; }
  }
  function addMixedAudio(outputStream) {
    var audioTracks = [];
    if (state.displayStream) audioTracks = audioTracks.concat(state.displayStream.getAudioTracks());
    if (state.micStream) audioTracks = audioTracks.concat(state.micStream.getAudioTracks());
    if (!audioTracks.length) return outputStream;
    if (audioTracks.length === 1) { outputStream.addTrack(audioTracks[0]); return outputStream; }
    if (!state.audioCtx) state.audioCtx = new AudioContext();
    var destination = state.audioCtx.createMediaStreamDestination();
    audioTracks.forEach(function (track) { state.audioCtx.createMediaStreamSource(new MediaStream([track])).connect(destination); });
    destination.stream.getAudioTracks().forEach(function (track) { outputStream.addTrack(track); });
    return outputStream;
  }
  function buildRecordingStream() {
    if (usesDirectRecording()) {
      state.recordingPipeline = 'direct';
      return addMixedAudio(new MediaStream(state.displayStream.getVideoTracks()));
    }
    state.recordingPipeline = 'composite';
    return addMixedAudio(els.canvas.captureStream(quality().fps));
  }
  function mimeType() {
    var preferEfficient = state.deviceTier === 'low' || els.performanceProfile.value === 'economy';
    var types = preferEfficient ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'] : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return types.find(function (type) { return MediaRecorder.isTypeSupported(type); }) || '';
  }
  async function openSessionWriter(name) {
    if (!window.indexedDB) return null;
    try { var db = await openRecordingDb(); await deleteStoredSession(db, name); return { name: name, db: db, seq: 0, pending: Promise.resolve(), size: 0 }; }
    catch (error) { console.warn('IndexedDB unavailable; using memory fallback.', error); return null; }
  }
  function openRecordingDb() { return new Promise(function (resolve, reject) { var request = indexedDB.open('xcamscreen-recordings', 1); request.onupgradeneeded = function () { var store = request.result.createObjectStore('chunks', { keyPath: 'id', autoIncrement: true }); store.createIndex('session', 'session', { unique: false }); }; request.onsuccess = function () { resolve(request.result); }; request.onerror = function () { reject(request.error); }; }); }
  function storeChunk(writer, chunk) { return new Promise(function (resolve, reject) { var tx = writer.db.transaction('chunks', 'readwrite'); tx.objectStore('chunks').add({ session: writer.name, seq: writer.seq++, blob: chunk }); tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); }; }); }
  function readStoredSession(db, name) { return new Promise(function (resolve, reject) { var tx = db.transaction('chunks', 'readonly'); var request = tx.objectStore('chunks').index('session').getAll(IDBKeyRange.only(name)); request.onsuccess = function () { resolve(request.result.sort(function (a, b) { return a.seq - b.seq; }).map(function (row) { return row.blob; })); }; request.onerror = function () { reject(request.error); }; }); }
  function deleteStoredSession(db, name) { return new Promise(function (resolve, reject) { var tx = db.transaction('chunks', 'readwrite'); var index = tx.objectStore('chunks').index('session'); var request = index.openKeyCursor(IDBKeyRange.only(name)); request.onsuccess = function () { var cursor = request.result; if (cursor) { tx.objectStore('chunks').delete(cursor.primaryKey); cursor.continue(); } }; tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); }; }); }
  function persistChunk(chunk) {
    if (!chunk || !chunk.size) return;
    if (!state.writer) { state.chunks.push(chunk); return; }
    state.writer.size += chunk.size;
    state.writer.pending = state.writer.pending.then(function () { return storeChunk(state.writer, chunk); }).catch(function (error) { console.error('Chunk persistence failed', error); state.chunks.push(chunk); });
  }
  async function finalizeWriter() {
    if (!state.writer) return new Blob(state.chunks, { type: (state.recorder && state.recorder.mimeType) || 'video/webm' });
    var writer = state.writer; await writer.pending; var stored = await readStoredSession(writer.db, writer.name); var chunks = stored.concat(state.chunks); var blob = new Blob(chunks, { type: (state.recorder && state.recorder.mimeType) || 'video/webm' }); state.lastOpfsName = writer.name; await deleteStoredSession(writer.db, writer.name); writer.db.close(); state.writer = null; return blob;
  }
  function sessionRecordName() { return 'recording-' + Date.now() + '.webm'; }
  async function ensureStorageCapacity() { if (!navigator.storage || !navigator.storage.estimate) return; try { if (navigator.storage.persist) await navigator.storage.persist(); var estimate = await navigator.storage.estimate(); var free = (estimate.quota || 0) - (estimate.usage || 0); if (estimate.quota && free < 100 * 1024 * 1024) throw new Error('Less than 100 MB of temporary recording storage is available. Free browser storage before recording.'); } catch (error) { if (/100 MB/.test(error.message)) throw error; console.warn('Storage estimate unavailable', error); } }
  async function countdown() {
    els.countdown.hidden = false;
    for (var n = 3; n > 0; n--) { els.countdown.textContent = n; await new Promise(function (resolve) { setTimeout(resolve, 700); }); }
    els.countdown.hidden = true;
  }
  async function ensureFloatingWebcamOpen() {
    if (!isElectronRuntime || !window.electronAPI || !els.autoWebcam.checked || !state.cameraStream) return;
    if (await window.electronAPI.isWebcamOpen()) return;
    var size = floatingCameraSize();
    await window.electronAPI.openWebcam({ deviceId: els.cameraSelect.value || '', mirror: els.mirrorCamera.checked, shape: els.pipShape.value, size: size.width });
    syncFloatingCameraState(true);
  }
  async function startRecording() {
    try {
      if (isElectronRuntime && els.autoWebcam.checked && state.mode === 'screen') setMode('pip');
      setControls(true); setStatus('Choose what to share', 'busy'); setSession('Checking local storage'); setCanvasSize(); await ensureStorageCapacity();
      await acquireSources(); await ensureFloatingWebcamOpen(); await countdown();
      var stream = buildRecordingStream(), type = mimeType();
      setSession(state.recordingPipeline === 'direct' ? 'Native source quality' : 'High-quality composite');
      state.chunks = []; state.stopping = false; var opfsName = sessionRecordName(); state.writer = await openSessionWriter(opfsName); state.lastOpfsName = '';
      chromeApi.storage.local.set({ activeRecording: { sessionId: state.writer ? opfsName : '', startedAt: Date.now(), mode: state.mode, quality: quality() } });
      var recorderOptions = { videoBitsPerSecond: quality().bitrate }; if (type) recorderOptions.mimeType = type; state.recorder = new MediaRecorder(stream, recorderOptions);
      state.recorder.ondataavailable = function (event) { persistChunk(event.data); };
      state.recorder.onerror = function (event) { showError(event.error || new Error('Recording failed')); };
      state.recorder.onstop = finishRecording; state.recorder.start(1000);
      state.previewOnly = false; state.startedAt = Date.now(); state.pausedTotal = 0; state.pausedAt = 0; startTimer();
      els.recordBadge.hidden = false; setStatus(state.micUnavailable ? 'Recording without microphone' : 'Recording in progress', 'recording'); setSession(state.micUnavailable ? 'Recording - microphone unavailable' : 'Recording'); setControls(true);
    } catch (error) { cleanupStreams(); setControls(false); if (!error.cameraPermissionHandled) showError(error); }
  }
  function stopRecording() {
    if (state.stopping) return; state.stopping = true; setSession('Processing recording'); setStatus('Processing...', 'busy');
    els.stop.disabled = true; els.pause.disabled = true; els.miniStop.disabled = true; els.miniPause.disabled = true;
    if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop(); else finishRecording();
  }
  function setPauseState(paused) {
    setToolButtonLabel(els.pause, paused ? 'Resume' : 'Pause');
    els.miniPause.classList.toggle('paused', paused);
    els.miniPause.setAttribute('aria-label', paused ? 'Resume recording' : 'Pause recording');
    els.miniPause.title = paused ? 'Resume recording' : 'Pause recording';
  }
  function togglePause() {
    if (!state.recorder) return;
    if (state.recorder.state === 'recording') { state.recorder.pause(); state.pausedAt = Date.now(); setPauseState(true); setSession('Paused'); setStatus('Recording paused', 'busy'); }
    else if (state.recorder.state === 'paused') { state.recorder.resume(); state.pausedTotal += Date.now() - state.pausedAt; state.pausedAt = 0; setPauseState(false); setSession('Recording'); setStatus('Recording in progress', 'recording'); }
  }
  function startTimer() { clearInterval(state.timerId); updateTimer(); state.timerId = setInterval(updateTimer, 1000); }
  function updateTimer() { var end = state.pausedAt || Date.now(); var seconds = Math.max(0, Math.floor((end - state.startedAt - state.pausedTotal) / 1000)); els.timer.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); }
  async function finishRecording() {
    clearInterval(state.timerId); var duration = els.timer.textContent; var blob;
    cleanupStreams(); setControls(false); els.recordBadge.hidden = true; els.stop.disabled = false; els.pause.disabled = false; els.miniStop.disabled = false; els.miniPause.disabled = false; setPauseState(false);
    try { blob = await finalizeWriter(); } catch (error) { chromeApi.storage.local.remove('activeRecording'); showError(new Error('The recording could not be finalized: ' + error.message)); state.stopping = false; return; }
    if (!blob.size) { chromeApi.storage.local.remove('activeRecording'); showError(new Error('The recording was empty. Please try again.')); state.stopping = false; return; }
    chromeApi.storage.local.remove('activeRecording'); if (state.lastBlobUrl) URL.revokeObjectURL(state.lastBlobUrl); state.lastBlobUrl = URL.createObjectURL(blob); state.lastFilename = 'Facescreen Recorder/Recordings/' + filename('webm');
    downloadLast(); els.resultTitle.textContent = 'Recording saved'; els.resultMeta.textContent = duration + ' · ' + formatBytes(blob.size) + ' · WebM'; els.result.hidden = false;
    addHistory({ filename: state.lastFilename.split('/').pop(), date: Date.now(), duration: duration, size: blob.size, mode: state.mode, recovered: false });
    setStatus('Recording saved locally', 'ready'); setSession('Complete'); state.stopping = false;
  }
  function cleanupStreams() {
    closeCameraPeer();
    if (state.documentPipWindow && !state.documentPipWindow.closed) state.documentPipWindow.close(); state.documentPipWindow = null;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(function () {});
    [state.displayStream, state.cameraStream, state.micStream].forEach(function (stream) { if (stream) stream.getTracks().forEach(function (track) { track.stop(); }); });
    state.displayStream = state.cameraStream = state.micStream = null;
    els.screenVideo.srcObject = null; els.cameraVideo.srcObject = null;
    state.previewOnly = false; state.recordingPipeline = ''; clearInterval(state.lightingTimer); state.analyser = null; cancelAnimationFrame(state.meterFrame); els.micMeter.style.width = '0'; els.micMeterStatus.textContent = 'Not connected'; els.quickBar.hidden = true; els.floatCamera.hidden = true; setToolButtonLabel(els.floatCamera, 'Float camera'); setCameraPreviewButton(false);
    setReady(els.cameraReady, 'Not checked', ''); setReady(els.micReady, 'Not checked', ''); setReady(els.lighting, 'Not checked', ''); setReady(els.framing, 'Use live preview', '');
    if (state.audioCtx) state.audioCtx.close().catch(function () {}); state.audioCtx = null; els.empty.hidden = false; els.snapshot.disabled = true;
    els.systemAudioDot.className = ''; els.systemAudioStatus.textContent = 'Shared audio is checked after source selection';
  }
  function filename(extension) { var stamp = new Date().toISOString().replace(/[:.]/g, '-'); return 'Facescreen-Recorder-' + stamp + '.' + extension; }
  function downloadLast() { if (state.lastBlobUrl) chromeApi.downloads.download({ url: state.lastBlobUrl, filename: state.lastFilename, saveAs: false }); }
  function snapshot() { $('previewCard').classList.add('snapshot-flash'); setTimeout(function () { $('previewCard').classList.remove('snapshot-flash'); }, 350); els.canvas.toBlob(function (blob) { if (!blob) return; var url = URL.createObjectURL(blob); chromeApi.downloads.download({ url: url, filename: 'Facescreen Recorder/Snapshots/' + filename('png'), saveAs: false }, function () { setTimeout(function () { URL.revokeObjectURL(url); }, 30000); }); }, 'image/png'); }
  function formatBytes(bytes) { if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB'; return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }
  function addHistory(item) { chromeApi.storage.local.get('recordingHistory', function (result) { var history = result.recordingHistory || []; history.unshift(item); history = history.slice(0, 12); chromeApi.storage.local.set({ recordingHistory: history }, function () { renderHistory(history); }); }); }
  function renderHistory(history) { els.recentList.innerHTML = ''; if (!history || !history.length) { els.recentList.innerHTML = '<p>No recordings yet.</p>'; return; } history.forEach(function (item, index) { var row = document.createElement('div'); row.className = 'recent-item'; var copy = document.createElement('span'); var title = document.createElement('strong'); title.textContent = item.filename; var meta = document.createElement('small'); meta.textContent = item.mode + ' · ' + item.duration + ' · ' + formatBytes(item.size) + (item.recovered ? ' · recovered' : ''); copy.appendChild(title); copy.appendChild(meta); var remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = 'Remove from history'; remove.addEventListener('click', function () { history.splice(index, 1); chromeApi.storage.local.set({ recordingHistory: history }, function () { renderHistory(history); }); }); row.appendChild(copy); row.appendChild(remove); els.recentList.appendChild(row); }); }
  function loadHistory() { chromeApi.storage.local.get('recordingHistory', function (result) { renderHistory(result.recordingHistory || []); }); }
  function formatDurationFromMs(ms) { var seconds = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0'); }
  async function recoverInterruptedRecording() {
    chromeApi.storage.local.get('activeRecording', async function (result) {
      var active = result.activeRecording; if (!active) return;
      if (!active.sessionId || !window.indexedDB) { chromeApi.storage.local.remove('activeRecording'); setStatus('Previous recording was interrupted before it could be recovered', 'error'); return; }
      try {
        var db = await openRecordingDb(); var chunks = await readStoredSession(db, active.sessionId); if (!chunks.length) throw new Error('Recovered file is empty'); var file = new Blob(chunks, { type: 'video/webm' }); await deleteStoredSession(db, active.sessionId); db.close();
        if (state.lastBlobUrl) URL.revokeObjectURL(state.lastBlobUrl); state.lastBlobUrl = URL.createObjectURL(file); state.lastFilename = 'Facescreen Recorder/Recordings/Recovered-' + filename('webm'); state.lastOpfsName = active.sessionId;
        var duration = formatDurationFromMs(Date.now() - active.startedAt); els.resultTitle.textContent = 'Interrupted recording recovered'; els.resultMeta.textContent = duration + ' · ' + formatBytes(file.size) + ' · WebM'; els.result.hidden = false;
        addHistory({ filename: state.lastFilename.split('/').pop(), date: Date.now(), duration: duration, size: file.size, mode: active.mode || 'unknown', recovered: true });
        setStatus('Interrupted recording is ready to download', 'ready'); setSession('Recovered recording'); chromeApi.storage.local.remove('activeRecording');
      } catch (error) { console.warn('Recovery failed', error); chromeApi.storage.local.remove('activeRecording'); setStatus('Previous recording could not be recovered', 'error'); }
    });
  }
  function showError(error) { console.error(error); setStatus('Action needed', 'error'); setSession(error.message || 'Something went wrong'); }
  function cameraBlockedError() { var error = new Error('Camera access is blocked. Open camera settings, allow FaceScreen Recorder, then return and try again.'); error.cameraPermissionHandled = true; return error; }
  function showCameraPermissionHelp() { state.cameraPermissionBlocked = true; var title = els.coach.querySelector('strong'); var copy = els.coach.querySelector('p'); title.textContent = 'Camera permission needed'; copy.textContent = 'Allow FaceScreen Recorder in Chrome camera settings. If it is already allowed, enable camera access for desktop apps in Windows Privacy settings.'; els.dismissCoach.textContent = 'Open camera settings'; els.dismissCoach.dataset.permissionSettings = 'true'; els.coach.hidden = false; setReady(els.cameraReady, 'Blocked', 'warn'); showError(cameraBlockedError()); }
  function floatingCameraSize() { var scale = (Number(els.pipSize.value) - 15) / 35, width = Math.round(240 + scale * 320); return els.pipShape.value === 'circle' ? { width: width, height: width } : { width: width, height: Math.round(width * 9 / 16) }; }
  function updateFloatingCameraAppearance(resizeWindow) { var pipWindow = state.documentPipWindow; if (!pipWindow || pipWindow.closed) return; var video = pipWindow.document.getElementById('floatingCameraVideo'), shell = pipWindow.document.getElementById('floatingCameraShell'); if (!video || !shell) return; var shape = els.pipShape.value; shell.style.borderRadius = shape === 'circle' ? '50%' : shape === 'rounded' ? '12%' : '0'; video.style.transform = els.mirrorCamera.checked ? 'scaleX(-1)' : 'none'; video.style.opacity = state.cameraOn ? '1' : '0'; if (resizeWindow) { var size = floatingCameraSize(); try { pipWindow.resizeTo(size.width, size.height); } catch (error) { console.debug('Chrome kept the current floating camera size', error); } } }
  async function openDocumentFloatingCamera() { var size = floatingCameraSize(); var pipWindow = await documentPictureInPicture.requestWindow({ width: size.width, height: size.height, disallowReturnToOpener: false }); state.documentPipWindow = pipWindow; var style = pipWindow.document.createElement('style'); style.textContent = 'html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}#floatingCameraShell{width:100%;height:100%;overflow:hidden;border-radius:50%;background:#05070b;box-shadow:inset 0 0 0 2px rgba(255,255,255,.16)}video{display:block;width:100%;height:100%;object-fit:cover}'; var shell = pipWindow.document.createElement('div'); shell.id = 'floatingCameraShell'; var video = pipWindow.document.createElement('video'); video.id = 'floatingCameraVideo'; video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = state.cameraStream; shell.appendChild(video); pipWindow.document.head.appendChild(style); pipWindow.document.body.appendChild(shell); await video.play(); updateFloatingCameraAppearance(false); pipWindow.addEventListener('pagehide', function () { state.documentPipWindow = null; syncFloatingCameraState(false); }); syncFloatingCameraState(true); }
  function closeCameraPeer() { if (state.cameraPeer) state.cameraPeer.close(); state.cameraPeer = null; state.cameraPeerCandidates = []; }
  async function handleCameraSignal(message) {
    if (!message || !isElectronRuntime || !window.electronAPI) return;
    try {
      if (message.type === 'ready') {
        closeCameraPeer();
        state.cameraPeer = new RTCPeerConnection({ iceServers: [] });
        state.cameraPeer.onicecandidate = function (event) { if (event.candidate) window.electronAPI.sendCameraSignal({ type: 'candidate', candidate: event.candidate.toJSON() }); };
        if (state.cameraStream) state.cameraStream.getVideoTracks().forEach(function (track) { state.cameraPeer.addTrack(track, state.cameraStream); });
        var offer = await state.cameraPeer.createOffer(); await state.cameraPeer.setLocalDescription(offer);
        window.electronAPI.sendCameraSignal({ type: 'offer', description: state.cameraPeer.localDescription.toJSON() });
      } else if (message.type === 'answer' && state.cameraPeer) {
        await state.cameraPeer.setRemoteDescription(message.description);
        for (var i = 0; i < state.cameraPeerCandidates.length; i++) await state.cameraPeer.addIceCandidate(state.cameraPeerCandidates[i]);
        state.cameraPeerCandidates = [];
      } else if (message.type === 'candidate' && message.candidate && state.cameraPeer) {
        if (state.cameraPeer.remoteDescription) await state.cameraPeer.addIceCandidate(message.candidate); else state.cameraPeerCandidates.push(message.candidate);
      }
    } catch (error) { console.warn('Shared camera connection failed', error); }
  }
  async function toggleFloatingCamera() { try { if (isElectronRuntime && window.electronAPI) { var electronOpen = await window.electronAPI.isWebcamOpen(); if (electronOpen) { await window.electronAPI.closeWebcam(); syncFloatingCameraState(false); } else { var size = floatingCameraSize(); await window.electronAPI.openWebcam({ deviceId: els.cameraSelect.value || '', mirror: els.mirrorCamera.checked, shape: els.pipShape.value, size: size.width }); syncFloatingCameraState(true); } return; } if (state.documentPipWindow && !state.documentPipWindow.closed) { state.documentPipWindow.close(); return; } if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; } if (!state.cameraStream) return; if ('documentPictureInPicture' in window) await openDocumentFloatingCamera(); else await els.cameraVideo.requestPictureInPicture(); } catch (error) { if (error.name === 'NotAllowedError' && state.cameraStream) { setStatus('Webcam ready', 'ready'); setSession('Click Webcam again to open the floating widget'); return; } showError(new Error('Floating camera is unavailable: ' + error.message)); } }
  function syncFloatingCameraState(active) { setToolButtonLabel(els.floatCamera, active ? 'Return camera' : 'Float camera'); els.floatCamera.classList.toggle('active', active); document.body.classList.toggle('webcam-floating', active); els.previewCamera.setAttribute('aria-pressed', active ? 'true' : 'false'); els.previewCamera.setAttribute('aria-label', active ? 'Close floating webcam' : 'Open floating webcam'); els.previewCamera.title = active ? 'Close floating webcam' : 'Open floating webcam'; if (active) { setStatus('Webcam floating', 'ready'); setSession('Webcam is in a separate always-on-top widget'); } }
  function toggleQuickCamera() { state.cameraOn = !state.cameraOn; if (state.cameraStream) state.cameraStream.getVideoTracks().forEach(function (track) { track.enabled = state.cameraOn; }); els.quickCamera.setAttribute('aria-pressed', state.cameraOn ? 'true' : 'false'); els.quickCamera.textContent = state.cameraOn ? 'Camera on' : 'Camera off'; updateFloatingCameraAppearance(false); }
  function toggleQuickMic() { var enabled = els.quickMic.getAttribute('aria-pressed') !== 'true'; if (state.micStream) state.micStream.getAudioTracks().forEach(function (track) { track.enabled = enabled; }); els.quickMic.setAttribute('aria-pressed', enabled ? 'true' : 'false'); els.quickMic.textContent = enabled ? 'Mic on' : 'Mic off'; setReady(els.micReady, enabled ? 'Active' : 'Muted', enabled ? 'ready' : 'warn'); }
  function syncMirrorButton() { els.quickMirror.setAttribute('aria-pressed', els.mirrorCamera.checked ? 'true' : 'false'); els.quickMirror.textContent = els.mirrorCamera.checked ? 'Mirror on' : 'Mirror off'; updateFloatingCameraAppearance(false); }
  function cycleCameraShape() { var shapes = ['circle', 'rounded', 'square']; var next = (shapes.indexOf(els.pipShape.value) + 1) % shapes.length; els.pipShape.value = shapes[next]; updateFloatingCameraAppearance(true); savePrefs(); }
  function canvasPoint(event) { var box = els.canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) * els.canvas.width / box.width, y: (event.clientY - box.top) * els.canvas.height / box.height }; }
  function beginPipDrag(event) { if (state.mode !== 'pip' || !state.cameraStream || !els.pipEnabled.checked) return; var point = canvasPoint(event), r = pipRect(); if (point.x < r.x || point.x > r.x + r.w || point.y < r.y || point.y > r.y + r.h) return; state.draggingPip = { dx: point.x - r.x, dy: point.y - r.y }; els.canvas.classList.add('pip-dragging'); els.canvas.setPointerCapture(event.pointerId); event.preventDefault(); }
  function movePipDrag(event) { if (!state.draggingPip) return; var point = canvasPoint(event), r = pipRect(), maxX = Math.max(1, els.canvas.width - r.w), maxY = Math.max(1, els.canvas.height - r.h); var x = Math.max(0, Math.min(maxX, point.x - state.draggingPip.dx)), y = Math.max(0, Math.min(maxY, point.y - state.draggingPip.dy)); state.pipCustom = { x: x / maxX, y: y / maxY }; els.pipPosition.value = 'custom'; }
  function endPipDrag(event) { if (!state.draggingPip) return; state.draggingPip = null; els.canvas.classList.remove('pip-dragging'); try { els.canvas.releasePointerCapture(event.pointerId); } catch (error) {} savePrefs(); }
  function savePrefs() { chromeApi.storage.local.set({ recorderPrefs: { mode: state.mode, mic: els.micEnabled.checked, quality: els.quality.value, resolution: els.resolution.value, fps: els.fps.value, bitrate: els.bitrate.value, pipEnabled: els.pipEnabled.checked, mirrorCamera: els.mirrorCamera.checked, pipCustom: state.pipCustom, shape: els.pipShape.value, position: els.pipPosition.value, size: els.pipSize.value, preview: els.previewEnabled.checked, hardwareAcceleration: els.hardwareAcceleration.checked, performanceProfile: els.performanceProfile.value, autoWebcam: els.autoWebcam.checked } }); }
  function updatePipControls() { els.pipControls.classList.toggle('disabled', !els.pipEnabled.checked); }
  function applyPreset() { if (els.quality.value === 'custom') return; var parts = els.quality.value.split('-'); els.resolution.value = parts[0]; els.fps.value = parts[1]; els.bitrate.value = parts[2]; updatePerformanceStatus(); setCanvasSize(); updateHardwareAccelerationStatus(); savePrefs(); }
  function loadPrefs() { chromeApi.storage.local.get('recorderPrefs', function (result) { var p = result.recorderPrefs || {}; if (p.quality) els.quality.value = p.quality; if (p.resolution) els.resolution.value = p.resolution; if (p.fps) els.fps.value = p.fps; if (p.bitrate) els.bitrate.value = p.bitrate; if (p.shape) els.pipShape.value = p.shape; if (p.position) els.pipPosition.value = p.position; if (p.size) els.pipSize.value = p.size; if (typeof p.pipEnabled === 'boolean') els.pipEnabled.checked = p.pipEnabled; if (typeof p.mirrorCamera === 'boolean') els.mirrorCamera.checked = p.mirrorCamera; if (p.pipCustom && Number.isFinite(p.pipCustom.x) && Number.isFinite(p.pipCustom.y)) state.pipCustom = p.pipCustom; if (typeof p.mic === 'boolean') els.micEnabled.checked = p.mic; if (typeof p.preview === 'boolean') els.previewEnabled.checked = p.preview; if (typeof p.hardwareAcceleration === 'boolean') els.hardwareAcceleration.checked = p.hardwareAcceleration; if (p.performanceProfile) els.performanceProfile.value = p.performanceProfile; if (typeof p.autoWebcam === 'boolean') els.autoWebcam.checked = p.autoWebcam; els.pipSizeValue.textContent = els.pipSize.value + '%'; els.micField.hidden = !els.micEnabled.checked; updatePipControls(); syncMirrorButton(); $('previewCard').classList.toggle('preview-off', !els.previewEnabled.checked); setMode(p.mode || 'camera'); updatePerformanceStatus(); setCanvasSize(); updateHardwareAccelerationStatus(); }); }

  function closePanels(except) { [els.settingsPanel, els.toolboxPanel].forEach(function (panel) { if (panel !== except) panel.hidden = true; }); els.settingsToggle.setAttribute('aria-expanded', String(!els.settingsPanel.hidden)); els.toolboxToggle.setAttribute('aria-expanded', String(!els.toolboxPanel.hidden)); }
  function syncElectronLayout(mode) { if (!isElectronRuntime || !window.electronAPI) return; var panelOpen = !els.settingsPanel.hidden || !els.toolboxPanel.hidden; window.electronAPI.setControlLayout(mode || (panelOpen ? 'expanded' : 'compact')); }
  function syncElectronPanelSize() { syncElectronLayout(); }
  function togglePanel(panel, trigger) { var opening = panel.hidden; closePanels(panel); panel.hidden = !opening; trigger.setAttribute('aria-expanded', String(opening)); syncElectronLayout(); }
  async function handleCameraPreview() { if (state.documentPipWindow && !state.documentPipWindow.closed) { state.documentPipWindow.close(); return; } if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; } if (!state.cameraStream && state.mode === 'screen') setMode('camera'); if (!state.cameraStream) { var ready = await startCameraPreview(); if (!ready) return; } await toggleFloatingCamera(); }

  document.querySelectorAll('.mode').forEach(function (button) { button.addEventListener('click', function () { setMode(button.dataset.mode); }); });
  [els.pipShape, els.pipPosition, els.previewEnabled].forEach(function (control) { control.addEventListener('change', function () { if (control === els.pipPosition && control.value !== 'custom') state.pipCustom = null; if (control === els.pipShape) updateFloatingCameraAppearance(true); $('previewCard').classList.toggle('preview-off', !els.previewEnabled.checked); setCanvasSize(); savePrefs(); }); });
  els.micEnabled.addEventListener('change', function () { els.micField.hidden = !els.micEnabled.checked; savePrefs(); if (state.previewOnly) { stopCameraPreview(); startCameraPreview(); } });
  els.quality.addEventListener('change', applyPreset);
  [els.resolution, els.fps, els.bitrate].forEach(function (control) { control.addEventListener('change', function () { els.quality.value = 'custom'; updatePerformanceStatus(); setCanvasSize(); updateHardwareAccelerationStatus(); savePrefs(); }); });
  els.pipEnabled.addEventListener('change', function () { updatePipControls(); savePrefs(); });
  els.mirrorCamera.addEventListener('change', function () { syncMirrorButton(); savePrefs(); });
  els.hardwareAcceleration.addEventListener('change', function () { updateHardwareAccelerationStatus(); savePrefs(); });
  els.autoWebcam.addEventListener('change', savePrefs);
  els.performanceProfile.addEventListener('change', function () { updatePerformanceStatus(); setCanvasSize(); updateHardwareAccelerationStatus(); if (state.cameraStream) startLightingCheck(); savePrefs(); });
  els.pipSize.addEventListener('input', function () { els.pipSizeValue.textContent = els.pipSize.value + '%'; updateFloatingCameraAppearance(true); savePrefs(); });
  els.start.addEventListener('click', startRecording); els.stop.addEventListener('click', stopRecording); els.pause.addEventListener('click', togglePause); els.miniStop.addEventListener('click', stopRecording); els.miniPause.addEventListener('click', togglePause); els.previewCamera.addEventListener('click', handleCameraPreview); els.snapshot.addEventListener('click', snapshot); els.floatCamera.addEventListener('click', toggleFloatingCamera);
  els.settingsToggle.addEventListener('click', function () { togglePanel(els.settingsPanel, els.settingsToggle); }); els.toolboxToggle.addEventListener('click', function () { togglePanel(els.toolboxPanel, els.toolboxToggle); }); document.querySelectorAll('[data-close-panel]').forEach(function (button) { button.addEventListener('click', function () { var panel = $(button.dataset.closePanel); if (panel) panel.hidden = true; closePanels(); syncElectronPanelSize(); }); });
  els.quickCamera.addEventListener('click', toggleQuickCamera); els.quickMic.addEventListener('click', toggleQuickMic); els.quickMirror.addEventListener('click', function () { els.mirrorCamera.checked = !els.mirrorCamera.checked; syncMirrorButton(); savePrefs(); }); els.quickShape.addEventListener('click', cycleCameraShape);
  els.cameraVideo.addEventListener('enterpictureinpicture', function () { syncFloatingCameraState(true); }); els.cameraVideo.addEventListener('leavepictureinpicture', function () { syncFloatingCameraState(false); });
  els.dismissCoach.addEventListener('click', function () { if (els.dismissCoach.dataset.permissionSettings === 'true') { chromeApi.tabs.create({ url: 'chrome://settings/content/camera' }); return; } els.coach.hidden = true; chromeApi.storage.local.set({ cameraCoachSeen: true }); });
  els.canvas.addEventListener('pointerdown', beginPipDrag); els.canvas.addEventListener('pointermove', movePipDrag); els.canvas.addEventListener('pointerup', endPipDrag); els.canvas.addEventListener('pointercancel', endPipDrag);
  els.downloadAgain.addEventListener('click', downloadLast); els.dismissResult.addEventListener('click', function () { els.result.hidden = true; });
  els.clearHistory.addEventListener('click', function () { chromeApi.storage.local.remove('recordingHistory', function () { renderHistory([]); }); });
  els.detachStudio.addEventListener('click', detachStudio);
  if (isElectronRuntime && window.electronAPI) { document.documentElement.classList.add('electron-app');
    window.electronAPI.onWebcamState(function (open) { syncFloatingCameraState(open); if (!open) closeCameraPeer(); if (!open && state.previewOnly && (!state.recorder || state.recorder.state === 'inactive')) stopCameraPreview(); });
    window.electronAPI.onCameraSignal(handleCameraSignal);
    window.electronAPI.onWebcamBounds(function (bounds) { if (!bounds) return; state.pipCustom = { x: bounds.x, y: bounds.y }; els.pipPosition.value = 'custom'; els.pipSize.value = String(Math.max(15, Math.min(50, bounds.size))); els.pipSizeValue.textContent = els.pipSize.value + '%'; savePrefs(); });
    window.electronAPI.onWebcamCommand(function (command) { if (!command) return; if (command.type === 'camera') { state.cameraOn = Boolean(command.enabled); if (state.cameraStream) state.cameraStream.getVideoTracks().forEach(function (track) { track.enabled = state.cameraOn; }); els.quickCamera.setAttribute('aria-pressed', String(state.cameraOn)); els.quickCamera.textContent = state.cameraOn ? 'Camera on' : 'Camera off'; } else if (command.type === 'microphone') { var micOn = Boolean(command.enabled); if (state.micStream) state.micStream.getAudioTracks().forEach(function (track) { track.enabled = micOn; }); els.quickMic.setAttribute('aria-pressed', String(micOn)); els.quickMic.textContent = micOn ? 'Mic on' : 'Mic off'; setReady(els.micReady, micOn ? 'Active' : 'Muted', micOn ? 'ready' : 'warn'); } else if (command.type === 'mirror') { els.mirrorCamera.checked = Boolean(command.enabled); syncMirrorButton(); savePrefs(); } });
    if (els.minimizeWindow) els.minimizeWindow.addEventListener('click', function () { window.electronAPI.minimize(); }); if (els.closeWindow) els.closeWindow.addEventListener('click', function () { if (state.recorder && state.recorder.state !== 'inactive') { showError(new Error('Stop the recording before closing FaceScreen.')); return; } window.electronAPI.close(); }); }
  els.reset.addEventListener('click', function () { chromeApi.storage.local.remove('recorderPrefs', function () { location.reload(); }); });
  window.addEventListener('beforeunload', function (event) { if (state.recorder && state.recorder.state !== 'inactive') { event.preventDefault(); event.returnValue = ''; } });
  [els.start, els.previewCamera, els.settingsToggle, els.toolboxToggle].forEach(function (button) { if (!button) return; var hints = {}; hints.startBtn = 'Start or stop recording (Ctrl+Shift+R)'; hints.previewCameraBtn = 'Open or close webcam (Ctrl+Shift+C)'; hints.settingsToggleBtn = 'Open settings'; hints.toolboxToggleBtn = 'Open toolbox'; button.title = hints[button.id] || button.title; });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { closePanels(); syncElectronPanelSize(); return; }
    if (!(event.ctrlKey && event.shiftKey) || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); if (state.recorder && state.recorder.state !== 'inactive') stopRecording(); else startRecording(); }
    if (event.key.toLowerCase() === 'c') { event.preventDefault(); handleCameraPreview(); }
  });  navigator.mediaDevices.addEventListener('devicechange', listDevices);
  paintEmpty(); renderFrame(); detectWindowMode(); loadPrefs(); listDevices(); loadHistory(); recoverInterruptedRecording(); syncElectronLayout('compact');
})();
