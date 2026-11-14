const {chromium}=require('playwright'); const fs=require('fs'), path=require('path');
const LIB=process.env.LIB, FR=process.argv[2], OUT=process.argv[3]; const meta=JSON.parse(fs.readFileSync(path.join(FR,'meta.json')));
const TAPS=[[1140.5,646],[113,656.4],[118,474.3],[1133.75,466.5]], RP=[[600,699],[600,715]];
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1366,height:1024}});
  p.on('pageerror',e=>console.log('pageerror',e.message));
  await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await p.route(/onnxruntime-web@1\.26\.0\/dist\/(.*)$/,r=>{const f=r.request().url().match(/dist\/([^?]*)/)[1]; r.fulfill({path:path.join(LIB,'ort/dist',f),contentType:f.endsWith('.wasm')?'application/wasm':'text/javascript',headers:{'access-control-allow-origin':'*'}})});
  await p.route(/opencv\.js/,r=>r.fulfill({path:path.join(LIB,'ocv/dist/opencv.js'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  await p.route(/frames2\//,r=>r.fulfill({path:path.join(FR,r.request().url().split('frames2/')[1]),contentType:'image/jpeg'}));
  await p.goto('http://127.0.0.1:8123/coach/'); await p.waitForFunction(()=>window.__coach&&__coach.S.ortReady&&__coach.S.cvReady,null,{timeout:120000});
  await p.click('#colsSeg button[data-v="63"]');
  const draw=async i=>p.evaluate(async i=>{ const im=new Image(); im.src='frames2/s'+i+'.jpg'; await im.decode(); if(!window.__src){ window.__src=document.createElement('canvas'); __src.width=im.width; __src.height=im.height; } __src.getContext('2d').drawImage(im,0,0); },i);
  await draw(0); await p.evaluate(()=>__coach.useSource(__src,'image'));
  const box=await p.locator('#cv').boundingBox(), s=box.width/1280;
  for(const t of TAPS.concat(RP)) await p.mouse.click(box.x+t[0]*s, box.y+t[1]*s);
  await p.click('#setupDone');
  // EARLY WARNING: hand moving over the board while the red wire end sits in the minus rail
  await p.evaluate(()=>__coach.enterStep(3));
  const ew=[];
  for(let f=0;f<40;f++){
    await p.evaluate(async f=>{ const im=new Image(); im.src='frames2/s2.jpg'; await im.decode(); const g=__src.getContext('2d'); g.drawImage(im,0,0);
      g.fillStyle='rgb(214,160,130)'; g.beginPath(); g.ellipse(700+f*6,560,110,70,0,0,7); g.fill(); g.fillRect(640+f*6,600,120,360); },f);
    await p.waitForTimeout(120);
    ew.push(await p.evaluate(()=>({view:__coach.S.view, raw:__coach.S.ev&&__coach.S.ev.railEnds.red, early:__coach.S.early, committed:__coach.S.committed&&__coach.S.committed.code})));
  }
  console.log('EARLY', JSON.stringify(ew.filter((x,i)=>i%5==0)));
  await draw(2); await p.waitForTimeout(2600);
  console.log('AFTER HAND LEAVES', JSON.stringify(await p.evaluate(()=>({view:__coach.S.view, early:__coach.S.early, committed:__coach.S.committed&&__coach.S.committed.code, events:__coach.S.session.events.map(e=>e.type+':'+(e.code||''))}))));
  const res=[];
  for(const m of meta.slice(0,0)){
    await p.evaluate(()=>__coach.enterStep(4)); // black-wire step: judges both wires
    await draw(m.i); await p.waitForTimeout(2600);
    const st=await p.evaluate(()=>({ends:__coach.S.ev.railEnds, view:__coach.S.view, committed:__coach.S.committed, chip:document.getElementById('chip').textContent}));
    const pass=st.ends.red===m.exp.red && st.ends.black===m.exp.black;
    res.push({name:m.name, exp:m.exp, got:st.ends, view:st.view, committed:st.committed&&st.committed.code, chip:st.chip, pass});
    await p.screenshot({path:OUT.replace('.json',`-${m.name}.png`)});
  }
  // safety gate: correct scene, manual boxes ticked -> must still depend on camera; short scene must be blocked
  fs.writeFileSync(OUT,JSON.stringify(res,null,1)); await b.close();
  for(const r of res) console.log(r.pass?'PASS':'FAIL', r.name, 'exp', JSON.stringify(r.exp), 'got', JSON.stringify(r.got), r.view, r.committed, '|', r.chip);
})();
