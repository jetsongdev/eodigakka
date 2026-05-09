---
index: 08
slug: sidepanel-tabs
date: 2026-05-07
phase: "Phase 1 — UX 마무리"
git_sha: 8a99de8 (clean)
viewport: 1920x1080
---

# 08 — SidePanel 탭 UI + 시각 위계 + 시트 투명도

PR #12에서 SidePanel 정보구조를 한 번에 재배치한 시점. 매매·전세 거래를 두 stack 섹션에서 탭 UI로 전환했고, evidence 카드 시각 위계를 큰 숫자 + 칩으로 정리했고, 시트 자체에 투명도(0.86~0.88) + `backdrop-filter: blur(6px)`을 부여해 뒤 지도가 살짝 비치도록 했다. 이전 스냅샷 03(`03-sidepanel-detail`)과 비교하면 (1) 표·텍스트 위주에서 시각 위계가 명확한 카드 + 칩 + 탭 구조로, (2) 단색 사이드패널에서 살짝 투명한 시트로 변한 게 한눈에 보인다.

## 보이는 것

### 데스크톱 (1920×1080, 3장)

- `screenshot-default.png` — 폴리곤 색칠지도. 강북 14구 매매 27개 동 통과 (M형 4억~8억). 좌측 컨트롤 패널, 우측 비어있음
- `screenshot-sidepanel-trade-tab.png` — 우이동(1130510400) 클릭 후 사이드패널. **동 중위 (매매) 4.7억 큰 숫자(26pt) + 칩 2개(표본 부족 회색 / 2002년식 파랑)**. 분포 박스플롯에 매매·전세 동시 비교. **매매 2건 / 전세 7건 탭, 매매 active (녹색 underline)** + 거래 표 (단지·평형 / 금액 / 일자 3컬럼, 모드 컬럼 제거)
- `screenshot-sidepanel-jeonse-tab.png` — 같은 우이동, 전세 탭 클릭 후. **전세 active (파란 underline)** + 전세 7건 표시 (4.6억·3.0억 등)

### 모바일 (390×844, 2장)

- `screenshot-mobile-default.png` — 컨트롤 패널 collapsed (1줄 요약 "27개 동 · 매매 · 4억~8억 · M형" + 펼치기 버튼). 지도 점유율 ~85%
- `screenshot-mobile-bottom-sheet.png` — 수유동(1130510300) 클릭 후 bottom sheet. **시트 투명도로 상단에 지도가 살짝 비침**. 동 중위 6.5억 + 신뢰도 high 녹색 칩 + 1993년식 칩. 분포 박스플롯 + 매매 TOP5 + **매매 10건 / 전세 10건 탭** (매매 active)

## 무엇이 끝났나

- API 스키마 변경: `recent_transactions[]` (단일 UNION ALL LIMIT 10) → `recent_trades[]` + `recent_jeonse[]` (각각 LIMIT 10, Promise.all 병렬)
- `EvidenceCard` 컴포넌트로 시각 위계 분리 — 큰 숫자 + 라벨 + Chip 묶음 + evidence 텍스트
- `Chip` 5 tone (high/low/insufficient/neutral/warn) 색 의미 일관성
- `RecentTxTabs` 탭 UI — `useEffect`-derived-state 대신 `<RecentTxTabs key={mode} />` natural remount
- 사이드패널 투명도 0.86~0.88 + `backdropFilter: blur(6px)`, 탭 콘텐츠 영역은 `rgba(255,255,255,0.55)` 한 층 더 투명
- /simplify 라운드: `lastEvidenceDate` 우선순위 버그 fix (매매·전세 두 [0] 중 더 최신을 lexicographic sort로 선택), 모듈 상수 hoist (`CHIP_PALETTE`, `CONFIDENCE_LABEL`)
- e2e 16/16 통과 (api 6 + map 10, +3개 신규 SidePanel 탭 검증)

## 다음 것

`tasks.md` H 섹션 — `/api/affordable` 첫 로딩 latency 2.25초 진단·개선. 가설 7개 중 우선순위:
1. Neon free tier 콜드 스타트 진단 (warm 호출 latency 비교)
2. `/api/affordable` 응답 edge cache (mode×size 8조합)
3. Promise.all 병렬화 (B 빠른 win)

A 섹션 잔여: 모바일 범례 floating chip, 슬라이더 햅틱.
