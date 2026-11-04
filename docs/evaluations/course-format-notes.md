# Course introduction format experiment

Recorded: 2026-11-03 (Asia/Shanghai). This is prompt engineering, catalogue retrieval and response normalization, NOT fine-tuning. No model parameters were trained.

## Baseline and change

Baseline: generic text plus cards containing code, title, credits, tag, reason and a collapsed prerequisite paragraph. No department/level/objectives/rating sections. Prerequisite excerpts were truncated at 280 characters. Course-code extraction used Unicode-hostile word boundaries that could miss codes touching Chinese characters.

Change: fixed course presentation order: verified basic fields and objectives, rating with provenance, overview of at most 500 Unicode characters, required prerequisites, recommended prerequisites. All introduced courses are requested as structured cards, including comparisons and semester recommendations. Metadata is copied on the server from retrieved catalogue rows rather than trusted from model output. Overlong overviews are capped. Unsupported model-generated cards are dropped. Explicit valid codes receive a card even when the model omits it. Chinese-adjacent codes are extracted correctly. Follow-up retrieval can use the previous user question.

Prerequisites keep original alternatives/conjunctions. Explicit recommended/required labels are separated. Missing recommended information remains unknown, not 'none'. The DSAI2201 snapshot only labels the combined conditions as prerequisites, so all three groups remain under required; no recommended group is invented.

Missing IDs are displayed as unavailable. Live catalogue fetching now retains optional id/rating fields if present. Missing/invalid ratings are simulated using random integers 40..50 divided by 10, shown to one decimal place and labelled 'Simulated; not student reviews'. Per-course values remain stable for the server process lifetime; restart may change them. No simulated values are written to Supabase or the snapshot.

## Live paired observations

Model: qwen-plus. Both stages use the same local snapshot (2659 records), same questions, no profile/history, one call per question per stage. Four calls total. Results are observations of this tiny sample, not an accuracy benchmark or proof of general improvement. Model sampling and network latency are uncontrolled.

| Question | Before latency (ms) | After latency (ms) | Before structured v1 | After structured v1 |
| --- | ---: | ---: | --- | --- |
| 请问Comp4431是什么课 | 9719 | 10766 | No | Yes |
| 请介绍DSAI2201，包括必要先修和建议先修 | 14038 | 14194 | No | Yes |

Both stages: HTTP 200 for 2/2 calls. After: one grounded course card per question; COMP4431 summary 500-character limit satisfied; DSAI2201 summary limit satisfied and all nine prerequisite codes preserved. Missing recommended background and IDs are explicitly unavailable. Neither baseline nor after observations establish factual accuracy of all generated prose. The baseline already preserved DSAI2201 prerequisites in this sample; do not claim that this example fixed a baseline factual error.

Mean latency: before 11878.5 ms; after 12480 ms (about 5.1% higher). No speed improvement observed. Token usage and billing were not captured; do not infer costs.

Full questions, outputs, timestamps and latencies: `course-format-before.json` and `course-format-after.json` beside this file. Synthetic ratings in those outputs are examples, not student feedback.

## Automated verification

`npm test`: 28/28 pass, including 9 new tests covering Chinese code retrieval, authoritative metadata, prerequisite group preservation, required/recommended separation, simulated/real rating handling, summary limits, ungrounded course rejection, semester cards and narration. `npm run build`: pass.

Automated tests check software behavior, not all language-model claims. Two live calls after modification verify actual Qwen-to-normalizer integration. Browser visual inspection has not been performed. No user-feedback study, training run, fine-tuned model or learning curves are part of this experiment.

## Reproduce

From the project folder with a working Qwen `.env`: `node scripts/evaluate-course-format.mjs after`. This makes two real API requests and overwrites the after-results file. The `before` artifact was captured before editing the prompt/backend; running `before` now would label the current code as before, so do not use it as a historical reproduction. Restore the earlier implementation before collecting a new baseline. The evaluation intentionally disables live Supabase reads for catalogue consistency.

## Presentation wording

We standardized course introductions using structured generation plus server-side catalogue validation. This separates generated explanations from authoritative course metadata, preserves prerequisite logic, and explicitly labels synthetic ratings. Two paired examples returned the expected format; a larger independent evaluation is needed to assess factual accuracy and generalization.
