// The UI owns presentation only. Replace/configure this boundary to connect the team's AI.
export const API_URL = import.meta.env.VITE_ADVISOR_API_URL?.trim();
export const DEMO = !API_URL;

export async function requestAdvice({ message, history, profile, documents, attachments, signal }) {
  if (API_URL) {
    const body = new FormData();
    body.append('message', message);
    body.append('history', JSON.stringify(history));
    body.append('profile', JSON.stringify(profile));
    documents.forEach(doc => { if (doc.file) body.append('documents', doc.file); });
    attachments.forEach(doc => body.append('attachments', doc.file));
    const response = await fetch(API_URL, { method: 'POST', body, signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The advisor could not respond (${response.status}). Please try again.`);
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('The advisor returned an empty response. Please try again.');
    return data;
  }
  // Deliberately fixed examples, not a simulated language model or academic validation.
  const plan = /plan|semester|workload|graduat/i.test(message);
  const prereq = /prerequisite|eligible|requirement|credit/i.test(message);
  return {
    text: plan
      ? 'Here is an example of how your remaining semesters could be presented. A real plan will need your completed courses, programme requirements and confirmed course offerings.'
      : prereq
        ? 'Prerequisites and graduation requirements will be checked by the connected advisor. This preview shows where eligibility, credit checks and supporting evidence will appear.'
        : 'For a machine learning pathway, a typical progression is mathematical foundations, core machine learning, then applied projects. Here is an illustrative recommendation layout; it is not based on your documents.',
    courses: plan || prereq ? [] : [
      { code: 'DEMO 301', title: 'Foundations of Machine Learning', credits: 3, tag: 'Core foundation', reason: 'Build a foundation in supervised learning, model evaluation and practical experimentation.', prerequisite: 'Example: linear algebra and introductory programming' },
      { code: 'DEMO 402', title: 'Applied Data Science', credits: 3, tag: 'Applied elective', reason: 'Connect statistical reasoning with a practical, portfolio-ready data project.', prerequisite: 'Example: probability and a foundational ML course' }
    ],
    semesters: plan ? [
      { title: 'Next semester', credits: 9, courses: ['DEMO 301 · Foundations of Machine Learning', 'DEMO 302 · Probability for Computing', 'DEMO 303 · Programme Elective'] },
      { title: 'Following semester', credits: 9, courses: ['DEMO 402 · Applied Data Science', 'DEMO 403 · Capstone Project', 'DEMO 404 · Programme Elective'] }
    ] : [],
    checks: ['Prerequisites: not verified', 'Semester availability: not verified', 'Graduation credits: not verified'],
    sources: [{ title: 'Source citations will appear here', detail: 'No documents have been analysed in demo mode.' }],
    followUps: ['Plan my remaining semesters', 'Check my prerequisites']
  };
}
