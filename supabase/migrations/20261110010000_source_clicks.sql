-- 세부사업 표의 「열린재정 사업설명자료」 링크를 시민이 열어 본 횟수.
-- 누가 눌렀는지는 남기지 않고 캠페인·사업 ID별 횟수만 센다. 로그인 없이 세므로 부풀리기를 완전히 막지는 못한다.
-- 그래서 화면에서는 찬성이나 중요도가 아니라 '열어 본 횟수'로만 쓴다.
-- 읽기는 누구나 한다. 직접 쓰거나 고칠 수는 없고 count_source_click()으로 1씩만 올린다.

create table public.source_clicks (
  campaign text not null check (campaign ~ '^[a-z0-9-]{1,40}$'),
  -- 열린재정 사업 ID(회계연도+소관+회계+계정+부문+단위사업+세부사업 코드, 22자리). budget.json 세부사업의 id.
  item_id text not null check (item_id ~ '^[0-9A-Z]{22}$'),
  clicks bigint not null default 0 check (clicks >= 0),
  updated_at timestamptz not null default now(),
  primary key (campaign, item_id)
);

alter table public.source_clicks enable row level security;

create policy "열어 본 횟수는 누구나 읽는다" on public.source_clicks
  for select to anon, authenticated
  using (true);

revoke all on public.source_clicks from anon, authenticated;
grant select (campaign, item_id, clicks) on public.source_clicks to anon, authenticated;

-- 한 번 누를 때 1을 올리고 새 횟수를 돌려준다. 함수 소유자 권한으로 돌아 RLS를 거치지 않으므로
-- 캠페인 이름과 사업 ID의 형식을 여기서도 확인한다(표의 check 제약과 같다).
create function public.count_source_click(p_campaign text, p_item_id text) returns bigint
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  total bigint;
begin
  if p_campaign !~ '^[a-z0-9-]{1,40}$' or p_item_id !~ '^[0-9A-Z]{22}$' then
    raise exception '캠페인 이름이나 사업 ID 형식이 맞지 않습니다.';
  end if;
  insert into public.source_clicks as s (campaign, item_id, clicks)
    values (p_campaign, p_item_id, 1)
    on conflict (campaign, item_id)
    do update set clicks = s.clicks + 1, updated_at = now()
    returning s.clicks into total;
  return total;
end
$$;

revoke execute on function public.count_source_click(text, text) from public;
grant execute on function public.count_source_click(text, text) to anon, authenticated;
