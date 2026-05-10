---
index: 16
slug: recent-tx-grouping
date: 2026-05-10
phase: "Phase 1.5 — 사이드패널 깊이 보기 (라운드 2)"
git_sha: a1104bd
viewport: 1920x1080 + 390x844
---

# 16 — 최근 거래 월별 sticky 그룹 + 자체 스크롤 박스

15번 라운드 1(인라인 점진 로드)을 풀자 누적 30건·50건이 되면 사이드패널 전체 스크롤이 길어져 EvidenceCard·DistributionChart·TOP5가 시야 위로 사라지는 문제가 생겼다. 매매·전세 각 섹션을 자체 스크롤 박스(max-height 320px)로 분리하고 그 안에 월별(YYYY-MM) 그룹 헤더를 `position: sticky`로 박았다.

## 보이는 것
- 매매 섹션 헤딩 옆 `50건+` 카운트 — 라운드 1에서 도입한 has_more 신호.
- 매매 섹션 안 박스 상단에 `2026-04 · 50건` 그룹 헤더가 sticky로 떠 있음. 박스 안 스크롤(`scrollTop=180`) 적용한 상태라 첫 행 일부가 위로 가려졌지만 헤더는 박스 상단에 그대로.
- 헤더 배경은 반투명 회색 + blur, 스크롤되는 행 위로 살짝 떠 있는 인상.
- column header(`단지·평형 / 금액 / 일자`)와 `더보기 (+20건)` 버튼은 스크롤 박스 밖이라 누적과 무관하게 항상 보임.
- 사이드패널 전체 스크롤은 살아있어 위로 올리면 EvidenceCard·DistributionChart·TOP5 접근 가능.
- 모바일 bottom-sheet에서도 동일 동작. nested scroll의 손가락 어색함은 `max-height 320px`이 한 스와이프 안에 들어와 실측상 무리 없음.

## 캡처
- `screenshot.png` (1920×1080) — 상계동 매매 50건+ 누적, 박스 안 `scrollTop=180`로 sticky 효과 노출
- `screenshot-mobile.png` (390×844) — 모바일 bottom-sheet, 매매 30건+ 누적, sticky 헤더

## 무엇이 끝났나
- `groupByMonth` 헬퍼 — `contract_date` slice(0,7)로 YYYY-MM 버킷, Map 삽입 순서로 최신 월 우선.
- `<table>` → `<div>` grid(`1fr auto 36px`) 재작성 — table 행 sticky의 브라우저별 들쭉날쭉 회피.
- 매매·전세 각 섹션 자체 스크롤 박스(`max-height: 320px`).
- 그룹 헤더 sticky 정확 동작 검증: `scrollTop=400` 적용 후 `boxTop === headerTop`.

## 다음 것
- 강북 14구 ETL 데이터가 현재 4월 한 달 분포라 다중 월 그룹 시각 검증은 데이터 fresh 적재 후 가능. tasks.md의 ETL 범위 재검토 항목 참조.
- 정렬 옵션(평형·금액·날짜) — 현재는 contract_date DESC 단방향. 사용자 피드백 누적 후 우선순위 결정.
