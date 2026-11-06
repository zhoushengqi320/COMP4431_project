import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceHistory, voiceSearchQuestion, voiceFallbackQuestion } from '../server/voice-context.mjs';
const history = [
  {role:'user',text:'I want to study AI.'},
  {role:'assistant',text:'Here is a course.',courses:[{code:'COMP1004',title:'Programming',summary:'Learn basic programming.',requiredPrerequisites:'None stated'}]}
];
test('voice understands useful card content hidden behind short text acknowledgements', () => {
  const turns=voiceHistory(history);
  assert.match(turns[1].content,/COMP1004.*Programming.*Learn basic programming/);
  assert.match(voiceSearchQuestion('What does this course cover?',history),/COMP1004/);
  assert.match(voiceSearchQuestion('What does this course cover?',history),/Latest student question/);
  assert.deepEqual(voiceHistory([{role:'user',text:'Yes'},{role:'assistant',text:'Start here.'}]),[{role:'user',content:'Yes'},{role:'assistant',content:'Start here.'}]);
});
test('fallback search follows a new topic, while short follow-ups retain the previous student goal', () => {
  assert.equal(voiceFallbackQuestion('Recommend some chemistry courses for me.',history),'Recommend some chemistry courses for me.');
  assert.match(voiceFallbackQuestion('Yes, I have.',history),/I want to study AI/);
  assert.equal(voiceHistory(Array.from({length:30},()=>({role:'user',text:'hello'}))).length,12);
});
