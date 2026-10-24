-- 글 종류에서 의견(opinion)을 뺀다. 질문(question)·제안(proposal)·시민 예산안(budget)만 남긴다.
-- 운영 DB에 의견 글이 없을 때 적용했다. 혹시 남아 있으면 질문으로 옮긴다.

update public.posts set kind = 'question' where kind = 'opinion';

alter table public.posts drop constraint posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind in ('question', 'proposal', 'budget'));
