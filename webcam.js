(async function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const shell = document.getElementById('webcamShell');
  const video = document.getElementById('webcamVideo');
  const state = document.getElementById('webcamState');
  const cameraButton = document.getElementById('toggleWebcamCamera');
  const micButton = document.getElementById('toggleWebcamMic');
  const mirrorButton = document.getElementById('toggleWebcamMirror');
  const resizeGrip = document.getElementById('webcamResizeGrip');
  const sizeLabel = document.getElementById('webcamSizeLabel');
  let stream = null;
  let resizeFrame = 0;
  let pendingSize = 0;
  let peer = null;
  let fallbackTimer = 0;
  const pendingCandidates = [];

  shell.classList.add(params.get('shape') || 'circle');
  const initiallyMirrored = params.get('mirror') === '1';
  video.classList.toggle('mirror', initiallyMirrored);
  mirrorButton.setAttribute('aria-pressed', String(initiallyMirrored));

  function setPressed(button, pressed, onLabel, offLabel) {
    button.setAttribute('aria-pressed', String(pressed));
    button.setAttribute('aria-label', pressed ? onLabel : offLabel);
  }

  function attachStream(nextStream) {
    stream = nextStream;
    video.srcObject = stream;
    return video.play().then(() => {
      clearTimeout(fallbackTimer);
      state.hidden = true;
    });
  }

  async function startEconomyFallback() {
    if (stream) return;
    try {
      const deviceId = params.get('deviceId');
      const fallback = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 640, max: 640 },
          height: { ideal: 360, max: 360 },
          frameRate: { ideal: 15, max: 15 }
        },
        audio: false
      });
      await attachStream(fallback);
    } catch (error) {
      state.querySelector('strong').textContent = 'Camera unavailable';
      state.querySelector('span').textContent = error.name === 'NotAllowedError'
        ? 'Enable camera access in Windows Privacy settings'
        : error.message;
    }
  }

  function createPeer() {
    peer = new RTCPeerConnection({ iceServers: [] });
    peer.ontrack = (event) => attachStream(event.streams[0]).catch(startEconomyFallback);
    peer.onicecandidate = (event) => {
      if (event.candidate) window.electronAPI.sendCameraSignal({ type: 'candidate', candidate: event.candidate.toJSON() });
    };
    peer.onconnectionstatechange = () => {
      if (peer && ['failed', 'disconnected'].includes(peer.connectionState) && !stream) startEconomyFallback();
    };
    return peer;
  }

  window.electronAPI.onCameraSignal(async (message) => {
    if (!message) return;
    try {
      if (message.type === 'offer') {
        if (!peer) createPeer();
        await peer.setRemoteDescription(message.description);
        for (const candidate of pendingCandidates.splice(0)) await peer.addIceCandidate(candidate);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        window.electronAPI.sendCameraSignal({ type: 'answer', description: peer.localDescription.toJSON() });
      } else if (message.type === 'candidate' && message.candidate) {
        if (peer && peer.remoteDescription) await peer.addIceCandidate(message.candidate);
        else pendingCandidates.push(message.candidate);
      }
    } catch (error) {
      console.warn('Shared camera connection failed', error);
      startEconomyFallback();
    }
  });

  cameraButton.addEventListener('click', () => {
    const enabled = cameraButton.getAttribute('aria-pressed') !== 'true';
    if (stream) stream.getVideoTracks().forEach((track) => { track.enabled = enabled; });
    setPressed(cameraButton, enabled, 'Turn camera off', 'Turn camera on');
    window.electronAPI.sendWebcamCommand({ type: 'camera', enabled });
  });
  micButton.addEventListener('click', () => {
    const enabled = micButton.getAttribute('aria-pressed') !== 'true';
    setPressed(micButton, enabled, 'Mute microphone', 'Unmute microphone');
    window.electronAPI.sendWebcamCommand({ type: 'microphone', enabled });
  });
  mirrorButton.addEventListener('click', () => {
    const mirrored = mirrorButton.getAttribute('aria-pressed') !== 'true';
    video.classList.toggle('mirror', mirrored);
    setPressed(mirrorButton, mirrored, 'Turn mirror off', 'Mirror webcam');
    window.electronAPI.sendWebcamCommand({ type: 'mirror', enabled: mirrored });
  });
  document.getElementById('closeWebcam').addEventListener('click', () => {
    window.electronAPI.sendWebcamCommand({ type: 'camera', enabled: false });
    window.electronAPI.close();
  });
  function snapSize(value) {
    const clamped = Math.max(140, Math.min(320, Math.round(value)));
    const snapPoint = [140, 180, 240, 320].find((point) => Math.abs(point - clamped) <= 7);
    return snapPoint || clamped;
  }
  function showSize(size) {
    sizeLabel.value = size + 'px';
    shell.classList.add('resizing');
  }
  function requestResize(size) {
    pendingSize = snapSize(size);
    showSize(pendingSize);
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      window.electronAPI.resizeWebcam(pendingSize);
    });
  }
  resizeGrip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeGrip.setPointerCapture(event.pointerId);
    const startX = event.screenX;
    const startY = event.screenY;
    const startSize = window.innerWidth;
    const move = (moveEvent) => requestResize(startSize + Math.max(moveEvent.screenX - startX, moveEvent.screenY - startY));
    const finish = () => {
      resizeGrip.removeEventListener('pointermove', move);
      resizeGrip.removeEventListener('pointerup', finish);
      resizeGrip.removeEventListener('pointercancel', finish);
      shell.classList.remove('resizing');
    };
    resizeGrip.addEventListener('pointermove', move);
    resizeGrip.addEventListener('pointerup', finish);
    resizeGrip.addEventListener('pointercancel', finish);
  });
  resizeGrip.addEventListener('keydown', (event) => {
    let nextSize = window.innerWidth;
    if (event.key === 'Home') nextSize = 140;
    else if (event.key === 'End') nextSize = 320;
    else if (['ArrowRight', 'ArrowDown'].includes(event.key)) nextSize += event.shiftKey ? 20 : 10;
    else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) nextSize -= event.shiftKey ? 20 : 10;
    else return;
    event.preventDefault();
    requestResize(nextSize);
    clearTimeout(resizeGrip._labelTimer);
    resizeGrip._labelTimer = setTimeout(() => shell.classList.remove('resizing'), 700);
  });
  shell.addEventListener('dblclick', (event) => {
    if (event.target.closest('button')) return;
    window.electronAPI.toggleWebcamSize();
  });
  window.electronAPI.onWebcamCommand((command) => {
    if (command && command.type === 'recording') shell.classList.toggle('recording', Boolean(command.enabled));
  });

  window.addEventListener('beforeunload', () => {
    clearTimeout(fallbackTimer);
    if (peer) peer.close();
    if (stream && stream.getTracks) stream.getTracks().forEach((track) => track.stop());
  });

  window.electronAPI.sendCameraSignal({ type: 'ready' });
  fallbackTimer = setTimeout(startEconomyFallback, 5000);
})();
