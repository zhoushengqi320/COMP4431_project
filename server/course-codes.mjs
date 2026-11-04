export const courseCodeKey = value => typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : '';

export function extractCourseCodes(text) {
  return [...String(text || '').toUpperCase().matchAll(/(?<![A-Z0-9])([A-Z]{2,6})\s*(\d{3,5}[A-Z]{0,2}|\d[A-Z]{1,2}\d{2,3}[A-Z]{0,2})(?![A-Z0-9])/g)]
    .map(match => `${match[1]}${match[2]}`);
}

export function courseCodeAliases(code) {
  const key = courseCodeKey(code);
  return [...new Set([key, ...key.split(/[:：]/)].filter(Boolean))];
}

export function referencesOnlyCourses(text, codes) {
  const known = new Set(codes.flatMap(courseCodeAliases));
  return extractCourseCodes(text).every(code => known.has(code));
}
