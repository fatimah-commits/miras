// Full session through the real UI (buttons/taps), frames = real photo + painted wires.
const {chromium}=require('playwright'); const fs=require('fs'), path=require('path');
const LIB=process.env.LIB, FR=process.argv[2], OUT=process.argv[3];
const TAPS=[[1140.5,646],[113,656.4],[118,474.3],[1133.75,466.5]], RP=[[600,699],[600,715]];
const log=[]; const L=(...a)=>{ console.log(...a); log.push(a.join(' ')); };
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1180,height:820}});
  p.on('pageerror',e=>L('PAGEERROR',e.message)); p.on('dialog',d=>{ L('dialog:',d.message().slice(0,40)); d.accept(d.type()==='prompt'?'9001':undefined); });
  await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await p.route(/onnxruntime-web@1\.26\.0\/dist\/(.*)$/,r=>{const f=r.request().url().match(/dist\/([^?]*)/)[1]; r.fulfill({path:path.join(LIB,'ort/dist',f),contentType:f.endsWith('.wasm')?'application/wasm':'text/javascript',headers:{'access-control-allow-origin':'*'}})});
  await p.route(/opencv\.js/,r=>r.fulfill({path:path.join(LIB,'ocv/dist/opencv.js'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  await p.route(/frames2\//,r=>r.fulfill({path:path.join(FR,r.request().url().split('frames2/')[1]),contentType:'image/jpeg'}));
  await p.goto('http://127.0.0.1:8123/coach/'); await p.waitForFunction(()=>window.__coach&&__coach.S.ortReady&&__coach.S.cvReady,null,{timeout:120000});
  L('report before any session:', (await p.textContent('#repBody')).trim());
  const draw=async i=>p.evaluate(async i=>{ const im=new Image(); im.src='frames2/s'+i+'.jpg'; await im.decode(); if(!window.__src){ window.__src=document.createElement('canvas'); __src.width=im.width; __src.height=im.height; } __src.getContext('2d').drawImage(im,0,0); },i);
  const state=async()=>p.evaluate(()=>({step:__coach.S.step&&__coach.S.step.id, st:document.getElementById('stepState').textContent, chip:document.getElementById('chip').textContent}));
  const shot=n=>p.screenshot({path:`${OUT}-${n}.png`});
  for(const mode of ['train','test']){
    await p.click(`#modeSeg button[data-v="${mode}"]`); await p.click('#colsSeg button[data-v="63"]'); await p.fill('#trainee', mode==='train'?'متدرب تجريبي ١':'متدرب تجريبي ٢');
    await draw(0); await p.evaluate(()=>__coach.useSource(__src,'image'));
    const box=await p.locator('#cv').boundingBox(), s=box.width/1280;
    for(const t of TAPS.concat(RP)) await p.mouse.click(box.x+t[0]*s, box.y+t[1]*s);
    if(mode==='train') await shot('1-setup');
    await p.click('#setupDone');
    L(mode,'prep next disabled before USB tick:', await p.isDisabled('#nextBtn'));
    await p.check('#usbOff'); await p.click('#nextBtn');
    if(mode==='train'){
      await p.waitForTimeout(2500); L('resistor step:', JSON.stringify(await state())); await shot('2-resistor');
      await p.waitForTimeout(8000); L('manual visible after 8s+:', await p.isVisible('#manualBtn'));
      if(await p.isVisible('#manualBtn')) await p.click('#manualBtn');
      await p.waitForTimeout(2500); L('led step:', JSON.stringify(await state())); await shot('3-led');
      await p.waitForTimeout(8500); if(await p.isVisible('#manualBtn')) await p.click('#manualBtn'); else await p.evaluate(()=>__coach.enterStep(3));
      L('now:', JSON.stringify(await state()));
      await draw(2); await p.waitForTimeout(2500); L('red into minus:', JSON.stringify(await state())); await shot('4-red-wrong');
      await draw(1); await p.waitForTimeout(3600); L('red fixed:', JSON.stringify(await state()));
      await draw(4); await p.waitForTimeout(2500); L('black into plus (short):', JSON.stringify(await state())); await shot('5-short');
      await draw(3); await p.waitForTimeout(3600); L('black fixed:', JSON.stringify(await state()));
      await p.waitForTimeout(800); await shot('6-gate');
      L('gate lines:', (await p.textContent('#gateList')).replace(/\s+/g,' '));
      await p.click('#allowBtn'); await p.waitForTimeout(500); L('after allow (no manual):', (await p.textContent('#banner')));
      await p.check('#mResistor'); await p.check('#mLed'); await p.waitForTimeout(800);
      L('gate lines after manual:', (await p.textContent('#gateList')).replace(/\s+/g,' '));
      await p.click('#allowBtn'); await p.waitForTimeout(500); L('after allow (manual ticked):', (await p.textContent('#banner')), JSON.stringify(await state()));
      if(!(await p.isVisible('#powerBox'))){ await p.click('#overrideBtn'); await p.waitForTimeout(500); }
      L('power box visible:', await p.isVisible('#powerBox')); await shot('7-power');
      await p.click('#litYes'); await p.waitForTimeout(500); L('result:', (await p.textContent('#result')).replace(/\s+/g,' '));
      await shot('8-result'); await p.click('#againBtn');
    } else {
      await p.waitForTimeout(1500); L('test build:', JSON.stringify(await state()), 'targets hidden? chip=', (await state()).chip);
      await shot('9-test-build');
      await draw(4); await p.waitForTimeout(1500); await p.click('#finishBuild'); await p.waitForTimeout(2500);
      await p.click('#allowBtn'); await p.waitForTimeout(400); L('test gate (short):', await p.textContent('#banner'));
      await p.waitForTimeout(2600); L('back to build:', JSON.stringify(await state()));
      await draw(3); await p.click('#finishBuild'); await p.waitForTimeout(2500); await p.check('#mResistor'); await p.check('#mLed');
      await p.click('#allowBtn'); await p.waitForTimeout(400); L('test gate 2:', await p.textContent('#banner'));
      await p.click('#endBtn'); await p.waitForTimeout(400); L('test result:', (await p.textContent('#result')).replace(/\s+/g,' '));
    }
  }
  L('REPORT:', (await p.textContent('#repBody')).replace(/\s+/g,' ')); await p.locator('#report').screenshot({path:`${OUT}-report.png`});
  fs.writeFileSync(OUT+'.log', log.join('\n')); await b.close();
})();
