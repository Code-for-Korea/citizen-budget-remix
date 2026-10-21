# citizen-budget-remix

시민이 공공 예산 항목의 설명을 읽고, 직접 금액을 조절해 보고, 자기가 짠 예산을 링크로 공유하는 정적 웹사이트입니다. 첫 캠페인은 과학기술정보통신부가 공개한 AI 예산을 다루는 「모두의 AI 예산」입니다.

## 특징

- **서버 없음**: 조절한 예산은 공유 링크 주소 안에 담깁니다. 결과나 개인정보를 저장하는 서버·데이터베이스가 없습니다.
- **빌드 없음**: HTML·CSS·JavaScript(ES 모듈)만 씁니다. 설치할 의존성이 없습니다.
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

그다음 브라우저에서 <http://localhost:8000> 을 엽니다.

## 구조

```text
index.html        진입 페이지
src/              화면 동작(JavaScript)과 스타일(CSS)
campaigns/        캠페인별 예산 항목 데이터
```

## 배포

저장소 루트를 그대로 GitHub Pages 같은 정적 호스팅에 올리면 됩니다.

## 라이선스

MIT License, see [LICENSE](LICENSE).
