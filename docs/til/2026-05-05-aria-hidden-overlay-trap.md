# TIL: backdrop overlay를 `<div onClick aria-hidden>`로 만들면 스크린리더·키보드에서 닫기 동작이 사라진다

날짜: 2026-05-05

## 현상

PR #10 (모바일 SidePanel bottom sheet) Round 1 Copilot 리뷰에서 지적:

```tsx
{isNarrow && (
  <div
    onClick={onClose}
    aria-hidden          // ← 함정
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 2 }}
  />
)}
```

마우스 사용자 입장에선 정상 작동(어두운 영역 탭 → 시트 닫힘). 그런데 스크린리더·키보드 사용자 입장에서는 닫기 동작이 **존재하지 않는** 요소가 된다:
- `aria-hidden` 때문에 a11y 트리에서 제외 → 스크린리더가 발견 못 함
- `<div>`라 키보드 포커스를 못 받음(`tabIndex` 없음)
- 키보드로 시트를 닫는 길은 별도 × 버튼뿐 — × 버튼이 없으면 함정 완성

## 원인

1. 시각 affordance만 생각하고 a11y 트리를 무시한 게 일차 원인. backdrop은 시각적으로 "투명한 클릭 영역"이지만 a11y 관점에선 명백한 액션 요소다.
2. `aria-hidden`을 "장식 요소엔 일단 박는다" 식으로 쓰는 습관도 영향. 진짜 장식(드래그 핸들 bar 같은 것)에만 써야 한다.
3. 시맨틱 한 가지 더: `<aside role="dialog">`를 데스크톱 사이드 패널에까지 적용하면 모달 다이얼로그가 아닌데 다이얼로그라고 알리는 셈 → 스크린리더 오안내. role은 동작에 따라 분기해야 한다.

## 수정

```tsx
// backdrop — interactive button으로
{isNarrow && (
  <button
    type="button"
    onClick={onClose}
    aria-label="동 상세 닫기"
    style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.3)',
      border: 'none', padding: 0,
      cursor: 'pointer',
      zIndex: 2,
    }}
  />
)}

// aside role — 동작에 따라 분기
<aside
  style={asideStyle}
  role={isNarrow ? 'dialog' : 'complementary'}
  aria-label="동 상세"
  aria-modal={isNarrow ? true : undefined}
>
```

`<button>`로 바꾸면 자동으로:
- 키보드 Tab으로 포커스 이동 가능
- Enter/Space로 활성화 (`onClick` 자동 매핑)
- a11y 트리에 "동 상세 닫기" 동작으로 노출

스타일은 `border: none; padding: 0`으로 button 기본 chrome 제거하면 시각적으론 div와 동일.

## 교훈

| 패턴 | 잘못된 사용 | 올바른 사용 |
|---|---|---|
| 클릭 가능한 overlay | `<div onClick aria-hidden>` | `<button type="button" aria-label>` |
| `aria-hidden` | 액션 요소에 박기 | 진짜 장식만 (드래그 핸들 bar, decorative icon) |
| `role="dialog"` | 사이드 정보 패널에도 박기 | 모달 dialog일 때만 (+`aria-modal`) |
| 사이드 정보 패널 role | `role="dialog"` | `role="complementary"` 또는 role 미지정 |

판단 기준 한 줄 요약:
- **클릭/탭으로 동작이 일어나는 요소는 `<button>` 또는 `<a>` — 절대 `<div>`+`aria-hidden` 조합 안 됨**
- **role은 정적이지 않다** — 같은 컴포넌트라도 표시 컨텍스트(모바일 모달 vs 데스크톱 사이드)에 따라 분기

다음번 후보:
- 향후 다른 모달/오버레이(예: 슬라이더 햅틱 설정 dialog, "Claude로 더 보기" 같은 액션 메뉴)에도 동일 패턴 적용
- `role="complementary"` vs `role="region"` vs no role 비교는 별도 학습 필요
