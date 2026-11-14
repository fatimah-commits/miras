// مراس: حفظ المحاولات في قاعدة البيانات، مع طابور محلي عند انقطاع الإنترنت.
// الطابور مؤقت فقط: يُرسل ثم يُحذف. قاعدة البيانات هي المصدر الوحيد للعرض.
import { scoreOf } from './circuit.js';

export function memoryStore(){ const m={}; return { get:k=>m[k]??null, set:(k,v)=>{ m[k]=v; } }; }
export function localStore(prefix='miras2:'){
  return {
    get:k=>{ try{ return JSON.parse(localStorage.getItem(prefix+k)); }catch(e){ return null; } },
    set:(k,v)=>{ try{ localStorage.setItem(prefix+k, JSON.stringify(v)); }catch(e){} },
  };
}

export const newId = () => (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36)+Math.random().toString(36).slice(2))).replace(/-/g,'').slice(0,24);

// محاولة جارية: تُجمّع الأحداث في الذاكرة ثم تُحفظ مرة واحدة عند الانتهاء
export function startAttempt({ lesson_id='power-rails', mode }){
  const t0 = Date.now();
  const a = { client_id:newId(), lesson_id, mode, started_at:new Date(t0).toISOString(), events:[] };
  return {
    data:a,
    log(step_code, kind, code, confidence=null){
      a.events.push({ seq:a.events.length, step_code, kind, code, confidence, t_s: Math.round((Date.now()-t0)/100)/10 });
    },
    finish(completed){
      a.finished_at = new Date().toISOString();
      a.duration_s = Math.round((Date.now()-t0)/100)/10;
      a.completed = !!completed;
      a.error_count = a.events.filter(e=>e.kind==='error').length;
      a.score = completed ? scoreOf(a.events) : null;
      return a;
    },
  };
}

export function makeData(sb, store){
  const Q='queue';
  const queue = () => store.get(Q) || [];
  async function push(a){
    const row = { client_id:a.client_id, lesson_id:a.lesson_id, mode:a.mode, started_at:a.started_at,
                  finished_at:a.finished_at, duration_s:a.duration_s, completed:a.completed, score:a.score, error_count:a.error_count };
    // client_id يمنع التكرار إذا أُعيد الإرسال بعد انقطاع
    let { data, error } = await sb.from('attempts').insert(row).select('id').single();
    if(error && error.code==='23505'){
      ({ data, error } = await sb.from('attempts').select('id').eq('client_id', a.client_id).single());
    }
    if(error) throw error;
    if(a.events.length){
      const ev = a.events.map(e=>({ ...e, attempt_id:data.id }));
      const r = await sb.from('attempt_events').upsert(ev, { onConflict:'attempt_id,seq', ignoreDuplicates:true });
      if(r.error) throw r.error;
    }
    return data.id;
  }
  return {
    pending: () => queue().length,
    // يحفظ فوراً إن أمكن، وإلا يضعه في الطابور ويقول ذلك بصراحة
    async save(a){
      store.set(Q, [...queue(), a]);
      const r = await this.sync();
      return r.failed ? { saved:false, queued:true, error:r.error } : { saved:true };
    },
    async sync(){
      const q = queue(); const left=[]; let error=null;
      for(const a of q){ try{ await push(a); }catch(e){ left.push(a); error = e.message||String(e); } }
      store.set(Q, left);
      return { sent:q.length-left.length, failed:left.length, error };
    },
    async myAttempts(){
      const { data, error } = await sb.from('attempts').select('*').order('started_at', { ascending:false }).limit(50);
      if(error) throw error; return data;
    },
    async events(attemptId){
      const { data, error } = await sb.from('attempt_events').select('*').eq('attempt_id', attemptId).order('seq');
      if(error) throw error; return data;
    },
    async lessonSteps(lesson='power-rails'){
      const { data, error } = await sb.from('lesson_steps').select('idx,code,title').eq('lesson_id', lesson).order('idx');
      if(error) throw error; return data;
    },
    // للمدرب والمدير: RLS يحدد من يظهر
    async progress(){
      const { data, error } = await sb.from('trainee_progress').select('*').order('full_name');
      if(error) throw error; return data;
    },
    async errorCounts(){
      const { data, error } = await sb.from('error_counts').select('*');
      if(error) throw error; return data;
    },
    async attemptsOf(userId){
      const { data, error } = await sb.from('attempts').select('*').eq('user_id', userId).order('started_at', { ascending:false });
      if(error) throw error; return data;
    },
    async override(attemptId, step){
      const { error } = await sb.rpc('trainer_override', { p_attempt:attemptId, p_step:step });
      if(error) throw error;
    },
    // للمدير
    async sections(){ const { data, error } = await sb.from('sections').select('*').order('id'); if(error) throw error; return data; },
    async allProfiles(){ const { data, error } = await sb.from('profiles').select('*').order('created_at'); if(error) throw error; return data; },
    async setRole(userId, role, section_id){
      const { error } = await sb.from('profiles').update({ role, section_id }).eq('id', userId); if(error) throw error;
    },
    async upsertSection(s){ const { error } = await sb.from('sections').upsert(s); if(error) throw error; },
  };
}

// تصدير CSV للمدرب (يفتح في Excel مع العربية)
export function toCSV(rows, cols){
  const esc = v => { const s = v==null ? '' : String(v); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  return '﻿' + [cols.map(c=>esc(c[1])).join(','), ...rows.map(r=>cols.map(c=>esc(r[c[0]])).join(','))].join('\r\n');
}
