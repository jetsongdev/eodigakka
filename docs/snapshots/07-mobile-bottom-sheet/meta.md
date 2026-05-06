# 07 — 모바일 SidePanel bottom sheet + a11y 분기 (PR #10 Round 1 후)

- **날짜**: 2026-05-05
- **git SHA**: 4a18442 (Round 1 a11y backdrop button + role 분기 적용본 — capture는 코드 변경을 dev 서버에 반영한 직후 진행)
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

### 3. a11y (PR #10 Round 1·2 Copilot 피드백 반영)

화면엔 직접 안 보이지만 접근성 트리에 영향:

- **백드롭은 `<button type="button" aria-label="동 상세 닫기">`** — 기존 `<div onClick aria-hidden>` 패턴은 스크린리더·키보드 사용자에겐 닫기 동작이 사라지는 함정 (TIL `2026-05-05-aria-hidden-overlay-trap`)
- **`<aside>` role은 `complementary`로 통일** — 처음엔 모바일에 `role="dialog" + aria-modal="true"`를 줬으나(Round 1), focus trap 미구현 상태에서 modal 시맨틱만 선언하면 키보드 사용자에게 거짓 신호. Round 2에서 `aria-modal` 제거 + `role="complementary"`로 데스크톱과 통일. 시트 본질이 인터랙션 모달이 아닌 정보 패널이라는 판단.
- 검증: a11y verify 스크립트 — backdrop `<button>` 존재 + `aside.role === 'complementary'`로 갱신.

> 스크린샷은 Round 1 시점에 캡처됐지만 Round 2 격하는 ARIA 속성 변경이라 시각 변화 없음 — 시트·백드롭·드래그 핸들 모양 동일.

## 비교 (snapshot 03 → 07)

`03-sidepanel-detail`은 데스크톱·모바일 모두 동일한 우측 사이드 패널 레이아웃이었고, 모바일에서 화면을 가로로 다 차지해 가독성이 떨어졌음. 07부터 모바일은 익숙한 bottom sheet 패턴, 데스크톱은 그대로.

## 잔여

- swipe-down 제스처로 닫기 (현재는 백드롭 탭 + × 버튼만)
- 최근 거래 10건을 매매·전세 두 섹션으로 분리 표시 (현재는 한 표에 섞여 있음)
- 더보기 페이지네이션
