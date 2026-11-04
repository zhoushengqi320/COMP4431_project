# Recommendation overview - 2026-11-03

Change: course recommendation replies and multi-course comparisons show a short overall explanation before the existing individual course cards and three follow-up questions. Simple single-course lookups omit the overview. The model is instructed to summarize course roles and relevance; if missing, the server builds an overview naming the grounded course cards. Overview is capped at 500 Unicode characters. This is prompt/format engineering, not model fine-tuning.

## Verification

34 automated tests pass; production build passes. Test coverage includes generated overviews, a missing-overview fallback, single-course suppression, and retention of cards/questions.

Live qwen-plus observation: HTTP 200, 37412 ms, 9 cards, overview present: True, 3 questions. Full question and response are in course-format-after-recommendation-overview.json.

The live sample generated seven recommended courses plus two extra courses from an unwanted semester plan. After this observation the normalizer was changed to ignore incidental semester entries when explicit course cards already exist. The regression case confirms that only the explicitly recommended courses remain; semester-only payload fallback remains supported. The recorded API output precedes this final normalization change and is preserved unchanged.

This single example does not establish recommendation quality, a speed improvement or factual accuracy of all generated prose. Token usage and cost were not captured.
