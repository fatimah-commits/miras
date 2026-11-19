// المدرب المباشر: كشف رجل المقاومة أو اللمبة في خط الطاقة المعاكس، وعدم التعلّق في «الصورة تتحرك». بلا أي صور حقيقية (لوحة مرسومة داخل الصفحة).
// التشغيل: python3 -m http.server 8123 (من جذر المستودع)، ثم
//   LIB=<مجلد فيه ocv/dist/opencv.js و ort/dist> NODE_PATH=$(npm root -g) node tests/coach-browser/rail-errors.js
const {chromium}=require('playwright'); const path=require('path');
const LIB=process.env.LIB, BASE=process.env.BASE||'http://127.0.0.1:8123/';
let pass=0, fail=0; const t=(n,ok,i='')=>{ ok?pass++:fail++; console.log((ok?'✓ ':'✗ ')+n+(ok?'':'  '+i)); };
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1366,height:1024}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await p.route(/onnxruntime-web@1\.26\.0\/dist\/(.*)$/,r=>{const f=r.request().url().match(/dist\/([^?]*)/)[1]; r.fulfill({path:path.join(LIB,'ort/dist',f),contentType:f.endsWith('.wasm')?'application/wasm':'text/javascript',headers:{'access-control-allow-origin':'*'}})});
  await p.route(/opencv\.js/,r=>r.fulfill({path:path.join(LIB,'ocv/dist/opencv.js'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  await p.goto(BASE+'coach/'); await p.waitForFunction(()=>window.__coach&&__coach.S.cvReady&&window.MirasAutoCal,null,{timeout:120000});
  // لوحة تجارب مرسومة: 63 عموداً، خطا طاقة بلونين، وطاولة فيها نقوش (بلا صور حقيقية)
  await p.evaluate(()=>{
    const W=1280,H=960; window.__src=document.createElement('canvas'); __src.width=W; __src.height=H;
    const bg=document.createElement('canvas'); bg.width=W+400; bg.height=H+400; const g=bg.getContext('2d');
    let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
    g.fillStyle='#705640'; g.fillRect(0,0,bg.width,bg.height);
    for(let y=0;y<bg.height;y+=3){ g.fillStyle=`rgba(40,25,10,${0.05+0.08*rnd()})`; g.fillRect(0,y,bg.width,1+2*rnd()); }
    for(let i=0;i<160;i++){ g.fillStyle=`rgb(${30+170*rnd()|0},${30+170*rnd()|0},${30+170*rnd()|0})`; g.beginPath(); g.arc(rnd()*bg.width,rnd()*bg.height,4+10*rnd(),0,7); g.fill(); }
    const P=16, cols=63, ox=350, oy=530, X=c=>ox+c*P, Y=y=>oy+y*P;
    g.fillStyle='#eeeade'; g.fillRect(X(-1.5),Y(-4.6),(cols+2)*P,20.2*P); g.fillStyle='#cdc8bc'; g.fillRect(X(-1.5),Y(5.5)-3,(cols+2)*P,6);
    const hole=(c,y)=>{ g.fillStyle='#3c3a37'; g.fillRect(X(c)-3.2,Y(y)-3.2,6.4,6.4); };
    for(let c=0;c<cols;c++){ for(const y of [0,1,2,3,4,7,8,9,10,11]) hole(c,y); if(c%6!==5) for(const y of [-2.2,-3.2,13.2,14.2]) hole(c,y); }
    for(const [y,col] of [[-1.6,'#dc2828'],[-3.8,'#285adc'],[12.6,'#285adc'],[14.8,'#dc2828']]){ g.strokeStyle=col; g.lineWidth=2; g.beginPath(); g.moveTo(X(-0.5),Y(y)); g.lineTo(X(cols-0.5),Y(y)); g.stroke(); }
    g.fillStyle='#5a5a5a'; g.font='11px sans-serif'; for(let c=0;c<cols;c+=5) g.fillText(String(c+1),X(c)-4,Y(5.5)-14);
    g.fillStyle='#146e8c'; g.fillRect(X(18),Y(17.5),330,200); g.fillStyle='#eee'; g.font='20px sans-serif'; g.fillText('UNO',X(18)+130,Y(17.5)+100);
    window.__bg=bg; window.__geo={P,cols,ox:ox-200,oy:oy-200};
    window.__draw=(dx,dy,ang,blank)=>{ const c=__src.getContext('2d'); c.setTransform(1,0,0,1,0,0);
      if(blank){ c.fillStyle='#202020'; c.fillRect(0,0,W,H); return; }
      c.fillStyle='#705640'; c.fillRect(0,0,W,H); c.translate(W/2+dx,H/2+dy); c.rotate((ang||0)*Math.PI/180); c.translate(-W/2-200,-H/2-200); c.drawImage(bg,0,0); c.setTransform(1,0,0,1,0,0); };
    // where a board hole (c,y) lands in the image for a given motion
    window.__exp=(c,y,dx,dy,ang)=>{ let x=__geo.ox+c*__geo.P-W/2, yy=__geo.oy+y*__geo.P-H/2; const a=(ang||0)*Math.PI/180; return [x*Math.cos(a)-yy*Math.sin(a)+W/2+dx, x*Math.sin(a)+yy*Math.cos(a)+H/2+dy]; };
    __draw(0,0,0); __coach.useSource(__src,'image');
  });
  const tick=n=>p.evaluate(n=>new Promise(r=>{ let k=0; const f=()=>{ if(++k>=n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }),n);
  await p.waitForFunction(()=>__coach.S.autoDone,null,{timeout:20000}).catch(()=>{});
  const s0=await p.evaluate(()=>({done:__coach.S.autoDone, cols:__coach.S.cols, rails:__coach.S.rails}));
  t('المعايرة التلقائية تعمل على اللوحة المرسومة', s0.done && s0.cols===63, JSON.stringify(s0));
  await p.evaluate(()=>{ document.getElementById('setupDone').click(); });
  // قطع مرسومة: جسم بلون بيج (يشبه لون الجلد، مثل المقاومة الحقيقية) ورجلان معدنيتان تدخلان الفتحات
  await p.evaluate(()=>{
    window.__clean=document.createElement('canvas'); __clean.width=__bg.width; __clean.height=__bg.height; __clean.getContext('2d').drawImage(__bg,0,0);
    // positions in the platform's own board frame (S.H), drawn into the table picture (picture = image + 200 px)
    const g=__bg.getContext('2d'), I=(c,y)=>{ const q=__coach.B.apply(__coach.S.H,c,y); return [q[0]+200,q[1]+200]; };
    window.__part=(c0,y0,c1,y1,body)=>{ g.drawImage(__clean,0,0); const a=I(c0,y0), z=I(c1,y1);
      g.strokeStyle='#c9ccd0'; g.lineWidth=2.5; g.beginPath(); g.moveTo(...a); g.lineTo(...z); g.stroke();
      for(const q of [a,z]){ g.fillStyle='#d2d5d9'; g.beginPath(); g.arc(q[0],q[1],3.6,0,7); g.fill(); }
      const mx=(a[0]+z[0])/2, my=(a[1]+z[1])/2; g.fillStyle=body; g.fillRect(mx-6,my-9,12,18); };
    window.__noPart=()=>g.drawImage(__clean,0,0);
  });
  // real rails have a gap after every 5 holes: use the nearest column that has a rail hole in the drawing
  const C0=await p.evaluate(()=>__coach.B.targets(__coach.S.cols).col-1);
  const hasHole=c=>p.evaluate(c=>{ const S=__coach.S, q=__coach.B.apply(S.H,c,S.rails.plus), d=__exp(0,0,0,0,0), e=__exp(1,0,0,0,0); const col=Math.round((q[0]-d[0])/(e[0]-d[0])); return col%6!==5; },c);
  const C=(await hasHole(C0)) ? C0 : C0+1, LC=(await hasHole(C0+3)) ? C0+3 : C0+4;
  const railY=k=>s0.rails[k];
  // ينتظر حتى تثبت النتيجة (أو حتى تنتهي المهلة) ويرجع آخر حكم
  const settle=async(want,ms=6000)=>{ const t0=Date.now(); let r;
    while(Date.now()-t0<ms){ await p.waitForTimeout(250); r=await p.evaluate(()=>({view:__coach.S.view, committed:__coach.S.committed&&__coach.S.committed.code, reach:__coach.S.ev&&__coach.S.ev.reach, dbg:__coach.S.reachDbg, skin:__coach.S.skin, motion:__coach.S.motion})); if(want(r)) break; } return r; };
  // 1) المقاومة في خط السالب (الخطأ الذي جُرّب على الآيباد)
  await p.evaluate(()=>__coach.enterStep(1));
  await p.evaluate(([C0,C,y])=>{ __part(C0,0,C,y,'#d8b98e'); __draw(0,0,0); },[C0,C,railY('minus')]);
  const a=await settle(r=>r.committed==='resistor_in_minus');
  t('مقاومة بجسم بيج: الصورة تثبت ولا تعلق في «تتحرك»', a.view==='ok', JSON.stringify(a));
  t('رجل المقاومة في خط السالب: خطأ مؤكد «resistor_in_minus»', a.committed==='resistor_in_minus', JSON.stringify(a));
  const banner=await p.evaluate(()=>document.body.innerText.includes('رجل المقاومة في خط السالب'));
  t('رسالة الخطأ ظاهرة على الشاشة', banner);
  // 2) نقلها إلى خط الموجب: يختفي الخطأ
  await p.evaluate(([C0,C,y])=>{ __part(C0,0,C,y,'#d8b98e'); __draw(0,0,0); },[C0,C,railY('plus')]);
  const b2=await settle(r=>r.reach&&r.reach.resistor==='right'&&r.committed!=='resistor_in_minus');
  t('رجل المقاومة في خط الموجب: لا خطأ', b2.reach&&b2.reach.resistor==='right' && b2.committed!=='resistor_in_minus', JSON.stringify(b2));
  // 3) اللمبة: الرجل القصيرة في خط الموجب
  await p.evaluate(()=>__coach.enterStep(2));
  await p.evaluate(([C0,LC,y])=>{ __part(C0,2,LC,y,'#e8e8e8'); __draw(0,0,0); },[C0,LC,railY('plus')]);
  const c=await settle(r=>r.committed==='led_short_in_plus');
  t('رجل اللمبة القصيرة في خط الموجب: خطأ مؤكد', c.committed==='led_short_in_plus', JSON.stringify(c));
  await p.evaluate(([C0,LC,y])=>{ __part(C0,2,LC,y,'#e8e8e8'); __draw(0,0,0); },[C0,LC,railY('minus')]);
  const d=await settle(r=>r.reach&&r.reach.led==='right'&&r.committed!=='led_short_in_plus');
  t('رجل اللمبة القصيرة في خط السالب: لا خطأ', d.reach&&d.reach.led==='right' && d.committed!=='led_short_in_plus', JSON.stringify(d));
  // 4) يد حقيقية تتحرك ما زالت تُكتشف
  await p.evaluate(()=>{ __noPart(); __draw(0,0,0); });
  await tick(10);
  const hand=await p.evaluate(async()=>{ const c=__src.getContext('2d'); let seen=false; for(let i=0;i<12;i++){ __draw(0,0,0); c.fillStyle='#e0a57e'; c.beginPath(); c.ellipse(560+i*12,560,90,60,0,0,7); c.fill(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); if(__coach.S.view==='hand') seen=true; } return seen; });
  t('يد تتحرك فوق اللوحة: ما زالت تُكتشف كيد', hand);
  t('لا أخطاء جافاسكربت في الصفحة', errs.length===0, errs.join(' | '));
  await b.close(); console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail?1:0);
})();
