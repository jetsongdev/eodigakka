---
index: 10
slug: fitbounds-bug-ipad-mini
date: 2026-05-07
phase: "Phase 1 — UX bug evidence"
git_sha: 6718594 (clean)
viewport: 768x1024 (iPad Mini portrait) + 1920x1080 (PC)
---

# 10 — fitBounds 시트 가림 bug evidence

PR #12 fitBounds zoom-in (commit 6718594) 후 시각 회귀 발견. 시트가 안 가린 빈 공간에 폴리곤을 fit하는 게 의도였으나 iPad Mini portrait에서 폴리곤이 시트 가장자리에 부분 겹침 + ControlPanel과 사이드패널 사이의 좁은 공간으로 끼임. PC도 폴리곤이 사이드패널 가장자리에 너무 타이트하게 닿음 (안 겹치지만 답답).

## 보이는 것

### iPad Mini portrait (768×1024)

- `screenshot-ipad-mini-portrait-bug.png` — 우이동(1130510400) 클릭 후
- 좌상단 ControlPanel(~210px width × ~360px height) + 우상단 SidePanel(right: 60, width: 360)이 겹친 viewport
- **폴리곤이 사이드패널 좌측 가장자리와 부분 겹침** — 우이동 동쪽 외곽선이 사이드패널 위로 침범
- 폴리곤 fit 영역이 viewport의 22% 정도 (768 - 210 ControlPanel - 420 SidePanel = 138px가 본격 사용 가능 공간) — 너무 좁음

### PC (1920×1080)

- `screenshot-pc-1920-bug.png` — 같은 우이동
- 폴리곤이 화면 가운데에 위치하지만 **우측 가장자리가 사이드패널과 거의 닿음** — 시각적으로 답답
- 사이드패널 left edge ≈ 1500px, padding right: 440 → polygon right ≤ 1480px — buffer 20px만 확보, 너무 타이트

## 무엇이 문제인가

`web/app/page.tsx` `1-D` useEffect의 padding 분기 두 갈래:
- `isNarrow` (max-width: 640px) → 모바일 bottom sheet 패턴 (top 22%만 사용)
- 그 외 → 데스크톱 padding `{ top: 80, right: 440, bottom: 80, left: 80 }`

문제:
1. iPad Mini portrait(768)는 isNarrow=false라 데스크톱 분기로 떨어짐 → 폴리곤 영역 138px만 남음 (실제 시트는 420px 차지하는데 padding right=440만 둠 → 아슬아슬한 boundary)
2. ControlPanel 영역은 padding 분기에 전혀 반영 안 됨 → 좌상단 영역도 폴리곤이 침범하면 부분 겹침
3. PC도 padding right: 440이 사이드패널 width(420) + 60 right margin과 거의 같아서 buffer 부족

## 다음 것

수정 방향 (Codex 위임 예정):
- 데스크톱 padding right 키우기 (~480~500) — 사이드패널과 폴리곤 사이 buffer 확보
- iPad Mini portrait처럼 좁은 데스크톱 layout(640~1024px)에서는 ControlPanel 영역도 padding left에 반영
- 또는 더 단순한 접근: viewport width 기반 동적 padding (예: padding right = max(440, viewport_width * 0.30))
- 이상적: 실제 ControlPanel/SidePanel DOM bounding box를 측정해 padding 자동 계산
