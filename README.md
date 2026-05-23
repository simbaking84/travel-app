# 여행 플래너 앱

모바일·PC 겸용 여행 관리 웹앱입니다.

- **앱 URL**: https://moriaty84.github.io/travel-app
- **Google 계정**: moriaty84@gmail.com

---

## GitHub Pages 배포 방법

```bash
# 1. GitHub에 새 저장소 생성: travel-app
git init
git add .
git commit -m "init: 여행 플래너 앱"
git remote add origin https://github.com/moriaty84/travel-app.git
git push -u origin main

# 2. 저장소 Settings → Pages → Branch: main → Save
# 3. 배포 URL: https://moriaty84.github.io/travel-app
```

**이후 업데이트 시**
```bash
git add .
git commit -m "update"
git push
```
→ 자동으로 재배포됩니다.

---

## 모바일 홈화면 추가 (앱처럼 사용)

- **iOS**: Safari에서 접속 → 공유 버튼 → 홈 화면에 추가
- **Android**: Chrome에서 접속 → 메뉴 → 홈 화면에 추가

---

## 데이터 저장 방식

| 사용자 | 방식 | 설명 |
|---|---|---|
| **본인** | 구글 드라이브 연동 | 앱 하단 "드라이브 연동" 버튼 → 구글 로그인 → 기기 간 자동 동기화 |
| **지인** | localStorage 자동저장 | 버튼 무시하고 사용 → 브라우저에 자동저장, 오프라인 사용 가능 |

드라이브 저장 파일명: `travel_planner_data.json` (내 드라이브에 자동 생성)

---

## 일정 CSV 양식

엑셀에서 아래 형식으로 작성 후 **다른 이름으로 저장 → CSV UTF-8** 선택

| day | time | title | note |
|-----|------|-------|------|
| 0 | morning | 공항 도착 | 리무진 버스 50분 |
| 0 | afternoon | 도톤보리 산책 | 다코야키 탐방 |
| 0 | evening | 이치란 라멘 | 난바점, 웨이팅 있을 수 있음 |
| 1 | morning | 오사카 성 | 입장료 600엔, 9시 오픈 |

- `day`: 0부터 시작 (0 = 1일차, 1 = 2일차...)
- `time`: `morning` / `afternoon` / `evening` / `allday`
- `note`: 이동수단, 입장료, 예약 여부 등 자유롭게 — 가게명은 title에, 장소·메모는 note에

---

## 여행 마무리 → 아카이브

여행 종료 후 우상단 🏁 버튼 → 아카이브에 저장 → **아카이브 탭**에서 누적 기록 조회 및 CSV 내보내기

---

## 추후 React 앱 전환

`index.html`의 `state` 객체와 localStorage 키(`travel_app_v1`, `travel_archive_v1`)를 그대로 유지하면 데이터 마이그레이션 없이 React로 전환 가능합니다.

---

## 일정 CSV 양식

엑셀에서 아래 형식으로 작성 후 **다른 이름으로 저장 → CSV (UTF-8)** 선택

| day | time | title | note |
|-----|------|-------|------|
| 0 | morning | 공항 도착 | 리무진 버스 50분 |
| 0 | afternoon | 도톤보리 산책 | 다코야키 탐방 |
| 0 | evening | 이치란 라멘 | 난바점, 웨이팅 있을 수 있음 |
| 1 | morning | 오사카 성 | 입장료 600엔, 9시 오픈 |

- `day`: 0부터 시작 (0 = 1일차, 1 = 2일차...)
- `time`: `morning` / `afternoon` / `evening` / `allday`
- `note`: 이동수단, 입장료, 예약 여부 등 자유롭게

---

## 데이터 저장

- **자동저장**: 모든 입력이 브라우저 localStorage에 자동 저장
- **앱 재접속 시**: 이전 데이터 자동 복원
- **여행 마무리**: 완료 버튼 → 아카이브에 영구 누적
- **CSV 내보내기**: 지출 내역·전체 아카이브를 엑셀로 내보내기

---

## 추후 React 앱 전환

이 `index.html`의 로직을 그대로 React 컴포넌트로 분리하면 됩니다.
데이터 구조(state 객체)와 localStorage 키가 동일하게 유지되어 데이터 마이그레이션 없이 전환 가능합니다.
