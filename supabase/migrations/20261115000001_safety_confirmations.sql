-- مراس: تأكيدات المدرب في فحص ما قبل التشغيل (بديل الرمز العام 9001).
-- لا يُنشأ تأكيد إلا من حساب دوره trainer أو admin، والتحقق هنا في قاعدة البيانات لا في الواجهة.
-- السجل لا يُعدّل ولا يُحذف من التطبيق، والوقت من ساعة الخادم.

create table public.safety_confirmations (
  id              uuid primary key default gen_random_uuid(),
  trainer_id      uuid not null references public.profiles(id) on delete restrict,
  trainee_id      uuid references public.profiles(id) on delete set null,
  trainee_label   text check (trainee_label is null or char_length(trainee_label) <= 80),
  device_session  text not null check (char_length(device_session) between 4 and 64),
  lesson_id       text not null default 'power-rails' references public.lessons(id),
  lines           text[] not null check (
                    cardinality(lines) between 1 and 7
                    and lines <@ array['short','wires','resistor','led','resistor_value','led_polarity','no_extra']::text[]),
  camera_state    jsonb check (camera_state is null or pg_column_size(camera_state) <= 4000),
  reason          text not null check (char_length(btrim(reason)) between 3 and 300),
  created_at      timestamptz not null default now()
);
create index safety_conf_trainer_idx on public.safety_confirmations(trainer_id, created_at desc);
create index safety_conf_trainee_idx on public.safety_confirmations(trainee_id, created_at desc);

alter table public.safety_confirmations enable row level security;

-- القراءة: المدرب نفسه، المدير، مدرب شعبة المتدرب، والمتدرب لسجلاته فقط. لا سياسة إدخال أو تعديل أو حذف.
create policy safety_conf_select on public.safety_confirmations for select to authenticated
  using (trainer_id = auth.uid() or public.is_admin()
         or (trainee_id is not null and (trainee_id = auth.uid() or public.trains(trainee_id))));

revoke all on public.safety_confirmations from public, anon, authenticated;
grant select on public.safety_confirmations to authenticated;

-- الطريق الوحيد لإنشاء تأكيد
create or replace function public.confirm_safety(
  p_lines text[], p_reason text, p_device_session text,
  p_trainee uuid default null, p_trainee_label text default null, p_camera jsonb default null)
returns table (id uuid, created_at timestamptz, trainer_name text)
language plpgsql security definer set search_path = public as
$$
declare r text; rec public.safety_confirmations;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  r := public.my_role();
  if r is null or r not in ('trainer','admin') then raise exception 'not_trainer' using errcode = '42501'; end if;
  if p_trainee is not null and not (public.is_admin() or public.trains(p_trainee)) then
    raise exception 'not_your_trainee' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  if p_lines is null or cardinality(p_lines) = 0 then raise exception 'lines_required' using errcode = '22023'; end if;
  insert into public.safety_confirmations (trainer_id, trainee_id, trainee_label, device_session, lines, camera_state, reason)
  values (auth.uid(), p_trainee, nullif(btrim(coalesce(p_trainee_label,'')),''), p_device_session,
          (select array_agg(distinct x order by x) from unnest(p_lines) x), p_camera, btrim(p_reason))
  returning * into rec;
  return query select rec.id, rec.created_at, (select p.full_name from public.profiles p where p.id = rec.trainer_id);
end $$;
revoke all on function public.confirm_safety(text[], text, text, uuid, text, jsonb) from public, anon;
grant execute on function public.confirm_safety(text[], text, text, uuid, text, jsonb) to authenticated;
