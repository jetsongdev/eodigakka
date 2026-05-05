---
name: client-token-rotation
description: NEXT_PUBLIC_* 같은 client 번들 노출 토큰을 third-party 콘솔에서 production 전용으로 분리 발급하고 Vercel 환경별 env에 박은 뒤 redeploy + 검증하는 워크플로. 사용자가 "Mapbox 토큰 화이트리스트", "Sentry DSN 분리", "Analytics key 보안 강화", "client-side 토큰 rotate", "production token만 따로", "토큰 도메인 제한" 같이 요청하거나, 외부 서비스 콘솔에서 URL/origin restriction을 걸려 할 때 사용. 함정 사전 경고(wildcard 미지원 가능성·preview URL hash 변동성·env 변경 후 수동 redeploy 필요)와 단계별 안내(콘솔 발급 → Vercel env 분리 → redeploy → DevTools 검증)를 포함하며, 끝나면 til-flow로 자동 연결한다. 다른 client-side 토큰(Stripe publishable key, GA, PostHog, 자체 backend client API key 등)에도 동일 적용 가능.
---

# client-token-rotation

eodigakka 프로젝트의 client-side 토큰 환경별 분리 워크플로.

`NEXT_PUBLIC_*` prefix처럼 build time에 client 번들로 inject되는 토큰은 본질적으로 누구나 `view-source`로 볼 수 있다. 그래서 third-party 서비스가 제공하는 URL/origin restriction이 1차 방어선. 그런데 Vercel preview URL은 push마다 hash가 바뀌어 사전 등록이 불가능 → **production 전용 strict 토큰 + preview/local용 default unrestricted 토큰**으로 분리하는 게 표준 패턴.

이 스킬은 그 5단계를 자동화 가이드로 박는다.

---

## 트리거 판단

### 적용해야 할 때

다음 신호 중 하나라도 있으면 트리거 우선 제안:

- 사용자가 client-side 토큰의 보안 강화를 요청 ("Mapbox 토큰 도메인 제한", "Sentry DSN 분리", "Analytics key 보호" 등)
- third-party 콘솔에서 URL restriction / origin allowlist / referrer restriction 등을 등록하려 함
- `NEXT_PUBLIC_*` 환경변수 추가 또는 회전 작업
- Production token leak 의심 또는 정기 rotation
- tasks.md에 "토큰 화이트리스트" 류 항목이 있고 처리 시점

### 적용하지 않아야 할 때

- server-side 전용 token (`DATABASE_URL`, server API keys 등) — client 번들에 inject되지 않으므로 환경별 분리는 가능하나 "URL restriction" 개념이 없다. 이 스킬의 함정 경고가 무관함
- Vercel env 단순 추가/수정 (분리·rotate 의도 없음)
- 사용자가 "그냥 한 토큰으로 다 쓰겠다"라고 보안 trade-off를 명시적으로 받아들인 경우

---

## 입력 추출

대화 컨텍스트에서 4가지를 뽑는다. 부족하면 한 번에 묶어 묻는다.

| 슬롯 | 무엇 | 어디서 추출 |
|---|---|---|
| **token 종류** | Mapbox / Sentry / Analytics / Stripe / 기타 | 사용자 요청, 기존 `.env.local` 또는 Vercel env에 등록된 키 이름 |
| **third-party 콘솔 URL** | restriction 등록 페이지 | 서비스별 표준 URL (Mapbox: `console.mapbox.com/account/access-tokens/`, Sentry: project settings, GA: property settings 등) |
| **Vercel env key 이름** | `NEXT_PUBLIC_*` 프레임워크 prefix 포함 | `web/.env.local`, Vercel dashboard, 또는 코드의 `process.env.<KEY>` |
| **production origin** | restriction 등록값 | Vercel project의 production URL (`*.vercel.app` 또는 custom domain). custom domain 있으면 그것도 포함 |

추가 판단:
- **함정 사전 검증**: third-party의 URL restriction이 wildcard를 지원하는지 docs로 확인. Mapbox는 미지원 확정, Sentry는 origin allowlist 별도 패턴, GA는 referrer 기반 등 서비스마다 다름. 미지원이면 환경별 분리 발급 패턴이 강제된다.
- **default token 보존 여부**: 기존 default token이 unrestricted 상태면 preview/local용으로 그대로 활용. 없다면 신규 발급 2개(prod + preview).

---

## 사전 함정 경고 (사용자에게 먼저 알릴 것)

이 워크플로의 함정은 모두 "왜 단일 토큰 + wildcard로 끝낼 수 없는가"에 관한 것이다. 작업 시작 전에 사용자에게 알려야 의사결정이 빠르다.

### 1. third-party의 URL restriction은 정확한 origin 매칭일 가능성 높음

- **Mapbox**: wildcard 완전 미지원 (`*.vercel.app`, `localhost:*` 모두 거부, `Wildcard characters (*) are not supported` 에러).
- **Sentry**: `Allowed Domains`는 wildcard 지원 (`*.vercel.app` OK), 하지만 모든 서비스가 그런 건 아님.
- **Google Analytics / GA4**: 서버 referrer 기반, restriction 의미 약함 — 별도 정책.
- **Stripe publishable key**: domain restriction 없음 (대신 server-side secret key가 진짜 방어).

서비스 docs를 먼저 확인해서 wildcard 지원 여부 확정 → 미지원이면 환경별 분리 발급 강제, 지원이면 단일 토큰 + wildcard로 단순화 가능.

### 2. Vercel preview URL은 push마다 hash가 바뀐다

`https://eodigakka-git-feat-xxx-jetsongdev.vercel.app`, `https://eodigakka-<10자hash>-jetsongdev.vercel.app` 등 패턴. wildcard 없으면 사전 등록 불가능 → 환경별 토큰 분리 외 대안 없음.

### 3. Vercel env 변경은 자동 재배포 트리거하지 않음

env 변경 후 반드시 수동 redeploy 필요. 그것도 **"Use existing Build Cache" 체크 해제** 안 하면 캐시된 빌드가 그대로 나가서 새 token이 inject 안 됨. 이 함정은 매번 빠지기 쉬움 — 단계 4에서 명시적으로 강조.

### 4. `NEXT_PUBLIC_*` token의 restriction은 abuse 비용 상승, 완전 차단 아님

`Origin`/`Referer` 헤더는 client가 변조 가능. URL restriction은 "직접 토큰을 복사해서 본인 사이트에 박는" 류의 abuse만 막음. 결정된 공격자에겐 우회 가능 — 그래서 free tier 한도 모니터링이 보완 방어선.

---

## 산출물 — 5단계 안내

사용자에게 단계별로 명확히 제시. 각 단계는 사용자가 직접 수행해야 하는 GUI 작업과 검증 체크포인트로 나뉜다.

### 1단계 — third-party 콘솔에서 production 전용 토큰 발급

서비스별 콘솔 페이지로 안내:

```
https://<third-party-console>/...
```

- **Token name**: `<프로젝트명>-prod` (식별 가능한 이름. 다른 프로젝트와 섞이지 않게)
- **Scopes / permissions**: 해당 서비스의 client-side 용도 default 권한만 (excessive permission grant 금지)
- **URL restrictions**: production URL 정확한 origin 한 줄
  - 예: `https://eodigakka.vercel.app`
  - custom domain 있으면 추가
  - **wildcard 시도 금지** (서비스가 미지원이면 에러, 지원해도 보안 약화)
  - **localhost 추가 여부**: 개발 환경에서도 strict token 쓸 의도면 추가, 분리 패턴이면 추가 안 함

발급된 token 복사 (한 번만 보여주는 서비스가 대부분 — 즉시 임시 저장).

### 2단계 — Vercel Environment Variables 분리 등록

`https://vercel.com/<team>/<project>/settings/environment-variables`로 안내.

핵심 룰: **같은 key를 환경별로 다른 value로 박는다**.

| Environment | Value | 출처 |
|---|---|---|
| Production | 신규 prod token (1단계 산출) | 새로 발급 |
| Preview | 기존 default token (unrestricted) | 또는 별도 unrestricted token 신규 발급 |
| Development | 기존 default token (또는 prod 재사용) | local에서 `vercel dev` 안 쓰면 비필수 |

기존 entry가 Production+Preview 둘 다 체크된 single entry면 분리 필요 — Production 체크만 해제 후 Save → 별도 entry로 Production + 신규 token 추가.

로컬 `web/.env.local`에는 default token만 박는다 (local = preview-equivalent 취급).

### 3단계 — Production redeploy (캐시 해제 필수)

Vercel은 env 변경을 자동 재배포 안 함. 수동 트리거.

```
https://vercel.com/<team>/<project>/deployments
```

→ 최신 Production deployment 행 → `⋯` → **Redeploy** → **"Use existing Build Cache" 체크 해제** → Redeploy 클릭.

대안: 빈 commit으로 push 트리거 — `git commit --allow-empty -m "chore: rebuild for token rotation"`. 단 이 commit이 CHANGELOG `[Unreleased]` 없으면 version bump skip이라 churn 없음.

빌드 30s~1min 후 Telegram 🎯 Production 토픽에 알림 도착.

### 4단계 — DevTools Network 탭에서 token prefix 분리 검증

사용자가 직접 브라우저에서 확인:

- **Production 검증**: `https://<production-url>` → DevTools → Network → 해당 third-party API 요청 (`api.mapbox.com`, `sentry.io` 등) → URL의 token prefix가 신규 prod token과 일치
- **Preview 검증**: 살아있는 preview URL이 있다면 → 같은 방식 → token prefix가 default token과 일치 (분리 성공)
- **에러 검증**: Network 탭에 401/403 없음. 콘솔에 "Unauthorized" 없음
- **시각 검증**: 해당 서비스의 시각 컴포넌트(지도/error reporting/analytics 등) 정상 작동

검증 실패 시 디버깅:
- 401/403 → URL restriction이 정확한 origin인지 재확인 (trailing slash, scheme, www 포함 여부)
- token이 여전히 default → Vercel env Production entry 저장 안 됐거나 redeploy 캐시 해제 안 함
- 빈 화면 + 콘솔 에러 → restriction에 production URL 자체 누락

### 5단계 — til-flow 자동 연결

검증 통과 후 til-flow 스킬 호출 → TIL + ADR + CHANGELOG + tasks 일괄 갱신.

- **TIL 가치 있는 케이스**: third-party의 wildcard 미지원 등 외부 함정을 새로 발견했을 때
- **TIL 불필요한 케이스**: 이미 알려진 패턴 그대로 적용 (예: Mapbox 같은 함정 두 번째 인스턴스)
- **ADR 가치 있는 케이스**: 새 토큰 패밀리 (Sentry, GA 등)에 처음 적용해 정책이 확장되는 경우
- **항상 갱신**: tasks.md 체크박스 + CHANGELOG `## [Unreleased]` 한 줄

til-flow가 4슬롯(현상/원인/수정/교훈) 추출해서 처리한다.

---

## 실행 순서

1. **컨텍스트 스캔** — 4슬롯(token 종류·콘솔 URL·env key·production origin) 추출. 부족하면 묻는다.
2. **함정 사전 경고** — 위 4가지 중 해당 token 종류에 적용되는 것을 사용자에게 한 번에 알린다 (특히 wildcard 지원 여부, redeploy 캐시 해제).
3. **5단계 안내** — 단계별로 사용자에게 제시. 각 단계는 사용자가 GUI에서 수행 → 결과 보고 → 다음 단계 진행. 자동 진행 금지(외부 콘솔 + 토큰 가시성 때문에 사람 손이 필요).
4. **검증 체크리스트 통과 확인** — 4단계 검증 항목 모두 ✅ 도달했을 때만 완료.
5. **til-flow 호출** — 외부 함정 또는 새 정책이 있으면 자동 연결.
6. **사용자에게 짧은 요약** — 어떤 token이 어떻게 분리됐는지 1~2줄 표.

---

## 양식 일관성 가드

- **단정문 금지** (`CLAUDE.md` 9원리). "TOP token rotation 패턴" 같은 표현 금지. "권장 패턴", "이번 인스턴스에서 검증된 흐름" 등 사용.
- 사용자가 직접 GUI에서 작업하는 단계는 **반드시 명확한 URL + 클릭 경로**로 안내. "Vercel dashboard 가서 env 수정" 같은 모호한 표현 금지.
- 검증은 **사용자의 visible 확인** + **DevTools Network 탭의 객관적 prefix 매칭** 둘 다 요구. "되는 것 같다"로 종료 금지.
- redeploy 단계의 "Use existing Build Cache 체크 해제"는 매번 강조 — 가장 자주 빠지는 함정.

---

## 참고

- 첫 인스턴스: TIL `docs/til/2026-05-05-mapbox-token-url-restriction.md`
- 정책 ADR: `SPEC.md` ADR-009 "client-side 토큰은 환경별 분리 발급"
- 상위 워크플로 가이드: `CLAUDE.md` 「## 배포 워크플로」, 「## 도구 우선순위」 (CLI > MCP)
- 후속 자동 연결: `.claude/skills/til-flow/SKILL.md`
