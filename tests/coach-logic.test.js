// node tests/coach-logic.test.js  — Phase 1 tests: breadboard map, circuit rules, safety gate.
const B = require('../coach/board.js');
let pass=0, fail=0;
const t=(name,cond)=>{ if(cond){pass++;} else {fail++; console.log('FAIL', name);} };
const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;

// homography round trip
const taps=[[100,400],[900,420],[880,120],[120,100]];
const H=B.boardFromTaps(30,taps);
B.calibHoles(30).forEach((p,i)=>{const q=B.apply(H,p[0],p[1]); t('H maps calib '+i, near(q[0],taps[i][0],1e-4)&&near(q[1],taps[i][1],1e-4));});
const Hi=B.inv(H), q=B.apply(H,7,3), back=B.apply(Hi,q[0],q[1]); t('inverse', near(back[0],7,1e-6)&&near(back[1],3,1e-6));
const T=[1,0,5,0,1,-3,0,0,1]; const c=B.apply(B.mul(T,H),2,2), d=B.apply(H,2,2); t('compose', near(c[0],d[0]+5,1e-6)&&near(c[1],d[1]-3,1e-6));

// breadboard mapping
t('same column top half connected', B.sameNet({col:10,row:0},{col:10,row:4}));
t('channel splits halves', !B.sameNet({col:10,row:4},{col:10,row:5}));
t('adjacent columns NOT connected', !B.sameNet({col:10,row:0},{col:11,row:0}));
t('rail holes connected', B.sameNet({rail:'+',col:2},{rail:'+',col:20}));
t('plus vs minus rails separate', !B.sameNet({rail:'+',col:2},{rail:'-',col:2}));
t('targets inside split-safe zone', B.targets(63).led.short.col<=B.RAIL_SAFE_MAX_COL && B.targets(30).col===10);

// circuit rules
const good={red:'+',black:'-',resistor:[{rail:'+',col:10},{col:10,row:0}],ledLong:{col:10,row:2},ledShort:{rail:'-',col:13}};
const codes=p=>B.checkCircuit(p).map(x=>x.code);
t('correct circuit -> no issues', codes(good).length===0);
t('LED in another row of the same column still OK', codes({...good,ledLong:{col:10,row:4}}).length===0);
t('LED in wrong column -> not in series', codes({...good,ledLong:{col:11,row:2}}).includes('not_series'));
t('short: both in +', codes({...good,black:'+'}).includes('short'));
t('short: both in -', codes({...good,red:'-'}).includes('short'));
t('reversed red', codes({...good,red:'-',black:null}).includes('red_in_minus'));
t('black in plus', codes({...good,black:'+',red:null}).includes('black_in_plus'));
t('LED straight across rails = no resistor', codes({...good,resistor:null,ledLong:{rail:'+',col:5},ledShort:{rail:'-',col:6}}).includes('no_resistor'));
t('LED reversed detected', codes({...good,ledLong:{rail:'-',col:13},ledShort:{col:10,row:2}}).includes('led_reversed'));
t('LED both legs same node', codes({...good,ledLong:{col:10,row:2},ledShort:{col:10,row:3}}).includes('led_shorted'));

// wire end reasoning
t('only outer -> outer', B.wireEnd({outer:[3],inner:[],main:[]}).end==='outer');
t('outer+inner -> inner', B.wireEnd({outer:[3],inner:[3],main:[]}).end==='inner');
t('continues into main -> unclear', B.wireEnd({outer:[3],inner:[3],main:[3]}).end==='unclear');
t('nothing -> null', B.wireEnd({outer:[],inner:[],main:[]}).end===null);

// step judgments + view gating (never guess)
const ok={view:'ok'};
t('hand -> unknown', B.judgeStep('red',{view:'hand',railEnds:{red:'-'}}).state==='unknown');
t('moving -> unknown', B.judgeStep('red',{view:'moving',railEnds:{red:'+'}}).state==='unknown');
t('lost -> unknown', B.judgeStep('black',{view:'lost'}).state==='unknown');
t('red ok', B.judgeStep('red',{...ok,railEnds:{red:'+'}}).state==='ok');
t('red in minus -> bad', B.judgeStep('red',{...ok,railEnds:{red:'-'}}).code==='red_in_minus');
t('red unclear -> warn', B.judgeStep('red',{...ok,railEnds:{red:'unclear'}}).state==='warn');
t('black ok', B.judgeStep('black',{...ok,railEnds:{red:'+',black:'-'}}).state==='ok');
t('black in + with red in + -> short', B.judgeStep('black',{...ok,railEnds:{red:'+',black:'+'}}).code==='short');
t('resistor far -> warn (suspicion, not confirmed)', B.judgeStep('resistor',{...ok,resistor:{seen:true,near:false}}).state==='warn');
t('resistor unseen -> unknown', B.judgeStep('resistor',{...ok,resistor:{seen:false}}).state==='unknown');
t('early warning red', B.earlyWarning('red',{red:'-'})==='early_red_minus');
t('no early warning when right', B.earlyWarning('red',{red:'+'})===null);

// safety gate
const allOk={view:'ok',railEnds:{red:'+',black:'-'},resistor:{seen:true,near:true},led:{seen:true,near:true}};
const man={resistorValue:true,ledPolarity:true};
t('gate passes when all ok', B.safetyGate(allOk,man).pass);
t('gate blocks without manual LED polarity', !B.safetyGate(allOk,{resistorValue:true}).pass);
t('gate blocks on short + danger flag', (g=>!g.pass&&g.danger)(B.safetyGate({...allOk,railEnds:{red:'+',black:'+'}},man)));
t('gate blocks when hand covers (unknown, not pass)', (g=>!g.pass&&!g.danger)(B.safetyGate({...allOk,view:'hand'},man)));
t('gate blocks when resistor unseen', !B.safetyGate({...allOk,resistor:{seen:false}},man).pass);
t('gate blocks when wires unclear', !B.safetyGate({...allOk,railEnds:{red:'unclear',black:'-'}},man).pass);

// report from real sessions only
const empty=B.report([]); t('empty report has zeros', empty.sessions===0&&empty.wrong===0&&empty.blocked===0&&empty.top.length===0);
const r=B.report([{mode:'train',events:[{type:'error',code:'short'},{type:'error',code:'short'},{type:'error',code:'red_in_minus'},{type:'blocked'},{type:'ok'},{type:'manual',what:'usb_off'},{type:'manual',what:'led',why:'camera_unsure'}]},{mode:'test',events:[{type:'error',code:'short',afterPower:true},{type:'override'}]}]);
t('report counts', r.sessions===2&&r.wrong===4&&r.beforePower===3&&r.blocked===1&&r.ok===1&&r.overrides===1&&r.top[0][0]==='short'&&r.atRisk['الأردوينو']===3&&r.manualConfirms===1);
t('reversed polarity puts no part at risk', !Object.keys(r.atRisk).some(k=>k.includes('اللمبة')));

const s=B.makeStabilizer(3); t('stabilizer needs repeats', s.push('a')===null&&s.push('a')===null&&s.push('a')==='a'&&s.push('b')===null);

console.log(`coach logic: ${pass} passed, ${fail} failed`); process.exit(fail?1:0);
