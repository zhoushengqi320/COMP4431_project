# PolyPath — PolyU Academic Planning UI

A red-and-white, English-language React frontend for the COMP4431 domain-specific chatbot project. Two screens: **AI Advisor** and **My Profile & Documents**. Course recommendations and semester plans appear inside the conversation.

## Run on Windows or macOS

Install Node.js 22.12+ (or Node.js 24 LTS). From this project directory:

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite, normally http://127.0.0.1:5173/. Stop with Ctrl+C. React and Vite are project dependencies; no global React install, Python environment, model or API key is required for the UI demo.

For reproducible dependency installation with pnpm, a `pnpm-lock.yaml` is included:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Production build: `npm run build`. Local production preview: `npm run preview`.

For a click-to-open UI demonstration, run `npm run export:preview`, then open `dist/PolyPath-preview.html` in a modern browser. This inlines the app code and styles; an internet connection is optional for Google Fonts. Build it with `VITE_ADVISOR_API_URL` empty to demonstrate the frontend without a backend.

## What is implemented

- Responsive desktop and mobile navigation with two screens.
- Chat input, Enter to send / Shift+Enter for a newline, follow-up suggestions and a new-chat reset.
- Per-message attachments with file chips and removal.
- Browser speech input: microphone control, English/Cantonese/Mandarin selection, live transcript preview, explicit stop/cancel, and editable text before sending. Browser support, microphone permission and potentially a network speech service are required.
- Course recommendation cards with reasons and expandable prerequisites.
- Semester-by-semester plan cards with credit totals supplied by the backend.
- Planning-check and expandable source sections.
- Helpful/unhelpful feedback toggles (current-chat state only).
- Editable student profile; explicit Save persists profile fields in browser localStorage.
- Three document categories; file chooser, drag and drop, duplicate filtering, size/type checks and removal.
- Loading, API errors, timeout handling and a help dialog.

**Default UI demo:** replies are fixed examples in `src/advisor.js`, with clearly fictional `DEMO` course codes. No AI, file analysis, eligibility verification or real course catalogue is implemented. The demo labels remain visible. Files are never sent anywhere in demo mode.

Documents and message attachments are retained as browser `File` objects in memory for this session only. Refresh clears files and conversation. Profile fields persist in localStorage; do not use real student IDs or unnecessary personal information for demos. Google Fonts is used for typography with system-font fallbacks.

## Connect the team's AI backend

Read [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md). Configure `VITE_ADVISOR_API_URL` in a local `.env` file, then restart Vite. Leave it empty for demo mode. Frontend environment variables are public; **never put model API secrets in them**.

`src/advisor.js` is the single request boundary. Backend developers can adapt this function to their endpoint without rewriting the UI. Backend/model implementation is intentionally outside this frontend's scope.

## Presentation and assessment preparation

The assignment assesses technical contributions, UI design, creativity, and the quality of the presentation/demo. This frontend supports those areas through a complete student workflow, structured recommendations, source visibility, planning checks and feedback affordances. The displayed checks and feedback controls are not evidence of a working backend or a completed evaluation.

Suggested live scenario:

1. Open My Profile & Documents; enter a sample programme and study year.
2. Select a sample transcript, requirements and course-offering document.
3. Open AI Advisor; ask about a machine learning direction.
4. Inspect recommendation reasons, prerequisites and source information.
5. Ask for remaining-semester planning in the same conversation.
6. Add an extra reference file to a follow-up message and show feedback controls.

Before the final assessment, the team must replace demo data with connected AI, validate real programme rules and course offerings, show actual supporting sources, and collect/report real evaluation results if claimed. Browser speech recognition is included as an additional feature. It works independently of the AI backend and needs a successful test on the actual demo browser/microphone before being claimed as verified. Voice synthesis and avatars are not included.

### Group members — complete before Canvas submission

| English name | Student ID | Contribution |
| --- | --- | --- |
| TODO | TODO | Frontend / UI |
| TODO | TODO | AI / backend |

Complete this table for every member. The final source package must include member names/IDs and run instructions. Prepare the presentation slides and final submission package separately according to the assignment brief; this repository is not the complete assessment submission yet.

## Structure

```text
src/main.jsx          Screens and interactive components
src/styles.css        Red/white visual system and responsive layouts
src/advisor.js        Demo data and backend request adapter
src/voice.js          Browser speech-recognition lifecycle
tests/voice.test.mjs  Speech lifecycle tests using a fake engine
docs/AI_INTEGRATION.md  Request/response contract for the AI team
```

## Voice input

Click the microphone beside Send. Choose a language, read the browser-service notice, then click Start microphone. Allow microphone access when prompted. Speak, then use Stop listening (or let the browser end the utterance). Final recognised text is appended to any existing draft; review/edit it and click Send yourself. Close voice input or change screens to cancel. A session is limited to 60 seconds.

Browser speech recognition varies by browser, operating system, permission settings and provider availability. For assessment, run on localhost (`npm run dev`) or HTTPS in a browser supporting SpeechRecognition / webkitSpeechRecognition, and test the real microphone in advance. A double-clicked HTML file can preview the control but some browsers restrict microphone recognition on local files. Audio may be processed by the browser provider online, independently of the AI backend. PolyPath does not record or retain an audio file.

Run `npm test` for lifecycle tests (interim revisions, finalisation, cancellation, permission errors and network/no-speech failures). They use a fake recognition engine and do not prove real-device speech accuracy.

## Which files to share

- GitHub: commit this project's source and configuration, including `src/`, `docs/`, `scripts/`, `tests/`, `index.html`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example` and README. Do not commit `node_modules/`, `dist/`, `.env`, screenshots or preview ZIPs.
- Teammate handoff: send the source ZIP, then extract and follow Run above.
- Visual review: send the preview HTML or preview ZIP; these are not the editable React source.
