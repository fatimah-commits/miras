// مراس: نقطة البداية. التوجيه بين الشاشات حسب الدور.
import { makeAuth } from './core/auth.js';
import { makeData, localStore } from './core/data.js';
import { makeVoice } from './core/voice.js';
import { views } from './ui/views.js';
import { simView } from './ui/sim.js';

const $ = s => document.querySelector(s);
const view = $('#view');
const cfg = window.MIRAS_CONFIG || {};
// رابط استعادة كلمة المرور: يُقرأ قبل أن يمسحه Supabase من شريط العنوان
const recovering = /type=recovery/.test(location.hash + location.search);
const store = localStore();

// إعدادات الجهاز فقط (ليست بيانات): الصوت
const settings = {
  get: () => ({ on:true, rate:1, volume:1, ...(store.get('settings')||{}) }),
  set: v => store.set('settings', { ...settings.get(), ...v }),
};
const voice = makeVoice({ settings });

const app = { me:null, voice, settings, store, go:h=>{ location.hash = h; } };

if(!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase){
  view.innerHTML = `<div class="card form"><h1>المنصة غير مربوطة بقاعدة البيانات</h1>
    <p class="dim">يجب تعبئة <code>config.js</code> برابط مشروع Supabase ومفتاحه العام. لا تعمل الحسابات قبل ذلك.</p></div>`;
} else {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
  app.sb = sb; app.auth = makeAuth(sb); app.data = makeData(sb, store);
  boot();
}

async function loadMe(){
  try{ app.me = await app.auth.me(); }catch(e){ app.me = null; }
}

function nav(){
  const r = app.me?.role;
  const links = !app.me ? [] :
    r==='admin'   ? [['#/trainer','المتدربون'],['#/admin','الحسابات'],['#/settings','الإعدادات']] :
    r==='trainer' ? [['#/trainer','المتدربون'],['#/settings','الإعدادات']] :
                    [['#/home','تدريبي'],['#/settings','الإعدادات']];
  const cur = '#'+(location.hash.slice(1).split('/').slice(0,2).join('/'));
  $('#nav').innerHTML = links.map(([h,t])=>`<a href="${h}"${cur===h?' aria-current="page"':''}>${t}</a>`).join('');
}

let cleanup = null;
async function route(){
  const h = location.hash.replace(/^#/, '');
  if(/^(access_token|error|type)=/.test(h)) return;   // يعالجها Supabase بنفسه
  if(cleanup){ try{ cleanup(); }catch(e){} cleanup = null; }
  voice.stop();
  const [, page='', arg] = h.split('/');
  const role = app.me?.role;
  const home = !app.me ? 'login' : (role==='trainee' ? 'home' : 'trainer');
  const open = ['login','signup','forgot','reset'];
  let p = page || home;
  if(!app.me && !open.includes(p)) p = 'login';
  if(app.me && ['login','signup'].includes(p)) p = home;
  if(p==='trainer' && !['trainer','admin'].includes(role)) p = home;
  if(p==='admin' && role!=='admin') p = home;
  if(p==='sim' && role!=='trainee') p = home;
  if(p!==page) history.replaceState(null, '', '#/'+p);
  const a = p===page ? arg : undefined;
  nav();
  view.innerHTML = '<p class="loading">جارٍ التحميل</p>';
  try{
    if(p==='sim') cleanup = await simView(view, app, a);
    else if(views[p]) cleanup = await views[p](view, app, a);
    else view.innerHTML = '<div class="empty">الصفحة غير موجودة.</div>';
  }catch(e){
    view.innerHTML = `<div class="card"><h2>تعذّر التحميل</h2><p class="msg bad">${String(e.message||e).replace(/</g,'&lt;')}</p><div class="row"><button class="btn ghost" onclick="location.reload()">إعادة المحاولة</button></div></div>`;
  }
  view.focus?.();
}
app.refresh = async () => { await loadMe(); route(); };

async function boot(){
  app.auth.onChange(async (event) => {
    if(event==='PASSWORD_RECOVERY'){ await loadMe(); location.hash = '#/reset'; return; }
    if(event==='SIGNED_OUT'){ app.me = null; location.hash = '#/login'; route(); }
  });
  await loadMe();
  if(recovering && app.me) history.replaceState(null, '', location.pathname + '#/reset');
  window.addEventListener('hashchange', route);
  const net = () => { $('#net').hidden = navigator.onLine; if(navigator.onLine && app.data.pending()) app.data.sync(); };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
  route();
}

if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
