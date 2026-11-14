// مراس: الحسابات عبر Supabase Auth. لا كلمات مرور ولا مفاتيح سرية هنا.
// كل دالة ترجع {ok, error?, ...}. الرسائل بالعربية للواجهة.

const MSG = {
  'Invalid login credentials': 'البريد أو كلمة المرور غير صحيحة.',
  'User already registered': 'هذا البريد مسجّل مسبقاً.',
  'Email not confirmed': 'أكّدي بريدك من الرسالة المرسلة أولاً.',
  'Password should be at least 6 characters.': 'كلمة المرور قصيرة.',
};
const ar = e => {
  if(!e) return null;
  const m = e.message || String(e);
  if(MSG[m]) return MSG[m];
  if(/rate limit/i.test(m)) return 'محاولات كثيرة. انتظري قليلاً ثم أعيدي.';
  if(/fetch|network|Failed to fetch/i.test(m)) return 'لا يوجد اتصال بالإنترنت.';
  if(/weak|pwned/i.test(m)) return 'كلمة المرور ضعيفة. اختاري كلمة أطول وأصعب.';
  return 'حدث خطأ: ' + m;
};

export const PW_MIN = 8;
export function validate({ email, password, full_name, trainee_no }, signup){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')) return 'اكتبي بريداً صحيحاً.';
  if(!password || password.length < PW_MIN) return `كلمة المرور ${PW_MIN} أحرف على الأقل.`;
  if(signup){
    if(!full_name || full_name.trim().length < 3) return 'اكتبي الاسم الكامل.';
    if(trainee_no && !/^[0-9]{4,12}$/.test(trainee_no)) return 'الرقم التدريبي أرقام فقط.';
  }
  return null;
}

export function makeAuth(sb){
  return {
    async signUp({ email, password, full_name, trainee_no, redirectTo }){
      const v = validate({ email, password, full_name, trainee_no }, true); if(v) return { ok:false, error:v };
      const { data, error } = await sb.auth.signUp({ email, password,
        options:{ data:{ full_name: full_name.trim(), trainee_no: trainee_no||null }, emailRedirectTo: redirectTo } });
      if(error) return { ok:false, error: ar(error) };
      // عند تفعيل تأكيد البريد لا تُنشأ جلسة حتى يؤكد
      return { ok:true, needsConfirm: !data.session, user: data.user };
    },
    async signIn({ email, password }){
      const v = validate({ email, password }); if(v) return { ok:false, error:v };
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      return error ? { ok:false, error: ar(error) } : { ok:true, user: data.user };
    },
    async signOut(){ const { error } = await sb.auth.signOut(); return error ? { ok:false, error: ar(error) } : { ok:true }; },
    async requestReset(email, redirectTo){
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')) return { ok:false, error:'اكتبي بريداً صحيحاً.' };
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      return error ? { ok:false, error: ar(error) } : { ok:true };
    },
    async setNewPassword(password){
      if(!password || password.length < PW_MIN) return { ok:false, error:`كلمة المرور ${PW_MIN} أحرف على الأقل.` };
      const { error } = await sb.auth.updateUser({ password });
      return error ? { ok:false, error: ar(error) } : { ok:true };
    },
    async me(){
      const { data:{ user } } = await sb.auth.getUser();
      if(!user) return null;
      const { data, error } = await sb.from('profiles').select('id,full_name,trainee_no,role,section_id').eq('id', user.id).single();
      if(error) return { id:user.id, email:user.email, role:null, error: ar(error) };
      return { ...data, email: user.email };
    },
    onChange(cb){ return sb.auth.onAuthStateChange((event, session) => cb(event, session)); },
  };
}
