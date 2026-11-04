<HTML>
   <h1>不要删除Readme文件！！</h1>
</HTML>
# PolyPath — PolyU academic planning advisor

A red-and-white React app for the COMP4431 chatbot project. Students chat with an AI advisor about courses, prerequisites and remaining-semester plans. Two screens: **AI Advisor** and **My Profile & Documents**.

Replies use the configured Qwen model on Alibaba Cloud Model Studio. The v8 **Qwen3-8B LoRA fine-tuned model** has completed training; its deployment invocation code is `qwen3-8b-01fa13690bf1`. Answers also retrieve the team’s PolyU **course catalogue** (Supabase `public.courses`, 2659 rows). See [training records](docs/evaluations/TRAINING_RUN_2026-11-04.md) and [deployment status](finetuning/v8/deployment-status.json).

## Run

Need Node.js 22.12+ (or 24 LTS).

```sh
npm install
cp .env.example .env
```
<HTML>
   <h2 style="color: red;">
  下面是配置.env文件的方法
</h2>
</HTML>
Edit `.env` (never commit this file):

```dotenv
VITE_ADVISOR_API_URL=/api/advisor
QWEN_API_KEY=your-bailian-api-key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3-8b-01fa13690bf1
QWEN_ASR_MODEL=qwen3-asr-flash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=sb_publishable_your-key
```

Then:

```sh
npm run dev
```

Open http://127.0.0.1:5173/. Stop with Ctrl+C. Local model selection is in `.env.local`, which overrides matching `.env` variables. Edit `.env.local` to change the deployed model; restart Vite after configuration changes.

Leave `VITE_ADVISOR_API_URL` empty to run the labelled UI demo with no Qwen calls.

For temporary raw fine-tuning observation, set `QWEN_ADVISOR_MODE=finetune-only` in `.env.local` and restart. This sends only the current question, without system prompts, retrieval, history, JSON constraints or course-card normalization. The page shows the exact raw output; real requests append observations to the Git-ignored `finetuning/observations/finetune-only.jsonl`. Set the value to `integrated` and restart to restore the complete advisor. See [scope and interpretation](docs/evaluations/FINETUNE_ONLY_2026-11-04.md).

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Production bundle |
| `npm run preview` | Serve the production build |
| `npm test` | Voice, speech and catalogue unit tests |
| `npm run sync:courses` | Refresh `data/courses.json` from Supabase |
| `npm run export:preview` | Build a click-to-open `dist/PolyPath-preview.html` |

## How answers are produced

The browser never sees the Qwen or Supabase keys. Vite proxies two local endpoints:

1. **Chat** — `POST /api/advisor`  
   Retrieve matching rows from the course catalogue, attach them to the prompt, and call `QWEN_MODEL`. The v8 configuration uses the fine-tuned deployment code. Qwen may only recommend courses that appear in those excerpts. It must not invent codes.

2. **Voice** — `POST /api/transcribe`  
   The mic records in the browser (`MediaRecorder`). On stop, the clip is sent to **Qwen-ASR** (`qwen3-asr-flash`). The transcript is placed in the input box for review; it is not sent to the advisor until the student clicks Send.

The catalogue snapshot lives in `data/courses.json`. If `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, the server also reloads live rows (and falls back to the snapshot if Supabase is down). Retrieval supplies current facts; LoRA training teaches the course-answer format. The API key must belong to the same Beijing workspace as the deployed model. The invocation code differs from the training output ID.

Call-level request/response details: [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).

## What the UI does

- Chat with Enter to send / Shift+Enter for a newline, follow-up chips and New chat.
- Profile fields persist in `localStorage`. Documents and attachments stay in memory for the session.
- Course cards, semester plans, planning checks and source citations are rendered from the advisor JSON.
- Voice input: Mandarin / Cantonese / English, then Qwen transcription.
- Read aloud uses the browser speech synthesizer; it is separate from Qwen.

## Project layout

```text
src/main.jsx                 Screens and interactive components
src/styles.css               Visual system
src/advisor.js               Browser → /api/advisor and /api/transcribe
src/voice.js                 Microphone recording
src/speech.js                Read-aloud
server/qwen-advisor.mjs      Qwen chat + ASR proxy
server/course-knowledge.mjs  Catalogue load, search and prompt excerpts
data/courses.json            Local snapshot of Supabase public.courses
docs/AI_INTEGRATION.md       Qwen and catalogue contract
tests/                       Node test runner
```

## Secrets and GitHub

Commit source and config: `src/`, `server/`, `data/courses.json`, `docs/`, `scripts/`, `tests/`, `index.html`, `package.json`, `.env.example`, README.

Do **not** commit `.env`, `node_modules/`, `dist/`, or API keys. The Qwen key, Supabase publishable key and any service-role key stay in `.env` only.

Frontend `VITE_*` values are public. Model credentials belong on the Vite server proxy, not in client code.

## Group members — complete before Canvas submission

| English name | Student ID | Contribution |
| --- | --- | --- |
| TODO | TODO | Frontend / UI |
| TODO | TODO | AI / backend |

This repository is the working source. Presentation slides and the final Canvas package are separate.
