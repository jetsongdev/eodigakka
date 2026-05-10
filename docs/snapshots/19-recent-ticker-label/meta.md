---
index: 19
slug: recent-ticker-label
date: 2026-05-11
phase: "Phase 1 — market freshness ticker"
git_sha: f90d49a
viewport: 1920x1080 + 390x844
---

# 19 — 최근 거래 티커 라벨

footer 바로 위 최근 거래 티커가 단순한 흐르는 숫자/단지 목록이 아니라 **최근 거래 정보**임을 명시적으로 드러낸 시점. 티커 왼쪽에 고정 라벨을 추가하고, 오른쪽 marquee 영역은 기존 거래 항목 클릭 동선을 유지한다.

## 보이는 것
- 데스크톱 캡처는 지도 하단 footer 바로 위에 `최근 거래 정보` 라벨이 고정되고, 오른쪽으로 매매·전세 거래 항목이 흐르는 상태.
- 모바일 캡처도 같은 라벨을 유지해 좁은 화면에서도 하단 행의 의미가 먼저 보인다.
- 티커 위치 표기는 `은평구·불광동`처럼 `구` suffix를 포함해 행정구역 단위를 더 명확히 표시한다.

## 캡처
- `screenshot.png` (1920x1080) — 데스크톱 기본 지도 + 최근 거래 정보 라벨 티커
- `screenshot-mobile.png` (390x844) — 모바일 접힌 컨트롤 + 최근 거래 정보 라벨 티커

## 무엇이 끝났나
- 최근 거래 티커 왼쪽 고정 라벨 추가.
- marquee overflow 영역을 라벨 오른쪽으로 분리.
- reduced motion 수동 스크롤 영역을 라벨이 아닌 거래 리스트 쪽으로 한정.

## 다음 것
- 배포 후 `/api/recent` `sigungu` fallback이 production 응답에도 반영됐는지 확인.
