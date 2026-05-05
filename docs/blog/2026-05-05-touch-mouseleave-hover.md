---
title: "모바일에서 mouseleave가 안 발사된다 — touch hover의 진짜 모델"
date: 2026-05-05
status: draft
tags: [frontend, react, mobile, css, ux]
---

> 결론부터 — **터치 디바이스에서는 `mouseleave` 이벤트가 발사되지 않는다.** 데스크톱 마우스 모델로 만든 hover tooltip이 모바일에선 영원히 떠 있는 버그가 된다. fix는 `(hover: hover) and (pointer: fine)` 미디어 쿼리로 환경을 감지해서 hover UI 자체를 안 그리는 것 + sidepanel 같은 modal이 열리는 동안에도 가드.

## Production에서 발견된 회귀

mapbox 기반 색칠지도 사이드 프로젝트의 모바일 흐름을 라이브 사이트에서 직접 만져보다 발견했다. 동을 탭하면 사이드패널이 열리는데, hover tooltip이 사이드패널 위에 영원히 떠 있다. 터치를 다른 데로 옮겨도, 화면을 가로질러도 안 사라진다.

데스크톱 Chrome에선 멀쩡했다. e2e Playwright 테스트도 통과했다. fresh 세션 + 마우스 = 정상.

모바일 = 터치 = 영원히 잔류.

## mapbox 핸들러는 이렇게 짜여 있었다

문제 코드의 골자다:

```typescript
// hover: 커서 + tooltip
map.on('mousemove', POLYGONS_FILL_LAYER, (e) => {
  // ...
  setHover({ bjdCode, bjdName, x, y });
});

map.on('mouseleave', POLYGONS_FILL_LAYER, () => {
  setHover(null);
});

// click: 사이드패널 열기
map.on('click', POLYGONS_FILL_LAYER, (e) => {
  setSelectedBjd(props.bjd_code);
});
```

데스크톱 모델에선 깔끔하다. 마우스가 폴리곤 위에 들어오면 tooltip 표시, 나가면 hide. 클릭하면 sidepanel.

모바일은 다르다.

## 터치 환경에서 일어나는 일

iOS Safari, Android Chrome 모두 터치 인터랙션을 마우스 이벤트로 일부 emulate한다 — 하지만 일부만이다.

| 액션 | 데스크톱 마우스 | 터치 |
|---|---|---|
| 폴리곤 위로 진입 | `mousemove` 발사 | tap 시작점에서 `mousemove` + `mouseenter` 1회 |
| 폴리곤 안에서 이동 | `mousemove` 연속 | `mousemove` 거의 없음 (터치 이동은 별도 모델) |
| 폴리곤 밖으로 이탈 | `mouseleave` 발사 | **❌ 발사 안 됨** |
| 다른 곳 탭 | (해당 없음) | 새 탭 위치에 `mousemove` + `mouseenter`, 이전 폴리곤 `mouseleave`는 안 옴 |

핵심 함정은 마지막 줄. **터치는 "leave" 신호가 없다.** 손가락이 화면을 떠난 시점에 `mouseleave`가 안 온다 — 다음 탭이 새 좌표를 던질 뿐.

그래서 우리 코드는 `setHover(null)`이 호출되는 길이 사라진다. tooltip이 마지막 hover state에 그대로 남는다. sidepanel이 열려도, 화면 다른 곳을 만져도 그대로다.

## 두 단계 fix — 환경 감지 + 가드

A 단계: **hover capable 환경만 hover UI 그리기.**

CSS 미디어 쿼리에 정확한 답이 있다 — `(hover: hover)`는 "주 입력 장치가 hover를 자연스럽게 지원하는가"를 묻는다. `(pointer: fine)`는 "정밀한 포인터(마우스/스타일러스)가 있는가"다. 둘을 `and`로 묶으면 **실제 데스크톱 마우스 환경**만 매칭한다.

React 측 훅으로 감싸 구독하면:

```typescript
function useIsHoverCapable() {
  // SSR 시 데스크톱 가정 (true 시작) — 마운트 후 보정
  const [capable, setCapable] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setCapable(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCapable(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return capable;
}
```

`mq.addEventListener('change', ...)`는 viewport나 입력장치 전환(예: iPad에 마우스 페어링) 시 자동 갱신된다. 외부 모니터 연결 같은 케이스도 자연스럽게 잡힌다.

B 단계: **modal이 열린 동안엔 hover도 숨기기.**

`selectedBjd`가 set돼 있으면 sidepanel이 열린 상태다. 그동안엔 데스크톱이라도 tooltip을 가린다 — 포커스를 한 곳으로 모으는 UX 원칙이다.

```tsx
{hover && isHoverCapable && !selectedBjd && (
  <HoverTooltip hover={hover} dong={...} />
)}
```

세 조건의 `&&` 한 줄. A는 모바일을 막고, B는 sidepanel 충돌을 막는다.

## 안 잡히는 케이스 — `pointer: coarse`

미디어 쿼리에 더 흔한 패턴은 `(pointer: coarse)` 부정이지만, 이 프로젝트에선 명시적 positive 매칭(`hover: hover`)이 더 의도와 맞았다. `coarse` 부정은 "터치가 아닌"을 표현하지만, 일부 하이브리드 디바이스(터치+키보드)에서 hover가 어색한 경우를 잘 못 가른다.

`(hover: hover) and (pointer: fine)`는 "마우스 정밀 + hover 자연스러움" 두 조건을 모두 요구한다. iPad에 trackpad 페어링한 경우에도 정확히 분기된다 — Apple이 `hover: hover`를 그 케이스에선 true로 보고한다.

## `touchstart`로 강제 unset?

또 흔한 패턴은 `touchstart` 이벤트에서 `setHover(null)`을 명시적으로 부르는 것이다. 이 프로젝트에선 안 골랐다 — mapbox layer 이벤트와 native touch 이벤트가 같은 element에서 경합하면 디버깅 비용이 크다. **렌더링 단계에서 안 그리는 게 더 단순한 해법**이다.

## 일반화 — hover UI 추가할 때마다 만나는 함정

매번 React/Next.js 앱에 hover-based interaction을 추가할 때 이 함정에 빠진다:

1. tooltip / popover / dropdown — hover로 trigger하는 모든 것
2. 데스크톱에서 동작 → e2e 통과 → 모바일에서 처음 본 사람이 회귀 보고

방어:
- hover trigger UI는 항상 `useIsHoverCapable` 또는 `(hover: hover)` 미디어 쿼리로 감싸기
- 모바일 대안 동작 정의(보통 tap → modal/drawer)
- e2e 테스트에 모바일 viewport 시나리오 1개 이상

이 프로젝트의 경우 모바일 사용자에겐 hover tooltip이 없는 게 오히려 자연스럽다 — 탭하면 sidepanel이 즉시 열려 모든 정보가 한 곳에 있다. 미들 웨어로 풀 정보 보려고 hover를 거치는 건 마우스 시대의 패턴이다.

---

**참고**:
- MDN: [`@media (hover)`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover)
- MDN: [`@media (pointer)`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer)
- 도입한 fix: `web/app/page.tsx` `useIsHoverCapable` (PR #3, sha `c3237ba`)
