// أدلة التدقيق (14 نوفمبر): حالات يمرّ فيها فحص ما قبل التشغيل في coach/board.js وهو لا يملك دليلاً كافياً.
// لا يغيّر هذا الملف أي منطق. كل حالة تتحقق أن الثغرة موجودة الآن، لتتحول إلى اختبار فاشل حين نصلحها.
// التشغيل: node tests/audit/safety-gaps.test.js
const B = require('../../coach/board.js');
let n=0; const gap=(name, ok)=>{ n++; console.log((ok?'GAP CONFIRMED  ':'not reproduced ')+name); };
const okView = { view:'ok', railEnds:{ red:'+', black:'-' }, resistor:{ seen:true, near:true, conf:0.4 }, led:{ seen:true, near:true, conf:0.4 } };
const ticked = { resistorValue:true, ledPolarity:true };

// 1) اللمبة موصولة مباشرة بين + و− والمقاومة موضوعة بجانبها بلا فائدة: الكاميرا ترى نفس المشهد تقريباً
//    (مقاومة "قريبة" ولمبة "قريبة")، والفحص لا يعرف مكان أرجل اللمبة. وحتى checkCircuit يعدّها دائرة صحيحة لأن المقاومة لها رجل في خط + مثل اللمبة.
const direct = B.checkCircuit({ red:'+', black:'-', resistor:[{rail:'+',col:10},{row:0,col:10}], ledLong:{rail:'+',col:12}, ledShort:{rail:'-',col:12} });
gap('BUG coach/board.js checkCircuit: LED straight across + and −, resistor with one leg in +: reports '+(direct.length?direct.map(x=>x.code).join(','):'NO problem (treated as a correct series circuit)')+'. app/core/circuit.js flags no_resistor here.', !direct.some(x=>x.code==='no_resistor'));
gap('...but safetyGate passes on the same camera evidence once the two boxes are ticked', B.safetyGate(okView, ticked).pass===true);

// 2) مربعا التأكيد اليدوي يضغطهما أي شخص (لا حساب مدرب)، وهما كل ما يفصل اللمبة المقلوبة أو المقاومة الخاطئة عن التشغيل
gap('gate passes with manual boxes ticked and no trainer identity in the input', B.safetyGate(okView, ticked).pass===true && !('by' in ticked));

// 3) ثقة النموذج لا تدخل في القرار: مقاومة بثقة 0.36 تُعامل مثل 0.95
const lowConf = { ...okView, resistor:{ seen:true, near:true, conf:0.36 }, led:{ seen:true, near:true, conf:0.36 } };
gap('a 0.36-confidence detection counts as a camera ✓ in the gate', B.safetyGate(lowConf, ticked).lines.find(l=>l.id==='resistor').state==='ok');

// 4) سلك ثالث (أي لون غير الأحمر والأسود) بين الخطين = قصر لا تمثّله مدخلات البوابة أصلاً
gap('the gate input has no field for wires other than red and black', !('others' in okView.railEnds));

// 5) ما يجب أن يبقى: الحالات غير المؤكدة تمنع التشغيل (هذه نقاط قوة حالية)
console.log('\nkept behaviour:');
console.log(' hand over board blocks:', B.safetyGate({ ...okView, view:'hand' }, ticked).pass===false);
console.log(' unclear red wire blocks:', B.safetyGate({ ...okView, railEnds:{ red:'unclear', black:'-' } }, ticked).pass===false);
console.log(' resistor not seen blocks:', B.safetyGate({ ...okView, resistor:{ seen:false } }, ticked).pass===false);
console.log(' short (both in +) is bad:', B.safetyGate({ ...okView, railEnds:{ red:'+', black:'+' } }, ticked).danger===true);
