-- 시민 심의 게시판: 시민이 남기는 의문(question)과 예산 구성안(proposal).
-- 읽기는 누구나 posts_public 뷰로 하고, 쓰기는 익명 세션을 포함해 로그인한 사람만 posts 표에 한다.
-- 자기 글만 고치고 지운다. 관리자는 대시보드에서 hidden을 켜서 글을 숨긴다.

create table public.posts (
  id bigint generated always as identity primary key,
  campaign text not null check (char_length(campaign) between 1 and 40),
  kind text not null check (kind in ('question', 'proposal')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null default '' check (char_length(body) <= 4000),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 30),
  -- 의문이 가리키는 분야(budget.json의 categories[].id). 없으면 예산 전체에 대한 의문이다.
  category_id text check (char_length(category_id) <= 40),
  -- 구성안의 조절 값. 공유 링크의 해시와 같은 형식(c=id:값,...)이다.
  budget text check (char_length(budget) <= 2000),
  -- 익명 사용자를 정리해도 글은 남도록 작성자만 비운다.
  author_id uuid default auth.uid() references auth.users on delete set null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_has_budget check (kind <> 'proposal' or coalesce(char_length(budget), 0) >= 3)
);

create index posts_list on public.posts (campaign, kind, created_at desc);
create index posts_author on public.posts (author_id, created_at desc);

alter table public.posts enable row level security;

-- 글을 쓰고 고칠 때 돌려받는 행과 고칠 행을 찾는 데 쓴다. 목록은 posts_public 뷰로 읽는다.
create policy "숨기지 않은 글은 읽는다" on public.posts
  for select to authenticated
  using (not hidden);

create policy "로그인한 사람은 자기 이름으로 쓴다" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()));

create policy "자기 글만 고친다" on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "자기 글만 지운다" on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- 작성자 id는 공개하지 않는다. hidden·작성자·시각은 사용자가 직접 넣거나 바꾸지 못한다.
revoke all on public.posts from anon, authenticated;
grant select (id, campaign, kind, title, body, author_name, category_id, budget, created_at, updated_at)
  on public.posts to authenticated;
grant insert (campaign, kind, title, body, author_name, category_id, budget)
  on public.posts to authenticated;
grant update (title, body, author_name, category_id, budget)
  on public.posts to authenticated;
grant delete on public.posts to authenticated;

-- 공개 목록. 작성자 id 대신 지금 세션이 쓴 글인지(mine)만 알려 준다.
-- 작성자 id를 읽는 권한 없이 mine을 계산해야 해서 뷰 소유자 권한으로 돈다(security_invoker = false).
-- 그래서 posts의 RLS를 거치지 않으므로 숨긴 글은 여기서 직접 뺀다.
create view public.posts_public with (security_invoker = false) as
  select id, campaign, kind, title, body, author_name, category_id, budget, created_at, updated_at,
    coalesce(author_id = (select auth.uid()), false) as mine
  from public.posts
  where not hidden;

revoke all on public.posts_public from anon, authenticated;
grant select on public.posts_public to anon, authenticated;

-- 같은 작성자는 10분에 5개까지만 쓴다. 숨긴 글도 센다.
create function public.posts_limit_rate() returns trigger
  language plpgsql security definer
  set search_path = ''
  as $$
begin
  if (select count(*) from public.posts
      where author_id = new.author_id and created_at > now() - interval '10 minutes') >= 5 then
    raise exception '글은 10분에 5개까지 남길 수 있습니다. 잠시 뒤에 다시 해 주세요.';
  end if;
  return new;
end
$$;

create trigger posts_limit_rate before insert on public.posts
  for each row execute function public.posts_limit_rate();

create function public.posts_touch() returns trigger
  language plpgsql
  set search_path = ''
  as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger posts_touch before update on public.posts
  for each row execute function public.posts_touch();
