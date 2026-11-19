// node tests/coach-place.test.js — Nov 19: parts are judged by where their legs are electrically, in ANY column.
const B = require('../coach/board.js');
let pass=0, fail=0; const t=(n,c)=>{ if(c) pass++; else { fail++; console.log('FAIL', n); } };
const rails={plus:-2.2, minus:-3.2};
const M=(col,row)=>({col,row}), P=c=>({rail:'+',col:c}), N=c=>({rail:'-',col:c});
const cov=hs=>hs.map(h=>({h,cover:0.9}));

// resistor: every column, every row of the half next to the rails, with the + rail leg anywhere
let okAll=true; for(const cols of [30,63]) for(let c=1;c<=cols;c++) for(let r=0;r<5;r++) for(const pc of [1,c,cols]) if(B.judgeResistorLegs([P(pc),M(c,r)]).state!=='ok') okAll=false;
t('resistor accepted in any column / row / + rail hole (30 and 63 columns)', okAll);
t('resistor net follows its column', B.judgeResistorLegs([P(3),M(17,2)]).net==='T17');
t('resistor leg in − rail -> bad resistor_in_minus', B.judgeResistorLegs([N(17),M(17,0)]).code==='resistor_in_minus');
t('resistor legs in same strip -> resistor_shorted', B.judgeResistorLegs([M(8,0),M(8,4)]).code==='resistor_shorted');
t('resistor between + and − -> resistor_across_rails', B.judgeResistorLegs([P(8),N(9)]).code==='resistor_across_rails');
t('resistor with no rail leg -> resistor_no_rail', B.judgeResistorLegs([M(8,0),M(12,0)]).code==='resistor_no_rail');
t('resistor unseen -> unknown', B.judgeResistorLegs(null).state==='unknown');

// LED: any hole of the resistor strip + any hole of the − rail
let ledAll=true; for(let r=0;r<5;r++) for(const nc of [1,9,30]) for(const ord of [0,1]){ const L=[M(9,r),N(nc)]; if(B.judgeLedLegs(ord?L.reverse():L,'T9').state!=='ok') ledAll=false; }
t('LED accepted in any row of the resistor strip and any − rail hole, either leg order', ledAll);
t('LED short leg in + -> led_short_in_plus (danger)', B.judgeLedLegs([M(9,2),P(12)],'T9').code==='led_short_in_plus');
t('LED across centre channel, same column -> led_other_half', B.judgeLedLegs([M(9,7),N(12)],'T9').code==='led_other_half');
t('LED in another column -> led_not_series', B.judgeLedLegs([M(11,2),N(12)],'T9').code==='led_not_series');
t('LED second leg not in a rail -> led_open', B.judgeLedLegs([M(9,2),M(14,2)],'T9').code==='led_open');
t('LED straight between + and − -> no_resistor', B.judgeLedLegs([P(9),N(12)],'T9').code==='no_resistor');
t('LED legs in the same strip -> led_shorted', B.judgeLedLegs([M(9,1),M(9,3)],'T9').code==='led_shorted');
t('LED with resistor not confirmed -> warn, never ok', B.judgeLedLegs([M(9,2),N(12)],null).state==='warn');
// agreement with the full-circuit rule (checkCircuit) for every accepted placement
let agree=true; for(let c=1;c<=30;c++) for(let r=0;r<5;r++){ const res=[P(c),M(c,0)], led=[M(c,r),N((c%30)+1)];
  if(r===0) continue; if(B.judgeLedLegs(led,'T'+c).state==='ok' && B.checkCircuit({red:'+',black:'-',resistor:res,ledLong:led[0],ledShort:led[1]}).length) agree=false; }
t('every LED placement accepted here is also correct for checkCircuit', agree);

// legs from covered holes
t('legs = farthest holes of the part', JSON.stringify(B.legsFromHoles(cov([P(14),M(14,1),M(14,0)]),rails).legs)===JSON.stringify([P(14),M(14,1)]));
t('a far leg alone in its hole still counts (long LED legs)', (r=>r.legs && r.legs.some(h=>h.rail==='-'))(B.legsFromHoles(cov([M(20,3),M(21,2),N(26)]),rails)));
t('two separate parts -> no guess', B.legsFromHoles(cov([M(3,0),M(3,1),M(3,2),M(20,0),M(20,1),M(20,2)]),rails).why==='two_groups');
t('whole picture changed (many holes) -> no guess', B.legsFromHoles(cov(Array.from({length:20},(_,i)=>M(i+1,0))),rails).why==='noise');
t('one covered hole -> unknown', B.legsFromHoles(cov([M(5,0)]),rails).legs===null);
t('test mode: two separate parts told apart by their legs (resistor has the + leg, LED the − leg)', (a=>a.resistor&&a.led&&a.resistor.legs.some(h=>h.rail==='+')&&a.led.legs.some(h=>h.rail==='-'))(B.assignParts(cov([P(3),M(3,1),M(20,2),N(24)]),rails)));
t('test mode: parts touching each other are not guessed', (a=>!(a.resistor&&a.led))(B.assignParts(cov([P(14),M(14,0),M(14,3),N(15)]),rails)));

// gate: confirmed danger cannot be confirmed away; a harmless wrong placement can be confirmed by a trainer
const allOk={view:'ok',railEnds:{red:'+',black:'-'},resistor:{seen:true,near:true,conf:0.9},led:{seen:true,near:true,conf:0.9}};
const man={id:'123e4567-e89b-12d3-a456-426614174000',by:'م. مدرب',at:new Date().toISOString(),lines:['led','resistor_value','led_polarity','no_extra']};
const g1=B.safetyGate({...allOk,reach:{led:'wrong',ledCode:'no_resistor'}},man);
t('gate: LED without resistor is danger, trainer cannot pass it', !g1.pass && g1.danger && g1.lines.find(l=>l.id==='led').code==='no_resistor');
const g2=B.safetyGate({...allOk,reach:{led:'suspect',ledCode:'led_open'}},null);
t('gate: LED leg not in − blocks (warn) without a trainer', !g2.pass && !g2.danger && g2.lines.find(l=>l.id==='led').state==='warn');
const g3=B.safetyGate({...allOk,reach:{led:'suspect',ledCode:'led_open'}},man);
t('gate: trainer who looked can confirm a harmless suspicion', g3.lines.find(l=>l.id==='led').state==='ok');
t('gate: model sees a part but its legs are unknown -> warn, never ok', B.safetyGate({...allOk,resistor:{seen:true,near:null,conf:0.9}},null).lines.find(l=>l.id==='resistor').state==='warn');
console.log(`coach placement: ${pass} passed, ${fail} failed`); process.exit(fail?1:0);
