/**
 * mmi-tts.js - Key2MD
 * Spoken examiner prompts for the MMI "Read prompts aloud" mode.
 * Uses the cached cloud voice (/api/mmi/tts, OpenAI) for logged-in students;
 * falls back to the browser's built-in speech for anonymous users or any failure,
 * so the feature never hard-breaks.
 */
window.MMITTS = (() => {
 const VOICE = 'alloy'; // calm, neutral
 const cache = new Map(); // text -> object URL (cloud audio)
 let current = null;      // current HTMLAudioElement

 function apiBase() {
  try { if (window.Key2MDAuth && Key2MDAuth.getApiBase) return Key2MDAuth.getApiBase(); } catch (e) {}
  return window.API_BASE || 'https://key2md-api.brittainmbbs.workers.dev';
 }
 function token() {
  try { return (window.Key2MDAuth && Key2MDAuth.getToken ? Key2MDAuth.getToken() : (localStorage.getItem('key2md_token') || '')).trim(); } catch (e) { return ''; }
 }

 function stop() {
  if (current) { try { current.pause(); current.currentTime = 0; } catch (e) {} current = null; }
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
 }

 function webSpeech(text) {
  return new Promise(resolve => {
   try {
    if (!('speechSynthesis' in window)) return resolve(false);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98; u.pitch = 1.0;
    const voices = speechSynthesis.getVoices() || [];
    const pick = voices.find(v => /en-(GB|AU)/i.test(v.lang) && /natural|online|google|microsoft/i.test(v.name))
      || voices.find(v => /natural|online|google/i.test(v.name) && /^en/i.test(v.lang))
      || voices.find(v => /^en/i.test(v.lang));
    if (pick) u.voice = pick;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    speechSynthesis.speak(u);
   } catch (e) { resolve(false); }
  });
 }

 async function cloudUrl(text) {
  const t = token();
  if (!t) return null;
  if (cache.has(text)) return cache.get(text);
  try {
   const res = await fetch(`${apiBase()}/api/mmi/tts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: VOICE }),
   });
   if (!res.ok) return null;
   const blob = await res.blob();
   if (!blob || !blob.size) return null;
   const url = URL.createObjectURL(blob);
   cache.set(text, url);
   return url;
  } catch (e) { return null; }
 }

 // Warm the cache while the student is still answering the current question.
 function prefetch(text) {
  text = String(text || '').trim();
  if (text && token()) cloudUrl(text).catch(() => {});
 }

 // Call from a user gesture (e.g. flipping the toggle) to unlock audio so the
 // first question can play after the reading timer without a fresh click.
 let primed = false;
 function prime() {
  if (primed) return;
  primed = true;
  try { const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='); a.volume = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  try { if (window.speechSynthesis) { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } } catch (e) {}
 }

 // Speak text; resolves when playback finishes (or fails). Always safe to call.
 async function speak(text) {
  text = String(text || '').trim();
  if (!text) return false;
  stop();
  const url = await cloudUrl(text);
  if (url) {
   try {
    const a = new Audio(url);
    current = a;
    await a.play();
    return await new Promise(resolve => { a.onended = () => resolve(true); a.onerror = () => resolve(false); });
   } catch (e) { /* autoplay blocked or decode error -> fall back */ }
  }
  return webSpeech(text);
 }

 return { speak, stop, prefetch, prime };
})();
