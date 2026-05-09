# tasks.md

상태: `[ ]` 대기 | `[~]` 진행 중 | `[x]` 완료 | `[-]` 취소/불필요

SPEC.md가 single source of truth. 여기선 실행 단위만 관리.

---

## 다음 라운드 후보 (2026-05-05 갱신, 인프라 정착 후)

**완료된 인프라**: Neon + GHA cron + Vercel 배포 + Telegram 알림 + 버전 bump 자동화 + CHANGELOG retrofit. 다음 라운드는 워크로드 특성에 따라 4갈래 중 골라잡는다.

**현재 우선순위 추천 (Mapbox 토큰 + Healthchecks ping 완료 직후)**:
1. 🔵 **블로그 단편 review** (C 섹션, 외부 공유) — 4개 draft 쌓여 있음, 외부 공유 의향 있으면 review pass
2. ⚪ **GitHub 시크릿 ↔ Vercel env 일관성 점검** (F 섹션) — Neon 비번 회전 시 동기화 함정 미리 방지
3. 🔵 **모바일 UX 잔여** (A 섹션) — SidePanel bottom sheet, 범례 floating chip, 햅틱

### A. UX 마무리 (Phase 1 잔여 — 빠른 wins)
- [x] 슬라이더 드래그 중 비동기 색칠 — onValueChange debounce 150ms + AbortController in-flight cancel (2026-05-05)
- [x] 사이드패널 분포 차트 + 매매·전세 동시 비교 — `/api/dong/.../complexes` `distributions[]` + SVG 박스플롯 (2026-05-05)
- [x] 모바일 컨트롤 collapsible — `(max-width: 640px)` 기본 접힘 + 1줄 요약 + 토글 (2026-05-05)
- [x] **모바일 hover tooltip 영구 잔류 회귀 fix** (2026-05-05) — A+B 조합 적용: `useIsHoverCapable` 훅(`matchMedia('(hover: hover) and (pointer: fine)')`)으로 터치 환경 감지 + `!selectedBjd` 가드로 sidepanel 열린 동안 tooltip 숨김
- [x] **SidePanel 모바일 bottom sheet** (2026-05-05) — `useIsNarrow` 훅 + isNarrow 분기로 `position: fixed; bottom: 0; max-height: 80vh`, 백드롭 탭으로 닫기, 드래그 핸들 시각 affordance 추가. 스와이프 제스처는 의존성 회피로 제외
- [ ] 잔여: 모바일 범례 floating chip, 슬라이더 햅틱 피드백
- [x] **확대/축소 버튼 크기 키우기** (2026-05-08) — Mapbox `NavigationControl`의 기본 30×30 → 44×44(권장 터치 타겟)로 키움. `web/app/globals.css`에 `.mapboxgl-ctrl button.mapboxgl-ctrl-zoom-in/out` width/height + 아이콘 background-size 26×26 override. 모든 viewport 공통 — 데스크톱도 hit area 확대로 사용성 ↑.

### B. 운영 모니터링 도입 (GHA cron 시작했으니 자연 다음 단계)
- [ ] Neon free 0.5GB 한도 모니터링 — `pg_database_size('neondb')` 주간 점검, 80% 도달 시 alert (Phase B 아래 항목 보강)
- [x] Healthchecks.io ping (2026-05-05) — `etl.yml`에 start/success/fail 3-step 추가. `HEALTHCHECKS_PING_URL` secret graceful skip 패턴 (값 없으면 스킵하고 빌드 계속). secret 등록 후 다음 cron firing(2026-05-06 03:00 KST)부터 즉시 효력.
- [ ] cron firing 지연 알림 — `last_succeeded_at`가 KST 03:00 + 1h 지나도 갱신 안 되면 GH issue 자동 생성
- [ ] 트리거: 다음 cron firing(2026-05-06 03:00 KST) 통과 + 1주일 안정 운영 확인 후

### C. 블로그 콘텐츠 (단편 4 + 시리즈 1)

draft 누적 중. 외부 게시 시점에 `status: draft → review → published` 전환.

**단편 (각 ~600~900자)**:
- [x] `2026-05-05-mapbox-webgl-failure-modes.md` — WebGL 초기화 실패 진단기
- [x] `2026-05-05-gha-shell-injection.md` — GHA `${{ }}` 직접 치환 취약점 + env hoist 패턴 (2026-05-05 PR #5 advisor 부산물)
- [x] `2026-05-05-stacked-pr-auto-close.md` — stacked PR 머지 시 base 삭제 함정 + 복구 패턴 (2026-05-05 PR #4 → #5 사건)
- [x] `2026-05-05-touch-mouseleave-hover.md` — 터치 디바이스 mouseleave 안 발사 + `(hover: hover) and (pointer: fine)` 가드 (2026-05-05 PR #3)

**시리즈 (Neon 마이그레이션 6편)**:
- [ ] `2026-05-05-neon-migration-series/` 6편을 outline → 풀 초안(편당 800~1,500자 + 인용·이미지 자리)

**다음 단계**:
- [ ] frontmatter `status: draft → review` 전환 (외부 공유 직전)
- [ ] 게시 플랫폼 결정 (개인 블로그 / Velog / Medium / dev.to 등)
- [ ] 트리거: 사용자가 외부 공유 의향 결정 시

### D. Phase 2 진입 (대기 — 임장 1회 후 재평가)
- [ ] ETL `TARGET_GU = SEOUL_25` 확장 (line 113)
- [ ] 평형 size_bucket 세분화 — XS 추가, 1인 가구 케이스 분리 (line 117~123)
- [ ] 신축/구축 build_year 토글 (line 124~128)
- [ ] 트리거: Phase 1 임장 1회 + 강북 14구 후보 부족 판단

### 비-차단 정리 (편한 시점에)
- [x] `etl/run_etl.sh` 폐기 (2026-05-05) — launchd 폐기 + GHA가 inline 명령으로 대체. live consumer 없음 확인 후 삭제. historical 언급(CHANGELOG·TIL·blog)은 의도적으로 유지.
- [ ] `db/migrate_to_neon.sh` — 1회성 스크립트지만 Neon 재마이그레이션 시 재사용 가능. README에 "초기화 절차" 섹션으로 보존 명시
- [ ] CLAUDE.md 표 갱신 — local docker postgres 명령어가 여전히 유효한지 (web dev에는 OK, ETL은 Neon 직결로 전환)

### E. Vercel 배포 셋업 (2026-05-05 진행 중)

`jetsongdev/eodigakka` Vercel 프로젝트 생성 + GitHub 레포 연결 + telegram-deploy-notify 워크플로 활성화 완료. 첫 production deploy 전 잔여 작업.

- [x] Vercel 프로젝트 생성 + `vercel link` (web/.vercel/project.json 생성)
- [x] GitHub repo 연결 (`vercel git connect`)
- [x] `next.config.js` — NEXT_PUBLIC_APP_VERSION + NEXT_PUBLIC_GIT_SHA 빌드 타임 inject
- [x] Telegram 워크플로 + 3종 토픽 라우팅 검증 (smoke test 3건 통과)
- [x] Root Directory를 `web`으로 변경 (Vercel dashboard → Settings → Build and Deployment, 2026-05-05)
- [x] 환경변수 Production + Preview 등록 완료 (2026-05-05): `DATABASE_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN`
- [ ] (선택) Development 환경에도 추가 — `vercel dev` / `vercel env pull` 사용 시 필요. 현재 로컬은 `web/.env.local` 직접 관리라 비필수
- [x] **Mapbox 토큰 도메인 화이트리스트** (2026-05-05) — Mapbox URL restriction이 wildcard 미지원이라 환경별 토큰 분리:
  - `eodigakka-prod` 신규 발급(restriction `https://eodigakka.vercel.app`만) → Vercel Production env
  - 기존 default token(unrestricted) → Vercel Preview env + 로컬 `.env.local`
  - Production redeploy(캐시 해제) 후 지도 작동 검증 완료. (TIL `2026-05-05-mapbox-token-url-restriction`)
- [x] 첫 production deploy 완료 (2026-05-05, sha 20353d3, 24s build) — `https://eodigakka.vercel.app`
- [x] 자동화 라인 검증 완료 — Push → Vercel build → GitHub Deployments → GHA workflow (run 25368302505, 21s) → Telegram 🎯 Production 토픽
- [x] API 검증 — `/api/health` (trade 5748·rent 15295), `/api/polygons` (467개), `/api/affordable` (26개 동, freshness RTMS 2026-05-04)
- [x] 브라우저에서 페이지 동작 검증 (2026-05-05) — Mr. Song이 라이브 사이트에서 푸터 v0.5.2 확인, PR #3 모바일 hover fix 검증 완료
  - 지도 폴리곤 색칠
  - 슬라이더 +/- 칩 표시
  - 사이드패널 분포 차트
  - 모바일 collapsed/펼치기
  - 푸터 면책 + 출처 + 버전(`v0.5.2 #<sha>`)
- [ ] (선택) 커스텀 도메인 연결 — Vercel dashboard → Domains → Add. SSL 자동.
- [ ] (선택) Vercel Analytics / Speed Insights — Next.js 16 + Turbopack 빌드에 분석 추가

### E.1 배포 워크플로 정책 (2026-05-05 결정 + 자동화 도입)

**main 직접 push 금지 — feature branch + Preview 검증 → PR merge로 Production**. CLAUDE.md 「배포 워크플로」 섹션 참조.

- [x] CLAUDE.md에 워크플로 섹션 추가 (2026-05-05)
- [x] GitHub branch protection 적용 (2026-05-05) — PR 강제, admin 우회 허용, force push/deletion 차단
- [x] feature branch 흐름 실전 검증 (PR #3 mobile hover fix, PR #5 version automation, 2026-05-05)
- [x] **버전 bump 자동화 도입** (2026-05-05, PR #5) — `.github/workflows/version-bump.yml`. PR title의 Conventional Commit type → `feat:` minor / `fix:`·`chore:`·`docs:` 등 patch / `BREAKING CHANGE` major. `[Unreleased]` opt-in gate, env hoist로 shell injection 방어, KST 날짜, `RELEASE_PAT` 시크릿. 첫 self-test 정상 skip 통과.
- [x] CHANGELOG retrofit (2026-05-05, PR #5) — 15섹션을 7개 버전 라벨(v0.0.1~v0.5.1)로 묶고 cluster preface 추가. v0.5.2부터 워크플로 자동 관리.

### F. 보안·운영 (Vercel 셋업 후 즉시)

- [x] GitHub 시크릿 ↔ Vercel 환경변수 일관성 점검 (2026-05-06) — `gh secret list` 6개(DATABASE_URL, RTMS_KEY, HEALTHCHECKS_PING_URL, RELEASE_PAT, TG_BOT_TOKEN, TG_CHAT_ID) × workflow `secrets.*` 참조 전수 매칭, Vercel env 3개(DATABASE_URL Prod+Preview, NEXT_PUBLIC_MAPBOX_TOKEN Prod·Preview 분리) 확인. drift 없음. 값 직접 비교는 양쪽 encrypted라 CLI 불가 → "한 번에 회전" 운영으로 방어.
  - **유일한 dual-residence**: `DATABASE_URL` (GH ETL + Vercel Prod+Preview). Neon credential 회전 시 3곳 동시 갱신 강제.
  - **G 섹션 도입 시 신규 dual-residence 예고**: `/api/feedback-webhook`가 Vercel에서 돌면 `TG_BOT_TOKEN`이 GH-only → GH+Vercel 양면이 됨. 봇 토큰 회전 절차에 양쪽 갱신 명시 필요.
  - **Mapbox eodigakka-prod**: 커스텀 도메인 연결 시 Mapbox 콘솔 URL restriction에 새 도메인 화이트리스트 추가 필수.
- [ ] (장기) Mapbox 토큰 회전 정책 — 6개월에 1회 재발급 + Vercel env 갱신
- [x] 면책 고지 + 데이터 출처가 SEO/소셜 카드에 노출 (2026-05-05) — `app/layout.tsx`에 `description` + `openGraph` + `twitter` metadata 추가 (PR #2)
- [ ] **Preview deployment protection 끄기 또는 bypass token 발급** (2026-05-05 발견) — Vercel free plan은 Preview URL을 인증된 팀원만 접근 가능(`HTTP 401`). 외부 OG crawler(Telegram, Slack 등)가 익명 GET으로 미리보기 못 가져옴 → Preview에서 OG 카드 검증 불가. 옵션:
  - (A) Vercel dashboard → Settings → Deployment Protection → "Vercel Authentication" 끄기 (가장 단순, 모든 Preview 익명 접근)
  - (B) "Protection Bypass for Automation" 토큰 발급해 OG crawler용 헤더 첨부 (선택적)
  - (C) 그대로 두고 Production에서만 OG 검증 (현재 패턴, 외부 공유 가치 적은 단계엔 충분)

### G. 사용자 피드백 채널 (2026-05-05 신규)

**목적**: PWA 사용자가 버그·제안을 직접 보낼 수 있는 경로. "DB 쓰기는 ETL만" 원칙 유지하기 위해 폼은 외부 SaaS(Tally 또는 Google Form)에 호스팅하고, 제출 시 webhook → 기존 Telegram 봇으로 fan-out.

- [ ] Tally(또는 Google Form) 폼 생성 — 필드: 카테고리(버그/제안/기타), 자유 서술, (선택) 연락처. captcha/honeypot 활성화
- [ ] Tally webhook → Telegram bot API 연결. 직접 webhook이 안 되면 `/api/feedback-webhook` Next.js 라우트 한 줄 forward (env에 `TELEGRAM_BOT_TOKEN`·`TELEGRAM_FEEDBACK_CHAT_ID` 추가)
- [ ] Telegram 토픽 신설(예: 💬 Feedback) — 기존 🚀 Preview / 🎯 Production과 분리
- [ ] 푸터에 "피드백 보내기" 링크 추가 — Tally 폼 URL을 새 탭으로 열거나 `/feedback` 라우트에 `<iframe>` 임베드
- [ ] 검증: 폼 제출 → 본인 Telegram 토픽 도착 → 내용·timestamp 확인. 스팸 1건 던져서 captcha·honeypot 동작 확인
- [ ] CLAUDE.md 「외부 위임 규약」 또는 신규 섹션에 피드백 fan-out 경로 한 줄 추가 (Telegram 토픽 일람 동기화)

### H. `/api/affordable` 첫 로딩 latency 개선 (2026-05-07 신규)

**현상**: 첫 페이지 진입 시 LoadingOverlay "지도 준비 중" 단계에서 `/api/affordable` 호출이 약 **2.25초** 소요. mode/size 변경 시에도 같은 수준 latency 발생 (cash 변경은 클라 사이드 필터라 영향 없음). 로컬 dev/Production 양쪽 측정 필요.

**가설별 진단·개선 후보**:

- [ ] **A. Neon free tier 콜드 스타트** — 5분 idle 후 compute suspend, 첫 쿼리에 1~3초. 가장 유력한 dominant cost.
  - 진단: 두 번째 호출 latency 측정 (warm 상태). 1초 미만이면 콜드 스타트가 주범.
  - 개선: (1) Vercel Cron으로 5분마다 `/api/health` ping해서 always-warm 유지 (free tier 한계 안에서) (2) Neon paid tier upgrade (월 $19, idle suspend 비활성)
- [ ] **B. 두 query 직렬화** — `mv_dong_stats` JOIN 쿼리 + `MAX(contract_date)` freshness 쿼리가 sequential. `Promise.all`로 병렬화하면 RTT 1번 감소.
  - 위치: `web/app/api/affordable/route.ts:36-60` + `:101-104`
  - 빠른 win, 영향 측정 후에 유의미하면 적용
- [ ] **C. freshness 쿼리 캐시** — `MAX(contract_date) FROM tx_apt_trade/rent`는 ETL이 KST 03:00에만 갱신. 매 요청마다 raw 테이블 풀스캔 불필요.
  - 옵션 1: `etl_job_status.mv_refreshed_at` 또는 신규 컬럼 `last_contract_date`에 ETL이 기록 → API는 그 값만 SELECT (1행)
  - 옵션 2: Next.js `unstable_cache`로 60초 TTL 캐시
- [ ] **D. affordable 응답 자체 캐시** — cash 필터를 클라로 옮긴 뒤로 mode×size 조합은 `(trade|jeonse) × (S|M|L|all)` = 8가지로 고정. 각 조합 응답을 60s~1h TTL로 edge cache 가능.
  - Vercel Runtime Cache API 또는 `unstable_cache`(`'use cache'` directive, Next.js 16) 검토
  - 트레이드오프: ETL이 03:00 갱신이라 1시간 TTL도 신선도 충분, mode/size 토글이 즉시 응답 → UX 큰 향상
- [ ] **E. raw 테이블 인덱스 점검** — `tx_apt_trade(contract_date)` / `tx_apt_rent(contract_date)`에 인덱스 없으면 MAX가 풀스캔.
  - 진단: `EXPLAIN ANALYZE SELECT MAX(contract_date) FROM tx_apt_trade;` Seq Scan이면 인덱스 추가
  - C로 우회 가능하면 인덱스는 불필요
- [ ] **F. LoadingOverlay 단계별 메시지 정밀화** — 현재 "동별 거래 데이터 분석 중..." 한 줄이 2초 머묾. 콜드 스타트인지 쿼리 자체가 느린지 사용자가 모름.
  - p50/p95 측정값을 로그로 수집(Vercel Functions 로그)해서 메트릭 기반으로 메시지 다듬기
- [ ] **G. 메트릭 수집** — `/api/affordable`에 server timing 헤더 추가, p50/p95를 Vercel Analytics 또는 Healthchecks pingback에 일주일 누적 후 의사결정

**우선순위 추천 (작은 win → 큰 win)**:
1. B (Promise.all 병렬화) — 5분 작업, latency 측정 후 적용
2. A 진단 (warm 호출 latency 비교) — Neon 콜드 스타트가 dominant이면 D(캐시)가 진짜 답
3. D (응답 edge cache) — 가장 큰 UX 개선, 트레이드오프 명확
4. C, E, F, G — D로 해결되면 후순위

**트리거**: 사용자가 "첫 로딩 느리다" 1회 인지(2026-05-07). 임장 1회 검증 직후 또는 외부 공유 직전에 D까지 처리.

**진척**:
- [x] **B. Promise.all 병렬화** (PR #16, 2026-05-09) — 두 쿼리(`mv_dong_stats` JOIN + `MAX(contract_date)`)를 `Promise.all`로 묶음. 로컬 dev 측정 `stats=65.7 fresh=49.2 db=65.8(=max) eval=0.1` — 병렬 작동 확인
- [x] **G 부분 — Server-Timing 헤더** (PR #16, 2026-05-09) — `/api/affordable` 응답에 `stats / fresh / db / eval` 4개 metric 노출. DevTools Network → Timing 탭 자동 시각화. e2e 회귀 가드 추가
- [~] **A 진단** (2026-05-09 진행) — Preview URL 첫 호출 Waiting **1.98s** 확인 → Neon 콜드 dominant 거의 확정. warm 호출(M↔S 토글) 비교로 마무리 진단 후 D 진입 결정

### I. `/api/polygons` 응답 캐시·페이로드 축소 (2026-05-09 신규)

**현상**: 첫 페이지 진입 시 `/api/polygons` 응답 ~1.5MB·**~1.7~2초** 소요(Network 탭 capture 기준). 467개 법정동 폴리곤은 V-World LSMD 적재 후 거의 변경 없는 정적 데이터인데 매 요청마다 DB 풀스캔 + `ST_AsGeoJSON` 직렬화 + Node `JSON.parse` 467회 왕복 발생. 응답 헤더에 `Cache-Control: public, max-age=86400` 박혀있으나 `dynamic = 'force-dynamic'`이라 Vercel CDN edge cache 동작 확인 필요.

**가설별 진단·개선 후보**:

- [ ] **A. Vercel CDN edge cache 적용** — `dynamic = 'force-dynamic'` 제거 + `dynamic = 'force-static'` 또는 `revalidate = 86400`로 전환. ETL이 폴리곤 안 건드리니 사실상 정적. 첫 호출만 DB, 이후 모두 CDN edge. 가장 큰 win.
  - 검증: 응답 헤더의 `cf-cache-status` / `x-vercel-cache` 확인 — 현재 `MISS` 박혀있으면 force-dynamic이 캐시 무력화 중
- [ ] **B. `ST_AsGeoJSON` precision 축소** — default 6 decimal places (≈11cm). zoom 11 시각화엔 precision 5(≈1.1m) 또는 4(≈11m)로 충분. `ST_AsGeoJSON(geom, 5)`로 응답 크기 ~30~40% 감소 기대.
- [ ] **C. `ST_SimplifyPreserveTopology` 적용** — Douglas-Peucker로 좌표 점 수 자체 축소. tolerance 5m(≈0.00005°)면 zoom 11 시각엔 차이 안 보이고 페이로드 추가 축소.
- [ ] **D. `JSON.parse` 왕복 제거** — `ST_AsGeoJSON(geom)::jsonb` 또는 pg `to_json`/`json_build_object` row aggregation으로 직접 JSON 객체 받기. Node.js `JSON.parse(467회)` CPU 비용 절감. dominant 아닐 수 있어 측정 후 결정.
- [ ] **E. Server-Timing 헤더** — affordable처럼 `db / serialize / parse` 시간 분리해 정량 진단. 어디가 dominant인지 측정 후 A·B·C·D 우선순위 결정.
- [ ] **F. Build-time 정적 파일 프리렌더** — V-World 갱신(분기 단위)에만 변경. `public/polygons.json` 빌드 시 생성 → 클라가 정적 파일 직접 fetch. DB 의존 제거 + CDN 자동 캐시. 단점: 폴리곤 갱신 시 재빌드 필요. A로 안 풀리면 비상 카드.
- [ ] **G. Brotli precompress + Content-Encoding 검증** — Vercel은 자동 brotli 압축. 1342kB 응답이 wire에서 어느 정도까지 압축되는지 `content-length` 확인. 압축 잘 되면 wire 비용은 작고 dominant은 서버 처리 → A·E 우선.

**우선순위 추천**:
1. E (Server-Timing) — 5분 작업, 측정 후 dominant 판정
2. A (CDN cache) — `force-static` 한 줄 변경, 가장 큰 win
3. B + C (precision/simplify) — 페이로드 축소, 모바일 첫 로딩 체감
4. D — A로 해결되면 후순위
5. F — 비상 카드

**트리거**: Mr. Song이 화면 Network 탭에서 polygons 응답 1342kB·~2s 소요 인지(2026-05-09). affordable PR #16 merge 후 별도 PR로 진행.

---

## Phase 0 — 데이터 검증 (2026-05-04 완료 ✓)

- [x] RTMS API 키 발급·승인 (data.go.kr)
- [x] real-estate-mcp 클론 + Claude Code MCP 연결 (`claude mcp add`)
- [x] Dev 엔드포인트 패치 (`_helpers.py`, ADR-007)
- [x] 강북구 2026-04 매매 92건 실데이터 확인
- [x] 필터 룰 손 시뮬 (4~8억 61% 적중)
- [x] 신구축 혼재 문제 발견 → SPEC ADR-006 반영
- [x] 강북 14구 × 3개월 bulk pull → 동별 표본 희소 지도 확인
  - confidence 분포: high 44% / low 31% / insufficient 25%
  - M형 4~8억 high confidence 통과: 21개 동
  - 거래 희소 구 확인: 종로(156건), 광진(210건), 용산(211건)
  - 분산 가드 탈락 후보: 홍은동(IQR 1.61), 면목동(IQR 1.56)
- [x] ADR-001~007 SPEC 반영
- [x] CHANGELOG.md / tasks.md / SPEC.md 최신화
- [x] git init + GitHub private 레포 생성·푸시 (jetsongdev/eodigakka)

---

## Phase 1 — 강북 14구 매매 + 전세 ETL → 색칠지도 1장

### DB 셋업
- [x] docker-compose.yml 작성 (postgres 16 + postgis)
- [x] `db/schema.sql` 작성 (§5.1 raw 테이블, ADR-002 컬럼명 반영)
- [x] `db/views.sql` 작성 (§5.2 mv_dong_stats, §5.3 mv_jeonse_ratio, ADR-005/006 반영)
- [x] 법정동 GeoJSON 로드 (`db/load_polygon.py`) — 427개 동 적재 완료

### ETL
- [x] `etl/pyproject.toml` 작성 (PublicDataReader, psycopg2-binary, python-dotenv)
- [x] `etl/fetch_rtms.py` 작성 (§9.1 기준, GANGBUK_14, kill switch 포함)
- [x] `filter_cancelled` 버그 수정 — translate=True 시 NaN→"nan" 문제 (TIL)
- [x] ETL 1회 수동 실행 → `tx_apt_trade` row count 확인 (trade 5,476건 / rent 3,977건)
- [x] **법정동 폴리곤 재적재** (ADR-008, TIL `2026-05-04-bjd-code-…` + `2026-05-05-lsmd-shapefile-pitfalls`)
  - [x] V-World에서 `LSMD_ADM_SECT_UMD_11` (서울 법정동 467개) 다운로드 — 처음에 `LSMD_CONT_LDREG`(필지) 잘못 받음
  - [x] `db/load_polygon.py` 인코딩 자동 감지(`.cst` EUC-KR) + `EMD_CD` 8→10자리 패딩 추가
  - [x] `bjd_polygon` TRUNCATE 후 467개 법정동 적재 완료
  - [x] `tx_apt_rent` TRUNCATE 후 ETL 재실행 — 15,432건 법정동 코드로 재적재
  - [x] `REFRESH MATERIALIZED VIEW mv_dong_stats / mv_jeonse_ratio` (TRADE 390/390, JEONSE 411/411 매칭)
  - [x] SQL 검증 — 강북 14구 M형 4~8억 high confidence 동 정상 노출
  - [ ] `/api/affordable` 라이브 재검증 (dev 서버 재기동 후)
- [x] cron 설정 — **GitHub Actions로 전환** (issue #1, TIL 함정 6중)
  - [x] launchd 1차 시도 — TCC 차단으로 `~/Documents/` 접근 거부, plist는 LaunchAgents에 unload 상태로 보존
  - [x] Neon Cloud(`ap-southeast-1`, free 0.5GB) + GHA `.github/workflows/etl.yml` (`0 18 * * *` UTC = KST 03:00)
  - [x] DB 마이그레이션 + GitHub Secrets 등록 + `workflow_dispatch` run 25360703985 success
  - [x] pooler `search_path` 영구 fix (`psycopg2.connect(options="-c search_path=public")`)

### API
- [x] `web/` Next.js 16 프로젝트 초기화 (Kysely 포함, npm install 완료)
- [x] `GET /api/affordable` 구현 (§7 기준, confidence 컬럼 활용)
- [x] `GET /api/dong/:bjd/complexes` 구현
- [x] `GET /api/health` 구현 (kill switch 상태 노출, smoke test 통과)
- [x] `web/.env.local` DATABASE_URL 설정 + dev 서버(3002) 기동 확인
- [~] `/api/affordable` 빈 결과 — bjd_code 불일치 해결 후 재검증 필요

### 프론트
- [x] `GET /api/polygons` 작성 (`bjd_polygon` → GeoJSON FeatureCollection, 24h 캐시)
- [x] **사용자**: Mapbox 토큰 발급 (Individual tier) → `web/.env.local`에 `NEXT_PUBLIC_MAPBOX_TOKEN=pk....`
- [x] Mapbox GL JS 세팅 (서울 zoom 11) + 폴리곤 source/layer (snapshot 01)
- [x] 동 폴리곤 색칠 (§6.4 색상 매핑, `/api/affordable` 결과를 feature-state로 join, snapshot 02)
- [x] 헤더 컨트롤 (모드 토글, 자금 셀렉터 cash_min/max, 평형 S/M/L/all 토글, 쿼리 변경 시 자동 재호출)
- [x] 마우스오버 tooltip (동 이름 + 중위 + tx_count + confidence + 미통과 안내)
- [x] 클릭 → 사이드패널 (Evidence + 모드별 TOP5 단지 + 최근 거래 10건 표 + 신구축 혼재 ⚠️)
- [x] cash 슬라이더 (radix-slider) + 카세트 한 줄 컨트롤 + max 30억 확장 (snapshot 04)
- [x] **슬라이더 드래그 중 비동기 색칠** (2026-05-05) — 1차: 150ms debounce + AbortController. 2차: 클라 사이드 cash 필터로 전환 (mode/size별 1회 fetch, cash는 메모리 필터). 슬라이더 25ms × 20회 이동 동안 fetch 0회 — 진짜 실시간.
- [~] **사이드패널 UI 개선** — 분포 차트만 1차 처리 완료, 나머지 항목은 후속 (2026-05-05)
  - [x] **분포 차트**: SVG 박스플롯 — `mv_dong_stats`의 p25/p50/p75 + 매매·전세 동시 (현재 모드 100%, 비교 모드 55% 투명)
  - [x] **매매·전세 동시 비교**: 분포 차트 안에 흡수 — 별도 mini-card는 만들지 않음
  - [x] **시각 위계** (2026-05-07) — `EvidenceCard` 컴포넌트로 분리. 중위 가격 26pt 큰 숫자 + 라벨("동 중위 (매매/전세)") + confidence·연식·신구축혼재를 `Chip` (high=녹색/low=노랑/insufficient=회색/neutral=파랑/warn=빨강) 칩으로 분리. evidence는 작은 회색으로 하단 배치.
  - [ ] **평형 분포**: area_m2 히스토그램
  - [ ] **단지 카드 강화**: TOP5에 미니 sparkline + 평형/연식 라벨
  - [ ] **액션 버튼**: "Claude로 더 보기" / "RTMS에서 보기" / "임장 후보 ⭐"
  - [x] **최근 거래 매·전 분리 표시** (2026-05-07) — API 응답: `recent_transactions[]` 단일 배열 폐기, `recent_trades: TxRow[10]` + `recent_jeonse: TxRow[10]` 두 배열로 분리. `route.ts`에서 두 별도 LIMIT 10 query (Promise.all 병렬). e2e 검증 추가(`api.spec.ts`).
  - [x] **탭 UI 전환** (2026-05-07) — 두 섹션 stack을 `RecentTxTabs` 컴포넌트(role=tablist + tab × 2)로 교체. 활성 탭 underline은 매매=녹색/전세=파랑. **default 탭 = 헤더 mode와 동기화** (`useEffect([defaultTab])`로 mode 토글 시 따라감). 탭 콘텐츠 영역은 `rgba(255,255,255,0.55)` 살짝 투명한 시트.
  - [x] **사이드패널 시트 투명도** (2026-05-07) — 데스크톱 0.97 → 0.86, 모바일 0.98 → 0.88로 낮추고 `backdropFilter: blur(6px)` 추가. 뒤 지도가 살짝 비치면서 가독성은 blur로 보존.
  - [ ] **최근 거래 더보기**: 10건 이후 페이지네이션. 시트 안에서 "더보기" 버튼 → 다음 10건 append. cursor는 `(contract_date, id)` 또는 `OFFSET` 기반
    - API: `/api/dong/[bjd]/complexes?txCursor=<base64>&txMode=trade|jeonse` 또는 `?txOffset=10`
    - 모바일 시트 안에서 자연스러운 무한 스크롤도 옵션 — 다만 시트 내부 스크롤 + 더보기 명시 클릭이 더 명확
    - 트리거: 매·전 분리 task 완료 후
  - [ ] **모바일 UX 잔여**: swipe-down 닫기 제스처 (bottom sheet 1차 — `useIsNarrow` 분기·백드롭·드래그 핸들 visual은 2026-05-05 완료)
- [~] **모바일 범례 분리 + 컨트롤 패널 시야 점유 축소** — 컨트롤 collapsible만 1차 처리 완료 (2026-05-05)
  - [x] (B) 컨트롤 패널 collapsible — 기본 접힘 + 1줄 요약 + 토글, 사용자 토글 후 자동 동기화 stop. 모바일 뷰에서 지도 점유율 90% 이상 확보
  - [ ] (A) 범례 floating chip — 별도 시트 분리는 후속
- [ ] **슬라이더 / 카세트 버튼 햅틱 피드백** — 모바일 PWA에서 슬라이더 핸들 step 변경 시·카세트 버튼 클릭 시 진동
  - Web Vibration API (`navigator.vibrate(10)`)는 Android Chrome만 지원, iOS Safari 차단 — 모바일 한정 / 미지원 환경 graceful degradation
  - 단계: ±1천만 = 짧은 진동(8ms), ±1억 = 중간(15ms), ±10억 = 긴 진동(30ms)
  - 슬라이더 onValueChange에서 step 단위로 trigger (드래그 중 매 step), 카세트 클릭 시 1회
  - 사용자 환경설정 토글(localStorage `haptic=on/off`) 검토 (배터리·접근성)

### 검증
- [x] 색칠지도 열고 "예상한 동이 초록인가" 눈으로 확인 (snapshot 02 — 도봉·노원·강북·중랑 등 짙은 녹색 분포 Phase 0 결과와 일치)
- [ ] 수유동(저거래)이 회색 또는 low-confidence 투명으로 나오는지 확인
- [ ] 꿈의숲해링턴플레이스(고가 소형)가 S버킷에서 8억 초과로 비표시인지 확인
- [ ] Kill switch `ETL_DISABLED=1` 동작 확인
- [x] **e2e 테스트 11개 통과** (api 5 + map 6, 4.2초, snapshot ca00062 시점)
- [ ] **임장 1회** → Phase 2 진입 여부 재평가

---

## Phase 2 — 서울 25구 전세, 전세가율 가드, 사이드패널 강화 (대기)

- [ ] ETL `TARGET_GU = SEOUL_25` 확장
- [ ] `mv_jeonse_ratio` 활성화 (ADR-002 컬럼명 기준)
- [ ] 전세 모드 색칠 (빨강: 전세가율 80%+, ADR-003 레이블)
- [ ] 정책대출 체크박스 (신생아·신혼·버팀목, §6.3)
- [ ] **평형 size_bucket 세분화 — 1인 가구 케이스 분류** (현재 S=`<60㎡`가 너무 광범위, 18~33㎡ 도시형생활주택/소형 오피스텔과 33~60㎡ 신혼·1.5인 케이스 혼재)
  - [ ] 신규 ADR: 평형 분류 기준 — `XS: <33㎡` (1인) / `S: 33~60` (1~1.5인) / `M: 60~85` / `L: 85+` 또는 부동산 관행에 맞춰 `XS: <40` / `S: 40~60` 검토
  - [ ] `db/views.sql` `mv_dong_stats` size_bucket CASE 분기에 XS 추가 + REFRESH
  - [ ] `web/lib/filter.ts` `SizeBucket` 타입 + `parseAffordableQuery` 검증에 XS 추가
  - [ ] `web/app/api/affordable/route.ts` size 파라미터 검증 갱신
  - [ ] `web/app/page.tsx` size 토글에 XS 버튼 추가 (`['XS','S','M','L','all']`)
  - [ ] 검증: 강북 14구 1인 가구용 신축 도시형생활주택(예: 신논현·왕십리 같은 곳에 있는 33㎡ 매물)이 XS 버킷에 매핑되는지 SQL 확인
- [ ] **신축/구축 구분 필터** — 현재 mv_dong_stats에 `median_build_year` 있고 사이드패널에 "중위 N년식 + ⚠️신구축 혼재" 표시까지만. 헤더에 build_year 토글 추가:
  - 신축 (2015+) / 준신축 (2005~2014) / 구축 (~2004) / 전체
  - `/api/affordable`에 `build_year_min/max` 쿼리 추가, raw `tx_apt_trade.build_year`로 필터링한 동별 통계 재산출
  - mv_dong_stats를 (bjd_code, size, mode, build_year_bucket)로 키 확장 검토 — MV 4배 부피
  - 또는 동별 raw 필터링 후 즉석 집계 (성능 검토 필요)
- [ ] **복도식/통로식 구분** — 한국 아파트 동 타입(중복도/계단식)이 매물 선호도에 큰 영향:
  - RTMS 데이터엔 동 타입 컬럼 없음 → 외부 데이터 필요
  - 후보 소스: K-apt(공동주택관리정보시스템 OpenAPI), 국토부 공동주택 정보, 또는 단지명+건축연도 휴리스틱(1990s 이전 = 대부분 복도식)
  - 신규 테이블: `complex_meta(complex_name, bjd_code, dong_type, ...)`. 매칭은 단지명 정규화(공백·괄호·동수 제거) + bjd_code 조합
  - UI: 사이드패널 단지 카드에 `중복도식`/`계단식` 라벨 + 헤더 토글
  - Phase 2 이후 — RTMS만으로는 못 풀고 별도 ETL 필요
- [ ] "Claude로 더 보기" 버튼 → real-estate-mcp 자연어 쿼리 복사

---

## Phase B — 운영 모니터링 (운영 데이터 누적 후 결정)

ETL이 일별로 안정적으로 돌고 데이터가 한 달 이상 쌓인 시점에 도입 검토.

- [ ] **Neon free plan 0.5GB 한도 모니터링** — `pg_database_size('neondb')` 주간 query. 80% (≈400MB) 도달 시 alert + plan 업그레이드 또는 raw 테이블 TTL 검토. 현재 dump 7MB라 여유 큼이지만 서울 25구·12개월 누적 시 빨리 차오를 수 있음
- [x] **Healthchecks.io ping** (2026-05-05 완료) — `etl.yml`에 start/success/fail 3-step 추가. `HEALTHCHECKS_PING_URL` secret graceful skip 패턴. 새벽 03:00에 안 돌면 healthchecks.io에서 이메일/Telegram 알림. 무료 tier.
- [ ] **cron firing 지연 알림** — GHA scheduler가 부하로 1~2시간 늦어질 수 있음. `last_succeeded_at`가 예상 firing 후 +1h 지나도 갱신 안 되면 GH issue 자동 생성하는 별도 cron 작성
- [ ] **/api/health 외부 ping** — Uptime Kuma 셀프호스트 또는 Healthchecks.io의 HTTP check로 5분마다 ping
- [ ] (확장 시) **Grafana Cloud 무료 tier** — agent로 logs 송신, ETL 트렌드 시계열 시각화
- [ ] (서비스화 단계) **Grafana + Loki 셀프호스트** — 풀 컨트롤, RAM ~1GB

트리거 조건:
- 데이터 카운트 5배 이상 증가 (서울 25구 + 경기 인접 확장 시)
- ETL 실패 자가 인지가 늦어 데이터 1~2일 비는 사고 발생 시
- 다른 사람이 동참하기 시작 시

---

## Phase 3 — 수도권 확장 (경기도) — Phase 2 후 재평가

서울만으로 후보가 부족하면 경기도 인접 시 확장. SPEC §3 비목표(`경기도`)는 **Phase 2 이후**라는 보류 표현이지 영구 제외 아님.

### 데이터·DB
- [ ] V-World `LSMD_ADM_SECT_UMD` 시도 코드 다른 zip 다운로드
  - 인천(28), 경기(41) 우선. 충남 세종 등은 추후
  - 파일명 예시: `LSMD_ADM_SECT_UMD_경기.zip` (3MB 내외)
- [ ] `db/load_polygon.py --truncate` 없이 추가 적재 (서울 467 + 경기 N개 합쳐서 보존)
  - `--sido` 인자 동적화 또는 자동 감지 (현재 "서울특별시" 하드코딩)
- [ ] ETL `TARGET_GU` 확장: GANGBUK_14 → 경기 인접 시 (광명·과천·하남·구리·고양·부천 등). 우선순위는 강북 14구와 통근 가능한 1시간권
  - 시군구 코드 새로 정의: `GYEONGGI_NEAR_SEOUL = ["41210"(광명), "41290"(과천), "41450"(하남), …]`
- [ ] RTMS Dev 엔드포인트 일일 호출 한도(10,000건) 재산정 — 서울 14구 + 경기 N구 × 3개월 × 매매·전세

### 도메인 함정 미리 메모
- 경기도 일부 시군은 행정구역 개편이 있어서 LSMD 갱신주기(분기) 영향 큼
- 부천·성남·안산 같은 광역시 산하 구가 있는 시는 시군구코드 5자리 vs 6자리 혼재 케이스 점검
- "동" 명칭 중복(예: 신촌동 — 서울 마포구 vs 경기 의왕시) → bjd_code로만 join, 이름 lookup 절대 사용 금지

### UI
- [ ] Mapbox 초기 zoom·center를 서울 + 인접 경기 포괄로 변경 (현재 zoom 11 → 10 정도)
- [ ] 사이드패널에 시군구 명시 (서울/경기 시각 구분)

### 트리거 조건
- Phase 1 임장 1회 후 "강북 14구 후보 부족" 판단 시
- 또는 "직장 위치가 서울이 아닌 경기 남부" 같은 사용자 상황 변화

---

## Phase 4 — 외곽 매매 추가 + 자체 MCP tool (선택)

- [ ] 외곽 매매 (강원·충청·전라 일부 — 가족 거주 등 비통근 케이스)
- [ ] 자체 MCP tool `find_affordable_dongs` (real-estate-mcp 의존 줄이기)

---

## Phase 5 — 자연어 쿼리 인터페이스 (검토 단계, 2026-05-05 신규)

**목적**: "4억으로 신축 살 수 있는 동" 같은 자연어 쿼리 → LLM 파싱 → MCP tool 호출 → 지도 색칠·사이드패널 결과 노출. read-only 원칙·단정문 금지(조건 통과 N개 + Evidence) 그대로 유지.

### 5.1 LLM 호스팅 모델 검토 (선행 spike — 결정 안 되면 5.2~5.4 진입 금지)

- [ ] 옵션 비교 1pager 작성. 후보:
  - **Local 추론** (Ollama / llama.cpp + Qwen2.5 7B·Llama 3.x 8B): 비용 0, Mac M-series 추론 속도 직접 측정 필요, 사용자 기기 의존하면 PWA 무리 → 서버 측 호스팅이라면 별도 인스턴스 필요
  - **vLLM 셀프호스트**: 처리량 좋음, GPU 필수 (Vercel 비호환), 운영 복잡도·비용 큼
  - **Vercel AI Gateway** (Vercel Knowledge Update 권장): `"provider/model"` 문자열로 멀티 프로바이더 + fallback, 토큰 비용, 가장 단순. AI SDK v6와 자연 통합
  - **Anthropic / OpenAI 직접 API**: 간단, gateway 없을 때 fallback·관측 직접 구현
- [ ] 평가 축: ① 쿼리 → MCP arg 파싱 정확도(샘플 쿼리 30개 정답률) ② P95 latency ③ 비용/100쿼리 ④ 운영 복잡도 ⑤ 데이터 프라이버시(쿼리에 위치 정보 포함 가능)
- [ ] 결정 → SPEC.md ADR 추가 (예: ADR-009 자연어 쿼리 LLM 선정)

### 5.2 백엔드 통합

- [ ] real-estate-mcp를 백엔드에서 호출할 수단 결정 — (a) Python subprocess 직접 호출 (b) MCP HTTP gateway 거치기 (c) Phase 4의 자체 tool로 대체
- [ ] LLM 시스템 프롬프트 작성·고정: "단정문 금지" + "결과는 항상 `조건 통과 N개 + Evidence` 포맷" + "추천·랭킹 표현 금지" — CLAUDE.md 청사진 9원리 그대로 주입
- [ ] 쿼리 파싱 결과 → 기존 `parseAffordableQuery` 스키마로 변환 (구조화 출력 / tool calling 활용)

### 5.3 UI 통합

- [ ] 자연어 입력 박스 — 헤더 토글 또는 모바일 bottom sheet 진입점
- [ ] LLM 파싱 결과를 기존 슬라이더/토글 상태에 동기화(투명한 변환), 폴리곤 색칠은 기존 affordable 경로 그대로 재사용
- [ ] 사이드패널에 LLM 응답 본문 노출 + Evidence 포맷 클라이언트 측 검증(단정문 패턴 감지 시 경고 배너)

### 5.4 운영

- [ ] rate limit (IP·세션별 분당 N회) — Vercel KV 폐지됨, Marketplace의 Upstash Redis 등으로 구현
- [ ] 비용 모니터링 + 일일/월 누적 알람 (Telegram 토픽)
- [ ] 쿼리/응답 로그 (PII·정확한 좌표 제거) — 향후 정확도 회귀 평가용 데이터셋

### 트리거 조건

- Phase 1 임장 1회 검증 후 + "지도 슬라이더만으로는 부족" 판단이 나왔을 때만 진입
- Phase 4 자체 MCP tool 또는 real-estate-mcp 백엔드 호출 경로 중 한쪽이 확보된 후
