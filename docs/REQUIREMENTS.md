# COMP4431 requirement mapping

Source: `COMP4431_GroupProject2027.pdf`, COMP4431 Artificial Intelligence (2026/27), four pages supplied by the project owner. This document tracks the implementation and remaining preparation; it does not predict a mark or certify acceptance by the teaching team.

## Required scope

| Requirement | PolyPath implementation / evidence | Verification or remaining work |
| --- | --- | --- |
| A chatbot for a defined domain | PolyU Computing course discovery, prerequisites and academic planning | Curated course library, relevant question answering, refusal when evidence is absent |
| Relevant answers in a chosen language | English and Chinese queries; course codes, interest search and follow-up references | `npm run evaluate`; English and Chinese are supported |
| AI-powered behaviour | TF-IDF / cosine information retrieval, bilingual query expansion; optional retrieval-grounded DeepSeek generation | Guests use the course knowledge base without credentials. The configured model is available only after login. A real model request was verified with the current environment key; future runs need a valid server-side key. A smoke check does not establish general answer quality. |
| Additional features (chosen by team) | Guest-first responsive UI, account-based profiles and chat history, document extraction, visible evidence, voice recognition and synthesis | Profile, files, voice tools and the configured model require login. Real voice support/permission must be checked on the target device |
| Describe technical implementation and challenges | README and architecture explanation | Presentation materials are outside this task at the user's request |
| Live domain-specific demonstration | Working application supports course queries, follow-ups, document references and voice | Live presentation and rehearsal are outside this task |
| Evaluation / feedback if applicable | Reproducible local evaluation cases and automated integration tests | Metrics cover the stated cases only. User feedback and live model quality are not fabricated |
| 2–4 group members and equal workload | README member/contribution table | **Names, student IDs and final allocation must be completed by the group** |
| Source ZIP and PPTX | `npm run package` produces the source ZIP | PPTX preparation is excluded at the user's request; no Canvas submission has been made |
| README includes all members and run instructions | README | Member identifiers intentionally remain `[TO FILL]` |
| Include prompt and relevant knowledge files | `prompts/`, `knowledge/`, `examples/` in the ZIP | No API keys, account database, uploaded personal records or node_modules in package |
| English presentation within 7 minutes, then 3 minutes Q&A | Outside the implementation task | The group prepares these separately |

The PDF lists voice, avatars, fine-tuned LLMs and friendly UI as **examples of optional additional features**, not a requirement to implement every item. PolyPath does not claim avatar integration or model fine-tuning.

## Access and conversation behaviour

The application opens directly into a guest workspace. **Sign in** opens authentication, **Create account** registers a new account, and **Continue as guest** returns to the guest workspace. A valid existing session restores the member workspace. Signing out returns to guest access; the member's saved chats remain attached to that account.

| Behaviour | Guest | Signed-in member |
| --- | --- | --- |
| Questions and follow-ups | Text-only course knowledge retrieval; 20 requests per 15 minutes per actual network peer | Knowledge retrieval or the server-configured model |
| Academic profile and documents | Server rejects nonempty profiles and file uploads with `403` | Account profile and supported document extraction are available |
| Voice tools | UI prompts the user to sign in | Speech input, read-aloud and voice settings when the browser supports them |
| Chat history | Current-tab `sessionStorage`; survives reload, ends when the tab closes | Account-isolated SQLite records, restored after login or reload |
| New conversation | Existing chats remain in the history sidebar | Existing chats remain in the history sidebar |

Guest requests never call the configured model, even when a model key exists. The development and production servers share the same access middleware. The guest quota uses the socket peer rather than a client-supplied forwarding header, so users behind a shared proxy may share the limit. Exceeding it returns `429` with `Retry-After`. Voice availability is gated in the UI; transcribed or pasted text remains ordinary text input.

Member history is limited to **50 conversations per account, 100 messages per conversation, and 256 KiB per saved conversation**. Unsynced member conversation drafts are retained in account-specific current-tab `sessionStorage`; save failures and version conflicts are visible. Closing the tab can lose unsynced drafts. Guest history does not automatically merge into an account. Uploaded files and their full extracted text are not persisted and must be reattached after a reload; excerpts already included in saved messages or source descriptions remain part of the saved conversation.

Member requests check the expected account identity and revalidate it after an upload or document extraction, before retrieval/model work. An expired session or changed account returns `401` rather than falling back to guest access. Account profile and conversation APIs remain authenticated. Source packages exclude the database, credentials and uploaded personal files.

## Submission dates from the supplied specification

- Thursday class: source ZIP and PPTX by **18 November 2026, 23:59**.
- Friday class: source ZIP and PPTX by **19 November 2026, 23:59**.
- Thursday-class demonstration: **19 or 26 November 2026**.
- Friday-class demonstration: **20 or 27 November 2026**.
- Dates are recorded in Hong Kong time. The class and assigned demonstration slot have not been provided; verify the final Canvas notice.

## Pre-submission checklist

- [ ] Replace every member/student-ID/class `[TO FILL]` field in README (presentation materials are separate).
- [ ] Confirm 2–4 team members and record each person's actual contribution.
- [ ] Configure and test a real model key if presenting the LLM mode.
- [ ] Check guest text access, its quota, and the login prompts for profile/files/voice/model features.
- [ ] Check that member history restores after refresh/login, accounts stay isolated, and new chats preserve earlier sidebar entries.
- [ ] Reattach required files after reloading; resolve any unsynced chat or version-conflict notice before closing the tab.
- [ ] Rehearse English speech recognition and read-aloud on the actual browser; keep typed input available.
- [ ] Review course-source dates against the student's cohort; no automatic enrolment eligibility claim.
- [ ] Run `npm test`, `npm run evaluate`, `npm run build` and `npm start`.
- [ ] Rebuild `npm run package` and inspect ZIP contents.
- [ ] Rehearse the full presentation/demo within 7 minutes.
- [ ] Submit ZIP and PPTX to Canvas once per group. This project has not submitted anything automatically.
