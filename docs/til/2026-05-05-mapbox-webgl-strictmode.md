# TIL: Mapbox WebGL 컨텍스트 누수 — StrictMode + HMR이 합쳐지면 `new Map()` throw

날짜: 2026-05-05

## 현상

UX 마무리 라운드(슬라이더 비동기 색칠 + 분포 차트 + 모바일 collapsible) 작업을 사용자 브라우저에서 확인하던 중 콘솔 에러 발생:

```
Console Error
Failed to initialize WebGL

  154 |     mapboxgl.accessToken = token;
> 156 |     const map = new mapboxgl.Map({
      |                 ^
  157 |       container: containerRef.current,
```

`.next/dev/logs/next-development.log`에서도 동일 에러가 짧은 간격(15:13:30, 15:13:37, 15:13:45, 15:13:56, 15:13:57)으로 반복 — 페이지 새로고침마다 재발. Playwright로 fresh Chromium 세션에서는 정상 렌더링됐으므로 코드 로직 자체의 문제는 아니다.

## 원인

세 요인이 합쳐졌다.

1. **React 19 StrictMode (Next.js dev 기본)**: useEffect가 mount → cleanup → mount 순으로 두 번 실행. mapbox의 `new Map()` → `map.remove()` → `new Map()`이 한 mount 사이클 내에서 일어난다.
2. **Turbopack HMR**: 컴포넌트 구조 변경(나는 `ControlPanel`을 `ControlPanel` + `ControlPanelBody`로 분리하면서 useState 추가)이 들어가면 MapPage 자체가 재생성되며 useEffect가 또 다시 mount → cleanup → mount 사이클을 돈다.
3. **mapbox `map.remove()`의 비동기 WebGL 컨텍스트 해제**: `remove()`는 동기 호출이지만 GPU 리소스(특히 WebGL context)는 브라우저 GC에 맡겨진다. 다음 `new Map()`이 즉시 새 컨텍스트를 요청하면 브라우저가 제한(보통 동시 8~16개)에 도달해 거부한다.

세 번째가 핵심. dev 환경에서 자주 저장 → HMR이 누적되면 결국 브라우저가 WebGL을 거부하고, 그 상태는 페이지 새로고침으로 즉시 복구되지 않는다(브라우저 재시작이나 다른 WebGL 탭 닫기 필요).

| 환경 | 결과 |
|---|---|
| Playwright (fresh Chromium, isolated session) | 정상 |
| 사용자 Chrome (장시간 dev 세션 + 누적 HMR) | `Failed to initialize WebGL` |

## 수정

`web/app/page.tsx` 지도 init useEffect를 방어적으로 재작성. 핵심은 "에러를 throw하지 말고 친절한 안내로 변환".

```diff
+    // WebGL 사전 체크 — 컨텍스트 생성 자체가 실패하면 mapbox `new Map()`이 throw한다.
+    const probeCanvas = document.createElement('canvas');
+    const probeGl =
+      probeCanvas.getContext('webgl2') ||
+      probeCanvas.getContext('webgl') ||
+      probeCanvas.getContext('experimental-webgl');
+    if (!probeGl) {
+      setError('WebGL 초기화 실패 — 다른 탭의 지도/3D 페이지를 닫거나 브라우저를 재시작...');
+      return;
+    }

     mapboxgl.accessToken = token;

-    const map = new mapboxgl.Map({...});
+    let map: mapboxgl.Map;
+    try {
+      map = new mapboxgl.Map({
+        ...,
+        failIfMajorPerformanceCaveat: false,
+      });
+    } catch (err) {
+      setError(`Mapbox 초기화 실패: ${err.message} — 브라우저 재시작 후 다시 시도...`);
+      return;
+    }
     mapRef.current = map;
+
+    map.on('error', (e) => {
+      const msg = e?.error?.message ?? '';
+      if (msg.toLowerCase().includes('webgl')) setError(`WebGL 컨텍스트 손실: ${msg}`);
+    });

     // ... 기존 layer/source/handler 등록 ...

     return () => {
+      try {
         map.remove();
+      } catch {
+        // mapbox 내부 cleanup 실패해도 useEffect cleanup은 throw하지 않는다
+      }
       mapRef.current = null;
     };
```

5가지가 함께 동작한다:
- **WebGL 사전 probe**: 별도 canvas로 컨텍스트 생성 시도. 실패하면 mapbox에 가지도 않고 명확한 안내.
- **`new Map()` try/catch**: probe가 통과해도 mapbox-internal에서 throw하면 friendly error로 변환.
- **`failIfMajorPerformanceCaveat: false`**: 저성능 GPU/Apple Silicon 일부에서 보호.
- **`map.on('error', ...)`**: 런타임 중 컨텍스트 손실(`webglcontextlost`) 검출.
- **cleanup `try { map.remove() }`**: cleanup이 throw해도 `mapRef.current = null`은 항상 실행 — 다음 mount가 dead ref에 막히지 않는다.

## 추가 사례 — Apple M4 Pro / macOS 26.2 / Chrome 147에서 GPU 전체 disabled

방어 코드를 박은 직후, 사용자(Apple M4 Pro, macOS 26.2 Tahoe, Chrome 147.0.7727.138)의 환경에서는 친절한 메시지가 떴지만 **실제 원인은 StrictMode 누수가 아니라 Chrome이 GPU를 통째로 disable한 상태**였다. `chrome://gpu` 출력:

```
GPU0                : VENDOR=0x0000, DEVICE=0x0000      ← GPU 인식 자체 실패
GL implementation   : (gl=disabled,angle=none)
* GPU process was unable to boot: GPU access is disabled in chrome://settings.
* WebGL has been disabled via blocklist or the command line.
* Gpu compositing has been disabled
```

흥미롭게도 Dawn 섹션은 Apple M4 Pro Metal backend가 정상으로 잡혀 있었다 — **WebGPU는 OK, GL/ANGLE 경로만 차단**. 하드웨어/OS 문제가 아니라 chromium의 GPU process 부팅 실패. 가능한 트리거:
- macOS 26.2 (Tahoe)는 매우 최신 — Chrome 147 ANGLE driver가 호환 미흡
- `chrome://settings/system`의 "그래픽 가속 사용" 토글이 OFF
- Chrome 시작 시 GPU process crash 후 자동 disable

복구 순서:
1. `chrome://settings/system` → "그래픽 가속 사용" ON → Chrome 재시작
2. `chrome://flags/#ignore-gpu-blocklist` Enabled, `chrome://flags/#use-angle` = Metal
3. Chrome 완전 종료 후 재기동
4. 그래도 안 되면 Safari/Firefox로 우회 (Safari는 Metal 직결로 ANGLE 안 거침)

mapbox-gl-js v3는 WebGL 전용 — WebGPU 경로 없음. 이 환경에서는 **코드로 우회 불가능**, 브라우저 설정 변경이 유일한 해법. 친절한 안내에 정확한 점검 순서를 박아 셀프 진단 가능하게 보강했다.

## 교훈

- dev 환경에서 mapbox/Three.js처럼 WebGL을 쓰는 라이브러리는 StrictMode + HMR로 **누적 누수**가 일어난다. 프로덕션에서는 StrictMode가 없어 문제 안 됨 — dev-only 함정.
- Playwright fresh session에서 통과 = 코드 정상이라는 뜻이지만, **사용자의 장시간 dev 세션 / GPU disabled 환경**에서는 다른 문제다. UI 검증은 항상 새 incognito 창과 누적 dev 창 양쪽에서.
- WebGL 같은 외부 리소스를 쓰는 useEffect는 **항상 try/catch + 사전 probe + cleanup의 try {}**가 기본 패턴. mapbox/cesium/three 모두 같다.
- `failIfMajorPerformanceCaveat: false`는 mapbox v3 기본값이긴 하지만 명시하는 편이 환경 의존성 제거에 도움.
- "WebGL 초기화 실패"는 표면 메시지가 같아도 원인이 셋 이상: (1) StrictMode/HMR 누수 (2) 브라우저 GPU process disable (3) macOS-Chrome 버전 호환. 안내 메시지에 점검 순서를 명시해야 셀프 진단 가능.
- macOS 최신 OS + Chrome 신버전 조합은 ANGLE 호환에서 종종 깨진다. `chrome://gpu` 한 번 보는 게 30분 디버깅을 살린다.
