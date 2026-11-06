# PolyPath evaluation

The local knowledge advisor passed **24 of 24 labeled regression cases** on 3 November 2026. These results evaluate deterministic retrieval and extractive answers against the curated reference set and synthetic uploaded text. They do **not** measure live LLM quality, institutional advising accuracy, or browser speech recognition.

The reproducible evidence is in [`../artifacts/evaluation.json`](../artifacts/evaluation.json), including every input, expectation, assertion, retrieved passage, answer, timing summary, runtime version, and source-file SHA-256. The labels are maintained separately in [`../evaluation/cases.json`](../evaluation/cases.json); the runner is [`../scripts/evaluate.mjs`](../scripts/evaluate.mjs).

## Run the evaluation

Use Node.js 24 or later from the project directory:

```sh
node scripts/evaluate.mjs
```

No account, API key, network connection, or running HTTP server is required. The command writes `artifacts/evaluation.json` and exits with a nonzero status if any case fails. It does not modify the knowledge engine or course corpus.

Options allow more repetitions or a separate output artifact:

```sh
node scripts/evaluate.mjs --runs 20 --output artifacts/evaluation-repeat.json
```

`--runs` accepts 1–100; the default is 5. A custom labeled suite can be passed with `--cases path/to/cases.json`. Output timings vary by machine and process state; rerun the suite after changing the engine or corpus rather than copying this report's measurements.

## Coverage and assertions

The suite contains 18 English and 6 Chinese cases, including Traditional Chinese vocabulary. Course and policy expectations are anchored to the project's dated, partial `knowledge/courses.json` reference set. Uploaded documents are clearly labeled synthetic fixtures, not student records or university policy.

| Category | Passed / total | What is checked |
| --- | ---: | --- |
| Exact course facts | 4 / 4 | Named course, normalized code, credits, prerequisite alternatives, and dated reference caveat |
| Bilingual topic retrieval | 5 / 5 | SQL, web development, machine learning, networking, and computer vision |
| Conversation continuity | 3 / 3 | Single referent, second-course referent, and clarification of an ambiguous pronoun |
| Profile context | 1 / 1 | Recommendations grounded in supplied academic interests |
| Policy and uncertainty | 3 / 3 | Credit-total caveat, WIE hours, and refusal to confirm live semester offerings |
| Abstention | 3 / 3 | Unknown course code and out-of-domain questions in English and Chinese |
| Uploaded source retrieval | 5 / 5 | Unique English/Chinese facts, missing evidence, unreadable text, and one explicit document-instruction fixture |

There are **217 assertions per full pass**, each checked across all 5 repetitions. Checks include expected course codes and facts, required and top-ranked source IDs, source URLs, uploaded-document attribution, response language, and absence of invented course cards or irrelevant citations for abstention cases. A citation must correspond to a passage actually retrieved during the case. An answer passing only some assertions does not count as a passed case.

The first run exposed a real failure: the phrase “the 2022” in a World Cup question was parsed as the course `THE2022`. The engine owner corrected course-code recognition while preserving lowercase/spaced legitimate codes. The original evaluation label was retained, and the final run passed it. This is a regression suite used to find concrete failures, not a held-out benchmark after development.

## Recorded result

The recorded run below completed at `2026-11-03T12:10:56.949Z`, with Node.js `v24.16.0` on macOS arm64, using 12 reference entries and 5 repetitions per case. The JSON artifact records the latest execution; later reruns can legitimately have different timings.

| Metric | Observed result |
| --- | ---: |
| Cases passing every assertion on every repetition | 24 / 24 (100%) |
| Correct top-ranked reference, where explicitly labeled | 10 / 10 |
| Required case/source pairs retrieved | 14 / 14 |
| Measured retrieval calls | 120 |
| Measured answer-generation calls | 120 |
| Retrieval median / 95th percentile | 0.6925 ms / 1.0032 ms |
| Answer median / 95th percentile | 0.7000 ms / 1.0275 ms |
| Retrieval mean / maximum | 0.7245 ms / 8.3222 ms |
| Answer mean / maximum | 0.6773 ms / 2.3423 ms |

Timings use `performance.now()` inside the Node process after module import. Retrieval and answer generation are timed separately; answer generation includes its own retrieval. No warm-up iterations are discarded. The measurements exclude process startup, corpus loading, HTTP/network transport, file extraction, browser rendering, and external model inference. They are not end-to-end user response times.

The required-reference measure counts labeled case/source pairs, including repeated use of a source in different cases. It is not an exhaustive relevance judgment of every retrieved passage. Retrieval precision and F1 are therefore not reported. Similarly, the 100% regression pass rate does not imply 100% correctness on arbitrary student questions.

## Limits and remaining evaluation

The suite checks consistency with a small, dated source collection; it does not independently re-audit the official documents. Programme/cohort rules, course equivalence, enrolment availability, and personal graduation eligibility still require authoritative review. The synthetic upload cases begin with already extracted text, so they do not validate PDF, DOCX, XLSX, or OCR extraction.

Live DeepSeek responses were not scored by this runner. Evaluating them requires recording the model/version and prompt, running the same questions with cited evidence, and having reviewers assess factual support, completeness, useful uncertainty, and citation correctness. Keep those results separate from the deterministic results above.

Browser microphone permission, speech-to-text accuracy, read-aloud quality, accessibility, and complete user flows are also outside this harness. They require browser/device testing with stated conditions. The single explicit instruction-filter fixture is a narrow regression check; it is not evidence of comprehensive prompt-injection resistance.

## Browser integration verification (3 November 2026)

A separate local browser check verified registration, saved-profile persistence after refresh, logout, rejection of an incorrect password and subsequent successful login. The responsive workspace was visually inspected at narrow viewport widths (approximately 336 and 585 CSS pixels). These observations are separate from the numerical retrieval evaluation.

The running environment already supplied a server-side DeepSeek key. One real online question — “What does COMP4431 cover, and what are its prerequisites?” — completed successfully through the application. The returned answer displayed the course content, prerequisite alternatives, uncertainty notes and an expandable official source link. This is an integration smoke check, not a statistically meaningful assessment of model answer quality. No credential is stored in this report, frontend bundle or source ZIP.

Actual microphone capture and audible playback were not exercised; only their automated state and error-handling tests were run. Device-specific voice availability and recognition quality still need a real-device check. The production entry point was also started against the built frontend and its root/session/protected-status/static-denial routes were checked over HTTP. That status check predates guest mode; the current status endpoint permits guests, while account and profile endpoints still require authentication.
