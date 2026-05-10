---
index: 17
slug: recent-tx-ticker
date: 2026-05-10
phase: "Phase 1 — market freshness ticker"
git_sha: c3bca44 (dirty; visual preview sha 7bfc821)
viewport: 1920x1080
---

# 17 — footer 위 강북 14구 최근 거래 ticker

PR #26의 강북 14구 최근 거래 50건 marquee ticker 시각 기록. `c3bca44`는 tasks 문서만 추가한 HEAD이고 Vercel preview 배포가 취소되어, UI가 동일한 직전 READY 배포 `7bfc821`을 캡처했다.

## 보이는 것

### 데스크톱 (1920x1080) — `screenshot-desktop.png`
- 지도 하단 footer 바로 위에 ticker row가 독립적으로 붙어 있다. 지도 absolute overlay와 겹치지 않는다.
- ticker 항목은 모드 chip(매매/전세), 계약일, 위치·단지·평형·금액 순으로 흐른다.
- footer에는 면책, RTMS/V-World 출처, 데이터 freshness, 앱 버전(`v0.9.0 #7bfc821`)이 유지된다.
- 좌상단 ControlPanel은 기존 Phase 1 상태 그대로이며, ticker 추가로 지도 영역이 조금 줄어든 형태다.

### 모바일 (390x844) — `screenshot-mobile.png`
- 모바일에서도 ticker row가 footer 바로 위에 28px 높이로 노출된다.
- collapsed ControlPanel과 Mapbox zoom/info control은 유지되고, ticker가 bottom footer 영역과 같은 흐름에 들어간다.
- 긴 거래 텍스트는 가로 marquee 흐름 안에 있으며 page-level layout overflow를 만들지 않는다.

## 무엇이 끝났나
- `/api/recent` read-only API로 매매 raw + 순수 전세 raw 최근 50건을 공급.
- `RecentTickerBar`가 hover/focus pause, `prefers-reduced-motion` 수동 스크롤 폴백, silent degrade를 가진 형태로 추가.
- 속도 조정 완료: 60s → 120s → 172s. 현재 약 70px/s 기준.
- 후속 task: 강남권 ticker는 `tasks.md` Phase 2에 별도 항목으로 남김.

## 다음 것
- PR #26 preview에서 실제 hover/focus pause와 ticker 항목 클릭 → SidePanel 열림을 수동 확인.
- `TARGET_GU = SEOUL_25` 확장 이후 강남권 ticker를 별도 지역 토글 또는 두 번째 ticker로 설계.
