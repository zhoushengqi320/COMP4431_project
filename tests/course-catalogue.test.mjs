import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFromKnowledge, getKnowledgeCount, retrieveKnowledge, setRemoteCourses, KNOWLEDGE_COUNT } from '../server/knowledge.mjs';
import { fetchPublicCourses, mapCatalogueRow, mapCatalogueRows, probeCatalogue, readSupabaseConfig, startCatalogueRefresh, subjectCodesIn } from '../server/course-catalogue.mjs';

function fakeJwt(role) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `${header}.${payload}.x`;
}

const remoteCourse = {
  id: 'supabase-ABCT1D01',
  kind: 'course',
  code: 'ABCT1D01',
  aliasCodes: ['FSN1D01'],
  title: 'Introductory Food Science',
  titleZh: 'Introductory Food Science',
  credits: 3,
  level: 1,
  summary: 'Introduces laboratory methods used in food analysis.',
  summaryZh: 'Introduces laboratory methods used in food analysis.',
  prerequisite: 'Not stated in the catalogue record.',
  prerequisiteZh: '课程目录未写明先修要求。',
  prerequisiteAny: [],
  topics: [],
  aliases: ['Introductory Food Science', 'ABCT'],
  version: 'PolyU catalogue',
  verifiedAt: '2026-11-04',
  source: 'supabase'
};

test.afterEach(() => setRemoteCourses([]));

test('subject codes split dual catalogue identifiers', () => {
  assert.deepEqual(subjectCodesIn('FSN4421:ABCT4421'), ['FSN4421', 'ABCT4421']);
  assert.deepEqual(subjectCodesIn('AAE1BN01V'), ['AAE1BN01V']);
  assert.deepEqual(subjectCodesIn('AMA 502'), ['AMA502']);
});

test('mapCatalogueRow keeps a dual code and inferred topics', () => {
  const entry = mapCatalogueRow({
    code: 'COMP4432:DSAI4432',
    name: 'Machine Learning',
    department: 'comp',
    faculty: 'eng',
    credits: '3.0',
    level: '4',
    description: 'Supervised and unsupervised machine learning models.',
    prerequisites: 'COMP2011 or COMP2013'
  }, { verifiedAt: '2026-11-04' });
  assert.equal(entry.code, 'COMP4432');
  assert.deepEqual(entry.aliasCodes, ['DSAI4432']);
  assert.equal(entry.credits, 3);
  assert.ok(entry.topics.includes('machine_learning'));
  assert.deepEqual(entry.prerequisiteAny, ['COMP2011', 'COMP2013']);
  assert.equal(entry.source, 'supabase');
});

test('readSupabaseConfig accepts only HTTPS origins and public keys', () => {
  const url = 'https://example.supabase.co';
  assert.deepEqual(readSupabaseConfig({ SUPABASE_URL: url, SUPABASE_ANON_KEY: 'sb_publishable_abcdefgh' }), { url, key: 'sb_publishable_abcdefgh' });
  assert.equal(readSupabaseConfig({ SUPABASE_URL: 'http://example.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_abcdefgh' }), null);
  assert.equal(readSupabaseConfig({ SUPABASE_URL: url, SUPABASE_ANON_KEY: fakeJwt('service_role') }), null);
  assert.ok(readSupabaseConfig({ SUPABASE_URL: url, SUPABASE_ANON_KEY: fakeJwt('anon') }));
});

test('fetchPublicCourses paginates a public read and never sends a user JWT', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const offset = Number(new URL(url).searchParams.get('offset'));
    const rows = offset === 0
      ? [{ code: 'ABCT1D01', name: 'Food Science', description: 'Food analysis.' }]
      : [{ code: 'COMP1001', name: 'Problem Solving', description: 'Programming fundamentals.' }];
    return new Response(JSON.stringify(offset === 0 ? rows.concat(Array.from({ length: 999 }, (_, index) => ({ code: `ZZZZ${String(index).padStart(4, '0')}`, name: 'Pad' }))) : rows), {
      headers: { 'Content-Type': 'application/json' }
    });
  };
  const rows = await fetchPublicCourses({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_abcdefgh'
  }, { fetchImpl, pageSize: 1000 });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/rest\/v1\/courses\?/);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sb_publishable_abcdefgh');
  assert.ok(rows.some(row => row.code === 'COMP1001'));
});

test('probeCatalogue reads Content-Range without treating a missing key as success', async () => {
  assert.deepEqual(await probeCatalogue({}), { ok: false, count: 0, reason: 'not_configured' });
  const probe = await probeCatalogue({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_abcdefgh'
  }, {
    fetchImpl: async () => new Response('[]', { headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/2659' } })
  });
  assert.deepEqual(probe, { ok: true, count: 2659 });
});

test('curated overlap wins and a remote-only code becomes answerable', () => {
  setRemoteCourses([
    { ...remoteCourse, code: 'COMP4431', id: 'supabase-COMP4431', title: 'Should not replace curated AI' },
    remoteCourse
  ]);
  assert.equal(getKnowledgeCount(), KNOWLEDGE_COUNT + 1);
  const curated = answerFromKnowledge({ message: 'What are the prerequisites for COMP4431?' });
  assert.equal(curated.sources[0].id, 'course-comp4431');
  assert.match(curated.sources[0].url, /COMP4431\.pdf$/);
  const remote = answerFromKnowledge({ message: 'What is ABCT1D01?' });
  assert.equal(remote.courses[0].code, 'ABCT1D01');
  assert.equal(remote.courses[0].title, 'Introductory Food Science');
  assert.match(remote.text, /Food Science|food analysis/i);
  assert.equal(remote.sources[0].id, 'supabase-ABCT1D01');
  assert.match(remote.sources[0].detail, /catalogue/);
  const zhCard = answerFromKnowledge({ message: 'ABCT1D01 是什么课？' });
  assert.equal(zhCard.courses[0].title, 'Introductory Food Science');
  assert.doesNotMatch(zhCard.courses[0].title, / \/ /);
  const curatedZh = answerFromKnowledge({ message: 'COMP4431 是什么？' });
  assert.equal(curatedZh.courses[0].title, '人工智能 / Artificial Intelligence');
  assert.equal(retrieveKnowledge({ message: 'What is FSN1D01?' })[0].code, 'ABCT1D01');
});

test('a no-prerequisite request ignores catalogue rows that list required courses', () => {
  setRemoteCourses([
    mapCatalogueRow({
      code: 'ABCT1D01',
      name: 'Chemistry and Modern Living',
      description: 'Chemistry in daily life.',
      prerequisites: '无先修课程',
      credits: 3
    }, { verifiedAt: '2026-11-04' }),
    mapCatalogueRow({
      code: 'DSAI2201',
      name: 'Data Structures and Algorithms',
      description: 'Data structures and algorithms.',
      prerequisites: 'COMP1011 or COMP1012 or ENG2002',
      credits: 3
    }, { verifiedAt: '2026-11-04' })
  ]);
  const response = answerFromKnowledge({ message: '推荐没有先修课要求的课' });
  const codes = (response.courses || []).map(course => course.code);
  assert.ok(codes.includes('ABCT1D01') || codes.includes('COMP4432'));
  assert.equal(codes.includes('DSAI2201'), false);
});

test('a Chinese history request retrieves catalogue history subjects', () => {
  const history = mapCatalogueRow({
    code: 'APSS1C33',
    name: 'History of Hong Kong',
    description: '本课程专注于1842年至1997年香港的历史。',
    department: 'apss',
    credits: 3
  }, { verifiedAt: '2026-11-04' });
  setRemoteCourses([history, remoteCourse]);
  const response = answerFromKnowledge({ message: '推荐一下历史课' });
  assert.equal(response.courses[0].code, 'APSS1C33');
  assert.doesNotMatch(response.text, /小型资料库|没有找到与该问题足够匹配/);
});

test('a Chinese chemistry request retrieves catalogue chemistry subjects', () => {
  const chemistry = mapCatalogueRow({
    code: 'ABCT1101',
    name: 'General Chemistry',
    description: 'Introductory chemical principles and laboratory practice.',
    department: 'abct',
    credits: 3
  }, { verifiedAt: '2026-11-04' });
  setRemoteCourses([chemistry, remoteCourse]);
  assert.ok(chemistry.topics.includes('chemistry'));
  const response = answerFromKnowledge({ message: '推荐一下化学课' });
  assert.equal(response.language, 'zh');
  assert.equal(response.courses[0].code, 'ABCT1101');
  assert.doesNotMatch(response.text, /小型资料库/);
});

test('catalogue extras do not invent unknown codes or change curated ML ranking', () => {
  setRemoteCourses([remoteCourse, {
    ...remoteCourse,
    id: 'supabase-COMP8888',
    code: 'COMP8888',
    title: 'Advanced Machine Learning Laboratory',
    summary: 'A machine learning and deep neural networks laboratory.',
    topics: ['machine_learning'],
    aliases: ['machine learning']
  }]);
  const unknown = answerFromKnowledge({ message: 'What is the credit value and prerequisite of COMP9999?' });
  assert.match(unknown.text, /does not contain.*COMP9999/);
  assert.equal(unknown.courses, undefined);
  const ml = answerFromKnowledge({ message: 'Which courses should I consider for machine learning?' });
  assert.equal(ml.courses[0].code, 'COMP4432');
});

test('startCatalogueRefresh maps rows into the knowledge set', async () => {
  const courses = await startCatalogueRefresh({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_abcdefgh'
  }, {
    logger: false,
    fetchImpl: async () => Response.json([{
      code: 'ABCT1D01:FSN1D01',
      name: 'Introductory Food Science',
      description: 'Food analysis laboratory methods.',
      credits: 3,
      department: 'abct'
    }])
  });
  assert.equal(courses[0].code, 'ABCT1D01');
  assert.equal(getKnowledgeCount(), KNOWLEDGE_COUNT + 1);
  assert.equal(answerFromKnowledge({ message: 'Tell me about ABCT1D01' }).courses[0].code, 'ABCT1D01');
});

test('mapCatalogueRows drops rows without a subject code', () => {
  assert.deepEqual(mapCatalogueRows([{ name: 'No code' }, { code: 'COMP1001', name: 'Problem Solving' }]).map(item => item.code), ['COMP1001']);
});
