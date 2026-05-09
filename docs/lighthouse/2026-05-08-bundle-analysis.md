# 번들 분석 — 275KB unused JS 정체 (2026-05-08)

`docs/lighthouse/2026-05-08-baseline.md`에서 모바일 Performance 73의 단일 최대 병목은 **`unused-javascript` 1,570ms**, 그중 가장 큰 청크 486KB / 미사용 275KB. 이 문서는 그 청크의 정체를 Turbopack `next experimental-analyze` 결과로 파헤친다.

실행: `cd web && npm run analyze` (출력은 `.next/diagnostics/analyze/`)

## 결론

**이 청크의 97%가 `mapbox-gl` 단일 라이브러리.** 동적 import로 첫 페인트 임계 경로에서 빼는 것이 가장 큰 회수.

## 청크별 내역 (raw bytes, 클라이언트 번들만)

| 청크 | 크기 raw | 크기 gz (Lighthouse 기준) | 주요 내용 |
|---|---:|---:|---|
| **`133~20sgwj04g.js`** | **1,744KB** | **475KB** | **mapbox-gl 97% (1,745KB)** + page.tsx 24KB + radix-slider 14KB |
| `0.5bahwbc4-7v.js` | 222KB | 74KB | Next.js client runtime |
| `01q7kecqbi27~.js` | 192KB | 75KB | Next.js shared/router |
| `03~yq9q893hmn.js` | 110KB | 39KB | Next.js polyfill-nomodule |
| `148ab81d.n3gk.js` | 57KB | 22KB | Next.js client components |

총 클라이언트 청크: 8개, 2.3MB raw / 700KB gzipped (Lighthouse `total-byte-weight: 2,544 KiB`와 일치).

## 왜 mapbox-gl이 첫 페인트에 통째로 들어가는가

`app/page.tsx:4`:

```ts
import mapboxgl from 'mapbox-gl';
```

정적 top-level import → 페이지 번들에 mapbox-gl 1.7MB가 inlining. mapbox-gl은 단일 파일로 ship돼 tree-shaking이 거의 불가능 (terrain·draco·RTL plugin·tile decoder 등이 모두 main entry에 포함).

Lighthouse가 보고한 275KB unused = 첫 paint 시 사용 안 되는 mapbox 내부 기능들. 이건 라이브러리 내부 구조라 우리가 줄일 수 없다 — 대신 **로드 자체를 미루는 게** 답.

## 권장 수정

### 1차 (제안): `next/dynamic`으로 Map 분리 — `ssr: false`

현재 `app/page.tsx`는 1,517줄짜리 단일 client component. mapbox 사용 영역(useEffect로 `new mapboxgl.Map(...)` + ref 처리 + 마커/툴팁/이벤트)을 별도 파일 `components/MapView.tsx`로 추출하고 dynamic import:

```tsx
// app/page.tsx
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});
```

기대 효과:
- **Initial JS critical path: 1,744KB → ~250KB** (mapbox + page.tsx mapbox 부분이 별도 chunk로 빠짐)
- 모바일 TBT/TTI 개선 (`bootup-time` 1.1s에서 큰 비중 절감 예상)
- **LCP도 개선 예상** — `lcp-breakdown-insight`로 식별한 LCP 요소는 **푸터 면책 div** (`body > div > footer > div`, "면책: 이 사이트는 임장 후보를…", boundingRect 384×49). 지도 캔버스가 아니다. FCP 0.8s vs LCP 5.5s 격차의 원인은 mapbox-gl 1.7MB 파싱이 main thread를 점유해서 footer text의 "stable paint" 시점이 5.5s까지 밀린 것으로 추정. mapbox를 임계 경로에서 빼면 footer 텍스트가 빨리 안정화되어 LCP가 크게 떨어질 가능성 높음
- FCP는 변동 적음 (이미 0.8s, 첫 HTML/CSS 경로엔 영향 없음)

코스트:
- 1,517줄 page.tsx에서 map 관련 로직 분리 — props·shared state 경계 설정 필요. 슬라이더·토글·affordable fetch 결과 등 상태는 page.tsx에 두고 props로 내려주는 패턴.
- 작업량: 중간 (한 PR로 가능, 200~400줄 이동 + props interface)

### 2차 (대안): `await import('mapbox-gl')` inside useEffect

훨씬 작은 수정 — `import mapboxgl from 'mapbox-gl'` 제거 후 useEffect 안에서 `const mapboxgl = (await import('mapbox-gl')).default`. 하지만 이 방식은 Turbopack/Next가 같은 chunk에 묶을 수 있어 효과가 보장되지 않는다. 1차안이 더 명확.

### 보너스: WebGL 사전 체크 시점 변경

`app/page.tsx:190` "WebGL 사전 체크"는 mapbox `new Map()` 전에 동기 검사 중. dynamic-import로 Map이 빠지면 이 체크도 함께 MapView 안으로 이동.

## 다음 결정 포인트

이 PR을 어디까지 가져갈지 — Mr. Song 결정 필요:

- **A (이 PR 한정 — 도구만)**: `npm run analyze` 스크립트 + 본 분석 doc만 커밋. 실제 dynamic import는 별도 PR. 깔끔하고 회귀 위험 0.
- **B (이 PR에서 끝까지)**: A + MapView 추출 + dynamic import + e2e 회귀 검증. 한 PR로 효과 측정까지.

A → B로 넘어가는 트리거: 이 분석 결과 동의 + e2e 안전망 신뢰.
