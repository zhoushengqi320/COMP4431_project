// Both renderers share the same state; animation previews never replace a live activity.
export function companionState({ loading = false, voiceState = 'idle', speechState = {}, error = '' } = {}) {
  if (voiceState === 'listening') return 'listening';
  if (voiceState === 'starting') return 'connecting';
  if (voiceState === 'stopping') return 'transcribing';
  if (loading) return 'thinking';
  if (speechState.status === 'speaking') return 'speaking';
  if (speechState.status === 'paused') return 'paused';
  if (speechState.status === 'starting') return 'preparing';
  if (error) return 'error';
  return 'idle';
}

export const states = {
  idle: { label: 'Ready when you are', detail: 'A little curiosity. A clearer path.', color: '#b5ee77' },
  connecting: { label: 'Opening microphone', detail: 'Waiting for microphone permission.', color: '#8eddd6' },
  listening: { label: 'Listening', detail: 'Go on. I’m all ears. Figuratively.', color: '#8eddd6' },
  transcribing: { label: 'Transcribing', detail: 'Turning your recording into text.', color: '#8eddd6' },
  thinking: { label: 'Thinking', detail: 'Connecting the dots for your next step.', color: '#d2bdff' },
  preparing: { label: 'Preparing audio', detail: 'Your answer is getting a voice.', color: '#c5e997' },
  speaking: { label: 'Speaking', detail: 'Playing the answer you selected.', color: '#b5ee77' },
  paused: { label: 'Playback paused', detail: 'Take your time. I’ll wait.', color: '#b7c2c8' },
  error: { label: 'Let’s try again', detail: 'Check the message below the chat.', color: '#f0b17d' },
  greeting: { label: 'Oh, hello there.', detail: 'Tiny core. Big plans.', color: '#b5ee77' },
  curious: { label: 'What’s over there?', detail: 'A quick peek. Then back to your plans.', color: '#b5ee77' },
  playful: { label: 'You found my ticklish spot.', detail: 'Okay, okay. You have my attention.', color: '#b5ee77' },
  pout: { label: 'Hey. One boop at a time.', detail: 'Just pretending to be offended.', color: '#b5ee77' },
  sleepy: { label: 'A tiny stretch.', detail: 'Still here, whenever you need me.', color: '#b5ee77' }
};
