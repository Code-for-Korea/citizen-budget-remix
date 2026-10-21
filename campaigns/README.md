# campaigns

캠페인마다 폴더 하나를 두고, 그 안에 예산 데이터와 설명을 넣습니다.

- `budget.json`: 화면이 읽는 데이터. 조절 단위인 중분류(`categories`)마다 공유 링크용 `id`, 대분류(`group`), 연도별 금액(`amounts`), 설명(`description`), 세부사업 목록(`items`)을 담습니다. 금액 단위는 `unit`을 따릅니다.
- `descriptions.json`: 출처, 대분류·중분류 설명. 사람이 직접 고치는 파일입니다.

중분류 `id`는 공유 링크에 들어가므로 한번 정하면 바꾸지 않습니다.
