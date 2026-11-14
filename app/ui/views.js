// مراس: الشاشات (عرض فقط). المنطق في core/.
import { REASONS } from '../core/circuit.js';
import { toCSV } from '../core/data.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const num = n => n==null ? '—' : new Intl.NumberFormat('ar-SA').format(n);
const date = t => t ? new Date(t).toLocaleString('ar-SA-u-ca-gregory', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
const dur = s => s==null ? '—' : `${num(Math.floor(s/60))}:${String(Math.round(s%60)).padStart(2,'0').replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d])}`;
const MODE = { 'sim-train':'محاكاة · تدريب', 'sim-test':'محاكاة · اختبار', 'cam-train':'كاميرا · تدريب', 'cam-test':'كاميرا · اختبار' };
export const errName = c => (REASONS[c] || c).replace(/[:.].*$/, '');
const redirect = () => location.origin + location.pathname;

function form(el, html, onSubmit){
  el.innerHTML = html;
  const f = el.querySelector('form'), msg = el.querySelector('.msg'), btn = f.querySelector('button[type=submit]');
  f.onsubmit = async e => {
    e.preventDefault(); msg.className='msg'; msg.textContent=''; btn.disabled = true;
    const fd = Object.fromEntries(new FormData(f));
    try{ const r = await onSubmit(fd); if(r?.error){ msg.className='msg bad'; msg.textContent = r.error; } else if(r?.ok){ msg.className='msg ok'; msg.textContent = r.ok; } }
    catch(err){ msg.className='msg bad'; msg.textContent = 'حدث خطأ: ' + (err.message||err); }
    btn.disabled = false;
  };
}

export const views = {
  login(el, app){
    form(el, `<form class="card form" novalidate><h1>تسجيل الدخول</h1>
      <label>البريد الإلكتروني<input name="email" type="email" autocomplete="email" required dir="ltr"></label>
      <label>كلمة المرور<input name="password" type="password" autocomplete="current-password" required dir="ltr"></label>
      <p class="msg" role="alert"></p>
      <button class="btn" type="submit">دخول</button>
      <div class="row"><a class="link" href="#/forgot">نسيت كلمة المرور</a><span class="dim">·</span><a class="link" href="#/signup">حساب جديد</a></div></form>`,
      async v => { const r = await app.auth.signIn(v); if(!r.ok) return r; await app.refresh(); });
  },

  signup(el, app){
    form(el, `<form class="card form" novalidate><h1>حساب متدرب جديد</h1>
      <label>الاسم الكامل<input name="full_name" autocomplete="name" required></label>
      <label>الرقم التدريبي (اختياري)<input name="trainee_no" inputmode="numeric" dir="ltr"></label>
      <label>البريد الإلكتروني<input name="email" type="email" autocomplete="email" required dir="ltr"></label>
      <label>كلمة المرور (8 أحرف على الأقل)<input name="password" type="password" autocomplete="new-password" minlength="8" required dir="ltr"></label>
      <p class="msg" role="alert"></p>
      <button class="btn" type="submit">إنشاء الحساب</button>
      <p class="dim">حسابات المدربين يفعّلها مدير المنصة.</p>
      <a class="link" href="#/login">لدي حساب</a></form>`,
      async v => {
        const r = await app.auth.signUp({ ...v, redirectTo: redirect() });
        if(!r.ok) return r;
        if(r.needsConfirm) return { ok:'أُرسل رابط تأكيد إلى البريد. بعد فتحه يمكن تسجيل الدخول.' };
        await app.refresh();
      });
  },

  forgot(el, app){
    form(el, `<form class="card form" novalidate><h1>استعادة كلمة المرور</h1>
      <label>البريد الإلكتروني<input name="email" type="email" autocomplete="email" required dir="ltr"></label>
      <p class="msg" role="alert"></p>
      <button class="btn" type="submit">إرسال رابط الاستعادة</button>
      <a class="link" href="#/login">رجوع</a></form>`,
      async v => { const r = await app.auth.requestReset(v.email, redirect()); return r.ok ? { ok:'إن كان البريد مسجلاً فستصله رسالة خلال دقائق.' } : r; });
  },

  reset(el, app){
    if(!app.me){ el.innerHTML = `<div class="card form"><h1>الرابط غير صالح</h1><p class="dim">يجب فتح رابط الاستعادة من البريد مرة أخرى، أو طلب رابط جديد.</p><a class="btn" href="#/forgot">طلب رابط جديد</a></div>`; return; }
    form(el, `<form class="card form" novalidate><h1>كلمة مرور جديدة</h1>
      <label>كلمة المرور الجديدة<input name="password" type="password" autocomplete="new-password" minlength="8" required dir="ltr"></label>
      <p class="msg" role="alert"></p>
      <button class="btn" type="submit">حفظ</button></form>`,
      async v => { const r = await app.auth.setNewPassword(v.password); if(!r.ok) return r; setTimeout(()=>app.go('#/'), 900); return { ok:'تم تغيير كلمة المرور.' }; });
  },

  async home(el, app){
    const list = await app.data.myAttempts();
    const done = list.filter(a=>a.completed), best = done.length ? Math.max(...done.map(a=>a.score)) : null;
    const pend = app.data.pending();
    el.innerHTML = `
      <h1>${esc(app.me.full_name || 'تدريبي')}</h1>
      <section class="card"><h2>تغذية لوحة التجارب من الأردوينو</h2>
        <p class="dim">أربع خطوات: 5V إلى خط +، GND إلى خط −، المقاومة واللمبة، ثم الكهرباء.</p>
        <div class="row"><a class="btn" href="#/sim/train">بدء التدريب</a><a class="btn ghost" href="#/sim/test">اختبار بلا تلميحات</a></div>
      </section>
      <section class="card"><h2>التدريب بالكاميرا على القطع الحقيقية</h2>
        <p class="dim">وجّه الكاميرا الخلفية إلى لوحة التجارب، والمنصة تتابع توصيلك خطوة بخطوة.</p>
        <div class="row"><a class="btn" href="../coach/?mode=train">تدريب بالكاميرا</a><a class="btn ghost" href="../coach/?mode=test">اختبار بالكاميرا</a></div>
      </section>
      ${pend ? `<p class="state warn">${num(pend)} محاولة محفوظة على هذا الجهاز ولم تُرسل بعد. تُرسل تلقائياً عند الاتصال.</p>` : ''}
      <div class="grid">
        <div class="card stat"><b>${num(list.length)}</b><span>محاولة</span></div>
        <div class="card stat"><b>${num(done.length)}</b><span>مكتملة</span></div>
        <div class="card stat"><b>${best==null?'—':num(best)}</b><span>أفضل درجة</span></div>
      </div>
      <section class="card"><h2>سجل محاولاتي</h2>${attemptsTable(list)}</section>`;
    bindAttemptRows(el, app);
  },

  async settings(el, app){
    const s = app.settings.get(), src = await app.voice.source();
    const srcText = { files:'ملفات صوت مولّدة (طبيعية)', device:'صوت الجهاز (قد يكون آلياً)', none:'لا يوجد صوت عربي في هذا الجهاز' }[src];
    el.innerHTML = `<h1>الإعدادات</h1>
      <section class="card"><h2>الصوت</h2>
        <p class="dim">المصدر الحالي: ${srcText}</p>
        <label class="row" style="flex-direction:row"><input type="checkbox" id="vOn" ${s.on?'checked':''} style="width:auto;min-height:0"> تشغيل الإرشاد الصوتي</label>
        <label>السرعة <input type="range" id="vRate" min="0.7" max="1.3" step="0.05" value="${s.rate}"></label>
        <label>مستوى الصوت <input type="range" id="vVol" min="0" max="1" step="0.05" value="${s.volume}"></label>
        <div class="row"><button class="btn ghost small" id="vTest">تجربة الصوت</button><button class="btn ghost small" id="vStop">إيقاف</button></div>
      </section>
      <section class="card"><h2>الحساب</h2>
        <p>${esc(app.me.full_name)} <span class="dim" dir="ltr">${esc(app.me.email)}</span></p>
        <p class="dim">الدور: ${{trainee:'متدرب',trainer:'مدرب',admin:'مدير'}[app.me.role]||'—'}</p>
        <div class="row"><button class="btn ghost" id="out">تسجيل الخروج</button></div>
      </section>`;
    const save = () => app.settings.set({ on: el.querySelector('#vOn').checked, rate:+el.querySelector('#vRate').value, volume:+el.querySelector('#vVol').value });
    el.querySelectorAll('#vOn,#vRate,#vVol').forEach(i => i.onchange = save);
    el.querySelector('#vTest').onclick = () => { save(); app.voice.say('step_red'); };
    el.querySelector('#vStop').onclick = () => app.voice.stop();
    el.querySelector('#out').onclick = async () => { await app.auth.signOut(); };
  },

  async trainer(el, app, userId){
    if(userId) return trainee(el, app, userId);
    const [rows, errs] = await Promise.all([app.data.progress(), app.data.errorCounts()]);
    const tally = {}; errs.forEach(e => tally[e.code] = (tally[e.code]||0) + Number(e.n));
    const top = Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,5);
    el.innerHTML = `<div class="row" style="justify-content:space-between"><h1>المتدربون</h1>
        <button class="btn ghost small" id="csv" ${rows.length?'':'disabled'}>تصدير CSV</button></div>
      <section class="card"><div class="scroll">${rows.length ? `<table><thead><tr><th>الاسم</th><th>الرقم</th><th class="num">المحاولات</th><th class="num">المكتملة</th><th class="num">أفضل</th><th class="num">المتوسط</th><th class="num">متوسط الوقت</th><th class="num">الأخطاء</th><th>آخر محاولة</th></tr></thead><tbody>
        ${rows.map(r=>`<tr class="click" data-u="${esc(r.user_id)}"><td>${esc(r.full_name)}</td><td dir="ltr">${esc(r.trainee_no||'—')}</td><td class="num">${num(r.attempts)}</td><td class="num">${num(r.completed)}</td><td class="num">${num(r.best_score)}</td><td class="num">${num(r.avg_score)}</td><td class="num">${dur(r.avg_duration_s)}</td><td class="num">${num(r.errors)}</td><td>${date(r.last_at)}</td></tr>`).join('')}
        </tbody></table>` : `<div class="empty">لا يوجد متدربون في شعبتك بعد. يضيفهم مدير المنصة.</div>`}</div></section>
      <section class="card"><h2>الأخطاء الأكثر تكراراً</h2>${top.length ? `<table><tbody>${top.map(([c,n])=>`<tr><td>${esc(errName(c))}</td><td class="num">${num(n)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">لا أخطاء مسجلة بعد.</div>'}</section>`;
    el.querySelectorAll('tr[data-u]').forEach(tr => tr.onclick = () => app.go('#/trainer/'+tr.dataset.u));
    el.querySelector('#csv').onclick = () => download('miras-trainees.csv', toCSV(rows, [['full_name','الاسم'],['trainee_no','الرقم التدريبي'],['section_id','الشعبة'],['attempts','المحاولات'],['completed','المكتملة'],['best_score','أفضل درجة'],['avg_score','متوسط الدرجة'],['avg_duration_s','متوسط الوقت (ث)'],['errors','الأخطاء'],['last_at','آخر محاولة']]));
  },

  async admin(el, app){
    const [people, sections] = await Promise.all([app.data.allProfiles(), app.data.sections()]);
    const opt = (v, cur, t) => `<option value="${esc(v)}"${v===cur?' selected':''}>${esc(t)}</option>`;
    el.innerHTML = `<h1>الحسابات والشعب</h1>
      <section class="card"><h2>الشعب</h2>
        <form class="row" id="secF"><input name="id" placeholder="رمز الشعبة، مثل S101" required style="max-width:180px" dir="ltr"><input name="name" placeholder="اسم الشعبة" required style="max-width:220px">
          <select name="trainer_id" style="max-width:220px">${opt('', '', 'بلا مدرب')}${people.filter(p=>p.role!=='trainee').map(p=>opt(p.id,'',p.full_name)).join('')}</select>
          <button class="btn small" type="submit">حفظ الشعبة</button></form>
        <p class="msg" id="secM"></p>
        ${sections.length ? `<table><tbody>${sections.map(s=>`<tr><td dir="ltr">${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(people.find(p=>p.id===s.trainer_id)?.full_name||'بلا مدرب')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">لا شعب بعد.</div>'}
      </section>
      <section class="card"><h2>المستخدمون</h2><div class="scroll"><table><thead><tr><th>الاسم</th><th>الرقم</th><th>الدور</th><th>الشعبة</th><th></th></tr></thead><tbody>
        ${people.map(p=>`<tr data-u="${esc(p.id)}"><td>${esc(p.full_name)}</td><td dir="ltr">${esc(p.trainee_no||'—')}</td>
          <td><select name="role" ${p.id===app.me.id?'disabled':''}>${opt('trainee',p.role,'متدرب')}${opt('trainer',p.role,'مدرب')}${opt('admin',p.role,'مدير')}</select></td>
          <td><select name="section">${opt('',p.section_id||'','—')}${sections.map(s=>opt(s.id,p.section_id||'',s.name)).join('')}</select></td>
          <td><button class="btn small ghost" data-save>حفظ</button> <span class="msg"></span></td></tr>`).join('')}
      </tbody></table></div></section>`;
    el.querySelector('#secF').onsubmit = async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); const m = el.querySelector('#secM');
      try{ await app.data.upsertSection({ id:v.id.trim(), name:v.name.trim(), trainer_id:v.trainer_id||null }); views.admin(el, app); }catch(err){ m.className='msg bad'; m.textContent=err.message; } };
    el.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
      const tr = b.closest('tr'), m = tr.querySelector('.msg');
      try{ await app.data.setRole(tr.dataset.u, tr.querySelector('[name=role]').value, tr.querySelector('[name=section]').value || null); m.className='msg ok'; m.textContent='حُفظ'; }
      catch(err){ m.className='msg bad'; m.textContent=err.message; }
    });
  },
};

function attemptsTable(list){
  if(!list.length) return '<div class="empty">لا محاولات بعد.</div>';
  return `<div class="scroll"><table><thead><tr><th>التاريخ</th><th>النوع</th><th class="num">الدرجة</th><th class="num">الوقت</th><th class="num">الأخطاء</th><th>الحالة</th></tr></thead><tbody>
    ${list.map(a=>`<tr class="click" data-a="${esc(a.id)}"><td>${date(a.started_at)}</td><td>${MODE[a.mode]||esc(a.mode)}</td><td class="num">${a.score==null?'—':num(a.score)}</td><td class="num">${dur(a.duration_s)}</td><td class="num">${num(a.error_count)}</td><td>${a.completed?'<span class="pill ok">مكتملة</span>':'<span class="pill warn">لم تكتمل</span>'}</td></tr>
    <tr hidden data-ev="${esc(a.id)}"><td colspan="6"></td></tr>`).join('')}
  </tbody></table></div>`;
}

function bindAttemptRows(el, app){
  el.querySelectorAll('tr[data-a]').forEach(tr => tr.onclick = async () => {
    const box = el.querySelector(`tr[data-ev="${tr.dataset.a}"]`); box.hidden = !box.hidden; if(box.hidden) return;
    const td = box.firstElementChild; td.innerHTML = '<span class="loading">جارٍ التحميل</span>';
    try{
      const ev = await app.data.events(tr.dataset.a);
      const K = { ok:'✓', error:'✗', override:'تجاوز المدرب', uncertain:'غير متأكد', hint:'تلميح' };
      td.innerHTML = ev.length ? ev.map(e=>`<div class="dim">${num(e.t_s)} ث · ${K[e.kind]||e.kind} ${e.kind==='error'?esc(errName(e.code)):''}</div>`).join('') : '<span class="dim">لا أحداث.</span>';
    }catch(err){ td.innerHTML = `<span class="msg bad">${esc(err.message)}</span>`; }
  });
}

async function trainee(el, app, userId){
  const [rows, list] = await Promise.all([app.data.progress(), app.data.attemptsOf(userId)]);
  const p = rows.find(r=>r.user_id===userId);
  if(!p){ el.innerHTML = '<div class="empty">المتدرب غير موجود أو ليس في شعبتك.</div>'; return; }
  el.innerHTML = `<div class="row"><a class="link" href="#/trainer">المتدربون</a></div>
    <div class="row" style="justify-content:space-between"><h1>${esc(p.full_name)}</h1><button class="btn ghost small" id="csv" ${list.length?'':'disabled'}>تصدير السجل</button></div>
    <div class="grid"><div class="card stat"><b>${num(p.attempts)}</b><span>محاولة</span></div><div class="card stat"><b>${num(p.best_score)}</b><span>أفضل درجة</span></div><div class="card stat"><b>${dur(p.avg_duration_s)}</b><span>متوسط وقت الإكمال</span></div><div class="card stat"><b>${num(p.errors)}</b><span>خطأ</span></div></div>
    <section class="card"><h2>سجل المحاولات</h2>${attemptsTable(list)}</section>`;
  bindAttemptRows(el, app);
  el.querySelector('#csv').onclick = () => download(`miras-${p.trainee_no||'trainee'}.csv`, toCSV(list.map(a=>({ ...a, mode:MODE[a.mode]||a.mode, completed:a.completed?'نعم':'لا' })), [['started_at','البداية'],['mode','النوع'],['score','الدرجة'],['duration_s','الوقت (ث)'],['error_count','الأخطاء'],['completed','مكتملة']]));
}

function download(name, text){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type:'text/csv;charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
