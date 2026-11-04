# Three-course recommendation batches - 2026-11-03

Type: prompt/response/UI update; not model fine-tuning.

Implemented: at most three recommendations per response, matching overview, and a final clickable more-courses prompt only when verified additional candidate records exist. Follow-up requests reuse the original learning topic and exclude previously shown codes. A new topic resets the batch context. Model-nominated reserves are validated against retrieved rows; this is not proof that all available courses were found.

Verification: 37 automated checks passed; production build passed. Checks cover overflow, fabricated reserve codes, no-more state, 3+3+1 continuation without duplicates, new-topic reset and exclusion before retrieval limiting.

## Live paired conversation

Model: qwen-plus. Catalogue: fixed local snapshot. No student profile or uploaded documents. Two calls, using the first answer as history for the second.

| Turn | HTTP | Time (ms) | Courses | More prompt |
| --- | ---: | ---: | --- | --- |
| Initial machine-learning recommendations | 200 | 23183 | COMP4432, AMA4680, COMP5541 | True |
| Continue same topic | 200 | 21688 | DSAI4203, AMA573, EIE4121 | True |

Repeated course codes between turns: 0.

Raw records: course-format-after-three-course-limit.json and course-more-followup.json. This small test demonstrates response limits and continuation behavior, not general recommendation relevance or factual accuracy. Token usage and costs were not captured. Browser visual verification was not performed for this iteration.
