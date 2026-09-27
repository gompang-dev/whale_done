create table sticker_daily (
    board_id uuid not null references boards(id) on delete cascade,
    d date not null,
    count int not null default 0 check (count >= 0),

    primary key(board_id, d)
);

create index index_idx_sticker_daily_board_date
on sticker_daily (board_id, d);

create or replace function get_board_streak(p_board_id uuid)
returns json as $$
declare
  max_streak int;
  current_streak int;
  today_success boolean;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  with ordered_days as (
    select
      d,
      d - (row_number() over (order by d))::int as grp
    from sticker_daily
    where board_id = p_board_id
      and count > 0
  ),

  streaks as (
    select
      grp,
      count(*)::int as streak_len
    from ordered_days
    group by grp
  )

  select coalesce(max(streak_len), 0)
  into max_streak
  from streaks;

  with ordered_days as (
    select
      d,
      d - (row_number() over (order by d))::int as grp
    from sticker_daily
    where board_id = p_board_id
      and count > 0
  ),

  latest_day as (
    select max(d) as d
    from ordered_days
  )

  select
    case
      when latest_day.d is null then 0
      when latest_day.d < today - 1 then 0
      when latest_day.d = today and not exists (
        select 1 from ordered_days where d = today - 1
      ) then 0
      else (
        select count(*)::int
        from ordered_days
        where grp = (
          select grp
          from ordered_days
          where d = latest_day.d
          limit 1
        )
      )
    end
  into current_streak
  from latest_day;

  select exists (
    select 1
    from sticker_daily
    where board_id = p_board_id
      and d = today
      and count > 0
  ) into today_success;

  return json_build_object(
    'maxStreak', coalesce(max_streak, 0),
    'currentStreak', coalesce(current_streak, 0),
    'todaySuccess', coalesce(today_success, false)
  );
end;
$$ language plpgsql stable;
