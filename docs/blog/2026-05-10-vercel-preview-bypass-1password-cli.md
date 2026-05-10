---
captured: 2026-05-10
topic: Vercel Protection Bypass for Automation 토큰 — 정체·활용 범위·실전 테스트 케이스
series-candidate: 정글 실험실
project: eodigakka
---

# Vercel Protection Bypass for Automation 토큰 — 정체·활용 범위·실전 테스트 케이스

## 현장 메모

PR #23 Preview에서 캐시 검증을 돌리려는데 401에서 막혔다. Preview에 Vercel Deployment Protection을 켜둔 상태였기 때문(tasks.md F.117 — 옵션 C 채택, Mapbox 토큰 abuse 회피 위해 그대로 둠). 이 함정의 답이 **Protection Bypass for Automation** 토큰이었다.

### 토큰이 뭔가

Vercel Dashboard → Project → Settings → **Deployment Protection** → **Protection Bypass for Automation** → Add Bypass.

성격:
- **프로젝트 단위, 모든 Preview deploy에 유효**. PR 바뀌어도 같은 토큰 작동
- **수명 무제한** — revoke하기 전까지 영구. 회전은 수동
- **32자 무작위 문자열** — 32자 직접 지정도 가능하지만 자동 생성 권장
- **여러 개 발급 가능** — note에 용도 적어두면 어떤 자동화에 쓰는지 트래킹

전송 방법 두 가지:
```bash
# 헤더 (권장 — URL log에 안 남음)
curl -H "x-vercel-protection-bypass: $TOKEN" "$URL"

# 쿼리 파라미터 (브라우저에서 한 번 hit하면 쿠키로 영구화)
curl "$URL?x-vercel-protection-bypass=$TOKEN&x-vercel-set-bypass-cookie=true"
```

### 활용 범위 — 어디까지 쓸 수 있나

| 용도 | 예시 | 메모 |
|---|---|---|
| **API curl 검증** | `/api/health`, `/api/affordable` 5회 호출 cache hit 측정 | 우리 케이스 |
| **Playwright e2e** | Preview URL에서 회귀 테스트 자동화 | GHA workflow에서 GH Secret으로 토큰 주입 |
| **Lighthouse CI** | Preview 페이지 성능 측정 PR comment | core-web-vitals 회귀 가드 |
| **OG crawler 시뮬** | `curl -A "facebookexternalhit"` + bypass | Open Graph 메타 검증 |
| **Uptime monitoring** | Healthchecks.io / UptimeRobot 외부 ping | 단 production용이 더 자연스러움 |
| **외부 partner 시연** | 임시 공유 — 다만 Vercel Sharable Links가 더 적합 | bypass는 자동화용, sharing은 별 도구 |
| **AI agent / scraper 검증** | LLM이 API 응답 직접 검증 | 토큰 노출 없이 `op run`으로 격리 실행 |
| **CDN cache layer 격리 진단** | bypass 켠 fetch와 끈 fetch 비교 | Auth layer가 cache·CDN에 미치는 영향 측정 |

활용 안 되는 경계:
- **Production deploy에는 적용 안 됨** — Production은 Auth 자체가 보통 off (Hobby plan 기본). 토큰은 Preview·Custom 환경 전용
- **Vercel Sharable Links와 다름** — bypass는 자동화·기계용 (영구), Sharable Links는 사람·임시 공유용 (URL에 ID 박힘, 만료 가능)
- **Function·Cron 외부에서 함수 직접 트리거하는 용도** — Webhook 보안에는 별도 secret 권장 (revalidate route의 `Authorization: Bearer` 패턴 등). bypass는 Auth 우회일 뿐 application-layer 인증 대체 X

### 실전 테스트 케이스 — 본 프로젝트에서 적용한 패턴

**케이스 1 — Cache Components 작동 검증** (PR #23, 2026-05-10)

수정 전 `'use cache'`(default profile)가 Vercel serverless에서 작동 안 하는 함정. Preview에서 직접 측정해야 머지 전 안전.

```bash
# 1Password에서 토큰 꺼내고
BYPASS=$(op read 'op://side-project/eodigakka/vercel-bypass')

# 5회 연속 호출 → _timing 안정성 확인
for i in 1 2 3 4 5; do
  curl -s -H "x-vercel-protection-bypass: $BYPASS" \
    "$PREVIEW/api/affordable?mode=trade&size=M&cash_min=40000&cash_max=80000" \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['_timing'])"
  sleep 0.3
done
```

결과:
```
{'stats_ms': 1931.4, 'fresh_ms': 1633.8, 'db_ms': 1931.4}   ← call 1
{'stats_ms': 1931.4, 'fresh_ms': 1633.8, 'db_ms': 1931.4}   ← call 2
{'stats_ms': 1931.4, 'fresh_ms': 1633.8, 'db_ms': 1931.4}   ← call 3
{'stats_ms': 1931.4, 'fresh_ms': 1633.8, 'db_ms': 1931.4}   ← call 4
{'stats_ms': 1931.4, 'fresh_ms': 1633.8, 'db_ms': 1931.4}   ← call 5
```
완벽 동일 = cache HIT 확정. 이 패턴이 production-only silent failure 사전 차단.

**케이스 2 — Wall-clock latency cold/warm 측정**

```bash
for combo in "trade,M" "trade,S" "jeonse,L"; do
  mode=${combo%,*}; size=${combo#*,}
  cold=$(curl -s -o /dev/null -w "%{time_total}" -H "x-vercel-protection-bypass: $BYPASS" "$PREVIEW/api/affordable?mode=$mode&size=$size&cash_min=40000&cash_max=80000")
  warm=$(curl -s -o /dev/null -w "%{time_total}" -H "x-vercel-protection-bypass: $BYPASS" "$PREVIEW/api/affordable?mode=$mode&size=$size&cash_min=40000&cash_max=80000")
  echo "$mode/$size cold=$cold warm=$warm"
done
```
warm 모두 0.25s 부근 수렴 = network RTT만 남음.

**케이스 3 — webhook 401 가드** (revalidate endpoint security check)

```bash
curl -s -o /dev/null -w "%{http_code}" -H "x-vercel-protection-bypass: $BYPASS" \
  -X POST "$PREVIEW/api/revalidate?tag=mv_dong_stats"
# 401 (Auth bypass됐어도 application-layer Authorization Bearer 통과 못 함 — 정상)
```

**가능한 다른 케이스 (아직 안 한 것)**:
- e2e Playwright Preview 실행 — `await page.setExtraHTTPHeaders({'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS})`
- ETL workflow_dispatch → `_timing` 갱신 검증으로 webhook revalidate 작동 입증
- OG meta crawler 시뮬: `curl -A "Slackbot-LinkExpanding 1.0" ...` — 메타태그·이미지·title 박혀있는지

### 토큰 보관 — 1Password CLI

발급 즉시 1Password vault로:
```bash
op item create --category="API Credential" --title="Vercel eodigakka Bypass" \
  --vault="side-project" credential="<paste>"
```

사용 시 두 패턴:
- `op read 'op://...'` — 단발
- `op run --env-file=...` — child process 격리(부모 셸 leak 없음)

GitHub Secret 동기화는 한 줄:
```bash
gh secret set VERCEL_AUTOMATION_BYPASS \
  --repo jetsongdev/eodigakka \
  --body "$(op read 'op://side-project/eodigakka/vercel-bypass')"
```

### 핵심 교훈

1. **Bypass 토큰은 "Preview 자동화의 만능 키"** — Auth 끌 필요 없이 client-side 토큰 abuse 막으면서 머신 검증 자동화 가능
2. **활용 범위가 단순 curl 그 이상** — Playwright, Lighthouse, OG crawler, AI agent까지. 한 번 셋업해두면 여러 도구가 재사용
3. **production용 인증과는 별개 layer** — bypass는 platform Auth 우회일 뿐. application-layer secret(`Authorization: Bearer`)은 별도 유지
4. **1Password + `op run`이 이상적** — 토큰 발급·저장·사용·회전이 1줄씩 명령으로 끝, shell history·env leak 없음

## 다음 단계

- [ ] jetsong-dev 아이디어 등록됨: `docs/content-ideas/3-lab/2026-05-10-vercel-preview-bypass-1password-cli.md`
- [ ] 초안 작성 시 이 파일 참고
- [ ] Playwright e2e가 Preview에서 도는 워크플로 셋업하면 케이스 1개 추가
- [ ] 토큰 회전 정책 결정 후 글에 추가 (Mapbox 회전과 같이?)
