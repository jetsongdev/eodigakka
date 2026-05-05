# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`SPEC.md`가 single source of truth — 설계·ADR·필터 룰은 거기서 본다.

---

## 자주 쓰는 명령어

### DB (Docker)
```bash
docker compose up -d                                        # postgres+postgis 기동
docker exec -i eodigakka-postgres psql -U app -d eodigakka < db/schema.sql
docker exec -i eodigakka-postgres psql -U app -d eodigakka < db/views.sql
docker exec eodigakka-postgres psql -U app -d eodigakka -c "<쿼리>"
```

### ETL (Python 3.12 venv 직접 실행)
```bash
# 환경변수는 etl/.env (DATABASE_URL, RTMS_KEY) 에서 로드
ETL_DISABLED=0 \
DATABASE_URL=$(grep DATABASE_URL etl/.env | cut -d= -f2-) \
RTMS_KEY=$(grep RTMS_KEY etl/.env | cut -d= -f2-) \
.venv-etl/bin/python3 etl/fetch_rtms.py

# kill switch
ETL_DISABLED=1 .venv-etl/bin/python3 etl/fetch_rtms.py    # 즉시 0 종료

# 회귀 테스트
.venv-etl/bin/python3 -m unittest etl/tests/test_fetch_rtms.py
```

⚠️ `cd etl && uv run python …`는 패키지 빌드 시도하다 실패 — venv `bin/python3` 직접 호출만 사용 (TIL `etl-pyproject-build`).

### 폴리곤 적재 (1회성)

**현재(2026-05-05~) 운영**: V-World LSMD 법정동 SHP

```bash
# 처음 적재 또는 코드 체계 마이그레이션
.venv-etl/bin/python3 db/load_polygon.py "/path/to/LSMD_ADM_SECT_UMD_11_YYYYMM.shp" --sido 서울특별시 --truncate
```

다운로드 경로: V-World → 데이터 → 다운로드 → `국토관리/지역개발 > 경계 > 행정구역_읍면동(법정동)` (`vworld.kr/dtmk/dtmk_ntads_s002.do?dsId=30603`). 시도별 SHP zip 분리, 서울만 1.5MB.

⚠️ `LSMD_CONT_LDREG`(연속지적도, 200MB 필지 단위)와 헷갈리지 말 것 — TIL `2026-05-05-lsmd-shapefile-pitfalls`.

**과거 (Phase 0~1 초기)**: HangJeongDong 행정동 GeoJSON 사용 — ADR-008로 폐기. 코드 호환은 유지(`load_polygon.py`가 양쪽 포맷 자동 감지).

### Web (Next.js)
```bash
cd web
npm install
npm run dev                                                 # 기본 3000, 점유 시 자동으로 3002 등
npm run build
npm run lint
```

웹은 `web/.env.local`의 `DATABASE_URL` 필요 (postgres 연결).

### API smoke test
```bash
curl -s http://localhost:3002/api/health | python3 -m json.tool
curl -s "http://localhost:3002/api/affordable?mode=trade&cash_min=40000&cash_max=80000&size=M"
curl -s "http://localhost:3002/api/dong/<bjd_code>/complexes"
```

---

## 아키텍처

3-tier 단방향 파이프라인. 각 layer는 독립적으로 배포·재시작 가능.

```
RTMS API ─→ ETL (Python) ─→ Postgres+PostGIS ─→ Next.js API ─→ PWA + Mapbox
                  ▲                                    ▲
            cron 03:00                           Kysely (TS)
```

### 1. ETL (`etl/fetch_rtms.py`)

- **호출**: `PublicDataReader.TransactionPrice(api_key)` → RTMS Dev 엔드포인트 (운영 키 미승인, ADR-007)
- **스코프**: `GANGBUK_14` 강북 14구 × 최근 3개월 (`month_tokens`) × 매매·전월세
- **bjd_code 보정**: `apply_bjd_fallback` — `법정동시군구코드+법정동읍면동코드` 결합 → 실패 시 `(시군구, 동이름)` lookup으로 `bjd_polygon`에서 가져옴
- **취소 거래 필터**: `filter_cancelled` — `해제여부 == "O"`인 행만 제외 (TIL `rtms-haeje-filter`)
- **재실행 안전**: `INSERT … ON CONFLICT DO NOTHING` (raw 테이블의 unique key가 중복 제거)
- **kill switch**: 진입점에서 `ETL_DISABLED=1` 체크 후 `sys.exit(0)`
- **상태 추적**: `etl_job_status` 테이블에 `last_started_at / last_succeeded_at / mv_refreshed_at / last_error` 기록
- **MV 갱신**: 본 ETL 트랜잭션과 별개의 autocommit 커넥션에서 `REFRESH MATERIALIZED VIEW CONCURRENTLY` (TIL `mv-refresh-autocommit`)

### 2. DB (`db/`)

- **raw**: `tx_apt_trade`, `tx_apt_rent` — 거래 단위 적재
- **공간**: `bjd_polygon` (PostGIS GEOMETRY) — 동 폴리곤
- **집계 MV**: `mv_dong_stats` — `(bjd_code, size_bucket, mode)` 단위로 거래수·중위·IQR·신뢰도(`high/low/insufficient`)·중위 건축연도·표준편차 산출. TRADE/JEONSE를 `UNION ALL`로 한 테이블로 통합
- **전세가율 MV**: `mv_jeonse_ratio` — `mv_dong_stats` 자기조인으로 ratio 계산
- **size_bucket 정의**: `area_m2 < 60 → S`, `< 85 → M`, `else L`
- **confidence 정의**: 거래수 `≥10 → high`, `≥3 → low`, `else insufficient` (ADR-005)

### 3. Web API (`web/app/api/`)

Next.js 16 App Router. 모든 핸들러 `runtime = 'nodejs'` + `dynamic = 'force-dynamic'`.

- **`GET /api/affordable`** (`affordable/route.ts`) — 쿼리: `mode=trade|jeonse`, `cash_min`, `cash_max`, `size=S|M|L|all`. `mv_dong_stats` JOIN `bjd_polygon` JOIN `mv_jeonse_ratio` → `evaluateAffordableDong`로 색상·근거 부여 → 동 리스트 반환
- **`GET /api/dong/[bjd]/complexes`** — TOP5 단지 + 최근 10건 거래
- **`GET /api/health`** — ETL 상태·raw 테이블 카운트·MV 신선도·kill switch·last_error

### 4. 공통 룰 (`web/lib/filter.ts`)

ETL/SQL 외 모든 도메인 룰의 단일 출처:
- `parseAffordableQuery` — 쿼리스트링 검증
- `evaluateAffordableDong` — `isWithinCashRange` + `hasMinimumComplexDiversity (≥2)` + IQR 분산 가드(`p75/p25 ≥ 1.5` → 노랑) + JEONSE 전세가율 ≥0.8 → 빨강 + confidence별 색상 분기
- `buildEvidence` — `"최근 3개월 N건, 단지 N개, RTMS YYYY-MM~YYYY-MM"` 포맷 (단정문 금지 원칙)

### 5. Kysely 타입 (`web/lib/db.ts`)

DB 테이블·MV의 TS 타입 정의 + 글로벌 싱글톤 connection pool. 새 테이블·컬럼 추가 시 여기와 SQL 동시 갱신.

### 6. `real-estate-mcp/` (서브디렉토리)

`tae0y/real-estate-mcp` 클론에 Dev 엔드포인트 패치(`_helpers.py`)만 적용. fork 떠서 PR로 정리하는 게 ToDo (ADR-007).

---

## 도메인 함정

### 법정동 vs 행정동 코드

⚠️ **JOIN 실패 단골 원인**. 둘은 매핑 안 됨. 부동산 도메인 표준은 **법정동**.

| 종류 | 패턴 (은평구 녹번동 예시) | 출처 |
|---|---|---|
| 법정동 | `1138010300` (시군구5+법정5, `1xxxx` 패턴) | RTMS API, V-World LSMD UMD |
| 행정동 | `1138051000` (시군구5+행정5, `5xxxx` 패턴) | HangJeongDong GeoJSON `adm_cd2` (Phase 0 사용분, 폐기) |

**현재 운영(2026-05-05~)**: `bjd_polygon`은 V-World `LSMD_ADM_SECT_UMD_11`(서울 법정동 467개) 기준 (ADR-008 실행 완료). `mv_dong_stats × bjd_polygon` JOIN: TRADE 390/390, JEONSE 411/411 (100% 매칭).

함정 메모:
- LSMD UMD `EMD_CD`는 8자리(시도2+시군구3+읍면동3) → 10자리로 패딩할 때 끝에 `00`("리" 자리), `zfill` 금지 (TIL `2026-05-05-lsmd-shapefile-pitfalls`).
- V-World shapefile은 인코딩을 `.cst`(EUC-KR)에 둠 — `.cpg` 표준 아님. `load_polygon.py`가 자동 감지.

### 청사진 9원리 (위배 시 Stop)

1. 단정문 금지 — "TOP 5 추천" 같은 표현 절대 출력하지 않는다. 항상 "조건 통과 N개" + Evidence
2. Apply는 사람만 — 자동 임장 추천·자동 실거주 결정 금지
3. Kill switch — `ETL_DISABLED=1` 코드 패스 절대 우회하지 않는다
4. read-only — DB 쓰기는 ETL만. API는 select only

---

## 시행착오 기록 (TIL)

**버그·삽질·환경 설정 문제를 해결할 때마다 반드시 `docs/til/` 에 기록한다.** 매 세션마다 적용되는 강제 규칙.

### 언제 기록하나
- 30분 이상 헤맨 문제를 해결했을 때
- 에러 메시지가 직관적이지 않았을 때 (인자 순서, 코드 체계 불일치 등)
- 외부 API/라이브러리의 의외의 동작을 알게 됐을 때
- 같은 함정에 다시 빠질 가능성이 있는 모든 케이스

### 어떻게 기록하나

파일명: `docs/til/YYYY-MM-DD-짧은-키워드.md`

본문 4단락 고정 양식:
```markdown
# TIL: <한 줄 제목>

날짜: YYYY-MM-DD

## 현상
<무엇이 안 됐나 — 에러 메시지·재현 명령어 포함>

## 원인
<왜 그랬나 — 표·코드로 비교>

## 수정
<어떻게 고쳤나 — diff 또는 명령어>

## 교훈
<다음번에 어디서 다시 만날지, 일반화된 규칙>
```

작성 후:
1. `docs/til/README.md` 인덱스에 카테고리별로 한 줄 추가
2. `CHANGELOG.md` 해당 날짜 섹션에 "추가: TIL …" 한 줄
3. 코드 수정과 같은 커밋에 묶어 커밋

### 무엇을 안 적나
- 단순 오타·import 누락 같은 자명한 실수
- 1회성 데이터 정리 명령
- 이미 README/SPEC에 명시된 정보의 중복

---

## 문서 단계

| 문서 | 용도 |
|---|---|
| `SPEC.md` | 설계 SSOT — 무엇을 만드는가, ADR-001~007 |
| `tasks.md` | 실행 단위 TODO (`[ ] / [~] / [x] / [-]`) |
| `CHANGELOG.md` | 일자별 변경 이력 (추가/변경/수정/결정) |
| `docs/til/` | 시행착오 1차 기록 (현상→원인→수정→교훈, 4단락 양식) |
| `docs/blog/` | 블로그 포스팅 초안 — TIL을 외부 독자용 narrative로 재구성. 시리즈는 `YYYY-MM-DD-슬러그/` 폴더 + `00-index.md` + 순번 파일. frontmatter `status: draft \| review \| published`. **외부 공유 가치 있는 함정·삽질은 TIL 1차 기록 후 같은 날짜로 블로그 draft도 같이 남길 것** (작성 규약은 `docs/blog/README.md`) |
| `CLAUDE.md` | 작업 규약 (이 파일) |

작업 끝나고 변경이 있으면 위 5개 문서 중 해당하는 것만 갱신. 코드만 고치고 문서 안 고치면 안 된다.

---

## 커밋 규약

- 메시지: `<type>(<scope>): <한국어 한 줄 요약>` (예: `fix(etl): 해제여부 필터 역전 버그 수정`)
- 본문: 왜 고쳤는지 1~2단락
- 마지막 줄: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- `git add -A` / `git add .` 금지 — 파일 명시적으로 staging
- 절대 commit 하지 않는다: `HangJeongDong_*.geojson`, `real-estate-mcp/`, `.env`, `.venv-etl/`, `node_modules/`

---

## 배포 워크플로 (2026-05-05~)

**main 직접 push 금지** — Vercel이 main을 Production으로 자동 deploy하기 때문에 검증 없이 라이브로 간다. Preview에서 한 번 거치자.

### 표준 흐름

```
1. git checkout -b feat/<scope>           # 또는 fix/<scope>
2. 작업 + commit                            # 명시적 staging, 한국어 한 줄 요약
3. git push -u origin <branch>              # → Vercel 자동 Preview deploy
   → Telegram 🚀 Preview 토픽 알림 + URL 도착
4. Preview URL에서 동작 검증                # 브라우저 또는 curl
5. gh pr create                             # 자가 review
6. gh pr merge --squash --delete-branch     # → main 자동 Production deploy
   → Telegram 🎯 Production 토픽 알림
```

### 예외 (main 직접 push 허용)

- 문서만 변경 (`docs/`, `tasks.md`, `CHANGELOG.md`, `.md`만) — 빌드/UI 영향 없음
- `.github/workflows/` 자체 변경 — preview에서 검증 불가능 (deployment_status 트리거 못 함)
- 핫픽스 — 명시적으로 "긴급" 지시받은 경우만

### 검증 체크리스트 (Preview URL에서)

- `/api/health` 200 + `etl_disabled: false` + ETL last_succeeded_at 합리적
- `/api/polygons` features 467개
- `/api/affordable?mode=trade&...` dongs 비어있지 않음
- 페이지 로드 → LoadingOverlay → 지도 + 폴리곤 색칠
- 푸터 버전(`v0.1.0 #<sha>`) 새 commit 반영 확인

### Telegram 알림 검증

각 push 후 1분 내 Telegram 토픽 알림 도착해야 정상. 안 오면 `gh run list --workflow=telegram-deploy-notify.yml`로 워크플로 상태 확인.

---

## 도구 우선순위

### CLI > MCP (대체 가능한 경우)

같은 작업이 CLI와 MCP 양쪽으로 가능하면 **CLI 우선**. 이유:
- CLI는 재현 가능한 명령어 → 문서·스크립트·CI에 그대로 박을 수 있음
- MCP는 세션 의존적이고 디버깅이 더 어려움 (원격 도구 호출 → 직렬화 → 응답)
- 같은 Playwright API여도 `npx playwright test` 결과는 사용자가 본인 셸에서 그대로 재현 가능, MCP browser_evaluate은 그렇지 않음

| 작업 | 우선 | 사용 |
|---|---|---|
| e2e 회귀 테스트 | **CLI** (`npx playwright test`) | 코드 변경 시마다, CI |
| 스냅샷 시각 기록 | **MCP** (`mcp__plugin_playwright_playwright__*`) | 마일스톤마다, snapshot 스킬에서만 |
| DB 쿼리 | **CLI** (`docker exec ... psql`) | 디버깅, 데이터 검증 |
| 외부 데이터 fetch | **CLI** (`curl`/`wget`) | API 호출, 다운로드 |
| 자연어 부동산 탐색 | **MCP** (`real-estate-mcp`) | CLI 대안 없음 |

원칙: **MCP는 CLI 대안이 없을 때만**. 같은 작업이면 CLI로 통일.

### 반복 작업 → skill-creator

같은 워크플로우가 2회 이상 반복되면 즉시 `/skill-creator:skill-creator` 호출해서 스킬화 검토. 예시:
- TIL + CHANGELOG + tasks 일괄 갱신 → `til-flow` 스킬로 분리됨 (2026-05-04)
- 스냅샷 캡처 → `snapshot` 스킬 (글로벌)
- 향후 후보: 모바일 UX 회귀 검증, 동 폴리곤 적재 절차 등

판단: "이거 또 하네"라는 인지가 들면 그 자리에서 skill-creator로 스킬 드래프트 생성. 사용자가 매번 같은 지시 안 해도 자동 트리거.

---

## 외부 위임 규약

### Codex (`/codex:rescue`)
- 모든 프롬프트에 **"모든 응답은 한국어로 작성하라"** 포함
- ETL/DB처럼 sandbox 네트워크 차단되는 작업은 검증 명령을 사용자에게 돌려줄 것

### MCP
- `real-estate-mcp`는 Dev 엔드포인트 패치 적용된 fork 사용 (TIL `real-estate-mcp-403`)

---

## 사용자 톤·언어

- 모든 응답·문서는 한국어
- 사용자 호칭: Mr. Song
- "TOP 5 추천" 단정문 금지 — 정책상 후보 제시만
