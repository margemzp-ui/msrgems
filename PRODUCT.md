# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People recording their screen, webcam, or both from Chrome who need controls that stay compact and out of the way while they work.

## Product Purpose

FaceScreen Recorder captures screen and camera media locally, provides a live webcam preview, and downloads recordings and snapshots directly to the user's device.

## Positioning

FaceScreen is a private, extension-owned recorder whose capture, recovery, and download workflow stays in the browser without uploading recorded media.

## Operating Context

The recorder runs in a dedicated movable Chrome popup. Users keep it beside the content they are presenting, start or stop recording from the widget, check their webcam, and reveal settings only when needed.

## Capabilities and Constraints

- Supports screen, camera, and screen-plus-camera recording.
- Supports microphone audio, camera mirroring, camera shapes, snapshots, pause/resume, and local recording history.
- Chrome's native source picker cannot be replaced or preselected.
- Recordings use WebM and require the studio window to remain open. Screen-only capture preserves the native display track while preview performance adapts independently; canvas compositing is reserved for camera layouts.
- System audio depends on the selected Chrome source and operating-system support.
- Live broadcasting to an external streaming service is not currently supported; controls must not claim otherwise.
- The primary surface must be a compact webcam-first widget rather than a full dashboard.

## Brand Commitments

The product name is FaceScreen Recorder. The supplied reference establishes a dark floating widget with a vertical rail of labeled circular actions as the binding interaction model.

## Evidence on Hand

- Existing working recorder implementation in `studio.js`.
- Existing extension entry and popup-window behavior in `background.js` and `popup.js`.
- User-supplied compact widget reference image in the current design request.
- No testimonials, benchmarks, customer logos, or external streaming integrations are available and none should be fabricated.

## Product Principles

- Camera and recording status are visible at a glance.
- Primary recording actions remain one click away.
- Advanced controls stay available through progressive disclosure.
- Recorded media stays local to the user's device.
- Labels describe real capabilities and recovery paths honestly.

## Accessibility & Inclusion

All icon controls require visible text labels, keyboard focus, accessible names, and at least a 44-by-44-pixel target.
