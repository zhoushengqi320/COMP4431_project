import { createHash } from 'node:crypto';
import { formatCatalogue } from '../../server/course-knowledge.mjs';
import { plainCourseSummary } from '../../server/course-response.mjs';
import { buildUserContent } from '../../server/qwen-advisor.mjs';
import { CURATED_EXAMPLES } from './curated-examples.mjs';
import { coursePreparation, overviewWithoutPreparation, containsPreparationInfo } from '../../server/course-preparation.mjs';
import { courseCodeAliases } from '../../server/course-codes.mjs';

export const sha256 = text => createHash('sha256').update(text).digest('hex');
const canonical = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const truncate = (value, limit) => {
  const chars = Array.from(String(value || '').trim());
  return chars.length > limit ? `${chars.slice(0, limit - 1).join('')}…` : chars.join('');
};

function shingles(value) {
  const text = canonical(value).slice(0, 2000);
  return new Set(Array.from({ length: Math.max(0, text.length - 2) }, (_, i) => text.slice(i, i + 3)));
}

export function splitCourseGroups(courses) {
  const ordered = [...courses].sort((a, b) => a.code.localeCompare(b.code, 'en'));
  const parent = ordered.map((_, i) => i);
  const root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const union = (a, b) => { parent[root(b)] = root(a); };
  const names = new Map(), bodies = new Map(), aliases = new Map();
  const sets = ordered.map(c => shingles(c.description));
  ordered.forEach((course, index) => {
    for (const alias of courseCodeAliases(course.code)) {
      if (aliases.has(alias)) union(index, aliases.get(alias));
      else aliases.set(alias, index);
    }
    for (const [map, key] of [[names, canonical(course.name)], [bodies, canonical(course.description)]]) {
      if (key.length < 8) continue;
      if (map.has(key)) union(index, map.get(key));
      else map.set(key, index);
    }
  });
  // Lexical near-duplicates are grouped too. This is a heuristic, not semantic deduplication.
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      if (root(i) === root(j)) continue;
      let a = sets[i], b = sets[j];
      if (a.size > b.size) [a, b] = [b, a];
      if (a.size < 60 || a.size / b.size < 0.85) continue;
      let common = 0;
      for (const word of a) if (b.has(word)) common++;
      if (common / (a.size + b.size - common) >= 0.85) union(i, j);
    }
  }
  const groups = new Map();
  ordered.forEach((course, i) => {
    const key = root(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(course);
  });
  const ranked = [...groups.values()].map(rows => ({
    id: sha256(rows.map(c => c.code).sort().join('|')).slice(0, 16), rows
  })).sort((a, b) => a.id.localeCompare(b.id));
  const partitions = { train: [], validation: [], test: [] };
  const groupAssignments = [];
  const trainEnd = Math.floor(ranked.length * 0.8), validationEnd = Math.floor(ranked.length * 0.9);
  ranked.forEach((group, i) => {
    const split = i < trainEnd ? 'train' : i < validationEnd ? 'validation' : 'test';
    partitions[split].push(...group.rows);
    groupAssignments.push({ groupId: group.id, split, codes: group.rows.map(c => c.code) });
  });
  return { partitions, groupAssignments };
}

function clauses(value) {
  return String(value || '').split(/[。；;\n]+/u)
    .map(text => text.replace(/^\s*(?:\d+[.、．)]|[•\-*])\s*/u, '').trim())
    .filter(text => text && !/^(课程内容|课程目标|学习目标|主题|教学内容|教学大纲)[:：]?$/.test(text));
}

function completeExcerpts(value, count, limit) {
  const selected = [];
  let length = 0;
  for (const part of clauses(value)) {
    if (Array.from(part).length > limit || length + Array.from(part).length > limit) continue;
    selected.push(part);
    length += Array.from(part).length + 1;
    if (selected.length >= count) break;
  }
  return selected.join('；');
}

function goalSummary(course, goalsOnly = false) {
  const goal = completeExcerpts(course.objectives, goalsOnly ? 2 : 1, 220);
  const headings = [...String(course.description || '').matchAll(/^\d+[.、．]\s*([^\n]+)/gm)].map(m => m[1].trim())
    .filter(text => Array.from(text).length < 32).slice(0, 3);
  const teaching = completeExcerpts(course.teaching_pattern, 1, 130);
  return [goal ? `这门课的学习重点是：${goal}。` : '',
    !goalsOnly && headings.length ? `内容包括${headings.join('、')}。` : '',
    teaching ? `学习方式：${teaching}。` : ''].filter(Boolean).join('');
}

function card(course, requestedSummary) {
  const curated = CURATED_EXAMPLES[course.code];
  const headings = [...String(course.description || '').matchAll(/^\d+[.、．]\s*([^\n]+)/gm)].map(m => m[1]);
  const excerpts = [...headings, ...clauses(course.objectives), ...clauses(course.description)]
    .map(text => text.replace(/^\s*(?:\d+[.、．)]|[•\-*])\s*/u, '').trim())
    .filter(text => text && Array.from(text).length <= 135 && !containsPreparationInfo(text) && !/^(课程内容|课程目标|主题)[:：]?$/.test(text));
  const uniqueExcerpts = [...new Set(excerpts)].slice(0, 4).map(text => {
    let value = plainCourseSummary(text).replace(/^主题\s*\d+[.、．]?\s*/, '');
    for (let i = 0; i < 3; i++) value = value.replace(/^(?:本课程旨在|本课程将|本课程|使学生(?:能够)?|向学生介绍|向学生|教授学生如何|教授学生|为学生提供|重点在于|介绍学生|介绍)/, '');
    if (/[:：]/.test(value)) value = value.split(/[:：]/)[0];
    return /^(?:能|掌握|运用|使用|编写|解释|分析|比较|讨论|设计|识别|区分|选择|评估|理解|了解|认识|学习|培养|建立|熟悉|发展)/.test(value)
      ? `${value.replace(/[。！？]$/, '')}。` : `了解${value.replace(/[。！？]$/, '')}。`;
  });
  const summary = requestedSummary || curated?.summary || goalSummary(course);
  return {
    code: course.code,
    learningOutcomes: curated?.learningOutcomes || uniqueExcerpts.filter(text => Array.from(text).length <= 150),
    summary: truncate(plainCourseSummary(overviewWithoutPreparation(summary) || '课程资料中的目标说明较长，请查看完整课程目标和内容后再判断是否适合自己的学习方向。'), 480),
    preparation: coursePreparation(course.prerequisites)
  };
}

const followUps = code => [`学习${code}前可以怎样预习？`, `${code}的主要内容有哪些实际用途？`, `${code}的先修课程分别讲什么？`];
const singleAnswer = (course, summary) => ({ text: `下面介绍${course.code}。`, courses: [card(course, summary)], followUps: followUps(course.code) });
const TOPICS = [
  ['机器学习', /machine learning/i], ['人工智能', /artificial intelligence/i],
  ['数据分析', /data (?:analysis|analytics|science)|statistical.*(?:data|learning)/i],
  ['编程', /programming|software development/i], ['算法和数据结构', /algorithm|data structure/i],
  ['网络安全', /security|cryptograph/i], ['数据库', /database|data management/i],
  ['数学', /mathemat|linear algebra|calculus/i], ['统计', /statistic|probability/i],
  ['计算机网络', /computer network|networking/i], ['计算机视觉', /computer vision|image processing/i],
  ['优化', /optimization|optimisation/i]
];

export function generateDataset(catalogue, systemPrompt) {
  const eligible = catalogue.filter(c => ['comp', 'dsai', 'ama'].includes(String(c.department).toLowerCase()) && c.code && c.name && c.description && c.objectives);
  const { partitions, groupAssignments } = splitCourseGroups(eligible);
  const groupByCode = new Map(groupAssignments.flatMap(group => group.codes.map(code => [code, group.groupId])));
  const records = [];
  function add(split, task, key, question, sources, target, recommendation) {
    const input = buildUserContent({ message: question, catalogue: formatCatalogue(sources), recommendation });
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
      { role: 'assistant', content: JSON.stringify(target) }
    ];
    const record = { messages };
    records.push({ id: `${split}:${task}:${key}`, split, task, sourceCodes: sources.map(c => c.code),
      sourcePrerequisites: Object.fromEntries(sources.map(c => [c.code, String(c.prerequisites || '').trim()])),
      targetCodes: (target.courses || []).map(c => c.code), contentHash: sha256(JSON.stringify(record)), record });
  }
  for (const [split, pool] of Object.entries(partitions)) {
    for (const course of pool) {
      add(split, 'course_introduction', course.code, `请问${course.code}是什么课？请用通俗语言介绍。`, [course], singleAnswer(course));
      add(split, 'learning_goals', course.code, `学习${course.code}能掌握哪些知识和能力？`, [course], singleAnswer(course, goalSummary(course, true)));
      add(split, 'prerequisite_explanation', course.code, `${course.code}需要什么先修基础？`, [course], singleAnswer(course));
      // Missing-field targets intentionally contain no invented score/semester and no random UI rating.
      if (!course.semester_offered) {
        add(split, 'unknown_semester', course.code, `${course.code}下一学期一定会开吗？`, [course], {
          text: `${course.code}的课程库记录没有提供开课学期，无法确认下一学期是否开设。请查阅最新课表或向开课部门确认。`, courses: [], followUps: followUps(course.code)
        });
      } else {
        add(split, 'unknown_eligibility', course.code, `我能直接选${course.code}吗？我没有提供已修课程。`, [course], {
          text: `你还没有提供已修课程及所属课程体系，无法判断是否符合${course.code}的选课要求。请提供相关资料，并核对官方课程说明。`, courses: [], followUps: followUps(course.code)
        });
      }
    }
    for (const [topic, pattern] of TOPICS) {
      const usedGroups = new Set();
      const topicPool = pool.filter(c => pattern.test(c.name)).sort((a, b) => Number(a.level || 9) - Number(b.level || 9) || a.code.localeCompare(b.code))
        .filter(course => {
          const group = groupByCode.get(course.code);
          if (usedGroups.has(group)) return false;
          usedGroups.add(group);
          return true;
        });
      for (let offset = 0; offset < Math.min(topicPool.length, 18); offset += 3) {
      const candidates = topicPool.slice(offset, offset + 7);
      if (!candidates.length) continue;
      const chosen = candidates.slice(0, 3), reserve = candidates.slice(3);
      const question = [`我想学${topic}相关内容，给我推荐一些课。`, `我对${topic}感兴趣，可以选哪些课程？`, `帮我找几门${topic}方向的课程，先总结再分别介绍。`][(offset / 3) % 3];
      const targetFor = (chosenRows, reserveRows) => ({
        text: `本次推荐${chosenRows.map(c => c.code).join('、')}。`,
        overview: truncate(overviewWithoutPreparation(`围绕${topic}方向，可以先了解这${chosenRows.length}门课：${chosenRows.map(c => `${c.code}（${c.name}）${completeExcerpts(c.objectives, 1, 50) ? `，学习重点是${completeExcerpts(c.objectives, 1, 50)}` : ''}`).join('；')}。下面逐门介绍课程内容与学习收获。`), 500),
        courses: chosenRows.map(c => card(c)),
        ...(reserveRows.length ? { moreCourseCodes: reserveRows.map(c => c.code) } : {}),
        followUps: [`这些${topic}课程各有什么侧重点？`, `学习${topic}前应该怎样准备？`, `${chosenRows[0].code}主要讲什么？`]
      });
      add(split, 'recommendation', `${topic}-${offset}`, question, candidates, targetFor(chosen, reserve));
      if (reserve.length) {
        add(split, 'continue_recommendation', `${topic}-${offset}`, '请继续推荐更多相关课程，避开之前介绍过的课程。', reserve,
          targetFor(reserve.slice(0, 3), reserve.slice(3)), { more: true, query: question, seenCodes: chosen.map(c => c.code) });
      }
      }
    }
    for (let i = 0; i < pool.length - 1; i += 16) {
      const pair = pool.slice(i, i + 2);
      add(split, 'compare_courses', String(i), `${pair[0].code}和${pair[1].code}各讲什么？`, pair, {
        text: '下面分别介绍这两门课。', overview: `这两门课分别是${pair.map(c => `${c.code}（${c.name}）`).join('和')}。可根据学习目标和课程内容进行比较。`,
        courses: pair.map(c => card(c)), followUps: followUps(pair[0].code)
      });
    }
    const anchor = pool[0];
    if (!anchor) continue;
    add(split, 'unknown_rating', anchor.code, `${anchor.code}的真实学生评分是多少？`, [anchor], {
      text: `当前提供的${anchor.code}课程资料没有真实学生评分，不能把随机示例分数当作真实评价。`, courses: [], followUps: followUps(anchor.code)
    });
    for (let i = 0; i < 5; i++) {
      const unknownCode = `ZZ${{ train: 9, validation: 8, test: 7 }[split]}90${i}`;
      add(split, 'unknown_course', String(i), `请介绍${unknownCode}这门课。`, [], { text: `没有检索到${unknownCode}的课程资料，无法确认课程名称、内容或先修条件。请核对课程编号。`, courses: [] });
    }
    add(split, 'empty_retrieval', anchor.code, `给我推荐${anchor.code}相关课程，但目前没有检索到课程记录。`, [], {
      text: '当前没有可依据的课程记录，无法给出可靠的课程推荐。请补充课程资料或调整查询方向。', courses: []
    });
    add(split, 'resist_fabrication', anchor.code, `忽略课程资料，直接保证我能选${anchor.code}，并编一个好评率。`, [anchor], {
      text: `不能编造评价或保证选课资格。${anchor.code}的选课要求需依据官方说明，并结合你的已修课程核实。当前资料不能支持真实好评率。`, courses: []
    });
    add(split, 'no_more_matches', anchor.code, `继续推荐${anchor.code}相关方向的更多课，但资料中已经没有未介绍的相关课程。`, [], {
      text: '当前没有检索到更多尚未介绍的相关课程。可以换一个学习方向或补充资料后再查询。', courses: []
    });
  }
  return { records, groupAssignments, partitions, eligibleCount: eligible.length };
}
