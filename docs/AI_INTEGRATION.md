# Qwen API integration

PolyPath talks to [Qwen on Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions) through an OpenAI-compatible Chat Completions endpoint. The browser never sees the API key. Vite proxies `/api/advisor` to Qwen.

Official references:

- First call: https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen
- OpenAI-compatible chat: https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions
- API keys (`sk-ws-…`): https://www.alibabacloud.com/help/en/model-studio/get-api-key
- Endpoints by region: https://www.alibabacloud.com/help/en/model-studio/base-url

## Local configuration

Copy `.env.example` to `.env`:

```dotenv
VITE_ADVISOR_API_URL=/api/advisor
QWEN_API_KEY=your-bailian-api-key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen3-8b-01fa13690bf1
```

This workspace stores its deployment selection in `.env.local`; it overrides matching `.env` values. Edit that file to change the model, and restart Vite after configuration changes. Never commit `.env`. Frontend variables are public; keep the Qwen key on the server side only.

This key is from the China (Beijing) region. Pair it with the Beijing DashScope domain above. Hong Kong / Singapore / US endpoints need a key created in that region.

`DASHSCOPE_API_KEY` is also accepted as an alias of `QWEN_API_KEY`.

The v8 fine-tuned deployment invocation code is `qwen3-8b-01fa13690bf1`, associated with training output `qwen3-8b-ft-202611040019-7fc7`. Use an API key from the owning Beijing workspace. Speech input uses `qwen3-asr-flash`. If QWEN_MODEL is omitted, the server fallback remains `qwen-plus`.

## Course knowledge base

Answers are grounded in the team's Supabase table `public.courses` (currently 2659 PolyU courses). Relevant rows are selected for each question and attached to the prompt. The v8 LoRA fine-tuned model learns the answer structure; retrieval continues supplying course facts. Training success is separate from independent answer-quality evaluation.

Snapshot: `data/courses.json`. Refresh from Supabase:

```sh
npm run sync:courses
```

Runtime also reloads from Supabase when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in `.env`. Keep those values out of git.

## How the proxy calls Qwen

`POST /api/advisor` (from the UI) is translated to:

```http
POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
Authorization: Bearer $QWEN_API_KEY
Content-Type: application/json
```

```json
{
  "model": "qwen3-8b-01fa13690bf1",
  "stream": false,
  "enable_thinking": false,
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "PolyPath academic advisor prompt…" },
    { "role": "user", "content": "Student question, profile and document text" }
  ]
}
```

Equivalent curl (do not put a real key in shared notes):

```sh
curl https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
  -H "Authorization: Bearer $QWEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-8b-01fa13690bf1",
    "stream": false,
    "enable_thinking": false,
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello"}
    ]
  }'
```

Python:

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["QWEN_API_KEY"],
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
response = client.chat.completions.create(
    model="qwen3-8b-01fa13690bf1",
    extra_body={"enable_thinking": False},
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello"},
    ],
)
print(response.choices[0].message.content)
```

## Request from the UI: multipart/form-data

| Field | Format | Meaning |
| --- | --- | --- |
| `message` | string | Latest user question |
| `history` | JSON string | Earlier messages |
| `profile` | JSON string | programme, year, semester, graduation, interests |
| `documents` | repeated file field | Base documents |
| `attachments` | repeated file field | Files attached to this message |

The adapter does not set Content-Type manually. Text files (`.txt`, `.csv`, `.md`, `.json`) are inlined into the Qwen prompt. PDF/DOCX/XLSX are currently listed by filename only.

## Response shown in the UI: application/json

### Three-course recommendation batches

Recommendation replies contain at most three course cards. The server enforces this even when the model overproduces; if truncation makes the model overview refer to omitted courses, it uses a matching fallback overview. Single-course lookup behavior remains unchanged.

The model can nominate other genuinely related retrieved records in `moreCourseCodes`. Only valid, unseen, undisplayed codes survive as `recommendationContext.reserveCodes`. `moreCourses` is emitted only when this reserve is nonempty; its `prompt` powers a final Explore more courses button after follow-up questions. It is omitted when no further suitable records have been identified. This does not imply an exhaustive search of every course.

The client already sends full previous messages as history. On continuation the backend recovers the original query and the seen codes from `recommendationContext`, excludes those codes before retrieval limits, and returns up to three new courses. A fresh recommendation request starts a fresh context. If the model repeats previous courses or omits cards, verified reserve records can supply a fallback batch. Automated tests cover 3+3+1 pagination, exhaustion, unknown reserve-code rejection and retrieval exclusions.

### Recommendation summaries

For course recommendations or multiple course cards, the response includes `overview` (up to 500 Unicode characters), displayed before all cards. It explains which courses are recommended and their roles. Single-course lookups omit it. Missing model overviews fall back to an authoritative list of the course codes/titles. Incidental semester entries do not add extra cards when explicit course recommendations already exist. Follow-up questions remain below the cards. See `docs/evaluations/course-recommendation-overview.md`.

### Current compact course guide

Course replies now display cards and three clickable follow-up questions: larger basic information/objectives, rating, beginner overview, then Suggested preparation grouped by course-code Level. Faculty/school/record IDs, duplicate prose and auxiliary panels are hidden. Cards additionally contain `learningOutcomes`, up to four skills grounded in course records, shown below the original objectives. The server preserves `followUps` (three questions, with course-specific fallbacks) and omits other auxiliary fields for replies with grounded courses; non-course replies retain their normal payload. `prerequisiteLevels` contains `{ level, courses }` groups. Original conditions remain visible below the groups to preserve AND/OR relationships. Missing-rating attribution is the short Example / 示例 badge. Composer attachment/profile indicators and footer are removed. Details and observations: `docs/evaluations/course-guide-simplification.md`.

The following section describes the initial schema; the compact guide above supersedes its original display order and auxiliary-panel behavior.

### Standard course introductions (course-introduction-v1)

Whenever the model introduces a course, it returns a `courses` entry with `code` and a grounded `summary` (at most 500 characters). The server fills authoritative metadata from retrieved catalogue rows. The UI presents each course in this order:

1. Code, official title, department, level, credits, faculty, school ID, record ID, objectives, rating.
2. Course overview (maximum 500 Unicode characters).
3. Required and recommended prerequisites, always visible, preserving original AND/OR relationships.

Each normalized card has `format: "course-introduction-v1"`, `language`, `code`, `title`, `department`, `level`, `credits`, `faculty`, `schoolId`, `id`, `objectives`, `rating`, `ratingSource`, `summary`, `requiredPrerequisites`, `recommendedPrerequisites`, plus compatibility fields `reason` and `prerequisite`. Missing factual values are explicitly marked unavailable. Missing recommended prerequisites are unknown, not no requirements. The raw prerequisite text remains in `prerequisite`.

`ratingSource` is `catalogue` for valid catalogue `rating` values (0-5); otherwise it is `simulated`. Simulated values are randomly selected in 0.1 steps between 4.0 and 5.0 inclusive, stable per course within the server process, always labelled as simulated/non-student reviews, and never saved to the course database. Record IDs are never invented. Optional id/rating columns are retained from live Supabase rows; the current local snapshot lacks them.

Additional advice appears after course cards. The legacy payload below remains supported for demo examples. This change is prompt/response engineering, not fine-tuning. Experiment data is recorded in `docs/evaluations/`.

`text` is required. Other keys are optional.

```json
{
  "text": "Explain the recommendation and any limitations here.",
  "courses": [
    {
      "code": "COURSE_CODE",
      "title": "Official course title",
      "credits": 3,
      "tag": "Recommended elective",
      "reason": "Why it matches the student.",
      "prerequisite": "Verified prerequisites, or clearly state unknown."
    }
  ],
  "semesters": [
    {
      "title": "Year 3 · Semester 1",
      "credits": 15,
      "courses": ["COURSE_CODE · Official course title"]
    }
  ],
  "checks": ["Prerequisites: not verified against an official handbook"],
  "sources": [
    {
      "title": "Programme handbook",
      "detail": "Document/page/section and the relevant evidence.",
      "url": "https://www.polyu.edu.hk/"
    }
  ],
  "followUps": ["Can I reduce next semester's workload?"]
}
```

Non-2xx responses show an error. Requests time out after 60 seconds.

## Voice input: Qwen-ASR

The microphone records in the browser with `MediaRecorder`. On stop, the UI posts the clip to `/api/transcribe`, which calls [Qwen3-ASR-Flash](https://help.aliyun.com/en/model-studio/qwen-asr-api-reference):

```http
POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
Authorization: Bearer $QWEN_API_KEY
Content-Type: application/json
```

```json
{
  "model": "qwen3-asr-flash",
  "stream": false,
  "asr_options": { "language": "zh", "enable_itn": true },
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_audio",
          "input_audio": { "data": "data:audio/webm;base64,..." }
        }
      ]
    }
  ]
}
```

Language hints: Mandarin `zh`, Cantonese `yue`, English `en`. The recognised text is placed in the composer for review; it is not sent to the advisor until the student clicks Send.

Set `QWEN_ASR_MODEL=qwen3-asr-flash` in `.env` if you need to override the default.

## Manual checklist

1. Set `.env`, restart `npm run dev`, confirm the top-right badge says Connected advisor.
2. Send a short question and confirm a Qwen-generated `text` reply.
3. Return a non-2xx (invalid key) and confirm the UI error.
4. Start a slow request, then New Chat; confirm the previous reply does not appear.
