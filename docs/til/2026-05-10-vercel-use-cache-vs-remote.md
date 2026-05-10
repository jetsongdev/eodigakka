# TIL: Next.js 16 `'use cache'` vs `'use cache: remote'` — Vercel serverless 함정

날짜: 2026-05-10

## 현상

PR #22 Stage 2b로 `'use cache'` + `cacheLife({ revalidate: 3600 })` + `cacheTag('mv_dong_stats')`를 `/api/affordable`·`/api/dong/[bjd]/complexes` route handler에 박고 production deploy. 그런데 Production에서 같은 params로 5회 연속 호출 측정해보니 캐시가 전혀 작동 안 함:

```
call 1: stats=1893.7 fresh=1656.3  generated_at=10:59:13
call 2: stats=465.2  fresh=230.2   generated_at=10:59:14
call 3: stats=463.5  fresh=230.0   generated_at=10:59:16
call 4: stats=464.6  fresh=230.1   generated_at=10:59:17
call 5: stats=1800.6 fresh=1596.4  generated_at=10:59:20  ← 5번째 다시 cold
```

`_timing` 값이 매 호출 다름 = 함수 본문 매번 재실행. `generated_at` 갱신 = 응답 body 새로 생성. cache hit이라면 첫 호출의 timing 값이 5번 동일하게 박혀나와야 함 (실제로 `/api/polygons`는 `_timing.db=2734.2`이 5번 정확히 박혀나옴 — `x-vercel-cache: HIT`).

`cacheComponents: true`도 `next.config.js`에 박혀있고, `'use cache'` directive도 함수 안에 정확히 위치, `cacheTag` · `cacheLife`도 정상 호출. 코드만 보면 문제 없어 보임.

## 원인

Vercel Runtime Cache 공식 문서:

> ### Next.js 16+ (`use cache: remote`)
> - `'use cache'` (no `: remote`) — **in-memory only, ephemeral per instance**
> - `'use cache: remote'` — stores in Vercel Runtime Cache

`'use cache'` 기본 profile은 **함수 인스턴스 내부 메모리 캐시**. Vercel은 serverless라 invocation마다 다른 lambda instance에 라우팅될 수 있고, instance가 cold start하면 메모리는 빈 상태. 결과적으로 매 호출 사실상 cache miss.

`'use cache: remote'`는 **Vercel Runtime Cache** (per-region, persistent KV store)에 저장 → 같은 region 내 모든 invocation/instance가 공유.

`/api/polygons`가 작동했던 이유는 `'use cache'` directive 때문이 아니라 응답에 박힌 `Cache-Control: public, max-age=86400` HTTP 헤더 때문. **Vercel CDN edge cache**가 응답을 가로채서 함수 자체를 호출 안 시킴 (`x-vercel-cache: HIT` 확인). `'use cache'` directive는 이 경우 사실상 no-op.

추가 함정: `/api/revalidate` route의 `revalidateTag(tag, 'default')` — webhook(외부 트리거)에서는 `{ expire: 0 }`이 권장. `'default'`는 stale-while-revalidate라 ETL 03:00 webhook 직후 첫 사용자가 stale 받음.

| Profile | 저장소 | Vercel 작동 |
|---|---|---|
| `'use cache'` (default) | in-memory, per instance | ❌ serverless에서 ephemeral |
| `'use cache: remote'` | Vercel Runtime Cache (regional KV) | ✅ persistent, instance 공유 |
| `'use cache: private'` | per-request (compliance) | runtime API 사용 가능 |
| `Cache-Control: public, max-age=N` 헤더 | Vercel CDN edge | ✅ 함수 자체를 안 부름 |

## 수정

```diff
 // web/app/api/affordable/route.ts
 async function fetchAffordableData(...) {
-  'use cache';
+  'use cache: remote';
   cacheLife({ revalidate: 3600 });
   cacheTag('mv_dong_stats');

 // web/app/api/dong/[bjd]/complexes/route.ts
 async function fetchComplexesData(bjd) {
-  'use cache';
+  'use cache: remote';
   cacheLife({ revalidate: 3600 });
   cacheTag('mv_dong_stats', `complexes-${bjd}`);

 // web/app/api/revalidate/route.ts
-  revalidateTag(tag, 'default');
+  revalidateTag(tag, { expire: 0 });
```

폴리곤은 그대로 유지 — `Cache-Control: public, max-age=86400` 헤더로 CDN 캐시가 작동 중. 굳이 건드릴 이유 없음.

## 교훈

1. **`'use cache'`만으로는 Vercel serverless에서 캐시 안 된다.** route handler·function-level 캐시가 invocation 간 공유돼야 한다면 반드시 `'use cache: remote'`. 로컬 `npm run dev`에서는 단일 process 메모리라 cache hit가 잘 잡히지만, Vercel deploy 후엔 같은 코드여도 매번 miss. **로컬 검증으로는 이 함정 못 잡는다 — production 실측 필수.**
2. **Cache가 작동하는지 검증 패턴**: 같은 params로 5회 연속 호출 → 응답 body 안의 `_timing` · `generated_at`이 동일한지 확인. 매번 다르면 함수 본문 매번 재실행 = cache 미작동.
3. **CDN 헤더 vs Cache Components는 다른 layer.** `Cache-Control: public, max-age=N` 응답 헤더는 Vercel CDN edge가 처리(함수 자체 안 부름). `'use cache'` / `'use cache: remote'`는 함수 내부 결과 캐시. 두 layer는 독립적으로 작동하니 한쪽이 안 돼도 다른 쪽이 가려줄 수 있음(폴리곤 케이스). 측정할 때는 응답 헤더(`x-vercel-cache`) + body `_timing` 둘 다 봐야 어느 layer에서 캐시 히트 중인지 분리 가능.
4. **`revalidateTag`의 두 번째 인자**: webhook(외부 트리거 즉시 invalidate)은 `{ expire: 0 }`, Server Action 후 stale-while-revalidate는 `'max'` 또는 `'default'`. Next.js 16에서 단일 인자 `revalidateTag(tag)`는 deprecated.
