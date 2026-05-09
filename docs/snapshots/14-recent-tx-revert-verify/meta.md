---
index: 14
slug: recent-tx-revert-verify
date: 2026-05-09
phase: "Phase 1 — UX 회귀 검증"
git_sha: 36ca2c6 (clean)
viewport: 1920x1080
---

# 14 — 단일+collapsed 시도 revert 후 회귀 검증

같은 날 9b49ad4(`refactor(web): 사이드패널 최근 거래 — 헤더 mode 따라 단일 섹션 + 보조 collapsed`)을 시도했다 c29f81a로 revert. 회고: 공공데이터(RTMS)에 매·전 외 다른 모드가 없어 "다른 모드 거래 보기" 추상화가 과함. revert 후 코드는 13(`b92c52a`) 시점과 100% 동일(`git diff b92c52a..HEAD -- web/app/page.tsx web/tests/e2e/map.spec.ts CHANGELOG.md` empty 확인). 이 캡처는 시각 회귀 검증용 — 13과 매칭되어야 정상.

## 보이는 것

### 데스크톱 (1920×1080) — `screenshot-desktop.png`
- 강북 14구 매매 27개 동 통과 (M형 4억~8억). 좌상단 컨트롤, 우측 사이드패널 열림 — 13과 동일 좌표(공릉동 1135010300 영역)
- 사이드패널 하단에 두 섹션 동시 노출: `● 매매 최근 10건 10건` (녹색 dot) + `● 전세 최근 10건 10건` (파란 dot). `<details>` 펼치기 버튼 0개 — 단일+collapsed 디자인이 아님을 DOM 레벨에서 확인(detailsCount=0, summaryText=[])
- 푸터 버전 `v0.7.0 #36ca2c6`

### 13과의 차이
없음. 의도된 회귀(단일+collapsed 시도 → 두 섹션 동시로 복귀)의 시각 검증.

## 무엇이 끝났나
- `9b49ad4` (단일+collapsed) → `c29f81a` (revert) → `36ca2c6` (tasks.md 회고 + 검색 축 pivot 후속 task) 시퀀스 완료
- `tasks.md` 196 — "검색 축 전환 — 모드 기준 → 금액 기준" 후속 task로 명시. brainstorming + ADR 선행 전제
- project memory `project_search_axis_pivot.md` — 같은 의도를 다음 세션에서도 환기하도록 메모리에 박음
- Vercel Preview에서 사용자가 단일+collapsed 형태가 보였다면 캐시(브라우저 또는 CDN edge) 의심 — 강제 새로고침(Cmd+Shift+R)·시크릿 창·푸터 sha 확인으로 진단 가능

## 다음 것
- PR #15 머지 — 시각·코드 모두 13 시점과 동일하므로 추가 변경 없이 진행 가능
- 머지 후: `tasks.md` 196 "검색 축 전환" task 본격 진입은 별도 brainstorming 라운드부터
