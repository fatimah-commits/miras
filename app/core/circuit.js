// مراس: محرك الدائرة. يحكم على التوصيل من الفتحات والشبكات الكهربائية، لا من لون السلك أو موقعه على الشاشة.
// لا يعتمد على المتصفح: نفس الملف يُختبر في Node ويعمل في الواجهة.

export const COLS = 30;               // أعمدة لوحة التجارب
export const ROWS_TOP = ['a','b','c','d','e'];
export const ROWS_BOT = ['f','g','h','i','j'];
export const PINS = ['5V','3V3','GND1','GND2'];   // أطراف الأردوينو المستخدمة في الدرس

// أسماء العقد:
//   pin:5V          طرف في الأردوينو
//   rail:+:12       خط + عند العمود 12 (الخط كله شبكة واحدة)
//   rail:-:12       خط −
//   h:c:7           فتحة في الصف c العمود 7 (الصفوف a-e في العمود نفسه متصلة، وكذلك f-j)
export function isNode(n){
  if(typeof n!=='string') return false;
  let m;
  if((m=/^pin:(.+)$/.exec(n))) return PINS.includes(m[1]);
  if((m=/^rail:([+-]):(\d+)$/.exec(n))) return +m[2]>=1 && +m[2]<=COLS;
  if((m=/^h:([a-j]):(\d+)$/.exec(n))) return +m[2]>=1 && +m[2]<=COLS;
  return false;
}

// الشبكة الفيزيائية للعقدة قبل الأسلاك
export function stripOf(n){
  if(!n) return null;
  if(n.startsWith('pin:')){ const p=n.slice(4); return p.startsWith('GND') ? 'GND' : p; }
  if(n.startsWith('rail:+')) return 'R+';
  if(n.startsWith('rail:-')) return 'R-';
  const [, r, c] = n.split(':');
  return (ROWS_TOP.includes(r) ? 'T' : 'B') + c;
}

function uf(){
  const p={};
  const find=x=>{ if(p[x]===undefined) p[x]=x; while(p[x]!==x){ p[x]=p[p[x]]; x=p[x]; } return x; };
  return { find, join:(a,b)=>{ a=find(a); b=find(b); if(a!==b) p[a]=b; } };
}

// يبني الشبكات: كل سلك موصول الطرفين يدمج شبكتين
export function nets(state){
  const u=uf();
  for(const w of state.wires||[]) if(isNode(w.a) && isNode(w.b)) u.join(stripOf(w.a), stripOf(w.b));
  return n => n && isNode(n) ? u.find(stripOf(n)) : null;
}

// الحالة: { wires:[{id,color,a,b}], resistor:{a,b}|null, led:{anode,cathode}|null }
// ترجع وصفاً كهربائياً كاملاً للدائرة عند توصيل USB
export function analyze(state){
  const net = nets(state);
  const V5 = net('pin:5V'), V3 = net('pin:3V3'), G = net('pin:GND1');
  const out = { short:false, lit:false, problems:[], supply:null };

  if(V5===G || V3===G){ out.short=true; out.problems.push('short'); return out; }
  if(V5===V3) out.problems.push('pins_bridged');

  const R = state.resistor && isNode(state.resistor.a) && isNode(state.resistor.b) ? [net(state.resistor.a), net(state.resistor.b)] : null;
  const L = state.led && isNode(state.led.anode) && isNode(state.led.cathode) ? { a:net(state.led.anode), k:net(state.led.cathode) } : null;
  if(!R) out.problems.push('resistor_missing');
  if(!L){ out.problems.push('led_missing'); return out; }
  if(L.a===L.k){ out.problems.push('led_shorted'); return out; }
  if(R && R[0]===R[1]) out.problems.push('resistor_shorted');

  for(const [S, name] of [[V5,'5V'],[V3,'3V3']]){
    // اللمبة مباشرة بين المصدر والأرضي بلا مقاومة: خطر على اللمبة
    if(L.a===S && L.k===G){ out.problems.push('no_resistor'); out.supply=name; return out; }
    if(L.a===G && L.k===S){ out.problems.push('led_reversed'); out.supply=name; return out; }
    if(R && R[0]!==R[1]){
      const other = R[0]===S ? R[1] : R[1]===S ? R[0] : null;    // مقاومة من المصدر
      const otherG = R[0]===G ? R[1] : R[1]===G ? R[0] : null;   // مقاومة إلى الأرضي
      const fwd = (other && L.a===other && L.k===G) || (otherG && L.a===S && L.k===otherG);
      const rev = (other && L.k===other && L.a===G) || (otherG && L.k===S && L.a===otherG);
      if(fwd){ out.lit=true; out.supply=name; if(name!=='5V') out.problems.push('wrong_pin'); return out; }
      if(rev){ out.problems.push('led_reversed'); out.supply=name; return out; }
    }
  }
  out.problems.push('open');
  return out;
}

// أي سلك موصول بهذه العقدة؟ (لشرح الخطأ بدقة)
function wiresAt(state, pred){ return (state.wires||[]).filter(w => pred(w.a) || pred(w.b)); }
const isPin = p => n => n==='pin:'+p;
const isGnd = n => n==='pin:GND1' || n==='pin:GND2';
const farEnd = (w, pred) => pred(w.a) ? w.b : w.a;

// فحص خطوة تغذية: هل الطرف (5V أو GND) موصول بالخط الصحيح؟
// ترجع {ok, code, at} حيث at العقدة التي فيها المشكلة (للإبراز على اللوحة)
export function checkSupply(state, which){
  const pinPred = which==='5V' ? isPin('5V') : isGnd;
  const goal = which==='5V' ? 'R+' : 'R-';
  const wrongRail = which==='5V' ? 'R-' : 'R+';
  const net = nets(state);
  const pinNet = which==='5V' ? net('pin:5V') : net('pin:GND1');
  const other = which==='5V' ? net('pin:GND1') : net('pin:5V');
  if(pinNet===other) return { ok:false, code:'short' };

  const ws = wiresAt(state, pinPred);
  if(!ws.length){
    // ربما وُصل الطرف الخطأ (3V3 بدل 5V)
    if(which==='5V' && net('pin:3V3')===net('rail:+:1')) return { ok:false, code:'wrong_pin', at:'pin:3V3' };
    return { ok:false, code:'not_started' };
  }
  const loose = ws.find(w => !isNode(farEnd(w, pinPred)));
  if(pinNet===net('rail:'+goal[1]+':1')){
    const w = ws.find(x => stripOf(farEnd(x, pinPred))===goal) || ws[0];
    return { ok:true, code:'ok', wire:w.id, color:w.color };
  }
  if(pinNet===net('rail:'+wrongRail[1]+':1')) return { ok:false, code:'wrong_rail', at: farEnd(ws[0], pinPred) };
  if(loose) return { ok:false, code:'unconnected', wire:loose.id };
  return { ok:false, code:'wrong_hole', at: farEnd(ws[0], pinPred) };
}

// اللون ليس دليلاً على الصحة. يُعطى فقط ملاحظة عرفية إذا اختلف عن المتعارف عليه.
export function colorNote(which, color){
  if(which==='5V' && color && color!=='red') return 'color_5v';
  if(which==='GND' && color && color!=='black') return 'color_gnd';
  return null;
}

// خطوات الدرس. كل خطوة تفحص الحالة وترجع {ok, code}. لا انتقال قبل ok.
export const STEPS = [
  { code:'red',   check: s => checkSupply(s,'5V') },
  { code:'black', check: s => { const r=checkSupply(s,'5V'); if(r.code==='short') return r; if(!r.ok) return { ok:false, code:'regressed_red' }; return checkSupply(s,'GND'); } },
  { code:'parts', check: s => {
      const a = analyze(s);
      if(a.short) return { ok:false, code:'short' };
      if(a.lit && !a.problems.length) return { ok:true, code:'ok' };
      const p = a.problems.filter(x=>x!=='pins_bridged');
      return { ok:false, code: p[0] || 'open' };
  } },
  { code:'power', check: s => {
      const a = analyze(s);
      if(a.short) return { ok:false, code:'short', danger:true };
      if(a.problems.includes('no_resistor')) return { ok:false, code:'no_resistor', danger:true };
      return a.lit && !a.problems.length ? { ok:true, code:'lit' } : { ok:false, code: a.problems[0] || 'open' };
  } },
];

// شرح كل رمز بجملة قصيرة مفهومة
export const REASONS = {
  ok:'صحيح.',
  lit:'اللمبة أضاءت. الدائرة صحيحة.',
  not_started:'لم يُوصَّل سلك من الطرف المطلوب بعد.',
  unconnected:'طرف السلك غير مثبّت في أي فتحة.',
  wrong_rail:'القطبية معكوسة: السلك في الخط المعاكس.',
  wrong_hole:'السلك في فتحة خارج خط الطاقة.',
  wrong_pin:'الطرف خطأ: هذا 3.3V وليس 5V.',
  short:'قصر كهربائي: الموجب متصل بالأرضي مباشرة. لا توصيل للكهرباء.',
  regressed_red:'سلك 5V لم يعد في خط +. يجب إعادته أولاً.',
  resistor_missing:'المقاومة غير موضوعة.',
  resistor_shorted:'طرفا المقاومة في الشبكة نفسها، فلا تعمل.',
  led_missing:'اللمبة غير موضوعة.',
  led_shorted:'رجلا اللمبة في الشبكة نفسها.',
  led_reversed:'اللمبة مقلوبة: الرجل الطويلة يجب أن تتجه للموجب.',
  no_resistor:'اللمبة بلا مقاومة: ستتلف. المقاومة لازمة على التوالي.',
  open:'الدائرة مفتوحة: يوجد انقطاع في المسار.',
  pins_bridged:'5V و3.3V متصلان ببعض.',
  color_5v:'ملاحظة: المتعارف عليه أن سلك 5V أحمر.',
  color_gnd:'ملاحظة: المتعارف عليه أن سلك الأرضي أسود.',
};

// الدرجة: تُحسب من الأحداث فقط
export const WEIGHT = { short:30, no_resistor:20, wrong_rail:15, led_reversed:10, wrong_pin:10, wrong_hole:5, unconnected:5, open:5, resistor_missing:5, led_missing:5, resistor_shorted:5, led_shorted:5, regressed_red:5 };
export function scoreOf(events){
  let s=100;
  for(const e of events) if(e.kind==='error') s -= WEIGHT[e.code] ?? 3;
  return Math.max(0, Math.min(100, s));
}
