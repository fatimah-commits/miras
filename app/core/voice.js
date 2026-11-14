// مراس: مشغّل صوت واحد. يشغّل التسجيلات فقط (app/voice). لا يُستخدم صوت الجهاز أبداً، ولا يتراكب صوتان.
import { PHRASES } from './phrases.js';

export function makeVoice({ base='voice/', settings }){
  const audio = typeof Audio!=='undefined' ? new Audio() : null;
  let manifest = null, last = null, token = 0;
  const S = () => settings.get();
  const stop = () => {
    token++;
    try{ audio && audio.pause(); }catch(e){}
  };
  async function loadManifest(){
    if(manifest) return manifest;
    try{ const r = await fetch(base+'manifest.json', { cache:'no-cache' }); manifest = r.ok ? await r.json() : {}; }catch(e){ manifest = {}; }
    return manifest;
  }
  return {
    PHRASES,
    async source(){ const m = await loadManifest(); return Object.keys(m).length ? 'files' : 'none'; },
    async say(key){
      if(!S().on || !PHRASES[key]) return;
      stop(); const my = token; last = key;
      const m = await loadManifest();
      if(my!==token) return;
      if(audio && m[key]){
        audio.src = base + m[key]; audio.playbackRate = S().rate; audio.volume = S().volume;
        try{ await audio.play(); }catch(e){ /* حظر التشغيل التلقائي: يبقى النص على الشاشة */ }
      }
    },
    replay(){ if(last) this.say(last); },
    stop,
    get last(){ return last; },
  };
}
