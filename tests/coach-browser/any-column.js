// المدرب المباشر (19 نوفمبر): القطع تُقبل في أي عمود، والحكم بالتوصيل الكهربائي لا بمكان ثابت. لوحة مرسومة داخل الصفحة، بلا صور حقيقية.
// التشغيل: python3 -m http.server 8123 (من جذر المستودع)، ثم
//   LIB=<مجلد فيه ocv/dist/opencv.js و ort/dist> NODE_PATH=$(npm root -g) node tests/coach-browser/any-column.js
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
  // قطع مرسومة تبقى معاً على اللوحة: كل قطعة = رجلان معدنيتان في فتحتين + جسم بين الرجلين
  await p.evaluate(()=>{
    window.__clean=document.createElement('canvas'); __clean.width=__bg.width; __clean.height=__bg.height; __clean.getContext('2d').drawImage(__bg,0,0);
    const g=__bg.getContext('2d'), I=(c,y)=>{ const q=__coach.B.apply(__coach.S.H,c,y); return [q[0]+200,q[1]+200]; };
    window.__parts=(list)=>{ g.drawImage(__clean,0,0);
      for(const [c0,y0,c1,y1,body] of list){ const a=I(c0,y0), z=I(c1,y1);
        g.strokeStyle='#c9ccd0'; g.lineWidth=2.5; g.beginPath(); g.moveTo(...a); g.lineTo(...z); g.stroke();
        for(const q of [a,z]){ g.fillStyle='#d2d5d9'; g.beginPath(); g.arc(q[0],q[1],3.6,0,7); g.fill(); }
        const mx=(a[0]+z[0])/2, my=(a[1]+z[1])/2; g.fillStyle=body; g.fillRect(mx-6,my-9,12,18); }
      __draw(0,0,0); };
  });
  const rail=k=>s0.rails[k];
  // a rail column that really has a hole in the drawing (the drawn rails skip every 6th hole)
  const railCol=c=>p.evaluate(c=>{ const S=__coach.S, q=__coach.B.apply(S.H,c,S.rails.plus), d=__exp(0,0,0,0,0), e=__exp(1,0,0,0,0); return Math.round((q[0]-d[0])/(e[0]-d[0]))%6!==5; },c);
  const rc=async c=>(await railCol(c))?c:c+1;
  const settle=async(want,ms=7000)=>{ const t0=Date.now(); let r;
    while(Date.now()-t0<ms){ await p.waitForTimeout(250); r=await p.evaluate(()=>({view:__coach.S.view, committed:__coach.S.committed&&__coach.S.committed.code, state:__coach.S.committed&&__coach.S.committed.state, place:__coach.S.place&&{r:__coach.S.place.resistor&&__coach.S.place.resistor.code, l:__coach.S.place.led&&__coach.S.place.led.code, net:__coach.S.place.resistor&&__coach.S.place.resistor.net}, legs:JSON.stringify(__coach.S.parts), alert:!document.getElementById('alert').hidden&&document.getElementById('alert').className})); if(want(r)) break; } return r; };
  const RES='#d8b98e', LED='#e8e8e8';
  // ---------- المقاومة في عمود غير 10 ----------
  const X=19, RX=await rc(X);       // board x 19 = column 20 (or the next column with a drawn rail hole)
  await p.evaluate(()=>{ __coach.S.autoAdvanceOff=true; __coach.enterStep(1); });
  await p.evaluate(([X,y])=>__parts([[X,0,X,y,'#d8b98e']]),[RX,rail('plus')]);
  let r=await settle(r=>r.committed==='resistor_ok');
  t(`المقاومة في العمود ${RX+1} (ليس 10): صحيحة`, r.committed==='resistor_ok' && r.state==='ok', JSON.stringify(r));
  t('الشريط المتصل هو عمود المقاومة نفسه', r.place && r.place.net==='T'+(RX+1), JSON.stringify(r.place));
  t('بطاقة النتيجة الخضراء ظاهرة فوق الصورة', /ok/.test(r.alert||''), r.alert);
  // ---------- اللمبة: صحيحة في أي فتحة من عمود المقاومة وأي فتحة من خط السالب ----------
  const LX=await rc(RX+6);
  await p.evaluate(()=>__coach.enterStep(2));
  await p.evaluate(([X,y,LX,ym])=>__parts([[X,0,X,y,'#d8b98e'],[X,3,LX,ym,'#e8e8e8']]),[RX,rail('plus'),LX,rail('minus')]);
  r=await settle(r=>r.committed==='led_ok');
  t('اللمبة: رجل في عمود المقاومة (صف 4) والأخرى في خط السالب بعيداً: صحيحة', r.committed==='led_ok', JSON.stringify(r));
  // الرجل القصيرة في خط الموجب
  await p.evaluate(()=>__coach.enterStep(2));
  await p.evaluate(([X,y,LX])=>__parts([[X,0,X,y,'#d8b98e'],[X,3,LX,y,'#e8e8e8']]),[RX,rail('plus'),LX]);
  r=await settle(r=>r.committed==='led_short_in_plus');
  t('اللمبة: الرجل الثانية في خط الموجب: خطأ مؤكد', r.committed==='led_short_in_plus' && r.state==='bad', JSON.stringify(r));
  t('بطاقة الخطأ الحمراء ظاهرة فوق الصورة', /bad/.test(r.alert||''), r.alert);
  // عبر المجرى الأوسط: نفس رقم العمود، جهة أخرى
  await p.evaluate(()=>__coach.enterStep(2));
  await p.evaluate(([X,y,LX,ym])=>__parts([[X,0,X,y,'#d8b98e'],[X,8,LX,ym,'#e8e8e8']]),[RX,rail('plus'),LX,rail('minus')]);
  r=await settle(r=>r.committed==='led_other_half');
  t('اللمبة عبر المجرى الأوسط: خطأ «الجهة الأخرى»', r.committed==='led_other_half', JSON.stringify(r));
  // عمود آخر غير متصل بالمقاومة
  await p.evaluate(()=>__coach.enterStep(2));
  await p.evaluate(([X,y,LX,ym])=>__parts([[X,0,X,y,'#d8b98e'],[X+3,2,LX,ym,'#e8e8e8']]),[RX,rail('plus'),LX,rail('minus')]);
  r=await settle(r=>r.committed==='led_not_series');
  t('اللمبة في عمود غير عمود المقاومة: خطأ «ليست في عمود المقاومة»', r.committed==='led_not_series', JSON.stringify(r));
  // الرجل الثانية داخل اللوحة لا في خط السالب
  await p.evaluate(()=>__coach.enterStep(2));
  await p.evaluate(([X,y])=>__parts([[X,0,X,y,'#d8b98e'],[X,2,X+4,2,'#e8e8e8']]),[RX,rail('plus')]);
  r=await settle(r=>r.committed==='led_open');
  t('اللمبة: الرجل الثانية ليست في خط السالب: خطأ «الدائرة مفتوحة»', r.committed==='led_open', JSON.stringify(r));
  // ---------- أخطاء المقاومة ----------
  await p.evaluate(()=>__coach.enterStep(1));
  await p.evaluate(([X])=>__parts([[X,0,X,3,'#d8b98e']]),[RX+10]);
  r=await settle(r=>r.committed==='resistor_shorted');
  t('رجلا المقاومة في العمود نفسه: خطأ «متصلتان ببعض»', r.committed==='resistor_shorted', JSON.stringify(r));
  await p.evaluate(()=>__coach.enterStep(1));
  const MX=await rc(40);
  await p.evaluate(([X,y])=>__parts([[X,0,X,y,'#d8b98e']]),[MX,rail('minus')]);
  r=await settle(r=>r.committed==='resistor_in_minus');
  t(`رجل المقاومة في خط السالب عند العمود ${MX+1}: خطأ مؤكد`, r.committed==='resistor_in_minus', JSON.stringify(r));
  await p.evaluate(()=>__coach.enterStep(1));
  await p.evaluate(([X])=>__parts([[X,0,X+4,0,'#d8b98e']]),[RX]);
  r=await settle(r=>r.committed==='resistor_no_rail');
  t('المقاومة داخل اللوحة بلا خط الموجب: خطأ', r.committed==='resistor_no_rail', JSON.stringify(r));
  // ---------- تنبيه قبل الخطأ: اليد ما زالت فوق اللوحة ----------
  await p.evaluate(()=>__coach.enterStep(1));
  const early=await p.evaluate(async([X,y])=>{ __parts([[X,0,X,y,'#d8b98e']]); const c=__src.getContext('2d'); let seen=null;
    for(let i=0;i<30 && !seen;i++){ __draw(0,0,0); c.fillStyle='#e0a57e'; c.beginPath(); const q=__coach.B.apply(__coach.S.H,X+7,3); c.ellipse(q[0]+(i%2)*14,q[1],60,45,0,0,7); c.fill(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); if(__coach.S.early) seen=__coach.S.early+'|'+__coach.S.view; } return seen; },[MX,rail('minus')]);
  t('تنبيه قبل الخطأ: رجل المقاومة دخلت خط السالب واليد ما زالت فوق اللوحة', /early_resistor_minus/.test(early||''), early);
  // ---------- إعادة ضبط اللوحة في منتصف الجلسة: نفس الخطوة وما رُكّب محفوظ ----------
  await p.evaluate(()=>__coach.enterStep(1));
  await p.evaluate(([X,y])=>__parts([[X,0,X,y,'#d8b98e']]),[RX,rail('plus')]);
  await settle(r=>r.committed==='resistor_ok');
  await p.evaluate(()=>__coach.enterStep(2));
  await p.evaluate(()=>document.getElementById('recalBtn').click());
  await p.waitForFunction(()=>__coach.S.autoDone && !document.getElementById('setupDone').disabled,null,{timeout:40000}).catch(()=>{});
  await p.evaluate(()=>document.getElementById('setupDone').click());
  const rs=await p.evaluate(()=>({step:__coach.S.step&&__coach.S.step.id, res:__coach.S.parts.resistor&&__coach.S.parts.resistor.legs&&__coach.S.parts.resistor.legs.length}));
  t('بعد «إعادة ضبط اللوحة»: نرجع لخطوة اللمبة نفسها والمقاومة محفوظة', rs.step==='led' && rs.res===2, JSON.stringify(rs));
  await p.evaluate(([X,y,LX,ym])=>__parts([[X,0,X,y,'#d8b98e'],[X,3,LX,ym,'#e8e8e8']]),[RX,rail('plus'),LX,rail('minus')]);
  r=await settle(r=>r.committed==='led_ok');
  t('بعد إعادة الضبط: اللمبة تُفحص وتُقبل', r.committed==='led_ok', JSON.stringify(r));
  // ---------- الصوت ----------
  const v=await p.evaluate(()=>({onWork:__coach.voiceAllowed(), }));
  await p.evaluate(()=>document.getElementById('endBtn').click());
  const v2=await p.evaluate(()=>({afterEnd:__coach.voiceAllowed()}));
  t('الصوت مسموح في شاشة الكاميرا أثناء الجلسة فقط', v.onWork===true && v2.afterEnd===false, JSON.stringify([v,v2]));
  t('لا أخطاء جافاسكربت في الصفحة', errs.length===0, errs.join(' | '));
  await b.close(); console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail?1:0);
})();
