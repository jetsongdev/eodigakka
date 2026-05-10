---
index: 19
slug: a11y-mobile-sheet-polish
date: 2026-05-11
phase: "Phase 1 — 접근성 + 모바일 UX 마무리"
git_sha: 9522dc5
viewport: 1920x1080 + 390x844
---

# 19 — 접근성 퀵윈 + 모바일 SidePanel swipe-down 닫기

Lighthouse baseline에서 지적된 footer 접근성 항목과 모바일 bottom sheet 잔여 UX를 함께 정리한 시점. 페이지 최상위 landmark를 `<main>`으로 바꾸고, footer 출처 링크는 색상만이 아니라 underline으로도 링크임을 드러낸다. 모바일 SidePanel은 상단 drag handle 영역을 넓히고 아래로 끌어 닫을 수 있게 했다.

## 보이는 것
- 데스크톱 기본 화면에서 footer 출처 링크(`국토교통부 RTMS`, `V-World LSMD 법정동`)에 underline이 보인다.
- footer 보조 텍스트 색상이 `#777`보다 어두워져 작은 글자 contrast가 개선됐다.
- 모바일 캡처는 ticker 항목을 눌러 응암동 SidePanel bottom sheet를 연 상태. sheet 상단 drag handle의 hit area가 넓어졌고, 아래 방향 swipe-down 닫기 대상이 명확하다.
- 기존 지도, ControlPanel, 최근 거래 ticker, SidePanel 정보 구조는 유지된다.

## 캡처
- `screenshot.png` (1920x1080) — 데스크톱 기본 지도 + footer underline/contrast 상태
- `screenshot-mobile.png` (390x844) — 모바일 SidePanel bottom sheet open + drag handle 상태

## 무엇이 끝났나
- `<main>` landmark 추가로 Lighthouse `landmark-one-main` 계열 접근성 회귀 방지.
- footer 출처 링크 underline + 텍스트 contrast 보정.
- 모바일 SidePanel drag handle에 pointer 기반 swipe-down close 동작 추가.
- mock API 기반 e2e 추가: DB/Mapbox 없이 landmark, footer underline, swipe-down close를 검증.
- worktree SessionStart hook 추가: `.claude/worktrees/*` 경로에서 `web/.env.local` symlink 자동 보정.
- worktree에서 Next/Turbopack이 부모 checkout을 root로 오인하지 않도록 `turbopack.root` 고정.

## 다음 것
- 기존 전체 e2e의 데이터 의존 실패 정리: `/api/recent`의 빈 `sigungu`, ticker marquee 클릭 안정성, `전세` 버튼 strict selector, SidePanel heading expectation을 별도 테스트 보수 라운드에서 처리.
