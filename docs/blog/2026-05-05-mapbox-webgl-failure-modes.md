---
title: "\"Failed to initialize WebGL\" 한 줄에 숨은 원인 셋 — mapbox + React + Chrome 진단기"
date: 2026-05-05
status: draft
tags: [mapbox, react, webgl, chrome, dev-experience]
---

## TL;DR

mapbox-gl을 React로 띄우다 `Failed to initialize WebGL`을 만났다. 같은 한 줄짜리 표면 메시지인데 원인은 최소 셋이다 — (1) React StrictMode + HMR로 누적된 컨텍스트 누수, (2) 브라우저 GPU process 부팅 실패, (3) 운영체제·드라이버 비호환. 코드로 막을 수 있는 건 (1) 한 가지뿐이고, 나머지 둘은 친절한 안내 메시지로 셀프 진단을 도와주는 게 최선이다. 이 글은 표면 메시지 하나에서 셋을 분기시키는 진단 흐름을 정리한 기록.

## 발단

부동산 색칠지도 사이드 프로젝트(eodigakka)에서 UX 마무리 라운드를 마치고 사용자 브라우저로 회귀 검증을 받던 중이었다. 헤드리스 Playwright(fresh Chromium)에서는 매 회귀 통과했고, 데스크톱·모바일 시각 검증도 정상이었다. 그런데 사용자 본인 Chrome에서 페이지를 열면 콘솔에 한 줄:

```
Console Error
Failed to initialize WebGL
    at MapPage.useEffect (app/page.tsx:156:17)
```

페이지 새로고침을 여러 번 해도 동일하게 재현. dev 로그(`.next/dev/logs/next-development.log`)에는 같은 에러가 짧은 간격으로 5회 이상 찍혀 있었다.

## 첫 가설 — StrictMode + HMR 누수

mapbox + React 조합에서 잘 알려진 패턴이다.

- React 19 dev 모드는 StrictMode가 기본 활성화 → useEffect가 mount → cleanup → mount 순으로 두 번 실행.
- 컴포넌트 구조를 바꾸는 편집(이번에 ControlPanel을 둘로 쪼갰다)은 Turbopack HMR이 부모 트리를 재생성 → useEffect가 또 한 사이클.
- mapbox `map.remove()`는 호출은 동기지만 GPU 자원(특히 WebGL context)은 브라우저 GC에 맡겨진다. 다음 `new Map()`이 즉시 새 컨텍스트를 요청하면 동시 컨텍스트 한도(브라우저당 보통 8~16개)에 걸려 거부된다.

이 가설에 맞는 방어는 분명하다.

```tsx
// 1) WebGL 사전 probe — 거부 즉시 친절한 안내로 변환
const probe = document.createElement('canvas');
const gl = probe.getContext('webgl2') || probe.getContext('webgl');
if (!gl) {
  setError('WebGL 초기화 실패 — ...');
  return;
}

// 2) new Map() try/catch
let map: mapboxgl.Map;
try {
  map = new mapboxgl.Map({ ..., failIfMajorPerformanceCaveat: false });
} catch (err) {
  setError(`Mapbox 초기화 실패: ${err.message}`);
  return;
}

// 3) 런타임 컨텍스트 손실 검출
map.on('error', (e) => {
  const msg = e?.error?.message ?? '';
  if (msg.toLowerCase().includes('webgl')) setError(`WebGL 컨텍스트 손실: ${msg}`);
});

// 4) cleanup throw도 흡수
return () => {
  try { map.remove(); } catch {}
  mapRef.current = null;
};
```

배포하고 헤드리스 회귀 통과 — 깔끔하게 끝났다고 생각했다.

## 사용자 환경에서 보고된 후속

방어 코드 직후 사용자가 "내 환경에서 안 열림"이라며 `chrome://gpu` 출력 전체 + 스크린샷을 첨부했다. 안내 메시지는 의도대로 떠 있었지만, 실제 원인은 내 첫 가설이 아니었다.

```
Graphics Feature Status
=======================
* Canvas: Software only. Hardware acceleration disabled
* OpenGL: Disabled
* WebGL: Disabled
* WebGPU: Disabled
* Gpu compositing has been disabled

GPU0: VENDOR=0x0000, DEVICE=0x0000   ← GPU 인식 자체 실패
GL implementation: (gl=disabled,angle=none)

Problems Detected
=================
* GPU process was unable to boot: GPU access is disabled in chrome://settings.
* WebGL has been disabled via blocklist or the command line.
```

이건 누수가 아니다. **GPU process가 아예 부팅에 실패해서 chromium이 GL 경로를 통째로 차단한 상태**다. 동일 출력의 `Dawn Info` 섹션에서는 Apple M4 Pro Metal backend가 정상으로 잡혀 있었으므로(WebGPU는 `Available`) 하드웨어/OS 문제도 아니다. 환경: macOS 26.2 (Tahoe) + Chrome 147.0.7727.138.

이 환경에서 코드로 mapbox를 띄울 방법은 없다. mapbox-gl-js v3는 WebGL 전용 — WebGPU 백엔드가 없다. 복구 순서는 코드가 아니라 브라우저 설정에 있다.

```
1) chrome://settings/system → "그래픽 가속 사용" ON → Chrome 재시작
2) chrome://gpu → "WebGL: Hardware accelerated" 확인
3) chrome://flags/#ignore-gpu-blocklist Enabled, #use-angle = Metal
4) Safari/Firefox로 우회 (Safari는 Metal 직결로 ANGLE 안 거침)
```

## 같은 표면 메시지 = 세 갈래 원인

| 원인 | 트리거 | 코드로 해결 가능? | 셀프 진단 단서 |
|---|---|---|---|
| StrictMode + HMR 누적 누수 | 장시간 dev 세션, 다중 mapbox 탭 | △ — probe + try/catch로 throw는 막음, 실제 회복은 새로고침/재기동 | dev 로그에 짧은 간격 반복 발생 |
| 브라우저 GPU process 부팅 실패 | chrome://settings 가속 OFF, 누적 GPU crash | × — 브라우저 설정 변경 필요 | `chrome://gpu`의 `GPU0: VENDOR=0x0000` |
| OS·드라이버 ANGLE 비호환 | 매우 최신 OS + 신버전 Chrome | × — 다른 브라우저로 우회 | `GL implementation: (gl=disabled,angle=none)` |

표면 메시지가 같다는 게 함정이다. 첫 가설(누수)이 절반의 케이스에 맞는다고 해서 다른 원인을 가리지 않게 해선 안 된다. **헤드리스 회귀에서 통과 = 코드 정상이라는 뜻이지, 사용자 환경에서 정상이라는 뜻이 아니다.** Playwright는 매 실행 fresh Chromium 컨텍스트를 띄우므로 GPU 누수도, 누적 설정도 사라진다.

## 코드보다 안내 메시지가 더 일을 한다

내가 (1)을 가정하고 만든 안내는 처음에 이랬다.

> "다른 탭의 지도/3D 페이지를 닫거나 브라우저를 재시작한 뒤 새로고침해 주세요."

(2)·(3) 케이스에는 부정확하다. 사용자가 탭을 다 닫고 재시작해도 GPU process가 부팅 못하면 그대로다. 정확한 안내는 점검 순서를 단계별로 적는 것이다.

```
WebGL 초기화 실패 — 브라우저가 WebGL 컨텍스트를 거부했습니다.

점검 순서:
(1) chrome://settings/system → "그래픽 가속 사용" ON → Chrome 재시작
(2) chrome://gpu → "WebGL: Hardware accelerated" 확인
(3) chrome://flags/#ignore-gpu-blocklist Enabled, #use-angle = Metal
(4) 또는 Safari/Firefox에서 열어보세요.

많은 탭이 누적된 dev 세션이면 Chrome 완전 종료 후 재기동이 즉시 회복법.
```

(1)부터 (4)는 가능성 높은 순서다. (1)이 실제 케이스의 절반 이상을 커버하고, (2)가 다음, (3)·(4)가 마지막. 안내 박스에는 `whiteSpace: 'pre-line'`을 붙여서 `\n`을 줄바꿈으로 보존해야 가독성이 산다(이걸 빼먹어서 한 번 더 수정했다).

## 교훈

- WebGL을 쓰는 외부 라이브러리(mapbox/cesium/three)를 React로 마운트할 때는 **probe + try/catch + cleanup의 try {}** 4종 세트가 기본. 원인이 누수가 아니라도 표면 throw는 일관되게 잡힌다.
- 헤드리스 회귀에서 매번 통과한다고 안심하면 안 된다. fresh Chromium은 누적 상태가 없는 가장 좋은 조건이다. 사용자 환경은 그 반대다.
- 표면 메시지가 같다고 원인이 같진 않다. `chrome://gpu` 출력 한 번 보는 것이 30분 디버깅을 살린다. 첫 의심으로 가설 하나에 매달리면 (2)·(3) 케이스를 영영 못 본다.
- 안내 메시지는 단순 에러 변환이 아니라 **다음 행동 순서를 적는 자리**다. "다시 시도하세요"는 도움이 안 되고, "(1) 토글 (2) 확인 (3) 우회"는 도움이 된다. 가능성 높은 순서로 번호를 매겨야 한다.
- mapbox-gl-js v3는 WebGL 전용. WebGPU 백엔드를 쓰고 싶다면 MapLibre의 실험 빌드를 봐야 하는데, 2026년 5월 현재 프로덕션 사용은 이르다.

## 참고

- 1차 기록(현상→원인→수정→교훈): [TIL: Mapbox WebGL 컨텍스트 누수](../til/2026-05-05-mapbox-webgl-strictmode.md)
- mapbox-gl-js Map 옵션: [`failIfMajorPerformanceCaveat`](https://docs.mapbox.com/mapbox-gl-js/api/map/#map-parameters)
- React StrictMode 효과 설명: [React 공식 문서 — Strict Mode](https://react.dev/reference/react/StrictMode)
