import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { answerFromKnowledge, getKnowledgeCount, retrieveKnowledge } from '../server/knowledge.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return args[index + 1];
}
const runs = Number(option('--runs', '5'));
if (!Number.isInteger(runs) || runs < 1 || runs > 100) throw new Error('--runs must be an integer from 1 to 100.');
const casesPath = resolve(root, option('--cases', 'evaluation/cases.json'));
const outputPath = resolve(root, option('--output', 'artifacts/evaluation.json'));
const suite = JSON.parse(await readFile(casesPath, 'utf8'));
if (!Array.isArray(suite.cases) || !suite.cases.length) throw new Error('The evaluation suite must contain cases.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = ['server/knowledge.mjs', 'knowledge/courses.json', 'scripts/evaluate.mjs'];
const hashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(resolve(root, path)))])));
hashes[relative(root, casesPath)] = hash(await readFile(casesPath));

function visibleText(answer) {
  return [answer.text || '', ...(answer.checks || []), ...(answer.courses || []).flatMap(course => [course.code, course.title, course.reason, course.prerequisite]), ...(answer.semesters || []).flatMap(semester => [semester.title, ...(semester.courses || [])])].filter(Boolean).join('\n');
}

function evaluateCase(item, answer, retrieved) {
  const expected = item.expect;
  const checks = [];
  const check = (name, passed, actual) => checks.push({ name, passed: Boolean(passed), ...(actual === undefined ? {} : { actual }) });
  const courses = Array.isArray(answer.courses) ? answer.courses : [];
  const citations = Array.isArray(answer.sources) ? answer.sources : [];
  const codes = courses.map(course => course.code);
  const ids = retrieved.map(source => source.id);
  const text = visibleText(answer);
  check('Non-empty answer', typeof answer.text === 'string' && answer.text.trim().length > 0);
  check('Local knowledge mode', answer.mode === 'knowledge', answer.mode);
  check('Requested response language', answer.language === expected.language, answer.language);
  check('Actual prose matches language', expected.language === 'zh' ? /[\u3400-\u9fff]/.test(answer.text) : /[A-Za-z]{3,}/.test(answer.text));
  check('Citation IDs have retrieved evidence', citations.every(source => ids.includes(source.id)), citations.map(source => source.id));
  for (const code of expected.courseCodes || []) check(`Answer includes course ${code}`, codes.includes(code), codes);
  for (const code of expected.courseCodesAbsent || []) check(`Answer does not recommend ${code}`, !codes.includes(code), codes);
  for (const id of expected.retrievedIds || []) check(`Retrieves reference ${id}`, ids.includes(id), ids);
  if (expected.topSourceId) check('Top retrieval matches labeled reference', ids[0] === expected.topSourceId, ids[0] || null);
  for (const [code, credits] of Object.entries(expected.credits || {})) check(`${code} has the labeled credit value`, courses.find(course => course.code === code)?.credits === credits, courses.find(course => course.code === code)?.credits ?? null);
  for (const pattern of expected.visiblePatterns || []) check(`Visible answer supports /${pattern}/`, new RegExp(pattern, 'iu').test(text));
  for (const pattern of expected.visibleAbsentPatterns || []) check(`Visible answer excludes /${pattern}/`, !new RegExp(pattern, 'iu').test(text));
  for (const url of expected.sourceUrls || []) check('Includes the labeled source URL', citations.some(source => source.url === url), url);
  for (const name of expected.documentNames || []) {
    const documents = retrieved.filter(source => source.kind === 'document' && (source.documentName === name || source.title?.includes(name)));
    check(`Retrieves uploaded source ${name}`, documents.length > 0);
    check(`Cites uploaded source ${name}`, citations.some(source => source.kind === 'document' && documents.some(document => document.id === source.id)));
  }
  if (expected.maxCourses !== undefined) check('Respects maximum course count', courses.length <= expected.maxCourses, courses.length);
  if (expected.maxSources !== undefined) check('Respects maximum source count', citations.length <= expected.maxSources, citations.length);
  return checks;
}

function timing(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rounded = value => Number(value.toFixed(4));
  return {
    samples: values.length,
    meanMs: rounded(values.reduce((a, b) => a + b, 0) / values.length),
    p50Ms: rounded(sorted[Math.ceil(sorted.length * 0.5) - 1]),
    p95Ms: rounded(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    minMs: rounded(sorted[0]), maxMs: rounded(sorted.at(-1))
  };
}

const results = [];
const allAnswerTimes = [];
const allRetrievalTimes = [];
for (const item of suite.cases) {
  const answerTimes = [];
  const retrievalTimes = [];
  let answer;
  let retrieved;
  let checks = [];
  let failure;
  try {
    for (let run = 0; run < runs; run++) {
      const retrievalStart = performance.now();
      retrieved = await retrieveKnowledge(item.input);
      retrievalTimes.push(performance.now() - retrievalStart);
      const answerStart = performance.now();
      answer = await answerFromKnowledge(item.input);
      answerTimes.push(performance.now() - answerStart);
      // Each repetition must meet the labels; the final snapshot is retained below.
      const runChecks = evaluateCase(item, answer, retrieved);
      if (run === 0) checks = runChecks;
      else checks = checks.map((check, index) => ({ ...check, passed: check.passed && runChecks[index].passed }));
    }
  } catch (error) {
    failure = error.message;
    checks.push({ name: 'Evaluation completes without an exception', passed: false, actual: failure });
  }
  allAnswerTimes.push(...answerTimes);
  allRetrievalTimes.push(...retrievalTimes);
  const passed = !failure && checks.every(check => check.passed);
  results.push({
    id: item.id, category: item.category, description: item.description, passed,
    input: item.input, expected: item.expect, checks,
    latency: { retrieval: timing(retrievalTimes), answerIncludingRetrieval: timing(answerTimes) },
    observed: { answer: answer || null, retrieved: retrieved || [] }, ...(failure ? { failure } : {})
  });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${item.id}${passed ? '' : `: ${checks.filter(check => !check.passed).map(check => check.name).join('; ')}`}`);
}

const passed = results.filter(result => result.passed).length;
const categories = [...new Set(results.map(result => result.category))].map(category => {
  const cases = results.filter(result => result.category === category);
  return { category, passed: cases.filter(result => result.passed).length, total: cases.length };
});
const topReferenceCases = results.filter(result => result.expected.topSourceId);
const topReferenceHits = topReferenceCases.filter(result => result.observed.retrieved[0]?.id === result.expected.topSourceId).length;
const labeledReferences = results.flatMap(result => [...new Set([...(result.expected.retrievedIds || []), result.expected.topSourceId].filter(Boolean))].map(id => ({ id, found: result.observed.retrieved.some(source => source.id === id) })));
const matchedReferences = labeledReferences.filter(reference => reference.found).length;
const report = {
  schemaVersion: 1, suite: suite.suite, generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, knowledgeCount: getKnowledgeCount() },
  methodology: {
    caseFile: casesPath, runsPerCase: runs, sourceHashes: hashes,
    timingScope: 'In-process elapsed time after module import. Retrieval and answer generation are timed separately; answer time includes its own retrieval. No warm-up iterations are discarded.',
    assessmentScope: 'Labeled deterministic retrieval and extractive-answer regression checks against the curated local corpus and synthetic uploaded text. A case passes only when all assertions pass on every measured repetition.',
    excluded: ['Live LLM answer quality or hallucination rate', 'External verification of university requirements', 'HTTP/network and browser rendering latency', 'Browser microphone or speech-recognition accuracy', 'PDF/DOCX/XLSX extraction quality', 'Adversarial prompt-injection robustness beyond the single explicit fixture']
  },
  summary: {
    total: results.length, passed, failed: results.length - passed, passRate: Number((passed / results.length).toFixed(4)),
    assertionCount: results.reduce((sum, result) => sum + result.checks.length, 0),
    retrievalLabels: {
      topReference: { matched: topReferenceHits, total: topReferenceCases.length, rate: topReferenceCases.length ? Number((topReferenceHits / topReferenceCases.length).toFixed(4)) : null },
      requiredReferences: { matched: matchedReferences, total: labeledReferences.length, recall: labeledReferences.length ? Number((matchedReferences / labeledReferences.length).toFixed(4)) : null },
      note: 'These labels cover only selected required references and top-ranked references. Other retrieved entries are not exhaustively relevance-labeled, so precision and F1 are not reported.'
    },
    categories, latency: { retrieval: timing(allRetrievalTimes), answerIncludingRetrieval: timing(allAnswerTimes) }
  },
  cases: results
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(`${passed}/${results.length} cases passed. Answer p50=${report.summary.latency.answerIncludingRetrieval?.p50Ms} ms; p95=${report.summary.latency.answerIncludingRetrieval?.p95Ms} ms.`);
console.log(`Evidence: ${outputPath}`);
if (passed !== results.length) process.exitCode = 1;
