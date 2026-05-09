---
index: 13
slug: sidepanel-recent-tx-sections
date: 2026-05-09
phase: "Phase 1 — sidepanel info hierarchy 라운드 3"
git_sha: c369b2c (clean)
viewport: 1920x1080
---

# 13 — SidePanel 최근 거래: 탭 → 매·전 동시 섹션

08(`08-sidepanel-tabs`)에서 도입한 매·전 탭 토글을 매매·전세 두 섹션 동시 렌더로 바꾼 시점. 사용자가 모드 클릭 없이 한 화면에서 두 흐름을 비교할 수 있다. 헤더 mode는 여전히 `/api/affordable`·TOP5·DistributionChart primary에서 단일 source of truth로 작동 — 이번 변경은 "최근 거래" 영역에 한정.

## 보이는 것

### 데스크톱 (1920×1080) — `screenshot-desktop.png`
- 강북 14구 매매 27개 동 통과 (M형 4억~8억). 좌상단 컨트롤 패널, 우측 사이드패널 열림
- **공릉동(1135010300)** 클릭, 매매 7.6억 · 신뢰도 high · 2000년식 · 단지 27개
- 분포 박스플롯(매매 6.8~8.5 / 전세 4.0~5.3) + 매매 TOP5 단지(태릉해링턴플레이스 10.0억 등)
- **사이드패널 하단에 두 섹션 동시 노출**: `● 매매 최근 10건 10건` (녹색 dot) + `● 전세 최근 10건 10건` (파란 dot). 각 섹션 표 컬럼 동일(단지·평형 / 금액 / 일자), 모드 라벨 컬럼 없음
- 푸터 버전 `v0.7.0 #c369b2c` — /simplify 라운드(`MODE_ACCENT` 상수 부활) 반영분

### 모바일 (390×844) — `screenshot-mobile.png`
- 컨트롤 패널 collapsed("27개 동 · 매매 · 4억~8억 · M형" + 펼치기). 지도 점유 ~30%, bottom sheet ~70%
- **회기동(1123010800)** 매매 9.9억(분포)·4건. 매매 TOP5 단지(신현대·회기힐스테이트·민족통일MJ캠퍼스경희대)
- bottom sheet 안에 두 섹션 수직 스택: `● 매매 최근 10건 6건` + `● 전세 최근 10건 2건`. 시트 투명도(0.86~0.88) + `backdrop-filter: blur(6px)`로 뒤 지도가 살짝 비침

## 무엇이 끝났나
- `RecentTxTabs` → `RecentTxSections` rename, `mode`/`onModeChange` props 제거. `RecentTabButton`·`TAB_ACCENT` 폐기
- 매매·전세 섹션 헤더에 accent 색상 인디케이터(매매 #2d8a4f / 전세 #5577c8) + 건수 라벨 노출
- e2e `map.spec.ts` — 탭 셀렉터(`role=tablist`, `aria-selected`)를 섹션 헤더 셀렉터(`role=heading`, `매매 최근 10건` / `전세 최근 10건`)로 교체. 헤더 mode 토글 후에도 두 섹션 모두 유지되는 회귀 가드 추가
- /simplify 라운드: `MODE_ACCENT` 모듈 상수 부활 → DistributionChart series + RecentTxSections sections 두 곳 인라인 색상 통합. 3중 `loading`/`!loading` 분기를 삼항 + `rows ?? []` 정규화로 평탄화

## 다음 것
- tasks.md:232~233 — 최근 거래 더보기 (cursor·OFFSET 페이지네이션). 시트 안 "더보기" 버튼 → 다음 10건 append
- 별도 라운드: `formatMan` 표시 정책 통일(`(N/10000).toFixed(1)억` 인라인 7곳 통합 검토)
