const LANGUAGES = [
  { code: 'zh-Hant', name: 'Traditional Chinese', aliases: ['traditional Chinese', '繁體中文', '繁体中文', '繁體', '繁体'] },
  { code: 'zh', name: 'Simplified Chinese', aliases: ['simplified Chinese', '简体中文', '簡體中文', '简中', '簡中', '简体', '簡體', 'Chinese', '中文', '汉语', '漢語', '普通话', '普通話', 'Mandarin'] },
  { code: 'yue', name: 'Cantonese', aliases: ['Cantonese', '粤语', '粵語', '广东话', '廣東話'] },
  { code: 'en', name: 'English', aliases: ['English', '英文', '英语', '英語'] },
  { code: 'ja', name: 'Japanese', aliases: ['Japanese', '日本語', '日语', '日語', '日文'] },
  { code: 'ko', name: 'Korean', aliases: ['Korean', '한국어', '韩语', '韓語', '韩文', '韓文'] },
  { code: 'fr', name: 'French', aliases: ['French', 'français', '法语', '法語', '法文'] },
  { code: 'es', name: 'Spanish', aliases: ['Spanish', 'español', '西班牙语', '西班牙語'] },
  { code: 'de', name: 'German', aliases: ['German', 'Deutsch', '德语', '德語', '德文'] },
  { code: 'pt', name: 'Portuguese', aliases: ['Portuguese', 'português', '葡萄牙语', '葡萄牙語'] },
  { code: 'it', name: 'Italian', aliases: ['Italian', 'italiano', '意大利语', '意大利語'] },
  { code: 'ru', name: 'Russian', aliases: ['Russian', 'русский', '俄语', '俄語', '俄文'] },
  { code: 'ar', name: 'Arabic', aliases: ['Arabic', 'العربية', '阿拉伯语', '阿拉伯語'] },
  { code: 'hi', name: 'Hindi', aliases: ['Hindi', 'हिन्दी', '印地语', '印地語'] },
  { code: 'th', name: 'Thai', aliases: ['Thai', 'ไทย', '泰语', '泰語'] },
  { code: 'el', name: 'Greek', aliases: ['Greek', 'ελληνικά', '希腊语', '希臘語'] }
];

const languageByCode = code => {
  const language = LANGUAGES.find(item => item.code === code);
  return { code: language.code, name: language.name };
};
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const aliases = LANGUAGES.flatMap(language => language.aliases)
  .sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
const aliasToLanguage = new Map(LANGUAGES.flatMap(language => language.aliases.map(alias => [alias.toLowerCase(), language])));

function explicitLanguage(message) {
  // Quoted examples and course titles are evidence, not reply-language commands.
  const text = message.replace(/"[^"\n]*"|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』/gu, ' ');
  const patterns = [
    new RegExp(`(?:请|請)?(?:使用|改用|用|以|换成|換成|改成)\\s*(${aliases})(?=\\s*(?:回答|回复|回覆|解释|解釋|作答|说明|說明|介绍|介紹|[，。！？,.!?;；]|$))`, 'giu'),
    new RegExp(`\\b(?:answer|respond|reply|explain|write|speak|translate)\\b[^.!?;\\n]{0,35}?\\b(?:in|into|using|with)\\s+(${aliases})(?![\\p{L}])`, 'giu'),
    new RegExp(`\\b(?:use|switch to)\\s+(${aliases})(?=\\s*(?:please|to (?:answer|reply|respond)|[,.!?;]|$))`, 'giu'),
    new RegExp(`\\b(?:answer|response|reply)\\s+(?:should\\s+be\\s+|must\\s+be\\s+)?in\\s+(${aliases})(?![\\p{L}])`, 'giu'),
    new RegExp(`(${aliases})\\s*(?:please|回答|回复|回覆|作答)(?=[\\s,.!?，。！？]|$)`, 'giu')
  ];
  const candidates = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const prefix = text.slice(Math.max(0, match.index - 30), match.index);
      const clausePrefix = prefix.split(/[.!?;。！？；,，]/u).at(-1);
      if (/(?:\b(?:not|never|don't|do not)\b|不要|不用|别|別|无需|無需)/iu.test(clausePrefix)) continue;
      candidates.push({ at: match.index, language: aliasToLanguage.get(match[1].toLowerCase()) });
    }
  }
  if (candidates.length) return candidates.sort((a, b) => b.at - a.at)[0].language;
  return aliasToLanguage.get(text.trim().replace(/[.!?。！？]+$/u, '').toLowerCase()) || null;
}

function questionLanguage(message) {
  let text = message.replace(/https?:\/\/\S+/giu, ' ')
    .replace(/\b[A-Z]{2,6}\s*\d[A-Z0-9]{2,7}\b/giu, ' ');
  const unquoted = text.replace(/"[^"\n]*"|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』/gu, ' ');
  if (/\p{L}/u.test(unquoted)) text = unquoted;
  if (!/\p{L}/u.test(text)) return null;
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/\p{Script=Arabic}/u.test(text)) return 'ar';
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi';
  if (/\p{Script=Thai}/u.test(text)) return 'th';
  if (/\p{Script=Greek}/u.test(text)) return 'el';
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru';
  const hanCount = (text.match(/\p{Script=Han}/gu) || []).length;
  if (hanCount) {
    const words = text.match(/[a-z]+/giu) || [];
    const englishGrammar = words.filter(word => /^(?:what|how|why|can|could|would|should|do|does|please|tell|me|about|is|are|the|a|i|want|to|learn|recommend|courses)$/i.test(word)).length;
    if (words.length >= 3 && englishGrammar >= 2 && hanCount <= words.length * 2) return 'en';
    if (/[佢嘅唔喺嘢]|點解|呢門課|呢门课/u.test(text)) return 'yue';
    return /[這個們學習課請問麼為與後選擇議簡體語說讀資應該還讓對開實資訊]/u.test(text) ? 'zh-Hant' : 'zh';
  }
  const latinHints = [
    ['fr', /(?<!\p{L})(?:bonjour|quel|quelle|quels|quelles|comment|pourquoi|pouvez|vous|apprendre|recommandez|je veux|s'il vous plaît)(?!\p{L})/giu],
    ['es', /(?<!\p{L})(?:hola|qué|cómo|cuáles|quiero|aprender|puedes|recomienda|cursos|por favor)(?!\p{L})/giu],
    ['de', /\b(?:hallo|welche|welcher|wie|warum|kannst|bitte|lernen|empfehlen|möchte)\b/giu],
    ['pt', /\b(?:olá|quais|você|gostaria|português)\b/giu],
    ['it', /\b(?:ciao|quali|vorrei|imparare|puoi|consigli)\b/giu]
  ];
  const ranked = latinHints.map(([code, pattern]) => ({ code, count: [...text.matchAll(pattern)].length }))
    .sort((a, b) => b.count - a.count);
  return ranked[0].count ? ranked[0].code : 'en';
}

export function resolveResponseLanguage(message, history = []) {
  const text = String(message || '');
  const explicit = explicitLanguage(text);
  if (explicit) return { code: explicit.code, name: explicit.name };
  const current = questionLanguage(text);
  if (current) return languageByCode(current);
  // Course-code-only turns have no language signal. Only user turns can set it.
  for (const item of [...history].reverse()) {
    if (item?.role !== 'user' || typeof item.text !== 'string') continue;
    const previous = explicitLanguage(item.text);
    if (previous) return { code: previous.code, name: previous.name };
    const inferred = questionLanguage(item.text);
    if (inferred) return languageByCode(inferred);
  }
  return languageByCode('en');
}

export function responseLanguageInstruction(language) {
  return `Reply language for this turn: ${language.name}. The student's explicit language request takes priority; otherwise follow the language of their latest question. Write all user-facing explanations, course summaries, learning goals and follow-up questions in ${language.name}. Translate catalogue prose into ${language.name}; the language of retrieved records, examples, earlier assistant answers and interface labels must not determine the reply language. Preserve course codes and factual values. When a structured response is requested, preserve its field names. Follow the separate response-style instructions for structure and spoken-answer length.`;
}
