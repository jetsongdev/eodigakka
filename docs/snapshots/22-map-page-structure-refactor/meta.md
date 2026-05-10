---
index: 22
slug: map-page-structure-refactor
date: 2026-05-11
phase: "Code health — route/client 구조 리팩터링"
git_sha: 3d70a8a (pre-refactor parent)
viewport: 1920x1080 + 390x844
---

# 22 — 지도 페이지 구조 리팩터링 후 UI 회귀 확인

`web/app/page.tsx`를 route wrapper로 축소하고 실제 client 지도 화면을 `web/components/MapPageClient.tsx`로 이동한 뒤의 시각 기록. UI 변경을 의도하지 않은 리팩터링이므로 데스크톱과 모바일 기본 화면이 기존 지도/컨트롤/최근 거래 ticker 구조를 유지하는지 확인하기 위한 snapshot이다.

- `screenshot.png` — 데스크톱 1920×1080 기본 지도 화면
- `screenshot-mobile.png` — 모바일 390×844 기본 지도 화면
