---
index: 15
slug: sidepanel-recent-load-more
date: 2026-05-10
phase: "Phase 1.5 — 사이드패널 깊이 보기"
git_sha: 6296136 (dirty)
viewport: 1920x1080 + 390x844
---

# 15 — 사이드패널 매매·전세 최근 거래 더보기

동 상세 사이드패널의 최근 거래가 매매 10건·전세 10건 고정이었던 걸 +20건씩 누적 로드 가능하게 풀었다. 거래 흐름을 깊이 보고 싶을 때 모달이나 페이지 이동 없이 같은 자리에서 펼친다 — 라벨 `매매 최근 거래10건+`/`30건+`로 더 있다는 신호를 명시한다.

## 보이는 것
- 사이드패널 매매·전세 헤딩 옆 카운트가 `10건` → `10건+`로 변경. `+`는 has_more 신호.
- 각 섹션 하단에 옅은 회색 테두리 풀너비 버튼 `더보기 (+20건)`, 호버·누름 상태에 cursor 반응.
- 더보기 클릭 후 같은 위치에 새 행이 append, 카운트가 `30건+`/`50건+`로 갱신, 더 이상 없으면 버튼 자동 사라짐.
- 매매·전세 더보기는 독립 — 한쪽 누적이 다른 쪽 영향 없음.
- 모바일 bottom-sheet에서도 동일 동작, 사이드패널 자체 스크롤로 새 행 확인.

## 캡처 4장
- `screenshot.png` (1920×1080) — 사이드패널 닫힌 기본 화면. 색칠지도 + ControlPanel.
- `screenshot-sidepanel-default.png` (1920×1080) — 중계동(매매 160건) 클릭 직후. 매매·전세 각 10건+ 더보기 버튼 노출.
- `screenshot-sidepanel-after-loadmore.png` (1920×1080) — 매매 더보기 1회 클릭 후. 매매 30건+, 전세는 그대로 10건+ (독립 작동 증거).
- `screenshot-mobile.png` (390×844) — 모바일 bottom-sheet 안에서 동일 사이드패널 + 더보기 버튼.

## 무엇이 끝났나
- 신규 페이징 엔드포인트 `/api/dong/[bjd]/recent` (mode/offset/limit, LIMIT+1 trick으로 has_more, cacheTag `mv_dong_stats`+`recent-...`로 ETL revalidate에 묶임).
- `RecentTxSections` 컴포넌트에 누적 state(extraTrades/Jeonse) + bjd 변경 시 reset + 매매·전세 독립 loading/error 상태.
- e2e API 테스트 4종(페이징 동작 + validation 4 케이스 400).
- CHANGELOG `[Unreleased]` 섹션 추가 (`feat:` minor bump 예상).
- 브랜치: `feat/sidepanel-recent-load-more`.

## 다음 것
- TIL 가치 있는 케이스: Cache Components 활성화 환경에서 `runtime`/`dynamic` route segment config 금지 (작업 중 build 에러로 발견). `complexes/route.ts`엔 이미 없었지만 CLAUDE.md 옛 가이드와 충돌하므로 정리 후보.
- Phase 1.5 다음 후보: 더보기 + 정렬·평형 필터(현재는 단방향 시간순). tasks.md 참고.
