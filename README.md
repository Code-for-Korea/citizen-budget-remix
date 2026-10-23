# citizen-budget-remix

**사이트: <https://peace-code.github.io/citizen-budget-remix/>**

**모두의 AI 예산 심의** — 국회가 심사하는 AI 예산, 시민도 직접 나눠 보고 따져 봅니다.

시민이 공공 예산 항목의 설명을 읽고, 직접 금액을 조절해 보고, 자기가 짠 예산을 링크로 공유하는 정적 웹사이트입니다. 첫 캠페인은 과학기술정보통신부의 2027년 AI 예산 정부안입니다.

## 특징

- **링크로 공유**: 조절한 예산은 공유 링크 주소 안에 담깁니다. 예산을 짜고 나누는 데는 서버가 필요 없습니다.
- **시민 심의 게시판**: 예산에 대한 의문(GitHub의 이슈처럼)과 예산 구성안(풀 리퀘스트처럼)을 남기면 목록에 쌓입니다. 글은 [Supabase](https://supabase.com)에 저장하며, 로그인 없이 익명 세션으로 씁니다. 이메일 같은 개인정보는 받지 않습니다.
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
- 분야(중분류)마다 슬라이더로 정부안 대비 0~500%를 조절합니다. 합계와 정부안과의 차이가 위에 표시됩니다.
- 「설명과 세부사업」을 펼치면 분야 설명과 그 분야에 속한 세부사업별 금액을 볼 수 있습니다.
- 정부 분류에 없는 「민주적 AI 거버넌스」 칸은 정부안이 0원이며, 0원~1조 원 사이에서 금액을 직접 정합니다. 펼치면 거버넌스에 가까운 기존 사업(다른 분야에 이미 포함된 것)을 볼 수 있습니다.
- 「구성안 내기」를 누르면 지금 짠 예산이 제목·설명과 함께 게시판의 구성안 목록에 올라갑니다. 다른 사람의 구성안은 「이 구성안 불러오기」로 내 화면에 불러와 고친 뒤 새 구성안으로 낼 수 있습니다.
- 「의문 남기기」로 예산 전체나 특정 분야에 대한 의문을 남깁니다. 분야 카드를 펼쳐 「이 분야에 의문 남기기」를 누르면 그 분야가 미리 골라집니다.
- 내가 쓴 글은 같은 브라우저에서만 고치거나 지울 수 있습니다. 브라우저의 사이트 데이터를 지우면 이 권한이 사라집니다.
- 「링크 복사」를 누르면 조절한 값이 담긴 주소(`#c=분야id:값,...`)가 복사됩니다. 값은 정부 분류 칸은 퍼센트, 정부안에 없는 칸은 억 원 단위입니다. 이 링크를 열면 같은 예산이 그대로 보입니다.

## 구조

```text
index.html                      진입 페이지
src/main.js                     예산 조절 화면
src/board.js                    시민 심의 게시판 (Supabase REST API)
src/config.js                   Supabase 프로젝트 주소와 공개 키
src/style.css                   스타일
supabase/migrations/            게시판 DB 스키마와 권한 규칙(SQL)
campaigns/ai-2027/budget.json   2027년 AI 예산 데이터 (변환 스크립트가 만든다)
campaigns/ai-2027/descriptions.json  출처·분류 설명 (사람이 쓴다)
scripts/xlsx_to_json.py         원자료 엑셀을 budget.json으로 변환
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

권한 규칙은 SQL에 있습니다. 누구나 목록(`posts_public` 뷰)을 읽고, 익명 세션을 포함해 로그인한 사람만 글을 씁니다. 자기 글만 고치고 지울 수 있으며, 작성자 id는 공개하지 않습니다. 같은 세션은 10분에 5개까지 쓸 수 있습니다.

부적절한 글은 Table Editor에서 `posts` 표의 `hidden`을 `true`로 바꾸면 목록에서 사라집니다. 스팸이 늘면 Authentication의 익명 가입 횟수 제한을 낮추거나 CAPTCHA를 켜는 것을 고려하세요.

로컬에서 시험하려면 Docker와 Supabase CLI로 `supabase start`를 실행하고, 출력된 `API_URL`과 publishable 키를 `src/config.js`에 잠시 넣습니다(커밋하지 마세요). `supabase/config.toml`은 로컬 스택 설정이며 익명 로그인이 켜져 있습니다.

## 배포

저장소 루트를 그대로 GitHub Pages 같은 정적 호스팅에 올리면 됩니다.

## 라이선스

MIT License, see [LICENSE](LICENSE).
