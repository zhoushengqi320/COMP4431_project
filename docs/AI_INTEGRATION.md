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
QWEN_API_KEY=sk-ws-your-key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

Restart Vite after changing `.env`. Never commit `.env`. Frontend variables are public; keep the Qwen key on the server side only.

This key is from the China (Beijing) region. Pair it with the Beijing DashScope domain above. Hong Kong / Singapore / US endpoints need a key created in that region.

`DASHSCOPE_API_KEY` is also accepted as an alias of `QWEN_API_KEY`.

Useful models: `qwen-plus` (default), `qwen-turbo`, `qwen-max`. Speech input uses `qwen3-asr-flash`.

## Course knowledge base

Answers are grounded in the team's Supabase table `public.courses` (currently 2659 PolyU courses). This is retrieval-augmented generation: relevant rows are selected for each question and attached to the Qwen prompt. The hosted Qwen weights are not fine-tuned.

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
  "model": "qwen-plus",
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
    "model": "qwen-plus",
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
    model="qwen-plus",
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
