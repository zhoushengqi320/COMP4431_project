# PolyPath reference set

`courses.json` is a small, curated snapshot of **9 PolyU Computing subjects and 3 advising references**, checked against official PolyU pages on **3 November 2026**. It supports a focused academic advising demonstration. It is not the university's complete catalogue, an enrolment service, a current timetable or an official graduation audit.

English descriptions are brief paraphrases; Chinese descriptions are explanatory translations of those paraphrases. The source title, URL, document version and verification date remain available in every retrieved official chunk. The source PDFs are linked rather than redistributed.

| Reference | Official source | Source version |
| --- | --- | --- |
| COMP2011 — Data Structures | [Subject description](https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP2011.pdf) | July 2025 |
| COMP2021 — Object-oriented Programming | [Subject description](https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP2021.pdf) | July 2025 |
| COMP2322 — Computer Networking | [Subject description](https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP2322.pdf) | July 2025 |
| COMP2411 — Database Systems | [Subject description](https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP2411.pdf) | July 2025 |
| COMP3011 — Design and Analysis of Algorithms | [Subject description](https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP3011.pdf) | July 2025 |
| COMP3421 — Web Application Design and Development | [Subject description](https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP3421.pdf) | July 2025 |
| COMP4423 — Computer Vision | [Subject description](https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP4423.pdf) | July 2025 |
| COMP4431 — Artificial Intelligence | [Subject description](https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP4431.pdf) | July 2025 |
| COMP4432 — Machine Learning | [Subject description](https://www.polyu.edu.hk/comp/docdrive/ug/subject/COMP4432.pdf) | **July 2021** |
| Scheme credit requirements | [Department FAQ](https://www.polyu.edu.hk/comp/study/ug-programmes/scheme-in-computing-and-ai/jupas-faq/) | Web page checked 2026-11-03 |
| Work-Integrated Education | [Department FAQ](https://www.polyu.edu.hk/comp/study/ug-programmes/scheme-in-computing-and-ai/jupas-faq/) | Web page checked 2026-11-03 |
| Subject directory and scope | [Official directory](https://www.polyu.edu.hk/comp/study/ug-programmes/scheme-in-computing-and-ai/subjects/) | Web page checked 2026-11-03 |

The public COMP4432 document is older than the other course descriptions. Responses disclose that date and direct the student to confirm any later changes. Recommendations do not turn recommended mathematical preparation into mandatory prerequisite courses. COMP4423's ENG2002 alternative is qualified for EEE students, as in its source.

## Retrieval and local answers

`server/knowledge.mjs` exports:

```js
retrieveKnowledge({ message, history = [], profile = {}, documents = [] });
answerFromKnowledge({ message, history = [], profile = {}, documents = [] });
getKnowledgeCount();
// KNOWLEDGE_COUNT is also exported.
```

The retrieval engine performs actual TF-IDF vector construction and cosine similarity over the curated references and extracted uploaded text. It supplements lexical retrieval with explicit course-code matching and English/Chinese topic aliases. Course codes constrain the result set: a missing code is not replaced by another subject. Specific previous course references, first/second references and saved interests can resolve short follow-up questions; ambiguous singular references ask for clarification.

When the server has `SUPABASE_URL` and a publishable/anon key, `server/course-catalogue.mjs` reads `public.courses` once at startup and calls `setRemoteCourses()`. Curated entries win on code overlap. Remote-only codes become answerable; topic ranking of the nine official Computing PDFs stays on the curated corpus so their tests and citations do not change. This is retrieval, not model fine-tuning.

The local answer path composes facts from retrieved entries, prerequisite relationships and relevant uploaded excerpts. It is a deterministic extractive system, **not a fine-tuned language model or vector database**. When a separately configured LLM is used by the server, the same chunks can ground its input and citations. The local path remains usable without an API key.

Every source chunk has `id`, `title`, `text`, `kind` and `score`. Official entries additionally have `url`, `version`, `verifiedAt`, and `code` for subjects. Local responses provide `text`, optional `courses` and `checks`, `sources`, `followUps`, `mode: 'knowledge'`, `language`, `evidence` and retrieval metadata. Every displayed source points to a retrieved evidence ID.

## Uploaded documents and boundaries

The document parser passes `documents: [{ name, text, category }]`. Filenames without extracted text are not evidence. The engine limits file text, splits it into bounded chunks and creates stable IDs from content hashes. Uploaded material is labelled **user-supplied and not independently verified** and cannot create an official course fact, source URL, graduation approval or enrolment decision. Obvious assistant-directed instruction lines are excluded; remaining text is quoted as data, never evaluated as commands. This filtering is an additional precaution, not a claim that arbitrary uploaded content can be made trustworthy.

The local engine can explain known prerequisite dependencies, not issue a semester-by-semester schedule from unverified offerings. It cannot determine passed credits, approved equivalents, excluded courses, programme exceptions, transfer approvals or graduation eligibility from an unstructured transcript. It does not infer assessment weightings, instructors, difficulty or a live offering from a catalogue entry. Unsupported questions ask for the missing course description or applicable handbook.

## Maintaining the snapshot

Open each official URL before updating its entry. Preserve conditional requirements, exclusions and the document's own version. Change `verifiedAt` only after checking the underlying sources. Keep summaries concise and paraphrased. Add a regression case for new topics and prerequisite edge cases, then run:

```sh
node --test tests/knowledge.test.mjs
```

The separate evaluation report records the implemented evaluation cases and actual run results; the source count or unit-test pass count is not a measure of answer quality on arbitrary questions.
