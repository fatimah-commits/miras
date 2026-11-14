-- مراس: الجداول الأساسية وسياسات الحماية (RLS)
-- كل جدول مفعّل عليه RLS. لا أحد يقرأ بيانات غيره إلا المدرب لشعبته والمدير.

-- ---------- الشعب ----------
create table public.sections (
  id          text primary key,
  name        text not null,
  trainer_id  uuid,
  created_at  timestamptz not null default now()
);

-- ---------- الملفات الشخصية والأدوار ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 80),
  trainee_no  text check (trainee_no is null or trainee_no ~ '^[0-9]{4,12}$'),
  role        text not null default 'trainee' check (role in ('trainee','trainer','admin')),
  section_id  text references public.sections(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.sections
  add constraint sections_trainer_fk foreign key (trainer_id) references public.profiles(id) on delete set null;

-- دوال مساعدة (security definer حتى لا تتكرر سياسات profiles على نفسها)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false) $$;

-- هل المستخدم الحالي مدرب لشعبة هذا المتدرب؟
create or replace function public.trains(trainee uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.profiles p join public.sections s on s.id = p.section_id
     where p.id = trainee and s.trainer_id = auth.uid()
   ) $$;

-- عند التسجيل: ملف شخصي بدور "متدرب" دائماً. الدور من بيانات التسجيل يُتجاهل عمداً.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as
$$
declare no text := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'trainee_no',''), '[^0-9]', '', 'g'), '');
begin
  insert into public.profiles (id, full_name, trainee_no, role)
  values (new.id,
          left(coalesce(new.raw_user_meta_data->>'full_name',''), 80),
          case when no ~ '^[0-9]{4,12}$' then no end,
          'trainee');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- منع المستخدم من تغيير دوره أو شعبته بنفسه
create or replace function public.guard_profile() returns trigger
language plpgsql set search_path = public as
$$
begin
  -- auth.uid() فارغ فقط عند التنفيذ المباشر من لوحة Supabase (SQL Editor)، لا من الواجهة
  if (new.role is distinct from old.role or new.section_id is distinct from old.section_id)
     and auth.uid() is not null
     and not public.is_admin()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'لا يمكن تغيير الدور أو الشعبة إلا من المدير';
  end if;
  if new.id is distinct from old.id then raise exception 'id ثابت'; end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

alter table public.profiles enable row level security;
alter table public.sections enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.trains(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy sections_select on public.sections for select to authenticated using (true);
create policy sections_admin on public.sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- الدروس والخطوات ----------
create table public.lessons (
  id         text primary key,
  title      text not null,
  version    int  not null default 1
);
create table public.lesson_steps (
  lesson_id  text not null references public.lessons(id) on delete cascade,
  idx        int  not null,
  code       text not null,
  title      text not null,
  primary key (lesson_id, idx),
  unique (lesson_id, code)
);
alter table public.lessons enable row level security;
alter table public.lesson_steps enable row level security;
create policy lessons_read on public.lessons for select to authenticated using (true);
create policy steps_read on public.lesson_steps for select to authenticated using (true);
create policy lessons_admin on public.lessons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy steps_admin on public.lesson_steps for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.lessons (id, title) values ('power-rails', 'تغذية لوحة التجارب من الأردوينو');
insert into public.lesson_steps (lesson_id, idx, code, title) values
  ('power-rails', 1, 'red',   'السلك الأحمر من 5V إلى خط +'),
  ('power-rails', 2, 'black', 'السلك الأسود من GND إلى خط −'),
  ('power-rails', 3, 'parts', 'المقاومة واللمبة على التوالي'),
  ('power-rails', 4, 'power', 'توصيل الكهرباء والتحقق من إضاءة اللمبة');

-- ---------- المحاولات والأحداث ----------
create table public.attempts (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null check (char_length(client_id) between 8 and 64),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  lesson_id    text not null references public.lessons(id),
  mode         text not null check (mode in ('sim-train','sim-test','cam-train','cam-test')),
  started_at   timestamptz not null,
  finished_at  timestamptz,
  duration_s   numeric(8,1) check (duration_s is null or duration_s between 0 and 86400),
  completed    boolean not null default false,
  score        int check (score is null or score between 0 and 100),
  error_count  int not null default 0 check (error_count >= 0),
  created_at   timestamptz not null default now(),
  unique (user_id, client_id)
);
create index attempts_user_idx on public.attempts(user_id, started_at desc);

create table public.attempt_events (
  id          bigint generated always as identity primary key,
  attempt_id  uuid not null references public.attempts(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  seq         int  not null check (seq >= 0),
  step_code   text not null,
  kind        text not null check (kind in ('ok','error','uncertain','override','hint')),
  code        text not null check (char_length(code) <= 40),
  confidence  numeric(4,3) check (confidence is null or confidence between 0 and 1),
  t_s         numeric(8,1) not null check (t_s >= 0),
  unique (attempt_id, seq)
);
create index events_attempt_idx on public.attempt_events(attempt_id);

alter table public.attempts enable row level security;
alter table public.attempt_events enable row level security;

create policy attempts_insert_own on public.attempts for insert to authenticated
  with check (user_id = auth.uid());
create policy attempts_update_own on public.attempts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy attempts_select on public.attempts for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.trains(user_id));

create policy events_insert_own on public.attempt_events for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid())
              and kind <> 'override');
create policy events_select on public.attempt_events for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.trains(user_id));

-- محاولة منتهية لا تُعدّل (منع تغيير الدرجة بعد الحفظ)
create or replace function public.guard_attempt() returns trigger
language plpgsql as
$$
begin
  if old.finished_at is not null then raise exception 'المحاولة منتهية ولا يمكن تعديلها'; end if;
  if new.user_id <> old.user_id or new.client_id <> old.client_id then raise exception 'حقول ثابتة'; end if;
  return new;
end $$;
create trigger attempts_guard before update on public.attempts
  for each row execute function public.guard_attempt();

-- تجاوز المدرب: فقط مدرب الشعبة أو المدير، ويُسجّل كحدث
create or replace function public.trainer_override(p_attempt uuid, p_step text) returns void
language plpgsql security definer set search_path = public as
$$
declare a record; n int;
begin
  select * into a from public.attempts where id = p_attempt;
  if a is null then raise exception 'محاولة غير موجودة'; end if;
  if not (public.is_admin() or public.trains(a.user_id)) then raise exception 'غير مصرح'; end if;
  select coalesce(max(seq), -1) + 1 into n from public.attempt_events where attempt_id = p_attempt;
  insert into public.attempt_events (attempt_id, user_id, seq, step_code, kind, code, t_s)
  values (p_attempt, a.user_id, n, p_step, 'override', 'trainer:' || left(auth.uid()::text, 8), 0);
end $$;
revoke all on function public.trainer_override(uuid, text) from public, anon;
grant execute on function public.trainer_override(uuid, text) to authenticated;

-- ---------- تقرير المدرب ----------
-- security_invoker: التقرير يحترم RLS للمستخدم الذي يطلبه
create view public.trainee_progress with (security_invoker = true) as
select p.id as user_id, p.full_name, p.trainee_no, p.section_id,
       count(a.id)                                  as attempts,
       count(a.id) filter (where a.completed)       as completed,
       max(a.score)                                 as best_score,
       round(avg(a.score) filter (where a.finished_at is not null))::int as avg_score,
       round(avg(a.duration_s) filter (where a.completed), 1) as avg_duration_s,
       coalesce(sum(a.error_count), 0)              as errors,
       max(a.started_at)                            as last_at
from public.profiles p
left join public.attempts a on a.user_id = p.id
where p.role = 'trainee'
group by p.id;

create view public.error_counts with (security_invoker = true) as
select e.user_id, e.code, count(*) as n
from public.attempt_events e where e.kind = 'error'
group by e.user_id, e.code;

grant select on public.trainee_progress, public.error_counts to authenticated;
-- صلاحيات صريحة (تعمل حتى لو أُطفئ خيار "Automatically expose new tables")، وRLS يبقى الحاكم
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles, public.sections, public.lessons, public.lesson_steps, public.attempts, public.attempt_events to authenticated;
grant delete on public.sections, public.lessons, public.lesson_steps to authenticated;
grant usage on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
