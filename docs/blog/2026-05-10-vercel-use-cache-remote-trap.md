---
captured: 2026-05-10
topic: Next.js 16 'use cache' vs 'use cache: remote' — Vercel serverless에서 default profile은 ephemeral
series-candidate: 정글 실험실
project: eodigakka
---

# Next.js 16 'use cache' vs 'use cache: remote' — Vercel serverless에서 default profile은 ephemeral

## 현장 메모

PR #22로 Stage 2b를 머지했다. 의도는 명확했다:
- `cacheComponents: true` 활성
- `/api/affordable`·`/api/dong/[bjd]/complexes` route handler에 `'use cache'` directive
- `cacheLife({ revalidate: 3600 })` + `cacheTag('mv_dong_stats')`
- ETL workflow 03:00에 `/api/revalidate?tag=mv_dong_stats` POST로 invalidate

로컬 `npm run dev`에서 검증했다. 첫 호출 `_timing.stats_ms=54.3`, 두 번째 호출에서 정확히 같은 값 = cache HIT. PR 통과 → Production deploy.

며칠 뒤 다시 측정해보니 Production에서 **캐시가 전혀 작동 안 함**. 같은 params로 5회 연속:

```
call 1: stats=1893.7  fresh=1656.3   generated_at=10:59:13
call 2: stats=465.2   fresh=230.2    generated_at=10:59:14
call 3: stats=463.5   fresh=230.0    generated_at=10:59:16
call 4: stats=464.6   fresh=230.1    generated_at=10:59:17
call 5: stats=1800.6  fresh=1596.4   generated_at=10:59:20  ← 5번째 또 cold
```

`_timing` 매번 다름 = 함수 본문 매번 재실행. `generated_at` 갱신 = 응답 body 새로 생성. 캐시 히트라면 첫 호출의 timing 값이 5번 동일하게 박혀나와야 한다 (같은 deploy의 `/api/polygons`는 그렇게 동작 — `_timing.db=2734.2`이 5번 정확히 박힘, `x-vercel-cache: HIT`).

코드만 보면 문제가 없다. `cacheComponents: true` 박혀있고, `'use cache'` directive 정확히 위치, `cacheTag` · `cacheLife` 정상 호출. 그런데 안 된다.

원인은 Vercel Runtime Cache 공식 문서 한 줄에 있었다:

> - `'use cache'` (no `: remote`) — **in-memory only, ephemeral per instance**
> - `'use cache: remote'` — stores in Vercel Runtime Cache

기본 profile `'use cache'`는 함수 인스턴스 내부 메모리. Vercel은 serverless라 invocation마다 다른 lambda instance에 라우팅될 수 있고, 새 instance는 cold start하면 메모리가 빈 상태. 매 호출 사실상 cache miss.

`'use cache: remote'`라야 Vercel Runtime Cache (per-region persistent KV)에 저장돼 instance 간 공유.

게다가 폴리곤이 작동했던 이유도 다시 봐야 했다. `_timing` 5번 동일, `x-vercel-cache: HIT` — 이건 `'use cache'` 덕분이 아니라 응답 헤더 `Cache-Control: public, max-age=86400` 때문. **Vercel CDN edge cache**가 응답을 가로채서 함수 자체를 호출 안 시킨 것. `'use cache'` directive와 무관한 별개 layer.

수정: 1줄씩 3개 파일.

```diff
-  'use cache';
+  'use cache: remote';
```

```diff
-  revalidateTag(tag, 'default');
+  revalidateTag(tag, { expire: 0 });
```

(webhook 외부 트리거는 `{ expire: 0 }`이 권장. `'default'`는 stale-while-revalidate라 ETL 03:00 webhook 직후 첫 사용자가 stale 받음.)

핵심 교훈 3개:

1. **로컬 검증으로는 이 함정 못 잡는다.** dev 서버는 단일 process 메모리라 `'use cache'`가 잘 동작한다. Production에서만 silent하게 깨진다.
2. **검증 패턴**: 같은 params로 5회 연속 호출 → 응답 body의 `_timing` · `generated_at`이 동일한지 본다. 변하면 함수 매번 실행 = cache 미작동.
3. **CDN 헤더와 Cache Components는 다른 layer.** `Cache-Control` 헤더는 Vercel CDN edge가 처리(함수 자체 안 부름). `'use cache'`는 함수 내부 결과 캐시. 둘 중 한쪽이 안 돼도 다른 쪽이 가려줄 수 있다(폴리곤이 그 케이스). 측정할 때 응답 헤더 `x-vercel-cache` + body `_timing`을 같이 봐야 어느 layer에서 hit 중인지 분리된다.

## 다음 단계

- [ ] jetsong-dev 아이디어 등록됨: `docs/content-ideas/3-lab/2026-05-10-vercel-use-cache-remote-trap.md`
- [ ] 초안 작성 시 이 파일 + `docs/til/2026-05-10-vercel-use-cache-vs-remote.md` 참고
- [ ] PR #23 merge 후 production 검증 결과(before/after `_timing` 비교 + `x-vercel-cache` 헤더 캡처)를 글에 추가
- [ ] 코드 스니펫 1~2개로 압축 (전체 route 길이 → 핵심 directive 한 줄)
