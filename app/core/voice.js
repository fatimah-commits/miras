// مراس: مشغّل صوت واحد. يشغّل ملفاً مولّداً إن وُجد، وإلا صوت الجهاز. لا يتراكب صوتان أبداً.
import { PHRASES } from './phrases.js';

export function makeVoice({ base='voice/', settings }){
  const audio = typeof Audio!=='undefined' ? new Audio() : null;
  let manifest = null, last = null, token = 0;
  const S = () => settings.get();
  const stop = () => {
    token++;
    try{ audio && audio.pause(); }catch(e){}
    try{ globalThis.speechSynthesis && speechSynthesis.cancel(); }catch(e){}
  };
  async function loadManifest(){
    if(manifest) return manifest;
    try{ const r = await fetch(base+'manifest.json', { cache:'no-cache' }); manifest = r.ok ? await r.json() : {}; }catch(e){ manifest = {}; }
    return manifest;
  }
  function deviceVoice(){
    try{
      const v = speechSynthesis.getVoices().filter(x=>/^ar/i.test(x.lang));
      const rank = x => (/enhanced|premium|neural|natural/i.test(x.name)?4:0) + (/^ar[-_]SA/i.test(x.lang)?2:0);
      return v.sort((a,b)=>rank(b)-rank(a))[0] || null;
    }catch(e){ return null; }
  }
  function tts(text, my){
    if(!globalThis.speechSynthesis || my!==token) return;
    const u = new SpeechSynthesisUtterance(text.replace(/[ً-ْ]/g, m=>m)); // التشكيل يساعد بعض الأصوات
    u.lang='ar-SA'; const v=deviceVoice(); if(v) u.voice=v;
    u.rate = S().rate; u.volume = S().volume;
    speechSynthesis.speak(u);
  }
  return {
    PHRASES,
    async source(){ const m = await loadManifest(); return Object.keys(m).length ? 'files' : (deviceVoice() ? 'device' : 'none'); },
    async say(key){
      if(!S().on || !PHRASES[key]) return;
      stop(); const my = token; last = key;
      const m = await loadManifest();
      if(my!==token) return;
      if(audio && m[key]){
        audio.src = base + m[key]; audio.playbackRate = S().rate; audio.volume = S().volume;
        try{ await audio.play(); return; }catch(e){ /* حظر التشغيل التلقائي: نستخدم صوت الجهاز */ }
      }
      tts(PHRASES[key], my);
    },
    replay(){ if(last) this.say(last); },
    stop,
    get last(){ return last; },
  };
}
