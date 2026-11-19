// مستخدمون متعددون يجرّبون المنصة كاملة في متصفح حقيقي على Supabase محلي (لا يلمس القاعدة الحية).
// مدير، ومدربان لكل منهما شعبة، وأربعة متدربين على أجهزة مختلفة (آيفون، آيباد، أندرويد، حاسب).
// كل الحسابات اسمها يبدأ بـ «اختبار» وبريدها @miras.test، وتُحذف في آخر الاختبار.
// التشغيل (من جذر المستودع، مع خادم ثابت على 8099):
//   APP=http://127.0.0.1:8099/app/ SB_URL=... SB_ANON=... DB_URL=... LIB=<فيه ocv/dist و ort/dist> NODE_PATH=$(npm root -g) node tests/app/users.test.js
// بدون LIB تُتخطّى خطوات شاشة الكاميرا (تحتاج OpenCV) ويُقال ذلك صراحة.
const { chromium, devices } = require('playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs');

const APP = process.env.APP, BASE = APP.replace(/app\/?$/, ''), SB_URL = process.env.SB_URL, SB_ANON = process.env.SB_ANON, DB = process.env.DB_URL, LIB = process.env.LIB;
const SHOTS = process.env.SHOTS || '/tmp/miras-users';
fs.mkdirSync(SHOTS, { recursive:true });
const psql = sql => execFileSync('psql', [DB, '-tAc', sql]).toString().trim();
const run = Date.now().toString(36);
const letters = s => s.replace(/[0-9]/g, d => 'abcdefghij'[d]);
const mail = n => `test-${n}.${run}@miras.test`;
const PW = 'Miras-users-2026!';
let pass=0, fail=0, skip=0;
const t = (name, ok, info='') => { ok?pass++:fail++; console.log((ok?'✓ ':'✗ ')+name+(ok?'':'  '+info)); };
const skipped = (name, why) => { skip++; console.log('○ '+name+'  (لم يُختبر: '+why+')'); };

// صيغ مؤنثة أو موجّهة لجنس واحد لا يجب أن تظهر في أي شاشة
const GENDERED = /(المدربة|المتدربة|صاحبة المشروع|أنتِ|اضغطي|جرّبي|جربي|شغّلي|المسي|حدّدي|قرّبي|ضعي|صلي|ركّبي|اسحبي|ابدئي|تأكدي|انتبهي|توقفي|أعيدي|انقلي|افصلي|راجعي|ادخلي|سجّلي|اكتبي|حاولي|لديكِ|عليكِ|يمكنكِ)/;

const all = [];
async function ctx(browser, dev={}){
  const c = await browser.newContext({ locale:'ar-SA', ...dev });
  await c.route('**/app/config.js', r => r.fulfill({ contentType:'application/javascript', body:`window.MIRAS_CONFIG={supabaseUrl:${JSON.stringify(SB_URL)},supabaseAnonKey:${JSON.stringify(SB_ANON)}};` }));
  await c.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  if(LIB){
    await c.route(/onnxruntime-web@1\.26\.0\/dist\/(.*)$/, r => { const f=r.request().url().match(/dist\/([^?]*)/)[1]; r.fulfill({ path:path.join(LIB,'ort/dist',f), contentType:f.endsWith('.wasm')?'application/wasm':'text/javascript', headers:{'access-control-allow-origin':'*'} }); });
    await c.route(/opencv\.js/, r => r.fulfill({ path:path.join(LIB,'ocv/dist/opencv.js'), contentType:'text/javascript', headers:{'access-control-allow-origin':'*'} }));
  }
  // سجل كل تشغيل صوت (عدا الصمت الذي يفتح الصوت في سفاري) مع الصفحة التي كانت ظاهرة
  await c.addInitScript(() => {
    window.__plays = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(){ if(this.src && !this.src.startsWith('data:')){ window.__lastAudio=this; } if(this.src && !this.src.startsWith('data:')) window.__plays.push({ src:this.src.split('/').pop(), where:location.pathname+location.hash }); return orig.call(this).catch(()=>{}); };
    // كاميرا مصطنعة: لوحة تجارب مرسومة (بلا صور حقيقية)
    const cam = () => { const cv=document.createElement('canvas'); cv.width=1280; cv.height=720; const g=cv.getContext('2d');
      const draw=()=>{ g.fillStyle='#6b5440'; g.fillRect(0,0,1280,720); g.fillStyle='#eeeade'; g.fillRect(240,220,800,280);
        g.fillStyle='#3c3a37'; for(let c=0;c<30;c++) for(let y=0;y<10;y++) g.fillRect(270+c*25,260+y*22+(y>4?20:0),6,6); };
      draw(); setInterval(draw, 100); return cv.captureStream(15); };
    if(navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => cam();
  });
  const p = await c.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  all.push(p);
  return { c, p };
}
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const bodyText = p => p.evaluate(() => document.body.innerText);
async function login(p, who){
  await p.goto(APP+'#/login'); await p.waitForSelector('#view h1');
  if(!(await p.locator('[name=email]').count())){ await p.goto(APP+'#/settings'); await p.click('#out'); await p.waitForSelector('[name=email]'); }
  await p.fill('[name=email]', who.email); await p.fill('[name=password]', PW); await p.click('button[type=submit]');
  await p.waitForFunction(() => !location.hash.startsWith('#/login'));
  await p.waitForSelector('#view h1');
}
async function signup(p, who){
  await p.goto(APP+'#/signup'); await p.waitForSelector('[name=full_name]');
  await p.fill('[name=full_name]', who.name); if(who.no) await p.fill('[name=trainee_no]', who.no);
  await p.fill('[name=email]', who.email); await p.fill('[name=password]', PW); await p.fill('[name=password2]', PW);
  await p.click('button[type=submit]'); await p.waitForSelector('text=بدء التدريب');
}
const place = (p, id, k, node) => p.evaluate(([id,k,node]) => document.querySelector('#view').__sim.place(id,k,node), [id,k,node]);
const check = async p => { await p.click('#check'); await p.waitForTimeout(150); return p.locator('#state').innerText(); };
const stepIs = (p, n) => p.waitForFunction(n => document.querySelector('#stepNo')?.textContent.includes(`الخطوة ${n} من`), n);
async function perfectSim(p){
  await place(p,'w1',0,'pin:5V'); await place(p,'w1',1,'rail:+:4'); await check(p); await stepIs(p,2);
  await place(p,'w2',0,'pin:GND1'); await place(p,'w2',1,'rail:-:8'); await check(p); await stepIs(p,3);
  await place(p,'res',0,'rail:+:15'); await place(p,'res',1,'h:b:15'); await place(p,'led',0,'h:d:15'); await place(p,'led',1,'rail:-:17');
  await check(p); await stepIs(p,4);
  await p.click('#check'); await p.waitForSelector('text=اكتمل', { timeout:8000 });
}
const uid = email => psql(`select id from auth.users where email='${email}'`);
const attemptsOf = email => psql(`select coalesce(string_agg(mode||':'||completed||':'||coalesce(score::text,'-')||':'||error_count, ',' order by started_at),'') from attempts where user_id=(select id from auth.users where email='${email}')`);

(async () => {
  const browser = await chromium.launch();
  const people = {
    adm: { name:'اختبار مدير '+letters(run), email:mail('admin') },
    tr1: { name:'اختبار مدرب أول', email:mail('trainer1') },
    tr2: { name:'اختبار مدرب ثان', email:mail('trainer2') },
    t1:  { name:'اختبار متدرب أول', email:mail('t1'), no:'90001', dev:devices['iPhone 13'], devName:'آيفون' },
    t2:  { name:'اختبار متدرب ثان', email:mail('t2'), no:'90002', dev:devices['iPad (gen 7) landscape'], devName:'آيباد' },
    t3:  { name:'اختبار متدرب ثالث', email:mail('t3'), no:'90003', dev:devices['Pixel 7'], devName:'أندرويد' },
    t4:  { name:'اختبار متدرب رابع', email:mail('t4'), no:'90004', dev:{ viewport:{ width:1366, height:800 } }, devName:'حاسب' },
  };
  const SA = 'TA'+run.slice(-5).toUpperCase(), SBs = 'TB'+run.slice(-5).toUpperCase();
  try{
  // ---------- 1. التسجيل: كل حساب جديد يبدأ متدرباً ----------
  const S = {};
  for(const k of ['adm','tr1','tr2','t1','t2','t3','t4']){
    S[k] = await ctx(browser, people[k].dev || {});
    await signup(S[k].p, people[k]);
  }
  t('1 seven accounts signed up from the UI', psql(`select count(*) from auth.users where email like 'test-%.${run}@miras.test'`)==='7');
  t('1 every new account is a trainee', psql(`select string_agg(distinct role, ',') from profiles where full_name like 'اختبار %' and id in (select id from auth.users where email like '%.${run}@miras.test')`)==='trainee');
  t('1 RTL Arabic page', await S.t1.p.evaluate(() => document.documentElement.dir==='rtl' && document.documentElement.lang==='ar'));

  // ---------- 2. المدير (يُرفع بسطر SQL كما في الدليل) يجهّز الأدوار والشعب من الواجهة ----------
  psql(`update profiles set role='admin' where id='${uid(people.adm.email)}'`);
  const A = S.adm.p;
  await A.reload(); await A.click('text=الحسابات'); await A.waitForSelector('#secF');
  for(const k of ['tr1','tr2']){
    const r = A.locator('tr', { hasText:people[k].name });
    await r.locator('[name=role]').selectOption('trainer'); await r.locator('[data-save]').click(); await r.locator('text=حُفظ').waitFor();
  }
  await A.reload(); await A.waitForSelector('#secF');
  for(const [id, nm, tr] of [[SA,'اختبار شعبة أ','tr1'],[SBs,'اختبار شعبة ب','tr2']]){
    await A.fill('#secF [name=id]', id); await A.fill('#secF [name=name]', nm);
    await A.locator('#secF [name=trainer_id]').selectOption({ label:people[tr].name });
    await A.click('#secF button'); await A.waitForSelector(`text=${nm}`);
  }
  for(const [k, sec] of [['t1',SA],['t2',SA],['t3',SBs]]){
    const r = A.locator('tr', { hasText:people[k].name });
    await r.locator('[name=section]').selectOption(sec); await r.locator('[data-save]').click(); await r.locator('text=حُفظ').waitFor();
  }
  t('2 admin made two trainers from the UI', psql(`select count(*) from profiles where role='trainer' and full_name like 'اختبار مدرب%' and id in (select id from auth.users where email like '%.${run}@miras.test')`)==='2');
  t('2 admin linked trainees to sections from the UI', psql(`select string_agg(coalesce(section_id,'-'), ',' order by trainee_no) from profiles where trainee_no in ('90001','90002','90003','90004') and id in (select id from auth.users where email like '%.${run}@miras.test')`)===`${SA},${SA},${SBs},-`);
  await A.screenshot({ path:`${SHOTS}/01-admin.png`, fullPage:true });

  // ---------- 3. المتدربون يتدربون على أجهزتهم ----------
  // متدرب 1 (آيفون): تدريب صحيح كامل
  const P1 = S.t1.p; await P1.reload(); await P1.click('text=بدء التدريب'); await P1.waitForSelector('#board');
  await perfectSim(P1);
  t('3 trainee 1 (iPhone): perfect run saved with 100', attemptsOf(people.t1.email)==='sim-train:true:100:0', attemptsOf(people.t1.email));
  // متدرب 2 (آيباد): اختبار مع خطأ قطبية ثم إكمال
  const P2 = S.t2.p; await P2.goto(APP+'#/sim/test'); await P2.waitForSelector('#board');
  await place(P2,'w1',0,'pin:5V'); await place(P2,'w1',1,'rail:-:4'); await check(P2);
  await place(P2,'w1',1,'rail:+:4'); await check(P2); await stepIs(P2,2);
  await place(P2,'w2',0,'pin:GND1'); await place(P2,'w2',1,'rail:-:8'); await check(P2); await stepIs(P2,3);
  await place(P2,'res',0,'rail:+:15'); await place(P2,'res',1,'h:b:15'); await place(P2,'led',0,'h:d:15'); await place(P2,'led',1,'rail:-:17'); await check(P2); await stepIs(P2,4);
  await P2.click('#check'); await P2.waitForSelector('text=اكتمل', { timeout:8000 });
  const a2 = attemptsOf(people.t2.email);
  t('3 trainee 2 (iPad): test with one polarity error saved with a lower score', /^sim-test:true:(\d+):1$/.test(a2) && +a2.split(':')[2] < 100, a2);
  // متدرب 3 (أندرويد): يترك التدريب في منتصفه
  const P3 = S.t3.p; await P3.click('text=بدء التدريب'); await P3.waitForSelector('#board');
  await place(P3,'w1',0,'pin:5V'); await place(P3,'w1',1,'rail:-:4'); await check(P3);
  await P3.click('#quit'); await P3.click('#quitYes'); await P3.waitForSelector('#view h2, #view h1');
  await P3.waitForTimeout(800);
  t('3 trainee 3 (Android): quitting saves an incomplete attempt with no score', attemptsOf(people.t3.email)==='sim-train:false:-:1', attemptsOf(people.t3.email));

  // ---------- 4. شاشة الكاميرا: من صفحة المتدرب إلى الكاميرا، والحفظ في حسابه ----------
  await P2.goto(APP+'#/home'); await P2.waitForSelector('text=بدء التدريب');
  const playsBefore = (await P2.evaluate(() => window.__plays)).length;
  await P2.click('.choice button[data-k=cam]'); await P2.click('#go');
  await P2.waitForURL(/coach\/\?mode=train/);
  await P2.waitForFunction(() => !document.getElementById('whoTop').hidden, null, { timeout:15000 }).catch(()=>{});
  t('4 camera page knows the signed-in trainee (no name typing)', await P2.locator('#whoTop').innerText().catch(()=>'')===`المتدرب: ${people.t2.name}` && await P2.locator('#nameRow').isHidden());
  t('4 camera page is RTL Arabic', await P2.evaluate(() => document.documentElement.dir==='rtl'));
  t('4 camera start screen fits the iPad width', await noOverflow(P2) <= 1);
  t('4 no sound before the camera starts', (await P2.evaluate(() => window.__plays)).length === 0);
  if(LIB){
    await P2.waitForFunction(() => window.__coach && __coach.S.cvReady, null, { timeout:120000 });
    await P2.click('#camBtn');
    await P2.waitForSelector('#recNote:not([hidden])', { timeout:15000 });
    t('4 "camera is recording" notice is shown while the camera runs', /الكاميرا تعمل وتصوّر الآن/.test(await P2.locator('#recNote').innerText()));
    t('4 live camera session started', await P2.evaluate(() => __coach.S.kind==='cam' && !!__coach.S.session));
    await P2.screenshot({ path:`${SHOTS}/04-camera-ipad.png` });
    // خطأ يحكم به المدرب المباشر (منطق الحكم نفسه مختبر في coach-browser/any-column.js على لوحة مرسومة)
    await P2.evaluate(() => { const s=__coach.S.session; s.events.push({ type:'error', code:'led_other_half', step:'led', t:12 }, { type:'error', code:'red_in_minus', step:'red', t:20 }); });
    await P2.click('#endBtn');
    await P2.waitForSelector('#result:not([hidden])');
    await P2.waitForFunction(() => document.getElementById('resSave').textContent.trim(), null, { timeout:10000 });
    const saveMsg = await P2.locator('#resSave').innerText();
    t('4 camera result says it was saved to the account', /حُفظت النتيجة في حسابك/.test(saveMsg), saveMsg);
    const a2c = attemptsOf(people.t2.email);
    t('4 camera attempt is in the database (cam-train, incomplete, 2 errors)', a2c.endsWith(',cam-train:false:-:2'), a2c);
    t('4 camera error codes stored as judged', psql(`select string_agg(code, ',' order by seq) from attempt_events e join attempts a on a.id=e.attempt_id where a.mode='cam-train' and a.user_id='${uid(people.t2.email)}'`)==='led_other_half,red_in_minus');
    // الرجوع إلى المنصة من شاشة الكاميرا يفتح صفحة المتدرب نفسها
    await P2.click('#result a:has-text("العودة إلى مراس")'); await P2.waitForSelector('text=سجل محاولاتي');
    t('4 "back to Miras" returns to the trainee home', /\/app\//.test(P2.url()));
    t('4 the camera attempt shows in the trainee history', await P2.locator('td:has-text("كاميرا · تدريب")').count()===1);
  } else skipped('4 camera session with a fake camera', 'LIB غير محدد (OpenCV)');

  // ---------- 5. الصوت ----------
  const plays = all.flatMap(p => []); // تجميع لاحقاً
  const p1plays = await P1.evaluate(() => window.__plays);
  t('5 simulation speaks (voice recordings play during training)', p1plays.some(x => /#\/sim/.test(x.where)), JSON.stringify(p1plays.slice(0,3)));
  const stray = [];
  for(const k of ['t1','t3','adm']) (await S[k].p.evaluate(() => window.__plays)).forEach(x => { if(!/#\/sim/.test(x.where) && !/\/coach\//.test(x.where)) stray.push(k+':'+x.where+':'+x.src); });
  t('5 no sound outside the training and camera screens', stray.length===0, stray.join(' | '));
  // بعد مغادرة التدريب يتوقف الصوت
  await P1.goto(APP+'#/home'); await P1.waitForSelector('text=بدء التدريب'); await P1.click('text=بدء التدريب'); await P1.waitForSelector('#check'); await place(P1,'w1',0,'pin:5V'); await place(P1,'w1',1,'rail:-:4'); await check(P1);
  await P1.goto(APP+'#/home'); await P1.waitForSelector('text=بدء التدريب'); await P1.waitForTimeout(300);
  t('5 sound stops when leaving the training screen', await P1.evaluate(() => !window.__lastAudio || window.__lastAudio.paused) );

  // ---------- 6. المدربون: كل مدرب يرى شعبته فقط ----------
  const T1 = S.tr1.p; await login(T1, people.tr1);
  t('6 trainer lands on the trainees page', /#\/trainer/.test(T1.url()));
  const txt1 = await bodyText(T1);
  t('6 trainer 1 sees trainees 1 and 2', txt1.includes(people.t1.name) && txt1.includes(people.t2.name));
  t('6 trainer 1 does NOT see trainee 3 (other section) or 4 (no section)', !txt1.includes(people.t3.name) && !txt1.includes(people.t4.name));
  const row2 = await T1.locator('tr', { hasText:people.t2.name }).innerText();
  t('6 trainer table shows trainee 2 attempts (sim + camera = 2)', /\t2\t/.test(row2.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))), row2);
  t('6 common errors list shows Arabic names, not codes', !/[a-z]_[a-z]/.test(await T1.locator('section:has(h2:has-text("الأخطاء الأكثر تكراراً"))').innerText()));
  await T1.screenshot({ path:`${SHOTS}/06-trainer1.png`, fullPage:true });
  await T1.click(`text=${people.t2.name}`); await T1.waitForSelector('text=سجل المحاولات');
  t('6 trainer opens trainee 2 and sees both attempts', await T1.locator('tr[data-a]').count()===(LIB?2:1));
  if(LIB){
    await T1.locator('tr[data-a]', { hasText:'كاميرا' }).click(); await T1.waitForSelector('text=اللمبة في الجهة الأخرى من المجرى الأوسط');
    t('6 trainer reads the camera errors in Arabic', true);
  }
  await T1.goto(APP+'#/trainer/'+uid(people.t3.email)); await T1.waitForTimeout(800);
  t('6 trainer 1 cannot open trainee 3 by link', /ليس في شعبتك/.test(await bodyText(T1)));
  await T1.goto(APP+'#/admin'); await T1.waitForTimeout(500);
  t('6 trainer cannot open the admin page', !T1.url().includes('#/admin'));
  const T2 = S.tr2.p; await login(T2, people.tr2);
  const txt2 = await bodyText(T2);
  t('6 trainer 2 sees only trainee 3', txt2.includes(people.t3.name) && !txt2.includes(people.t1.name) && !txt2.includes(people.t2.name));
  // المدرب على الآيباد
  const TI = await ctx(browser, devices['iPad (gen 7)']); await login(TI.p, people.tr1);
  t('6 trainer page fits iPad portrait width', await noOverflow(TI.p) <= 1, String(await noOverflow(TI.p)));
  await TI.p.screenshot({ path:`${SHOTS}/06-trainer-ipad.png`, fullPage:true });

  // ---------- 7. المتدرب لا يرى غيره ولا صفحات المدرب ----------
  await P1.goto(APP+'#/trainer'); await P1.waitForTimeout(400);
  t('7 trainee cannot open the trainer page', P1.url().endsWith('#/home'));
  await P1.goto(APP+'#/trainer/'+uid(people.t2.email)); await P1.waitForTimeout(400);
  t('7 trainee cannot open another trainee by link', P1.url().endsWith('#/home'));
  await P1.reload(); await P1.waitForSelector('text=سجل محاولاتي');
  t('7 trainee history shows only own attempts', await P1.locator('tr[data-a]').count()===1 && !(await bodyText(P1)).includes('اختبار ·'));

  // ---------- 8. جهاز مشترك (المعرض): محاولة محفوظة بلا إنترنت لا تُرسل باسم شخص آخر ----------
  const P4 = S.t4.p; await P4.goto(APP+'#/sim/train'); await P4.waitForSelector('#board');
  await S.t4.c.setOffline(true);
  await P4.click('#quit'); await P4.click('#quitYes'); await P4.waitForSelector('text=لم تُحفظ بعد');
  // يخرج المتدرب 4 والجهاز ما زال بلا إنترنت، ثم يعود الاتصال ويدخل متدرب 1 على الجهاز نفسه
  await P4.goto(APP+'#/settings'); await P4.click('#out'); await P4.waitForSelector('[name=email]');
  await S.t4.c.setOffline(false);
  await login(P4, people.t1); await P4.waitForTimeout(1500);
  t('8 shared device: queued attempt of trainee 4 is NOT saved under trainee 1', attemptsOf(people.t1.email)==='sim-train:true:100:0' && attemptsOf(people.t4.email)==='', attemptsOf(people.t1.email)+' / '+attemptsOf(people.t4.email));
  t('8 trainee 1 is not told about trainee 4 pending attempt', !(await bodyText(P4)).includes('لم تُرسل بعد'));
  await P4.goto(APP+'#/settings'); await P4.click('#out'); await P4.waitForSelector('[name=email]');
  await login(P4, people.t4); await P4.waitForTimeout(1500);
  t('8 the attempt is sent once its owner signs in again', attemptsOf(people.t4.email)==='sim-train:false:-:0', attemptsOf(people.t4.email));

  // ---------- 9. كل الشاشات: عرض الجوال، والاتجاه، والصياغة ----------
  const M = await ctx(browser, devices['iPhone SE']);
  const pages = [];
  for(const h of ['#/welcome','#/login','#/signup','#/forgot']){ await M.p.goto(APP+h); await M.p.waitForSelector('#view h1'); pages.push([h, M.p]); await check9(M.p, 'visitor '+h); }
  await login(M.p, people.t1); for(const h of ['#/home','#/settings']){ await M.p.goto(APP+h); await M.p.waitForSelector('#view h1'); await check9(M.p, 'trainee '+h); }
  await M.p.goto(APP+'#/sim/train'); await M.p.waitForSelector('#board'); await check9(M.p, 'trainee sim');
  await M.p.goto(BASE+'coach/?mode=train'); await M.p.waitForSelector('#camBtn'); await check9(M.p, 'camera start');
  await M.p.goto(APP+'#/settings'); await M.p.click('#out'); await M.p.waitForSelector('[name=email]');
  await login(M.p, people.tr1); await check9(M.p, 'trainer list');
  await M.p.click(`text=${people.t2.name}`); await M.p.waitForSelector('text=سجل المحاولات'); await check9(M.p, 'trainer detail');
  await M.p.goto(APP+'#/settings'); await M.p.click('#out'); await M.p.waitForSelector('[name=email]');
  await login(M.p, people.adm); await M.p.goto(APP+'#/admin'); await M.p.waitForSelector('#secF'); await check9(M.p, 'admin');
  async function check9(p, label){
    const over = await noOverflow(p);
    t(`9 ${label}: no sideways scrolling on a small phone (${over}px)`, over <= 1);
    const g = (await bodyText(p)).match(GENDERED);
    t(`9 ${label}: wording is gender-neutral`, !g, g && g[0]);
    t(`9 ${label}: RTL`, await p.evaluate(() => document.documentElement.dir==='rtl'));
  }

  const errs = all.flatMap(p => p.errors);
  t('no JavaScript errors in any page', errs.length===0, errs.join(' | '));
  } catch(e){ t('crashed', false, e.stack); }
  finally {
    // تنظيف: لا يبقى أي حساب أو بيانات اختبار
    psql(`delete from sections where id in ('${SA}','${SBs}')`);
    psql(`delete from auth.users where email like 'test-%.${run}@miras.test'`);
    t('cleanup: no test accounts or attempts left', psql(`select count(*) from auth.users where email like '%.${run}@miras.test'`)==='0' && psql(`select count(*) from sections where id in ('${SA}','${SBs}')`)==='0');
    await browser.close();
    console.log(`\n${pass} نجح، ${fail} فشل، ${skip} لم يُختبر`);
    process.exit(fail?1:0);
  }
})();
