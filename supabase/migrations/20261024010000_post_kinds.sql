-- 글 종류를 넷으로 나눈다: 질문(question)·의견(opinion)·제안(proposal)·시민 예산안(budget).
-- 제안은 대분류나 분야 하나를 얼마나 늘리거나 줄일지, 시민 예산안은 모든 분야를 조절한 묶음이다.
-- 둘 다 조절 값(budget, c=id:값,...)이 있어야 하고, 제안은 대상(category_id: 'group:이름' 또는 분야 id)도 있어야 한다.
-- 이전에는 의견을 question, 시민 예산안을 proposal로 저장했으므로 그 뜻에 맞게 옮긴다.

alter table public.posts drop constraint posts_kind_check;
alter table public.posts drop constraint proposal_has_budget;

update public.posts
  set kind = case kind when 'question' then 'opinion' when 'proposal' then 'budget' end
  where kind in ('question', 'proposal');

alter table public.posts add constraint posts_kind_check
  check (kind in ('question', 'opinion', 'proposal', 'budget'));
alter table public.posts add constraint budget_kinds_have_budget
  check (kind not in ('proposal', 'budget') or coalesce(char_length(budget), 0) >= 3);
alter table public.posts add constraint proposal_has_target
  check (kind <> 'proposal' or coalesce(char_length(category_id), 0) >= 1);
