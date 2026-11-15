// التعرّف التلقائي على اللوحة في صفحة coach/ بدون أي صور حقيقية.
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
    const state=()=>p.evaluate(()=>({done:!!__coach.S.autoDone, cols:__coach.S.cols, rails:__coach.S.rails, taps:__coach.S.taps, start:!document.getElementById('setupDone').disabled, txt:document.getElementById('setupText').textContent}));
  // صورة فارغة مولّدة داخل الصفحة (بلا أي صورة حقيقية): يجب ألا يخمّن لوحة
  await p.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=1280; c.height=960; const g=c.getContext('2d'); g.fillStyle='#b9b2a4'; g.fillRect(0,0,1280,960); const im=new Image(); im.src=c.toDataURL('image/png'); await im.decode(); __coach.useSource(im,'image'); });
  await p.waitForTimeout(3500); { const s=await state(); t('صورة بلا لوحة: يرفض التخمين', !s.done && !s.start && s.taps.length===0, JSON.stringify(s)); }
  const r=await p.evaluate(()=>{ const B=MirasBoard, q=[[100,100],[1100,120],[1090,300],[110,290]]; const a=B.orderTaps(q), b2=B.orderTaps([q[2],q[0],q[3],q[1]]), c=B.orderTaps([q[3],q[2],q[1],q[0]]);
    return {same:JSON.stringify(a)===JSON.stringify(b2)&&JSON.stringify(a)===JSON.stringify(c), first:a[0], cols:B.guessCols(a), small:B.guessCols(B.orderTaps([[0,0],[290,0],[290,110],[0,110]])), cross:B.orderTaps([[0,0],[10,10],[10,0],[5,2]])}; });
  t('اللمس اليدوي بأي ترتيب يعطي الترتيب نفسه', r.same && r.first[0]===100);
  t('حجم اللوحة يُستنتج من الزوايا (63 و30)', r.cols===63 && r.small===30, JSON.stringify(r));
  t('أربع نقاط لا تشكّل لوحة تُرفض', r.cross===null);
  t('لا أخطاء جافاسكربت في الصفحة', errs.length===0, errs.join(' | '));
  await b.close(); console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail?1:0);
})();
