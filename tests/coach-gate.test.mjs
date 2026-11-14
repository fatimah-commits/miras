// فحص ما قبل التشغيل (coach/board.js) بعد إصلاح 14 نوفمبر: اختبارات سلبية + فحص شامل + مقارنة مع محرك app/core/circuit.js.
// التشغيل: node tests/coach-gate.test.mjs
import { createRequire } from 'node:module';
import { analyze } from '../app/core/circuit.js';
const B = createRequire(import.meta.url)('../coach/board.js');

let pass=0, fail=0;
const t=(name, ok, info='')=>{ ok?pass++:fail++; if(!ok) console.log('✗ '+name+'  '+info); };

const UUID='0b6f1a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
const conf = lines => ({ id:UUID, by:'مدرب اختبار', at:'2026-11-14T16:00:00Z', lines });
const ALL7 = B.GATE_LINES.slice(), TR3 = B.TRAINER_LINES.slice();
const camOk = { view:'ok', railEnds:{ red:'+', black:'-' }, resistor:{ seen:true, near:true, conf:0.9 }, led:{ seen:true, near:true, conf:0.9 } };
const line = (g,id) => g.lines.find(l=>l.id===id);

// 15 positive control
t('15 camera ok above the bar + trainer confirms the 3 trainer lines -> pass', B.safetyGate(camOk, conf(TR3)).pass);

// 1-2 missing components
for(const part of ['resistor','led']){
  const g = B.safetyGate({ ...camOk, [part]:{ seen:false } }, conf(TR3));
  t(`1-2 ${part} not seen -> blocked, reason ${part}_unseen`, !g.pass && line(g,part).state==='unknown' && line(g,part).code===part+'_unseen');
  const g2 = B.safetyGate({ ...camOk, [part]:undefined }, conf(TR3));
  t(`1-2 ${part} evidence missing entirely -> blocked`, !g2.pass);
}

// 3 low confidence
for(const c of [0.36, 0.5, B.GATE_MIN_CONF-0.001, NaN, undefined, null, '0.9', Infinity*0]){
  const g = B.safetyGate({ ...camOk, resistor:{ seen:true, near:true, conf:c } }, conf(TR3));
  t(`3 resistor confidence ${String(c)} -> blocked, low confidence`, !g.pass && line(g,'resistor').code==='resistor_low_conf');
  const g2 = B.safetyGate({ ...camOk, led:{ seen:true, near:true, conf:c } }, conf(TR3));
  t(`3 LED confidence ${String(c)} -> blocked`, !g2.pass && line(g2,'led').code==='led_low_conf');
}
t('3 exactly at the bar -> camera line ok', line(B.safetyGate({ ...camOk, resistor:{ seen:true, near:true, conf:B.GATE_MIN_CONF } }, null),'resistor').state==='ok');
t('3 judgeStep: low confidence is unknown, not ok', B.judgeStep('led',{ view:'ok', led:{ seen:true, near:true, conf:0.4 } }).state==='unknown');

// 4 LED reversed / polarity not verified
t('4 camera all ok but LED direction not confirmed by trainer -> blocked', !B.safetyGate(camOk, conf(['resistor_value','no_extra'])).pass);
t('4 the blocking line says it needs the trainer', line(B.safetyGate(camOk, null),'led_polarity').fix==='trainer');
t('4 checkCircuit: LED reversed in series -> led_reversed', B.checkCircuit({ red:'+', black:'-', resistor:[{rail:'+',col:10},{col:10,row:0}], ledLong:{rail:'-',col:13}, ledShort:{col:10,row:2} }).some(x=>x.code==='led_reversed'));

// 5 bug 1 regression: LED straight across the rails, resistor beside it with one leg in +
const direct = B.checkCircuit({ red:'+', black:'-', resistor:[{rail:'+',col:10},{row:0,col:10}], ledLong:{rail:'+',col:12}, ledShort:{rail:'-',col:12} });
t('5 LED straight across + and − with a resistor elsewhere -> no_resistor (danger)', direct.some(x=>x.code==='no_resistor' && x.sev==='bad'), JSON.stringify(direct));

// 6 undetected / unclear wires
for(const [red,black] of [[null,'-'],['+',null],[null,null],['unclear','-'],['+','unclear'],['unclear','unclear'],[undefined,undefined]]){
  const g = B.safetyGate({ ...camOk, railEnds:{ red, black } }, conf(TR3));
  t(`6 wires red=${red} black=${black} -> blocked`, !g.pass);
}
t('6 railEnds missing entirely -> blocked', !B.safetyGate({ ...camOk, railEnds:undefined }, conf(TR3)).pass);

// 7 confirmed danger cannot be confirmed away, even with every line confirmed
for(const [red,black,code] of [['+','+','short'],['-','-','short'],['-','+','red_in_minus'],['-',null,'red_in_minus'],[null,'+','black_in_plus']]){
  const g = B.safetyGate({ ...camOk, railEnds:{ red, black } }, conf(ALL7));
  t(`7 ${code} (red=${red} black=${black}) -> danger, not passed with all 7 lines confirmed`, !g.pass && g.danger && g.mustFix.length>0);
}

// 8 hand / motion / lost / unknown view
for(const view of ['hand','moving','lost','nocv',undefined,'','weird']){
  const g = B.safetyGate({ ...camOk, view }, conf(ALL7));
  t(`8 view=${view} -> blocked even with all confirmations`, !g.pass && g.lines.every(l=>l.state!=='ok'));
}

// 9 old trainee ticks are ignored
t('9 {resistorValue:true, ledPolarity:true} -> blocked', !B.safetyGate(camOk, { resistorValue:true, ledPolarity:true }).pass);
t('9 trainee ticks shaped like lines without server id -> blocked', !B.safetyGate(camOk, { lines:TR3 }).pass);

// 10 confirmations without a valid server record
for(const [name,c] of [['no id',{ by:'x', at:'2026-11-14T16:00:00Z', lines:TR3 }],['id not a uuid',{ id:'9001', by:'x', at:'2026-11-14T16:00:00Z', lines:TR3 }],
  ['no trainer name',{ id:UUID, by:'', at:'2026-11-14T16:00:00Z', lines:TR3 }],['no time',{ id:UUID, by:'x', lines:TR3 }],['bad time',{ id:UUID, by:'x', at:'yesterday', lines:TR3 }],
  ['unknown line id',{ id:UUID, by:'x', at:'2026-11-14T16:00:00Z', lines:[...TR3,'usb_ok'] }],['empty lines',{ id:UUID, by:'x', at:'2026-11-14T16:00:00Z', lines:[] }],['string',UUID]]){
  t('10 confirmation '+name+' -> ignored, blocked', !B.safetyGate(camOk, c).pass && !B.validConfirmation(c));
}

// trainer may clear an UNCERTAIN camera line, never a bad one
t('trainer can confirm a resistor the camera could not see', B.safetyGate({ ...camOk, resistor:{ seen:false } }, conf([...TR3,'resistor'])).pass);
t('trainer confirmation of a camera line is labelled as trainer', line(B.safetyGate({ ...camOk, resistor:{ seen:false } }, conf([...TR3,'resistor'])),'resistor').src==='trainer');
t('trainer cannot clear a short by confirming the short line', !B.safetyGate({ ...camOk, railEnds:{ red:'+', black:'+' } }, conf(['short','wires',...TR3])).pass);

// 12 stability: one green evaluation is not enough
const st = B.makeGateStabilizer(3), gp = B.safetyGate(camOk, conf(TR3)), gb = B.safetyGate({ ...camOk, view:'hand' }, conf(TR3));
t('12 one passing evaluation does not allow', st.push(gp)===false);
t('12 two passing evaluations do not allow', st.push(gp)===false);
t('12 three in a row allow', st.push(gp)===true);
t('12 a single failing evaluation resets', st.push(gb)===false && st.push(gp)===false);

// 13 exhaustive: independent oracle over every combination
const views=['ok','hand','moving','lost',undefined], ends=['+','-','unclear',null];
const parts=[{seen:false},{seen:true,near:true,conf:0.3},{seen:true,near:true,conf:0.59},{seen:true,near:true,conf:0.6},{seen:true,near:true,conf:0.95},{seen:true,near:false,conf:0.95}];
const confs=[null,{resistorValue:true,ledPolarity:true},{lines:ALL7},conf(TR3),conf(ALL7),conf(['short','wires','resistor','led']),conf(['resistor_value','led_polarity'])];
let n=0, bad=0, passes=0;
const camPartOk = p => p.seen && p.near && p.conf>=0.6;
for(const view of views) for(const red of ends) for(const black of ends) for(const r of parts) for(const l of parts) for(const c of confs){
  n++;
  const g = B.safetyGate({ view, railEnds:{ red, black }, resistor:r, led:l }, c);
  const ok = B.validConfirmation(c) ? new Set(c.lines) : new Set();
  const danger = (red && black && red===black && red!=='unclear') || red==='-' || black==='+';
  const wiresOk = red==='+' && black==='-';
  const expect = view==='ok' && !danger
    && (wiresOk || (ok.has('short') && ok.has('wires')))
    && (camPartOk(r) || ok.has('resistor')) && (camPartOk(l) || ok.has('led'))
    && TR3.every(x=>ok.has(x));
  if(g.pass) passes++;
  if(g.pass!==expect || (g.pass && g.danger) || (danger && view==='ok' && !g.danger)){ bad++; if(bad<5) console.log('  mismatch', JSON.stringify({view,red,black,r,l,c,got:g.pass,expect})); }
}
t(`13 exhaustive gate check: ${n} combinations, ${passes} pass, 0 disagreements with the oracle`, bad===0, bad+' disagreements');

// 14 checkCircuit vs app/core/circuit.js on every component placement around the lesson area (supply wired correctly)
const holes=[{rail:'+',col:9},{rail:'+',col:12},{rail:'-',col:9},{rail:'-',col:12},{col:9,row:0},{col:9,row:2},{col:10,row:0},{col:11,row:0},{col:10,row:5},null];
const node = h => h.rail ? `rail:${h.rail}:${h.col}` : `h:${'abcdefghij'[h.row]}:${h.col}`;
const coachCat = issues => { const c=issues.map(x=>x.code); if(c.includes('short')) return 'short'; if(c.includes('no_resistor')) return 'no_resistor'; if(!c.length) return 'lit'; if(c.includes('led_reversed')) return 'reversed'; return 'other'; };
const engCat = a => a.short ? 'short' : a.problems.includes('no_resistor') ? 'no_resistor' : (a.lit && !a.problems.length) ? 'lit' : a.problems.includes('led_reversed') ? 'reversed' : 'other';
let pc=0, pd=0, dangerSeen=0;
for(const ra of holes) for(const rb of holes) for(const la of holes) for(const lb of holes){
  if(!la || !lb) continue;                                // both engines need both LED legs placed
  if((ra && !rb) || (!ra && rb)) continue;                // resistor either fully placed or absent
  const placement = { red:'+', black:'-', resistor: ra ? [ra,rb] : null, ledLong:la, ledShort:lb };
  const state = { wires:[{id:'r',color:'red',a:'pin:5V',b:'rail:+:3'},{id:'k',color:'black',a:'pin:GND1',b:'rail:-:3'}],
                  resistor: ra ? { a:node(ra), b:node(rb) } : null, led:{ anode:node(la), cathode:node(lb) } };
  const a = coachCat(B.checkCircuit(placement)), b = engCat(analyze(state));
  pc++; if(a==='no_resistor') dangerSeen++;
  if(a!==b){ pd++; if(pd<5) console.log('  disagree', a, b, JSON.stringify(placement)); }
}
t(`14 checkCircuit agrees with app/core/circuit.js on ${pc} placements (${dangerSeen} LED-without-resistor cases)`, pd===0, pd+' disagreements');

console.log(`exhaustive: ${n} combinations (${passes} pass); parity: ${pc} placements (${dangerSeen} no_resistor)`);
console.log(`coach gate: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
