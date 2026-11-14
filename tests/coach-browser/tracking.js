// Drives /coach/ in headless Chromium with frames from real photos + synthetic motion. node harness.js <framesDir> <outJson>
const {chromium}=require('playwright'); const fs=require('fs'), path=require('path');
const LIB=process.env.LIB, BASE='http://127.0.0.1:8123/coach/';
const [,,FR,OUT]=process.argv; const gt=JSON.parse(fs.readFileSync(path.join(FR,'gt.json')));
const TAPS=JSON.parse(process.env.TAPS), RAILPTS=JSON.parse(process.env.RAILPTS), COLS=+process.env.COLS||63;
const ap=(H,x,y)=>{const w=H[6]*x+H[7]*y+H[8];return[(H[0]*x+H[1]*y+H[2])/w,(H[3]*x+H[4]*y+H[5])/w]};
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1366,height:1024}});
  p.on('console',m=>{ if(m.type()==='error') console.log('console:',m.text().slice(0,200)); }); p.on('pageerror',e=>console.log('pageerror',e.message));
  await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@1\.26\.0\/dist\/(.*)$/,r=>{const f=r.request().url().match(/dist\/([^?]*)/)[1]; r.fulfill({path:path.join(LIB,'ort/dist',f), contentType:f.endsWith('.wasm')?'application/wasm':'text/javascript', headers:{'access-control-allow-origin':'*'}})});
  await p.route(/opencv-js@4\.10\.0-release\.1\/dist\/opencv\.js/,r=>r.fulfill({path:path.join(LIB,'ocv/dist/opencv.js'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  await p.route(/frames\//,r=>{const f=r.request().url().split('frames/')[1]; r.fulfill({path:path.join(FR,f),contentType:'image/jpeg'})});
  await p.goto(BASE); await p.waitForFunction(()=>window.__coach&&__coach.S.ortReady&&__coach.S.cvReady,null,{timeout:120000});
  await p.evaluate(c=>{ document.querySelector(`#colsSeg button[data-v="${c}"]`).click(); },String(COLS));
  // frame 0 -> canvas source
  await p.evaluate(async()=>{ window.__src=document.createElement('canvas'); const im=new Image(); im.src='frames/f000.jpg'; await im.decode(); __src.width=im.width; __src.height=im.height; __src.getContext('2d').drawImage(im,0,0); __coach.useSource(__src,'image'); });
  const H0=gt[0].H; const taps=TAPS.map(t=>ap(H0,t[0],t[1])), rp=RAILPTS.map(t=>ap(H0,t[0],t[1]));
  // calibrate via real taps on the canvas (same code path as a finger)
  const box=await p.locator('#cv').boundingBox(), sx=box.width/1280, sy=box.height/960;
  for(const t of taps.concat(rp)) await p.mouse.click(box.x+t[0]*sx, box.y+t[1]*sy);
  const setupOk=await p.evaluate(()=>!document.getElementById('setupDone').disabled);
  const railsB=await p.evaluate(()=>__coach.S.rails);
  await p.screenshot({path:OUT.replace('.json','-setup.png')});
  await p.evaluate(()=>{ document.getElementById('setupDone').click(); });
  await p.evaluate(()=>{ __coach.enterStep(3); }); // red-wire step: overlay + wire judgment visible
  const res=[];
  for(const g of gt){
    await p.evaluate(async i=>{ const im=new Image(); im.src='frames/f'+String(i).padStart(3,'0')+'.jpg'; await im.decode(); __src.getContext('2d').drawImage(im,0,0); },g.i);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
    const st=await p.evaluate(()=>({H:__coach.S.H, view:__coach.S.view, ok:__coach.S.track.ok, inl:__coach.S.track.inl, ends:__coach.S.ev&&__coach.S.ev.railEnds, needRecal:!!__coach.S.needRecal, iou:__coach.S.boardIou, bb:__coach.S.boardBox, motion:__coach.S.motion, skin:__coach.S.skin}));
    const err=TAPS.map((t,k)=>{ const a=ap(g.H,t[0],t[1]); const c=[[0,0],[COLS-1,0],[COLS-1,11],[0,11]][k]; const b2=ap(st.H,c[0],c[1]); return Math.hypot(a[0]-b2[0],a[1]-b2[1]); });
    res.push({i:g.i,tag:g.tag,view:st.view,track:st.ok,inl:st.inl,ends:st.ends,needRecal:st.needRecal,iou:st.iou,bb:st.bb,err:Math.max(...err),motion:st.motion,skin:st.skin});
    if([0,30,55,90,120,145].includes(g.i)) await p.screenshot({path:OUT.replace('.json',`-f${g.i}.png`)});
  }
  fs.writeFileSync(OUT,JSON.stringify({setupOk,railsB,res},null,0)); await b.close();
})();
