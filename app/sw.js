// مراس: يحفظ ملفات الواجهة للعمل دون إنترنت. لا يخزّن أي بيانات من قاعدة البيانات.
const V = 'miras-app-v1';
const FILES = ['./','index.html','styles.css','config.js','main.js','core/auth.js','core/data.js','core/circuit.js','core/voice.js','core/phrases.js','ui/views.js','ui/sim.js','vendor/supabase-2.119.0.js','manifest.webmanifest','icons/icon.svg','icons/icon-192.png','voice/manifest.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x!==V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(e.request.method!=='GET' || u.origin!==location.origin) return;   // طلبات Supabase تمر مباشرة
  // الشبكة أولاً ثم النسخة المحفوظة، حتى تصل التحديثات فوراً
  e.respondWith(fetch(e.request).then(r => { const c=r.clone(); caches.open(V).then(x=>x.put(e.request,c)); return r; }).catch(() => caches.match(e.request)));
});
