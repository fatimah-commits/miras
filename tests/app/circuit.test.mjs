// اختبارات محرك الدائرة: node tests/app/circuit.test.mjs
import { analyze, checkSupply, STEPS, scoreOf, colorNote, isNode } from '../../app/core/circuit.js';

let pass=0, fail=0;
const t=(name, got, want)=>{ const ok=JSON.stringify(got)===JSON.stringify(want); ok?pass++:fail++; console.log((ok?'✓ ':'✗ ')+name+(ok?'':`  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)); };

const W=(id,color,a,b)=>({id,color,a,b});
const correct = () => ({
  wires:[ W('w1','red','pin:5V','rail:+:2'), W('w2','black','pin:GND1','rail:-:3') ],
  resistor:{ a:'rail:+:10', b:'h:c:10' },
  led:{ anode:'h:d:10', cathode:'rail:-:11' },     // العمود 10 أعلى + خط −
});

// 1 توصيل صحيح
let s=correct();
t('correct: LED lit', analyze(s).lit, true);
t('correct: no problems', analyze(s).problems, []);
t('correct: all steps pass', STEPS.map(x=>x.check(s).ok), [true,true,true,true]);

// 2 قطبية معكوسة (الأسلاك متبادلة)
s=correct(); s.wires=[ W('w1','red','pin:5V','rail:-:2'), W('w2','black','pin:GND1','rail:+:3') ];
t('reversed: step red says wrong_rail', checkSupply(s,'5V').code, 'wrong_rail');
t('reversed: LED does not light', analyze(s).lit, false);
t('reversed: analysis says led_reversed', analyze(s).problems[0], 'led_reversed');

// 3 قطبية معكوسة لكن بالألوان "الصحيحة": اللون لا يخدع المحرك
s=correct(); s.wires=[ W('w1','black','pin:5V','rail:+:2'), W('w2','red','pin:GND1','rail:-:3') ];
t('colors swapped but wiring right: step ok', checkSupply(s,'5V').ok, true);
t('colors swapped: LED lit', analyze(s).lit, true);
t('colors swapped: only a note', colorNote('5V','black'), 'color_5v');

// 4 سلك غير متصل
s=correct(); s.wires[0]=W('w1','red','pin:5V',null);
t('unconnected wire end', checkSupply(s,'5V').code, 'unconnected');
t('unconnected: circuit open', analyze(s).problems, ['open']);

// 5 فتحة خاطئة
s=correct(); s.wires[0]=W('w1','red','pin:5V','h:a:20');
t('wire in main area hole', checkSupply(s,'5V').code, 'wrong_hole');

// 6 قصر
s=correct(); s.wires.push(W('w3','yellow','rail:+:20','rail:-:20'));
t('short detected', analyze(s).short, true);
t('short: power step dangerous', STEPS[3].check(s), { ok:false, code:'short', danger:true });
s=correct(); s.wires[1]=W('w2','black','pin:GND1','rail:+:3');
t('both in + rail = short', checkSupply(s,'GND').code, 'short');
t('both in + rail: black step reports short, not regression', STEPS[1].check(s).code, 'short');

// 7 3.3V بدل 5V
s=correct(); s.wires[0]=W('w1','red','pin:3V3','rail:+:2');
t('3V3 instead of 5V at step red', checkSupply(s,'5V').code, 'wrong_pin');
t('3V3: LED lights but flagged', [analyze(s).lit, analyze(s).problems], [true,['wrong_pin']]);

// 8 لمبة مقلوبة
s=correct(); s.led={ anode:'rail:-:11', cathode:'h:d:10' };
t('LED reversed', analyze(s).problems, ['led_reversed']);
t('LED reversed: parts step fails', STEPS[2].check(s).code, 'led_reversed');

// 9 بلا مقاومة
s=correct(); s.resistor=null; s.led={ anode:'rail:+:10', cathode:'rail:-:11' };
t('LED without resistor = danger', STEPS[3].check(s), { ok:false, code:'no_resistor', danger:true });

// 10 مقاومة في الجهة الأخرى (اللمبة من + والمقاومة إلى −) صحيحة أيضاً
s=correct(); s.led={ anode:'rail:+:5', cathode:'h:b:5' }; s.resistor={ a:'h:a:5', b:'rail:-:6' };
t('resistor on ground side also valid', analyze(s).lit, true);

// 11 الدائرة عبر نصف اللوحة السفلي + سلك قفز
s=correct(); s.resistor={ a:'rail:+:10', b:'h:c:10' }; s.led={ anode:'h:g:14', cathode:'rail:-:15' };
t('LED in another strip: open', analyze(s).problems, ['open']);
s.wires.push(W('j','green','h:e:10','h:f:14'));
t('jumper closes the path', analyze(s).lit, true);

// 12 مقاومة رجلاها في نفس العمود
s=correct(); s.resistor={ a:'h:a:10', b:'h:c:10' };
t('resistor both legs same strip', analyze(s).problems.includes('resistor_shorted'), true);

// 13 لا انتقال قبل تحقق شرط الخطوة
s={ wires:[], resistor:null, led:null };
t('empty board: step red not ok', STEPS[0].check(s).code, 'not_started');
s.wires.push(W('w1','red','pin:5V','rail:+:1'));
t('after red: step black not ok yet', [STEPS[0].check(s).ok, STEPS[1].check(s).ok], [true,false]);
s.wires[0].b=null;
t('red removed later: black step reports regression', STEPS[1].check(s).code, 'regressed_red');

// 14 العقد غير الصالحة لا تُقبل
t('invalid nodes', [isNode('h:z:3'), isNode('rail:+:99'), isNode('pin:VIN'), isNode('h:a:30')], [false,false,false,true]);

// 15 الدرجة من الأحداث
t('score', scoreOf([{kind:'error',code:'wrong_rail'},{kind:'ok',code:'ok'},{kind:'error',code:'short'}]), 55);
t('score floor', scoreOf(Array(10).fill({kind:'error',code:'short'})), 0);

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exit(fail?1:0);
