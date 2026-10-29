/**
 * Text-to-speech for English sentences, so the learner can hear exam vocabulary.
 * 英文句子朗读功能，帮助学习者听到考试词汇的发音。
 */
import { stripMarkup } from './inline-markup.js';

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang && voice.lang.startsWith(lang.slice(0, 2)))
    || null;
}

/** Stops any sentence being read aloud. 停止正在朗读的句子。 */
export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function speak(text, { lang = 'en-US', rate = 0.92 } = {}) {
  if (!canSpeak() || !text) return;
  const utterance = new window.SpeechSynthesisUtterance(stripMarkup(text));
  utterance.lang = lang;
  utterance.rate = rate;
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
