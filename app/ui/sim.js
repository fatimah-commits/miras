// مراس: المحاكاة التفاعلية. أطراف الأسلاك والقطع تُسحب وتُثبّت في الفتحات، والحكم من محرك الدائرة.
import { COLS, ROWS_TOP, ROWS_BOT, PINS, STEPS, REASONS, analyze, colorNote, isNode } from '../core/circuit.js';
import { startAttempt } from '../core/data.js';
import { esc, errName } from './views.js';

const NS = 'http://www.w3.org/2000/svg';
const P = 22;                      // المسافة بين الفتحات
const X0 = 300;                    // أول عمود
const colX = c => X0 + (c-1)*P;
const Y = { '+':54, '-':78 };
const rowY = r => { const i = 'abcdefghij'.indexOf(r); return 128 + i*P + (i>=5 ? 18 : 0); };
const PIN_Y = { '3V3':150, '5V':180, 'GND1':210, 'GND2':240 };
const PIN_X = 214;
const W = 1000, H = 520;

export function nodeXY(n){
  let m;
  if((m=/^pin:(.+)$/.exec(n))) return [PIN_X, PIN_Y[m[1]]];
  if((m=/^rail:([+-]):(\d+)$/.exec(n))) return [colX(+m[2]), Y[m[1]]];
  if((m=/^h:([a-j]):(\d+)$/.exec(n))) return [colX(+m[2]), rowY(m[1])];
  return null;
}
const ALL_NODES = [
  ...PINS.map(p=>'pin:'+p),
  ...['+','-'].flatMap(s=>Array.from({length:COLS},(_,i)=>`rail:${s}:${i+1}`)),
  ...[...ROWS_TOP, ...ROWS_BOT].flatMap(r=>Array.from({length:COLS},(_,i)=>`h:${r}:${i+1}`)),
];

const STEP_TEXT = {
  red:   ['سلك من 5V إلى خط +', 'step_red'],
  black: ['سلك من GND إلى خط −', 'step_black'],
  parts: ['المقاومة واللمبة على التوالي', 'step_parts'],
  power: ['فحص الدائرة ثم توصيل الكهرباء', 'step_power'],
};

// القطع: كل قطعة لها طرفان، كل طرف إما في عقدة أو حر في موضع
function initialItems(){
  const loose = (x,y) => ({ node:null, x, y });
  return [
    { id:'w1', kind:'wire', color:'red',    ends:[loose(320,420), loose(400,420)] },
    { id:'w2', kind:'wire', color:'black',  ends:[loose(440,420), loose(520,420)] },
    { id:'w3', kind:'wire', color:'yellow', ends:[loose(560,420), loose(640,420)] },
    { id:'res', kind:'resistor', ends:[loose(320,478), loose(410,478)] },
    { id:'led', kind:'led', ends:[loose(470,478), loose(520,478)] },   // [0] الرجل الطويلة (+)، [1] القصيرة
  ];
}
function toState(items){
  const n = e => e.node;
  const it = id => items.find(i=>i.id===id);
  return {
    wires: items.filter(i=>i.kind==='wire').map(w=>({ id:w.id, color:w.color, a:n(w.ends[0]), b:n(w.ends[1]) })),
    resistor: { a:n(it('res').ends[0]), b:n(it('res').ends[1]) },
    led: { anode:n(it('led').ends[0]), cathode:n(it('led').ends[1]) },
  };
}

export async function simView(el, app, modeArg){
  const mode = modeArg==='test' ? 'test' : 'train';
  const att = startAttempt({ mode: 'sim-'+mode });
  let steps;
  try{ steps = (await app.data.lessonSteps()).map(s=>s.code); }catch(e){ steps = STEPS.map(s=>s.code); }
  steps = steps.filter(c => STEPS.some(s=>s.code===c));
  let idx = 0, items = initialItems(), lit = false, flagged = null, ended = false;

  el.innerHTML = `
    <div class="row" style="justify-content:space-between"><h1>${mode==='train'?'تدريب':'اختبار'} · تغذية لوحة التجارب</h1>
      <button class="btn ghost small" id="quit">إنهاء</button></div>
    <div class="sim">
      <svg class="board" id="board" viewBox="0 0 ${W} ${H}" role="img" aria-label="لوحة تجارب وأردوينو"></svg>
      <aside class="card" id="panel">
        <div class="steps" id="bar"></div>
        <p class="dim" id="stepNo"></p>
        <h2 id="title"></h2>
        <div class="state" id="state" role="status"></div>
        <div class="row">
          <button class="btn" id="check">تحقق</button>
          <button class="btn ghost small" id="replay" aria-label="إعادة الاستماع">إعادة الاستماع</button>
        </div>
        <p class="dim" id="rot" hidden>للتحكم الأسهل: تدوير الجهاز أفقياً.</p>
        <p class="dim" id="tip">طرف السلك أو رجل القطعة: سحب ثم إفلات فوق الفتحة.</p>
      </aside>
    </div>`;
  const svg = el.querySelector('#board');
  const $ = s => el.querySelector(s);

  function setState(cls, text){ const s=$('#state'); s.className='state '+(cls||''); s.textContent=text; }
  function enter(i){
    idx = i; flagged = null;
    const code = steps[i], [title, key] = STEP_TEXT[code];
    $('#bar').innerHTML = steps.map((_,j)=>`<i class="${j<i?'done':j===i?'cur':''}"></i>`).join('');
    $('#stepNo').textContent = `الخطوة ${i+1} من ${steps.length}`;
    $('#title').textContent = title;
    $('#check').textContent = code==='power' ? 'توصيل USB' : 'تحقق';
    setState('', code==='power' ? 'سيُفحص التوصيل كاملاً قبل تشغيل الكهرباء.' : 'عند الانتهاء: زر تحقق.');
    app.voice.say(key);
    draw();
  }

  async function check(){
    if(ended) return;
    const code = steps[idx], step = STEPS.find(s=>s.code===code);
    const r = step.check(toState(items));
    if(r.ok){
      att.log(code, 'ok', r.code);
      if(code==='power'){ lit = true; draw(); setState('ok', REASONS.lit); app.voice.say('lit'); return finish(true); }
      const note = mode==='train' && r.color ? colorNote(code==='red'?'5V':'GND', r.color) : null;
      setState('ok', REASONS.ok + (note ? ' ' + REASONS[note] : ''));
      app.voice.say('ok');
      setTimeout(()=>{ if(!ended) enter(idx+1); }, note ? 2200 : 900);
      return;
    }
    att.log(code, 'error', r.code);
    flagged = r.at || null;
    if(r.danger || r.code==='short'){ svg.classList.remove('danger'); void svg.offsetWidth; svg.classList.add('danger'); }
    if(mode==='train' || r.danger || r.code==='short'){
      setState(r.danger||r.code==='short' ? 'bad' : 'warn', REASONS[r.code] || r.code);
      app.voice.say(r.code in app.voice.PHRASES ? r.code : 'test_wrong');
    } else {
      setState('bad', 'غير صحيح. يلزم مراجعة التوصيل.');
      app.voice.say('test_wrong');
    }
    draw();
  }

  async function finish(completed){
    if(ended) return; ended = true;
    const a = att.finish(completed);
    const res = await app.data.save(a);
    const errs = a.events.filter(e=>e.kind==='error');
    const panel = $('#panel');
    panel.innerHTML = `<h2>${completed ? 'اكتمل التدريب' : 'انتهت المحاولة دون إكمال'}</h2>
      ${completed ? `<div class="stat"><b>${a.score}</b><span>الدرجة من 100</span></div>` : ''}
      <p class="dim">الوقت: ${Math.round(a.duration_s)} ثانية · الأخطاء: ${errs.length}</p>
      ${errs.length ? `<div>${errs.map(e=>`<div class="dim">✗ ${esc(errName(e.code))}</div>`).join('')}</div>` : ''}
      <p class="state ${res.saved?'ok':'warn'}">${res.saved ? 'حُفظت النتيجة في حسابك.' : 'لم تُحفظ بعد (لا اتصال). محفوظة على هذا الجهاز وستُرسل تلقائياً.'}</p>
      <div class="row"><a class="btn" href="#/home">تدريبي</a><button class="btn ghost" id="again">محاولة جديدة</button></div>`;
    panel.querySelector('#again').onclick = () => simView(el, app, modeArg);
    if(completed) app.voice.say('done');
  }

  // ---------- الرسم ----------
  function el$(tag, attrs, parent){ const e=document.createElementNS(NS, tag); for(const k in attrs) e.setAttribute(k, attrs[k]); (parent||svg).appendChild(e); return e; }
  const pos = e => e.node ? nodeXY(e.node) : [e.x, e.y];
  function drawStatic(g){
    // الأردوينو
    el$('rect', { x:40, y:110, width:190, height:170, fill:'#0d5b8c', stroke:'#7fb3d5' }, g);
    el$('text', { x:120, y:135, fill:'#d8ecf7', 'font-size':15, 'text-anchor':'middle', 'font-weight':700 }, g).textContent = 'ARDUINO';
    for(const p of PINS){
      el$('rect', { x:PIN_X-8, y:PIN_Y[p]-8, width:16, height:16, fill:'#111', stroke:'#555' }, g);
      el$('text', { x:PIN_X-16, y:PIN_Y[p]+5, fill:'#fff', 'font-size':13, 'text-anchor':'end', direction:'ltr' }, g).textContent = { '3V3':'3.3V', '5V':'5V', GND1:'GND', GND2:'GND' }[p];
    }
    el$('rect', { x:40, y:300, width:60, height:30, fill:'#9aa', stroke:'#567' }, g);
    el$('text', { x:70, y:320, fill:'#123', 'font-size':12, 'text-anchor':'middle' }, g).textContent = 'USB';
    // اللوحة
    el$('rect', { x:X0-26, y:30, width:colX(COLS)-X0+52, height:rowY('j')-30+26, fill:'#ece9df', stroke:'#bdb7a6' }, g);
    for(const s of ['+','-']){
      el$('line', { x1:X0-14, x2:colX(COLS)+14, y1:Y[s]+(s==='+'?-11:11), y2:Y[s]+(s==='+'?-11:11), stroke:s==='+'?'#d33':'#36c', 'stroke-width':2 }, g);
      el$('text', { x:X0-20, y:Y[s]+5, fill:s==='+'?'#d33':'#36c', 'font-size':16, 'font-weight':700, 'text-anchor':'middle' }, g).textContent = s==='+'?'+':'−';
    }
    el$('rect', { x:X0-26, y:rowY('e')+12, width:colX(COLS)-X0+52, height:rowY('f')-rowY('e')-24, fill:'#d9d5c8' }, g);
    for(const n of ALL_NODES){ if(n.startsWith('pin:')) continue; const [x,y]=nodeXY(n); el$('rect', { x:x-3.5, y:y-3.5, width:7, height:7, fill:'#3a3a3a' }, g); }
    for(const c of [1,5,10,15,20,25,30]) el$('text', { x:colX(c), y:rowY('j')+20, fill:'#776', 'font-size':10, 'text-anchor':'middle' }, g).textContent = c;
    el$('text', { x:300, y:400, fill:'#b9cbbe', 'font-size':13 }, g).textContent = 'القطع';
  }
  let staticG = null;
  function draw(){
    if(!staticG){ staticG = el$('g', {}); drawStatic(staticG); }
    [...svg.querySelectorAll('.dyn')].forEach(n=>n.remove());
    const g = el$('g', { class:'dyn' });
    if(flagged){ const p = nodeXY(flagged); if(p) el$('circle', { cx:p[0], cy:p[1], r:13, fill:'none', stroke:'#ff6a5a', 'stroke-width':3 }, g); }
    for(const it of items){
      const [a,b] = it.ends.map(pos);
      if(it.kind==='wire'){
        const col = { red:'#e53935', black:'#1b1b1b', yellow:'#f2c230' }[it.color];
        const my = Math.min(a[1],b[1]) - 30;
        el$('path', { d:`M${a[0]},${a[1]} C${a[0]},${my} ${b[0]},${my} ${b[0]},${b[1]}`, fill:'none', stroke:'#000', 'stroke-opacity':.25, 'stroke-width':8 }, g);
        el$('path', { d:`M${a[0]},${a[1]} C${a[0]},${my} ${b[0]},${my} ${b[0]},${b[1]}`, fill:'none', stroke:col, 'stroke-width':5, 'stroke-linecap':'round' }, g);
      } else if(it.kind==='resistor'){
        el$('line', { x1:a[0], y1:a[1], x2:b[0], y2:b[1], stroke:'#999', 'stroke-width':2.5 }, g);
        const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2, ang=Math.atan2(b[1]-a[1], b[0]-a[0])*180/Math.PI;
        const body = el$('g', { transform:`translate(${mx},${my}) rotate(${ang})` }, g);
        el$('rect', { x:-16, y:-6, width:32, height:12, fill:'#d8b98a', stroke:'#8a6d3b' }, body);
        [['-9','#8b4513'],['-3','#000'],['3','#8b4513'],['9','#c9a227']].forEach(([x,c]) => el$('rect', { x, y:-6, width:3, height:12, fill:c }, body));
      } else if(it.kind==='led'){
        const mx=(a[0]+b[0])/2, my=Math.min(a[1],b[1])-22;
        el$('line', { x1:a[0], y1:a[1], x2:mx-4, y2:my, stroke:'#aaa', 'stroke-width':2.5 }, g);
        el$('line', { x1:b[0], y1:b[1], x2:mx+4, y2:my, stroke:'#aaa', 'stroke-width':2.5 }, g);
        if(lit) el$('circle', { cx:mx, cy:my, r:26, fill:'#ff4d3d', opacity:.35 }, g);
        el$('circle', { cx:mx, cy:my, r:10, fill: lit ? '#ff3b2f' : '#8e1f17', stroke:'#4a0d08' }, g);
        el$('text', { x:a[0]-10, y:a[1]+16, fill:'#d33', 'font-size':13, 'font-weight':700 }, g).textContent = '+';
      }
    }
    // مقابض الأطراف فوق كل شيء: مساحة لمس كبيرة شفافة، ثم الدائرة الظاهرة
    const sc = W / (svg.clientWidth || W);
    for(const it of items) it.ends.forEach((e, k) => { const [x,y] = pos(e); el$('circle', { cx:x, cy:y, r:Math.max(9, 16*sc), fill:'transparent', class:'end hit', 'data-i':it.id, 'data-k':k }, g).addEventListener('pointerdown', startDrag); });
    for(const it of items) it.ends.forEach((e, k) => {
      const [x,y] = pos(e);
      const c = el$('circle', { cx:x, cy:y, r:9, class:'end', fill: e.node ? '#e2b54e' : 'transparent', stroke:'#e2b54e', 'stroke-width':2.5, 'data-i':it.id, 'data-k':k, tabindex:0, role:'button',
        'aria-label': `${{wire:'سلك',resistor:'مقاومة',led:'لمبة'}[it.kind]} ${it.color?{red:'أحمر',black:'أسود',yellow:'أصفر'}[it.color]:''} طرف ${k+1}: ${e.node?'مثبّت':'حر'}` }, g);
      c.addEventListener('pointerdown', startDrag);
    });
  }

  // ---------- السحب ----------
  let drag = null;
  const toSvg = ev => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  function startDrag(ev){
    if(ended) return;
    ev.preventDefault();
    const it = items.find(i=>i.id===ev.target.dataset.i), e = it.ends[+ev.target.dataset.k];
    const [x,y] = pos(e); e.node = null; e.x = x; e.y = y;
    drag = { e, id:ev.pointerId }; svg.setPointerCapture(ev.pointerId); lit = false; flagged = null;
  }
  function move(ev){ if(!drag || ev.pointerId!==drag.id) return; const p = toSvg(ev); drag.e.x = Math.max(10, Math.min(W-10, p.x)); drag.e.y = Math.max(10, Math.min(H-10, p.y)); draw(); }
  function drop(ev){
    if(!drag || ev.pointerId!==drag.id) return;
    const e = drag.e; drag = null;
    const taken = new Set(items.flatMap(i=>i.ends).filter(x=>x!==e && x.node).map(x=>x.node));
    let best = null, bd = Math.max(12, 18 * W / (svg.clientWidth || W));   // مسافة الالتقاط تكبر على الشاشات الصغيرة
    for(const n of ALL_NODES){ const [x,y] = nodeXY(n); const d = Math.hypot(x-e.x, y-e.y); if(d<bd && !taken.has(n)){ bd=d; best=n; } }
    if(best && isNode(best)) e.node = best;
    draw();
  }
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerup', drop);
  svg.addEventListener('pointercancel', drop);

  $('#check').onclick = check;
  $('#replay').onclick = () => app.voice.replay();
  $('#quit').onclick = () => { if(!ended) finish(false); };

  // للاختبار الآلي فقط: وضع طرف في عقدة كما لو سُحب
  el.__sim = { place:(id,k,node)=>{ const e=items.find(i=>i.id===id).ends[k]; e.node=node; lit=false; draw(); }, state:()=>toState(items), check, nodeXY };

  const rot = () => { $('#rot').hidden = !(innerWidth < 600 && innerHeight > innerWidth); draw(); };
  addEventListener('resize', rot); rot();
  enter(0);
  return () => { removeEventListener('resize', rot); app.voice.stop(); };
}
