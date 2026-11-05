const clip = (value, max) => String(value || '').trim().slice(0, max);

// Text answers often put the useful details in course cards, not in text.
export function voiceHistory(history = []) {
  return history.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string').slice(-12).map(item => ({
    role: item.role,
    content: clip([item.text, ...(item.role === 'assistant' && Array.isArray(item.courses) ? item.courses.slice(0, 3).map(course => [course.code, course.title, course.summary, course.prerequisite, course.requiredPrerequisites, course.recommendedPrerequisites].filter(Boolean).join(' · ')) : [])].join('\n'), 3500)
  }));
}

export function voiceSearchQuestion(message, history = []) {
  const context = voiceHistory(history).slice(-6).map(item => `${item.role}: ${item.content}`).join('\n');
  return `${context ? `Earlier conversation (context only):\n${context}\n\n` : ''}Latest student question (prioritize this; follow a topic change and resolve references using the earlier conversation):\n${message}`;
}

export function voiceFallbackQuestion(message, history = []) {
  const previous = [...history].reverse().find(item => item.role === 'user')?.text || '';
  const reference = /这门|那门|这些|它|刚才|继续|还有|更多|先修|为什么|this|that|these|\bit\b|\bthose\b|\bmore\b|\byes\b|\bno\b|\bwhy\b/i.test(message) || message.trim().length < 15;
  return reference ? `${message}\n${clip(previous, 1500)}` : message;
}
