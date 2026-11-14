// التعرّف التلقائي على اللوحة في صفحة coach/ على صور حقيقية من آيباد صاحبة المشروع (tests/coach-browser/fixtures).
// لا يحتاج النموذج ولا OpenCV. التشغيل: python3 -m http.server 8099 (من جذر المستودع) ثم
//   NODE_PATH=$(npm root -g) BASE=http://127.0.0.1:8099/ node tests/coach-browser/autocal.js
const {chromium}=require('playwright');
const BASE=process.env.BASE||'http://127.0.0.1:8099/';
let pass=0, fail=0; const t=(n,ok,i='')=>{ ok?pass++:fail++; console.log((ok?'✓ ':'✗ ')+n+(ok?'':'  '+i)); };
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1180,height:900}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)|onnxruntime|opencv/,r=>r.abort());
  await p.goto(BASE+'coach/'); await p.waitForFunction(()=>window.__coach&&window.MirasAutoCal);
  const load=async f=>{ await p.evaluate(async f=>{ const im=new Image(); im.src='../tests/coach-browser/fixtures/'+f; await im.decode(); __coach.useSource(im,'image'); },f); };
  const state=()=>p.evaluate(()=>({done:!!__coach.S.autoDone, cols:__coach.S.cols, rails:__coach.S.rails, taps:__coach.S.taps, start:!document.getElementById('setupDone').disabled, txt:document.getElementById('setupText').textContent}));
  for(const [f,plusOuter] of [['real-board-63-a.jpg',false],['real-board-63-b.jpg',true]]){
    await load(f); await p.waitForFunction(()=>__coach.S.autoDone,null,{timeout:8000}).catch(()=>{}); const s=await state();
    t(f+': تعرّف تلقائي بدون أي لمسة', s.done, s.txt);
    t(f+': لوحة 63 عموداً', s.cols===63, String(s.cols));
    t(f+': خطا الطاقة محددان والموجب بجانب الخط الأحمر', !!s.rails && s.rails.plus!=null && s.rails.minus!=null && (plusOuter ? s.rails.plus<s.rails.minus : s.rails.plus>s.rails.minus), JSON.stringify(s.rails));
    t(f+': زر «ابدأ» متاح بعد التعرّف', s.start);
    await p.screenshot({path:'/tmp/autocal-'+f.replace('.jpg','.png')});
  }
  for(const f of ['real-partial-a.jpg','real-partial-b.jpg','real-no-board.jpg']){
    await load(f); await p.waitForTimeout(3500); const s=await state();
    t(f+': يرفض التخمين عندما لا تظهر اللوحة كاملة', !s.done && !s.start && s.taps.length===0, JSON.stringify(s));
  }
  // manual fallback: four corners in any order give the same board frame
  await load('real-partial-a.jpg');
  const r=await p.evaluate(()=>{ const B=MirasBoard, q=[[100,100],[1100,120],[1090,300],[110,290]]; const a=B.orderTaps(q), b2=B.orderTaps([q[2],q[0],q[3],q[1]]), c=B.orderTaps([q[3],q[2],q[1],q[0]]);
    return {same:JSON.stringify(a)===JSON.stringify(b2)&&JSON.stringify(a)===JSON.stringify(c), first:a[0], cols:B.guessCols(a), small:B.guessCols(B.orderTaps([[0,0],[290,0],[290,110],[0,110]])), cross:B.orderTaps([[0,0],[10,10],[10,0],[5,2]])}; });
  t('اللمس اليدوي بأي ترتيب يعطي الترتيب نفسه', r.same && r.first[0]===100);
  t('حجم اللوحة يُستنتج من الزوايا (63 و30)', r.cols===63 && r.small===30, JSON.stringify(r));
  t('أربع نقاط لا تشكّل لوحة تُرفض', r.cross===null);
  t('لا أخطاء جافاسكربت في الصفحة', errs.length===0, errs.join(' | '));
  await b.close(); console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail?1:0);
})();
