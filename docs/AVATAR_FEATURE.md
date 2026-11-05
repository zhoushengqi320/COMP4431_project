# Pear: integrated 2D / 3D virtual companion

Pear is an original floating electronic companion for PolyPath: a black glass core,
three silver shell petals, expressive green screen eyes and a small gold-edged pear badge.
The selected visual concept was developed with AI-assisted image generation;
the interactive SVG and Three.js geometry are implemented in source code.
The 3D model is procedural, not an image displayed on a rotating rectangle.

## Run

Use the repository's usual setup (Node.js 22.12+):

```sh
npm install
npm run dev
```

Alternatively, use `pnpm install` and `pnpm dev`. Both lockfiles include Three.js.
No avatar API key, external model file, HDR download or paid avatar service is needed.
The avatar runs in the labelled UI demo when no advisor endpoint is configured.
Live chat and microphone transcription still require the team's existing Qwen setup.
Do not copy credentials into frontend code.

```sh
npm test
npm run build
npm run export:preview
```

The existing preview exporter creates a single `dist/PolyPath-preview.html` with
both renderers included. Build without `VITE_ADVISOR_API_URL` for a standalone UI
demo. A live advisor requires the local server; it cannot run from a file alone.
The existing optional Google Fonts import is unrelated to the avatar; local font
fallbacks are used if offline.

## Controls

- The companion starts as a small floating character near the bottom-right on all
  screen sizes. It docks above the actual composer so text entry, send and voice
  controls remain accessible, including when recording controls grow.
- Click **Open Pear companion** to open the settings panel. Click its close button,
  press Escape, or click outside to return to the small companion. Escape/close
  returns keyboard focus to the launcher; an outside click keeps its natural focus.
  The panel overlays content without reserving a permanent chat column.
- The mini companion uses the lightweight animated SVG face and continues to show
  real chat, listening and speaking states. Open the panel to inspect and interact
  with the full 2D/3D renderers.
- Select **2D** for the SVG illustration or **3D** for the WebGL model.
- In 3D, drag horizontally/vertically to rotate, or focus the canvas and use arrow
  keys. **Reset 3D view** restores the front view. Tap or press Enter to greet Pear in the expanded panel.
- In the expanded 2D view, tap the character to greet it. The small floating
  character is the entry point for opening the panel.
- **Gentle motion** disables continuous motion in both renderers. The operating
  system's reduced-motion setting takes priority. Mode and motion preferences
  are saved locally; storage failure does not block the app.
- **Try expressions** exposes labelled 4.5-second animation previews. These do not
  record audio or call the AI. Real conversation activity always takes priority.
- If WebGL cannot start or its context is lost, Pear falls back to interactive 2D.
  Reload to retry 3D after recovering the device/browser.

## Integration and states

`Companion` receives the existing `loading`, `voiceState`, `speechState` and visible
error state from `App`. It does not replace the advisor or voice modules.

| Trigger | Companion behavior |
| --- | --- |
| Idle | Gentle float, soft rounded eyes, natural double blinks, slight shell drift |
| Microphone permission request | Preparing/connecting display |
| Recording (`listening`) | Shells open slightly; listening status |
| Recording stopped / ASR pending | Transcribing status and activity dots/bars |
| Chat request pending | Three graduated thought bubbles at the upper right and shell movement |
| TTS queued | Preparing audio display |
| Actual TTS `onstart` | Coordinated eyes and several small mouth shapes with phrase-like rests |
| Playback pause | Closed short mouth; paused eyes/status |
| Resume / stop / completion | Resume speaking / return to idle |
| Visible request or speech error | Recoverable error expression |
| Tap / keyboard greeting | Happy caret eyes (^ ^), a small kaomoji mouth, brief jiggle and shell expansion |

A shared face rig defines eye and mouth paths in a small local coordinate space.
The SVG renderer draws those paths directly. The WebGL renderer draws the same
paths to a CanvasTexture on a curved surface just above the black glass core.
This supports rounded eyes, happy carets, playful squints, half-lidded side-eye,
natural double blinks and coordinated small kaomoji mouths in both modes.
Speaking cycles through several smile/open shapes and short rests with subtle
head movement. These are stylized playback gestures, not phoneme or audio-amplitude
analysis; precise lip sync is not claimed. Pause/stop immediately removes the
speaking pattern. Thinking retains the three upper-right thought bubbles.

### Optional personality and interaction

- Moving a mouse/pen over the companion gently shifts its gaze and orientation.
  This uses local pointer position, not a camera or tracking service.
- One tap shows happy caret eyes. A second nearby tap produces a playful squint;
  a third produces a brief pretend pout. After a gap, the sequence resets.
- With **Little surprises** and **Gentle motion** enabled, a visible idle companion
  may briefly glance around, play or stretch. The first moment occurs after about
  9–14 seconds; later moments are spaced about 22–34 seconds apart and last less
  than three seconds. They do not produce audio, notifications or AI requests.
- Busy conversation, recording and playback take priority over personality.
  Ambient moments are suspended while hidden/offscreen and with reduced
  motion. The small floating companion can still have occasional idle moments. **Little surprises** is independently switchable and saved locally.
- **Try expressions** includes Curious, Playful, Pout and Sleepy for immediate
  inspection. These are explicitly previews, not inferred user/AI emotions.
- With motion disabled, eye/mouth expressions remain still; modes and lifecycle
  labels continue to work.

Navigation away from Advisor unmounts the companion. Three.js animation loops,
observers, listeners, geometry, materials, textures and renderer resources are
disposed. Hidden/background or offscreen scenes stop continuous rendering.

## Source map

| File | Responsibility |
| --- | --- |
| `src/avatar/Companion.jsx` | Panel, preferences, previews, integration and fallback |
| `src/avatar/state.js` | Shared lifecycle state resolution and status text |
| `src/avatar/Avatar2D.jsx` / `Face2D.jsx` | SVG illustration and locally animated shared face rig |
| `src/avatar/expressions.js` | Shared eye/mouth paths, timed gestures and tap reactions |
| `src/avatar/scene.js` | Procedural 3D shell meshes, materials, curved face texture, badge and motion |
| `src/avatar/avatar.css` | Responsive layout, SVG animations and reduced motion |
| `tests/avatar.test.mjs` / `tests/expressions.test.mjs` | Activity priority, recovery, face timing, tap reactions and reduced motion |

## Suggested live demonstration (about one minute)

1. Open the small floating companion, select 3D, rotate it and point out its shell pieces and
   pear badge. Switch to 2D to show the matching visual identity.
2. Ask a course-planning question. With a connected advisor, Pear thinks while the
   real request is pending. The offline demo response is immediate and explicitly
   labelled; use **Try expressions** to demonstrate its thinking animation offline.
3. Click **Read aloud**, then pause, resume and stop. Show the corresponding avatar
   states. Available languages/voices depend on the device and browser.
4. If the advisor and microphone are configured, dictate a question and stop the
   recording. Show listening, transcribing, then the draft for review.
5. Close the settings panel to show that the small companion still follows live
   conversation states. Briefly show motion off and the mobile arrangement if useful.

## Validation and limits

The Node test suite covers avatar state arbitration alongside the existing speech,
recording and knowledge-base tests. Browser validation exercised both renderers,
rotation/reset, saved preferences, collapse/expand, reduced motion, WebGL-loss
fallback, and layouts at 1440, 1024, 768, 390 and 320 pixels. Controlled browser
adapters verified chat wait/reply/error, microphone recording/transcription, and
TTS start/pause/resume/stop without calling paid services. Live Qwen responses,
physical microphone input and installed system voices still need a final check on
the group's presentation computer. The procedural model approximates the approved
concept; it is not a pixel-identical reconstruction of the concept render.

Floating-layout validation also checked default launcher mode, composer avoidance
at 1440/1024/768/390/320 pixels, unchanged chat width when opening the panel,
Escape focus restoration, outside-click dismissal, and live recording/playback
state updates while minimized. Controlled adapters were used for live-service events.
