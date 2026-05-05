# CHANGELOG

형식: `## [vX.Y.Z] - YYYY-MM-DD - 제목` → `### 추가 / 변경 / 수정 / 결정`

**버전 bump 룰** (`.github/workflows/version-bump.yml`):
- 새 PR이 release 가치 있으면 CHANGELOG 최상단에 `## [Unreleased] - 제목` 섹션 추가 (날짜는 워크플로가 KST merge일로 자동 기입)
- PR이 main에 merge되면 워크플로가 PR title 접두어 보고 bump 종류 결정 → `feat:` minor / `fix:`·`chore:`·`docs:`·`ci:`·`refactor:`·`perf:`·`test:`·`style:`·`build:` patch / PR body에 `BREAKING CHANGE` 포함 major
- `[Unreleased]` 섹션이 **없으면 워크플로 skip** — bump 안 일어남. release 의사 없는 PR(코멘트 정리 등)은 [Unreleased] 생략하면 됨
- 같은 버전이 여러 섹션에 걸쳐 반복되면 한 release에 포함된 별도 milestone임을 의미 (retrofit 산물)

---

## [v0.5.5] - 2026-05-05 - pre-merge bump 통합 + Telegram 알림 1회·CHANGELOG 라벨 동적

기존 흐름은 PR merge 후 별도 bump commit이 main에 추가 push되어 Vercel rebuild가 두 번 발생하고 Telegram 🎯 Production 알림도 2회 도착. 이번 변경으로 **bump이 PR head에 prebump 시점에 force-push로 미리 통합**되어 main에 squash 1 commit으로 들어가게 됨 → Vercel rebuild 1회·알림 1회·푸터 버전 즉시 갱신·CHANGELOG 본문 정확 모두 만족.

### 변경
- `.github/workflows/version-bump.yml` — 트리거 `pull_request: closed` → `[opened, synchronize, reopened, edited, closed]`. `prebump` job(PR head에 chore(release): commit force-push, 멱등성을 위해 기존 chore(release): 발견 시 reset HEAD~1 후 재계산) + `finalize` job(merge 후 main에서 tag만 push)으로 분리.
- `.github/workflows/telegram-deploy-notify.yml` — CHANGELOG 추출을 `[Unreleased]` 고정 → 첫 `## [...]` 섹션 일반화. 헤더 라벨(`[v0.5.5]` / `[Unreleased]`)도 동적 추출해서 메시지 본문에 표시.
- `CLAUDE.md` 「배포 워크플로」 — prebump 시점·1회 알림·finalize tag 분리 흐름 반영.

### 결정
- **prebump force-push 패턴**: `--force-with-lease`로 사용자 commit 손실 방지. GITHUB_TOKEN으로 push (PAT 사용 시 워크플로 자기 트리거 가능 → 무한 loop 회피). PR title 변경(edited 트리거) 시에도 reset + 재계산으로 멱등성 보장.
- **finalize job 분리**: tag만 push이라 Vercel deployment_status 트리거 안 됨 → 추가 알림 발생 안 함. main의 push event는 squash merge로 이미 발생한 1회만.
- **bump version은 main 기반으로 계산** (Codex P1): PR head의 package.json이 아니라 origin/main의 현재 version에서 bump → 두 release PR 동시 진행 시 같은 next version precompute 회귀 방지.
- **finalize는 merge_commit_sha checkout + fetch-tags** (Codex P1·P2): main HEAD가 아닌 PR의 머지 commit에 explicit SHA로 tag → 다른 PR이 그 사이 머지되어도 우리 PR의 commit에 정확히 tag 붙음. fetch-tags로 원격 tag 인식해 rerun 시에도 깔끔히 skip.

### 추가 (이번 PR self-test)
- 이 PR이 self-test 불가능(main의 옛 워크플로가 prebump 트리거 안 함)이라 bump을 PR 본문에 직접 포함시킴 — `web/package.json` v0.5.4 → v0.5.5, CHANGELOG `[Unreleased]` → `[v0.5.5]`. 머지 후 새 워크플로의 finalize가 main 머지 commit에 tag v0.5.5 push. 다음 PR부터 prebump 자동 동작.

---

## [v0.5.4] - 2026-05-05 - Vercel Hobby 큐 stuck 진단 TIL + .md only build skip

PR #6(v0.5.3) merge 직전 19분째 Queued 상태에서 발견된 운영 함정. Vercel Hobby plan은 account-wide 동시 빌드 1개라 같은 account의 다른 프로젝트(junggu-trash-map 등) stuck이 우리 빌드까지 막는다. dispatcher phantom hold 상태가 되면 visible한 in-progress 빌드가 없어도 새 enqueue가 진행 안 됨. 진단 + 복구 절차(All Projects 뷰 → 가장 오래된 phantom suspect cancel → 1~2분 관찰)를 TIL + 블로그 단편으로 박음.

부수 대응으로 `.md` only commit은 Vercel build skip 적용 — 도큐 변경마다 main rebuild + Telegram 노이즈가 빈번해 큐 부하의 한 원인이었다. `vercel.json` `ignoreCommand`로 `.md` 외 변경 없으면 exit 0(skip).

### 추가
- `docs/til/2026-05-05-vercel-hobby-queue-stuck.md` — 현상·원인·수정·교훈 4단락
- `docs/blog/2026-05-05-vercel-hobby-queue-stuck.md` — 외부 공유용 단편 draft
- `web/vercel.json` — `ignoreCommand`로 `.md` only commit build skip

### 변경
- `docs/til/README.md` Infra 카테고리 한 줄 추가
- `docs/blog/README.md` 단편 인덱스 한 줄 추가
- `CLAUDE.md` 「배포 워크플로」 — `.md` only commit은 Vercel build 자동 skip 명시

---

## [v0.5.3] - 2026-05-05 - Mapbox 토큰 환경별 분리 + client-token-rotation 스킬 + ADR-009

`NEXT_PUBLIC_MAPBOX_TOKEN`을 production / preview 환경별로 분리. Mapbox URL restriction이 wildcard 미지원이라 단일 토큰으론 hash 기반 Vercel preview URL을 보호할 수 없는 구조. 신규 토큰 `eodigakka-prod`(restriction `https://eodigakka.vercel.app`만)을 Production env에, 기존 default token(unrestricted)을 Preview env + 로컬 `.env.local`에 분리. Production redeploy(캐시 해제) 후 지도 작동 검증.

### 결정
- ADR-009: client-side `NEXT_PUBLIC_*` token은 환경별 분리 발급 패턴 표준화. Production은 strict URL restriction, Preview/local은 unrestricted (노출 표면이 작아 trade-off 합리).

### 추가
- `docs/til/2026-05-05-mapbox-token-url-restriction.md` — wildcard 미지원 + 환경별 분리 우회.
- `docs/blog/2026-05-05-mapbox-token-url-restriction.md` — 외부 공유용 단편 draft.
- `.claude/skills/client-token-rotation/SKILL.md` — 이번 세션의 5단계 워크플로(third-party 콘솔 발급 → Vercel env 분리 → redeploy → DevTools 검증 → til-flow 연결)를 재사용 가능한 스킬로 추출. Sentry DSN·Analytics·Stripe publishable key 등에 동일 적용.

### 변경
- `tasks.md` E 섹션 — Mapbox 화이트리스트 항목 체크 + 분리 토큰 결과 기록.
- `CLAUDE.md` 「반복 작업 → skill-creator」 — `client-token-rotation` 스킬 항목 추가.

---

## [v0.5.2] - 2026-05-05 - 버전 bump 자동화 + CHANGELOG retrofit

`.github/workflows/version-bump.yml` 도입 — PR이 main에 merge되면 PR title의 Conventional Commit type을 보고 `web/package.json` 자동 bump, `[Unreleased]` CHANGELOG entry를 실제 버전 + KST 날짜로 치환, git tag push까지. `[Unreleased]` 없으면 workflow 자체를 skip하는 opt-in 패턴 — release 의사 없는 PR은 churn 발생 안 함. Mr. Song이 1회 발급할 `RELEASE_PAT` 시크릿(repo contents:write)으로 main의 branch protection을 통과한다.

기존 CHANGELOG 15개 섹션을 7개 버전 라벨(v0.0.1~v0.5.1)로 retrofit. 같은 버전이 여러 섹션에 반복되는 경우 = 한 release에 묶인 별도 milestone (예: v0.4.0이 UX 라운드 3 milestone, v0.3.0이 Neon 마이그 5 milestone).

### 추가
- `.github/workflows/version-bump.yml` — PR merge 트리거 + workflow_dispatch 복구용. `[Unreleased]` gate, bump type 결정, package.json bump, CHANGELOG 치환, commit + tag + push 5단계.

### 변경
- `web/package.json` — `0.1.0` → `0.5.2`. 0.1.0이 시각상 불일치(retrofit head는 v0.5.1)였고 본 PR의 chore release 1단계 더 → 0.5.2.
- `CHANGELOG.md` — 헤더 형식 `## [vX.Y.Z] - YYYY-MM-DD - 제목`으로 통일. 형식 안내문에 [Unreleased] gate 룰 명시.
- `CLAUDE.md` 「## 배포 워크플로」 — 자동 bump 단계 + bump 룰 표 + 2회 deploy 알림 정상 흐름 추가.

### 결정
- **opt-in 패턴**: workflow는 `[Unreleased]` 있을 때만 동작. trivial PR은 [Unreleased] 생략으로 자연 skip.
- **PAT 사용**: GITHUB_TOKEN으론 protected main 못 미니까 fine-grained PAT(`RELEASE_PAT`)에 contents:write만 부여.
- **2회 deploy 수용**: PR merge commit + bump commit 각각 Vercel rebuild → Telegram 🎯 Production 토픽 2회 알림. 솔로 dev 노이즈 미미. 단일 deploy를 위한 pre-merge bump는 GHA 복잡도가 너무 커 미채택.
- **chicken-and-egg 회피**: 본 PR(workflow 도입 자체)은 [Unreleased] 사용 안 함. 수동으로 v0.5.2 라벨 부여 → workflow의 첫 실제 run은 다음 PR부터.

---

## [v0.5.1] - 2026-05-05 - 모바일 hover tooltip 영구 잔류 회귀 fix

Production 배포 후 발견된 모바일 회귀. 동을 탭하면 `HoverTooltip`이 안 사라지고 SidePanel 위에 겹쳐 떠 있는 현상. 터치 환경에서는 mouseleave 이벤트가 안 발사되는 게 원인이라 mapbox `mouseleave` 핸들러로 hover state를 비울 수 없다.

### 수정
- `web/app/page.tsx` — `useIsHoverCapable` 훅 추가 (`matchMedia('(hover: hover) and (pointer: fine)')`). 터치 디바이스에선 HoverTooltip 자체를 렌더 안 함.
- 동시에 `!selectedBjd` 가드 추가 — sidepanel 열린 동안 데스크톱에서도 tooltip 자동 숨김 (포커스 한곳).

---

## [v0.5.0] - 2026-05-05 - Vercel 배포 셋업 + Telegram 자동 알림 + 배포 워크플로 정책

`jetsongdev/eodigakka` Vercel 프로젝트 생성·연결, GitHub Deployments → GHA → Telegram 3토픽 분기 알림 자동화, main branch protection 적용으로 PR 강제 흐름 박음. 첫 production deploy 통과 (sha `4c2b288`, https://eodigakka.vercel.app).

### 추가
- `web/.vercel/project.json` → `.vercel/project.json` (repo root)으로 이동, Vercel project root directory를 `web`으로 설정. monorepo 패턴.
- `.gitignore`에 `.vercel/`, `test-results/` 추가
- `.github/workflows/telegram-deploy-notify.yml` (이전 commit) — `deployment_status` 이벤트로 Preview/Production/Errors 토픽 분기. CHANGELOG `[Unreleased]` 본문 동봉, 인라인 버튼 (Open/Commit/PR).
- Telegram secrets/variables 등록: `TG_BOT_TOKEN`, `TG_CHAT_ID`, `TG_TOPIC_PREVIEW=2`, `TG_TOPIC_PROD=3`, `TG_TOPIC_ERROR=15`
- Vercel env: `DATABASE_URL`, `NEXT_PUBLIC_MAPBOX_TOKEN` (Production + Preview)

### 변경
- `next.config.js` (web) — `NEXT_PUBLIC_APP_VERSION` (package.json) + `NEXT_PUBLIC_GIT_SHA` (`git rev-parse --short HEAD`) 빌드 타임 inject. 푸터에 `v0.1.0 #<sha>` 자동 표기 → 배포 시점 재현 가능성 확보.
- 로딩 오버레이 UI (web/app/page.tsx) — 첫 페이지 진입 시 `polygonCount + affordable` 둘 다 도착할 때까지 반투명 spinner + 단계별 텍스트 (`서울 467개 법정동 경계 로드 중...` → `동별 거래 데이터 분석 중...`). `pointerEvents: none`으로 mapbox 인터랙션 방해 안 함.
- e2e `map.spec.ts` — `폴리곤` / `eodigakka` strict-mode 충돌 회피 위해 LoadingOverlay 텍스트 분리 (`경계` 사용).

### 결정
- **main 직접 push 금지 정책** (CLAUDE.md `## 배포 워크플로` 신설) — feature branch → push (Vercel Preview 자동) → PR 자가 머지 → main Production. 예외: 문서만 변경, `.github/workflows/`, 명시 핫픽스.
- **GitHub branch protection** 적용 — `required_pull_request_reviews: 0`, `enforce_admins: false`(admin 우회 허용), `allow_force_pushes/allow_deletions: false`. 솔로 dev에 적합한 가벼운 강제.
- `.vercel/`은 repo root에 두고 root directory만 dashboard에서 `web` 지정 — monorepo 표준. `vercel link`를 web/에서 직접 하면 cwd 충돌 (`web/web` not found)이 일어남.
- CLI deploy(`vercel --prod`)는 GitHub Deployments 이벤트 발사 안 함 — telegram 워크플로 트리거하려면 git push trigger 사용.
- Mapbox 토큰은 `NEXT_PUBLIC_` prefix가 의도된 설계 (브라우저 → mapbox.com 직접 호출). 노출은 정상이고 보안은 mapbox 대시보드 URL 화이트리스트로 처리. 잔여 작업으로 분리.

---

> **v0.4.0 cluster** (3 milestones): UX 라운드 묶음. 아래 3섹션이 같은 release.

## [v0.4.0] - 2026-05-05 - UX 마무리 라운드 — 슬라이더 비동기 색칠 + 사이드패널 분포 차트 + 모바일 collapsible

`tasks.md` A. UX 마무리 갈래 3건 동시 처리. 슬라이더는 드래그 종료(`onValueCommit`)에서만 색칠하던 것을 드래그 중(`onValueChange`) 150ms debounce로 비동기 갱신, in-flight `/api/affordable` fetch는 `AbortController.abort()`로 cancel해 race를 막았다. 사이드패널은 `mv_dong_stats`의 `p25/median/p75`를 `/api/dong/[bjd]/complexes` 응답에 `distributions[]`로 노출하고 SVG 박스플롯으로 매매·전세 양쪽을 같은 가로축에 그렸다(현재 모드는 100%, 비교 모드는 55% 투명). 모바일(`max-width: 640px`)에서는 ControlPanel을 기본 접힘 상태로 시작하고 1줄 요약(`27개 동 · 매매 · 4억~8억 · M형`)만 노출, 사용자 토글 후에는 자동 동기화를 멈춰 선택을 존중한다. e2e 테스트 12개 모두 통과.

### 추가
- `web/app/api/dong/[bjd]/complexes/route.ts` — `mv_dong_stats` SELECT으로 `distributions[]`(mode×size_bucket별 p25/p50/p75/tx_count) 추가
- `web/app/page.tsx` `DistributionChart` SVG 컴포넌트 — IQR 박스 + median 세로선 + p25/p75 숫자 라벨, size='all'이면 표본 최대 버킷 자동 선택
- `web/app/page.tsx` `ControlPanelBody` 분리 — collapsed 상태와 본문을 분리해 mobile collapsible 구현
- `web/app/page.tsx` `userToggledRef` — 사용자가 토글 후에는 viewport 변경에 의해 자동 펼침/접힘 안 되도록

### 변경
- `CashRangeSlider` `onValueChange`에 `setTimeout(onChange, 150)` debounce — 드래그 중에도 색칠 갱신
- `CashRangeSlider` `onValueCommit`은 pending timer를 clear하고 즉시 호출 — 드래그 종료 시 latency 0
- `/api/affordable` fetch에 `signal: controller.signal` — `cancelled` flag 외에 실제 네트워크 요청도 abort
- `useEffect` cleanup에서 `AbortError`는 무시 (의도된 cancel)

### 결정
- 분포 차트는 SVG 직접 — `recharts`/`visx` 의존성 추가 회피, 박스플롯 1개라 30줄로 충분
- 모바일 SidePanel은 본 라운드 scope 밖 (bottom sheet 패턴은 후속) — 현재 collapsible은 ControlPanel만
- "매매·전세 동시 비교"는 분포 차트에 흡수 — 별도 카드 만들지 않음

### 수정
- 지도 init useEffect 방어 강화 — WebGL 사전 probe, `new Map()` try/catch, `failIfMajorPerformanceCaveat: false`, `map.on('error')`, cleanup `try { map.remove() }`. dev에서 StrictMode + HMR로 누적된 WebGL 컨텍스트 누수가 `Failed to initialize WebGL` throw로 이어지던 함정 (TIL `2026-05-05-mapbox-webgl-strictmode`). Playwright fresh 세션에서는 정상이라 검증 사각지대였다.
- 에러 안내 박스 `whiteSpace: 'pre-line'` + `lineHeight: 1.55` + `maxWidth: 420` — WebGL 점검 4단계 안내가 한 문단으로 뭉치던 것을 줄바꿈 보존.

---

## [v0.4.0] - 2026-05-05 - Cash 변경 +/- 칩 + 결과 카드 위계 + 데이터 출처 attribution

슬라이더 변경 결과를 정량으로 노출 + Evidence 가독성 개선 + 데이터 출처 명시. snapshot 06 캡처.

### 추가
- `CashDeltaChip` 컴포넌트 — 자금 슬라이더 변경 시 추가/제거 동 카운트(`+N` 초록 / `−N` 빨강)를 자금 범위 텍스트 옆 둥근 배지로 표시. 다음 변경이 올 때까지 유지(자동 fade-out 없음, mode/size 변경 시 reset). `prevMatchedRef` + `lastFilterCtxRef`로 mode/size 변경의 첫 호출은 delta 비표시.
- `Footer` 컴포넌트 — 페이지 하단 일반 푸터(non-floating). outer를 flex column으로 묶어 지도(`flex: 1`) + 푸터(`flex-shrink: 0`)로 분리. 두 줄:
  - **면책**: `이 사이트는 임장 후보를 색칠지도로 제시할 뿐, 매매 권유나 투자 자문이 아닙니다. 결과는 RTMS 신고분 기준 통계로 단정문이 아닌 후보 제시이며, 실제 거래 판단은 사용자 본인 책임.` (청사진 9원리 사용자 가시 표기)
  - **데이터/버전**: `국토교통부 RTMS · V-World LSMD 법정동 · © Mapbox/OpenStreetMap | RTMS 2026-05-03 신고분까지 | v0.1.0 #4e02b3a`
  - 처음엔 좌하단 floating `DataSourceAttribution`으로 시작했으나 면책 추가로 텍스트가 길어져 푸터 패턴으로 전환.
- `formatMan` helper — 1억(=10000만) 이상이면 `4억` / `4.5억`, 미만이면 `5천만` / `4500만` / `0`. 기존 `manToEok`은 `(man/10000).toFixed(0)`로 4.5억 → "5억" 반올림 버그가 있었던 부분 자연 해결.
- `web/next.config.js` (신규) — `NEXT_PUBLIC_APP_VERSION` (package.json version), `NEXT_PUBLIC_GIT_SHA` (`git rev-parse --short HEAD`)를 빌드 타임에 inject. dev/prod 양쪽에서 동일 작동.

### 변경
- 결과 카드 구조 — 한 줄 평문 evidence(`조건 일치 N개 동, 모드 TRADE, 현금 NNNN~NNNN만원`)에서 두 줄 위계로:
  - 22pt 큰 숫자 + `개 동 통과` (강조)
  - 11pt 메타: `매매 · 4억~8억 · M형` (보조)
- evidence 문자열도 새 포맷(`N개 동 통과 · 매매 · 4억~8억`)으로 client에서 재생성.
- 슬라이더 좌우 라벨 / 자금 범위 라벨 모두 `formatMan` 적용 — 1억 이상 자동 억 단위.
- ControlPanel 카드 하단 `폴리곤 N개 · RTMS 신고분까지`에서 freshness 표기 제거 — attribution 박스로 일원화.
- e2e `map.spec.ts` — evidence selector를 `/(매매|전세) · .+~.+ · /`로, cash 검증을 `'3억~8억'` 식 한국어 표기로 갱신.

### 결정
- delta 칩 fade-out timeout 안 둠 — 캡처/검증 타이밍 의존성 제거 + 사용자가 슬라이더 멈춘 후에도 직전 변경량 확인 가능.
- attribution은 작은 박스로 — 대부분의 OSS 지도 서비스 관행과 일관, 가독성 해치지 않음.
- `+/-` 색상은 결과 카드 강조색(초록 `#1f6e3a`, 빨강 `#a13030`)과 일관.

---

## [v0.4.0] - 2026-05-05 - 슬라이더 latency 0 — 클라 사이드 cash 필터로 전환

기존 debounce 150ms + AbortController 패턴은 여전히 매 입력마다 네트워크 왕복(평균 50~100ms)이 발생해 슬라이더 핸들 이동과 색칠 사이에 가시적 lag이 있었다. 같은 mode×size에서는 cash 범위만 바뀌면 표본 자체가 동일하므로, mode/size 변경 시 한 번만 fetch하고 cash 필터는 client 메모리에서 처리하도록 데이터 흐름을 재설계. 키보드로 슬라이더 25ms 간격 20회 이동하는 동안 `/api/affordable` 호출 0회 — 진짜 실시간 반응.

### 변경
- `web/app/page.tsx` 데이터 흐름 분리 — useEffect 두 개로:
  - **2-A**: `[query.mode, query.size]` 변경 시에만 fetch. cash 범위는 wide-open(0~50억)으로 보내 mode×size별 전체 동을 캐시(`allDongs` state).
  - **2-B**: `[allDongs, query.cashMin, query.cashMax]` 변경 시 client filter + map feature-state 갱신. network roundtrip 없음.
- `CashRangeSlider` debounce·AbortController 패턴 제거 — `onValueChange` 즉시 onChange. `onValueCommit` 분기도 제거(필요 없음).
- `buildAffordableUrl` helper 삭제 (dead code).
- Evidence 텍스트는 client에서 매번 재구성 — `조건 일치 N개 동, 모드 …, 현금 …`.

### 결정
- 서버 사이드 cash 필터는 API에 그대로 유지 — 직접 API 호출 사용처(외부 통합, smoke test) 호환.
- `data_freshness`는 fetch 시점에만 갱신 — cash 슬라이더 이동에는 영향 없음 (RTMS 신고일자는 cash와 독립).
- Effect 2-B의 `removeFeatureState({ source })` + 재설정 패턴은 그대로 — 467개 dongs 기준 단일 frame 내 처리 가능. 추후 diff 기반으로 최적화 여지 있으나 본 라운드 scope 밖.

---

> **v0.3.0 cluster** (5 milestones): Neon 마이그레이션 + GHA cron 운영 전환 묶음. 아래 5섹션이 같은 release.

## [v0.3.0] - 2026-05-05 - 다음 라운드 후보 정리

`tasks.md` 상단에 "다음 라운드 후보 (2026-05-05 기준)" 섹션 추가. Neon 마이그레이션 + GHA cron 안정화 직후 시점에서 4갈래 후보(A. UX 잔여 / B. 운영 모니터링 / C. 블로그 풀 초안 / D. Phase 2)로 분류, 각 갈래별 트리거 조건 명시.

### 추가
- `tasks.md` 다음 라운드 후보 섹션 — 4갈래 분류 + 비-차단 정리(`run_etl.sh` 삭제 검토 등) 섹션
- `tasks.md` Phase B에 "Neon free plan 0.5GB 한도 모니터링" / "cron firing 지연 알림" 2건 추가
- 블로그 시리즈 풀 초안은 별도 세션에서 진행한다는 결정 명시 (사용자 의향 반영)

---

## [v0.3.0] - 2026-05-05 - 함정 6 정확한 fix로 정정 — direct endpoint 채택

a2eb788의 `options="-c search_path=public"` startup option을 Neon pooler가 차단(`unsupported startup parameter in options: search_path`). PgBouncer 일반 지식을 vendor-specific 환경에 그대로 가져온 게 문제. 1차 fix는 검증 안 한 채 commit + 블로그 결론까지 박았다 — 메타 교훈 1건.

### 수정
- `etl/fetch_rtms.py` / `.github/workflows/etl.yml`의 `options=...` revert (1c4a185).
- GitHub Secret `DATABASE_URL`을 direct endpoint(`-pooler` 제거)로 갱신. ETL은 GHA cron 짧은 single connection이라 pooler 이점 0, direct가 본래 적합.

### 추가
- TIL 함정 6 fix 섹션을 "1차 시도(틀린 fix) → 2차 fix(direct endpoint)" 흐름으로 정정. 교훈에 "Neon pooler ≠ 일반 PgBouncer", "fix 검증 전에 결론 박지 말 것" 2건 추가.
- 블로그 시리즈 6편(`docs/blog/2026-05-05-neon-migration-series/06-startup-option.md`)을 같은 결론으로 다시 작성 — 두 fix 흐름과 메타 교훈 포함.

### 결정
- batch ETL은 처음부터 **direct endpoint**. pooler는 web 동시성용. 워크로드 기준으로 endpoint 선택.

---

## [v0.3.0] - 2026-05-05 - 블로그 포스팅 시리즈 초안 추가

`docs/blog/2026-05-05-neon-migration-series/` — Neon 마이그레이션 함정 6중을 외부 독자용 narrative로 재구성한 6편 시리즈 (draft 상태). 시리즈 인덱스 + 각 편 frontmatter·outline·draft hook·핵심 코드 스니펫.

### 추가
- `docs/blog/README.md` 작성 규약 + 시리즈 인덱스
- `docs/blog/2026-05-05-neon-migration-series/00-index.md` 시리즈 개요
- 1~6편 draft (`01-launchd-tcc.md` … `06-startup-option.md`)
- `CLAUDE.md` 문서 단계 표에 `docs/blog/` 항목 추가

### 결정
- TIL이 1차 기록(현상→원인→수정→교훈, 4단락)이면 블로그는 외부 독자용 narrative — 같은 사고를 다른 시점·청중으로 재구성.

---

## [v0.3.0] - 2026-05-05 - GHA cron 안정화 + launchd 잔재 정리 (issue #1 close)

`workflow_dispatch` 첫 trigger 통과 후 직전 두 run의 `InvalidSchemaName` 분석 — Neon pooler가 transaction-mode 분배 시 일부 backend의 `search_path`에 `public` 누락. 영구 fix는 client-side startup option 1줄.

### 수정
- `etl/fetch_rtms.py` `psycopg2.connect`에 `options="-c search_path=public"` 추가 (main 함수와 `refresh_materialized_views` 두 군데). startup option은 매 backend connect 시 server에 전달돼 transaction pooler 분배와 무관하게 결정적으로 적용 — `ALTER ROLE`보다 surgical.
- `.github/workflows/etl.yml` post-summary `psycopg2.connect`도 동일 패턴.

### 변경
- `com.chsong.eodigakka-etl.plist` repo에서 삭제 (history는 d611364에 보존). LaunchAgents 사본은 fallback용 유지.
- `tasks.md` cron 항목을 launchd → GHA cron 운영으로 갱신.

### 추가
- TIL `docs/til/2026-05-05-neon-migration-tcc-launchd.md` 함정 6(`InvalidSchemaName`) + startup option fix 기록, 제목·교훈 갱신(5중 → 6중).

### 결정
- search_path 같은 GUC는 client-side `psycopg2.connect(options="-c key=value")`로 박는 게 server-side `ALTER ROLE`보다 surgical (blast radius 작음). 다른 client(web Next.js 등)에 영향 안 감.

---

## [v0.3.0] - 2026-05-05 - Neon 마이그레이션 적재 통과 (issue #1 후반부)

`bash db/migrate_to_neon.sh` 끝까지 green — bjd 467 / trade 5,456 / rent 14,744 / mv_stats 801, MV refresh 2건 + 인덱스 5건 재생성. GHA Secrets 등록·workflow_dispatch·launchd 정리는 issue #1로 이어진다.

### 수정
- `db/migrate_to_neon.sh` 검증 query를 fully-qualified로 (`public.bjd_polygon` 등). 함정 3(pooler search_path)을 PostGIS 점검에만 적용하고 검증 step에 빠뜨려 import 전부 성공한 뒤 마지막 SELECT만 `relation does not exist` 발생.

### 추가
- TIL `docs/til/2026-05-05-neon-migration-tcc-launchd.md` 함정 5(fix 적용 누락) 섹션 + 적재 결과 표 추가, 진행 상태를 "적재 완료, GHA 후속"으로 갱신.

---

## [v0.2.0] - 2026-05-05 - Phase 1 프론트 완성 + e2e 12/12 + 정책 추가

Phase 1 색칠지도 6단계 모두 동작 완료, 회귀 안전망 1차 구축.

### 추가
- **API**: `web/app/api/polygons/route.ts` — `bjd_polygon` 467개 동 GeoJSON FeatureCollection (24h 캐시), Mapbox source용
- **Mapbox 색칠지도** (`web/app/page.tsx`):
  - 서울 zoom 11 light 스타일 + `/api/polygons` source/layer (snapshot 01)
  - `/api/affordable` 결과를 feature-state로 join, `evaluateAffordableDong` 색상 매핑 적용 (snapshot 02)
  - 헤더 컨트롤: 매매·전세 토글 / cash 듀얼 슬라이더(`@radix-ui/react-slider`) + 카세트 6 버튼 + 평형 토글(snapshot 04)
  - 마우스오버 tooltip + 클릭 사이드패널(TOP5 단지 + 최근 거래 10건 + 신구축 혼재 ⚠️) (snapshot 03)
  - 전세 모드 색칠 — 79개 동 통과, 빨강(전세가율 80%+) 시각 노출 (snapshot 05)
- **e2e 회귀**: `web/tests/e2e/{api,map}.spec.ts` 12개 (Codex 작성, 4.2초 green)
  - api 5종(health/polygons/affordable trade·jeonse/invalid size 400)
  - map 7종(헤더/폴리곤 카운트/매매↔전세 토글/cash ±1억·±10억 점프 + 0억 clamp/size 토글/canvas 존재)
- **스냅샷 5장**: `docs/snapshots/01~05/` (각 데스크톱 1920×1080 + 모바일 390×844 + meta.md)
- **til-flow 스킬**: `.claude/skills/til-flow/` — TIL+CHANGELOG+tasks+README 일괄 갱신 워크플로우 자동화
- **snapshot 스킬 갱신**(글로벌): 데스크톱 1920×1080 표준, 한 폴더 여러 장 가이드, 브라우저 maximize 메모

### 결정
- **CLAUDE.md 도구 우선순위**: CLI > MCP (대체 가능 시). e2e/DB/외부 fetch는 CLI, 시각 캡처·자연어 탐색은 MCP.
- **CLAUDE.md 반복 작업 → skill-creator**: 워크플로우 2회 반복 시 자동 스킬화 제안 (til-flow / snapshot이 그 결과물).

### 추가 (의존성·도구)
- `@radix-ui/react-slider` (cash 듀얼 핸들 슬라이더)
- `@playwright/test` + chromium (e2e)
- `mapbox-gl` + `@types/mapbox-gl`

### 확인
- 강북 14구 매매 가격 분포: p99 26억, max 156억(outlier 1건). cash 슬라이더 max는 50억으로 결정 (99%+ cover, 청사진 §3 비목표 강남4구 준수)
- 매매 4~8억 M → 27개 동 통과, 전세 4~8억 M → 79개 동 통과 (Phase 0 bulk pull과 일치)

### Phase 2 task 누적 (총 9건)
1. 슬라이더 드래그 중 비동기 색칠 (debounce + AbortController)
2. 슬라이더/카세트 햅틱 피드백 (Web Vibration API, Android 한정)
3. 모바일 컨트롤·범례 분리 (시야 점유 60%+ 확보)
4. 사이드패널 UI 개선 (분포 차트·매매전세 동시·액션 버튼·bottom sheet)
5. 1인 가구 평형 세분화 (XS<33㎡ 또는 <40㎡)
6. 신축/구축 build_year 필터
7. 복도식/통로식 구분 (외부 데이터 K-apt OpenAPI)
8. 서울 25구 전세 확장 (TARGET_GU=SEOUL_25)
9. 정책대출 체크박스 (신생아·신혼·버팀목)

### 다음 작업
- 사용자: `cp etl/com.chsong.eodigakka-etl.plist ~/Library/LaunchAgents/ && launchctl load ...`로 일일 03:00 ETL 자동 실행 켜기
- 사용자: 임장 1회 (청사진 9원리 Apply 게이트)

---

> **v0.1.0 cluster** (3 milestones): Phase 1 ETL 백엔드 + 법정동 마이그레이션 묶음. 아래 3섹션이 같은 release.

## [v0.1.0] - 2026-05-05 - ADR-008 실행 — bjd_polygon 법정동 마이그레이션 완료

### 결정
- ADR-008(법정동 폴리곤 채택) 실행 단계 완료. SPEC 변경 없음.

### 추가
- `db/load_polygon.py` `detect_shapefile_encoding()` — `.cpg`/`.cst` 사이드카에서 인코딩 자동 추출 (V-World는 EUC-KR을 `.cst`에 둠)
- `db/load_polygon.py` `pad_bjd_code_to_10()` — 8자리 `EMD_CD`(시도2+시군구3+읍면동3) → 10자리 법정동 코드 (끝에 "리" 자리 "00")
- `docs/til/2026-05-05-lsmd-shapefile-pitfalls.md` — V-World LSMD 함정 3종 정리

### 변경
- `db/load_polygon.py` `load_file()`: 인코딩 자동 감지 + 패딩 함수 적용
- `bjd_polygon` 데이터: HangJeongDong 행정동 427개 → LSMD UMD 법정동 467개 (TRUNCATE 후 재적재)
- `tx_apt_rent`: TRUNCATE 후 ETL 재실행 → 행정동 코드(잘못된 fallback) 데이터 제거, 법정동 코드로 재적재 (15,432건)

### 확인
- 다운로드 파일 사이즈로 데이터셋 검증 (`LSMD_CONT_LDREG` 200MB 필지 단위 → 잘못, `LSMD_ADM_SECT_UMD` 2.4MB 동 단위 → 정답)
- `mv_dong_stats × bjd_polygon` JOIN 100%: TRADE 390/390, JEONSE 411/411
- SQL 검증: 강북 14구 M형 4~8억 high confidence 동 정상 노출 — 방학동(5.0억), 쌍문동(5.4억), 도봉동(5.95억) 등 Phase 0 bulk pull 결과와 일치

### 다음 작업
- API `/api/affordable` 라이브 재검증 (dev 서버 재기동 후)

---

## [v0.1.0] - 2026-05-05 - ETL 자동화 래퍼 + launchd plist

### 추가
- `etl/run_etl.sh` — `.env` 로드 + `logs/etl-YYYYMMDD.log` 출력 + venv python 직접 호출. cron/launchd 양쪽 호환. `set -euo pipefail`로 중간 실패 캐치.
- `etl/com.chsong.eodigakka-etl.plist` — launchd 매일 03:00 실행 schedule. `RunAtLoad=false` (load 시점에 즉시 실행 막음).
- `.gitignore`에 `logs/` 추가.

### 확인
- 래퍼 스모크 테스트: 38초, exit 0, `trade_rows_seen=5476 / rent_rows_seen=15432` 정상 적재.

### 다음 작업
- 사용자가 `cp ... ~/LaunchAgents/` + `launchctl load ...`로 plist 등록.
- Mapbox 색칠지도 (Phase 1 마지막 산출물).

---

## [v0.1.0] - 2026-05-04 - Phase 1 ETL 검증 + API smoke + 도메인 함정 발견

### 결정 (ADR)
- ADR-008: bjd_polygon 행정동→법정동 코드 체계 마이그레이션 (LSMD 법정동경계 shapefile 채택)

### 수정
- `etl/fetch_rtms.py` `filter_cancelled` — `해제여부` 필터 로직 수정
  - 원인: `translate=True` 시 NaN이 문자열 `"nan"`으로 변환돼 정상 거래가 전부 필터 아웃
  - 수정: `normalize_text(v) is None` → `str(v).strip().upper() != "O"` (취소 계약은 `"O"` 명시 체크)
- `etl/fetch_rtms.py` `refresh_materialized_views` — 별도 autocommit 커넥션으로 분리 (`CONCURRENTLY`는 트랜잭션 밖에서만 실행 가능)

### 추가
- `etl/tests/test_fetch_rtms.py` — 회귀 테스트 (`filter_cancelled` 정상 거래 보존)
- `docs/til/` — Phase 0~1 시행착오 9개 + README 인덱스
  - real-estate-mcp 403 / claude mcp add 문법 / Python 3.14 pyexpat / uv run 빌드 회피
  - REFRESH MV autocommit / views.sql 적용 순서 / GeoJSON sido 필터 / 해제여부 역전 / 행정동 vs 법정동
- `CLAUDE.md` — Claude Code 작업 규약 (`/init` 양식: 명령어·아키텍처·도메인 함정·TIL 강제 규칙)
- `web/.env.local` — DATABASE_URL (gitignore)
- `web/next-env.d.ts`, `web/tsconfig.json`, `web/package-lock.json` — Next.js 16 초기화

### 확인 (실데이터)
- ETL 1회 정상 실행: `trade_rows_seen=5476`, `rent_rows_seen=3977`
- `/api/health`: `etl_last_succeeded_at`, raw count, MV 신선도 정상 응답
- `/api/affordable?mode=trade&cash_min=40000&cash_max=80000&size=M`: `dongs:[]` ← 빈 결과
  - 원인: `mv_dong_stats(TRADE)` × `bjd_polygon` JOIN 0건 (행정동/법정동 코드 불일치)
  - JEONSE는 137건 매칭 (법정동읍면동코드 부재로 동 이름 fallback → 행정동 코드 → JOIN 성공)

### 진행 중 블로커
- bjd_polygon이 행정동(`adm_cd2 = 1138051000`) 기준이라 매매 ETL의 법정동(`1138010300`)과 매칭 불가
- 해결안: LSMD_CONT_LDREG_11 (서울 법정동경계 shapefile, EPSG:5179→4326) 다운로드 + 재적재 (ADR-008)

---

## [v0.0.1] - 2026-05-04 - Phase 0 — 데이터 검증 및 설계 확정

### 결정 (ADR)
- ADR-001: 서울 25구 코드 중복 제거 → `GANGBUK_14` / `GANGNAM_11` / `SEOUL_25` 분리
- ADR-002: `mv_dong_stats` UNION ALL 컬럼명 중립화 (`median_man / p25_man / p75_man`)
- ADR-003: 전세가율 80% 컷오프 출처 명시 (HUG 보증약관 2024년판)
- ADR-004: real-estate-mcp Phase 0 fallback 정책 (MCP 검증 우선, PDR CLI fallback)
- ADR-005: `tx_count_3m` 하드코딩 폐기 → `confidence=high/low/insufficient` 동적 산정
- ADR-006: `median_build_year` / `build_year_stddev` MV 추가, 신구축 혼재 tooltip
- ADR-007: real-estate-mcp Dev 엔드포인트 패치 (RTMSDataSvcAptTradeDev/RentDev)

### 추가
- `.mcp.json` — real-estate-mcp Claude Code 연결 설정
- `.venv-etl/` — Python 3.12 ETL 테스트용 venv (PublicDataReader 설치 완료)
- `real-estate-mcp/` — tae0y/real-estate-mcp 클론 (Dev 엔드포인트 패치 적용)

### 변경
- `SPEC.md` §9.1 — ETL GU 코드 목록 정오 및 `TARGET_GU = GANGBUK_14` 적용
- `SPEC.md` §5.2 — `mv_dong_stats`에 `confidence`, `median_build_year`, `build_year_stddev` 추가
- `SPEC.md` §6.1/6.2 — 필터 룰 `confidence != 'insufficient'` 기반으로 재정의
- `SPEC.md` §6.4 — 색상 매핑 low-confidence(투명 50%), 신구축 혼재 tooltip 추가
- `SPEC.md` §15 — ADR 섹션 신설 (ADR-001~007)

### 확인 (실데이터)
- 강북구(11305) 2026-04 매매 92건 조회 성공 (PublicDataReader + real-estate-mcp MCP)
- 4~8억 자금 범위: 56건/92건 (61%)
- 신구축 소형(꿈의숲해링턴플레이스 59㎡) 중위 8.7억 > 구축 대형(벽산라이브파크 114㎡) 7.2억 확인
- real-estate-mcp 403 원인: Dev vs 프로덕션 엔드포인트 키 분리. Dev 패치로 해결.

### 확인 (강북 14구 bulk pull — 동별 표본 희소 지도)
- 총 거래 집계: 3개월(2026-02~04) × 14구 매매 전수
- confidence 분포 (동×평형 417개 조합): high 183개(44%) / low 130개(31%) / insufficient 104개(25%)
- 구별 거래량: 노원 2,186건(28%) ← 압도적. 종로 156건·광진 210건·용산 211건 ← 희소
- M형 4~8억 high confidence 통과 동: 21개
  - 저가: 도봉 방학(5.2억)·쌍문(5.4억), 강북 수유(5.5억)
  - 고가 경계: 중랑 중화동(8.0억), 종로 창신동(7.9억)
- 분산 가드(IQR <1.5) 탈락 후보: 서대문 홍은동(1.61), 중랑 면목동(1.56) → §6.4 노랑 처리 확인
- 임장 우선순위 낮은 구(희소): 종로·용산·광진 — Phase 1 검증에서 회색 비중 높을 것

### 추가
- `CHANGELOG.md` — 변경 이력 관리 시작
- `tasks.md` — Phase별 TODO 관리
- `.gitignore` — .env, venv 제외
- GitHub private 레포: jetsongdev/eodigakka
