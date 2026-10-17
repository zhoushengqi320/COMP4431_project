# AI backend integration

## Configuration

Copy `.env.example` to `.env` and set:

```dotenv
VITE_ADVISOR_API_URL=http://127.0.0.1:8000/api/advisor
```

This URL is a proposed contract, not an existing service. The adapter sends a POST request to the exact configured URL. Restart Vite after configuration. The UI then switches from demo mode to connected mode. Allow the Vite origin in your backend CORS configuration. Put model credentials on the backend only.

## Request: multipart/form-data

| Field | Format | Meaning |
| --- | --- | --- |
| `message` | string | Latest user question |
| `history` | JSON string | Earlier messages, with role/text and optional structured answer fields; excludes the current question |
| `profile` | JSON string | programme, year, semester, graduation (YYYY-MM), interests |
| `documents` | repeated file field | All currently selected base documents, resent on each request |
| `attachments` | repeated file field | Files attached to this message only |

The browser sets the multipart boundary. Do not manually set Content-Type in the adapter. Base document categories are currently a UI-only organisation; if your backend needs them, extend the adapter with a parallel metadata field. For production, consider upload IDs/deduplication rather than resending files.

File selection accepts `.pdf`, `.csv`, `.txt`, `.docx`, `.xlsx`, at most 10 MB each. This is a browser convenience check; backend validation, file-count/request-size limits, document extraction, security and storage are the backend's responsibility. There is no authentication, server storage, streaming or document indexing in this frontend.

## Response: application/json

`text` is required and must be a nonempty string. All other keys are optional. Omit unavailable sections; do not fabricate verification or citations.

```json
{
  "text": "Explain the recommendation and any limitations here.",
  "courses": [
    {
      "code": "COURSE_CODE",
      "title": "Official course title",
      "credits": 3,
      "tag": "Recommended elective",
      "reason": "Why it matches the student's interests and background.",
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
  "checks": ["Prerequisites: verified against the uploaded handbook", "Semester availability: awaiting confirmation"],
  "sources": [
    {
      "title": "Programme handbook, section 4.2",
      "detail": "Document/page/section and the relevant evidence.",
      "url": "https://www.polyu.edu.hk/"
    }
  ],
  "followUps": ["Can I reduce next semester's workload?"]
}
```

The URL above is a format example, not evidence for any course. Supply a specific real source only when relevant. The UI accepts HTTP(S) links and displays all answer text as plain text, not HTML or Markdown. If the backend returns Markdown, add an appropriately sanitised renderer rather than injecting HTML.

Non-2xx responses display an error and restore the user's question and attachments for retry. Requests time out after 60 seconds. New Chat cancels an active request. The backend should avoid double-processing repeated requests and consider a request ID if necessary.

## Extension points for assessment

- **Knowledge grounding:** populate `sources` with real document/page references and retrieval evidence.
- **Planning reliability:** populate `checks` after checking completed courses, prerequisites, credits and confirmed semester availability. Distinguish verified, unknown and conflicting information.
- **Evaluation:** wire the local feedback controls to your evaluation endpoint, with a response ID. No feedback is currently transmitted or aggregated.
- **Presentation:** use real course and graduation data after integration; retain honest unknown states when evidence is missing.
- **Voice input:** browser speech recognition is implemented in `src/voice.js`. The final transcript becomes an editable draft and is sent through the same text request contract after the user presses Send. Audio is not sent to this AI endpoint. Speech synthesis and avatars are not implemented.

## Manual integration checklist

1. Inspect one multipart request; confirm profile and both file categories reach the server.
2. Return a text-only response, then a full structured response; confirm both render.
3. Return a non-2xx response, an empty response and a slow response; confirm visible errors and recovery.
4. Start a slow request, then New Chat; confirm the previous response does not appear in the new conversation.
5. Check actual prerequisites, credit totals and citations against official documents before presenting them as verified.
