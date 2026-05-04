# 01 — Mapbox 색칠지도 첫 로드 (467개 법정동 회색 fill)

- **날짜**: 2026-05-05
- **git SHA**: e0d4bcfe (Mapbox 색칠지도 스캐폴드 직후 / 색칠 전 base layer)
- **URL**: http://localhost:3002/
- **뷰포트**: 데스크톱 1440×900, 모바일 390×844
- **데이터 소스**: V-World `LSMD_ADM_SECT_UMD_11_202604` (서울 법정동 467개)

## 화면 구성

- 좌상단 카드: `eodigakka — 임장 후보 색칠지도 · 폴리곤 467개`
- 우상단: Mapbox 줌 ± 컨트롤
- 베이스맵: `mapbox://styles/mapbox/light-v11`
- fill: 회색(`#cccccc`) 35% 불투명, 색칠 전 모든 동 동일
- 외곽선: `#666` 0.4px

## 진척 상태

Phase 1 프론트 6단계 중 1번(베이스 레이어) 완료. 다음 단계:
- `/api/affordable` 응답을 feature-state로 join → `mode/cash/size`별 색칠
- 헤더 컨트롤 (mode 토글, cash 슬라이더, size 멀티셀렉트)
- 마우스오버 tooltip + 클릭 사이드패널

## 검증 포인트

- 한강·북한산·서울외곽 경계가 실제 시 경계와 일치
- 종로·용산 같은 도심부에서 폴리곤 밀도 높고 외곽(은평·도봉)은 낮음 — Phase 0 bulk pull에서 확인된 데이터 분포와 부합
- 법정동 단위라 "불광동" 하나로 보임(행정동에서는 불광1동/2동으로 분리됐던 것)
