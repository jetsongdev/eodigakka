---
index: 09
slug: zoom-and-selected-affordance
date: 2026-05-07
phase: "Phase 1 — UX 마무리"
git_sha: ff60ff2 (clean)
viewport: 1920x1080
---

# 09 — 모바일 zoom 좌하단 + 선택된 동 폴리곤 강조

PR #12의 뒤쪽 라운드 시각 변화 두 가지를 한 번에 박는다. (1) Mapbox `NavigationControl` 위치를 hover-capable 기준으로 분기 — 마우스 디바이스(데스크톱)는 우상단 유지, 터치 디바이스(모바일·iPad Mini 등)는 좌하단으로 이동. 우상단 ControlPanel collapsed bar + sheet가 우측을 덮는 충돌을 회피하고 엄지 ergonomics 개선. (2) 선택된 동 폴리곤에 mapbox `feature-state.selected` 토글로 외곽선 강조 — line-color `#0066ff` + line-width 3, fill-opacity 0.85. 사이드패널 정보와 지도 위치 매핑이 명확해짐.

스냅샷 08(`08-sidepanel-tabs`)과 비교하면 (a) 모바일 우상단에 있던 zoom +/- 가 좌하단으로 이동 (b) 선택된 폴리곤 위에 진한 파란 외곽선이 추가된 게 한눈에 보인다.

## 보이는 것

### 데스크톱 (1920×1080, 1장)

- `screenshot-desktop-selected.png` — 우이동(1130510400) 클릭 후. **폴리곤에 진한 파란 외곽선(#0066ff, width 3) + 진한 회색 fill(opacity 0.85)** 강조. 사이드패널은 우측에 "동 중위 (매매) 4.7억", 매매 2건/전세 7건 탭, 매매 TOP5(대우 6.2억·다인플레움 3.1억). zoom +/- 컨트롤은 우상단 유지(hover-capable=true).

### 모바일 (390×844, 2장)

- `screenshot-mobile-zoom-bottom-left.png` — 사이드패널 닫힘 상태. **좌하단에 zoom +/- 노출**. 우상단은 ControlPanel collapsed bar의 펼치기 버튼 + 모바일 화면 우상단 free space.
- `screenshot-mobile-selected.png` — 수유동(1130510300) 클릭 후 bottom sheet. **수유동 폴리곤 외곽선이 진한 파란색으로 강조**(상단 노출 영역). 시트 안: 동 중위 6.5억 + 신뢰도 high·1993년식 칩, 분포 박스플롯, 매매 TOP5(수유벽산1차·래미안수유 등), 매매 10건/전세 10건 탭. 좌하단 zoom은 시트에 가려짐 — 시트 닫힘 시에만 보이는 정상 동작.

## 무엇이 끝났나

- `web/app/page.tsx` 변경:
  - `mapLoaded` state + `prevSelectedBjdRef` ref 추가
  - 폴리곤 fill paint expression: `selected: true → opacity 0.85` 최우선 분기
  - 폴리곤 line paint expression: `selected: true → #0066ff width 3`, 기본 `#666 width 0.4`
  - `selectedBjd` 변경 useEffect — 이전 폴리곤 selected: false 해제 + 새 폴리곤 selected: true
  - `NavigationControl` 위치 useEffect — `isHoverCapable` inverse 기준 (터치 → 좌하단, 마우스 → 우상단)
- e2e 16/16 통과 (회귀 없음)

## 다음 것

- Mr. Song Preview URL 검증 후 PR #12 머지
- 머지 후 v0.7.0 → v0.8.0 minor bump (selected affordance + zoom + 모바일 mode UX는 모두 feat → minor)
- A 섹션 잔여(모바일 범례 floating chip, 슬라이더 햅틱) 또는 H 섹션(/api/affordable 첫 로딩 latency 진단·개선) 중 다음 라운드 결정
