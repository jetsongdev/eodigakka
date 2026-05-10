# CHANGELOG

형식: `## [vX.Y.Z] - YYYY-MM-DD - 제목` → `### 추가 / 변경 / 수정 / 결정`

**버전 bump 룰** (`.github/workflows/version-bump.yml`):
- 새 PR이 release 가치 있으면 CHANGELOG 최상단에 `## [Unreleased] - 제목` 섹션 추가 (날짜는 워크플로가 KST merge일로 자동 기입)
- PR이 main에 merge되면 워크플로가 PR title 접두어 보고 bump 종류 결정 → `feat:` minor / `fix:`·`chore:`·`docs:`·`ci:`·`refactor:`·`perf:`·`test:`·`style:`·`build:` patch / PR body에 `BREAKING CHANGE` 포함 major
- `[Unreleased]` 섹션이 **없으면 워크플로 skip** — bump 안 일어남. release 의사 없는 PR(코멘트 정리 등)은 [Unreleased] 생략하면 됨
- 같은 버전이 여러 섹션에 걸쳐 반복되면 한 release에 포함된 별도 milestone임을 의미 (retrofit 산물)

---

## [v0.10.0] - 2026-05-10 - 사이드패널 최근 거래 더보기 (인라인 점진 로드 + 월별 그룹 + 자체 스크롤)

동 상세 사이드패널의 매매·전세 최근 거래가 각각 10건 고정이었던 걸 +20건씩 누적 로드되도록 풀었다. 사용자가 거래 흐름을 더 깊이 보고 싶을 때 모달이나 페이지 이동 없이 같은 자리에서 펼친다. 누적 시 스크롤 감당이 길어지는 문제는 월별 그룹 헤더(sticky) + 매매·전세 각 섹션 자체 스크롤 컨테이너(max 320px)로 해결.

### 추가
- `web/app/api/dong/[bjd]/recent/route.ts` — 매매/전세 최근 거래 페이징 전용 엔드포인트. 쿼리: `mode=trade|jeonse` (필수), `offset` (0..200), `limit` (1..50). LIMIT+1 trick으로 `has_more` 추론, 별도 COUNT 쿼리 없음. `'use cache'` + `cacheLife({ revalidate: 3600 })` + `cacheTag('mv_dong_stats', 'recent-{bjd}-{mode}-{offset}-{limit}')` — ETL revalidate webhook이 `mv_dong_stats` 태그 invalidate 시 같이 무효화됨. 정렬은 `contract_date DESC, complex_name ASC, area_m2 ASC` (deterministic tie-break).
- `web/app/page.tsx` `RecentTxSections` — bjd 변경 시 누적·에러 reset, 매매·전세 각각 독립 더보기 버튼·로딩·에러 상태. 라벨은 `매매 최근 거래 N건+`(has_more 시 `+` 표기), 빈 거래는 기존대로 "최근 거래 없음".
- `web/app/page.tsx` `groupByMonth` 헬퍼 + 행 렌더링 — `<table>` → `<div>` grid 구조 재작성. 월별(YYYY-MM) 그룹 헤더가 매매·전세 각 섹션 자체 스크롤 박스(max-height 320px) 안에서 `position: sticky; top: 0`. 누적이 50건·100건이 돼도 사이드패널 다른 섹션(EvidenceCard·DistributionChart·TOP5)을 가리지 않고, 스크롤 중에도 현재 보고 있는 월이 항상 박스 상단에 노출.
- `web/tests/e2e/api.spec.ts` — `/recent` 페이징 smoke 테스트(첫 페이지 has_more, 다음 페이지 offset=10) + 입력 validation 테스트(잘못된 mode·bjd·limit·offset → 400) 추가.

### 결정
- **별도 엔드포인트 vs 기존 `/complexes` 확장**: 기존 endpoint는 top5·distribution·bjd_name 등을 묶어 한 번에 응답하는 dashboard 페이로드. 페이징 limit을 키우면 캐시가 limit별로 갈라져 dashboard 부분까지 같이 분기되는 낭비가 생긴다. 페이징 책임만 가진 endpoint를 분리해 cache key를 좁게 잡았다.
- **LIMIT+1 trick**: `COUNT(*)` 추가 쿼리 없이 다음 페이지 존재 여부만 정확히 확인. 총 건수 표기는 현재 UX에서 불필요(범위 가드 `MAX_OFFSET=200`로 충분히 커버).
- **MAX_OFFSET 200, MAX_LIMIT 50**: 강북 14구 한 동 3개월 거래수 기준 250건 이상 적재된 동이 거의 없음. 악의적 깊은 페이징·DoS 가드.
- **cache key에 limit/offset 포함**: `recent-{bjd}-{mode}-{offset}-{limit}` 태그는 invalidate 시 와일드카드 매칭이 아니라 정확 매칭이지만, `mv_dong_stats` 태그를 함께 부여해 ETL→/api/revalidate 훅이 한 번에 모두 쓸어내게 함.
- **자체 스크롤 컨테이너 vs 사이드패널 전체 스크롤**: 매매·전세 각 섹션에 `max-height: 320px; overflow-y: auto`로 자체 스크롤 분리. 사이드패널 전체 스크롤은 살아있어 다른 섹션(TOP5·distribution) 접근 가능. nested scroll의 모바일 어색함은 `RECENT_SCROLL_MAX_PX=320`이라 손가락 한 번 스와이프 안에 들어와 실측상 무리 없음. 대안(전체 사이드패널 스크롤만)은 누적 100건+에서 EvidenceCard가 시야 위로 사라져 "지금 보는 동이 어디였더라" 컨텍스트 분실.
- **`<table>` → `<div>` grid**: `position: sticky`가 table 행 단위에선 브라우저별 동작이 들쭉날쭉(spec gray area). 시각은 grid `1fr auto 36px`로 동일하게 맞추고 sticky 신뢰성 확보. column header(`단지·평형 / 금액 / 일자`)는 스크롤 박스 밖에 둬서 항상 노출.
- **끝 라벨 `· 여기까지 · 총 N건 ·`**: 더보기 한참 누르다 `has_more=false` 응답이 와서 버튼이 갑자기 사라지면 "끝났는지/버그인지" 모호. 더보기 자리에 작은 회색 라벨로 끝남을 명시. 첫 응답 9건 이하(초기 has_more=false)는 카운트만으로 자명하므로 `rows.length >= RECENT_INITIAL_COUNT(10)` 조건일 때만. 데이터 자체는 ETL이 적재한 직전 3개월(`etl/fetch_rtms.py:356` `count=3`) 윈도우에 한정.

### 검증
- `npx tsc --noEmit` 통과 (exit 0).
- `next build` 컴파일·TypeScript 단계 통과 (`Compiled successfully` + `Finished TypeScript`). 이후 page data collection은 워크트리에 `.env.local` 부재로 DATABASE_URL 누락 → 환경 종속 단계 미실행. **사용자 환경에서 dev server 가동 후 `/api/dong/<bjd>/recent?mode=trade&offset=0&limit=20` 200 응답·has_more 동작·사이드패널 더보기 버튼 클릭 누적 동작 확인 필요.**

## [v0.9.0] - 2026-05-10 - URL 쿼리 파라미터 양방향 동기화

PWA 상태(`mode`, `cash_min`, `cash_max`, `size`)를 URL search params에 반영. 새로고침·딥링크 공유·외부 진입 시 슬라이더·토글 상태 그대로 복원. Phase 1 임장 후보 목록을 URL로 주고받을 수 있게 됨.

### 추가
- `web/app/page.tsx` — `useRouter`/`usePathname`/`useSearchParams` 도입. 초기 상태는 URL → `parseAffordableQuery`로 복원, mode/size 토글은 즉시 `router.replace`, cash_min/cash_max는 300ms debounce 후 `replace`. cash-only 변화 판별용 `prevQueryRef` 추가.
- `MapPage` 본체를 `MapPageContent`로 분리하고 `<Suspense>` 래퍼 추가 — Next.js 16의 `useSearchParams` 빌드 경고 해소.

### 변경
- `web/lib/filter.ts` `parseAffordableQuery` — defaults 인자 추가(기존 호출자 영향 없음). 클라이언트 측 파싱 시 `DEFAULT_QUERY` 주입해 URL 미지정 필드만 기본값 폴백.

### 결정
- **`router.replace` only, push 안 함**: 슬라이더 드래그·토글마다 history 폭주 방지. 뒤로가기로 이전 슬라이더 위치 되돌리는 동선은 deep link 외에는 거의 없다고 판단.
- **300ms debounce는 cash 슬라이더에만**: mode/size 토글은 단발성이라 즉시 반영. cash는 드래그 중 매 frame fire 가능 → debounce 필수.
- **native `history.replaceState` 미선택**: Next.js App Router의 `useSearchParams`는 React state로 관리되므로 native API로 URL만 바꾸면 다음 렌더에서 hook 결과가 동기화 안 됨. `router.replace`는 무거운 라우팅 트리거 없이 search params만 갱신.

### 검증
브라우저에서 `?mode=jeonse&cash_min=10000&cash_max=30000&size=S`로 진입 → 전세 활성·슬라이더 [10000,30000]·S 활성 확인. 매매/M 토글 + 슬라이더 ArrowRight 8회 후 `history.length` 2로 고정 확인. `npm run build` TS 1248ms 통과.

## [v0.8.4] - 2026-05-10 - perf(web): Cache Components 도입 + ETL→/api/revalidate webhook (Stage 2b)

Stage 2a(v0.8.3)로 freshness 쿼리는 fresh=220ms로 직격됐지만 Production cold에선 stats(`mv_dong_stats` JOIN) 쿼리가 새 dominant이 됨(cold 446ms~1711ms). Stage 2b는 응답 자체를 edge cache에 박는 마지막 한 방.

### 변경
- `web/next.config.js` — `cacheComponents: true` 활성화 (Next.js 16 PPR + 'use cache' directive). polygons의 기존 `dynamic = 'force-static'`은 cacheComponents와 호환 안 돼서 모든 API route의 route segment config(`runtime`, `dynamic`) 제거 + cache directive로 마이그레이션 (next-cache-components 가이드 표 따름)
- `web/app/api/affordable/route.ts` — SQL 부분을 `fetchAffordableData(mode, size)` 함수에 분리 + `'use cache'` + `cacheLife({ revalidate: 3600 })` + `cacheTag('mv_dong_stats')`. cache key는 mode×size 8조합(cash는 클라 사이드 필터). 첫 호출만 DB, 이후 모든 호출 ~1ms edge 응답 기대
- `web/app/api/dong/[bjd]/complexes/route.ts` — 6 sub-query를 `fetchComplexesData(bjd)`에 분리 + `'use cache'` + `cacheLife({ revalidate: 3600 })` + `cacheTag('mv_dong_stats', 'complexes-{bjd}')`. bjd 인자가 자동 cache key. Stage 1 측정의 connection pool 콜드 1.5s 비용 → 첫 호출 외엔 0
- `web/app/api/polygons/route.ts` — `dynamic = 'force-static'` → `'use cache'` + `cacheLife('max')` + `cacheTag('bjd_polygon')` 마이그레이션. 동작 동일(0번째 사용자도 즉시), invalidation 가능해짐. ETL은 폴리곤 안 건드리니 invalidate trigger 없음
- `web/app/api/health/route.ts` — `runtime`/`dynamic` 제거. cacheComponents 모드의 default dynamic 동작 유지

### 추가
- `web/app/api/revalidate/route.ts` 신설 — POST endpoint. `Authorization: Bearer $REVALIDATE_SECRET` 검증 후 `revalidateTag(tag, 'default')` 호출. secret 미설정·불일치 모두 401(외부 정보 누설 방지). console.error로 운영 단서 남김
- `.github/workflows/etl.yml` — success ping 다음 step에 `curl -X POST $REVALIDATE_URL?tag=mv_dong_stats -H "Authorization: Bearer $REVALIDATE_SECRET"` 추가. graceful skip(secret 없으면 skip). ETL 03:00 갱신 직후 cache invalidate → 다음 사용자 응답에 새 데이터 박힘
- `web/tests/e2e/api.spec.ts` — `/api/revalidate` 401 가드 2개(auth 누락 / 잘못된 token). dev/preview/production 일관 401 응답 회귀 가드

### 결정
- **`cacheLife({ revalidate: 3600 })`** — ETL이 KST 03:00에만 데이터 갱신. 1h TTL은 ETL→cache invalidate webhook이 못 돌아도 최대 1h만 stale. webhook 정상 작동하면 03:00에 즉시 invalidate → stale window 0
- **`revalidateTag(tag, 'default')` 두 번째 인자** — Next.js 16 cacheComponents 모드에서 profile 인자 필수. `'default'`로 호출해 일반 cacheLife 항목 매칭. polygons는 `'max'` profile이라 별개 — ETL이 폴리곤 안 건드려서 invalidate trigger 없으니 영향 없음
- **secret 미설정도 401 반환** — production에서 env 누락은 운영 에러지만 응답 본문에 노출하면 attacker에 단서. console.error로 server log에만 남기고 응답은 401 일관. e2e도 환경 무관 통과

### 검증
- `npm run build` 그린, "Cache Components enabled" 로그 + 8 routes 정상 빌드
- `npx playwright test tests/e2e/api.spec.ts` 8/8 그린 (기존 6 + 새 revalidate 가드 2)
- 로컬 dev 서버 `/api/affordable` cache hit 동작 확인:
  - 1번째 호출: `_timing: { stats_ms: 54.3, fresh_ms: 53.2, db_ms: 54.3 }` (cache MISS, DB hit)
  - 2번째 호출(같은 mode×size): **정확히 같은 _timing** (cache HIT, DB hit 없음)
  - mode 변경 호출(jeonse): 새 cache entry → 새 DB hit `stats_ms: 20.4`
- `/api/revalidate` auth 검증: 헤더 없을 때·잘못된 token 모두 401 (server log에 env 누락 단서)

## [v0.8.3] - 2026-05-10 - perf(web): /api/affordable freshness 쿼리 우회 — etl_job_status 컬럼화 (Stage 2a)

Stage 1(v0.8.2) Production 측정에서 `/api/polygons` cold 10.53s → 29ms는 직격됐지만 `/api/affordable` cold 3.46s 중 fresh=1572ms 부분은 그대로. Stage 2a는 D 옵션(b) 적용 — `MAX(contract_date) FROM tx_apt_trade/rent` raw 풀스캔을 `etl_job_status` 1행 SELECT로 우회. ETL이 03:00 갱신 끝나고 max_contract_date를 status 테이블에 기록하면 API는 그 값만 읽음.

### 변경
- `etl/fetch_rtms.py` `update_etl_status` — `last_contract_date_trade: date | None` / `last_contract_date_rent: date | None` keyword-only 파라미터 추가. `set_clauses` + `params_list` 재구성으로 None 아닐 때만 SET. 기존 호출처(started/succeeded/refreshed/error)는 시그니처 호환 유지
- `etl/fetch_rtms.py` `main()` success path — `refresh_materialized_views` 호출 직전에 `SELECT MAX(contract_date) FROM tx_apt_trade/rent` 두 쿼리 실행해 `update_etl_status`에 전달. ETL 한 트랜잭션 안에서 raw INSERT 끝난 직후 측정이라 일관성 보장
- `etl/fetch_rtms.py` `ensure_etl_status_table` — `ALTER TABLE etl_job_status ADD COLUMN IF NOT EXISTS last_contract_date_trade DATE, ADD COLUMN IF NOT EXISTS last_contract_date_rent DATE` idempotent 마이그레이션. 기존 운영 DB(Neon)는 다음 cron firing(2026-05-11 03:00 KST)에 자동 적용
- `db/schema.sql` — 이전엔 ETL 동적 생성에만 의존하던 `etl_job_status` 테이블 정의를 schema에 명시. 신규 환경 부트스트랩은 `db/schema.sql`로 처음부터 박힘
- `web/lib/db.ts` `EtlJobStatusTable` — 두 컬럼 타입 추가 (`string | null`, DATE는 Kysely에서 ISO 8601 문자열로 매핑)
- `web/app/api/affordable/route.ts` freshness 쿼리 — `MAX(contract_date) FROM tx_apt_trade/rent` Seq Scan 풀스캔 → `SELECT last_contract_date_{trade|rent} FROM etl_job_status WHERE job_name = 'rtms_phase1'` 1행 PK lookup으로 교체. Promise.all 병렬 구조 그대로
- `etl/tests/test_fetch_rtms.py` `UpdateEtlStatusTest` — `last_contract_date_*` 인자 전달 시 SQL에 `last_contract_date_trade = %s` 박히고 params에 `date(...)` 들어가는지 가드 + 인자 None일 때 SQL에 안 박히는지 가드

### 결정
- **옵션 (b) 채택** — advisor 검토 결과 (a) 단일 `contract_date` 인덱스 vs (b) `etl_job_status` 컬럼화 둘 중 후자. raw 테이블 인덱스 추가 없이 1행 SELECT라 더 깔끔. EXPLAIN ANALYZE에서 raw `MAX(contract_date)`가 Seq Scan 확정(local Docker 5456 rows · 3ms)이지만 Neon 콜드+RTT 비용은 큰데, 1행 PK lookup은 콜드에서도 ~50ms 안 넘김
- **Schema 선언적 SoT 회복** — 기존엔 ETL 동적 생성에만 의존 → 신규 환경 부트스트랩 시 schema.sql만으론 etl_job_status 못 만들었음. 이번 commit으로 SoT 명시. 운영 DB는 ETL의 ALTER가 자동 마이그레이션
- **Stage 2b는 별도 PR** — cache layer(affordable `'use cache'` + cacheTag, complexes per-bjd cache, ETL→/api/revalidate webhook, complexes 측정 방법론 fix)는 영역이 다르고 Vercel env(REVALIDATE_SECRET) 사전 등록 필요해 분리

### 검증
- `python -m unittest etl.tests.test_fetch_rtms` 3/3 그린(기존 1 + 새 2)
- `npm run build` 그린, TS 타입 변경 통과
- 로컬 docker DB ALTER + UPDATE 적용 후 dev 서버 응답: 27 dongs 정상, `data_freshness: "RTMS 2026-05-03 신고분까지"` 정상
- Server-Timing fresh: cold 53.1ms / **warm 1.7ms** (기존 Production warm fresh=1572ms 대비 1000배 ↓)
- e2e `tests/e2e/api.spec.ts` 6/6 그린 — `/api/affordable` `data_freshness` 포맷 회귀 가드 통과

## [v0.8.2] - 2026-05-10 - perf(web): /api/polygons 정적화 + complexes Server-Timing 측정 도구 (Stage 1)

Production cold latency 진단 후 H+I+J 묶음 PR을 두 단계로 분할. 이번이 **Stage 1**: 측정 도구 + polygons 정적화. cache layer는 Stage 2.

### 변경
- `web/app/api/polygons/route.ts` — `dynamic = 'force-dynamic'` → `force-static`. Vercel build 시점에 467개 폴리곤 GeoJSON을 prerender해 build artifact에 박음. CDN edge에서 0번째 사용자도 즉시 응답 → Production cold **10.53s → ms** 직격. ETL이 폴리곤 안 건드리고 V-World LSMD 갱신 시(분기 단위)에만 재배포 필요해 정적화가 자연스러움
- `web/app/api/polygons/route.ts` — SQL을 `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.00005), 5)`로 변경. precision 6 → 5(≈1.1m, zoom 11 시각엔 차이 안 보임) + Douglas-Peucker tolerance 5m simplify. dev 서버 응답 1142kB → ~612kB 측정(약 46% 감소). brotli 압축 후 wire 비용도 그만큼 줄어듦

### 추가
- `web/app/api/polygons/route.ts` Server-Timing — `db;dur / serialize;dur / parse;dur` 3 metric + 응답 body `_timing: { db_ms, serialize_ms, parse_ms }`. force-static이라 평소엔 build 시점 값이 박혀 캐시 만료 후 재생성 시점에만 새 값. dev 서버 측정: `db=226.2, serialize=2.6, parse=2.6` — 467개 `JSON.parse`는 dominant 아님 확정
- `web/app/api/dong/[bjd]/complexes/route.ts` Server-Timing — 6개 sub-query(`dong_name`, `trade_top`, `jeonse_top`, `recent_trade`, `recent_jeonse`, `distribution`) 각각 분리 측정 + body `_timing` 객체. dev 첫 호출 cold에서 `jeonse_top=60.7, recent_trade=58.9` dominant 관찰. Production warm 2.13s의 진짜 dominant은 deploy 후 측정으로 확정 → Stage 2 인덱스/캐시 우선순위 결정
- `web/tests/e2e/api.spec.ts` — polygons body `_timing` 3 키 + Server-Timing 매치 회귀 가드, complexes body `_timing` 6 키 + Server-Timing 6개 metric 매치 회귀 가드

### 결정
- **Stage 1/Stage 2 분할** — advisor 검토 후. Stage 1은 저위험·고가치(측정 도구 + 정적 캐시)라 단독 ship해 baseline 확보. Stage 2는 affordable/complexes cache layer + freshness 쿼리 우회 — invalidate 실수 시 stale UX 위험 있어 Stage 1 prod 측정 후 진행. tasks.md "H+I+J 묶음 PR" 표현은 분할 의도로 갱신
- **DB 인덱스 추가 보류** — `tx_apt_trade(bjd_code, contract_date)` / `tx_apt_rent(bjd_code, contract_date)` 복합 인덱스는 schema.sql에 이미 박혀있음. EXPLAIN ANALYZE로 freshness 쿼리(`MAX(contract_date)`) **Seq Scan** 확정(local Docker 5456 rows · 3ms): 복합 인덱스의 leading column이 `bjd_code`라 활용 안 됨. Stage 2에서 (a) 단일 `contract_date` 인덱스 vs (b) `etl_job_status.last_contract_date` 컬럼화 결정
- **MV 변경 없음** — Stage 1은 측정 + polygons 정적화만. mv_dong_stats / mv_jeonse_ratio 그대로

## [v0.8.1] - 2026-05-09 - /api/affordable 두 쿼리 Promise.all 병렬화 + Server-Timing 헤더

### 변경
- `web/app/api/affordable/route.ts` — `mv_dong_stats` JOIN 메인 쿼리와 `MAX(contract_date)` freshness 쿼리를 sequential `await` 두 번에서 `Promise.all` 병렬 실행으로 전환. 두 쿼리는 서로 독립이라 응답 시간이 max로 떨어지고 RTT 1번 절감. Neon 콜드 스타트 영향이 큰 첫 호출에서 가장 의미 있는 win 기대(tasks.md H 섹션 우선순위 1순위). 응답 형식·필드 동일

### 추가
- `Server-Timing` 응답 헤더 4개 metric 노출 — `stats;dur=<ms>` (메인 쿼리), `fresh;dur=<ms>` (freshness 쿼리), `db;dur=<ms>` (Promise.all wall-clock), `eval;dur=<ms>` (map/filter 처리). DevTools Network → Timing 탭에서 자동 시각화. 로컬 dev에서 `stats=65.7, fresh=49.2, db=65.8(=max), eval=0.1` 확인 — 병렬화 작동 입증(sequential이었으면 db≈115). 앞으로 latency 회귀 베이스라인 + Production 콜드 스타트 진단(가설 A) 도구로 영구 사용
- 응답 body에 `_timing: { stats_ms, fresh_ms, db_ms, eval_ms }` 객체 추가 — Vercel runtime이 커스텀 응답 헤더를 strip하는 환경(Cache-Control도 자동 덮어쓰는 게 신호)에서 헤더가 클라까지 도달 안 됨. body fallback으로 측정 도구 가치 보장. DevTools Network → Preview/Response 탭에서 즉시 노출. Production 첫 호출 측정값(2026-05-09): `stats=1788.8, fresh=1572.4, db=1788.8(=max), eval=1.3` — Neon 콜드 dominant 확정
- `tests/e2e/api.spec.ts` — `Server-Timing` 헤더 존재 회귀 가드 1줄 (`/stats;dur=\d.*db;dur=\d/`)

## [v0.8.0] - 2026-05-09 - SidePanel 최근 거래 — 탭 → 매·전 동시 섹션

탭 토글로 한 번에 한 종류만 보던 "최근 거래" 영역을 매매·전세 두 섹션으로 분리해 동시 노출. 모드 전환 클릭 없이 두 흐름을 한 화면에서 비교 가능. 헤더 mode는 `/api/affordable`·TOP5·분포 차트 primary에서 계속 단일 source of truth.

### 변경
- `web/app/page.tsx` — `RecentTxTabs` → `RecentTxSections` rename, `mode`/`onModeChange` props 제거. 탭 UI · `RecentTabButton` · `TAB_ACCENT` 폐기. 매매·전세 섹션 헤더에 accent 색상 인디케이터(매매 #2d8a4f / 전세 #5577c8) + 건수 라벨. 각 섹션 내부 표 컬럼은 기존과 동일(단지·평형 / 금액 / 일자)
- `web/tests/e2e/map.spec.ts` — 탭 기반 검증(`role=tablist`, `aria-selected`)을 섹션 헤더 기반(`role=heading`, `매매 최근 10건` / `전세 최근 10건`)으로 교체. 헤더 mode 토글 후에도 두 섹션 모두 유지되는 회귀 가드 추가

## [v0.7.2] - 2026-05-09 - chore(ops): ETL 데이터 신선도 알림 워크플로 추가

`.github/workflows/etl-stale-alert.yml` 신규. KST 05:00 (`0 20 * * *` UTC, ETL firing 03:00 + 2h GHA scheduler 지연 쿠션) 발사. `psql`로 `etl_job_status.last_succeeded_at`이 `NOW() - INTERVAL '25 hours'`보다 오래되거나 NULL이면 stale 판정 → label `etl-stale` 단일 open 이슈로 fan-out (dedup으로 outage N일 동안 같은 이슈에 모이고, close 시 다음 stale에 자동 재생성). `workflow_dispatch` `force_alert: bool` input으로 dedup·이슈 본문 포맷을 stale 발생 전에 수동 검증. label은 워크플로 첫 step에서 `gh label create --force`로 idempotent하게 보장. Healthchecks.io ping이 못 잡는 silent success(ETL exit 0이지만 `update_etl_status` 미도달) 보강 — 데이터 freshness 자체를 DB 측에서 본다.

### 추가
- `.github/workflows/etl-stale-alert.yml` — schedule + workflow_dispatch + permissions(`issues: write`, `contents: read`) + concurrency group + 25h interval stale 판정 + label dedup

### 결정
- cron 시점: KST 04:00이 아닌 **KST 05:00** — GHA scheduler 지연 windows(15~60분)와 ETL 자체 지연 둘 다 흡수. 정확성은 firing 시점이 아닌 `25 hours` interval 기준으로 보장
- stale 판정 기준: 절대 시각("오늘 KST 03:00 이전") 아닌 **상대 interval `25 hours`** — clock math 회피 + NULL 안전(`COALESCE(..., '1970-01-01')`)
- 알림 채널: Telegram 아닌 GH issue 단독 — outage가 끝나고도 trail이 남고 close로 자연 ack됨. Telegram fan-out은 필요 시 후속

## [v0.7.1] - 2026-05-09 - mapbox-gl을 next/dynamic으로 분리해 초기 JS 청크 1.7MB 제거

### 성능
- mapbox-gl (1.7MB raw) 을 next/dynamic + ssr:false 로 분리, 초기 JS 청크에서 제거
- 베이스라인: 가장 큰 client chunk 1,744KB raw / 475KB gz (97%가 mapbox-gl)
- 모바일 LCP 5.5s → 개선 예상 (Lighthouse 재측정은 배포 후)

## [v0.7.0] - 2026-05-07 - 선택된 폴리곤 시각 강조 + zoom-to-fit

### 변경
- /simplify 라운드 2 — 2-B feature-state 갱신 차분 적용(slider drag 시 467× wipe + N× 재투입 → |added|+|removed|개 호출) + selected 자연 보존(복원 로직 제거). NavigationControl reposition도 `mapLoaded` gate로 통일해 `map.once('load')` 누적 가능성 차단. e2e 회귀 가드 1줄 추가
- Mapbox NavigationControl zoom 버튼 30×30 → 44×44 + 아이콘 26×26 — 모바일 터치 타겟 권장 사이즈, 모든 viewport 공통 (globals.css override)
- 시트 열린 상태에서 mode/size 변경 시 selected 강조 풀리는 회귀 fix — `removeFeatureState` 직후 `prevSelectedBjdRef`로 selected 즉시 복원
- iPad Mini portrait + PC fitBounds padding 보정
- 선택된 폴리곤 외곽선 강조(line-width: 3, #0066ff) 및 fill-opacity 상향(0.85)으로 selected affordance 추가
- 폴리곤 클릭 시 시트가 안 가린 빈 공간으로 `fitBounds` zoom-in (모바일은 상단 22% / 데스크톱은 좌측 ~67%), 시트 닫을 때 원래 카메라로 `flyTo` 복귀. `polygonsGeoJsonRef`로 GeoJSON 캐시 + `originalCameraRef`로 첫 선택 시점 카메라 저장(연속 선택은 보존). `computePolygonBbox` Polygon/MultiPolygon 지원 inline 헬퍼

## [v0.7.0] - 2026-05-07 - SidePanel 정보구조 — 매·전 탭 + 시각 위계 + 시트 투명도

동 상세 패널을 사용자 의사결정 흐름에 맞춰 재배치. (1) Evidence 카드의 핵심 숫자(중위 가격)를 26pt 큰 숫자로 끌어올리고 신뢰도·연식·신구축 혼재를 색 의미가 있는 칩으로 분리해 한눈 파악성 강화. (2) "최근 거래 10건" 단일 표(매·전 섞여 모드 라벨 컬럼 필요)를 매매·전세 **탭 UI**로 분리, 각 탭당 LIMIT 10으로 확장(총 최대 20건). 탭 default는 헤더 mode와 동기화. API 응답 스키마 `recent_transactions[]` → `recent_trades[]` + `recent_jeonse[]`로 변경. 외부 consumer 없음, polyfill 생략. (3) 사이드패널 배경 0.97→0.86(데스크톱)/0.98→0.88(모바일)로 살짝 투명 + `backdropFilter: blur(6px)`로 뒤 지도가 살짝 비치되 가독성은 blur로 보존.

### 추가
- `EvidenceCard` 컴포넌트 — 동 중위 가격 큰 숫자 + 라벨 + 칩 묶음 + evidence 텍스트
- `Chip` 컴포넌트 (5 tone: high/low/insufficient/neutral/warn) — confidence별 의미 색상 일관성
- `RecentTxTabs` + `RecentTabButton` 컴포넌트 — `role=tablist`/`role=tab` a11y. 활성 탭 underline은 매매=녹색(#2d8a4f) / 전세=파랑(#5577c8). 헤더 mode 토글 시 `useEffect([defaultTab])`로 활성 탭 자동 동기화
- `tests/e2e/api.spec.ts` — `/api/dong/:bjd/complexes` 매·전 분리 응답 스키마 검증

### 변경
- `web/app/api/dong/[bjd]/complexes/route.ts` — 단일 UNION ALL ORDER BY LIMIT 10 query를 매·전 각각 LIMIT 10 두 query로 분리(Promise.all 병렬). `mode` 컬럼 응답에서 제거
- `web/app/page.tsx` `DongDetailsResponse` interface — `recent_transactions` 제거, `recent_trades` + `recent_jeonse` 추가. `RecentTransaction`에서 `mode`·`monthly_man` 필드 제거
- SidePanel evidence 박스 — 인라인 텍스트("중위 N억 · confidence · N년식 · ⚠️신구축 혼재")에서 시각 위계 카드로 교체
- SidePanel `asideStyle` background — 0.97/0.98 단색 → 0.86/0.88 + `backdropFilter: blur(6px)`. 탭 콘텐츠 영역은 `rgba(255,255,255,0.55)` 한층 더 투명한 시트
- SidePanel 최근 거래 탭 — 내부 state/remount reset 제거, 헤더 `mode`를 단일 source of truth로 사용
- Mapbox `NavigationControl` 위치 — 터치 디바이스(모바일·iPad Mini 등 `hover: none`) 좌하단 / 마우스(데스크톱) 우상단 분기. `isHoverCapable` 의존 별도 useEffect에서 `removeControl` + `addControl` reposition. iPad Mini 양쪽 orientation + 모든 터치 디바이스 커버

## [v0.6.0] - 2026-05-06 - 모바일 SidePanel bottom sheet

좁은 화면(`max-width: 640px`)에서 동 상세 패널을 우측 사이드 패널 대신 하단 시트로 슬라이드업. 기존 `position: absolute; right: 60; width: 360`은 375px 폰에서 화면을 거의 가로로 다 차지해 가독성·터치 타겟이 좁았다. 백드롭 탭으로 닫기 + 기존 × 버튼 + 상단 드래그 핸들 시각 affordance만 추가, 스와이프 제스처는 의존성 회피 차원에서 제외. 데스크톱 레이아웃은 그대로.

### 추가
- `useIsNarrow` 훅 — `matchMedia('(max-width: 640px)')` 구독, `useIsHoverCapable`과 동일 패턴
- 모바일 백드롭 — 탭 시 닫기, `rgba(0,0,0,0.3)` overlay. **`<button type="button" aria-label="동 상세 닫기">`로 렌더해 스크린리더·키보드 접근성 확보** (PR #10 Round 1 Copilot 피드백 반영, `aria-hidden`+`<div onClick>` 패턴은 a11y 트리에서 동작이 사라지는 문제)
- 드래그 핸들 시각 bar (실제 제스처 미연결, 시트 affordance 힌트)
- `docs/til/2026-05-05-aria-hidden-overlay-trap.md` — overlay backdrop a11y 함정(현상·원인·수정·교훈) 4단락 기록

### 변경
- `web/app/page.tsx` `SidePanel` — `isNarrow` 분기로 레이아웃 스위칭, 닫기 버튼 터치 타겟 확대(padding 4/8, fontSize 22)
- `<aside>` role을 `complementary`로 통일 — Round 1에 모바일만 `role="dialog" + aria-modal="true"`를 줬으나(Copilot 피드백 1차), focus trap 미구현 상태에서 modal 시맨틱만 선언하면 키보드 포커스 외부 이동이 가능해 거짓 신호 (Round 2 Copilot 피드백). 격하 + 데스크톱과 통일. 시트 본질이 인터랙션 모달이 아닌 정보 패널이라는 판단 — focus trap을 의미 있게 만들 인터랙티브 요소(입력 필드·확인 버튼) 없음.

---

## [v0.5.6] - 2026-05-05 - pre-merge bump 통합 + Telegram 알림 1회·CHANGELOG 라벨 동적

기존 흐름은 PR merge 후 별도 bump commit이 main에 추가 push되어 Vercel rebuild가 두 번 발생하고 Telegram 🎯 Production 알림도 2회 도착. 이번 변경으로 **bump이 PR head에 prebump 시점에 force-push로 미리 통합**되어 main에 squash 1 commit으로 들어가게 됨 → Vercel rebuild 1회·알림 1회·푸터 버전 즉시 갱신·CHANGELOG 본문 정확 모두 만족.

### 변경
- `.github/workflows/version-bump.yml` — 트리거 `pull_request: closed` → `[opened, synchronize, reopened, edited, closed]`. `prebump` job(PR head에 chore(release): commit force-push, 멱등성을 위해 기존 chore(release): 발견 시 reset HEAD~1 후 재계산) + `finalize` job(merge 후 main의 머지 commit에 tag만 push)으로 분리.
- `.github/workflows/telegram-deploy-notify.yml` — CHANGELOG 추출을 `[Unreleased]` 고정 → 첫 `## [...]` 섹션 일반화. 헤더 라벨(`[v0.5.6]` / `[Unreleased]`)도 동적 추출해서 메시지 본문에 표시.
- `CLAUDE.md` 「배포 워크플로」 — prebump 시점·1회 알림·finalize tag 분리 흐름 반영.

### 결정
- **prebump force-push 패턴**: `--force-with-lease`로 사용자 commit 손실 방지. GITHUB_TOKEN으로 push (PAT 사용 시 워크플로 자기 트리거 가능 → 무한 loop 회피). PR title 변경(edited 트리거) 시에도 reset + 재계산으로 멱등성 보장.
- **finalize job 분리**: tag만 push이라 Vercel deployment_status 트리거 안 됨 → 추가 알림 발생 안 함. main의 push event는 squash merge로 이미 발생한 1회만.
- **bump version은 main 기반으로 계산** (Codex P1): PR head의 package.json이 아니라 origin/main의 현재 version에서 bump → 두 release PR 동시 진행 시 같은 next version precompute 회귀 방지. 이번 PR 자체가 정확히 그 케이스를 만남 — PR #9가 진행 중에 머지돼 v0.5.5를 박았고, 우리도 v0.5.5로 precompute한 상태였다. main 머지 후 v0.5.6으로 bump up + 양쪽 [v0.5.5]/[v0.5.6] CHANGELOG 섹션 보존으로 해결. Codex P1 fix가 다음 PR부터 같은 함정을 자동 방지.
- **finalize는 merge_commit_sha checkout + fetch-tags** (Codex P1·P2): main HEAD가 아닌 PR의 머지 commit에 explicit SHA로 tag → 다른 PR이 그 사이 머지되어도 우리 PR의 commit에 정확히 tag 붙음. fetch-tags로 원격 tag 인식해 rerun 시에도 깔끔히 skip.

### 추가 (이번 PR self-test 검증)
- 처음에 GitHub Actions의 `pull_request` 트리거가 base branch(main) `.yml`만 본다고 가정해 self-test 불가로 판단, bump을 PR 본문에 직접 포함시킴(`web/package.json` v0.5.4 → v0.5.5, 그 후 PR #9 동시 머지 충돌로 v0.5.6으로 bump up).
- 실제 push 결과: **`prebump` 워크플로가 PR head의 `.yml` 정의로 자동 발사**됨 — GitHub Actions가 PR head의 워크플로 변경도 트리거에 반영하는 동작. 이번 PR이 곧바로 새 흐름의 첫 검증 케이스가 됐다.
- prebump은 이미 치환된 CHANGELOG에서 `[Unreleased]` 못 찾고 자동 skip — **멱등성 gate가 의도대로 동작** 확인.
- PR #9 동시 머지로 Codex P1 시나리오(두 release PR 동시 진행 시 같은 next version 충돌)를 실시간 재현. main 머지 후 [v0.5.6]으로 bump up하고 CHANGELOG 양쪽 섹션 보존으로 해결. 다음 PR부터는 prebump 워크플로의 main 기반 계산 fix가 자동 방지.

---

## [v0.5.5] - 2026-05-05 - Healthchecks.io ping + run_etl.sh 폐기

GHA cron이 미발사·실패하는 경우 자가 인지가 늦어 데이터 1~2일 비는 사고 위험을 막기 위해 `etl.yml`에 healthchecks.io 3-step ping(start / success / fail) 추가. `HEALTHCHECKS_PING_URL` secret graceful skip 패턴 — 값이 없으면 ping 안 보내고 워크플로 계속 진행, 등록 후 다음 firing부터 즉시 효력. 새벽 03:00 KST에 안 돌면 healthchecks.io에서 이메일/Telegram 알림.

부수 정리로 `etl/run_etl.sh` 삭제 — launchd 폐기 + GHA가 inline 명령으로 대체한 뒤로 live consumer 없음. CHANGELOG·blog·TIL의 historical 언급은 의도적으로 유지.

### 결정
- ADR-010: 외부 watchdog로 healthchecks.io 무료 tier 도입. GHA 자체 모니터링은 scheduler 미발사 케이스를 못 잡아 sufficient하지 않다는 판단. 향후 `/api/health` HTTP check 등 같은 패턴으로 확장 가능.

### 추가
- `.github/workflows/etl.yml` — healthchecks.io start/success/fail ping 3-step. env hoist로 secret 안전 주입(GHA shell injection 방지 패턴 재사용).
- `SPEC.md` ADR-010 — 결정 근거·trade-off·영향 기록.

### 변경
- `tasks.md` — Healthchecks.io ping + run_etl.sh 폐기 항목 [x] 처리, 우선순위 추천 갱신.

### 제거
- `etl/run_etl.sh` — launchd/cron용 wrapper. live consumer 없음.

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
