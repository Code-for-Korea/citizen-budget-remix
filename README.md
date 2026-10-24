# citizen-budget-remix

**사이트: <https://budget.codefor.kr/>**

**모두의 AI 예산 심의** — 국회가 심사하는 AI 예산, 시민도 직접 나눠 보고 따져 봅니다.

시민이 공공 예산 항목의 설명을 읽고, 직접 금액을 조절해 보고, 자기가 짠 예산을 링크로 공유하는 정적 웹사이트입니다. 첫 캠페인은 과학기술정보통신부의 2027년 AI 예산 정부안입니다.

## 특징

- **링크로 공유**: 조절한 예산은 공유 링크 주소 안에 담깁니다. 예산을 짜고 나누는 데는 서버가 필요 없습니다.
- **시민 예산안과 심의**: 내가 짠 예산을 시민 예산안으로 내고, 예산안 전체·대분류·분야마다 질문·제안을 남깁니다. 제안은 대분류나 분야 하나를 얼마나 늘리거나 줄이자는 글입니다. 글은 [Supabase](https://supabase.com)에 저장하며, 로그인 없이 익명 세션으로 씁니다. 이메일 같은 개인정보는 받지 않습니다.
- **빌드 없음**: HTML·CSS·JavaScript(ES 모듈)만 씁니다. 설치할 의존성이 없습니다. Supabase도 SDK 없이 REST API를 직접 부릅니다.
- **캠페인 단위 확장**: `campaigns/` 아래에 예산 항목 데이터 폴더를 추가하면 다른 예산도 같은 화면으로 다룰 수 있습니다.

## 실행

정적 파일 서버만 있으면 됩니다. ES 모듈을 쓰기 때문에 `index.html`을 파일로 바로 열지 말고 서버로 띄우세요.

Node.js가 있으면:

```bash
npx serve -l 8000 .
```

Python이 있으면:

```bash
python3 -m http.server 8000
```

Ruby가 있으면(Ruby 3.0부터는 webrick을 따로 설치해야 합니다):

```bash
gem install webrick
ruby -run -e httpd . -p 8000
```

그다음 브라우저에서 <http://localhost:8000> 을 엽니다.

## 사용법

- 맨 위 칸 그림은 정부안 전체를 100억 원짜리 칸으로 나눠 분야 색으로 칠한 것입니다. 칸에 마우스를 올리거나 누르면 분야와 금액이 보입니다.
- 분야(중분류)마다 크게 감액(−50%)·감액(−20%)·유지·증액(+20%)·크게 증액(+50%) 가운데 하나를 고릅니다. 맨 위에 2026년 예산, 2027년 정부안(전년 대비 증감), 내 예산(정부안과의 차이)이 표시됩니다. 분야 카드와 대분류에도 2026년 예산 대비 정부안의 증감이 나옵니다.
- 분야 카드에는 분야 설명이 늘 보이고, 「세부사업 N개」를 펼치면 그 분야에 속한 세부사업별 금액을 볼 수 있습니다.
- 정부 분류에 없는 「민주주의·공공재 AI」 칸은 정부안이 0원이며, 0원·1,000억·2,500억·5,000억·1조 원 가운데 금액을 고릅니다. 펼치면 이 칸에 가까운 기존 사업(다른 분야에 이미 포함된 것)을 볼 수 있습니다.
- 「시민 예산안 내기」를 누르면 지금 짠 예산이 제목·설명과 함께 시민 예산안 목록에 올라갑니다. 다른 사람의 시민 예산안은 「이 시민 예산안 불러오기」로 내 화면에 불러와 고친 뒤 새 시민 예산안으로 낼 수 있습니다. 분야 카드에는 시민 예산안들이 그 분야를 증액·유지·감액 가운데 무엇으로 골랐는지 개수가 나옵니다.
- 질문·제안은 예산안 전체, 대분류, 분야(중분류)마다 남길 수 있습니다. 대분류 제목 옆과 분야 카드 아래의 「질문·제안 남기기」로 쓰고, 오른쪽 끝의 「N개」를 누르면 그 대상의 글이 모달로 열립니다(종류별 탭). 대분류의 목록에는 그 아래 분야의 글도 함께 나옵니다.
- 제안은 대상과 다섯 단계 가운데 하나를 고릅니다. 대분류 제안은 그 아래 분야 모두에 같은 단계를 적습니다. 제안을 열어 「내 예산안에 반영」을 누르면 그 값이 내 예산에 덮어씌워집니다.
- 상단 메뉴는 「예산안 짜기」(홈)·「시민 예산안」·「시민 심의」입니다. 홈에는 최근 글이 5개씩만 보이고, 두 페이지에서 글 전체를 봅니다. 시민 심의 페이지에서는 종류와 대상으로 거를 수 있습니다.
- 내가 쓴 글은 같은 브라우저에서만 고치거나 지울 수 있습니다. 브라우저의 사이트 데이터를 지우면 이 권한이 사라집니다.
- 「링크 복사」를 누르면 조절한 값이 담긴 주소(`#c=분야id:값,...`)가 복사됩니다. 값은 정부 분류 칸은 퍼센트, 정부안에 없는 칸은 억 원 단위입니다. 이 링크를 열면 같은 예산이 그대로 보입니다.

## 구조

```text
index.html                      홈: 예산 조절 화면과 최근 글
budgets/index.html              시민 예산안 페이지
deliberation/index.html         시민 심의(질문·제안) 페이지
src/main.js                     홈의 예산 조절 화면
src/budget.js                   예산 자료 읽기와 조절 값 계산 (홈과 게시판 페이지가 함께 씀)
src/posts.js                    시민 예산안·심의 페이지
src/board.js                    게시판: 글 목록, 글쓰기 창, 질문·제안 모달 (Supabase REST API)
src/config.js                   Supabase 프로젝트 주소와 공개 키
src/style.css                   스타일
supabase/migrations/            게시판 DB 스키마와 권한 규칙(SQL)
campaigns/ai-2027/budget.json   2027년 AI 예산 데이터 (변환 스크립트가 만든다)
campaigns/ai-2027/descriptions.json  출처·분류 설명 (사람이 쓴다)
scripts/xlsx_to_json.py         원자료 엑셀을 budget.json으로 변환
scripts/bump_version.py         배포 전에 CSS·JS·JSON 주소의 버전 번호(?v=)를 한꺼번에 바꿈
```

## 데이터 갱신

원자료는 과학기술정보통신부가 국회의원실 자료요구에 제출한 「AI 예산 현황」 엑셀입니다. 원자료 파일은 저장소에 넣지 않습니다. 설명을 고치거나 원자료가 바뀌면 다시 변환합니다(표준 라이브러리만 씁니다).

```bash
python3 scripts/xlsx_to_json.py <원자료.xlsx> campaigns/ai-2027/budget.json
```

## 게시판 설정 (Supabase)

`src/config.js`가 비어 있으면 게시판은 「준비 중」으로 보이고 나머지 화면은 그대로 동작합니다. 게시판을 켜려면 다음과 같이 합니다.

1. [Supabase](https://supabase.com)에서 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/migrations/` 아래 SQL 파일을 순서대로 실행합니다. [Supabase CLI](https://supabase.com/docs/guides/cli)를 쓰면 `supabase link` 뒤 `supabase db push`로 적용할 수 있습니다.
3. Authentication → Sign In / Providers에서 「Allow anonymous sign-ins」를 켭니다.
4. Project Settings → API Keys에서 publishable 키(예전 프로젝트는 anon 키)를 복사해, 프로젝트 주소와 함께 `src/config.js`에 넣습니다. 이 키는 공개해도 되는 키입니다. secret(service_role) 키는 절대 넣지 마세요.

운영 중인 프로젝트는 `citizen-budget`(peacecode 조직)이며 주소와 키가 `src/config.js`에 들어 있습니다.

권한 규칙은 SQL에 있습니다. 누구나 목록(`posts_public` 뷰)을 읽고, 익명 세션을 포함해 로그인한 사람만 글을 씁니다. 자기 글만 고치고 지울 수 있으며, 작성자 id는 공개하지 않습니다. 같은 세션은 10분에 5개까지 쓸 수 있습니다.

Supabase의 보안 점검(Advisors)은 `posts_public`을 「Security Definer View」로 표시합니다. 작성자 id를 읽을 권한 없이 내 글인지(`mine`)를 계산하려고 일부러 그렇게 만든 뷰이며, 숨긴 글은 뷰 안에서 직접 뺍니다.

부적절한 글은 Table Editor에서 `posts` 표의 `hidden`을 `true`로 바꾸면 목록에서 사라집니다. 스팸이 늘면 Authentication의 익명 가입 횟수 제한을 낮추거나 CAPTCHA를 켜는 것을 고려하세요.

로컬에서 시험하려면 Docker와 Supabase CLI로 `supabase start`를 실행하고, 출력된 `API_URL`과 publishable 키를 `src/config.js`에 잠시 넣습니다(커밋하지 마세요). `supabase/config.toml`은 로컬 스택 설정이며 익명 로그인이 켜져 있습니다.

## 배포

저장소 루트를 그대로 GitHub Pages 같은 정적 호스팅에 올리면 됩니다.

CSS·JS·JSON을 고친 커밋을 올리기 전에는 버전 번호를 바꿉니다.

```bash
python3 scripts/bump_version.py
```

GitHub Pages는 파일을 브라우저에 10분 동안 캐시하게 해서, 배포 직후에는 새 HTML과 예전 CSS·JS가 섞여 화면이 깨질 수 있습니다. 이 스크립트는 HTML과 JS가 부르는 파일 주소의 `?v=` 번호를 모두 지금 시각으로 바꿔, HTML이 늘 한 벌의 파일을 가리키게 합니다. 같은 모듈을 서로 다른 번호로 부르면 두 번 읽혀 따로 동작하므로 번호는 손으로 고치지 마세요. `python3 scripts/bump_version.py --check`는 모든 주소의 번호가 같은지 확인만 합니다.

사이트 주소는 `budget.codefor.kr`이며 루트의 `CNAME` 파일에 적혀 있습니다. 이 주소가 동작하려면 codefor.kr의 DNS에 다음 레코드가 있어야 합니다.

| 이름 | 종류 | 값 |
| --- | --- | --- |
| `budget` | CNAME | `code-for-korea.github.io` |

레코드가 퍼진 뒤 저장소 Settings → Pages에서 사용자 도메인이 `budget.codefor.kr`로 잡혔는지 확인하고 「Enforce HTTPS」를 켭니다. 다른 계정이 이 하위 도메인을 가져가지 못하도록 Code-for-Korea 조직의 Settings → Pages → Verified domains에서 `codefor.kr`을 확인해 두는 것을 권합니다.

## 만든 사람

권오현(Ohyeon Kweon, [github.com/rest515](https://github.com/rest515))이 만들었습니다. 제안이나 고칠 점은 이 저장소의 이슈로 남겨 주세요.

## 라이선스

MIT License, see [LICENSE](LICENSE).
