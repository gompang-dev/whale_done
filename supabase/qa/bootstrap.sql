-- PraiseBoard QA database bootstrap
--
-- Run this file only against a new, empty QA Supabase project.
-- It deliberately does not create pg_cron jobs or deploy notification Edge
-- Functions. It contains no production data.

create type public.board_status as enum ('active', 'completed');
create type public.sticker_source as enum ('app', 'widget');
create type public.mbti_type as enum (
  'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nickname text,
  mbti public.mbti_type,
  reminder_hour integer not null default 21,
  reminder_minute integer not null default 0,
  reminder_times jsonb not null default '[{"hour":21,"minute":0}]'::jsonb,
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  constraint profiles_nickname_length_check
    check (nickname is null or char_length(btrim(nickname)) between 1 and 20),
  constraint profiles_reminder_time_check
    check (reminder_hour between 0 and 23 and reminder_minute between 0 and 59),
  constraint profiles_reminder_times_check check (jsonb_typeof(reminder_times) = 'array'),
  constraint profiles_timezone_length_check check (char_length(btrim(timezone)) between 1 and 64)
);

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  emoji text not null,
  target_count integer not null check (target_count > 0),
  current_count integer not null default 0,
  limit_count integer not null default 10 check (limit_count > 0),
  completed_at timestamptz,
  reward_memo text,
  reward_enabled boolean not null default false,
  status public.board_status not null default 'active',
  constraint boards_completed_at_requires_completed_status
    check (completed_at is null or status = 'completed')
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  push_token text,
  push_enabled boolean not null default false,
  push_enabled_updated_at timestamptz,
  push_permission_status text not null default 'undetermined'
    check (push_permission_status in ('undetermined', 'denied', 'granted')),
  push_permission_granted_at timestamptz,
  push_permission_updated_at timestamptz,
  platform text check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table public.sticker_daily (
  board_id uuid not null references public.boards(id) on delete cascade,
  d date not null,
  count integer not null default 0 check (count >= 0),
  primary key (board_id, d)
);

create table public.sticker_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  source public.sticker_source not null
);

-- Kept for the app's notification-settings reads and writes. No delivery job
-- or notification Edge Function is created by this bootstrap.
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  open_at timestamptz,
  type text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  board_id uuid references public.boards(id) on delete cascade,
  created_at timestamptz not null default now(),
  channel text not null default 'push',
  message_trigger text not null,
  message_body text,
  sent_local_date date,
  sent_local_time text,
  expo_ticket_ids text[],
  expo_ticket_token_map jsonb,
  expo_receipt_status text,
  expo_receipt_checked_at timestamptz,
  expo_error text
);

create table public.app_settings (
  id integer primary key default 1,
  latest_version text not null,
  min_version text not null,
  maintenance boolean not null default false,
  maintenance_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_single_row check (id = 1)
);

create unique index idx_devices_profile_device_unique
  on public.devices(profile_id, device_id);
create unique index idx_devices_push_token_unique on public.devices(push_token)
  where push_token is not null;
create index idx_devices_profile_id on public.devices(profile_id);
create index index_idx_sticker_daily_board_date on public.sticker_daily(board_id, d);
create index idx_sticker_logs_board_time on public.sticker_logs(board_id, created_at);
create index idx_notification_logs_expo_receipt_pending on public.notification_logs(created_at)
  where channel = 'push' and expo_ticket_ids is not null and expo_receipt_checked_at is null;
create unique index idx_notification_logs_push_once_per_time
  on public.notification_logs(profile_id, type, channel, message_trigger, sent_local_date, sent_local_time)
  where channel = 'push' and sent_local_date is not null and sent_local_time is not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.refresh_board_progress_for(p_board_id uuid)
returns void language plpgsql as $$
declare v_count integer;
begin
  select count(*)::integer into v_count from public.sticker_logs where board_id = p_board_id;
  update public.boards
  set current_count = v_count,
      status = case when v_count >= target_count then 'completed'::public.board_status else 'active'::public.board_status end,
      completed_at = case when v_count >= target_count then coalesce(completed_at, now()) else null end
  where id = p_board_id;
end;
$$;

create or replace function public.refresh_board_progress()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.board_id <> old.board_id then
    perform public.refresh_board_progress_for(old.board_id);
    perform public.refresh_board_progress_for(new.board_id);
  elsif tg_op = 'DELETE' then
    perform public.refresh_board_progress_for(old.board_id);
  else
    perform public.refresh_board_progress_for(new.board_id);
  end if;
  return null;
end;
$$;

create or replace function public.get_board_streak(p_board_id uuid)
returns json language plpgsql stable as $$
declare max_streak integer; current_streak integer; today_success boolean;
        today date := (now() at time zone 'Asia/Seoul')::date;
begin
  with ordered_days as (
    select d, d - (row_number() over (order by d))::integer as grp
    from public.sticker_daily where board_id = p_board_id and count > 0
  ), streaks as (select grp, count(*)::integer as streak_len from ordered_days group by grp)
  select coalesce(max(streak_len), 0) into max_streak from streaks;

  with ordered_days as (
    select d, d - (row_number() over (order by d))::integer as grp
    from public.sticker_daily where board_id = p_board_id and count > 0
  ), latest_day as (select max(d) as d from ordered_days)
  select case when latest_day.d is null or latest_day.d < today - 1 then 0
    when latest_day.d = today and not exists (
      select 1 from ordered_days where d = today - 1
    ) then 0 else (
    select count(*)::integer from ordered_days where grp = (
      select grp from ordered_days where d = latest_day.d limit 1
    )
  ) end into current_streak from latest_day;

  select exists (
    select 1 from public.sticker_daily where board_id = p_board_id and d = today and count > 0
  ) into today_success;
  return json_build_object('maxStreak', coalesce(max_streak, 0),
    'currentStreak', coalesce(current_streak, 0), 'todaySuccess', coalesce(today_success, false));
end;
$$;

create or replace function public.collect_sticker(
  p_board_id uuid, p_source public.sticker_source default 'app'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid; v_limit_count integer; v_target_count integer;
  v_board_current_count integer; v_current_count integer; v_status public.board_status;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select b.profile_id, b.limit_count, b.target_count, b.current_count, b.status
    into v_profile_id, v_limit_count, v_target_count, v_board_current_count, v_status
  from public.boards b join public.profiles p on p.id = b.profile_id
  where b.id = p_board_id and p.auth_user_id = auth.uid() for update of b;
  if not found then
    if exists (select 1 from public.boards where id = p_board_id) then
      return jsonb_build_object('success', false, 'reason', 'FORBIDDEN');
    end if;
    return jsonb_build_object('success', false, 'reason', 'BOARD_NOT_FOUND');
  end if;
  if v_status = 'completed'::public.board_status or v_board_current_count >= v_target_count then
    return jsonb_build_object('success', false, 'reason', 'BOARD_COMPLETED',
      'current_count', v_board_current_count, 'target_count', v_target_count, 'limit_count', v_limit_count);
  end if;
  insert into public.sticker_daily(board_id, d, count) values (p_board_id, v_today, 0)
    on conflict (board_id, d) do nothing;
  update public.sticker_daily set count = count + 1
    where board_id = p_board_id and d = v_today and count < v_limit_count
    returning count into v_current_count;
  if not found then
    select count into v_current_count from public.sticker_daily where board_id = p_board_id and d = v_today;
    return jsonb_build_object('success', false, 'reason', 'DAILY_LIMIT_EXCEEDED',
      'today_count', coalesce(v_current_count, v_limit_count), 'limit_count', v_limit_count);
  end if;
  insert into public.sticker_logs(board_id, profile_id, source) values (p_board_id, v_profile_id, p_source);
  return jsonb_build_object('success', true, 'today_count', v_current_count, 'limit_count', v_limit_count);
end;
$$;

create or replace function public.collect_sticker_app(board_id uuid)
returns jsonb language plpgsql as $$ begin return public.collect_sticker(board_id, 'app'); end; $$;

create or replace function public.collect_sticker_widget(board_id uuid)
returns jsonb language plpgsql as $$ begin return public.collect_sticker(board_id, 'widget'); end; $$;

create or replace function public.get_boards_with_stats()
returns table (
  id uuid, created_at timestamptz, completed_at timestamptz, title text, emoji text,
  target_count integer, limit_count integer, current_count integer, reward_memo text,
  status public.board_status, latest_sticker_collected_at timestamptz,
  today_sticker_count integer, current_streak integer, max_streak integer,
  today_success boolean, home_sort_rank integer
) language sql stable as $$
  select b.id, b.created_at,
    case when b.status = 'completed'::public.board_status then b.completed_at else null end,
    b.title, b.emoji, b.target_count, b.limit_count, b.current_count, b.reward_memo, b.status,
    latest.latest_sticker_collected_at, coalesce(today.count, 0)::integer,
    coalesce((streak.stats ->> 'currentStreak')::integer, 0),
    coalesce((streak.stats ->> 'maxStreak')::integer, 0),
    coalesce((streak.stats ->> 'todaySuccess')::boolean, false),
    case when b.status = 'completed'::public.board_status then 2
         when coalesce(today.count, 0) >= b.limit_count then 1 else 0 end
  from public.boards b
  left join lateral (
    select max(sl.created_at) as latest_sticker_collected_at from public.sticker_logs sl where sl.board_id = b.id
  ) latest on true
  left join public.sticker_daily today on today.board_id = b.id and today.d = (now() at time zone 'Asia/Seoul')::date
  left join lateral public.get_board_streak(b.id) as streak(stats) on true;
$$;

create or replace function public.create_board_with_active_limit(
  p_profile_id uuid, p_title text, p_emoji text, p_target_count integer,
  p_reward_memo text, p_limit_count integer
) returns public.boards language plpgsql security definer set search_path = public as $$
declare created_board public.boards;
begin
  perform 1 from public.profiles where id = p_profile_id and auth_user_id = auth.uid() for update;
  if not found then raise exception 'profile_id is not owned by current user' using errcode = '42501'; end if;
  if (select count(*) from public.boards where profile_id = p_profile_id and status = 'active'::public.board_status) >= 3 then
    raise exception 'ACTIVE_BOARD_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  insert into public.boards(profile_id, title, emoji, target_count, reward_memo, limit_count)
  values (p_profile_id, p_title, p_emoji, p_target_count, p_reward_memo, p_limit_count)
  returning * into created_board;
  return created_board;
end;
$$;

create or replace function public.claim_device_push_token(
  p_profile_id uuid, p_device_id text, p_push_token text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_push_token is null or length(p_push_token) = 0 then return; end if;
  if not exists (
    select 1 from public.devices d join public.profiles p on p.id = d.profile_id
    where d.profile_id = p_profile_id and d.device_id = p_device_id and p.auth_user_id = auth.uid()
  ) then raise exception 'profile_id and device_id are not owned by current user' using errcode = '42501'; end if;
  update public.devices set push_token = null
  where push_token = p_push_token and not (profile_id = p_profile_id and device_id = p_device_id);
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger boards_set_updated_at before update on public.boards
  for each row execute function public.set_updated_at();
create trigger devices_set_updated_at before update on public.devices
  for each row execute function public.set_updated_at();
create trigger sticker_logs_set_updated_at before update on public.sticker_logs
  for each row execute function public.set_updated_at();
create trigger sticker_logs_refresh_board after insert or delete or update on public.sticker_logs
  for each row execute function public.refresh_board_progress();

alter table public.app_settings enable row level security;
alter table public.boards enable row level security;
alter table public.devices enable row level security;
alter table public.notification_logs enable row level security;
alter table public.profiles enable row level security;
alter table public.sticker_daily enable row level security;
alter table public.sticker_logs enable row level security;

create policy "public can read app settings" on public.app_settings for select to anon, authenticated using (true);
create policy "profiles select" on public.profiles for select to authenticated using (auth_user_id = auth.uid());
create policy "profiles insert" on public.profiles for insert to authenticated with check (auth_user_id = auth.uid());
create policy "profiles update" on public.profiles for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "profiles delete" on public.profiles for delete to authenticated using (auth_user_id = auth.uid());

create policy "boards select" on public.boards for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = boards.profile_id and p.auth_user_id = auth.uid())
);
create policy "boards insert" on public.boards for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = boards.profile_id and p.auth_user_id = auth.uid())
);
create policy "boards update" on public.boards for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = boards.profile_id and p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from public.profiles p where p.id = boards.profile_id and p.auth_user_id = auth.uid())
);
create policy "boards delete" on public.boards for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = boards.profile_id and p.auth_user_id = auth.uid())
);

create policy "devices select" on public.devices for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = devices.profile_id and p.auth_user_id = auth.uid())
);
create policy "devices insert" on public.devices for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = devices.profile_id and p.auth_user_id = auth.uid())
);
create policy "devices update" on public.devices for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = devices.profile_id and p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from public.profiles p where p.id = devices.profile_id and p.auth_user_id = auth.uid())
);
create policy "devices delete" on public.devices for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = devices.profile_id and p.auth_user_id = auth.uid())
);

create policy "select own sticker_daily" on public.sticker_daily for select using (
  exists (select 1 from public.boards b join public.profiles p on p.id = b.profile_id
    where b.id = sticker_daily.board_id and p.auth_user_id = auth.uid())
);
create policy "no direct insert" on public.sticker_daily for insert with check (false);
create policy "no direct update" on public.sticker_daily for update using (false) with check (false);

create policy "sticker_logs select" on public.sticker_logs for select to authenticated using (
  exists (select 1 from public.boards b join public.profiles p on p.id = b.profile_id
    where b.id = sticker_logs.board_id and b.profile_id = sticker_logs.profile_id and p.auth_user_id = auth.uid())
);
create policy "sticker_logs insert" on public.sticker_logs for insert to authenticated with check (false);
create policy "sticker_logs update" on public.sticker_logs for update to authenticated using (
  exists (select 1 from public.boards b join public.profiles p on p.id = b.profile_id
    where b.id = sticker_logs.board_id and b.profile_id = sticker_logs.profile_id and p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from public.boards b join public.profiles p on p.id = b.profile_id
    where b.id = sticker_logs.board_id and b.profile_id = sticker_logs.profile_id and p.auth_user_id = auth.uid())
);
create policy "sticker_logs delete" on public.sticker_logs for delete to authenticated using (
  exists (select 1 from public.boards b join public.profiles p on p.id = b.profile_id
    where b.id = sticker_logs.board_id and b.profile_id = sticker_logs.profile_id and p.auth_user_id = auth.uid())
);

create policy "notification_logs select" on public.notification_logs for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = notification_logs.profile_id and p.auth_user_id = auth.uid())
);
create policy "notification_logs insert" on public.notification_logs for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = notification_logs.profile_id and p.auth_user_id = auth.uid())
);
create policy "notification_logs update" on public.notification_logs for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = notification_logs.profile_id and p.auth_user_id = auth.uid())
) with check (
  exists (select 1 from public.profiles p where p.id = notification_logs.profile_id and p.auth_user_id = auth.uid())
);
create policy "notification_logs delete" on public.notification_logs for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = notification_logs.profile_id and p.auth_user_id = auth.uid())
);

grant usage on schema public to anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.boards, public.devices, public.notification_logs, public.sticker_daily, public.sticker_logs to authenticated;
revoke all on function public.collect_sticker(uuid, public.sticker_source) from public;
revoke all on function public.collect_sticker_app(uuid) from public;
revoke all on function public.collect_sticker_widget(uuid) from public;
revoke all on function public.get_board_streak(uuid) from public;
revoke all on function public.get_boards_with_stats() from public;
revoke all on function public.create_board_with_active_limit(uuid, text, text, integer, text, integer) from public;
revoke all on function public.claim_device_push_token(uuid, text, text) from public;
grant execute on function public.collect_sticker(uuid, public.sticker_source) to authenticated;
grant execute on function public.collect_sticker_app(uuid) to authenticated;
grant execute on function public.collect_sticker_widget(uuid) to authenticated;
grant execute on function public.get_board_streak(uuid) to authenticated;
grant execute on function public.get_boards_with_stats() to authenticated;
grant execute on function public.create_board_with_active_limit(uuid, text, text, integer, text, integer) to authenticated;
grant execute on function public.claim_device_push_token(uuid, text, text) to authenticated;

-- This row prevents the version check from treating a fresh QA database as an
-- error. Update it when the QA binary version policy changes.
insert into public.app_settings(id, latest_version, min_version, maintenance)
values (1, '1.0.0', '1.0.0', false);
