# 07 — 모바일 SidePanel bottom sheet + a11y 분기 (PR #10 Round 1 후)

- **날짜**: 2026-05-05
- **git SHA**: e67376f (capture 시점, Round 1 a11y 수정 미커밋)
- **URL**: http://localhost:3004/
- **뷰포트**: 데스크톱 1920×1080, 모바일 390×844
- **시나리오**: 페이지 로드 → 지도 캔버스 중앙 클릭 → SidePanel(태평로1가, 미통과 동) 열림. 두 뷰포트 동일 동선.

## 핵심 시각 변경

### 1. 모바일: 우측 사이드 패널 → 하단 bottom sheet (`screenshot-mobile.png`)

좁은 화면(`max-width: 640px`)에서 SidePanel을 화면 하단 시트로 슬라이드업. 기존 `position: absolute; right: 60; width: 360`은 375~390px 폰에서 가로를 다 차지해 가독성·터치 타겟이 좁았음. 새 레이아웃:

- **하단 시트**: `position: fixed; bottom: 0; left: 0; right: 0; max-height: 80vh; border-radius: 16px 16px 0 0; box-shadow: 0 -4px 20px`
- **드래그 핸들 시각 bar**: 36×4px 회색 둥근 막대 — 시트 affordance 힌트 (실제 swipe 제스처는 미연결, 잔여 task)
- **백드롭**: 시트 위 영역을 어둡게 (`rgba(0,0,0,0.3)`) 처리, 탭하면 닫힘
- **× 버튼**: 터치 타겟 확대 (padding 4/8, fontSize 22)
- **컨트롤 패널 collapsed 1줄 요약** (`27개 동 · 매매 · 4억~8억 · M형` + 펼치기) — 기존 동작 유지

### 2. 데스크톱: 우측 패널 그대로 유지 (`screenshot.png`)

데스크톱 1920×1080은 회귀 없음. `position: absolute; top:12; right:60; width:360` 유지. 헤더 컨트롤 카드도 좌측 상단 그대로.

### 3. a11y 분기 (PR #10 Round 1 Copilot 피드백 반영)

화면엔 직접 안 보이지만 접근성 트리에 영향:

- **백드롭은 `<button type="button" aria-label="동 상세 닫기">`** — 기존 `<div onClick aria-hidden>` 패턴은 스크린리더·키보드 사용자에겐 닫기 동작이 사라지는 함정 (TIL `2026-05-05-aria-hidden-overlay-trap`)
- **`<aside>` role 분기**: 모바일 = `role="dialog" + aria-modal="true"` (시트가 모달 다이얼로그처럼 동작), 데스크톱 = `role="complementary"` (사이드 정보 패널 시맨틱)
- 검증: a11y verify 스크립트 7/7 — `aside.role === 'dialog'/'complementary'`, `aria-modal === 'true'/null`, backdrop `<button>` 존재 여부 모두 확인

## 비교 (snapshot 03 → 07)

`03-sidepanel-detail`은 데스크톱·모바일 모두 동일한 우측 사이드 패널 레이아웃이었고, 모바일에서 화면을 가로로 다 차지해 가독성이 떨어졌음. 07부터 모바일은 익숙한 bottom sheet 패턴, 데스크톱은 그대로.

## 잔여

- swipe-down 제스처로 닫기 (현재는 백드롭 탭 + × 버튼만)
- 최근 거래 10건을 매매·전세 두 섹션으로 분리 표시 (현재는 한 표에 섞여 있음)
- 더보기 페이지네이션
