// اختبار المنصة في متصفح حقيقي (Chromium) على Supabase محلي.
// التشغيل: APP=http://127.0.0.1:8099/app/ SB_URL=... SB_ANON=... DB_URL=... node tests/app/e2e.test.js
const { chromium, devices } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const APP = process.env.APP, SB_URL = process.env.SB_URL, SB_ANON = process.env.SB_ANON, DB = process.env.DB_URL;
const MAIL = process.env.MAIL_URL || 'http://127.0.0.1:54324';
const SHOTS = process.env.SHOTS || '/tmp/miras-shots';
fs.mkdirSync(SHOTS, { recursive:true });
const psql = sql => execFileSync('psql', [DB, '-tAc', sql]).toString().trim();
const run = Date.now().toString(36);
const mail = n => `${n}.${run}@miras.test`;
const PW = 'Miras-e2e-2026!';
const NAME = 'سارة ' + run;
let pass=0, fail=0;
const t=(name, ok, info='')=>{ ok?pass++:fail++; console.log((ok?'✓ ':'✗ ')+name+(ok?'':'  '+info)); };

async function ctx(browser, opts={}){
  const c = await browser.newContext({ locale:'ar-SA', ...opts });
  await c.route('**/app/config.js', r => r.fulfill({ contentType:'application/javascript', body:`window.MIRAS_CONFIG={supabaseUrl:${JSON.stringify(SB_URL)},supabaseAnonKey:${JSON.stringify(SB_ANON)}};` }));
  const p = await c.newPage();
  p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  return { c, p };
}
const stateText = p => p.locator('#state').innerText();
async function place(p, id, k, node){ await p.evaluate(([id,k,node]) => document.querySelector('#view').__sim.place(id,k,node), [id,k,node]); }
async function dragEnd(p, id, k, node){
  // سحب حقيقي بالفأرة من طرف القطعة إلى الفتحة
  const end = p.locator(`circle.end:not(.hit)[data-i="${id}"][data-k="${k}"]`);
  const b = await end.boundingBox();
  const target = await p.evaluate(n => { const v=document.querySelector('#view'); const [x,y]=v.__sim.nodeXY(n); const svg=document.querySelector('#board'); const pt=svg.createSVGPoint(); pt.x=x; pt.y=y; const s=pt.matrixTransform(svg.getScreenCTM()); return [s.x,s.y]; }, node);
  await p.mouse.move(b.x+b.width/2, b.y+b.height/2); await p.mouse.down();
  await p.mouse.move((b.x+target[0])/2, (b.y+target[1])/2, { steps:5 });
  await p.mouse.move(target[0], target[1], { steps:5 }); await p.mouse.up();
}
async function check(p){ await p.click('#check'); await p.waitForTimeout(150); return stateText(p); }

(async () => {
  const browser = await chromium.launch();

  // 1 تسجيل حساب جديد من الواجهة
  const A = await ctx(browser);
  await A.p.goto(APP);
  await A.p.waitForSelector('text=تسجيل الدخول');
  await A.p.screenshot({ path:`${SHOTS}/01-login.png` });
  await A.p.click('text=حساب جديد');
  await A.p.fill('[name=full_name]', NAME);
  await A.p.fill('[name=trainee_no]', '4410777');
  await A.p.fill('[name=email]', mail('sara'));
  await A.p.fill('[name=password]', '123');
  await A.p.click('button[type=submit]');
  t('1 UI rejects short password', /8 أحرف/.test(await A.p.locator('.msg').innerText()));
  await A.p.fill('[name=password]', PW);
  await A.p.click('button[type=submit]');
  await A.p.waitForSelector('text=بدء التدريب');
  t('1 signup lands on trainee home', true);
  await A.p.screenshot({ path:`${SHOTS}/02-home.png` });

  // 4 المتدرب لا يدخل لوحة المدرب
  await A.p.goto(APP+'#/trainer'); await A.p.waitForTimeout(500);
  t('4 trainee redirected away from trainer page', A.p.url().endsWith('#/home'), A.p.url());
  await A.p.goto(APP+'#/admin'); await A.p.waitForTimeout(500);
  t('4 trainee redirected away from admin page', A.p.url().endsWith('#/home'));

  // 6-10 التدريب من البداية للنهاية، مع أخطاء متعمدة
  await A.p.click('text=بدء التدريب');
  await A.p.waitForSelector('#board');
  await A.p.screenshot({ path:`${SHOTS}/03-sim-start.png` });
  t('6 cannot pass step 1 without wiring', /لم يُوصَّل/.test(await check(A.p)));
  // 10 سلك غير متصل: طرف في 5V والآخر حر
  await dragEnd(A.p, 'w1', 0, 'pin:5V');
  t('10 unconnected wire detected', /غير مثبّت/.test(await check(A.p)), await stateText(A.p));
  // 9 قطبية معكوسة
  await dragEnd(A.p, 'w1', 1, 'rail:-:4');
  t('9 reversed polarity detected', /القطبية معكوسة/.test(await check(A.p)));
  await A.p.screenshot({ path:`${SHOTS}/04-sim-reversed.png` });
  // 8 توصيل خاطئ: فتحة خارج خط الطاقة
  await dragEnd(A.p, 'w1', 1, 'h:c:12');
  t('8 wrong hole detected', /خارج خط الطاقة/.test(await check(A.p)));
  // 7 توصيل صحيح (بالسحب الحقيقي)
  await dragEnd(A.p, 'w1', 1, 'rail:+:4');
  t('7 correct red wire accepted', /صحيح/.test(await check(A.p)));
  await A.p.waitForSelector('text=الخطوة 2 من 4', { timeout:4000 });
  t('6 advanced to step 2 only after correct', true);
  // قصر: الأسود في خط +
  await dragEnd(A.p, 'w2', 0, 'pin:GND1'); await dragEnd(A.p, 'w2', 1, 'rail:+:8');
  t('short circuit detected and blocked', /قصر كهربائي/.test(await check(A.p)));
  await dragEnd(A.p, 'w2', 1, 'rail:-:8');
  t('7 black wire accepted', /صحيح/.test(await check(A.p)));
  await A.p.waitForSelector('text=الخطوة 3 من 4', { timeout:4000 });
  // لمبة مقلوبة ثم صحيحة
  await place(A.p, 'res', 0, 'rail:+:15'); await place(A.p, 'res', 1, 'h:b:15');
  await place(A.p, 'led', 0, 'rail:-:16'); await place(A.p, 'led', 1, 'h:c:15');
  t('reversed LED detected', /مقلوبة/.test(await check(A.p)));
  await dragEnd(A.p, 'led', 0, 'h:d:15'); await dragEnd(A.p, 'led', 1, 'rail:-:17');
  t('7 parts accepted', /صحيح/.test(await check(A.p)), await stateText(A.p));
  await A.p.waitForSelector('text=الخطوة 4 من 4', { timeout:4000 });
  await A.p.click('#check');
  await A.p.waitForSelector('text=اكتمل التدريب', { timeout:8000 });
  await A.p.screenshot({ path:`${SHOTS}/05-sim-done.png` });
  t('6 training completed end to end', true);
  t('6 result saved to account', await A.p.locator('text=حُفظت النتيجة في حسابك').count()===1);
  const row = psql(`select score||'|'||error_count||'|'||completed from attempts a join auth.users u on u.id=a.user_id where u.email='${mail('sara')}'`);
  t('6 database has the attempt (score|errors|completed)', row==='32|6|true', row);

  // 15 تحديث الصفحة: لا فقدان للجلسة أو البيانات
  await A.p.goto(APP+'#/home'); await A.p.reload();
  await A.p.waitForSelector('text=سجل محاولاتي');
  t('15 after reload still signed in and attempt listed', await A.p.locator('tr[data-a]').count()===1);

  // 5 جهاز آخر: نفس البيانات
  const B = await ctx(browser, { ...devices['iPad (gen 7) landscape'] });
  await B.p.goto(APP);
  await B.p.fill('[name=email]', mail('sara')); await B.p.fill('[name=password]', PW); await B.p.click('button[type=submit]');
  await B.p.waitForSelector('text=سجل محاولاتي');
  t('5 another device (iPad profile) shows the same attempt', await B.p.locator('tr[data-a]').count()===1);
  await B.p.locator('tr[data-a]').first().click(); await B.p.waitForSelector('text=القطبية معكوسة');
  t('5 error log visible on other device', true);
  await B.p.screenshot({ path:`${SHOTS}/06-ipad-home.png` });

  // 15 انقطاع الإنترنت أثناء الحفظ
  await A.p.goto(APP+'#/sim/test'); await A.p.waitForSelector('#board');
  await A.c.setOffline(true);
  await A.p.click('#quit');
  await A.p.waitForSelector('text=لم تُحفظ بعد');
  t('15 offline save reported honestly (not fake success)', true);
  await A.c.setOffline(false);
  await A.p.evaluate(() => window.dispatchEvent(new Event('online')));
  await A.p.waitForTimeout(1500);
  t('15 queued attempt sent when back online', psql(`select count(*) from attempts a join auth.users u on u.id=a.user_id where u.email='${mail('sara')}'`)==='2');

  // 2 الخروج والدخول
  await A.p.goto(APP+'#/settings'); await A.p.click('#out');
  await A.p.waitForSelector('h1:has-text("تسجيل الدخول")');
  t('2 sign out returns to login', true);
  await A.p.goto(APP+'#/home'); await A.p.waitForTimeout(400);
  t('2 signed-out user cannot open home', A.p.url().endsWith('#/login'));
  await A.p.fill('[name=email]', mail('sara')); await A.p.fill('[name=password]', 'wrong-pass-1');
  await A.p.click('button[type=submit]'); await A.p.waitForTimeout(800);
  t('2 wrong password message', /غير صحيحة/.test(await A.p.locator('.msg').innerText()));

  // 3 استعادة كلمة المرور من الواجهة حتى الرابط في البريد
  await A.p.click('text=نسيت كلمة المرور');
  await A.p.waitForSelector('h1:has-text("استعادة كلمة المرور")');
  await A.p.fill('[name=email]', mail('sara')); await A.p.click('button[type=submit]');
  await A.p.waitForFunction(() => document.querySelector('.msg')?.textContent.trim());
  const fm = await A.p.locator('.msg').innerText();
  t('3 reset requested from UI', /ستصله رسالة/.test(fm), fm);
  await A.p.waitForTimeout(1500);
  const list = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(mail('sara'))}`)).json();
  const text = (await (await fetch(`${MAIL}/api/v1/message/${list.messages[0].ID}`)).json()).Text;
  const link = /(http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s)\]]+)/.exec(text)?.[1]?.replace(/&amp;/g,'&');
  t('3 reset email arrived', !!link);
  await A.p.goto(link); await A.p.waitForTimeout(1500);
  await A.p.waitForSelector('text=كلمة مرور جديدة', { timeout:8000 });
  await A.p.fill('[name=password]', 'Brand-new-2026!'); await A.p.click('button[type=submit]');
  await A.p.waitForSelector('text=تم تغيير كلمة المرور');
  t('3 password changed from email link', true);
  await A.p.goto(APP+'#/settings'); await A.p.click('#out'); await A.p.waitForSelector('[name=email]');
  await A.p.fill('[name=email]', mail('sara')); await A.p.fill('[name=password]', 'Brand-new-2026!'); await A.p.click('button[type=submit]');
  await A.p.waitForSelector('text=سجل محاولاتي');
  t('3 sign in with new password', true);

  // 4 المدرب: يرى شعبته فقط، والبيانات من القاعدة، والتصدير يعمل
  const T = await ctx(browser);
  await T.p.goto(APP); await T.p.click('text=حساب جديد');
  await T.p.fill('[name=full_name]', 'مدرب واجهة'); await T.p.fill('[name=email]', mail('coach')); await T.p.fill('[name=password]', PW);
  await T.p.click('button[type=submit]'); await T.p.waitForSelector('text=بدء التدريب');
  psql(`update profiles set role='admin' where id=(select id from auth.users where email='${mail('coach')}')`);
  await T.p.reload(); await T.p.waitForSelector('text=الحسابات');
  await T.p.click('text=الحسابات'); await T.p.waitForSelector('#secF');
  await T.p.fill('#secF [name=id]', 'E'+run); await T.p.fill('#secF [name=name]', 'شعبة الواجهة');
  await T.p.click('#secF button'); await T.p.waitForSelector(`text=شعبة الواجهة`);
  const r = T.p.locator('tr', { hasText:NAME });
  await r.locator('[name=section]').selectOption('E'+run); await r.locator('[data-save]').click();
  await r.locator('text=حُفظ').waitFor();
  t('4 admin UI assigns section', psql(`select section_id from profiles where full_name='${NAME}'`)==='E'+run);
  await T.p.screenshot({ path:`${SHOTS}/07-admin.png` });
  await T.p.click('text=المتدربون'); await T.p.waitForSelector(`text=${NAME}`);
  await T.p.screenshot({ path:`${SHOTS}/08-trainer.png` });
  const [dl] = await Promise.all([T.p.waitForEvent('download'), T.p.click('#csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  t('7 CSV export contains trainee from database', csv.includes(NAME) && csv.includes('4410777'));
  await T.p.click(`text=${NAME}`); await T.p.waitForSelector('text=سجل المحاولات');
  t('7 trainee detail shows 2 attempts', await T.p.locator('tr[data-a]').count()===2);

  // 14 أحجام الشاشات: لا تمرير أفقي
  for(const [name, dev] of [['iphone', devices['iPhone 13']], ['android', devices['Pixel 7']], ['ipad', devices['iPad (gen 7)']], ['desktop', { viewport:{ width:1366, height:800 } }]]){
    const D = await ctx(browser, dev);
    await D.p.goto(APP); await D.p.fill('[name=email]', mail('sara')); await D.p.fill('[name=password]', 'Brand-new-2026!'); await D.p.click('button[type=submit]');
    await D.p.waitForSelector('text=بدء التدريب'); await D.p.click('text=بدء التدريب'); await D.p.waitForSelector('#board');
    await dragEnd(D.p, 'w1', 0, 'pin:5V'); await dragEnd(D.p, 'w1', 1, 'rail:+:6');
    const st = await D.p.evaluate(() => document.querySelector('#view').__sim.state().wires[0]);
    t(`14 ${name}: drag and drop snaps wire into holes`, st.a==='pin:5V' && st.b==='rail:+:6', JSON.stringify(st));
    const over = await D.p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    t(`14 ${name}: simulation fits width (overflow ${over}px)`, over<=1);
    await D.p.screenshot({ path:`${SHOTS}/09-sim-${name}.png`, fullPage:true });
    await D.c.close();
  }

  const errs = [...A.p.errors, ...B.p.errors, ...T.p.errors];
  t('no JavaScript errors in pages', errs.length===0, errs.join(' | '));
  await browser.close();
  console.log(`\n${pass} نجح، ${fail} فشل`);
  process.exit(fail?1:0);
})().catch(e => { console.error('✗ crashed:', e.message); process.exit(1); });
