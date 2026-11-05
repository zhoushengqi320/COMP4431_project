# Pear: integrated 2D / 3D virtual companion

Pear is an original floating electronic companion for PolyPath: a black glass core,
three silver shell petals, green pixel eyes and a small gold-edged pear badge.
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

- The companion appears beside the chat on desktop. On smaller screens it starts
  collapsed above the chat; expand it to reveal the compact controls.
- Select **2D** for the SVG illustration or **3D** for the WebGL model.
- In 3D, drag horizontally/vertically to rotate, or focus the canvas and use arrow
  keys. **Reset 3D view** restores the front view. Tap or press Enter to greet Pear.
- In 2D, tap the character to greet it.
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
| Idle | Gentle float, blinking pixel eyes, slight shell drift |
| Microphone permission request | Preparing/connecting display |
| Recording (`listening`) | Shells open slightly; listening status |
| Recording stopped / ASR pending | Transcribing status and activity dots/bars |
| Chat request pending | Three graduated thought bubbles at the upper right and shell movement |
| TTS queued | Preparing audio display |
| Actual TTS `onstart` | Speaking status and a small opening/closing mouth |
| Playback pause | Mouth hidden; paused eyes/status |
| Resume / stop / completion | Resume speaking / return to idle |
| Visible request or speech error | Recoverable error expression |
| Tap / keyboard greeting | Two happy caret eyes (^ ^), a brief gentle jiggle and shell expansion |

Speaking uses a small mouth that opens and closes while the actual browser playback
is active. It follows playback events, not phoneme timing or measured audio
amplitude, so it does not claim precise lip sync. Thinking uses three graduated
comic-style bubbles at the upper right in both modes. A greeting displays two
happy caret-shaped eyes (^ ^) and a brief, decaying jiggle. While motion is disabled,
expressions still change but remain still.

Navigation away from Advisor unmounts the companion. Three.js animation loops,
observers, listeners, geometry, materials, textures and renderer resources are
disposed. Hidden/background or offscreen scenes stop continuous rendering.

## Source map

| File | Responsibility |
| --- | --- |
| `src/avatar/Companion.jsx` | Panel, preferences, previews, integration and fallback |
| `src/avatar/state.js` | Shared lifecycle state resolution and status text |
| `src/avatar/Avatar2D.jsx` | Original SVG illustration and independently animated parts |
| `src/avatar/scene.js` | Procedural 3D shell meshes, materials, pixel eyes, badge and motion |
| `src/avatar/avatar.css` | Responsive layout, SVG animations and reduced motion |
| `tests/avatar.test.mjs` | Activity precedence, playback states and recovery |

## Suggested live demonstration (about one minute)

1. Show the 3D character, rotate it and point out its independent shell pieces and
   pear badge. Switch to 2D to show the matching visual identity.
2. Ask a course-planning question. With a connected advisor, Pear thinks while the
   real request is pending. The offline demo response is immediate and explicitly
   labelled; use **Try expressions** to demonstrate its thinking animation offline.
3. Click **Read aloud**, then pause, resume and stop. Show the corresponding avatar
   states. Available languages/voices depend on the device and browser.
4. If the advisor and microphone are configured, dictate a question and stop the
   recording. Show listening, transcribing, then the draft for review.
5. Briefly show motion off, collapse, and the mobile arrangement if useful.

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
