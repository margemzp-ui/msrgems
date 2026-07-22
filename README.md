# Facescreen Recorder Chrome Extension

Facescreen Recorder runs entirely in the browser. It records locally and does not upload captured media.

## Load for development

1. Open `chrome://extensions` in Google Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `chrome-extension` directory.
5. Pin Facescreen Recorder and choose **Open Recorder Studio**.

The launcher opens Recorder Studio as a dedicated Chrome popup window. Drag it anywhere on the desktop using its native title bar; its position and size are restored the next time it opens. If `studio.html` is already open as a normal tab, use **Detach studio** in the header to move that same page into a popup window without reloading it.

## Supported modes

- Screen: record a tab, window, or display selected through Chrome's native picker.
- Camera: record a webcam with optional microphone audio.
- Screen + camera: composites a configurable camera overlay into the downloaded recording.

Camera and PiP modes include a pre-recording readiness preview, microphone level feedback, lighting guidance, direct drag placement, mirroring, camera/microphone quick controls, and an optional floating Picture-in-Picture camera window. On Chrome 116 and newer, its camera crop follows the selected circle, rounded, or square shape, and the PiP size control updates the floating window's ideal dimensions. Chrome may clamp dimensions for usability.

Recordings and PNG snapshots download directly to the browser's configured Downloads folder. Chrome currently produces WebM files through `MediaRecorder`.

Recording chunks are persisted incrementally in extension-owned IndexedDB instead of being held only in memory. If the Studio tab or browser closes unexpectedly, Facescreen Recorder offers the stored partial recording when the Studio opens again. Completed files download into `Facescreen Recorder/Recordings`, while snapshots download into `Facescreen Recorder/Snapshots`.

The default **Auto** performance profile uses available CPU and memory hints to protect lower-end computers. It caps expensive combinations when needed, throttles idle and setup previews, reduces diagnostic refresh rates, and temporarily lowers preview load if frame composition falls behind. Economy, Balanced, and unrestricted Quality profiles are also available under Advanced options.

## Browser constraints

- The native share picker cannot be replaced or preselected by an extension.
- Protected video may be blank or unavailable.
- The Recorder Studio tab must remain open while recording.
- System audio availability depends on the source chosen in Chrome and operating-system support.
