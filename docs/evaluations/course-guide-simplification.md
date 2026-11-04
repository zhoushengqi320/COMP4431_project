# Course guide simplification - 2026-11-03

This iteration changes prompts, response normalization and presentation; no model training or fine-tuning was performed. Earlier experiment files are retained.

## Implemented

- Larger basic information and objectives, burgundy course badge, soft header background, gold rating panel, numbered sections and responsive Level chips.
- Faculty, school ID and record ID are removed from visible cards. Metadata remains in internal response data.
- Missing-rating disclosure shortened to Example / 示例, rather than hiding that the value is synthetic.
- Beginner-oriented summary instructions plus a small deterministic glossary for common Chinese computing jargon; overview remains capped at 500 Unicode characters. Course objectives and raw conditions are not rewritten.
- One Suggested preparation / 建议先修 heading, grouped by first digit of the course code. Original prerequisite text is retained below the groups because regrouping by Level alone loses AND/OR relationships. No change to the official eligibility rules is implied.
- Course responses omit repeated prose, semesters, checks, sources, playback, feedback and follow-up suggestions. This also means a course reply containing a semester plan no longer renders the separate plan panel.
- Attachment/profile indicators and composer footer removed; profile/document management remains on its own page, and voice input remains available.

## Automated and API observations

31 automated tests passed; production build passed. Paired questions use qwen-plus and the same 2659-course local snapshot. The table is a tiny observed sample, not a general quality or latency benchmark.

| Question | HTTP | Latency (ms) | Overview characters | Level groups |
| --- | ---: | ---: | ---: | --- |
| 请问Comp4431是什么课 | 200 | 3805 | 193 | 2 |
| 请介绍DSAI2201，包括必要先修和建议先修 | 200 | 10159 | 139 | 1, 2, 3 |

Full responses: course-format-after-simplified-plain.json. Interim observations are in the simplified and simplified-final files. UI/browser calls are additional development checks and are not included in the paired table. No token usage, costs, real student reviews or user satisfaction data were collected.

## Limits

The simple glossary cannot guarantee every course explanation is beginner-friendly, or validate all generated prose. Synthetic scores are interface examples, not measured course quality. This project still uses a hosted base model with retrieval, not a fine-tuned checkpoint.
