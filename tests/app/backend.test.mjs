// اختبار الحسابات وقاعدة البيانات على نسخة Supabase محلية حقيقية (supabase start).
// التشغيل: SB_URL=http://127.0.0.1:54321 SB_ANON=... DB_URL=postgresql://... node tests/app/backend.test.mjs
// يحتاج: npm i @supabase/supabase-js (خارج المستودع) و psql.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { makeAuth } from '../../app/core/auth.js';
import { makeData, memoryStore, startAttempt } from '../../app/core/data.js';

const require = createRequire(process.env.SB_JS || import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const URL = process.env.SB_URL, ANON = process.env.SB_ANON, DB = process.env.DB_URL, MAIL = process.env.MAIL_URL || 'http://127.0.0.1:54324';
if(!URL || !ANON || !DB){ console.error('SB_URL, SB_ANON, DB_URL مطلوبة'); process.exit(2); }

let pass=0, fail=0;
const t=(name, ok, info='')=>{ ok?pass++:fail++; console.log((ok?'✓ ':'✗ ')+name+(ok?'':'  '+info)); };
const psql = sql => execFileSync('psql', [DB, '-tAc', sql]).toString().trim();
// كل "جهاز" عميل مستقل بتخزين جلسة مستقل
const device = () => { const m=memoryStore(); const sb=createClient(URL, ANON, { auth:{ storage:{ getItem:k=>m.get(k), setItem:(k,v)=>m.set(k,v), removeItem:k=>m.set(k,null) }, persistSession:true, autoRefreshToken:false } }); return { sb, auth:makeAuth(sb), data:makeData(sb, memoryStore()) }; };

const run = Date.now().toString(36);
const mail = n => `${n}.${run}@miras.test`;
const PW = 'Miras-test-2026!';

// 1 تسجيل حساب جديد
const A = device();
let r = await A.auth.signUp({ email:mail('noura'), password:PW, full_name:'نورة اختبار', trainee_no:'4410999' });
t('1 signup works', r.ok, r.error);
let me = await A.auth.me();
t('1 new account is trainee', me && me.role==='trainee', JSON.stringify(me));
t('1 trainee number saved', me && me.trainee_no==='4410999');

// تسجيل يحاول أن يجعل نفسه مدرباً عبر البيانات: يُتجاهل
const X = device();
await X.sb.auth.signUp({ email:mail('sneaky'), password:PW, options:{ data:{ full_name:'محاول', role:'admin' } } });
t('1 role in signup metadata ignored', (await X.auth.me()).role==='trainee');

// تحقق من المدخلات قبل الإرسال
t('1 short password rejected', !(await A.auth.signUp({ email:mail('x'), password:'123', full_name:'اسم كامل' })).ok);
t('1 password without a digit rejected', !(await A.auth.signUp({ email:mail('x'), password:'onlyletters', full_name:'اسم كامل' })).ok);
t('1 one-word name rejected', !(await A.auth.signUp({ email:mail('x'), password:PW, full_name:'اسم' })).ok);
t('1 duplicate email rejected', !(await device().auth.signUp({ email:mail('noura'), password:PW, full_name:'نورة' })).ok);

// 2 الدخول والخروج
r = await A.auth.signOut(); t('2 sign out', r.ok);
t('2 after sign out no user', (await A.auth.me())===null);
r = await A.auth.signIn({ email:mail('noura'), password:'wrong-password' });
t('2 wrong password rejected', !r.ok && /غير صحيحة/.test(r.error), r.error);
r = await A.auth.signIn({ email:mail('noura'), password:PW });
t('2 sign in', r.ok, r.error);

// 3 استعادة كلمة المرور (البريد يُلتقط من Mailpit المحلي)
r = await A.auth.requestReset(mail('noura'), 'http://localhost/app/#reset');
t('3 reset email requested', r.ok, r.error);
await new Promise(res=>setTimeout(res, 1500));
const list = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(mail('noura'))}`)).json();
const msgId = list.messages?.[0]?.ID;
const body = msgId ? (await (await fetch(`${MAIL}/api/v1/message/${msgId}`)).json()).Text : '';
const tok = /token=([a-zA-Z0-9_-]+)/.exec(body)?.[1];
t('3 reset email received with link', !!tok, body.slice(0,200));
const R = device();
r = await R.sb.auth.verifyOtp({ token_hash:tok, type:'recovery' });
t('3 recovery link opens a session', !r.error, r.error?.message);
r = await R.auth.setNewPassword('New-pass-2026!');
t('3 new password set', r.ok, r.error);
t('3 old password no longer works', !(await device().auth.signIn({ email:mail('noura'), password:PW })).ok);
const A2 = device();
t('3 new password works', (await A2.auth.signIn({ email:mail('noura'), password:'New-pass-2026!' })).ok);

// 4 الصلاحيات: مدرب ومتدرب آخر ومدير
const T = device(); await T.auth.signUp({ email:mail('trainer'), password:PW, full_name:'مدرب اختبار' });
const B = device(); await B.auth.signUp({ email:mail('lama'), password:PW, full_name:'لمى اختبار' });
const M = device(); await M.auth.signUp({ email:mail('admin'), password:PW, full_name:'مدير اختبار' });
// الخطوة الوحيدة اليدوية في الإنتاج: تعيين أول مدير بسطر SQL
psql(`update profiles set role='admin' where id=(select id from auth.users where email='${mail('admin')}')`);
t('4 admin bootstrap', (await M.auth.me()).role==='admin');
const sec = 'S-'+run;
await M.data.upsertSection({ id:sec, name:'شعبة اختبار', trainer_id:(await T.auth.me()).id });
await M.data.setRole((await T.auth.me()).id, 'trainer', null);
await M.data.setRole((await A2.auth.me()).id, 'trainee', sec);
t('4 admin assigned trainer and section', (await T.auth.me()).role==='trainer' && (await A2.auth.me()).section_id===sec);

// متدرب يحاول ترقية نفسه
let up = await B.sb.from('profiles').update({ role:'admin' }).eq('id', (await B.auth.me()).id);
t('4 trainee cannot promote self', !!up.error && (await B.auth.me()).role==='trainee', up.error?.message);
up = await B.sb.from('profiles').update({ section_id:sec }).eq('id', (await B.auth.me()).id);
t('4 trainee cannot change own section', !!up.error);
// متدرب يغير اسمه: مسموح
up = await B.sb.from('profiles').update({ full_name:'لمى الشهري' }).eq('id', (await B.auth.me()).id);
t('4 trainee can edit own name', !up.error);

// 5 حفظ محاولة من جهاز واسترجاعها من جهاز آخر
const at = startAttempt({ mode:'sim-train' });
at.log('red','error','wrong_rail'); at.log('red','ok','ok'); at.log('black','ok','ok'); at.log('parts','ok','ok'); at.log('power','ok','lit');
const saved = await A2.data.save(at.finish(true));
t('5 attempt saved to database', saved.saved, saved.error);
const otherDevice = device(); await otherDevice.auth.signIn({ email:mail('noura'), password:'New-pass-2026!' });
const mine = await otherDevice.data.myAttempts();
t('5 same attempt visible from another device', mine.length===1 && mine[0].client_id===at.data.client_id && mine[0].score===85, JSON.stringify(mine));
const ev = await otherDevice.data.events(mine[0].id);
t('5 events (errors) visible from another device', ev.length===5 && ev[0].code==='wrong_rail');

// إعادة الإرسال لا تكرر (مثل انقطاع ثم عودة)
const dup = await A2.data.save(at.data);
t('5 resend does not duplicate', dup.saved && (await A2.data.myAttempts()).length===1);

// انقطاع الإنترنت: طابور ثم إرسال
const offSb = createClient('http://127.0.0.1:9', ANON, { auth:{ persistSession:false } });
const qstore = memoryStore();
const offData = makeData(offSb, qstore);
const at2 = startAttempt({ mode:'sim-test' }); at2.log('red','ok','ok');
const off = await offData.save(at2.finish(false));
t('15 offline: not claimed as saved, queued', !off.saved && off.queued && offData.pending()===1);
const onData = makeData(A2.sb, qstore);
const sy = await onData.sync();
t('15 back online: queue sent', sy.sent===1 && onData.pending()===0 && (await A2.data.myAttempts()).length===2);

// 4 عزل البيانات
t('4 other trainee sees none of Noura\'s attempts', (await B.data.myAttempts()).length===0);
let rr = await B.sb.from('attempt_events').select('*'); t('4 other trainee sees no events', rr.data.length===0);
rr = await B.sb.from('profiles').select('*'); t('4 other trainee sees only own profile', rr.data.length===1);
const fake = await B.sb.from('attempts').insert({ client_id:'forged-'+run, user_id:(await A2.auth.me()).id, lesson_id:'power-rails', mode:'sim-test', started_at:new Date().toISOString(), completed:true, score:100 });
t('4 trainee cannot write attempt for another user', !!fake.error);
const evil = await B.sb.from('attempt_events').insert({ attempt_id:mine[0].id, seq:99, step_code:'red', kind:'ok', code:'ok', t_s:1 });
t('4 trainee cannot add events to another attempt', !!evil.error);
const anon = createClient(URL, ANON, { auth:{ persistSession:false } });
rr = await anon.from('attempts').select('*'); t('4 anonymous sees nothing', (rr.data||[]).length===0);
rr = await anon.from('profiles').select('*'); t('4 anonymous cannot read profiles', (rr.data||[]).length===0);

// المحاولة المحفوظة لا تُعدّل
up = await A2.sb.from('attempts').update({ score:100 }).eq('id', mine[0].id);
t('4 finished attempt cannot be edited', !!up.error && (await A2.data.myAttempts()).find(x=>x.id===mine[0].id).score===85);
// المتدرب لا يستطيع تسجيل تجاوز المدرب
const ov = await A2.sb.rpc('trainer_override', { p_attempt:mine[0].id, p_step:'parts' });
t('4 trainee cannot use trainer override', !!ov.error);

// المدرب يرى شعبته فقط
const prog = await T.data.progress();
t('4 trainer sees own section trainee', prog.some(p=>p.full_name==='نورة اختبار'));
t('4 trainer does not see trainee outside section', !prog.some(p=>p.full_name==='لمى الشهري'));
const np = prog.find(p=>p.full_name==='نورة اختبار');
t('7 progress numbers from database', np && +np.attempts===2 && +np.completed===1 && np.best_score===85 && +np.errors===1, JSON.stringify(np));
const ec = await T.data.errorCounts();
t('7 repeated errors from database', ec.some(e=>e.code==='wrong_rail' && +e.n===1));
await T.data.override(mine[0].id, 'parts');
t('4 trainer override recorded', (await A2.data.events(mine[0].id)).some(e=>e.kind==='override'));
const tSelf = await T.sb.from('profiles').update({ role:'admin' }).eq('id', (await T.auth.me()).id);
t('4 trainer cannot promote self', !!tSelf.error);
// المدير يرى الجميع
const all = await M.data.progress();
t('4 admin sees all trainees', all.some(p=>p.full_name==='نورة اختبار') && all.some(p=>p.full_name==='لمى الشهري'));

// 16 تأكيدات السلامة قبل التشغيل (بديل الرمز 9001): التحقق من الدور في قاعدة البيانات
const conf = (dev, extra={}) => dev.sb.rpc('confirm_safety', { p_lines:['resistor_value','led_polarity','no_extra'], p_reason:'تحققت بعيني من القيمة والاتجاه', p_device_session:'sess-'+run, ...extra });
const nouraId = (await A2.auth.me()).id, lamaId = (await B.auth.me()).id;
let cr = await conf(A2);
t('16 trainee cannot create a safety confirmation', !!cr.error && /not_trainer/.test(cr.error.message), JSON.stringify(cr));
cr = await conf({ sb:anon });
t('16 signed-out visitor cannot create a safety confirmation', !!cr.error, JSON.stringify(cr));
const T2 = device(); await T2.auth.signUp({ email:mail('trainer2'), password:PW, full_name:'مدرب آخر' });
await M.data.setRole((await T2.auth.me()).id, 'trainer', null);
cr = await conf(T2, { p_trainee:nouraId });
t('16 trainer of another section cannot confirm for this trainee', !!cr.error && /not_your_trainee/.test(cr.error.message), JSON.stringify(cr));
cr = await conf(T, { p_trainee:lamaId });
t('16 trainer cannot confirm for a trainee outside their section', !!cr.error && /not_your_trainee/.test(cr.error.message));
cr = await conf(T, { p_trainee:nouraId, p_reason:'  ' });
t('16 empty reason refused', !!cr.error && /reason_required/.test(cr.error.message));
cr = await conf(T, { p_trainee:nouraId, p_lines:['resistor_value','usb_ok'] });
t('16 unknown line id refused', !!cr.error);
const before = Date.now();
cr = await conf(T, { p_trainee:nouraId, p_camera:{ resistor:'unknown:resistor_low_conf' } });
const row = cr.data && cr.data[0];
t('16 trainer of the section can confirm, gets server id + time + name', !cr.error && row && /^[0-9a-f-]{36}$/.test(row.id) && row.trainer_name==='مدرب اختبار' && Math.abs(Date.parse(row.created_at)-before) < 60000, JSON.stringify(cr));
const dbRow = psql(`select trainer_id=(select id from auth.users where email='${mail('trainer')}') and trainee_id='${nouraId}' and reason='تحققت بعيني من القيمة والاتجاه' from safety_confirmations where id='${row && row.id}'`);
t('16 record stores trainer identity, trainee and reason', dbRow==='t', dbRow);
cr = await conf(T, { p_trainee_label:'زائر المعرض' });
t('16 trainer can confirm an unnamed visitor session', !cr.error && cr.data && cr.data.length===1, JSON.stringify(cr));
cr = await conf(M, { p_trainee:lamaId });
t('16 admin can confirm for anyone', !cr.error);
let ins = await T.sb.from('safety_confirmations').insert({ trainer_id:(await T.auth.me()).id, device_session:'forged-1', lines:['led_polarity'], reason:'مزور مباشرة' });
t('16 direct insert refused (RPC only), even for a trainer', !!ins.error);
ins = await A2.sb.from('safety_confirmations').insert({ trainer_id:(await T.auth.me()).id, device_session:'forged-2', lines:['led_polarity'], reason:'متدرب يزور' });
t('16 trainee cannot insert a confirmation in the trainer\'s name', !!ins.error);
await T.sb.from('safety_confirmations').update({ reason:'تم التعديل' }).eq('id', row && row.id);
await T.sb.from('safety_confirmations').delete().eq('id', row && row.id);
t('16 confirmation cannot be edited or deleted', psql(`select reason from safety_confirmations where id='${row && row.id}'`)==='تحققت بعيني من القيمة والاتجاه');
rr = await B.sb.from('safety_confirmations').select('*');
t('16 trainee cannot read confirmations about others', (rr.data||[]).every(x=>x.trainee_id===lamaId), JSON.stringify(rr.data));
rr = await A2.sb.from('safety_confirmations').select('*');
t('16 trainee can read their own confirmations', (rr.data||[]).length===1 && rr.data[0].trainee_id===nouraId);
rr = await anon.from('safety_confirmations').select('*');
t('16 anonymous reads no confirmations', (rr.data||[]).length===0);
t('16 forged rows did not land', psql(`select count(*) from safety_confirmations where device_session like 'forged-%'`)==='0');

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail?1:0);
