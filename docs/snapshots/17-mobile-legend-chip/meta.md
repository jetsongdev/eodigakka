---
index: 17
slug: mobile-legend-chip
date: 2026-05-11
phase: "Phase 1 — 모바일 UX 마무리"
git_sha: de001de
viewport: 1920x1080 + 390x844
---

# 17 — 모바일 범례 floating chip

모바일에서 접힌 컨트롤 패널 안에 묶여 있던 범례를 지도 좌하단 floating chip으로 분리한 시점. 컨트롤 패널은 한 줄 요약으로 접혀 있고, 범례는 별도 chip을 눌러 compact sheet로 확인한다. 데스크톱은 기존처럼 컨트롤 패널 하단 범례를 유지한다.

## 보이는 것
- 데스크톱 기본 캡처는 새 `CLAUDE.md` 규칙에 맞춰 북아현동(`1141011000`) 폴리곤을 선택한 상태. 선택 강조선과 SidePanel이 같이 보인다.
- 모바일 기본 캡처는 컨트롤 패널이 접힌 상태에서 좌하단 `범례` chip이 지도 위에 떠 있다.
- `screenshot-mobile-legend-open.png`는 chip을 탭해 `지도 범례` sheet가 열린 상태. 기존 범례 항목을 작은 sheet에 그대로 노출한다.
- `screenshot-mobile-selected.png`는 북아현동 선택 후 bottom sheet가 열린 상태. SidePanel과 겹치지 않도록 범례 chip은 숨겨진다.

## 캡처
- `screenshot.png` (1920x1080) — 북아현동 선택 + 데스크톱 SidePanel
- `screenshot-mobile.png` (390x844) — 모바일 접힌 컨트롤 + 좌하단 범례 chip
- `screenshot-mobile-legend-open.png` (390x844) — 모바일 범례 sheet open
- `screenshot-mobile-selected.png` (390x844) — 북아현동 선택 + 모바일 bottom sheet, 범례 chip 숨김

## 무엇이 끝났나
- 모바일에서 컨트롤 패널 내부 범례 숨김.
- 지도 좌하단 `범례` floating chip 추가.
- chip 탭 시 compact dialog로 범례 항목 표시.
- SidePanel bottom sheet가 열릴 때 범례 chip 숨김.
- 모바일 범례 e2e 가드 추가.

## 다음 것
- 남은 모바일 UX 잔여는 swipe-down 닫기 제스처와 햅틱 피드백. 둘 다 별도 사용자 피드백 후 우선순위 결정.
