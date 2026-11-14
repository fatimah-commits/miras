# منصة مراس (النسخة الجديدة)

نسخة مبنية من جديد في هذا المجلد. الموقع القديم في جذر المستودع لم يتغير، ونسخة عرض المعلمة محفوظة في الفرع `teacher-demo-2026-11-14`.

## البنية
- `core/`: المنطق فقط (بلا واجهة)، ويُختبر في Node.
  - `circuit.js` محرك الدائرة: يحكم من الفتحات والشبكات، لا من لون السلك.
  - `auth.js` الحسابات (Supabase Auth). `data.js` الحفظ مع طابور عند انقطاع الإنترنت.
  - `voice.js` مشغّل صوت واحد، و`phrases.js` الجمل المنطوقة.
- `ui/`: الشاشات. `sim.js` المحاكاة، `views.js` بقية الشاشات.
- `../supabase/migrations/`: الجداول وسياسات الحماية RLS.
- `config.js`: رابط Supabase ومفتاحه العام فقط. لا مفاتيح سرية في الواجهة.

## الاختبارات
- `node tests/app/circuit.test.mjs` محرك الدائرة.
- `tests/app/backend.test.mjs` الحسابات والصلاحيات والحفظ على Supabase محلي.
- `tests/app/e2e.test.js` المنصة كاملة في متصفح Chromium، بمقاسات iPhone وAndroid وiPad والكمبيوتر.
- تعمل الثلاثة آلياً على GitHub عند كل طلب دمج (`.github/workflows/app-tests.yml`).

## الربط بقاعدة البيانات (مرة واحدة)
1. مشروع جديد في supabase.com.
2. SQL Editor: لصق محتوى `supabase/migrations/20261114000001_init.sql` ثم Run.
3. نسخ Project URL وanon key إلى `config.js`.
4. بعد إنشاء حسابك من المنصة، تشغيل هذا السطر في SQL Editor لجعله مديراً:
   `update profiles set role='admin' where id = (select id from auth.users where email = 'بريدك');`
