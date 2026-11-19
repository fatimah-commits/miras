/* مراس · المدرب المباشر — runtime: camera, board tracking, overlay, steps, safety gate, report.
   Pure rules live in board.js (MirasBoard). Model = ../lab/miras-parts.onnx (same model as the lab page). */
(function(){
'use strict';
const B = window.MirasBoard;
const $ = id => document.getElementById(id);
const MODEL_URL = window.MIRAS_MODEL_URL || '../lab/miras-parts.onnx';
const CV_URL = window.MIRAS_CV_URL || 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
const CV_SRI = 'sha384-XsTfGA62I8LzqS3D7IcgiSOCrJuECWLcg4s1M0AnrkDCcJ8lXX+j+qdg+o6t7KZa';
const NAMES = ['board','led','arduino','resistor','wire'];
const STORE = 'miras_coach_v1';
const PW = 640;                       // processing width
const STABLE_MS = 600, COMMIT_MS = 700, DET_EVERY = 300, DET_MAX_AGE = 1600;

/* ---------------- state ---------------- */
const S = {
  mode:'train', cols:30, trainee:'',
  src:null, srcW:0, srcH:0, kind:null,              // kind: 'cam' | 'video' | 'image'
  phase:'start',                                    // start | setup | steps | gate | power | done
  taps:[], rails:null, H:null, Hcal:null, calBox:null,
  drag:-1,
  stepIdx:0, step:null,
  ref:null, rect:null, prevGray:null,
  view:'lost', lastMove:0, lostSince:0,
  dets:[], detAt:0, detBusy:false, detMs:0, boardMiss:0,
  committed:null, cand:null, candSince:0,
  early:null, earlyN:0,
  confirm:null,                                     // trainer confirmation returned by the server (never set by the trainee)
  gatePassSince:0, unknownSince:0,
  session:null, t0:0, attempts:0,
  muted:false, lastSay:'', lastSayAt:0,
  track:{ok:false, pts:null, prev:null, n:0, inl:0}, cvReady:false, ortReady:false,
  fps:0, _fpsN:0, _fpsT:0
};
const cvs = $('cv'), ctx = cvs.getContext('2d');
const pc = document.createElement('canvas'), pctx = pc.getContext('2d', {willReadFrequently:true});
let session = null;

/* ---------------- messages (Arabic) ---------------- */
const MSG = {
  lost:['لا أرى اللوحة بوضوح','وجّه الكاميرا نحو اللوحة، أو اضغط «إعادة ضبط اللوحة».','لا أرى اللوحة بوضوح. وجّه الكاميرا نحو اللوحة.'],
  hand:['اليد فوق اللوحة، أنتظر','لن أحكم حتى تبتعد اليد وتثبت الصورة.',''],
  moving:['الصورة تتحرك، أنتظر','أنتظر حتى تثبت الصورة ثم أفحص.',''],
  resistor_ok:['تم التأكد: المقاومة في مكانها','النموذج رأى المقاومة عند العمود المطلوب. قيمتها تؤكَّد يدوياً قبل التشغيل.','ممتاز، تم التأكد من هذه الخطوة.'],
  resistor_ok_hole:['تم التأكد: المقاومة في مكانها','النموذج رأى المقاومة، وتغيّرت الفتحة المطلوبة. قيمتها تؤكَّد يدوياً قبل التشغيل.','ممتاز، تم التأكد من هذه الخطوة.'],
  resistor_far:['اشتباه: المقاومة ليست في العمود المطلوب','النموذج رأى المقاومة بعيداً عن المكان المضيء. انقلها إلى العمود المحدد.','انتبه، هذا الصف غير صحيح. ضع المقاومة في المكان المضيء.'],
  resistor_unseen:['لا أرى المقاومة بعد','ضعها في المكان المضيء. إن كانت موضوعة ولم تظهر، فالنموذج لم يتعرف عليها.',''],
  resistor_in_minus:['خطأ: رجل المقاومة في خط السالب','رجل المقاومة يجب أن تكون في خط الموجب (+). في خط السالب لن تضيء اللمبة.','انتبه، المقاومة في الخط المعاكس. انقل رجلها إلى خط الموجب.'],
  led_short_in_plus:['خطأ: رجل اللمبة القصيرة في خط الموجب','الرجل القصيرة مكانها خط السالب (−). في خط الموجب لن تضيء اللمبة.','انتبه، رجل اللمبة القصيرة في الخط المعاكس. انقلها إلى خط السالب.'],
  led_ok:['تم التأكد: اللمبة في مكانها','النموذج رأى اللمبة قرب المكان المطلوب. اتجاه الأرجل يؤكَّد يدوياً.','ممتاز، تم التأكد من هذه الخطوة.'],
  led_far:['اشتباه: اللمبة ليست في مكانها','النموذج رأى اللمبة بعيداً عن المكان المضيء.','انتبه، هذا المكان غير صحيح. ضع اللمبة في المكان المضيء.'],
  led_unseen:['لا أرى اللمبة بعد','ضعها في المكان المضيء.',''],
  red_ok:['تم التأكد: الأحمر في خط الموجب','طرف السلك الأحمر داخل خط الموجب (+).','ممتاز، تم التأكد من هذه الخطوة.'],
  red_in_minus:['خطأ: الأحمر في خط السالب','السلك الأحمر (5V) في خط السالب. القطبية ستنعكس واللمبة لن تضيء. انقله إلى خط الموجب.','انتبه، السلك الأحمر في خط السالب. انقله إلى خط الموجب.'],
  red_unclear:['اشتباه: لا أعرف أين ينتهي الأحمر','السلك يمر فوق الخطين. أبعده عن وسط اللوحة ليظهر طرفه.',''],
  red_unseen:['لا أرى السلك الأحمر في خطي الطاقة','وصّل الأحمر من منفذ 5V إلى خط الموجب المضيء.',''],
  black_ok:['تم التأكد: الأسود في خط السالب','الأحمر في الموجب والأسود في السالب.','ممتاز، تم التأكد من هذه الخطوة.'],
  black_ok_red_missing:['اشتباه: الأسود في مكانه لكن لا أرى الأحمر','تأكد أن السلك الأحمر ما زال في خط الموجب.',''],
  black_in_plus:['خطأ: الأسود في خط الموجب','السلك الأسود (GND) مكانه خط السالب (−).','توقف، السلك الأسود في خط الموجب. مكانه خط السالب.'],
  black_unclear:['اشتباه: لا أعرف أين ينتهي الأسود','أبعد السلك عن وسط اللوحة ليظهر طرفه.',''],
  black_unseen:['لا أرى السلك الأسود في خطي الطاقة','وصّل الأسود من منفذ GND إلى خط السالب المضيء.',''],
  short:['خطر: قصر كهربائي','السلكان الأحمر والأسود في الخط نفسه. لو وُصّل الكيبل يتصل 5V بالأرضي مباشرة، فيسخن السلك وقد يتضرر الأردوينو أو منفذ الجهاز.','توقف، يوجد احتمال قصر كهربائي. لا توصل الكيبل.'],
  early_red_minus:['تحذير مبكر (تجريبي): الأحمر يتجه إلى السالب','رأيت لون السلك الأحمر في خط السالب قبل أن تثبت الصورة.','انتبه، هذا الخط غير صحيح. الأحمر مكانه خط الموجب.'],
  early_black_plus:['تحذير مبكر (تجريبي): الأسود يتجه إلى الموجب','رأيت لون السلك الأسود في خط الموجب قبل أن تثبت الصورة.','انتبه، هذا الخط غير صحيح. الأسود مكانه خط السالب.'],
  wires_unclear:['لا أرى السلكين بوضوح','',''], no_short:['لا يوجد قصر','',''], wires_ok:['الأسلاك في مكانها','',''],
  manual_ok:['تم التأكيد يدوياً','',''], manual_needed:['يحتاج تأكيدك','',''],
  resistor_low_conf:['لم أتمكن من التعرف على المقاومة','أرى شيئاً في مكان المقاومة لكني لست متأكداً ما هو. لا أخمّن، ولا أعدّها مؤكدة. قرّب الكاميرا أو زد الإضاءة، أو يؤكدها المدرب.','لم أتمكن من التعرف على هذه القطعة.'],
  led_low_conf:['لم أتمكن من التعرف على اللمبة','أرى شيئاً في مكان اللمبة لكني لست متأكداً ما هو. لا أخمّن، ولا أعدّها مؤكدة. قرّب الكاميرا أو زد الإضاءة، أو يؤكدها المدرب.','لم أتمكن من التعرف على هذه القطعة.'],
  trainer_ok:['أكّده المدرب','',''], trainer_needed:['يحتاج تأكيد المدرب','الكاميرا لا ترى هذا. يتحقق منه المدرب بعينه ثم يؤكّد بحسابه.',''],
  nocv:['التتبع غير متاح','',''],
  not_trainer:['هذا الحساب ليس حساب مدرب','',''], bad_login:['البريد أو كلمة المرور غير صحيحة','',''],
  no_server:['لا يوجد اتصال بالخادم','لا يمكن تسجيل تأكيد المدرب الآن، فيبقى التشغيل ممنوعاً.','']
};
const msg = c => MSG[c] || [c,'',''];

const STEPS = [
  {id:'prep', t:'التجهيز', text:'افصل كيبل USB عن الأردوينو. ضع الأردوينو تحت اللوحة، واترك اللوحة فارغة.', say:'قبل البدء، افصل كيبل يو إس بي عن الأردوينو، واترك اللوحة فارغة.'},
  {id:'resistor', t:'تركيب المقاومة', text:'ضع المقاومة هنا: رجل في خط الموجب (+)، والرجل الثانية في الفتحة المضيئة في العمود 10.', say:'ضع المقاومة هنا. رجل في خط الموجب، والرجل الثانية في العمود عشرة.'},
  {id:'led', t:'تركيب اللمبة', text:'الرجل الطويلة للـ LED في العمود 10 مع المقاومة، والرجل القصيرة في خط السالب (−).', say:'الرجل الطويلة للّمبة يجب أن تكون في العمود عشرة مع المقاومة، والرجل القصيرة في خط السالب.'},
  {id:'red', t:'السلك الأحمر', text:'وصّل السلك الأحمر من منفذ 5V في الأردوينو إلى خط الموجب (+) المضيء.', say:'وصّل السلك الأحمر من منفذ فايف فولت إلى خط الموجب.'},
  {id:'black', t:'السلك الأسود', text:'وصّل السلك الأسود من منفذ GND إلى خط السالب (−) المضيء.', say:'وصّل السلك الأسود من منفذ جي إن دي إلى خط السالب.'},
  {id:'gate', t:'فحص ما قبل التشغيل', text:'', say:'الآن فحص ما قبل التشغيل. لا توصل الكيبل حتى يصبح كل سطر أخضر.'},
  {id:'power', t:'التشغيل', text:'', say:'اجتازت الدائرة الفحص. الآن وصّل كيبل يو إس بي.'}
];

/* ---------------- voice: recorded clips only, never the device voice ---------------- */
let VOICE={};
const vkey=t=>String(t).replace(/[^ء-يa-zA-Z0-9]/g,'');
fetch('../voice/voice.json',{cache:'no-cache'}).then(r=>r.ok?r.json():[]).then(l=>(l||[]).forEach(x=>{ if(x&&x.file&&x.text) VOICE[vkey(x.text)]='../voice/'+x.file; })).catch(()=>{});
/* The recorded clips of the platform (app/voice). A line is played from the clip that says the same thing;
   a line with no clip is shown as text only. */
let REC={};
fetch('../app/voice/manifest.json',{cache:'no-cache'}).then(r=>r.ok?r.json():{}).then(m=>{ REC=m||{}; }).catch(()=>{});
const REC_FOR = { // message code or step id -> clip
  resistor_ok:'ok', resistor_ok_hole:'ok', led_ok:'ok', red_ok:'red_seen', black_ok:'black_seen',
  red_in_minus:'wrong_rail', short:'short', lost:'board_lost', hand:'hand_in_view', moving:'cam_moving', early_red_minus:'wrong_rail',
  'step:prep':'usb_unplug', 'step:resistor':'resistor_missing', 'step:led':'led_missing', 'step:gate':'usb_locked', 'step:power':'usb_ok',
  calib_ok:'calib_ok', cam_aim:'cam_aim', led_reversed:'led_reversed', mode_test:'mode_test', power_short:'short',
  resistor_far:'test_wrong', led_far:'test_wrong', resistor_in_minus:'wrong_rail', led_short_in_plus:'wrong_rail', black_in_plus:'wrong_rail', early_black_plus:'wrong_rail',
  resistor_low_conf:'cannot_verify', led_low_conf:'cannot_verify', gate_block:'usb_locked',
  'step:red':'@voice/wire_red.mp3', 'step:black':'@voice/wire_black.mp3' };   // '@' = a clip cut from the same recordings, stored in coach/voice
const voiceEl = new Audio();
let unlocked=false;
function unlock(){ if(unlocked) return; unlocked=true;
  // iPad only lets an <audio> element play later if it was started once inside a touch
  try{ voiceEl.muted=true; voiceEl.src='../app/voice/ok.mp3'; const p=voiceEl.play(); const done=()=>{ try{voiceEl.pause(); voiceEl.currentTime=0;}catch(e){} voiceEl.muted=false; }; if(p&&p.then) p.then(done,()=>{voiceEl.muted=false;}); else done(); }catch(e){ voiceEl.muted=false; } }
['pointerdown','touchend'].forEach(ev=>document.addEventListener(ev,unlock,{capture:true,passive:true}));
function say(t, force, key){
  if(!t || S.muted) return;
  const now=performance.now();
  if(!force && t===S.lastSay && now-S.lastSayAt<6000) return;
  S.lastSay=t; S.lastSayAt=now;
  const k=key && REC_FOR[key], clip=k && (k[0]==='@' ? k.slice(1) : REC[k] && '../app/voice/'+REC[k]);
  const rec=clip || VOICE[vkey(t)];
  voiceEl.muted=false;
  // Only the recorded clips are spoken. A line with no clip stays on the screen as text: the device voice is never used.
  if(rec){ try{ voiceEl.src=rec; const p=voiceEl.play(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} }
}

/* ---------------- loading: model + OpenCV ---------------- */
function loadState(){ $('loadState').textContent = `النموذج: ${S.ortReady?'جاهز ✓':S.ortErr?'تعذّر التحميل':'يُحمَّل…'} · التتبع (OpenCV): ${S.cvReady?'جاهز ✓':S.cvErr?'غير متاح، ثبّت الكاميرا':'يُحمَّل…'}`; }
if(window.ort){ ort.env.wasm.wasmPaths = window.MIRAS_ORT_WASM || 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/'; ort.env.wasm.numThreads = 1; }
(async()=>{ try{ session = await ort.InferenceSession.create(MODEL_URL,{executionProviders:['wasm']}); S.ortReady=true; }catch(e){ S.ortErr=String(e.message||e); console.error(e); } loadState(); })();
(function loadCv(){
  const sc=document.createElement('script'); sc.async=true; sc.src=CV_URL;
  if(!window.MIRAS_CV_URL){ sc.integrity=CV_SRI; sc.crossOrigin='anonymous'; }
  sc.onerror=()=>{ S.cvErr=true; loadState(); };
  sc.onload=()=>{ const done=()=>{ S.cvReady=!!(window.cv&&cv.Mat); loadState(); };
    try{ if(window.cv&&cv.Mat) done(); else if(window.cv&&cv.then) cv.then(m=>{ window.cv=m; done(); }); else if(window.cv) cv.onRuntimeInitialized=done; }catch(e){ S.cvErr=true; loadState(); } };
  document.head.append(sc);
})();
loadState();

/* ---------------- YOLO (same pre/post-processing as lab/) ---------------- */
const SZ=640; const lbC=document.createElement('canvas'); lbC.width=lbC.height=SZ; const lbG=lbC.getContext('2d',{willReadFrequently:true});
async function detect(){
  if(!session || S.detBusy || !S.src) return;
  S.detBusy=true; const t0=performance.now();
  try{
    const w=S.srcW, h=S.srcH, r=Math.min(SZ/w,SZ/h), nw=Math.round(w*r), nh=Math.round(h*r), dx=Math.floor((SZ-nw)/2), dy=Math.floor((SZ-nh)/2);
    lbG.fillStyle='rgb(114,114,114)'; lbG.fillRect(0,0,SZ,SZ); lbG.drawImage(S.src,dx,dy,nw,nh);
    const d=lbG.getImageData(0,0,SZ,SZ).data, n=SZ*SZ, f=new Float32Array(3*n);
    for(let i=0;i<n;i++){ f[i]=d[i*4]/255; f[n+i]=d[i*4+1]/255; f[2*n+i]=d[i*4+2]/255; }
    const out=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',f,[1,3,SZ,SZ])});
    const t=out[session.outputNames[0]], a=t.data, N=t.dims[1], res=[];
    for(let i=0;i<N;i++){ const s=a[i*6+4]; if(s<0.35) continue;
      res.push({cls:NAMES[a[i*6+5]|0], s, x1:Math.max(0,(a[i*6]-dx)/r), y1:Math.max(0,(a[i*6+1]-dy)/r), x2:Math.min(w,(a[i*6+2]-dx)/r), y2:Math.min(h,(a[i*6+3]-dy)/r)}); }
    S.dets=res; S.detAt=performance.now(); S.detMs=Math.round(S.detAt-t0);
  }catch(e){ console.error(e); }
  S.detBusy=false;
}

/* ---------------- geometry helpers ---------------- */
const toImg = (x,y) => B.apply(S.H,x,y);
function toBoard(px,py){ const Hi=B.inv(S.H); return Hi ? B.apply(Hi,px,py) : [NaN,NaN]; }
function yTop(){ return Math.min(S.rails.plus,S.rails.minus); }
function outerRail(){ return S.rails.plus<S.rails.minus ? '+' : '-'; }
function quad(pad){ // board outline incl. rails, in image px
  const yt=yTop()-pad, x0=-pad, x1=S.cols-1+pad, y1=11+pad;
  return [toImg(x0,yt),toImg(x1,yt),toImg(x1,y1),toImg(x0,y1)];
}

/* ---------------- rectified board analysis (pure JS sampling) ---------------- */
function makeRect(){
  const P=Math.max(6,Math.min(12,Math.round(420/(S.cols+2))));
  const x0=-1, y0=yTop()-1.2, RW=Math.round((S.cols+1)*P), RH=Math.round((12.2-y0)*P);
  return {P,x0,y0,RW,RH,n:RW*RH,map:new Int32Array(RW*RH),gray:new Uint8Array(RW*RH),cls:new Uint8Array(RW*RH)};
}
function bx2i(R,x){ return Math.round((x-R.x0)*R.P); } function by2j(R,y){ return Math.round((y-R.y0)*R.P); }
function sampleRect(R, img, k){
  const Hp=B.scaleH(S.H,k), W=pc.width, Hh=pc.height, d=img.data;
  let valid=0;
  for(let j=0;j<R.RH;j++){ const y=R.y0+(j+.5)/R.P;
    for(let i=0;i<R.RW;i++){ const x=R.x0+(i+.5)/R.P, w=Hp[6]*x+Hp[7]*y+Hp[8], u=((Hp[0]*x+Hp[1]*y+Hp[2])/w)|0, v=((Hp[3]*x+Hp[4]*y+Hp[5])/w)|0, o=j*R.RW+i;
      if(u<0||v<0||u>=W||v>=Hh){ R.map[o]=-1; R.gray[o]=0; R.cls[o]=128; continue; }
      const s=(v*W+u)*4, r=d[s], g=d[s+1], b=d[s+2]; valid++;
      R.gray[o]=(r*77+g*150+b*29)>>8;
      const mx=Math.max(r,g,b), mn=Math.min(r,g,b), dl=mx-mn, sat=mx?dl/mx:0, val=mx/255;
      let hue=0; if(dl){ if(mx===r) hue=((g-b)/dl)%6; else if(mx===g) hue=(b-r)/dl+2; else hue=(r-g)/dl+4; hue*=60; if(hue<0) hue+=360; }
      let c=0;
      if((hue<12||hue>340) && sat>0.5 && val>0.3) c|=1;                 // red insulation
      if(val<0.25) c|=2;                                                // dark (black insulation or hole)
      const Y=0.299*r+0.587*g+0.114*b, Cr=128+0.5*r-0.4187*g-0.0813*b, Cb=128-0.1687*r-0.3313*g+0.5*b;
      if(Y>70 && Cr>138 && Cr<172 && Cb>85 && Cb<128 && !(c&1)) c|=4;  // skin-like
      R.cls[o]=c;
    }
  }
  R.valid=valid;
  if(S.ref){ let a=0,b=0; for(let o=0;o<R.n;o+=7){ if(R.map[o]<0) continue; a+=R.gray[o]; b+=S.ref.gray[o]; } R.gain = b ? Math.min(2,Math.max(0.4,a/b)) : 1; } else R.gain=1;
  return R;
}
function captureRef(R){
  const ref={red:new Uint8Array(R.n), skin:new Uint8Array(R.n), min:new Uint8Array(R.n), gray:R.gray.slice()};
  for(let j=0;j<R.RH;j++) for(let i=0;i<R.RW;i++){ let red=0, mn=255;
    let sk=0;
    for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++){ const jj=j+dj, ii=i+di; if(jj<0||ii<0||jj>=R.RH||ii>=R.RW) continue; const o=jj*R.RW+ii; if(R.cls[o]&1) red=1; if(R.cls[o]&4) sk=1; if(R.gray[o]<mn) mn=R.gray[o]; }
    ref.red[j*R.RW+i]=red; ref.skin[j*R.RW+i]=sk; ref.min[j*R.RW+i]=mn; }
  return ref;
}
/* colour presence per column bin inside a horizontal band of board rows [ya,yb] */
function bandCols(R, ref, colour, ya, yb, exclude, dbg){
  const out=[]; const ja=Math.max(0,by2j(R,ya)), jb=Math.min(R.RH-1,by2j(R,yb));
  for(let c=0;c<S.cols;c++){
    if(exclude.some(([a,b])=>c>=a&&c<=b)) continue;
    const ia=Math.max(0,bx2i(R,c-0.5)), ib=Math.min(R.RW-1,bx2i(R,c+0.5)); let hit=0, tot=0, redN=0;
    for(let j=ja;j<=jb;j++) for(let i=ia;i<ib;i++){ const o=j*R.RW+i; if(R.map[o]<0 && R.cls[o]===128) continue;
      if(colour==='black' && ref.gray[o]<100) continue;   // holes were already dark: they cannot show a black wire, leave them out
      tot++; const cl=R.cls[o]; if((cl&1) && !ref.red[o]) redN++;
      if(colour==='red' ? ((cl&1) && !ref.red[o]) : ((cl&2) && !(cl&4) && R.gray[o] < R.gain*ref.gray[o]-45)) hit++; }
    if(dbg && tot && hit) dbg.push([c, +(hit/tot).toFixed(2), tot]);
    // black: the dark edge/shadow of a red wire is not a black wire; hole pixels are excluded so the bar is lower
    if(colour==='black' && redN/Math.max(1,tot)>0.08) continue;
    if(tot && hit/tot>(colour==='black'?0.15:0.22)) out.push(c);
  }
  return out;
}
function exclusionZones(){
  const T=B.targets(S.cols), C=T.col-1, z=[[C-1,C+4]];          // resistor + LED target area (board x = col-1)
  for(const d of S.dets){ if(d.cls!=='resistor' && d.cls!=='led') continue;
    const xs=[[d.x1,d.y1],[d.x2,d.y1],[d.x2,d.y2],[d.x1,d.y2]].map(p=>toBoard(p[0],p[1])[0]).filter(Number.isFinite);
    if(xs.length) z.push([Math.floor(Math.min(...xs))-1, Math.ceil(Math.max(...xs))+1]); }
  return z;
}
function railEnds(R){
  const ex=exclusionZones(), out={}, yo=Math.min(S.rails.plus,S.rails.minus), yi=Math.max(S.rails.plus,S.rails.minus), o=outerRail(), inn=o==='+'?'-':'+';
  for(const col of ['red','black']){
    const b={outer:bandCols(R,S.ref,col,yo-0.42,yo+0.42,ex), inner:bandCols(R,S.ref,col,yi-0.42,yi+0.42,ex), main:bandCols(R,S.ref,col,-0.45,1.45,ex)};
    const e=B.wireEnd(b).end;
    out[col] = e==='outer'?o : e==='inner'?inn : e;   // '+','-','unclear',null
  }
  return out;
}
/* A hand is skin-coloured AND new. Something skin-coloured that stays still (a beige resistor body, the wooden
   table at the board edge) stops counting after ~1.2 s, unless it covers a large part of the board.
   A frame where the overlay itself was corrected (drift correction / board found again) is not camera motion. */
const SKIN_STILL_FRAMES = 30, SKIN_BIG = 0.06;
function viewOf(R){
  if(!S.track.ok) return 'lost';
  if(!S.skinAge || S.skinAge.length!==R.n) S.skinAge=new Uint8Array(R.n);
  const jump=S.hJump; S.hJump=false;
  let skin=0, skinAll=0, mov=0, tot=0; const pg=jump?null:S.prevGray, A=S.skinAge;
  for(let o=0;o<R.n;o++){ if(R.map[o]<0) continue; tot++;
    if((R.cls[o]&4) && R.cls[o]!==128 && !S.ref.skin[o]){ skinAll++; if(A[o]<255) A[o]++; if(A[o]<SKIN_STILL_FRAMES) skin++; } else A[o]=0;
    if(pg && Math.abs(R.gray[o]-pg[o])>30) mov++; }
  const now=performance.now();
  S.skin = tot? skin/tot : 0; S.motion = tot? mov/tot : 0;
  if(S.skin>0.015 || (tot && skinAll/tot>SKIN_BIG)){ S.lastMove=now; return 'hand'; }
  if(S.motion>0.02){ S.lastMove=now; return 'moving'; }
  if(now-S.lastMove<STABLE_MS) return 'moving';
  return 'ok';
}
function holeChanged(R, x, y){
  const r=Math.max(2,Math.round(R.P*0.35)), ci=bx2i(R,x), cj=by2j(R,y); let s=0, n=0;
  for(let j=cj-r;j<=cj+r;j++) for(let i=ci-r;i<=ci+r;i++){ if(i<0||j<0||i>=R.RW||j>=R.RH) continue; const o=j*R.RW+i; s+=Math.abs(R.gray[o]-S.ref.gray[o]); n++; }
  return n && s/n>28;
}
/* Which power rail does a part reach near its target? Each rail hole near the target is looked at in the full
   camera picture and compared with the calibration picture: a hole is a small dark spot, and a leg in it (or the
   part over it) covers that dark spot. Counting dark pixels (not comparing pixel by pixel) keeps this steady
   when the overlay is off by a fraction of a hole.
   Returns 'right', 'wrong' (it reaches the other rail) or null (nothing clear). Only a still view is judged. */
function holePatch(img, k, x, y){
  const Hp=B.scaleH(S.H,k), d=img.data, W=pc.width, Hh=pc.height, out=[];
  for(let dy=-0.4;dy<=0.4001;dy+=0.1) for(let dx=-0.6;dx<=0.6001;dx+=0.1){
    const q=B.apply(Hp,x+dx,y+dy), u=Math.round(q[0]), v=Math.round(q[1]);
    if(u<0||v<0||u>=W||v>=Hh){ out.push(-1); continue; }
    const o=(v*W+u)*4; out.push((d[o]*77+d[o+1]*150+d[o+2]*29)>>8); }
  return out;
}
function reachCols(){ const C=B.targets(S.cols).col-1; return [C-1,C,C+1,C+2,C+3,C+4]; }
function captureHoles(img, k){
  S.holeRef={};
  for(const x of reachCols()) for(const rail of ['plus','minus']){
    const p=holePatch(img,k,x,S.rails[rail]), v=p.filter(a=>a>=0).sort((a,b)=>a-b); if(v.length<40) continue;
    const thr=v[Math.floor(v.length*0.5)]*0.6, dark=p.filter(a=>a>=0&&a<thr).length;
    if(dark>=3) S.holeRef[x+'|'+rail]={thr, dark};
  }
}
function holeCover(img, k, x, rail, gain){ // 0 = hole looks as at calibration, 1 = hole fully covered
  const r=S.holeRef && S.holeRef[x+'|'+rail]; if(!r) return 0;
  const p=holePatch(img,k,x,S.rails[rail]), t=r.thr*(gain||1); let dark=0; for(const a of p) if(a>=0&&a<t) dark++;
  return Math.max(0, 1-dark/r.dark);
}
const HOLE_COVERED = 0.45;
function railReach(img, k, xs, target, gain){
  let sp=0, sm=0; for(const x of xs){ sp=Math.max(sp,holeCover(img,k,x,'plus',gain)); sm=Math.max(sm,holeCover(img,k,x,'minus',gain)); }
  const st = target==='+'?sp:sm, sw = target==='+'?sm:sp, wrongOuter = outerRail()!==target;
  const to=st>HOLE_COVERED, tw=sw>HOLE_COVERED;
  // a leg in the outer rail passes over the inner rail too, so the inner hole can be covered as well
  const wrong = wrongOuter ? (tw && (!to || sw>=0.8*st)) : (tw && !to);
  return {reach: wrong ? 'wrong' : to ? 'right' : null, plus:+sp.toFixed(2), minus:+sm.toFixed(2)};
}
function partEvidence(cls){
  const fresh = performance.now()-S.detAt < DET_MAX_AGE;
  const T=B.targets(S.cols), C=T.col-1;
  const ds = fresh ? S.dets.filter(d=>d.cls===cls) : [];
  if(!ds.length) return {seen:false};
  let near=false, best=0;
  for(const d of ds){ const [bx,by]=toBoard((d.x1+d.x2)/2,(d.y1+d.y2)/2); best=Math.max(best,d.s);
    if(cls==='resistor' && Math.abs(bx-C)<=2.5 && by>=yTop()-1.5 && by<=2.5) near=true;
    if(cls==='led' && bx>=C-2 && bx<=C+5 && by>=yTop()-2 && by<=4.5) near=true; }
  return {seen:true, near, conf:best};
}
function evidence(R, img, k){
  const ev={view:S.view, railEnds:railEnds(R), resistor:partEvidence('resistor'), led:partEvidence('led')};
  const T=B.targets(S.cols);
  ev.targetChanged={resistor:holeChanged(R,T.col-1,0), led:holeChanged(R,T.col-1,2)};
  const C=T.col-1, rr=railReach(img,k,[C-1,C,C+1],'+',R.gain), lr=railReach(img,k,[C+2,C+3,C+4],'-',R.gain);
  ev.reach={resistor:rr.reach, led:lr.reach}; S.reachDbg={r:rr, l:lr};
  return ev;
}
function boardSanity(){ // tracked outline vs model's board box (only when the model sees a board)
  const fresh = performance.now()-S.detAt < DET_MAX_AGE; if(!fresh) return;
  const bd = S.dets.filter(d=>d.cls==='board').sort((a,b)=>b.s-a.s)[0]; if(!bd) return;
  const q=quad(0.5), xs=q.map(p=>p[0]), ys=q.map(p=>p[1]);
  const a={x1:Math.min(...xs),y1:Math.min(...ys),x2:Math.max(...xs),y2:Math.max(...ys)};
  const ix=Math.max(0,Math.min(a.x2,bd.x2)-Math.max(a.x1,bd.x1)), iy=Math.max(0,Math.min(a.y2,bd.y2)-Math.max(a.y1,bd.y1)), I=ix*iy;
  const U=(a.x2-a.x1)*(a.y2-a.y1)+(bd.x2-bd.x1)*(bd.y2-bd.y1)-I, iou=U?I/U:0;
  S.boardIou=iou; S.boardBox=bd; S.boardMiss = iou<0.25 ? S.boardMiss+1 : 0;
  if(S.boardMiss>=4){ S.track.ok=false; S.boardMiss=0; S.needRecal=true; S.lostSince=performance.now(); } // overlay no longer matches the model's board: ask for re-calibration
}

/* ---------------- tracking (OpenCV.js optical flow + homography) ---------------- */
function grayMat(img){ const m=cv.matFromImageData(img), g=new cv.Mat(); cv.cvtColor(m,g,cv.COLOR_RGBA2GRAY); m.delete(); return g; }
function detectFeatures(g, k){
  const mask=cv.Mat.zeros(g.rows,g.cols,cv.CV_8UC1), q=quad(1.0).map(p=>[p[0]*k,p[1]*k]);
  const pts=cv.matFromArray(4,1,cv.CV_32SC2,[].concat(...q.map(p=>[Math.round(p[0]),Math.round(p[1])]))), vec=new cv.MatVector(); vec.push_back(pts);
  cv.fillPoly(mask,vec,new cv.Scalar(255)); const c=new cv.Mat();
  cv.goodFeaturesToTrack(g,c,200,0.01,5,mask,3);
  mask.delete(); pts.delete(); vec.delete(); return c;  // CV_32FC2 Nx1
}
/* Absolute re-localisation against the calibration frame (ORB features + RANSAC homography).
   Used when optical flow is lost and every ~1.5 s to remove drift. */
function orbOf(g, maskQuad){
  const orb=new cv.ORB(1500), kp=new cv.KeyPointVector(), des=new cv.Mat(), none=new cv.Mat();
  let mask=none;
  if(maskQuad){ mask=cv.Mat.zeros(g.rows,g.cols,cv.CV_8UC1); const pts=cv.matFromArray(4,1,cv.CV_32SC2,[].concat(...maskQuad.map(p=>[Math.round(p[0]),Math.round(p[1])]))), v=new cv.MatVector(); v.push_back(pts); cv.fillPoly(mask,v,new cv.Scalar(255)); pts.delete(); v.delete(); }
  orb.detectAndCompute(g,mask,kp,des); orb.delete(); if(mask!==none) mask.delete(); none.delete();
  return {kp,des};
}
function refFree(){ try{ if(S.orbRef){ S.orbRef.kp.delete(); S.orbRef.des.delete(); } }catch(e){} S.orbRef=null; }
function relocalize(g, k, ref, Href, blend){
  ref=ref||S.orbRef; Href=Href||S.Hcal;
  if(!ref || ref.des.rows<20) return false;
  const cur=orbOf(g,null), bf=new cv.BFMatcher(cv.NORM_HAMMING,false), mm=new cv.DMatchVectorVector();
  let ok=false;
  try{
    if(cur.des.rows<20) return false;
    bf.knnMatch(ref.des,cur.des,mm,2);
    const a=[], b=[];
    for(let i=0;i<mm.size();i++){ const m=mm.get(i); if(m.size()<2) continue; const m0=m.get(0), m1=m.get(1); if(m0.distance<0.75*m1.distance){ const p=ref.kp.get(m0.queryIdx).pt, q=cur.kp.get(m0.trainIdx).pt; a.push(p.x,p.y); b.push(q.x,q.y); } }
    const n=a.length/2; S.reloc={matches:n};
    if(n<15) return false;
    const A=cv.matFromArray(n,1,cv.CV_32FC2,a), Bm=cv.matFromArray(n,1,cv.CV_32FC2,b), inl=new cv.Mat();
    const G=cv.findHomography(A,Bm,cv.RANSAC,3,inl); let ni=0; for(let i=0;i<n;i++) if(inl.data[i]) ni++;
    S.reloc.inliers=ni;
    if(!G.empty() && ni>=20 && ni/n>0.3){
      const h=Array.from(G.data64F), D=B.mul(B.mul([1/k,0,0,0,1/k,0,0,0,1],h),[k,0,0,0,k,0,0,0,1]);
      const Hn=B.mul(D,Href);
      // sanity: the board must keep a plausible size (scale change < 2x)
      const q=[[0,0],[S.cols-1,0],[S.cols-1,11],[0,11]], d0=Math.hypot(...[0,1].map(i=>B.apply(S.Hcal,...q[1])[i]-B.apply(S.Hcal,...q[0])[i])), d1=Math.hypot(...[0,1].map(i=>B.apply(Hn,...q[1])[i]-B.apply(Hn,...q[0])[i]));
      if(d1/d0>0.5 && d1/d0<2){ S.H = blend && S.H ? blendH(S.H,Hn,blend) : Hn; S.hJump=true; ok=true; }
    }
    A.delete(); Bm.delete(); inl.delete(); G.delete();
  }catch(e){ console.error(e); }
  finally{ cur.kp.delete(); cur.des.delete(); bf.delete(); mm.delete(); }
  return ok;
}
/* Smooth correction: move part of the way from the current overlay to the new pose (no visible jump). */
function blendH(Ha, Hb, t){ const C=B.calibHoles(S.cols), pa=C.map(q=>B.apply(Ha,q[0],q[1])), pb=C.map(q=>B.apply(Hb,q[0],q[1]));
  return B.homography(C, pa.map((a,i)=>[a[0]+(pb[i][0]-a[0])*t, a[1]+(pb[i][1]-a[1])*t])) || Hb; }
/* A second, recent reference (refreshed while tracking is healthy), so the board is found again
   even after wires and parts changed how it looks since calibration. */
function refreshRecent(img, k){
  if(!S.cvReady || !S.H) return;
  try{ const g=grayMat(img), r=orbOf(g,quad(1.0).map(p=>[p[0]*k,p[1]*k])); g.delete();
    if(S.orbRecent){ S.orbRecent.kp.delete(); S.orbRecent.des.delete(); }
    S.orbRecent={kp:r.kp, des:r.des, H:S.H.slice()}; S.recentAt=performance.now(); }catch(e){ console.error(e); }
}
function recentFree(){ try{ if(S.orbRecent){ S.orbRecent.kp.delete(); S.orbRecent.des.delete(); } }catch(e){} S.orbRecent=null; }
/* Automatic recovery after the device moved: find the hole grid again in the current frame (same code as the
   automatic calibration). Two frames in a row must agree, the board size must match, and the + / − rails must
   land where they were calibrated. Otherwise it keeps waiting; «إعادة ضبط اللوحة» stays as the fallback. */
function autoRecover(){
  if(!window.MirasAutoCal || !S.H || !S.rails) return false;
  const now=performance.now(); if(now-(S.recAt||0)<600) return false; S.recAt=now;
  const fresh=now-S.detAt<3000 ? S.dets : [], bs=fresh.filter(d=>d.cls==='board' && d.s>=0.35);
  const box = bs.length ? [Math.min(...bs.map(d=>d.x1)),Math.min(...bs.map(d=>d.y1)),Math.max(...bs.map(d=>d.x2)),Math.max(...bs.map(d=>d.y2))] : [0,0,S.srcW,S.srcH];
  let im; try{ ac.width=S.srcW; ac.height=S.srcH; actx.drawImage(S.src,0,0,ac.width,ac.height); im=actx.getImageData(0,0,ac.width,ac.height); }catch(e){ return false; }
  let r=MirasAutoCal.autoCalibrate(im.data,ac.width,ac.height,box,{});
  if(!r.ok && bs.length) r=MirasAutoCal.autoCalibrate(im.data,ac.width,ac.height,[0,0,S.srcW,S.srcH],{});
  if(!r.ok || r.cols!==S.cols){ S.recPrev=null; return false; }
  // the board frame can come back turned round (180°): pick the orientation that keeps + and − where they were
  const cands=[{taps:r.taps, rails:r.rails}, {taps:[r.taps[2],r.taps[3],r.taps[0],r.taps[1]], rails:r.rails&&{plus:11-r.rails.plus, minus:11-r.rails.minus}}];
  const last=B.calibHoles(S.cols).map(q=>B.apply(S.H,q[0],q[1]));
  const dist=c=>c.taps.reduce((a,t,i)=>a+Math.hypot(t[0]-last[i][0],t[1]-last[i][1]),0);
  const railsOk=c=>!c.rails || (Math.abs(c.rails.plus-S.rails.plus)<0.6 && Math.abs(c.rails.minus-S.rails.minus)<0.6);
  const ok=cands.filter(railsOk).sort((a,b)=>dist(a)-dist(b));
  if(!ok.length){ S.recPrev=null; return false; }
  const c=ok[0], p=S.recPrev; S.recPrev=c;
  if(!p) return false;
  for(let i=0;i<4;i++) if(Math.hypot(p.taps[i][0]-c.taps[i][0],p.taps[i][1]-c.taps[i][1])>0.6*r.pitchPx) return false;
  const Hn=B.boardFromTaps(S.cols,c.taps); if(!Hn) return false;
  S.H=Hn; S.recPrev=null; return true;
}
function trackInit(img, k){
  trackFree(); if(!S.cvReady){ S.track.ok=true; S.track.static=true; return; }
  const g=grayMat(img); S.track.prev=g; S.track.pts=detectFeatures(g,k); S.track.ok=true; S.track.static=false; S.track.n=S.track.pts.rows; S.relocAt=performance.now();
}
function trackFree(){ try{ S.track.prev&&S.track.prev.delete(); S.track.pts&&S.track.pts.delete(); }catch(e){} S.track.prev=null; S.track.pts=null; }
function trackStep(img, k){
  if(!S.cvReady || S.track.static || !S.track.prev) return;
  const g=grayMat(img), p1=new cv.Mat(), st=new cv.Mat(), er=new cv.Mat();
  try{
    if(!S.track.pts || S.track.pts.rows<8){ S.track.pts&&S.track.pts.delete(); S.track.pts=detectFeatures(S.track.prev,k); }
    if(S.track.pts.rows<8){ S.track.ok=false; return; }
    cv.calcOpticalFlowPyrLK(S.track.prev,g,S.track.pts,p1,st,er,new cv.Size(21,21),3);
    const a=[], b=[];
    for(let i=0;i<st.rows;i++) if(st.data[i]===1){ a.push(S.track.pts.data32F[i*2],S.track.pts.data32F[i*2+1]); b.push(p1.data32F[i*2],p1.data32F[i*2+1]); }
    const n=a.length/2; S.track.n=n;
    if(n<10){ S.track.ok=false; S.lostSince=performance.now(); return; }
    const A=cv.matFromArray(n,1,cv.CV_32FC2,a), Bm=cv.matFromArray(n,1,cv.CV_32FC2,b), inl=new cv.Mat();
    const Hd=cv.findHomography(A,Bm,cv.RANSAC,2.5,inl);
    let ni=0; const keep=[]; for(let i=0;i<n;i++) if(inl.data[i]){ ni++; keep.push(b[i*2],b[i*2+1]); }
    S.track.inl=ni;
    if(Hd.empty() || ni<8 || ni/n<0.35){ S.track.ok=false; S.lostSince=performance.now(); }
    else {
      const h=Array.from(Hd.data64F); // proc-scale delta
      const D=B.mul(B.mul([1/k,0,0,0,1/k,0,0,0,1],h),[k,0,0,0,k,0,0,0,1]); // to full-res delta
      const q0=quad(0), q1=q0.map(p=>B.apply(D,p[0],p[1])), mv=Math.max(...q0.map((p,i)=>Math.hypot(q1[i][0]-p[0],q1[i][1]-p[1])));
      if(mv>0.35*(S.srcW/PW)) S.H=B.mul(D,S.H);        // dead-band: ignore sub-pixel jitter
      S.track.pts.delete(); S.track.pts = ni>=60 ? cv.matFromArray(ni,1,cv.CV_32FC2,keep) : (()=>{ const f=detectFeatures(g,k); return f; })();
    }
    A.delete(); Bm.delete(); inl.delete(); Hd.delete();
  }catch(e){ console.error(e); S.track.ok=false; }
  finally{ p1.delete(); st.delete(); er.delete(); S.track.prev.delete(); S.track.prev=g; }
}

/* ---------------- sources ---------------- */
async function startCam(){
  try{
    const st=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    const v=document.createElement('video'); v.playsInline=true; v.muted=true; v.autoplay=true; v.setAttribute('playsinline',''); v.setAttribute('muted','');
    // سفاري في الآيباد يرسم إطارات سوداء إذا كان الفيديو خارج الصفحة: نضعه فيها صغيراً وشبه مخفي
    v.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;z-index:0';
    $('stage').insertBefore(v, $('stage').firstChild);   // الفيديو ظاهر خلف الرسم: سفاري لا يعطي إطارات لفيديو مخفي
    v.srcObject=st;
    await new Promise(r=>{ if(v.readyState>=1 && v.videoWidth) r(); else v.onloadedmetadata=()=>r(); });
    await v.play();
    $('recNote').hidden=false;
    useSource(v,'cam');
  }catch(e){ $('loadState').textContent='ما قدرت أفتح الكاميرا: '+e.message+'. يمكن التجربة على فيديو مسجّل.'; }
}
function useSource(el, kind){
  S.src=el; S.kind=kind;
  S.srcW = el.naturalWidth||el.videoWidth||el.width; S.srcH = el.naturalHeight||el.videoHeight||el.height;
  cvs.width=S.srcW; cvs.height=S.srcH; pc.width=PW; pc.height=Math.round(PW*S.srcH/S.srcW);
  $('start').hidden=true; $('work').hidden=false; $('result').hidden=true;
  newSession(); enterSetup(); if(!S.loop){ S.loop=true; requestAnimationFrame(frame); }
}
$('camBtn').onclick=startCam;
$('vidPick').onchange=e=>{ const f=e.target.files[0]; if(!f) return; const v=document.createElement('video'); v.playsInline=true; v.muted=true; v.loop=true; v.src=URL.createObjectURL(f); v.onloadeddata=()=>{ v.play(); useSource(v,'video'); }; };
$('imgPick').onchange=e=>{ const f=e.target.files[0]; if(!f) return; const im=new Image(); im.onload=()=>useSource(im,'image'); im.src=URL.createObjectURL(f); };

/* ---------------- start screen controls ---------------- */
function seg(id, key, cb){ $(id).querySelectorAll('button').forEach(b=>b.onclick=()=>{ $(id).querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b)); S[key]= key==='cols'?+b.dataset.v:b.dataset.v; cb&&cb(); }); }
seg('modeSeg','mode',()=>{ $('modeHelp').textContent = S.mode==='train' ? 'التدريب: أسهم وأماكن صحيحة وشرح للأخطاء.' : 'الاختبار: لا تظهر الأماكن مسبقاً. يركّب المتدرب الدائرة وحده، ثم يُقيَّم ويُسجَّل الوقت والأخطاء وعدد المحاولات. فحص الأمان قبل التشغيل يبقى إلزامياً.'; });
seg('colsSeg','cols');
/* one platform: who is signed in on the main page (same tab), and which mode they chose there */
let ME=null; try{ ME=JSON.parse(sessionStorage.getItem('miras_me')||'null'); }catch(e){}
(function fromMain(){
  const m=new URLSearchParams(location.search).get('mode');
  if(m==='train'||m==='test'){ const b=$('modeSeg').querySelector(`button[data-v="${m}"]`); b&&b.click(); }
  if(ME&&ME.name){ $('nameRow').hidden=true; $('trainee').value=ME.name; $('whoTop').hidden=false; $('whoTop').textContent=(ME.role==='trainer'?'المدرب: ':'المتدرب: ')+ME.name; }
})();
/* the attempt also goes to the main page's list (mx_real), so it shows in "المحاولات السابقة" and the trainer dashboard.
   Same point weights as index.html WEIGHT. */
const MAIN_W={black_plus:20,red_minus:15,assisted:8,hint:2,unclear:2,quit:0};
function toMainAttempt(sess){
  if(!ME || ME.role!=='trainee') return;
  const map={red_in_minus:'red_minus', short:'black_plus', black_in_plus:'black_plus', led_reversed:'led_reversed'};
  const errs=[]; sess.events.forEach(e=>{ if(e.type==='error' && map[e.code]) errs.push(map[e.code]); if((e.type==='manual'||e.type==='skipped')&&e.why) errs.push('assisted'); if(e.type==='override'||e.type==='trainer_confirm') errs.push('override'); });
  if(!sess.passed) errs.push('quit');
  let sc=100; errs.forEach(e=>{ sc-=MAIN_W[e]!=null?MAIN_W[e]:2; }); sc=Math.max(0,sc); if(!sess.passed) sc=Math.min(40,sc);
  const a={id:'c'+Date.now()+Math.floor(Math.random()*1e4), uid:ME.id, at:Date.now(), dur:sess.seconds, errors:errs, score:sc, done:!!sess.passed, steps:null, clips:0, mode:sess.mode==='test'?'coach-test':'coach'};
  try{ const k='mx_real', L=JSON.parse(localStorage.getItem(k)||'[]'); L.push(a); localStorage.setItem(k, JSON.stringify(L.slice(-60))); }catch(e){}
}

/* ---------------- setup (calibration) ---------------- */
const AUTO_TXT='وجّه الكاميرا إلى اللوحة كاملة وثبّتها. أتعرّف على الفتحات وخطي الطاقة تلقائياً…';
const AUTO_WHY={few_holes:'لا أرى فتحات اللوحة بوضوح. قرّب الكاميرا أو زد الإضاءة.', no_lattice:'لا أرى فتحات اللوحة بوضوح. قرّب الكاميرا أو زد الإضاءة.', rows_not_found:'أرى فتحات لكن لا أميّز صفوف اللوحة. اجعل اللوحة كلها داخل الصورة.', cols_partial:'جزء من اللوحة خارج الصورة أو مغطّى. أظهر اللوحة كاملة.'};
const ac=document.createElement('canvas'), actx=ac.getContext('2d',{willReadFrequently:true});
function autoTry(){
  if(S.autoOff || S.autoDone || !window.MirasAutoCal) return;
  const now=performance.now(); if(now-(S.autoAt||0)<700) return; S.autoAt=now;
  if(S.ortReady && now-S.detAt>DET_EVERY) detect();
  const fresh=now-S.detAt<3000 ? S.dets : [], bs=fresh.filter(d=>d.cls==='board' && d.s>=0.35);
  const box = bs.length ? [Math.min(...bs.map(d=>d.x1)),Math.min(...bs.map(d=>d.y1)),Math.max(...bs.map(d=>d.x2)),Math.max(...bs.map(d=>d.y2))] : [0,0,S.srcW,S.srcH];
  const ard=fresh.filter(d=>d.cls==='arduino').sort((a,b)=>b.s-a.s)[0], near=ard?[(ard.x1+ard.x2)/2,(ard.y1+ard.y2)/2]:null;
  let im; try{ ac.width=S.srcW; ac.height=S.srcH; actx.drawImage(S.src,0,0,ac.width,ac.height); im=actx.getImageData(0,0,ac.width,ac.height); }catch(e){ return; }
  let r=MirasAutoCal.autoCalibrate(im.data,ac.width,ac.height,box,{near});
  if(!r.ok && bs.length) r=MirasAutoCal.autoCalibrate(im.data,ac.width,ac.height,[0,0,S.srcW,S.srcH],{near});
  if(!r.ok){ S.autoPrev=null; const w=String(r.why||''); S.autoWhy=AUTO_WHY[w.startsWith('cols_partial')?'cols_partial':w]||''; S.autoFails=(S.autoFails||0)+1; renderSetup(); return; }
  const p=S.autoPrev; S.autoPrev=r;
  // two frames in a row must agree (same size, same corners, same polarity) before the result is used
  if(!p || p.cols!==r.cols || !!p.rails!==!!r.rails || (r.rails && Math.sign(p.rails.plus-p.rails.minus)!==Math.sign(r.rails.plus-r.rails.minus))) return;
  for(let i=0;i<4;i++) if(Math.hypot(p.taps[i][0]-r.taps[i][0],p.taps[i][1]-r.taps[i][1])>0.6*r.pitchPx) return;
  S.cols=r.cols; S.taps=r.taps.map(t=>t.slice()); S.H=B.boardFromTaps(S.cols,S.taps);
  S.rails = r.rails ? {plus:r.rails.plus, minus:r.rails.minus} : {plus:null, minus:null};
  S.autoDone=true; S.autoWhy=''; log('auto_calib',{cols:r.cols,inliers:r.inliers,rails:!!r.rails});
  $('colsSeg').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.v===S.cols));
  say('تعرّفت على اللوحة. تأكد أن النقاط فوق الفتحات ثم اضغط ابدأ.',true,'calib_ok'); renderSetup();
}
const SETUP_TXT = [
  'المس الفتحة رقم 1 في الصف الملاصق لخطي الطاقة القريبين من الأردوينو.',
  'المس آخر فتحة في الصف نفسه (العمود الأخير).',
  'المس آخر فتحة في الصف البعيد (الجهة الأخرى من اللوحة، العمود الأخير).',
  'المس الفتحة رقم 1 في الصف البعيد.',
  'المس خط الموجب (+): صف الفتحات بجانب الخط الأحمر.',
  'المس خط السالب (−): صف الفتحات بجانب الخط الأزرق.',
  'تأكد أن النقاط فوق الفتحات. اسحب أي زاوية لتعديلها، ثم اضغط «ابدأ».'
];
function enterSetup(){
  S.phase='setup'; S.taps=[]; S.rails=null; S.H=null; S.ref=null; S.track.ok=false; trackFree();
  S.autoOff=false; S.autoDone=false; S.autoPrev=null; S.autoWhy=''; S.autoFails=0; say('وجّه الكاميرا نحو اللوحة كاملة.',true,'cam_aim');
  $('setupBox').hidden=false; $('stepBox').hidden=true; $('gateBox').hidden=true; $('powerBox').hidden=true; renderSetup();
}
function renderSetup(){
  const k = S.taps.length + (S.rails ? (S.rails.minus!=null?2:S.rails.plus!=null?1:0) : 0);
  const auto = k===0 && !S.autoOff && !!window.MirasAutoCal;
  $('setupText').textContent = auto ? AUTO_TXT+(S.autoWhy?' '+S.autoWhy:'')+(S.autoFails>=6?' إن لم ينجح، المس الفتحات الأربع في زوايا اللوحة بأي ترتيب.':'')
    : k<4 ? `المس الفتحات الأربع في زوايا اللوحة، بأي ترتيب (${k+1} من 4).`
    : k<6 ? SETUP_TXT[k]
    : (S.autoDone ? 'تعرّفت على اللوحة تلقائياً. ' : '')+'تأكد أن النقاط فوق الفتحات، وأن النقاط الحمراء على خط الموجب (+) والزرقاء على السالب (−). اسحب أي زاوية لتعديلها، ثم اضغط «ابدأ».';
  $('setupDone').disabled = k<6;
  // mini diagram: board with the hole to tap highlighted
  const W=300,H=120,cx=i=>20+i*(260/(S.cols-1)), ry=r=>36+B.rowY(r)*6.4;
  let s=`<rect x="0" y="0" width="${W}" height="${H}" fill="#f3efe4"/><rect x="10" y="4" width="280" height="112" fill="#fffdf6" stroke="#c9c1ad"/>`;
  s+=`<line x1="14" y1="12" x2="286" y2="12" stroke="#d93025"/><line x1="14" y1="28" x2="286" y2="28" stroke="#1a5bd9"/>`;
  for(let r=0;r<10;r++) for(let c=0;c<S.cols;c+=Math.ceil(S.cols/30)) s+=`<rect x="${cx(c)-1}" y="${ry(r)-1}" width="2" height="2" fill="#777"/>`;
  for(let c=0;c<S.cols;c+=Math.ceil(S.cols/30)){ s+=`<rect x="${cx(c)-1}" y="15" width="2" height="2" fill="#777"/><rect x="${cx(c)-1}" y="23" width="2" height="2" fill="#777"/>`; }
  const P=[[0,0],[S.cols-1,0],[S.cols-1,9],[0,9]];
  if(k<4){ P.forEach(([c,r],i)=>{ s+=`<circle cx="${cx(c)}" cy="${ry(r)}" r="7" fill="none" stroke="#e2b54e" stroke-width="${i>=k?3:1}"/>`; }); }
  else if(k<6){ s+=`<rect x="14" y="${k===4?11:19}" width="272" height="9" fill="none" stroke="#e2b54e" stroke-width="2.5"/>`; }
  s+=`<text x="${cx(0)}" y="113" font-size="9" text-anchor="middle" fill="#333">1</text><text x="${cx(S.cols-1)}" y="113" font-size="9" text-anchor="middle" fill="#333">${S.cols}</text>`;
  $('setupDiag').innerHTML=s;
}
function canvasPt(e){ const r=cvs.getBoundingClientRect(); return [(e.clientX-r.left)*cvs.width/r.width, (e.clientY-r.top)*cvs.height/r.height]; }
cvs.addEventListener('pointerdown', e=>{
  if(S.phase!=='setup') return;
  const p=canvasPt(e);
  if(S.taps.length===4 && S.rails && S.rails.minus!=null){ // adjust mode: grab nearest corner
    const tol=cvs.width/25; let bi=-1, bd=1e9; S.taps.forEach((t,i)=>{ const d=Math.hypot(t[0]-p[0],t[1]-p[1]); if(d<bd){bd=d;bi=i;} });
    if(bd<tol){ S.drag=bi; cvs.setPointerCapture(e.pointerId); } return; }
  if(S.taps.length<4){ S.autoOff=true; S.taps.push(p);
    if(S.taps.length===4){ const o=B.orderTaps(S.taps);
      if(!o){ S.taps=[]; banner('النقاط الأربع لا تشكّل زوايا لوحة. المسها من جديد.','warn'); renderSetup(); return; }
      S.taps=o; const gc=B.guessCols(o); if(gc){ S.cols=gc; $('colsSeg').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.v===S.cols)); }
      S.H=B.boardFromTaps(S.cols,S.taps); S.rails={plus:null,minus:null}; } }
  else if(S.rails){ let y=toBoard(p[0],p[1])[1];
    if(S.rails.plus==null && y>11.4 && y<18){ // the rails on the other long side were touched: turn the board frame round
      S.taps=[S.taps[2],S.taps[3],S.taps[0],S.taps[1]]; S.H=B.boardFromTaps(S.cols,S.taps); y=toBoard(p[0],p[1])[1]; }
    if(!(y<-0.4 && y>-7)){ banner('هذه ليست خطوط الطاقة الملاصقة للصف الذي لمسته أولاً. حاول مرة أخرى.','warn'); return; }
    if(S.rails.plus==null) S.rails.plus=y; else if(S.rails.minus==null){ if(Math.abs(y-S.rails.plus)<0.5||Math.abs(y-S.rails.plus)>3){ banner('خط السالب يجب أن يكون الصف المجاور لخط الموجب.','warn'); return; } S.rails.minus=y; } }
  renderSetup();
});
cvs.addEventListener('pointermove', e=>{ if(S.drag<0) return; S.taps[S.drag]=canvasPt(e); const Hn=B.boardFromTaps(S.cols,S.taps); if(Hn) S.H=Hn; });
cvs.addEventListener('pointerup', ()=>{ S.drag=-1; });
$('setupUndo').onclick=()=>{ if(S.rails && S.rails.minus!=null) S.rails.minus=null; else if(S.rails && S.rails.plus!=null) S.rails.plus=null; else if(S.taps.length){ S.taps.pop(); S.rails=null; S.H=null; } renderSetup(); };
$('setupDone').onclick=()=>{
  pctx.drawImage(S.src,0,0,pc.width,pc.height); const img=pctx.getImageData(0,0,pc.width,pc.height), k=pc.width/S.srcW;
  S.rect=makeRect(); sampleRect(S.rect,img,k); S.ref=captureRef(S.rect); S.prevGray=S.rect.gray.slice(); captureHoles(img,k);
  S.Hcal=S.H.slice(); S.needRecal=false; S.lostFrom=0; S.recPrev=null; recentFree(); S.recentAt=performance.now(); trackInit(img,k); S.lastMove=0;
  if(S.cvReady){ refFree(); const g=grayMat(img); S.orbRef=orbOf(g,quad(1.0).map(p=>[p[0]*k,p[1]*k])); g.delete(); }
  log('setup',{cols:S.cols, auto:!!S.autoDone});
  $('setupBox').hidden=true; S.stepIdx=0; enterStep(0);
};
$('recalBtn').onclick=()=>{ log('recalibrate',{}); enterSetup(); };

/* ---------------- steps ---------------- */
function enterStep(i){
  S.phase='steps'; S.stepIdx=i; S.step=STEPS[i]; S.committed=null; S.cand=null; S.early=null; S.earlyN=0; S.unknownSince=performance.now();
  $('stepBox').hidden = S.step.id==='gate'||S.step.id==='power';
  $('gateBox').hidden = S.step.id!=='gate'; $('powerBox').hidden = S.step.id!=='power';
  $('ledDiag').hidden = S.step.id!=='led';
  $('usbChk').hidden = S.step.id!=='prep';
  $('manualBox').hidden=true; $('nextBtn').hidden = S.step.id!=='prep'; $('finishBuild').hidden=true;
  if(S.step.id==='prep'){ $('usbOff').checked=false; $('nextBtn').disabled=true; }
  const testBuild = S.mode==='test' && ['resistor','led','red','black'].includes(S.step.id);
  if(testBuild){ // test mode: one build phase, no targets shown
    $('stepTitle').textContent='ركّب الدائرة كاملة'; $('stepText').textContent='المقاومة، واللمبة، والسلك الأحمر، والسلك الأسود، بدون إرشاد. اضغط «انتهيت» للفحص.';
    $('finishBuild').hidden=false; $('ledDiag').hidden=true; setState('unknown','وضع الاختبار','النظام لا يعرض الإجابة. يقيّم بعد الضغط على «انتهيت».');
    say('وضع الاختبار. ركّب الدائرة كاملة ثم اضغط انتهيت.',true,'mode_test');
  } else if(S.step.id!=='gate' && S.step.id!=='power'){
    $('stepTitle').textContent=`${i+1}. ${S.step.t}`; $('stepText').textContent=S.step.text; setState('unknown','بانتظار التركيب',''); say(S.step.say,true,'step:'+S.step.id);
  } else if(S.step.id==='gate'){ voidConfirm(null); S.gatePassSince=0; closeTrainer(); say(S.step.say,true,'step:'+S.step.id); }
  else { $('litHelp').hidden=true; say(S.step.say,true,'step:'+S.step.id); }
  renderBar();
}
function renderBar(){ $('backBtn').hidden = !(S.phase==='steps' && S.stepIdx>0 && S.step && S.step.id!=='power'); $('stepBar').innerHTML = STEPS.map((s,i)=>`<i class="${i<S.stepIdx?'done':i===S.stepIdx?'cur':''}" title="${s.t}"></i>`).join(''); }
function setState(st,title,why){ const e=$('stepState'); e.className='state '+st; e.innerHTML=`${title}${why?`<small>${why}</small>`:''}`; }
$('backBtn').onclick=()=>{ if(!S.step || S.step.id==='power' || S.stepIdx<1) return;
  let i=S.stepIdx-1; if(S.mode==='test' && S.step.id==='gate') i=STEPS.findIndex(s=>s.id==='resistor');
  if(S.mode==='test' && S.step.id==='resistor') i=0;
  log('back',{from:S.step.id, to:STEPS[i].id}); banner('رجعنا إلى خطوة: '+STEPS[i].t,'warn'); enterStep(i); };
$('usbOff').onchange=()=>{ $('nextBtn').disabled=!$('usbOff').checked; };
$('nextBtn').onclick=()=>{ if(S.step.id==='prep'){ log('manual',{what:'usb_off'}); enterStep(1); return; } advance(); };
$('repeatBtn').onclick=()=>{ const c=S.committed; say(c && msg(c.code)[2] ? msg(c.code)[2] : S.step.say, true, c && msg(c.code)[2] ? c.code : 'step:'+S.step.id); };
$('muteBtn').onclick=()=>{ S.muted=!S.muted; $('muteBtn').textContent=S.muted?'الصوت: مطفأ':'الصوت: يعمل'; if(S.muted){ try{voiceEl.pause()}catch(e){} } };
$('manualBtn').onclick=()=>{ log('skipped',{what:S.step.id, why:'camera_unsure'}); banner('تابعنا. هذه القطعة لم تتأكد بالكاميرا، وسيراجعها المدرب في فحص ما قبل التشغيل.','warn'); advance(); };
function advance(){ if(S.stepIdx<STEPS.length-1) enterStep(S.stepIdx+1); }
$('finishBuild').onclick=()=>{ S.attempts++; log('attempt',{n:S.attempts}); enterStep(STEPS.findIndex(s=>s.id==='gate')); };

/* step evaluation, called every analysed frame */
function evalStep(ev){
  const id=S.step.id, now=performance.now();
  if(!['resistor','led','red','black'].includes(id) || S.mode==='test') return;
  // early warning (experimental): only while view is not yet stable
  if(ev.view!=='ok'){
    const w = B.earlyWarning(id, ev.rawEnds);
    S.earlyN = w ? S.earlyN+1 : 0;
    if(w && S.earlyN>=3 && S.early!==w){ S.early=w; log('early',{code:w}); const m=msg(w); setState('warn',m[0],m[1]); banner(m[0],'warn'); say(m[2],false,w); }
    else if(!S.early){ const v=msg(ev.view); setState('unknown',v[0],v[1]); }
    S.cand=null; return;
  }
  S.early=null; S.earlyN=0;
  const j = B.judgeStep(id, ev), key=j.state+':'+j.code;
  if(!S.cand || S.cand.key!==key){ S.cand={key,j}; S.candSince=now; return; }
  if(now-S.candSince<COMMIT_MS) return;
  if(S.committed && S.committed.key===key) { maybeManual(j,now); return; }
  S.committed={key, code:j.code, state:j.state};
  const m=msg(j.code); setState(j.state==='unknown'?'unknown':j.state, m[0], m[1]);
  if(j.state==='bad'){ log('error',{code:j.code, step:id}); banner(m[0],'bad'); say(m[2],false,j.code); }
  else if(j.state==='warn'){ log('suspect',{code:j.code, step:id}); say(m[2],false,j.code); }
  else if(j.state==='ok'){ log('ok',{code:j.code, step:id}); banner(m[0],'ok'); say(m[2],false,j.code); $('manualBox').hidden=true; setTimeout(()=>{ if(S.step && S.step.id===id && S.committed && S.committed.state==='ok') advance(); },1600); }
  if(j.state==='ok'||j.state==='bad') S.unknownSince=now;
  maybeManual(j,now);
}
function maybeManual(j,now){ // camera can't see it for 8 s of stable view -> allow recorded manual confirmation
  if((j.state==='unknown'||j.state==='warn') && now-S.unknownSince>8000 && ['resistor','led'].includes(S.step.id)){
    $('manualBox').hidden=false; $('manualWhy').textContent = j.state==='warn' ? 'الكاميرا تشكّ في مكان القطعة. يمكنك المتابعة، لكن التشغيل سيبقى ممنوعاً حتى يتحقق المدرب منها.' : 'الكاميرا لم تتعرف على القطعة. يمكنك المتابعة، لكن التشغيل سيبقى ممنوعاً حتى يتحقق المدرب منها.'; }
}

/* ---------------- gate (fail-safe) ----------------
   USB is allowed only when board.js safetyGate() passes AND keeps passing for GATE_HOLD_MS on a still view.
   The trainee cannot tick anything. Lines the camera cannot verify need a trainer confirmation created on the
   server (confirm_safety); the page only keeps the server's answer {id, by, at, lines}. */
const GATE_HOLD_MS = 1000;
const GATE_LABEL={short:'لا يوجد قصر بين الأحمر والأسود',wires:'الأحمر في الموجب والأسود في السالب',resistor:'المقاومة موجودة في مكانها',led:'اللمبة موجودة في مكانها',
  resistor_value:'قيمة المقاومة 220 أوم (أحمر، أحمر، بني)',led_polarity:'اللمبة على التوالي مع المقاومة: الرجل الطويلة في عمود المقاومة والقصيرة في خط السالب',no_extra:'لا توجد أسلاك أو قطع أخرى على اللوحة غير المطلوبة'};
const FIX_TXT={trainee:'أصلحه أولاً. لا يمكن لأحد تجاوزه.',trainer:'يتحقق منه المدرب ويؤكّد بحسابه.',trainee_or_trainer:'أصلحه، أو يتحقق منه المدرب ويؤكّد بحسابه.',wait:'أبعد اليد وثبّت الكاميرا.'};
const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function voidConfirm(why){
  if(S.confirm && why){ log('confirm_void',{id:S.confirm.id, why}); banner('أُلغي تأكيد المدرب لأن '+(why==='hand'?'يداً اقتربت من اللوحة بعده':'الكاميرا فقدت اللوحة')+'. يلزم تأكيد جديد.','warn'); }
  S.confirm=null;
}
function gateEval(ev){
  if(S.confirm && (ev.view==='hand' || ev.view==='lost')) voidConfirm(ev.view);   // parts may have been touched after the trainer looked
  const g = B.safetyGate(ev, S.confirm);
  const now = performance.now();
  if(g.pass && ev.view==='ok'){ if(!S.gatePassSince) S.gatePassSince=now; } else S.gatePassSince=0;
  g.ready = !!S.gatePassSince && now-S.gatePassSince>=GATE_HOLD_MS;
  S.gate=g;
  $('gateList').innerHTML = g.lines.map(l=>{ const ic=l.state==='ok'?'<b class="ok-t">✓</b>':l.state==='bad'?'<b class="bad-t">✕</b>':'<b class="warn-t">؟</b>';
    const m=msg(l.code); const src = l.src==='trainer' ? (l.state==='ok'&&g.by ? 'المدرب: '+esc(g.by) : 'المدرب') : 'الكاميرا';
    const why = l.state==='ok' ? '' : esc(m[0])+(l.fix?'<br>'+FIX_TXT[l.fix]:'');
    return `<li data-line="${l.id}" data-state="${l.state}">${ic}<span>${GATE_LABEL[l.id]}<br><span class="mut">${why}</span></span><span class="src">${src}</span></li>`; }).join('');
  $('allowBtn').className = 'btn ' + (g.ready?'okb':'ghost');
  $('trainerBtn').disabled = g.danger || !g.trainerCan.length;
  $('trainerHint').textContent = g.danger ? 'يوجد خطأ خطير (أحمر). يجب إصلاحه أولاً، ولا يستطيع أحد تجاوزه.' : g.trainerCan.length ? '' : (g.pass ? 'كل الأسطر مؤكدة.' : 'انتظر ثبات الصورة.');
}
function blockReasons(g){
  return g.lines.filter(l=>l.state!=='ok').map(l=>l.id+':'+l.state+':'+l.code);
}
$('allowBtn').onclick=()=>{
  const g=S.gate; if(!g) return;
  if(S.view!=='ok'){ banner('أنتظر حتى تثبت الصورة وتبتعد اليد، ثم أفحص.','warn'); return; }
  if(g.pass && g.ready){ log('gate_pass',{confirm:S.confirm?S.confirm.id:null}); enterStep(STEPS.findIndex(s=>s.id==='power')); return; }
  if(g.pass){ banner('لحظة: أتأكد أن الصورة ثابتة والنتيجة لا تتغير.','warn'); return; }
  const bad=g.lines.filter(l=>l.state==='bad'), open=g.lines.filter(l=>l.state!=='ok'&&l.state!=='bad');
  log('blocked',{reasons:blockReasons(g)});
  const hasShort=bad.some(l=>l.code==='short');
  bad.filter(l=>!(hasShort && (l.code==='black_in_plus'||l.code==='red_in_minus'))).forEach(l=>log('error',{code:l.code, step:'gate'})); // one physical mistake = one error
  const first = bad[0] ? msg(bad[0].code) : null;
  banner(first ? 'منع التشغيل: '+first[0] : 'منع التشغيل: '+open.length+' '+(open.length===1?'سطر غير مؤكد':'أسطر غير مؤكدة')+'. انظر القائمة.', 'bad');
  say(first ? 'توقف، لا يمكن التشغيل. '+first[2] : 'لا يمكن التشغيل قبل أن يصبح كل سطر أخضر.', true, 'gate_block');
  if(S.mode==='test' && bad.length){ setTimeout(()=>{ if(S.step.id==='gate'){ enterStep(STEPS.findIndex(s=>s.id==='resistor')); banner('أصلح الأخطاء ثم اضغط «انتهيت» مرة أخرى.','warn'); } },2200); }
};

/* ---- trainer confirmation: trainer's own account, checked on the server, password never stored ---- */
function closeTrainer(){ $('trainerForm').hidden=true; $('tPass').value=''; $('tMsg').textContent=''; }
$('trainerBtn').onclick=()=>{
  const g=S.gate; if(!g || g.danger || !g.trainerCan.length) return;
  $('tLines').innerHTML = g.trainerCan.map(id=>`<label class="chk"><input type="checkbox" value="${id}"> <span>${GATE_LABEL[id]}</span></label>`).join('');
  $('tMsg').textContent=''; $('trainerForm').hidden=false;
};
$('tCancel').onclick=closeTrainer;
let trainerBusy=false;
$('tSend').onclick=async()=>{
  if(trainerBusy) return;
  const lines=[...$('tLines').querySelectorAll('input:checked')].map(x=>x.value);
  const email=$('tEmail').value.trim(), pw=$('tPass').value, reason=$('tReason').value.trim();
  if(!lines.length){ $('tMsg').textContent='اختر ما تحققت منه بعينك.'; return; }
  if(reason.length<3){ $('tMsg').textContent='اكتب سبباً قصيراً (ما الذي تحققت منه).'; return; }
  if(!email || !pw){ $('tMsg').textContent='أدخل بريد المدرب وكلمة المرور.'; return; }
  const cfg=window.MIRAS_CONFIG||{};
  if(!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey){ $('tMsg').textContent=msg('no_server')[0]+'. '+msg('no_server')[1]; return; }
  trainerBusy=true; $('tSend').disabled=true; $('tMsg').textContent='أتحقق من الحساب…';
  const snap = S.gate ? Object.fromEntries(S.gate.lines.map(l=>[l.id, l.state+':'+(l.camCode||l.code)])) : null;
  let sb=null;
  try{
    // separate client: does not touch any trainee session on this iPad, keeps nothing after the call
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:'miras-trainer-once'}});
    const li = await sb.auth.signInWithPassword({email, password:pw});
    if(li.error){ $('tMsg').textContent = /invalid|credentials/i.test(li.error.message) ? msg('bad_login')[0] : msg('no_server')[0]+'. '+msg('no_server')[1]; return; }
    const r = await sb.rpc('confirm_safety', {p_lines:lines, p_reason:reason, p_device_session:(S.session&&S.session.id||'nosession').slice(0,64).padEnd(4,'-'), p_trainee:null, p_trainee_label:S.trainee||null, p_camera:snap});
    if(r.error){ $('tMsg').textContent = /not_trainer/.test(r.error.message) ? msg('not_trainer')[0]+'. التشغيل ما زال ممنوعاً.' : msg('no_server')[0]+'. '+msg('no_server')[1]; log('confirm_refused',{why:String(r.error.message).slice(0,40)}); return; }
    const row = r.data && r.data[0];
    const c = row && {id:row.id, by:row.trainer_name||email, at:row.created_at, lines};
    if(!B.validConfirmation(c)){ $('tMsg').textContent=msg('no_server')[0]+'. '+msg('no_server')[1]; return; }
    S.confirm=c; log('trainer_confirm',{id:c.id, by:c.by, at:c.at, lines, reason});
    closeTrainer(); banner('سُجّل تأكيد المدرب '+c.by+'. إن اقتربت يد من اللوحة بعد الآن يُلغى التأكيد.','ok');
  }catch(e){ $('tMsg').textContent=msg('no_server')[0]+'. '+msg('no_server')[1]; }
  finally{ trainerBusy=false; $('tSend').disabled=false; $('tPass').value=''; try{ sb && await sb.auth.signOut({scope:'local'}); }catch(e){} }
};
$('litYes').onclick=()=>{ log('lit',{yes:true}); finish(true); };
$('litNo').onclick=()=>{ log('lit',{yes:false}); log('error',{code:'led_reversed', step:'power', afterPower:true}); $('litHelp').hidden=false; say('افصل الكيبل أولاً. غالباً اللمبة مقلوبة. اقلبها ثم أعد الفحص.',true,'led_reversed');
  setTimeout(()=>{ voidConfirm(null); enterStep(STEPS.findIndex(s=>s.id==='gate')); },3500); };
$('endBtn').onclick=()=>finish(false);

/* ---------------- session log (real data only) ---------------- */
function loadAll(){ try{ return JSON.parse(localStorage.getItem(STORE)||'[]'); }catch(e){ return []; } }
function saveAll(a){ try{ localStorage.setItem(STORE, JSON.stringify(a.slice(-300))); }catch(e){} }
function newSession(){ S.trainee=($('trainee').value||'').trim(); S.session={id:Date.now().toString(36), mode:S.mode, trainee:S.trainee, uid:ME&&ME.id||null, cols:S.cols, src:S.kind, start:new Date().toISOString(), events:[]}; S.t0=performance.now(); S.attempts=0; S.confirm=null; S.gatePassSince=0; $('modeName').textContent = S.mode==='train'?'وضع التدريب':'وضع الاختبار'; }
function log(type, data){ if(!S.session) return; const afterPower = S.step && S.step.id==='power'; S.session.events.push(Object.assign({type, t:Math.round((performance.now()-S.t0)/1000), afterPower}, data)); }
function finish(lit){
  if(!S.session) return;
  S.session.end=new Date().toISOString(); S.session.seconds=Math.round((performance.now()-S.t0)/1000); S.session.attempts=S.attempts; S.session.passed=!!lit;
  const all=loadAll(); all.push(S.session); saveAll(all); toMainAttempt(S.session);
  const ev=S.session.events, errs=ev.filter(e=>e.type==='error'), blocked=ev.filter(e=>e.type==='blocked').length, man=ev.filter(e=>e.type==='trainer_confirm').length, ovr=ev.filter(e=>e.type==='override').length;
  const skipped=ev.filter(e=>e.type==='skipped'), sus=ev.filter(e=>e.type==='suspect'||e.type==='early'), backs=ev.filter(e=>e.type==='back').length;
  const stepName=id=>{ const s=STEPS.find(x=>x.id===id); return s?s.t:id; };
  const reached=S.step?S.step.t:'—';
  $('resTitle').textContent = lit ? 'اكتملت المهارة: أضاءت اللمبة' : 'لم تكتمل المهارة';
  const mm=Math.floor(S.session.seconds/60), ss=S.session.seconds%60;
  $('resBody').innerHTML = `<table><tr><th>الوضع</th><td>${S.mode==='train'?'تدريب':'اختبار'}</td></tr><tr><th>الوقت</th><td>${mm}:${String(ss).padStart(2,'0')}</td></tr>`+
    (S.mode==='test'?`<tr><th>عدد المحاولات</th><td>${S.attempts}</td></tr>`:'')+
    `<tr><th>الحالة</th><td>${lit?'مكتملة':'لم تكتمل، وتوقفت عند خطوة: '+reached}</td></tr>`+
    `<tr><th>أخطاء اكتُشفت</th><td>${errs.length? errs.map(e=>msg(e.code)[0]).join('، ') : (skipped.length||!lit ? 'لم تُرصد أخطاء مؤكدة، لكن الكاميرا لم تتحقق من كل الخطوات، فلا يُعدّ ذلك نتيجة صحيحة' : 'لا شيء')}</td></tr>`+
    `<tr><th>تنبيهات واشتباهات</th><td>${sus.length? [...new Set(sus.map(e=>msg(e.code)[0]))].join('، ') : 'لا شيء'}</td></tr>`+
    `<tr><th>خطوات تُجووزت دون تأكيد الكاميرا</th><td>${skipped.length? skipped.map(e=>stepName(e.what)).join('، ') : 'لا شيء'}</td></tr>`+
    (backs?`<tr><th>مرات الرجوع خطوة</th><td>${backs}</td></tr>`:'')+
    `<tr><th>مرات منع التشغيل</th><td>${blocked}</td></tr>`+`<tr><th>تأكيدات المدرب (بحسابه)</th><td>${man}</td></tr>`+(ovr?`<tr><th>تجاوزات قديمة</th><td>${ovr}</td></tr>`:'')+`</table>`+
    (lit?`<p class="mut">إضاءة اللمبة سُجّلت بجواب من الجهاز نفسه، ولم تتحقق منها الكاميرا.</p>`:'');
  S.session=null; S.phase='done'; $('work').hidden=true; $('result').hidden=false; renderReport();
  try{ S.src && S.src.srcObject && S.src.srcObject.getTracks().forEach(t=>t.stop()); }catch(e){}
  $('recNote').hidden=true;
  try{ S.src && S.src.parentNode && S.src.remove(); }catch(e){} S.src=null; S.loop=false; trackFree();
}
$('againBtn').onclick=()=>{ $('result').hidden=true; $('start').hidden=false; };

const RISK_TXT={high:'خطر تلف',possible:'خطر محتمل',none:'لا تلف في هذه الدائرة'};
function renderReport(){
  const all=loadAll(), r=B.report(all);
  if(!all.length){ $('repBody').innerHTML='<p>لا توجد جلسات بعد. يمتلئ التقرير بعد أول جلسة حقيقية.</p>'; return; }
  const early=all.reduce((n,s)=>n+s.events.filter(e=>e.type==='early').length,0);
  $('repBody').innerHTML = `<div class="kpis">
    <div class="kpi"><b>${r.sessions}</b><span>جلسة (${r.train} تدريب، ${r.test} اختبار)</span></div>
    <div class="kpi"><b>${r.beforePower}</b><span>خطأ اكتُشف قبل التشغيل</span></div>
    <div class="kpi"><b>${r.blocked}</b><span>مرة مُنع فيها تشغيل دائرة غير آمنة</span></div>
    <div class="kpi"><b>${r.ok} / ${r.wrong}</b><span>توصيلات صحيحة / خاطئة</span></div>
    <div class="kpi"><b>${early}</b><span>تحذير مبكر (تجريبي)</span></div>
    <div class="kpi"><b>${r.manualConfirms} · ${r.overrides}</b><span>تأكيد يدوي · تجاوز مدرب</span></div></div>
    <h3>أكثر الأخطاء تكراراً</h3>${r.top.length?`<table><tr><th>الخطأ</th><th>المرات</th><th>الأثر لو شُغّلت الدائرة</th></tr>${r.top.map(([c,n])=>{ const k=B.RISK[c]; return `<tr><td>${msg(c)[0]}</td><td>${n}</td><td>${k?RISK_TXT[k.level]+(k.parts.length?': '+k.parts.join('، '):''):'—'}</td></tr>`; }).join('')}</table>`:'<p class="mut">لا أخطاء مسجلة.</p>'}
    <h3 style="margin-top:12px">المكونات التي تعرضت لخطر محتمل</h3>${Object.keys(r.atRisk).length?`<table>${Object.entries(r.atRisk).map(([p,n])=>`<tr><td>${p}</td><td>${n} مرة</td></tr>`).join('')}</table>`:'<p class="mut">لا شيء.</p>'}
    <h3 style="margin-top:12px">آخر الجلسات</h3><table><tr><th>التاريخ</th><th>المتدرب</th><th>الوضع</th><th>الوقت</th><th>المحاولات</th><th>أخطاء</th><th>خطوات تُجووزت</th><th>النتيجة</th></tr>${all.slice(-10).reverse().map(s=>`<tr><td>${new Date(s.start).toLocaleString('ar-SA-u-nu-latn',{dateStyle:'short',timeStyle:'short'})}</td><td>${(s.trainee||'—').replace(/</g,'')}</td><td>${s.mode==='test'?'اختبار':'تدريب'}</td><td>${Math.floor((s.seconds||0)/60)}:${String((s.seconds||0)%60).padStart(2,'0')}</td><td>${s.attempts||'—'}</td><td>${(s.events||[]).filter(e=>e.type==='error').length}</td><td>${(s.events||[]).filter(e=>e.type==='skipped').length}</td><td>${s.passed?'أضاءت':'لم تكتمل'}</td></tr>`).join('')}</table>`;
}
$('repExport').onclick=()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(loadAll(),null,1)],{type:'application/json'})); a.download='miras-coach-sessions.json'; a.click(); };
$('repClear').onclick=()=>{ if(confirm('مسح كل الجلسات من هذا الجهاز؟')){ saveAll([]); renderReport(); } };
renderReport();

/* ---------------- banner ---------------- */
let bannerT=0;
function banner(t,cls){ const b=$('banner'); b.textContent=t; b.className='banner '+(cls||''); b.hidden=false; clearTimeout(bannerT); bannerT=setTimeout(()=>b.hidden=true,3500); }

/* ---------------- main loop ---------------- */
function frame(ts){
  if(!S.loop) return;
  requestAnimationFrame(frame);
  if(!S.src) return;
  if(S.src.tagName==='VIDEO' && S.src.readyState<2) return;
  if(S.kind==='cam') ctx.clearRect(0,0,cvs.width,cvs.height); else ctx.drawImage(S.src,0,0,cvs.width,cvs.height);
  S._fpsN++; if(ts-S._fpsT>1000){ S.fps=S._fpsN; S._fpsN=0; S._fpsT=ts; }
  if(S.phase==='setup'){ autoTry(); drawSetup(); chip('ضبط اللوحة','warn'); return; }
  if(!S.H || !S.ref) return;
  pctx.drawImage(S.src,0,0,pc.width,pc.height);
  const img=pctx.getImageData(0,0,pc.width,pc.height), k=pc.width/S.srcW;
  if(S.track.ok) trackStep(img,k);
  if(S.cvReady && S.orbRef && (!S.track.ok ? performance.now()-S.lostSince>500 : performance.now()-S.relocAt>1500)){
    // lost: find the board again against the calibration frame; tracking: periodic drift correction
    const g=grayMat(img), wasOk=S.track.ok;
    let ok = wasOk ? relocalize(g,k,S.orbRef,S.Hcal,0.5) : relocalize(g,k,S.orbRef,S.Hcal);
    if(!ok && !wasOk && S.orbRecent) ok=relocalize(g,k,S.orbRecent,S.orbRecent.H);
    g.delete(); S.relocAt=performance.now();
    if(ok){ if(!wasOk || S.needRecal){ S.needRecal=false; trackInit(img,k); log('board_found',{how:'features'}); } else { trackFree(); trackInit(img,k); } }
    else if(!wasOk) S.lostSince=performance.now();
  }
  // lost for a moment (or the overlay no longer matches): look for the hole grid again, no taps needed
  const nowT=performance.now();
  if(!S.track.ok || S.track.static){ if(!S.lostFrom) S.lostFrom=nowT; } else S.lostFrom=0;
  if(S.lostFrom && nowT-S.lostFrom>700 && (!S.track.ok || S.needRecal) && autoRecover()){
    S.needRecal=false; S.lostFrom=0; trackInit(img,k); S.lostSince=0; S.hJump=true; log('board_found',{how:'grid'});
    banner('رجعت الإرشادات فوق اللوحة.','ok');
  }
  if(S.track.ok && !S.track.static && S.view==='ok' && (S.track.inl||0)>=30 && nowT-(S.recentAt||0)>4000) refreshRecent(img,k);
  if(performance.now()-S.detAt>DET_EVERY) detect();
  boardSanity();
  const R=sampleRect(S.rect,img,k);
  S.view=viewOf(R); S.prevGray=R.gray.slice();
  const ev=evidence(R,img,k);
  ev.rawEnds=ev.railEnds; S.ev=ev;
  if(S.phase!=='done'){
    if(S.step && S.step.id==='gate') gateEval(ev); else if(S.step) evalStep(ev);
    if(S.step && S.step.id==='power' && ev.view==='ok'){ const R2=ev.railEnds; if(R2.red&&R2.black&&R2.red===R2.black&&R2.red!=='unclear'){ if(!S.powerAlarm){ S.powerAlarm=true; log('error',{code:'short',step:'power'}); banner('افصل الكيبل فوراً: قصر كهربائي','bad'); say('افصل الكيبل فوراً. يوجد قصر كهربائي.',true,'power_short'); } } else S.powerAlarm=false; }
  }
  drawOverlay(ev, ts);
  const t=Math.round((performance.now()-S.t0)/1000); $('timer').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  $('tech').textContent=`التتبع: ${S.cvReady?(S.track.ok?`يعمل (${S.track.inl||0} نقطة)`:'ضائع'):'غير متاح (كاميرا ثابتة فقط)'} · النموذج: ${S.detMs} ملّي ثانية · ${S.fps} إطار/ث · حركة ${(100*(S.motion||0)).toFixed(1)}٪ · جلد ${(100*(S.skin||0)).toFixed(1)}٪ · الصورة: ${({ok:'ثابتة',moving:'تتحرك',hand:'يد',lost:'ضائعة'})[S.view]||S.view}${S.reachDbg?` · فتحات (+ ${S.reachDbg.r.plus}/${S.reachDbg.l.plus}، − ${S.reachDbg.r.minus}/${S.reachDbg.l.minus})`:''}`;
}
function chip(t,cls){ const c=$('chip'); c.textContent=t; c.className='chip '+(cls||''); }

/* ---------------- drawing ---------------- */
const COL={ok:'#47d78f',bad:'#ff5a4a',warn:'#ffc75a',unknown:'#ffc75a',target:'#e2b54e'};
function lw(){ return Math.max(2,cvs.width/400); }
function drawSetup(){
  const L=lw(); ctx.lineWidth=L;
  S.taps.forEach((p,i)=>{ ctx.strokeStyle='#e2b54e'; ctx.beginPath(); ctx.arc(p[0],p[1],L*6,0,7); ctx.stroke(); ctx.fillStyle='#e2b54e'; ctx.font=`700 ${L*9}px sans-serif`; ctx.fillText(String(i+1),p[0]+L*7,p[1]-L*7); });
  if(S.H){ ctx.fillStyle='rgba(92,225,255,.85)'; const r=Math.max(1.5,L*0.9);
    for(let c=0;c<S.cols;c++) for(let rr=0;rr<10;rr++){ const [x,y]=toImg(c,B.rowY(rr)); ctx.fillRect(x-r,y-r,2*r,2*r); }
    if(S.rails) for(const [key,colr] of [['plus','#ff5d5d'],['minus','#5a93ff']]) if(S.rails[key]!=null){ ctx.fillStyle=colr; for(let c=0;c<S.cols;c++){ const [x,y]=toImg(c,S.rails[key]); ctx.fillRect(x-r,y-r,2*r,2*r); } }
  }
}
function poly(pts){ ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath(); }
function railSeg(y,x0,x1,color,fill){ const h=0.5; poly([toImg(x0,y-h),toImg(x1,y-h),toImg(x1,y+h),toImg(x0,y+h)]); if(fill){ ctx.fillStyle=fill; ctx.fill(); } ctx.strokeStyle=color; ctx.stroke(); }
function holeRing(x,y,color,ts){ const [cx,cy]=toImg(x,y), [ex]=toImg(x+1,y), pitch=Math.abs(ex-cx)||8, pulse=1+0.25*Math.sin(ts/220);
  ctx.strokeStyle=color; ctx.lineWidth=lw()*1.4; ctx.beginPath(); ctx.arc(cx,cy,pitch*0.75*pulse,0,7); ctx.stroke(); }
function arrow(x,y,fromDy,color,ts){ // animated arrow in board space, bobbing toward (x,y)
  const bob=0.6*Math.sin(ts/260), a=toImg(x,y+fromDy+bob*Math.sign(fromDy)), b=toImg(x,y+Math.sign(fromDy)*0.9);
  const ang=Math.atan2(b[1]-a[1],b[0]-a[0]), L=lw();
  ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=L*2.2; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(b[0],b[1]); ctx.lineTo(b[0]-L*9*Math.cos(ang-0.45),b[1]-L*9*Math.sin(ang-0.45)); ctx.lineTo(b[0]-L*9*Math.cos(ang+0.45),b[1]-L*9*Math.sin(ang+0.45)); ctx.closePath(); ctx.fill();
}
function label(t,x,y,color){ const [px,py]=toImg(x,y), L=lw(); ctx.font=`700 ${Math.round(L*8)}px "IBM Plex Sans Arabic",sans-serif`; ctx.direction='rtl'; ctx.textAlign='center';
  const w=ctx.measureText(t).width+L*6; ctx.fillStyle='rgba(0,0,0,.72)'; ctx.fillRect(px-w/2,py-L*7,w,L*11); ctx.fillStyle=color; ctx.fillText(t,px,py+L*2); }
function drawOverlay(ev, ts){
  const st = S.view!=='ok' ? 'unknown' : (S.committed ? S.committed.state : 'unknown');
  const color = S.view==='lost' ? '#ffc75a' : (S.step && ['gate','power'].includes(S.step.id) ? (S.gate&&S.gate.pass?COL.ok:S.gate&&S.gate.danger?COL.bad:COL.warn) : COL[st]);
  const L=lw(); ctx.lineWidth=L;
  // board outline + rails
  ctx.setLineDash(S.view==='lost'?[L*4,L*4]:[]); ctx.strokeStyle=color; poly(quad(0.8)); ctx.stroke(); ctx.setLineDash([]);
  railSeg(S.rails.plus,-0.5,S.cols-0.5,'rgba(255,93,93,.8)','rgba(255,93,93,.10)');
  railSeg(S.rails.minus,-0.5,S.cols-0.5,'rgba(90,147,255,.8)','rgba(90,147,255,.10)');
  const pv=toImg(-1.2,S.rails.plus), mv=toImg(-1.2,S.rails.minus); ctx.font=`700 ${Math.round(L*9)}px sans-serif`; ctx.textAlign='center'; ctx.fillStyle='#ff5d5d'; ctx.fillText('+',pv[0],pv[1]+L*3); ctx.fillStyle='#5a93ff'; ctx.fillText('−',mv[0],mv[1]+L*3);
  if(S.view==='lost'){ const long = S.lostFrom && performance.now()-S.lostFrom>8000; chip(long ? 'لم أجد اللوحة بعد: ثبّت الجهاز فوقها، أو اضغط «إعادة ضبط اللوحة»' : 'أبحث عن اللوحة… ثبّت الجهاز لحظة','warn'); return; }
  // guidance (training mode only)
  const id=S.step&&S.step.id, T=B.targets(S.cols), C=T.col-1, out=yTop()<0 ? -1 : 1;
  const tc = st==='ok'?COL.ok : st==='bad'?COL.bad : st==='warn'?COL.warn : COL.target;
  if(S.mode==='train' && id){
    if(id==='resistor'){ holeRing(C,0,tc,ts); railSeg(S.rails.plus,C-0.5,C+0.5,tc); holeRing(C,S.rails.plus,tc,ts); arrow(C,0,4.5,tc,ts); label('المقاومة هنا',C,6.2,tc); }
    if(id==='led'){ holeRing(C,2,tc,ts); holeRing(C+3,S.rails.minus,tc,ts); arrow(C,2,4.5,tc,ts);
      label('الطويلة (+)',C,7.6,tc); label('القصيرة (−)',C+3,S.rails.minus+(S.rails.minus<0?-1.6:1.6),tc);
      const a=toImg(C,2), b=toImg(C+3,S.rails.minus); ctx.setLineDash([L*3,L*3]); ctx.strokeStyle=tc; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); ctx.setLineDash([]); }
    if(id==='red'){ railSeg(S.rails.plus,T.red.from-1-0.5,T.red.to-1+0.5,tc,'rgba(226,181,78,.25)'); arrow((T.red.from+T.red.to)/2-1,S.rails.plus,-3.5,tc,ts); label('الأحمر 5V هنا',(T.red.from+T.red.to)/2-1,S.rails.plus-4.6,tc); }
    if(id==='black'){ railSeg(S.rails.minus,T.black.from-1-0.5,T.black.to-1+0.5,tc,'rgba(226,181,78,.25)'); arrow((T.black.from+T.black.to)/2-1,S.rails.minus,-3.5,tc,ts); label('الأسود GND هنا',(T.black.from+T.black.to)/2-1,S.rails.minus-4.6,tc); }
  }
  // mark confirmed wire errors on the rail where they are
  const E=ev.railEnds;
  if(E.red==='-' ) railSeg(S.rails.minus,-0.5,S.cols-0.5,COL.bad);
  if(E.black==='+') railSeg(S.rails.plus,-0.5,S.cols-0.5,COL.bad);
  const RC=B.targets(S.cols).col-1, RH=ev.reach||{};
  if(RH.resistor==='wrong') railSeg(S.rails.minus,RC-1.5,RC+1.5,COL.bad,'rgba(255,90,74,.30)');
  if(RH.led==='wrong') railSeg(S.rails.plus,RC+1.5,RC+4.5,COL.bad,'rgba(255,90,74,.30)');
  // model detections (thin)
  for(const d of (performance.now()-S.detAt<DET_MAX_AGE?S.dets:[])) if(d.cls==='resistor'||d.cls==='led'){
    // uncertainty mode: below the gate confidence the part is not named, it is shown as not recognised
    const sure=d.s>=B.GATE_MIN_CONF; ctx.strokeStyle=!sure?COL.warn:d.cls==='led'?'#ff4fd8':'#7CFC00'; ctx.lineWidth=L*0.8; ctx.setLineDash(sure?[]:[L*3,L*2]); ctx.strokeRect(d.x1,d.y1,d.x2-d.x1,d.y2-d.y1); ctx.setLineDash([]);
    const t=sure?(d.cls==='led'?'اللمبة':'المقاومة'):'لم أتمكن من التعرف عليها', fs=Math.max(13,L*6.5); ctx.save(); ctx.font=`600 ${fs}px "Readex Pro",sans-serif`; ctx.textBaseline='top'; ctx.direction='rtl'; ctx.textAlign='left';
    const tw=ctx.measureText(t).width, ty=Math.max(0,d.y1-fs-6); ctx.fillStyle=ctx.strokeStyle; ctx.fillRect(d.x1,ty,tw+10,fs+6); ctx.fillStyle='#0b2a1f'; ctx.fillText(t,d.x1+5,ty+3); ctx.restore(); }
  // chip
  if(S.view==='hand') chip('اليد فوق اللوحة: أنتظر','warn');
  else if(S.view==='moving') chip(S.early?msg(S.early)[0]:'الصورة تتحرك: أنتظر','warn');
  else if(id==='gate') chip(S.gate&&S.gate.pass?'اجتاز الفحص: يمكن التشغيل':S.gate&&S.gate.danger?'ممنوع التشغيل: خطأ خطير':'ممنوع التشغيل حتى يكتمل الفحص', S.gate&&S.gate.pass?'ok':S.gate&&S.gate.danger?'bad':'warn');
  else if(id==='power') chip('التشغيل: راقب اللمبة','ok');
  else if(S.mode==='test') chip('وضع الاختبار: لا إرشاد','');
  else if(S.committed) chip(msg(S.committed.code)[0], S.committed.state==='unknown'?'warn':S.committed.state);
  else chip('أفحص…','');
}

/* test hook for automated checks (no effect on users) */
window.__coach = {S, B, useSource, bands(colour,y){ const d=[]; bandCols(S.rect,S.ref,colour,y-0.42,y+0.42,exclusionZones(),d); return d; }, setTaps(t,r){ S.taps=t; S.H=B.boardFromTaps(S.cols,t); S.rails=r; renderSetup(); }, done(){ $('setupDone').click(); }, enterStep, gateEval, quad:()=>quad(0)};
})();
