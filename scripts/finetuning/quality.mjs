import { CURATED_EXAMPLES } from './curated-examples.mjs';
import { containsPreparationInfo } from '../../server/course-preparation.mjs';

export function qualityIssues(item, catalogue) {
  const answer = JSON.parse(item.record.messages[2].content);
  const issues = [];
  const cards = answer.courses || [];
  for (const card of cards) {
    const row = catalogue.get(card.code);
    if (!row) { issues.push('missing_source_record'); continue; }
    if (containsPreparationInfo(card.summary)) issues.push('prerequisites_in_overview');
    if (Object.keys(card).at(-1) !== 'preparation') issues.push('preparation_not_last');
    if (/…\s*$/.test(card.summary)) issues.push('truncated_summary');
    if ((card.summary.match(/(?:^|\n)\s*\d+[.、．]/g) || []).length >= 2) issues.push('syllabus_dump');
    if (!Array.isArray(card.learningOutcomes) || card.learningOutcomes.length < 3) issues.push('too_few_learning_outcomes');
    for (const outcome of card.learningOutcomes || []) {
      if (/…\s*$/.test(outcome)) issues.push('truncated_learning_outcome');
      if (/了解(?:向学生|教授学生|重点在于|主题\s*\d|本课程|旨在|使学生)/.test(outcome)) issues.push('teacher_centered_outcome');
      if (/^了解\s*(?:[IVX]+[.、]|模型包括|示例包括|例如)/i.test(outcome)) issues.push('mechanical_rewrite_fragment');
      if (Array.from(outcome).length > 100) issues.push('overlong_learning_outcome');
      if (!/理解|了解|认识|掌握|运用|使用|编写|解释|分析|比较|讨论|设计|识别|区分|选择|评估|结合|通过|根据|把|从|学习|能|练习|培养|建立|熟悉|发展/.test(outcome)) issues.push('topic_fragment_in_outcome');
    }
    if (item.task === 'prerequisite_explanation') {
      const raw = String(row.prerequisites || '').trim();
      if (card.preparation?.sourceText !== raw) issues.push('prerequisite_text_changed');
    }
    const text = `${row.name} ${row.description} ${row.objectives}`;
    if (/extended reality/i.test(row.name) && /增强现实（XR）/.test(text)) issues.push('ambiguous_source_xr_translation');
    if (!CURATED_EXAMPLES[card.code] && /学习目标是：[\s\S]*…/.test(card.summary)) issues.push('clipped_learning_goal');
    if (/课程资料中的目标说明较长/.test(card.summary)) issues.push('uninformative_summary_fallback');
  }
  if (item.task === 'unknown_semester') {
    if (item.sourceCodes.some(code => catalogue.get(code)?.semester_offered)) issues.push('semester_is_not_missing');
  }
  return [...new Set(issues)];
}

export function qualitySummary(records, sourceRows) {
  const catalogue = new Map(sourceRows.map(row => [row.code, row]));
  const details = records.map(item => ({ id: item.id, split: item.split, task: item.task, contentHash: item.contentHash, issues: qualityIssues(item, catalogue) }));
  const issueCounts = {};
  for (const row of details) for (const issue of row.issues) issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  return { samples: details.length, flagged: details.filter(row => row.issues.length).length, issueCounts, details,
    scope: 'Automated content-quality triage. Not a human semantic review or a proof of factual correctness.' };
}
