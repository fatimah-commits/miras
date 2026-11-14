// فحص ما قبل التشغيل في صفحة coach/ عبر الواجهة الحقيقية + Supabase محلي (Nov 14).
// لا يحتاج النموذج أو OpenCV: الدليل البصري يُحقن عبر __coach.gateEval لاختبار البوابة والواجهة والخادم.
// التشغيل: python3 -m http.server 8099 (من جذر المستودع) ثم
//   NODE_PATH=... SB_JS=... BASE=http://127.0.0.1:8099/ SB_URL=... SB_ANON=... DB_URL=... node tests/coach-browser/gate.js
const { chromium } = require('playwright');
const { createRequire } = require('module');
const { execFileSync } = require('child_process');
const req = createRequire(process.env.SB_JS || __filename);
const { createClient } = req('@supabase/supabase-js');
const BASE=process.env.BASE||'http://127.0.0.1:8099/', SBU=process.env.SB_URL, ANON=process.env.SB_ANON, DB=process.env.DB_URL;
const psql = sql => execFileSync('psql', [DB, '-tAc', sql]).toString().trim();
let pass=0, fail=0; const t=(n,ok,i='')=>{ ok?pass++:fail++; console.log((ok?'✓ ':'✗ ')+n+(ok?'':'  '+i)); };
const run=Date.now().toString(36), PW='Gate-test-2026!';
const camOk={view:'ok',railEnds:{red:'+',black:'-'},resistor:{seen:true,near:true,conf:0.9},led:{seen:true,near:true,conf:0.9}};

(async()=>{
  // accounts: one trainer, one trainee (role set the same way an admin would in production)
  const mk=async(n,full)=>{ const c=createClient(SBU,ANON,{auth:{persistSession:false}}); const r=await c.auth.signUp({email:`${n}.${run}@miras.test`,password:PW,options:{data:{full_name:full}}}); if(r.error) throw r.error; return `${n}.${run}@miras.test`; };
  const trainer=await mk('gtrainer','مدرب البوابة'), trainee=await mk('gtrainee','متدرب البوابة');
  psql(`update profiles set role='trainer' where id=(select id from auth.users where email='${trainer}')`);

  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1180,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  let dialogs=0; p.on('dialog',d=>{ dialogs++; d.dismiss(); });
  await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await p.route(/onnxruntime-web|opencv\.js|\.onnx$/,r=>r.abort());          // model not needed: evidence is injected
  await p.route(/app\/config\.js/,r=>r.fulfill({contentType:'text/javascript',body:`window.MIRAS_CONFIG={supabaseUrl:${JSON.stringify(SBU)},supabaseAnonKey:${JSON.stringify(ANON)}};`}));
  await p.goto(BASE+'coach/'); await p.waitForFunction(()=>window.__coach&&window.supabase);

  // 22 no public override code anywhere in the page
  const src=(await (await p.request.get(BASE+'coach/coach.js')).text())+(await (await p.request.get(BASE+'coach/index.html')).text())+(await (await p.request.get(BASE+'coach/board.js')).text());
  t('22 coach page source has no 9001 and no code prompt', !/9001/.test(src) && !/prompt\(/.test(src));
  t('23 no trainee self-check boxes on the gate', await p.locator('#mResistor, #mLed, #overrideBtn').count()===0);

  const gate=async(ev)=>p.evaluate(ev=>{ __coach.gateEval(ev); return { pass:__coach.S.gate.pass, ready:__coach.S.gate.ready, danger:__coach.S.gate.danger, confirm:__coach.S.confirm }; }, ev);
  const toGate=async(label)=>p.evaluate(label=>{ const S=__coach.S; S.trainee=label; S.session={id:'gate-'+Date.now().toString(36),mode:'train',trainee:label,events:[]}; S.t0=performance.now(); S.view='ok';
    document.getElementById('start').hidden=true; document.getElementById('work').hidden=false; document.getElementById('setupBox').hidden=true; __coach.enterStep(5); }, label);
  await toGate('زائر اختبار');
  t('gate step shown', await p.isVisible('#gateBox'));

  // 23 camera all green, nothing confirmed by a trainer -> blocked, reasons listed
  await gate(camOk); await p.click('#allowBtn'); await p.waitForTimeout(200);
  t('23 allow refused with camera all ok but no trainer confirmation', !(await p.isVisible('#powerBox')) && /منع التشغيل/.test(await p.textContent('#banner')));
  const needs=await p.locator('#gateList li[data-state="unknown"]').count();
  t('23 every unverified line listed with its reason (3 trainer lines)', needs===3 && /يحتاج تأكيد المدرب/.test(await p.textContent('#gateList')), String(needs));

  const openForm=async()=>{ await p.click('#trainerBtn'); await p.locator('#tLines input').evaluateAll(xs=>xs.forEach(x=>x.checked=true)); await p.fill('#tReason','تحققت من القيمة والاتجاه بعيني'); };
  // 24 wrong password
  await openForm(); await p.locator('#gateBox').screenshot({path:(process.env.SHOTS||'/tmp')+'/coach-gate-form.png'}); await p.fill('#tEmail',trainer); await p.fill('#tPass','wrong-password'); await p.click('#tSend');
  await p.waitForFunction(()=>/غير صحيحة|اتصال/.test(document.getElementById('tMsg').textContent));
  t('24 wrong trainer password -> refused, still blocked', /غير صحيحة/.test(await p.textContent('#tMsg')) && (await gate(camOk)).pass===false);
  t('24 password field cleared after the attempt', (await p.inputValue('#tPass'))==='');
  // 24 trainee account in the trainer dialog
  await p.fill('#tEmail',trainee); await p.fill('#tPass',PW); await p.click('#tSend');
  await p.waitForFunction(()=>/ليس حساب مدرب|اتصال/.test(document.getElementById('tMsg').textContent));
  t('24 trainee account refused by the server ("not a trainer")', /ليس حساب مدرب/.test(await p.textContent('#tMsg')) && (await gate(camOk)).pass===false);
  // offline: server unreachable
  await p.route(new RegExp(SBU.replace(/[.:/]/g,'\\$&')),r=>r.abort());
  await p.fill('#tEmail',trainer); await p.fill('#tPass',PW); await p.click('#tSend');
  await p.waitForFunction(()=>/اتصال/.test(document.getElementById('tMsg').textContent));
  t('offline: no server -> no confirmation, USB stays blocked', (await gate(camOk)).pass===false);
  await p.unroute(new RegExp(SBU.replace(/[.:/]/g,'\\$&')));
  // 24 real trainer
  await p.fill('#tEmail',trainer); await p.fill('#tPass',PW); await p.click('#tSend');
  await p.waitForFunction(()=>__coach.S.confirm || /اتصال|غير/.test(document.getElementById('tMsg').textContent));
  let g=await gate(camOk);
  t('24 trainer account -> confirmation from the server (uuid, name, time)', !!g.confirm && /^[0-9a-f-]{36}$/.test(g.confirm.id) && g.confirm.by==='مدرب البوابة' && !!g.confirm.at, JSON.stringify(g.confirm));
  t('24 gate shows the trainer\'s name on confirmed lines', (await p.textContent('#gateList')).includes('المدرب: مدرب البوابة'));
  const row=psql(`select (select email from auth.users where id=trainer_id)||'|'||trainee_label||'|'||array_to_string(lines,',')||'|'||reason from safety_confirmations where id='${g.confirm.id}'`);
  t('24 record in the database: trainer, visitor label, lines, reason', row===`${trainer}|زائر اختبار|led_polarity,no_extra,resistor_value|تحققت من القيمة والاتجاه بعيني`, row);
  const stored=await p.evaluate(()=>JSON.stringify(Object.assign({},localStorage))+JSON.stringify(Object.assign({},sessionStorage)));
  t('trainer password and token not kept in browser storage', !stored.includes(PW) && !/access_token|refresh_token/.test(stored));
  // 12 stability in the UI
  t('12 pass is not ready on the first green evaluation', g.pass===true && g.ready===false);
  await p.click('#allowBtn'); await p.waitForTimeout(150);
  t('12 allow pressed too early -> still on the gate', !(await p.isVisible('#powerBox')));
  await p.waitForTimeout(1100); g=await gate(camOk);
  t('12 after 1 s of steady green -> ready', g.ready===true);
  // 11 hand over the board after confirmation cancels it
  await gate({...camOk, view:'hand'}); g=await gate(camOk);
  t('11 hand over the board after the trainer confirmed -> confirmation cancelled, blocked', g.confirm===null && g.pass===false);
  // 7 danger cannot be confirmed away
  await gate({...camOk, railEnds:{red:'+',black:'+'}});
  t('7 short on camera -> trainer button disabled', await p.isDisabled('#trainerBtn'));
  await p.click('#allowBtn'); await p.waitForTimeout(150);
  t('7 short -> allow refused with the short reason', /قصر/.test(await p.textContent('#banner')) && !(await p.isVisible('#powerBox')));
  // 3 low confidence shown as a reason
  await gate({...camOk, resistor:{seen:true,near:true,conf:0.4}});
  t('3 low-confidence resistor shown as not confirmed', /لم أتمكن من التعرف على المقاومة/.test(await p.textContent('#gateList')));
  // full path: trainer confirms an uncertain resistor too, steady view, allowed
  await gate({...camOk, resistor:{seen:true,near:true,conf:0.4}});
  await p.click('#trainerBtn'); await p.locator('#tLines input').evaluateAll(xs=>xs.forEach(x=>x.checked=true));
  t('trainer form offers the uncertain resistor line too', await p.locator('#tLines input[value="resistor"]').count()===1);
  await p.fill('#tReason','رأيت المقاومة في مكانها'); await p.fill('#tEmail',trainer); await p.fill('#tPass',PW); await p.click('#tSend');
  await p.waitForFunction(()=>__coach.S.confirm);
  await gate({...camOk, resistor:{seen:true,near:true,conf:0.4}}); await p.waitForTimeout(1100); await gate({...camOk, resistor:{seen:true,near:true,conf:0.4}});
  await p.click('#allowBtn'); await p.waitForTimeout(300);
  t('positive path: camera + trainer confirmation, steady -> power step', await p.isVisible('#powerBox'));
  const ev=await p.evaluate(()=>__coach.S.session.events.map(e=>e.type));
  t('session log has trainer_confirm, confirm_void, blocked and gate_pass', ['trainer_confirm','confirm_void','blocked','gate_pass'].every(x=>ev.includes(x)), ev.join(','));
  t('no browser dialogs used', dialogs===0);
  t('no page errors', errs.length===0, errs.join(' | '));
  await p.screenshot({path:(process.env.SHOTS||'/tmp')+'/coach-gate.png'});
  await b.close();
  console.log(`\ncoach gate (browser): ${pass} passed, ${fail} failed`); process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
