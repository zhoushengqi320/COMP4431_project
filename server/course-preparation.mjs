import { extractCourseCodes } from './course-codes.mjs';

export const PREPARATION_NOTE_ZH = '以上课程可作为提前学习的参考，实际选课要求请以官方课程说明为准。';
export const PREPARATION_NOTE_EN = 'Use these courses as preparation references. Please check the official course description for actual enrolment requirements.';

export function preparationText(raw) {
  const text = String(raw || '').trim();
  const labels = /反先修(?:课程|科目)?|anti[- ]?(?:pre[- ]?)?requisites?|不兼容(?:课程|科目)?|排除(?:课程|科目)?|互斥(?:课程|科目)?|exclusions?|preclusions?|同修(?:课程|科目)?|并修(?:课程|科目)?|共修(?:课程|科目)?|co[- ]?requisites?|(?:建议|建議|必要)?先修(?:课程|課程)?|pre[- ]?requisites?|recommended\s+(?:background|pre[- ]?requisites?)/gi;
  const parts = [...text.matchAll(labels)];
  if (!parts.length) return text;
  const kept = [text.slice(0, parts[0].index)];
  parts.forEach((part, i) => {
    if (!/反先修|anti|不兼容|排除|互斥|exclusion|preclusion|同修|并修|共修|^co[- ]?requisite/i.test(part[0])) kept.push(text.slice(part.index, parts[i + 1]?.index ?? text.length));
  });
  return kept.join('\n').trim();
}

export function prerequisiteLevels(raw) {
  const groups = new Map();
  for (const code of new Set(extractCourseCodes(preparationText(raw)))) {
    const level = Number(code.match(/\d/)?.[0]);
    if (!level) continue;
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(code);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([level, courses]) => ({ level, courses }));
}

export function coursePreparation(raw, language = 'zh') {
  const sourceText = String(raw || '').trim();
  return {
    levels: prerequisiteLevels(sourceText),
    description: preparationText(sourceText) || (language === 'zh' ? '资料未提供，需核实' : 'Not provided; verification needed'),
    note: language === 'zh' ? PREPARATION_NOTE_ZH : PREPARATION_NOTE_EN,
    sourceText
  };
}

export function containsPreparationInfo(text) {
  return /先修|前置课程|选课(?:要求|条件|资格)|修读前|pre[- ]?requisites?|co[- ]?requisites?|同修课程|并修课程|eligibility|recommended background/i.test(String(text || ''));
}

export function overviewWithoutPreparation(text) {
  return String(text || '').split(/(?<=[。！？.!?])|\n+/u).filter(part => !containsPreparationInfo(part)).join('').trim();
}
