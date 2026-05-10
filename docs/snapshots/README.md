# Visual Snapshots

Phase·마일스톤별로 UI가 어떻게 변해왔는지 시각 기록. 각 폴더에 데스크톱(`screenshot.png`) + 모바일(`screenshot-mobile.png`) + 메타(`meta.md`).

설정: `.snapshot.config.json` (프로젝트 루트). 캡처는 `/snapshot` 스킬로 자동.

## 인덱스

| NN | 제목 | 날짜 | git SHA | Phase |
|---|---|---|---|---|
| 01 | [Mapbox 색칠지도 첫 로드 — 467개 법정동 회색 fill](01-mapbox-base-layer/) | 2026-05-05 | e0d4bcfe | 1 (frontend scaffold) |
| 02 | [`/api/affordable` 색칠 적용 — 27개 동 통과 (TRADE·M·4~8억)](02-affordable-coloring/) | 2026-05-05 | 79d5930 | 1 (color rendering) |
| 03 | [클릭 사이드패널 + tooltip — 상계동(노원) TOP5 + 최근 10건](03-sidepanel-detail/) | 2026-05-05 | ca00062 | 1 (interaction complete) |
| 04 | [Cash 듀얼 슬라이더 + 카세트 한 줄 컨트롤 (max 50억, ±10억 점프)](04-cash-slider-stepper/) | 2026-05-05 | c9315c8 | 1 (UX refinement) |
| 05 | [전세 모드 색칠 — 79개 동 통과, 빨강(전세가율 80%+) 분포 노출](05-jeonse-mode-coloring/) | 2026-05-05 | c9315c8 | 1 (mode coverage) |
| 06 | [Cash 슬라이더 +/- 칩 + 결과 카드 위계 + 데이터 출처 attribution](06-cash-delta-chip/) | 2026-05-05 | 4e02b3a | 1 (UX polish round 2) |
| 07 | [모바일 SidePanel bottom sheet + a11y 분기 (PR #10)](07-mobile-bottom-sheet/) | 2026-05-05 | e67376f | 1 (mobile UX) |
| 08 | [SidePanel 탭 UI + 시각 위계 + 시트 투명도 (PR #12)](08-sidepanel-tabs/) | 2026-05-07 | 8a99de8 | 1 (sidepanel info hierarchy) |
| 09 | [모바일 zoom 좌하단 + 선택된 동 폴리곤 강조 (PR #12)](09-zoom-and-selected-affordance/) | 2026-05-07 | ff60ff2 | 1 (mobile UX + selected affordance) |
| 10 | [fitBounds 시트 가림 bug evidence (iPad Mini + PC)](10-fitbounds-bug-ipad-mini/) | 2026-05-07 | 6718594 | 1 (bug evidence) |
| 11 | [fitBounds padding 보정 + selected 강조 회귀 fix](11-fitbounds-fix/) | 2026-05-07 | 1997957 | 1 (bug fix) |
| 12 | [Mapbox zoom 버튼 30×30 → 44×44 (touch target)](12-zoom-44px/) | 2026-05-09 | 5c38bd1 | 1 (touch UX) |
| 13 | [SidePanel 최근 거래 — 탭 → 매·전 동시 섹션](13-sidepanel-recent-tx-sections/) | 2026-05-09 | c369b2c | 1 (sidepanel info hierarchy 라운드 3) |
| 14 | [단일+collapsed 시도 revert 후 회귀 검증 (13과 동일)](14-recent-tx-revert-verify/) | 2026-05-09 | 36ca2c6 | 1 (UX 회귀 검증) |
| 15 | [SidePanel 매매·전세 최근 거래 더보기 — 인라인 점진 로드 +20건](15-sidepanel-recent-load-more/) | 2026-05-10 | ec509fb | 1.5 (sidepanel 깊이 보기) |
| 16 | [최근 거래 월별 sticky 그룹 + 자체 스크롤 박스 (max 320px)](16-recent-tx-grouping/) | 2026-05-10 | a1104bd | 1.5 (sidepanel 깊이 보기 라운드 2) |
| 17 | [footer 위 강북 14구 최근 거래 ticker](17-recent-tx-ticker/) | 2026-05-10 | c3bca44 | 1 (market freshness ticker) |
| 18 | [모바일 범례 floating chip](18-mobile-legend-chip/) | 2026-05-11 | de001de | 1 (mobile UX 마무리) |
| 19 | [최근 거래 티커 라벨](19-recent-ticker-label/) | 2026-05-11 | f90d49a | 1 (market freshness ticker) |
| 20 | [최초 방문 핵심 기능 힌트 + 버전 변경 안내](20-whats-new-first-visit-hint/) | 2026-05-11 | 7f1ec37 | 1.5 (최초 방문/버전 변경 안내) |
| 21 | [접근성 퀵윈 + 모바일 SidePanel swipe-down 닫기](21-a11y-mobile-sheet-polish/) | 2026-05-11 | 3a43eeb | 1 (접근성 + 모바일 UX 마무리) |
