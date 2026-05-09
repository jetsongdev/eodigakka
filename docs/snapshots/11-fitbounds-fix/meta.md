---
index: 11
slug: fitbounds-fix
date: 2026-05-07
phase: "Phase 1 — UX bug fix"
git_sha: 1997957 (clean)
viewport: 768x1024 (iPad Mini portrait) + 1920x1080 (PC)
---

# 11 — fitBounds padding 보정 + selected 강조 회귀 fix

스냅샷 10에서 잡은 두 bug의 fix 결과.

(1) **fitBounds padding** (commit `ace64a4`) — viewport 폭 ≤1024px 분기 신설(top: 360, right: 440)으로 iPad Mini portrait/landscape에서 ControlPanel 회피, 표준 PC는 right padding 440→480으로 buffer 확대.

(2) **selected 강조 회귀** (commit `1997957`) — `2-B` useEffect 색칠 갱신의 `removeFeatureState({ source })`가 selected를 함께 지우는 문제. removeFeatureState 직후 `prevSelectedBjdRef`로 selected 즉시 복원 → mode/size 변경 시에도 외곽선 강조 유지.

## 보이는 것

### iPad Mini portrait (768×1024)

- `screenshot-ipad-mini-portrait-fixed.png` — 우이동 클릭. 폴리곤이 ControlPanel 아래 + SidePanel 좌측 영역에 깔끔히 자리잡음. 침범 없음. 스냅샷 10의 bug evidence와 비교하면 폴리곤이 사이드패널 쪽으로 침범하지 않고 좌측 영역에 fit되는 게 한눈에 보임.

### PC (1920×1080)

- `screenshot-pc-1920-fixed.png` — 우이동 클릭. 폴리곤 우측 가장자리(약 1130px)와 사이드패널 좌측(약 1500px) 사이 buffer ~370px 확보. 스냅샷 10에서는 buffer 20px로 답답했으나 fix 후 시각적 여유 충분.
- `screenshot-pc-mode-switch-keep-selected.png` — 우이동 선택 후 시트 안 전세 탭 클릭(Option A로 헤더 mode 동기 변경). 폴리곤이 빨간색(전세가율 80%+)으로 재색칠되어도 **파란 외곽선 강조 유지**. 사이드패널도 전세 모드(중위 4.3억, 신뢰도 low, 전세 7건)로 전환. 회귀 fix 정상 동작.

## 무엇이 끝났나

- 모바일/iPad/PC 3개 viewport에서 fitBounds 시트 비충돌 + 폴리곤 적정 위치 확인
- mode 토글 시에도 selected 강조 유지 — Option A의 단일 source of truth가 시각 affordance와 함께 작동
- e2e 16/16 통과

## 다음 것

- Mr. Song Preview URL에서 라이브 검증 (특히 iPad Mini landscape 1024×768 + 모바일 390×844 시각 확인)
- 머지 후 v0.7.0 release
- 다음 라운드: A 섹션 잔여(모바일 범례 floating chip, 슬라이더 햅틱) / H 섹션(`/api/affordable` latency 진단·개선) 중 결정
