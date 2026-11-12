# PolyPath — PolyU Academic Advisor

**COMP4431 Artificial Intelligence (2026/27) Group Project · Thursday Class**

PolyPath is an academic advising chatbot for students at The Hong Kong Polytechnic University. It helps students understand course content, explore learning interests, and review prerequisites and suggested preparation. The application combines a PolyU course knowledge base with Qwen language models and presents advice through course cards and conversational follow-ups. Additional features include speech recognition, answer read-aloud, and Pear, an interactive 2D/3D virtual companion.

The application provides planning guidance. Official enrolment requirements, course availability, and graduation eligibility must be confirmed against the documents applicable to the student's cohort and with the University.

## 1. Team Members and Contributions

**Class: Thursday**

| Name | Student ID | Main Contribution |
| --- | --- | --- |
| Fu Keming (付可铭) | 24108151d | Speech recognition |
| Zhou Wenqi (周文琪) | 24108678d | 2D/3D virtual companion design and integration |
| Liu Yucan (刘宇灿) | 24115433d | Model fine-tuning |
| Zhou Shengqi (周圣淇) | 24101032d | UI design and implementation, API key configuration and integration, database and knowledge base integration |

## 2. Basic Features

- **Domain-specific question answering:** Answers English and Chinese questions about PolyU courses, including content, credits, learning objectives, and prerequisites.
- **Interest-based recommendations:** Retrieves courses relevant to the student's question and interests. Each recommendation reply displays up to three courses, with further exploration available when additional relevant records are identified.
- **Conversational follow-ups:** Uses recent conversation context, offers clickable follow-up questions, and excludes previously displayed courses when continuing a recommendation.
- **Structured course cards:** Presents course information, learning outcomes, an introduction, and suggested preparation in a consistent layout while retaining original prerequisite conditions for reference.
- **Uncertainty handling:** Identifies missing course records, unavailable information, and questions for which official eligibility cannot be established.

## 3. Implemented Additional Features

| Additional Feature | Implementation | Requirements and Limitations |
| --- | --- | --- |
| **Speech recognition** | Records audio using browser `MediaRecorder` and sends it to `/api/transcribe`, where the backend calls Qwen ASR. English, Mandarin, and Cantonese options are available. Transcriptions are placed in the composer for review before sending. | The UI requires sign-in. Microphone permission, a compatible browser, a valid Qwen key, and network access are required. |
| **Answer read-aloud** | Uses browser `speechSynthesis` to read answers and course recommendations, with voice selection, playback speed, pause, resume, and stop controls. | The UI requires sign-in. Available voices and languages depend on the device and browser. |
| **Pear 2D/3D virtual companion** | Uses SVG for 2D and Three.js for a rotatable procedural 3D model. Expressions reflect listening, transcription, response generation, speech playback, pause, and error states. | The companion itself requires no external API. It falls back to 2D when WebGL is unavailable and supports reduced motion. |
| **Domain model fine-tuning** | Includes completed Qwen3-8B LoRA training and deployment integration. Domain examples teach response structure, while runtime retrieval continues supplying course facts. | Calling the deployment requires an authorised API key. Successful training does not establish independent question-answering accuracy. |
| **Responsive user interface** | Provides guest access, sign-in and registration, suggested questions, course cards, a conversation sidebar, and mobile navigation. | Full functionality requires both the frontend and Node backend. |
| **Accounts and conversation history** | Stores academic profiles and conversations by account in SQLite, supporting new conversations, switching between chats, and restoration after signing in again. | Guest history stays in the current browser tab and does not automatically merge into an account. |
| **Database knowledge base and retrieval augmentation** | Retrieves from Supabase `public.courses` or a local course snapshot, supplies relevant records to the model, and validates course fields before display. | Catalogue records do not establish current timetables or official enrolment eligibility. |
| **Text attachment support** | Signed-in users can upload TXT, CSV, and Markdown documents as supplementary textual context. | The default advisor handler reads text formats directly. PDF/DOCX uploads currently supply filenames and sizes only. |

### Fine-Tuning Implementation Record

The repository's v8 records document a completed Qwen3-8B LoRA training run on 4 November 2026, followed by cloud deployment and application integration.

| Item | Recorded Value |
| --- | --- |
| Base model and method | Qwen3-8B, LoRA, `efficient_sft` |
| Dataset | 1,151 training examples, 160 validation examples, and 175 held-out test candidates |
| Training configuration | 1 epoch; batch size 32; maximum length 8,192; learning rate 3e-4 |
| Training status | Recorded as `SUCCEEDED` |
| Deployment invocation ID | `qwen3-8b-01fa13690bf1` |

These are saved implementation records; current cloud availability must be confirmed through an actual request. Automated rule checks do not constitute complete human semantic review, and the repository does not yet provide a complete independent comparison between the base and fine-tuned models. Course facts come from retrieval, and the server also enforces presentation rules, so the displayed output should not be attributed entirely to fine-tuning.

See the [fine-tuning documentation](finetuning/README.md), [training record](docs/evaluations/TRAINING_RUN_2026-11-04.md), and [deployment record](docs/evaluations/DEPLOYMENT_V8_2026-11-04.md).

## 4. Technical Architecture and Challenges

```text
React / Vite UI
├── Course Q&A, course cards, academic profiles, conversation history
├── MediaRecorder audio capture / browser speech synthesis
└── Pear: SVG 2D / Three.js 3D
          |
          v
Node.js API (mounted in Vite during development; standalone in production)
├── Accounts and sessions -> SQLite
├── /api/transcribe -> Qwen ASR
└── /api/advisor
    ├── Question and context -> search plan
    ├── Supabase / local snapshot -> relevant course records
    ├── Prompts + course evidence + text documents -> Qwen / fine-tuned model
    └── Response validation and normalisation -> course cards and follow-ups
```

The main technologies are React 19, Vite 7, Node.js 24 with built-in SQLite, Three.js, and the Qwen compatible API. API keys are read by the backend and are not embedded in frontend code.

| Technical Challenge | Approach |
| --- | --- |
| Models may invent courses or alter course names and credits. | Retrieve before generation, then validate and fill course fields against retrieved records in `server/course-response.mjs`. Display missing-record notices for unknown courses. |
| Prerequisites contain AND/OR conditions, exclusions, and co-requisites. | Preserve original conditions and exclude exclusion subjects and co-requisites from advance preparation groups. Level grouping is a reading aid only. |
| Recommendations may contain too many courses or repeat earlier suggestions. | Enforce a maximum of three displayed courses per recommendation reply, track displayed and reserve courses, and exclude previously shown codes during continuation. |
| Chinese and English questions may not directly match English catalogue wording. | Generate a search plan with Qwen and provide bilingual keyword expansion and local keyword retrieval as a fallback. |
| Voice capture, playback, and companion animation must remain synchronised. | Drive the companion from shared interaction states, update it when playback pauses or stops, and prioritise actual activity over expression previews. |
| 3D rendering must handle compatibility and performance constraints. | Fall back to 2D on WebGL failure, suspend continuous rendering when hidden, and release Three.js resources when components unmount. |
| Multiple accounts, browser tabs, and concurrent saves can conflict. | Validate the expected account identity, revalidate member identity before returning an answer, and use conversation version checks with visible conflict notices. |

## 5. How to Run

### 5.1 Requirements and Installation

Install **Node.js 24 or later** and npm. The application uses Node's built-in SQLite support and should be run with this version requirement. Live AI responses require network access and a valid Qwen API key.

```sh
git clone https://github.com/zhoushengqi320/COMP4431_project.git
cd COMP4431_project
npm ci
cp .env.example .env
```

If using the source ZIP, extract it and open the directory containing `package.json` before installing dependencies and copying the configuration. In Windows PowerShell, use `Copy-Item .env.example .env` for the copy step.

### 5.2 Model Configuration

Edit `.env` in the project root:

```dotenv
VITE_ADVISOR_API_URL=/api/advisor

# Use your own server-side key and an endpoint in the matching region.
QWEN_API_KEY=replace_with_your_server_side_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
QWEN_PLANNER_MODEL=qwen-plus
QWEN_ASR_MODEL=qwen3-asr-flash
QWEN_ADVISOR_MODE=integrated

AUTH_DATABASE_PATH=./data/polypath.sqlite
AUTH_SECURE_COOKIES=false
```

To use the team's fine-tuned model, change `QWEN_MODEL` to `qwen3-8b-01fa13690bf1` and use a key authorised for that deployment in its Beijing workspace. If you do not have access to this deployment, select a Qwen model available to your account.

Matching variables in `.env.local` override `.env`. Restart the service after changing configuration. Changes to frontend `VITE_` variables also require rebuilding the production frontend.

**The current default `/api/advisor` uses Qwen and returns `503` when its API key is missing. It does not automatically switch to local knowledge-only answers.** The repository also contains local retrieval and DeepSeek adapter modules, but these are not the current default advisor route. Confirm key validity through an actual question-answering request.

Do not prefix secret variables with `VITE_`. Do not include real keys, `.env`, or `.env.local` in Git, screenshots, or submission packages.

### 5.3 Course Knowledge Base Configuration

The Git repository includes `data/courses.json`, containing **2,659 course records** with a snapshot timestamp of **26 October 2026**. Without Supabase configuration, the Qwen advisor retrieves courses from this file, so no separate database service is needed for these course records.

To read courses from Supabase, add the following to `.env`:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=replace_with_your_publishable_key
# SUPABASE_ANON_KEY is also accepted. Do not use a service-role key.
```

The database must already contain a readable `public.courses` table. See `server/course-knowledge.mjs` for the fields and retrieval implementation. Supabase supplies course data; accounts, academic profiles, and conversations remain in local SQLite.

```sh
npm run check:supabase
npm run sync:courses
```

The first command performs a read-only connection check. The second reads the root `.env` file and synchronises the course table to `data/courses.json`. When Supabase is configured, the default Qwen path prioritises online course retrieval. A failed connection may produce an error; check the configuration before retrying.

### 5.4 Start the Development Service

```sh
npm run dev
```

Open the address printed in the terminal, normally `http://127.0.0.1:5173`. If the port is occupied, use the address actually reported. The service provides the UI, account API, advisor API, and transcription API together.

### 5.5 Run the Production Build

```sh
npm run build
npm start
```

The default address is `http://127.0.0.1:3000`; `HOST` and `PORT` can be configured. The complete application requires the Node backend. Opening `dist/index.html` directly or using static-only hosting does not provide the full application.

These steps describe local operation. The current advisor API restricts requests to localhost Host values. External deployment requires adapting origin checks, HTTPS, and reverse proxy configuration.

## 6. Usage

1. Open the application to enter the guest workspace and ask a course question. **Guests also call the model when Qwen is configured.** Guest advisor and transcription requests share a limit of 20 requests per 15 minutes per network peer; users behind a shared proxy may share the quota.
2. Select **Sign in → Create account** to register. Sign in to access academic profiles, files, voice tools, and account-based conversation history. There are no predefined accounts or universal passwords.
3. Enter your programme, year, and interests under **Profile & documents**. Prefer TXT, CSV, or Markdown for supplementary documents.
4. Read course cards and use follow-up questions or **Explore more courses** to continue. Homepage suggestions first fill the composer for review before sending.
5. After signing in, select the microphone and a language. Stop recording, review the transcription, and send it. Select **Read aloud** to hear an answer.
6. Select Pear in the lower-right corner to open the companion panel and switch between **2D/3D**. Rotate the 3D view by dragging or using arrow keys, adjust motion, and preview expressions.
7. Use **New conversation** to start another chat. Earlier conversations remain under **Recent chats**.

Example questions:

```text
What does COMP4431 cover, and what are its prerequisites?
I want to focus on machine learning. Which courses should I consider?
Please recommend more related courses without repeating the ones already introduced.
What are the learning objectives and suggested preparation for COMP2411?
```

## 7. Project Structure, Prompts, and Knowledge Files

```text
COMP4431_project/
├── README.md                  # Members, features, implementation, and run instructions
├── .env.example               # Environment variable template
├── package.json / package-lock.json
├── src/                       # UI, conversations, accounts, and voice interaction
│   └── avatar/                # Pear SVG / Three.js companion
├── server/                    # Node APIs, authentication, retrieval, and model integration
├── data/courses.json          # Main course knowledge snapshot
├── knowledge/                 # Curated courses, policies, and local retrieval references
├── prompts/                   # Separately stored advisor prompt
├── finetuning/                # Examples, versions, and training/deployment records
├── evaluation/                # Local retrieval evaluation cases
├── examples/                  # Sample text documents
├── tests/                     # Automated tests
├── scripts/                   # Synchronisation, evaluation, packaging, and fine-tuning tools
└── docs/                      # Technical documentation and evaluation records
```

**The prompt used by the current default advisor** is `SYSTEM_PROMPT` in `server/qwen-advisor.mjs`. The search planner prompt is in `server/course-search.mjs`. The standalone `prompts/advisor-system.txt` belongs to another retrieval adapter path and should be retained together with the server source.

Knowledge files include `data/courses.json` and `knowledge/`; fine-tuning materials are in `finetuning/`. Models and knowledge are integrated through source code rather than an online chatbot builder's hidden workflow.

## 8. Checks, Evaluation, and Source Packaging

```sh
npm test
npm run evaluate
npm run build
npm run package
```

| Command | Purpose and Scope |
| --- | --- |
| `npm test` | Runs repository tests covering accounts, conversations, retrieval, APIs, document utilities, voice states, and the companion. Some interfaces are tested with mocks. |
| `npm run evaluate` | Runs 24 local retrieval regression cases and writes `artifacts/evaluation.json`. It evaluates `server/knowledge.mjs` and the curated references, not the accuracy of the current Qwen route or fine-tuned model. |
| `npm run build` | Checks and builds frontend assets. It does not replace live model, microphone, or browser interaction checks. |
| `npm run package` | Generates `deliverables/PolyPath-source.zip` with source code, README, the dependency lockfile, prompts, curated knowledge files, tests, and documentation. |

**The existing packaging script excludes `data/` and `finetuning/`.** For a complete submission, use an archive manager after generating the ZIP to add **`data/courses.json` and `finetuning/`** under its `PolyPath/` root, preserving their relative paths. Otherwise, an extracted copy without Supabase configuration will lack the default course data, and the fine-tuning examples and records will be missing.

Do not include the entire runtime `data/` directory: SQLite databases and WAL/SHM files may contain accounts and conversations. Also exclude real credentials, personal uploads, `node_modules/`, and `.git/`.

The source ZIP should include the project source, this README, the prompts actually used, and relevant knowledge files. Submit presentation slides separately as a PPTX. Before submission, verify all member details and contributions, and test the advisor, voice features, and companion in the presentation environment.

## 9. Known Limitations

- **Data and eligibility:** Snapshots, curated references, and online catalogue records do not guarantee semester availability, places, or cohort-specific rules. The application does not replace official enrolment or graduation checks.
- **Model quality:** Successful training, deployment, and format validation do not guarantee factual correctness. Generated learning outcomes and advice should be checked against source records. A complete independent before/after fine-tuning comparison remains outstanding.
- **Document contents:** The UI accepts PDF/DOCX uploads, but the default Qwen path does not invoke the separate PDF/DOCX extraction module. TXT/CSV/Markdown contents are limited to 6,000 characters per file. OCR and XLSX content-based question answering are not implemented.
- **File retention:** Uploaded files and full document contents are not persisted with conversations and must be reattached after reloading. Excerpts already included in answers may remain in saved conversations.
- **Voice and animation:** Speech input depends on microphone access, network connectivity, and Qwen ASR; read-aloud depends on browser voices. Companion mouth movements are stylised playback-state animations, without phoneme-level lip synchronisation.
- **Course ratings:** Values labelled “Example” are simulated when catalogue ratings are unavailable. They are not actual student reviews.
- **Conversations and accounts:** Each account supports up to 50 conversations, with up to 100 messages and 256 KiB per saved conversation. Guest history and unsynchronised drafts depend on current-tab storage and may be lost when the tab closes. Email verification, password recovery, and third-party sign-in are not implemented.

## 10. Further Documentation

- [AI integration and course response format](docs/AI_INTEGRATION.md)
- [Pear 2D/3D companion implementation](docs/AVATAR_FEATURE.md)
- [Fine-tuning data and training records](finetuning/README.md)
- [Curated knowledge base and local retrieval algorithm](knowledge/README.md)
- [Scope of the local retrieval evaluation](docs/EVALUATION.md)

Some supporting documents retain historical implementation details. For the current default execution path and run instructions, refer to this README and the corresponding source code.
