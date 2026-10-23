-- 트리거 함수를 REST API(/rest/v1/rpc/...)로 부를 수 없게 한다.
-- 트리거가 돌 때는 EXECUTE 권한을 보지 않으므로 글쓰기 제한과 수정 시각 기록은 그대로 동작한다.
revoke execute on function public.posts_limit_rate() from public, anon, authenticated;
revoke execute on function public.posts_touch() from public, anon, authenticated;
