# 모리의 여행플래너 v2.0 — 원본 소스 백업

이 폴더는 GitHub Pages에 배포된 `npm run build` 결과물이 아니라,
**사람이 수정 가능한 원본 소스코드**입니다.

## 사용법
```bash
npm install
npm run build
```
빌드 결과물(`build/` 폴더)을 배포용 저장소(`travel-app` main 브랜치)에 덮어쓰기 후 git push.

## 주의
- 이 브랜치(`source`)는 배포되지 않습니다. main 브랜치만 GitHub Pages가 서빙합니다.
- 이후 작업은 항상 이 브랜치의 `src/App.jsx`를 기준으로 진행하세요 (추정 재구성 금지).
