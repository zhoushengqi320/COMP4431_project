# Learning outcomes and follow-up restoration - 2026-11-03

Change type: prompt, response normalization and UI refinement; not model fine-tuning.

- Restored three clickable follow-up questions below course cards. Blank/duplicate questions are removed; missing suggestions are filled with course-specific defaults. Questions without a course code are prefixed with the current course code so retrieval retains context.
- Expanded the learning objectives section with a separate skills checklist (up to four items), generated from catalogue description/objectives/teaching information. The original objectives are retained. If the model omits the checklist, catalogue headings or sentences are used as fallback.
- Added two automated cases for follow-up defaults and learning-outcome validation. All 33 tests pass; production build passes.

## Live observations

Both API calls use qwen-plus and the local snapshot, with no profile/history. These are two example observations, not general accuracy evidence. The course-code prefix improvement was made after collecting these API examples and is covered by automated verification.

| Question | HTTP | Latency (ms) | Skills | Questions |
| --- | ---: | ---: | ---: | ---: |
| 请问Comp4431是什么课 | 200 | 10011 | 4 | 3 |
| 请介绍DSAI2201，包括必要先修和建议先修 | 200 | 13202 | 4 | 3 |

Full outputs: course-format-after-outcomes-followups.json. No token usage or billing data captured. Generated skills and questions still require factual review; they do not establish official eligibility or a guaranteed learning outcome.
