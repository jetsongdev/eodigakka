# 04 — Cash 듀얼 핸들 슬라이더 + 카세트 한 줄 컨트롤, max 30억으로 확장

- **날짜**: 2026-05-05
- **git SHA**: (이번 commit 시점)
- **URL**: http://localhost:3002/
- **뷰포트**: 데스크톱 1920×1080, 모바일 390×844
- **변경 의도**: 종전 select 2개 (선택지 10개, 12억 캡)의 UX 한계 → 듀얼 핸들 슬라이더 + 카세트 metaphor 한 줄 컨트롤로 교체. 슬라이더 범위 0~30억까지 확장.

## UX 변경

이전 (snapshot 02·03):
```
[ 4억 v ] ~ [ 8억 v ]    ← 셀렉트 박스 2개, 12억까지
```

이후 (이 스냅샷):
```
[ ⏪ ] [ ◀ ] ━━━●━━━━━━━━━●━━━ [ ▶ ] [ ⏩ ]
0억                              30억
```

- 듀얼 핸들 (`@radix-ui/react-slider`) — 드래그로 양 끝 동시 조정
- **카세트 metaphor 4 버튼**: ⏪ ◀ ━━━━━━━━━ ▶ ⏩
  - 좌측 ⏪ ◀ → cashMin 만 변경 (각각 -1억 / -1천만)
  - 우측 ▶ ⏩ → cashMax 만 변경 (각각 +1천만 / +1억)
  - 핸들 교차 방지: cashMin ≤ cashMax clamp
  - 좁히는 방향(min↑ / max↓)은 슬라이더 핸들 드래그
- 슬라이더 step 5천만원, 카세트 버튼은 1천만/1억 두 단위
- 0~30억 (CASH_MAX 200000 → 300000)
- 슬라이더 양 끝 0억/30억 가이드

## 영향 범위

- `web/app/page.tsx`: `CashRangeSlider` + `CashShiftButton` 컴포넌트 신설
- `web/package.json`: `@radix-ui/react-slider` 의존성 추가
- `web/tests/e2e/map.spec.ts`: cash 테스트 카세트 라벨로 갱신 ("범위 +1억" 클릭으로 4억~8억 → 5억~9억 검증)

## 검증

- e2e 11/11 통과 (api 5 + map 6, 4.9초)
- 12억 → 20억 cash 범위 API 정상 응답 (TRADE M 12~20억 → 27개 동)
