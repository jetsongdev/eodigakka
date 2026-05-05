---
title: "Mapbox 토큰을 'http://localhost:*'로 잠그려다 만난 wildcard 금지의 벽"
date: 2026-05-05
status: draft
tags: [mapbox, vercel, security, nextjs]
---

## 한 줄

`NEXT_PUBLIC_*` token을 client 번들에 노출시키는 게 부담스러워 Mapbox URL restriction을 걸려 했더니, wildcard가 안 됐다. Vercel preview URL은 hash 기반이라 사전 등록도 불가능. 결국 **production 토큰과 preview 토큰을 분리 발급**하는 게 해법.

## 시작

production 배포가 끝나고 한 줄짜리 보안 항목이 남았다.

> Mapbox 토큰 도메인 화이트리스트 — `https://account.mapbox.com/access-tokens/` 해당 토큰 → URL restrictions 등록

`NEXT_PUBLIC_*` prefix가 붙은 환경변수는 Next.js가 build time에 client 번들로 inject한다. 즉 누구든 `view-source`로 토큰을 볼 수 있다. Mapbox는 이 사실을 인지하고 있어, 토큰 단위로 "이 origin에서만 허용" 화이트리스트를 제공한다. 그게 URL restriction.

처음에 작성한 4줄은 이렇다 — production, preview, local 셋 다 커버하려는 의도.

```
http://localhost:*
https://eodigakka.vercel.app
https://*.vercel.app
https://*-jetsongdev.vercel.app
```

콘솔에서 첫 줄을 입력하자마자 거부:

```
Wildcard characters (*) are not supported in URL restrictions.
```

`localhost:*`도 wildcard 취급. `*.vercel.app`은 더 명백한 wildcard. 한 줄도 살아남지 못했다.

## 동작 원리

Mapbox URL restriction은 **scheme + host + port의 정확한 origin 매칭**만 허용한다. 정규식·wildcard·subdomain 패턴 전부 미지원. 공식 문서의 입력 예가 이 룰을 그대로 보여준다:

> `https://www.mapbox.com, https://studio.mapbox.com`

쉼표로 여러 개 등록은 가능하지만, 각각이 정확한 origin이어야 한다.

이게 Vercel과 부딪히는 지점이 명확하다.

| 환경 | URL 패턴 | restriction 등록 가능? |
|---|---|---|
| Production | `https://eodigakka.vercel.app` (고정) | ✅ |
| Preview | `https://eodigakka-git-feat-xxx-jetsongdev.vercel.app` (PR마다 hash) | ❌ |
| Preview commit URL | `https://eodigakka-<10자hash>-jetsongdev.vercel.app` (push마다 hash) | ❌ |
| Local dev | `http://localhost:3000`, `:3002` | △ port별 명시만 |

Vercel preview URL은 push마다 새 hash가 붙는다. wildcard가 안 되는 이상 단일 토큰으로 production + preview 동시 보호는 불가능. "Mapbox URL restriction을 등록하면 Vercel preview에서 지도가 안 뜬다" — 이 trade-off가 본질이다.

## 우회

Vercel `Settings → Environment Variables`는 같은 key를 환경별로 다른 value로 박을 수 있다. UI에서 Production / Preview / Development 체크박스로 분리되며, 각 환경 빌드 시점에 해당 value만 inject된다.

이걸 활용한 환경별 토큰 분리 패턴.

1. **신규 토큰 발급** — Mapbox 콘솔에서 `eodigakka-prod`라는 이름으로 한 개. URL restriction은 `https://eodigakka.vercel.app` 한 줄만.
2. **기존 default token은 unrestricted 유지** — local + preview 용도.
3. **Vercel env 분리 등록**:
   - `NEXT_PUBLIC_MAPBOX_TOKEN` Production = 신규 `eodigakka-prod`
   - `NEXT_PUBLIC_MAPBOX_TOKEN` Preview = 기존 default
   - 로컬 `.env.local`에는 default만
4. **Production redeploy** — env 변경은 자동 재배포 안 함. `Deployments → 최신 production → ⋯ → Redeploy → Use existing Build Cache 체크 해제`.

검증은 DevTools의 Network 탭에서 `api.mapbox.com/styles/v1/.../tiles/...?access_token=pk.eyJ1...` 요청의 token prefix를 보면 된다. production URL에선 신규 prefix, preview URL에선 기존 prefix가 보이면 분리 성공.

## 보안 ↔ UX의 경계가 어디 있나

이 우회의 비용은 분명하다 — preview·local 토큰은 사실상 unrestricted라 leak되면 abuse 가능. 그런데 그 표면이 production 대비 작다:

- **Preview URL은 PR-only**. PR 닫히면 deployment는 살아 있지만 발견되기 어렵고, production traffic의 일부가 아니라 abuse가 production 사용량에 영향 없다.
- **Local은 외부 비노출** — 본인 머신만.
- **Mapbox free tier 50k loads/month** — preview URL이 발견돼서 abuse당해도 경고 알림이 먼저 도착한다.

Production만 strict하게 막아두면 abuse가 production billing으로 청구되는 worst case는 차단된다. 그게 이 패턴의 핵심.

## 일반화

`NEXT_PUBLIC_*` token security hardening 절차로 일반화 가능:

1. third-party 콘솔에서 production 전용 token 발급 + URL/origin restriction 등록
2. Vercel env Production을 새 token으로 교체
3. Preview / Development는 기존 unrestricted token 유지
4. Production redeploy (캐시 해제)
5. DevTools에서 token prefix로 환경별 분리 검증

Sentry DSN, Analytics token, 자체 backend의 client API key 등 client 번들에 박히는 모든 token에 동일 적용.

## 참고

- TIL: [`docs/til/2026-05-05-mapbox-token-url-restriction.md`](../til/2026-05-05-mapbox-token-url-restriction.md)
- ADR-009: client-side 토큰 환경별 분리 발급 (`SPEC.md` §15)
