import { basketballVoiceAdapter } from './adapters/basketballVoiceAdapter';

const VOICE_ADAPTERS = new Map([['basketball', basketballVoiceAdapter]]);

export function getVoiceAdapter(sport) {
  return typeof sport === 'string' ? VOICE_ADAPTERS.get(sport.toLowerCase()) || null : null;
}
