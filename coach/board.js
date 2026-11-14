/* مراس · المدرب المباشر — pure logic (no DOM, no camera). Tested in Node by tests/coach-logic.test.js.
   Board units: 1 unit = 1 hole pitch (2.54 mm). Column c (1..cols) -> x = c-1.
   Main rows: index 0 = row nearest the power rails used, 0..4 one half, 5..9 the other half.
   The centre channel is 3 pitches wide, so y(row) = row<5 ? row : row+2  (rows 0..4 -> 0..4, rows 5..9 -> 7..11). */
(function(root){
'use strict';

const ROW_Y = [0,1,2,3,4,7,8,9,10,11];
const rowY = r => ROW_Y[r];

/* ---------- homography (4-point DLT, row-major 3x3 arrays) ---------- */
function solve(A, b){ // Gaussian elimination, A n x n
  const n = b.length, M = A.map((r,i)=>r.concat([b[i]]));
  for(let c=0;c<n;c++){
    let p=c; for(let r=c+1;r<n;r++) if(Math.abs(M[r][c])>Math.abs(M[p][c])) p=r;
    if(Math.abs(M[p][c])<1e-12) return null;
    [M[c],M[p]]=[M[p],M[c]];
    for(let r=0;r<n;r++){ if(r===c) continue; const f=M[r][c]/M[c][c]; for(let k=c;k<=n;k++) M[r][k]-=f*M[c][k]; }
  }
  return M.map((r,i)=>r[n]/r[i]);
}
function homography(src, dst){ // maps src[i] -> dst[i], 4 points
  const A=[], b=[];
  for(let i=0;i<4;i++){
    const [x,y]=src[i], [u,v]=dst[i];
    A.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v);
  }
  const h = solve(A,b); if(!h) return null;
  return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
}
function apply(H, x, y){
  const w = H[6]*x+H[7]*y+H[8];
  return [(H[0]*x+H[1]*y+H[2])/w, (H[3]*x+H[4]*y+H[5])/w];
}
function mul(A,B){ const C=new Array(9).fill(0);
  for(let i=0;i<3;i++) for(let j=0;j<3;j++) for(let k=0;k<3;k++) C[i*3+j]+=A[i*3+k]*B[k*3+j];
  return C.map(v=>v/C[8]); }
function inv(m){
  const [a,b,c,d,e,f,g,h,i]=m, A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g, det=a*A+b*B+c*C;
  if(Math.abs(det)<1e-12) return null;
  const r=[A,-(b*i-c*h),b*f-c*e, B,a*i-c*g,-(a*f-c*d), C,-(a*h-b*g),a*e-b*d].map(v=>v/det);
  return r.map(v=>v/r[8]);
}
function scaleH(H, s){ return mul([s,0,0,0,s,0,0,0,1], H); } // image coordinates scaled by s

/* ---------- board model ---------- */
function makeBoard(cols){ return {cols, rows:10}; }
// The 4 calibration holes, in tap order: (1) column 1 / row nearest rails, (2) last column / same row,
// (3) last column / far row, (4) column 1 / far row.
function calibHoles(cols){ return [[0,0],[cols-1,0],[cols-1,11],[0,11]]; }
function boardFromTaps(cols, taps){ return homography(calibHoles(cols), taps); }
/* Corner taps may come in any order. Returns them as [top-left, top-right, bottom-right, bottom-left] in the image,
   where 1->2 is a long edge of the board. Null if the four points do not form a convex quad. */
function orderTaps(taps){
  if(!taps || taps.length!==4) return null;
  const cx=taps.reduce((a,p)=>a+p[0],0)/4, cy=taps.reduce((a,p)=>a+p[1],0)/4;
  let q=taps.slice().sort((p,r)=>Math.atan2(p[1]-cy,p[0]-cx)-Math.atan2(r[1]-cy,r[0]-cx));   // clockwise on screen (y down)
  const cross=i=>{ const A=q[i],Bq=q[(i+1)%4],C=q[(i+2)%4]; return (Bq[0]-A[0])*(C[1]-Bq[1])-(Bq[1]-A[1])*(C[0]-Bq[0]); };
  const sg=[0,1,2,3].map(cross); if(!(sg.every(v=>v>0)||sg.every(v=>v<0))) return null;
  const len=i=>Math.hypot(q[(i+1)%4][0]-q[i][0], q[(i+1)%4][1]-q[i][1]);
  // start index: a long edge, and of the two long edges the one whose midpoint is higher (or more to the left if the board is upright)
  const longFirst = len(0)+len(2) >= len(1)+len(3) ? [0,2] : [1,3];
  const mid=i=>[(q[i][0]+q[(i+1)%4][0])/2,(q[i][1]+q[(i+1)%4][1])/2];
  const m0=mid(longFirst[0]), m1=mid(longFirst[1]);
  const horiz=Math.abs(m0[1]-m1[1])>=Math.abs(m0[0]-m1[0]);
  const st = (horiz ? m0[1]<=m1[1] : m0[0]<=m1[0]) ? longFirst[0] : longFirst[1];
  return [0,1,2,3].map(i=>q[(st+i)%4]);
}
/* Board size from the tapped corners: long/short side is 29/11 = 2.6 for 30 columns, 62/11 = 5.6 for 63. Null when unclear. */
function guessCols(o){
  if(!o) return null; const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const r=(d(o[0],o[1])+d(o[2],o[3]))/Math.max(1e-6,d(o[1],o[2])+d(o[3],o[0]));
  return r>=4.4 ? 63 : r<=3.6 ? 30 : null;
}

/* Breadboard mapping: which holes are electrically the same node. */
function netOf(hole){
  if(hole.rail) return 'R'+hole.rail;                 // 'R+' / 'R-'  (whole rail; see railSplit note)
  return (hole.row<5 ? 'T' : 'B') + hole.col;         // 5 holes of one column-half are one node
}
function sameNet(a,b){ return netOf(a)===netOf(b); }
/* Many full-size (63-column) boards cut each rail in the middle. Targets stay on columns <= 25,
   so the circuit works whether or not the rail is split. */
const RAIL_SAFE_MAX_COL = 25;

/* Target layout for the skill (same circuit as the main page):
   resistor 220Ω from + rail to column 10 (row 0); LED long leg in column 10 (row 2), short leg in − rail;
   red wire 5V -> + rail, black wire GND -> − rail. */
function targets(cols){
  const C = Math.min(10, cols-4);
  return {
    resistor: {a:{rail:'+', col:C}, b:{col:C,row:0}},
    led:      {long:{col:C,row:2}, short:{rail:'-', col:C+3}},
    red:      {rail:'+', from:2, to:6},
    black:    {rail:'-', from:2, to:6},
    col: C
  };
}
function holeXY(h, rails){ // hole -> board units
  if(h.rail) return [h.col-1, h.rail==='+' ? rails.plus : rails.minus];
  return [h.col-1, rowY(h.row)];
}

/* Circuit check from a placement (used in tests and in the "why" explanations).
   Must agree with app/core/circuit.js (tests/coach-gate.test.js compares both on every placement). */
function checkCircuit(p){
  // p: {red:'+'|'-'|null, black:'+'|'-'|null, resistor:[holeA,holeB]|null, ledLong:hole|null, ledShort:hole|null}
  const out=[];
  const n = h => h ? netOf(h) : null;
  if(p.red && p.black && p.red===p.black) out.push({code:'short', sev:'bad'});
  else {
    if(p.red==='-') out.push({code:'red_in_minus', sev:'bad'});
    if(p.black==='+') out.push({code:'black_in_plus', sev:'bad'});
  }
  if(p.ledLong && p.ledShort){
    const L=n(p.ledLong), S=n(p.ledShort);
    const R = p.resistor ? [n(p.resistor[0]), n(p.resistor[1])] : null;
    if(L===S){ out.push({code:'led_shorted', sev:'bad'}); return out; }
    // LED legs straight in + and − : no resistor in its path, whatever else is on the board (fixed Nov 14, audit bug 1)
    if(L==='R+' && S==='R-'){ out.push({code:'no_resistor', sev:'bad'}); return out; }
    if(L==='R-' && S==='R+'){ out.push({code:'led_reversed', sev:'warn'}); return out; }
    if(!R){ out.push({code:'resistor_missing', sev:'warn'}); return out; }
    if(R[0]===R[1]){ out.push({code:'resistor_shorted', sev:'warn'}); return out; }
    const other = R[0]==='R+' ? R[1] : R[1]==='R+' ? R[0] : null;    // resistor end that is NOT in +
    const otherG = R[0]==='R-' ? R[1] : R[1]==='R-' ? R[0] : null;   // resistor on the ground side
    const inSeries = (other && L===other && S==='R-') || (otherG && L==='R+' && S===otherG);
    const reversed = (other && S===other && L==='R-') || (otherG && S==='R+' && L===otherG);
    if(reversed) out.push({code:'led_reversed', sev:'warn'});
    else if(!inSeries) out.push({code:'not_series', sev:'warn'});
  }
  return out;
}

/* ---------- wire-end reasoning on rail strips ----------
   bands: presence of a colour in strips, as x-intervals (board units):
   {outer:[x...], inner:[x...], main:[x...]}  (lists of column indices where colour coverage passed threshold)
   Wires come from outside the board (the Arduino side), so a wire reaching the inner strip also crosses the outer one.
   The END is the innermost strip with colour, unless the colour keeps going into the main area at the same x. */
function wireEnd(b){
  const has = a => a && a.length>0;
  const overlap = (a,c,tol=1.5) => a.some(x=>c.some(y=>Math.abs(x-y)<=tol));
  if(!has(b.outer) && !has(b.inner)) return {end:null};
  if(has(b.inner)){
    if(has(b.main) && overlap(b.inner,b.main)) return {end:'unclear'};   // keeps going: cannot tell where it ends
    return {end:'inner'};
  }
  return {end:'outer'};
}

/* ---------- step judgments ----------
   ev = {view:'ok'|'moving'|'hand'|'lost'|'nocv', railEnds:{red:'+'|'-'|'unclear'|null, black:...},
         resistor:{seen:bool, near:bool, conf}, led:{seen,near,conf}, targetChanged:{resistor:bool, led:bool}}
   returns {state:'ok'|'bad'|'warn'|'unknown', code}
   'unknown' = cannot see clearly (yellow) ; 'warn' = suspicion (yellow) ; 'bad' = confirmed error (red) ; 'ok' = confirmed (green) */
/* Minimum model confidence for the camera to CONFIRM a part. 0.6 is a cautious starting value chosen on Nov 14,
   NOT measured: replace it with a value from the frozen evaluation set (roadmap item 8). Below it the part is
   'unknown (low confidence)', never ok. The model's display threshold (0.35, coach.js) is separate. */
const GATE_MIN_CONF = 0.6;
function confident(p, min){ return !!p && typeof p.conf==='number' && Number.isFinite(p.conf) && p.conf >= (min==null?GATE_MIN_CONF:min); }

function viewState(ev){
  if(ev.view==='lost') return {state:'unknown', code:'lost'};
  if(ev.view==='hand') return {state:'unknown', code:'hand'};
  if(ev.view==='moving') return {state:'unknown', code:'moving'};
  return null;
}
function judgeStep(step, ev){
  const v = viewState(ev); if(v) return v;
  const R = ev.railEnds||{}, red=R.red, black=R.black;
  if(red && black && red===black && red!=='unclear') return {state:'bad', code:'short'};
  switch(step){
    case 'resistor': {
      const r = ev.resistor||{};
      if(r.seen && !confident(r)) return {state:'unknown', code:'resistor_low_conf'};
      if(r.seen && r.near) return {state:'ok', code: ev.targetChanged&&ev.targetChanged.resistor ? 'resistor_ok_hole' : 'resistor_ok'};
      if(r.seen && !r.near) return {state:'warn', code:'resistor_far'};
      return {state:'unknown', code:'resistor_unseen'};
    }
    case 'led': {
      const l = ev.led||{};
      if(l.seen && !confident(l)) return {state:'unknown', code:'led_low_conf'};
      if(l.seen && l.near) return {state:'ok', code:'led_ok'};
      if(l.seen && !l.near) return {state:'warn', code:'led_far'};
      return {state:'unknown', code:'led_unseen'};
    }
    case 'red':
      if(red==='+') return {state:'ok', code:'red_ok'};
      if(red==='-') return {state:'bad', code:'red_in_minus'};
      if(red==='unclear') return {state:'warn', code:'red_unclear'};
      return {state:'unknown', code:'red_unseen'};
    case 'black':
      if(black==='-' && red==='+') return {state:'ok', code:'black_ok'};
      if(black==='-') return {state:'warn', code:'black_ok_red_missing'};
      if(black==='+') return {state:'bad', code: red==='+' ? 'short' : 'black_in_plus'};
      if(black==='unclear') return {state:'warn', code:'black_unclear'};
      return {state:'unknown', code:'black_unseen'};
  }
  return {state:'unknown', code:'?'};
}

/* Early warning while the hand is still moving (experimental): colour already in the WRONG strip. */
function earlyWarning(step, rawEnds){
  if(!rawEnds) return null;
  if(step==='red' && rawEnds.red==='-') return 'early_red_minus';
  if(step==='black' && rawEnds.black==='+') return 'early_black_plus';
  return null;
}

/* ---------- pre-power safety gate (fail-safe, Nov 14) ----------
   USB is allowed only when EVERY line is 'ok'. Anything missing, unclear, low-confidence or not yet checked blocks.
   Lines come from two sources only:
     camera  : what the camera really sees, on a still view, above GATE_MIN_CONF
     trainer : a confirmation created on the server by a signed-in trainer/admin (see confirm_safety() in
               supabase/migrations/20261115000001_safety_confirmations.sql). A trainee's own tick is never accepted.
   A trainer can confirm a camera line only while it is 'unknown'/'warn' and the view is still. A 'bad' line
   (confirmed danger: short, wire in the wrong rail) can NEVER be confirmed away: it must be fixed.
   Lines the camera cannot see at all (TRAINER_LINES) always need the trainer. */
const CAMERA_LINES = ['short','wires','resistor','led'];
const TRAINER_LINES = ['resistor_value','led_polarity','no_extra'];
const GATE_LINES = CAMERA_LINES.concat(TRAINER_LINES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* A confirmation is usable only if it carries the server record (uuid), the trainer, the server time and line ids. */
function validConfirmation(c){
  return !!c && typeof c==='object' && typeof c.id==='string' && UUID_RE.test(c.id)
    && typeof c.by==='string' && c.by.trim().length>0 && typeof c.at==='string' && !isNaN(Date.parse(c.at))
    && Array.isArray(c.lines) && c.lines.length>0 && c.lines.every(x=>GATE_LINES.includes(x));
}
function confirmedLines(c){ return validConfirmation(c) ? new Set(c.lines) : new Set(); }

function partLine(p, id, min){
  p = p||{};
  if(!p.seen) return {state:'unknown', code:id+'_unseen'};
  if(!confident(p, min)) return {state:'unknown', code:id+'_low_conf'};
  if(!p.near) return {state:'warn', code:id+'_far'};
  return {state:'ok', code:id+'_ok'};
}

function safetyGate(ev, confirmation, opts){
  ev = ev||{}; opts = opts||{};
  const min = opts.minConf==null ? GATE_MIN_CONF : opts.minConf;
  const v = viewState(ev) || (ev.view==='ok' ? null : {state:'unknown', code: ev.view ? String(ev.view) : 'lost'});
  const R = ev.railEnds||{};
  const byTrainer = confirmedLines(confirmation);
  const L = [];
  const cam = (id, fn) => {
    if(v){ L.push({id, state:'unknown', code:v.code, src:'camera', fix:'wait'}); return; }
    const r = Object.assign({id, src:'camera'}, fn());
    if(r.state==='bad') r.fix='trainee';
    else if(r.state!=='ok'){
      if(byTrainer.has(id)){ r.state='ok'; r.camCode=r.code; r.code='trainer_ok'; r.src='trainer'; }
      else r.fix='trainee_or_trainer';
    }
    L.push(r);
  };
  cam('short', () => {
    if(R.red && R.black && R.red===R.black && R.red!=='unclear') return {state:'bad', code:'short'};
    if(R.red==='+' && R.black==='-') return {state:'ok', code:'no_short'};
    return {state:'unknown', code:'wires_unclear'};
  });
  cam('wires', () => {
    if(R.red==='-') return {state:'bad', code:'red_in_minus'};
    if(R.black==='+') return {state:'bad', code:'black_in_plus'};
    if(R.red==='+' && R.black==='-') return {state:'ok', code:'wires_ok'};
    return {state:'unknown', code:'wires_unclear'};
  });
  cam('resistor', () => partLine(ev.resistor, 'resistor', min));
  cam('led', () => partLine(ev.led, 'led', min));
  for(const id of TRAINER_LINES){
    if(v) L.push({id, src:'trainer', state:'unknown', code:v.code, fix:'wait'});
    else if(byTrainer.has(id)) L.push({id, src:'trainer', state:'ok', code:'trainer_ok'});
    else L.push({id, src:'trainer', state:'unknown', code:'trainer_needed', fix:'trainer'});
  }
  const danger = L.some(x=>x.state==='bad');
  const pass = !danger && L.length===GATE_LINES.length && L.every(x=>x.state==='ok');
  return {pass, danger, lines:L,
    mustFix: L.filter(x=>x.state==='bad').map(x=>x.id),
    trainerCan: L.filter(x=>x.state!=='ok' && x.state!=='bad' && x.fix!=='wait').map(x=>x.id),
    by: byTrainer.size ? confirmation.by : null};
}

/* The gate result must stay 'pass' for `need` consecutive evaluations before USB is allowed.
   Any non-pass evaluation resets the count. */
function makeGateStabilizer(need){
  let n=0;
  return { push(g){ n = g && g.pass ? n+1 : 0; return n>=need; }, reset(){ n=0; }, get count(){ return n; } };
}

/* Which components are put at risk by a given error (for the protection report). Physics of THIS circuit. */
const RISK = {
  short:        {parts:['الأردوينو','منفذ USB في الجهاز'], level:'high'},
  black_in_plus:{parts:['الأردوينو'], level:'high'},
  no_resistor:  {parts:['اللمبة LED'], level:'high'},
  led_shorted:  {parts:[], level:'none'},
  red_in_minus: {parts:[], level:'none'},   // reversed polarity: LED stays off, nothing burns in this circuit
  led_reversed: {parts:[], level:'none'},
  resistor_far: {parts:['اللمبة LED'], level:'possible'},
  resistor_unseen:{parts:['اللمبة LED'], level:'possible'}
};

/* Protection report from REAL logged sessions only. */
function report(sessions){
  const S = sessions||[];
  const r = {sessions:S.length, train:0, test:0, beforePower:0, ok:0, wrong:0, blocked:0, overrides:0, freq:{}, atRisk:{}, manualConfirms:0};
  for(const s of S){
    if(s.mode==='test') r.test++; else r.train++;
    for(const e of (s.events||[])){
      if(e.type==='error'){ r.wrong++; if(!e.afterPower) r.beforePower++; r.freq[e.code]=(r.freq[e.code]||0)+1;
        const k = RISK[e.code]; if(k) for(const p of k.parts) r.atRisk[p]=(r.atRisk[p]||0)+1; }
      if(e.type==='ok') r.ok++;
      if(e.type==='blocked') r.blocked++;
      if(e.type==='override') r.overrides++;
      if(e.type==='trainer_confirm') r.manualConfirms++;   // trainer confirmed (server record) what the camera could not see
      if(e.type==='manual' && e.why) r.manualConfirms++;   // sessions saved before Nov 14 (no trainer identity)
    }
  }
  r.top = Object.entries(r.freq).sort((a,b)=>b[1]-a[1]);
  return r;
}

/* Stability filter: a verdict is committed only after it repeats for `need` consecutive stable evaluations. */
function makeStabilizer(need){
  let last=null, n=0;
  return {
    push(key){ if(key===last) n++; else { last=key; n=1; } return n>=need ? last : null; },
    reset(){ last=null; n=0; }
  };
}

const api = {ROW_Y,rowY,homography,apply,mul,inv,scaleH,makeBoard,calibHoles,boardFromTaps,orderTaps,guessCols,netOf,sameNet,RAIL_SAFE_MAX_COL,
  targets,holeXY,checkCircuit,wireEnd,judgeStep,earlyWarning,safetyGate,RISK,report,makeStabilizer,
  GATE_MIN_CONF,CAMERA_LINES,TRAINER_LINES,GATE_LINES,validConfirmation,makeGateStabilizer};
if(typeof module!=='undefined' && module.exports) module.exports = api; else root.MirasBoard = api;
})(this);
