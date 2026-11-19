// المدرب المباشر: رجوع الإرشادات فوق اللوحة تلقائياً بعد تحرّك الجهاز، بلا أي صور حقيقية (لوحة مرسومة داخل الصفحة).
// التشغيل: python3 -m http.server 8123 (من جذر المستودع)، ثم
//   LIB=<مجلد فيه ocv/dist/opencv.js و ort/dist> NODE_PATH=$(npm root -g) node tests/coach-browser/retrack.js
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
  await p.evaluate(()=>{ document.getElementById('setupDone').click(); __coach.enterStep(3); });
  await tick(20);
  // خطأ الإرشادات بالبكسل: يقارن زوايا اللوحة كما تراها المنصة بمكانها الحقيقي (أي اتجاه للوحة مقبول ما دام ثابتاً)
  const err=(dx,dy,ang)=>p.evaluate(([dx,dy,ang])=>{ const S=__coach.S, B=__coach.B, C=B.calibHoles(S.cols); const got=C.map(q=>B.apply(S.H,q[0],q[1]));
    const exp=[[0,0],[62,0],[62,11],[0,11]].map(q=>__exp(q[0],q[1],dx,dy,ang)), expR=[exp[2],exp[3],exp[0],exp[1]];
    const e=E=>Math.max(...got.map((g,i)=>Math.hypot(g[0]-E[i][0],g[1]-E[i][1])));
    return {e:Math.min(e(exp),e(expR)), same:e(exp)<=e(expR), ok:S.track.ok, rails:S.rails}; },[dx,dy,ang]);
  const e0=await err(0,0,0); const flip0=e0.same;
  t('بعد المعايرة: الإرشادات فوق اللوحة', e0.ok && e0.e<4, JSON.stringify(e0));
  // ثبات: 3 ثوانٍ بلا حركة، التصحيح الدوري لا يحرّك الإرشادات
  for(let i=0;i<6;i++){ await p.waitForTimeout(500); } const e1=await err(0,0,0);
  t('بلا حركة: الإرشادات لا ترتجف ولا تنزاح', e1.ok && e1.e<4, JSON.stringify(e1));
  // هزّة: الجهاز يبتعد عن اللوحة لحظة ثم يرجع وقد تحرّك 45×30 بكسل ودار 3 درجات
  const shake=async(dx,dy,ang,ms)=>{ await p.evaluate(()=>__draw(0,0,0,true)); await tick(12); await p.evaluate(([dx,dy,ang])=>__draw(dx,dy,ang),[dx,dy,ang]); const t0=Date.now(); let r;
    while(Date.now()-t0<ms){ await p.waitForTimeout(250); r=await err(dx,dy,ang); if(r.ok && r.e<6) break; } return {...r, secs:(Date.now()-t0)/1000}; };
  const lostSeen=await p.evaluate(async()=>{ __draw(0,0,0,true); await new Promise(r=>setTimeout(r,600)); return !__coach.S.track.ok; });
  t('عند ابتعاد الجهاز: المنصة تعرف أنها فقدت اللوحة (لا تحكم)', lostSeen);
  const r1=await shake(45,30,3,6000);
  t('بعد الهزّة: ترجع الإرشادات وحدها (بالنقاط المميزة)', r1.ok && r1.e<6, JSON.stringify(r1));
  // بلا مرجع النقاط المميزة: يجب أن ترجع بالتعرّف على شبكة الفتحات نفسها
  await p.evaluate(()=>{ __coach.S.orbRef=null; __coach.S.orbRecent=null; });
  const r2=await shake(-60,20,-4,8000);
  t('بعد الهزّة ودون نقاط مميزة: ترجع بالتعرّف على الفتحات', r2.ok && r2.e<8, JSON.stringify(r2));
  t('اتجاه اللوحة لم ينقلب (خط + وخط − في مكانهما)', r2.same===flip0 && JSON.stringify(r2.rails)===JSON.stringify(s0.rails), JSON.stringify({r2,s0}));
  // لا لوحة أبداً: لا تخمين
  await p.evaluate(()=>__draw(0,0,0,true)); await p.waitForTimeout(3000);
  const st=await p.evaluate(()=>({ok:__coach.S.track.ok, view:__coach.S.view}));
  t('بلا لوحة في الصورة: تبقى «لا أرى اللوحة» ولا تخمّن', !st.ok && st.view==='lost', JSON.stringify(st));
  // زر إعادة الضبط ما زال يعمل
  await p.evaluate(()=>{ __draw(0,0,0); document.getElementById('recalBtn').click(); });
  await p.waitForFunction(()=>__coach.S.phase==='setup' && __coach.S.autoDone,null,{timeout:20000}).catch(()=>{});
  t('زر «إعادة ضبط اللوحة» ما زال يعمل', await p.evaluate(()=>__coach.S.phase==='setup' && __coach.S.autoDone));
  t('لا أخطاء جافاسكربت في الصفحة', errs.length===0, errs.join(' | '));
  await b.close(); console.log(`\n${pass} نجح، ${fail} فشل`); process.exit(fail?1:0);
})();
