# TIL: Mapbox 토큰 URL restriction은 wildcard 미지원 — Vercel preview를 위해 token 분리

날짜: 2026-05-05

## 현상

production 배포 직후 `NEXT_PUBLIC_MAPBOX_TOKEN`을 그대로 client 번들에 노출시키는 게 부담스러워 Mapbox 콘솔(`console.mapbox.com/account/access-tokens/`)에서 신규 토큰 발급 + URL restrictions를 걸려 했다. tasks.md에 적어둔 4줄을 그대로 입력하니 거부:

```
http://localhost:*
https://eodigakka.vercel.app
https://*.vercel.app
https://*-jetsongdev.vercel.app
```

→ Mapbox UI: `Wildcard characters (*) are not supported in URL restrictions.`

`localhost:*`도 거부 — port wildcard도 wildcard 취급. `*.vercel.app` subdomain wildcard도 동일하게 거부.

## 원인

Mapbox URL restriction은 **scheme + host + port의 정확한 origin 매칭**만 허용한다. 정규식·wildcard·서브도메인 패턴 모두 미지원. 공식 문서도 `https://www.mapbox.com, https://studio.mapbox.com`처럼 정확한 URL 한 줄씩 등록을 명시한다.

이게 Vercel과 충돌하는 지점:

| 환경 | URL 패턴 | restriction 등록 가능? |
|---|---|---|
| Production | `https://eodigakka.vercel.app` (고정) | ✅ |
| Production custom domain | `https://<custom>.com` (있다면 고정) | ✅ |
| Preview | `https://eodigakka-git-feat-xxx-jetsongdev.vercel.app` (PR마다 hash) | ❌ 사전 등록 불가 |
| Preview (commit URL) | `https://eodigakka-<10자hash>-jetsongdev.vercel.app` (push마다 hash) | ❌ |
| Local dev | `http://localhost:3000`, `:3002` (점유 시 자동 변경) | △ port별로 명시 등록만 |

Preview URL은 push마다 새 hash가 붙어 origin이 매번 바뀐다. wildcard가 안 되는 이상 단일 토큰으로 production + preview를 동시 보호할 수 없다.

## 수정

**환경별 토큰 분리** 패턴으로 우회.

1. Mapbox 콘솔에서 신규 토큰 1개 발급:
   - 이름: `eodigakka-prod`
   - scopes: default 5개(`STYLES:TILES`, `STYLES:READ`, `FONTS:READ`, `DATASETS:READ`, `VISION:READ`) — `mapbox-gl` base map 용도는 이걸로 충분
   - URL restrictions: `https://eodigakka.vercel.app` 한 줄만

2. 기존 default token은 **unrestricted 그대로 유지** — local dev + Preview 배포에서 쓴다.

3. Vercel `Settings → Environment Variables`에서 같은 키를 환경별로 분리:
   - `NEXT_PUBLIC_MAPBOX_TOKEN` Production = 신규 `eodigakka-prod` token
   - `NEXT_PUBLIC_MAPBOX_TOKEN` Preview = 기존 default token (unrestricted)
   - `web/.env.local`에는 default token만 박아둠 (local dev = preview env와 동등 취급)

4. Production redeploy 트리거(env 변경은 자동 재배포 안 함) — `Deployments → 최신 production → Redeploy → Use existing Build Cache 체크 해제`.

5. 검증:
   - `https://eodigakka.vercel.app` 지도 폴리곤 색칠 정상 — restriction 통과 확인.
   - Preview URL에서도 지도 정상 — default token이 unrestricted이므로 어떤 hash URL이든 작동.
   - DevTools Network → `api.mapbox.com/styles/v1/.../tiles/...?access_token=pk.eyJ1...` token prefix가 production은 신규, preview는 기존으로 분리되는지 확인.

## 교훈

- **Mapbox URL restriction은 정확한 origin만**. wildcard·port wildcard·subdomain 패턴 모두 거부. 공식 docs의 입력 예(`https://www.mapbox.com, https://studio.mapbox.com`)가 곧 룰.
- **Vercel preview URL은 hash 기반이라 사전 등록 불가**. wildcard가 안 되는 보안 도구(Mapbox, reCAPTCHA, 일부 OAuth provider 등)와 결합할 땐 environment별 분리 발급이 표준 패턴.
- **`NEXT_PUBLIC_*` token의 1차 방어선은 URL restriction**. client 번들에 박혀 있어 본질적으로 노출되지만, restriction이 다른 origin에서의 abuse 비용을 올린다. local·preview에서는 이 방어를 포기하는 trade-off가 합리적 — 노출 표면이 production 대비 작고(Preview URL은 PR-only) abuse 시 production 사용량에 영향이 없다.
- **Vercel env는 같은 key를 환경별로 다른 value로 박을 수 있다**. UI에서 Production / Preview / Development 체크박스로 분리되며, 각 환경 빌드 시점에 해당 value만 inject된다. 이걸 알아두면 보안 ↔ UX 분리가 가능.
- **env 변경 후엔 수동 redeploy 필요**. Vercel이 env 변경을 자동 재배포 트리거 안 함. `Use existing Build Cache 체크 해제`로 새 빌드 강제.
