# FaceScreen Design Direction

## Pocket Camera Deck

FaceScreen is a compact, camera-first recording instrument rather than a dashboard. The circular webcam monitor is the visual anchor, while a vertical rail keeps Record, Settings, Toolbox, and Camera within one click.

## Visual World

- Charcoal housing and camera-black preview create a quiet desktop utility.
- Paper-white labels provide clear hierarchy; recording red is reserved for capture and urgent state.
- Circular controls and restrained line icons make the widget feel like a purpose-built physical deck.
- Small status details remain secondary but must meet readable contrast on dark surfaces.

## Interaction Rules

- Keep the native control deck at 220 by 300 pixels, expand settings to 360 by 480 pixels, and collapse active recording to a 220 by 72 pixel mini bar.
- Preserve a minimum 44-by-44-pixel target for every interactive control.
- Show the camera, recording state, timer, and four primary actions in the first viewport. Keep the floating camera at a 180-pixel default with 140-to-320-pixel resize limits, a subtle recording ring, and a focused lower-right grip for direct pointer or keyboard resizing.
- Reveal Settings in a scrollable overlay and Toolbox in a smaller quick-action tray.
- Use Camera instead of Live Stream until external broadcasting is actually supported.
- Keep focus indicators visible and honor reduced-motion preferences.

## Product Truth

Recordings, snapshots, and history remain local to the browser. Chrome controls source selection, and FaceScreen must never imply that it can preselect a source or broadcast live when those capabilities are unavailable.

## Responsive Behavior

At narrow popup widths, reduce the webcam monitor and rail controls only as far as the 44-pixel accessibility floor. Preserve the same action order and camera-first hierarchy instead of changing to a separate mobile layout.
