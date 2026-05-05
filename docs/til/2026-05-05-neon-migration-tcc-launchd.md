# TIL: launchd TCC 차단 → Neon 마이그레이션 도중 함정 6중

날짜: 2026-05-05 (마이그레이션 + GHA 동작 + search_path 영구 fix까지 완료)

## 현상

ETL을 매일 03:00 KST 자동 실행하려고 launchd plist 등록(`~/Library/LaunchAgents/com.chsong.eodigakka-etl.plist`)했는데, `launchctl start`마다 `Operation not permitted` 에러.

```
shell-init: error retrieving current directory: getcwd: cannot access parent directories: Operation not permitted
/bin/bash: /Users/chsong/Documents/sidespace/projects/eodigakka/etl/run_etl.sh: Operation not permitted
```

**우회 시도** — Postgres를 Neon Cloud(Singapore)로 옮기고 ETL을 GitHub Actions cron으로 이전. 마이그레이션 과정에서 함정 4건 연속 마주침.

## 원인

### 함정 1: launchd TCC 차단 (근본 원인)

macOS Sequoia/Tahoe부터 launchd 백그라운드 daemon은 `~/Documents`, `~/Desktop`, `~/Downloads` 같은 사용자 보호 디렉토리 접근 차단. 사용자 셸 실행은 GUI 권한 인헤리트로 통과하지만 launchd는 별도 TCC 권한 필요.

**우회 시도와 결과**:

| 시도 | 결과 |
|---|---|
| `run_etl.sh` 자체를 Full Disk Access에 추가 | macOS가 `.sh` 항목 거부 |
| 심링크 `~/projects/eodigakka` → `~/Documents/.../eodigakka` | TCC가 resolved real path 추적, 동일 차단 |
| `/Library/LaunchAgents/` system domain | `EX_CONFIG (78)` — root 컨텍스트 + 사용자 파일 권한 충돌 |
| 프로젝트 mv (옵션 B) | 영구 해결되지만 보류 |
| **클라우드 마이그레이션 (선택)** | Neon + GitHub Actions로 Mac 의존 제거 → 진행 중 |

### 함정 2: 비번에 `$` → 셸 변수 해석으로 손상

```
NEON_URL="postgresql://user:abc$def@host/db"  # ❌ 큰따옴표
# 셸이 $def를 변수로 해석 → 비번이 "abc"로 잘림
```

**해결**: 작은따옴표 + `etl/.env`에 저장 → `migrate_to_neon.sh`가 auto-source.

### 함정 3: pooler endpoint의 search_path

Neon의 pooler connection(`-pooler` suffix)은 **transaction pooling 모드** — 매 statement마다 다른 backend connection 분배 가능. 새 backend의 `search_path`에 `public` schema 미포함이라 unqualified 함수 호출 실패:

```sql
-- 1번 connection (CREATE)
CREATE EXTENSION IF NOT EXISTS postgis;  -- 성공, public schema에 생성

-- 2번 connection (다른 backend)
SELECT PostGIS_Version();  -- ❌ function does not exist
SELECT public.postgis_version();  -- ✅ fully-qualified는 성공
```

**해결**: 검증 query를 fully-qualified로 (`public.postgis_version()`).

### 함정 5: 함정 3 fix를 verification step에 적용 누락

함정 3을 PostGIS 점검(`SELECT public.postgis_version();`)에만 적용하고, 같은 스크립트 끝의 검증 query는 unqualified로 남김:

```sql
-- step 4 검증 (수정 전)
SELECT (SELECT COUNT(*) FROM bjd_polygon) AS bjd, ...
-- → ERROR: relation "bjd_polygon" does not exist
```

import은 끝까지 성공했는데(COPY 467/14744/5456 + REFRESH MV 2건 + CREATE INDEX 5건), 검증 statement만 다른 backend로 분배되며 `search_path`에 `public` 없어 실패. **데이터는 정상**, 메시지만 실패처럼 보이는 위험한 케이스.

### 함정 4: dump 후처리 grep이 COPY 데이터 행을 잘못 잡음

pg_dump v16은 `--exclude-extension` 미지원. 대안으로 grep -v 후처리:

```bash
| grep -vE '^(DROP|CREATE|COMMENT ON) EXTENSION'
| grep -vE '\btiger\.|tiger_geocoder|topology\.'   # ❌ 너무 광범위
```

두 번째 grep이 **COPY ... FROM stdin 안의 데이터 row**까지 매칭해서 row 일부 제거 → COPY stream 깨짐 → `invalid command \.` (end-of-data marker 못 찾음) → 일부 테이블 부분 import / 미적재.

**증거**:
```
COPY 467     # bjd_polygon
COPY 1       # etl_job_status
COPY 0       # ?
COPY 14744   # tx_apt_rent (정상)
invalid command \.   # ❌ stream 깨짐
COPY 5456    # tx_apt_trade (이후 SELECT는 relation 못 찾음)
```

## 수정

### Fix #4 — pg_dump schema 단위 정공법

`pg_dump --exclude-schema=tiger --exclude-schema=tiger_data --exclude-schema=topology`로 schema 단위 제외 — 데이터 행 안 잘림. grep -v는 EXTENSION 라인만 좁게.

```bash
docker exec eodigakka-postgres pg_dump \
  -U app -d eodigakka \
  --no-owner --no-privileges \
  --clean --if-exists \
  --exclude-schema=tiger \
  --exclude-schema=tiger_data \
  --exclude-schema=topology \
  | grep -vE '^(DROP|CREATE|COMMENT ON) EXTENSION' \
  > "$DUMP_FILE"
```

### Fix #5 — verification query에도 fully-qualified 적용

```sql
SELECT
  (SELECT COUNT(*) FROM public.bjd_polygon)   AS bjd,
  (SELECT COUNT(*) FROM public.tx_apt_trade)  AS trade,
  (SELECT COUNT(*) FROM public.tx_apt_rent)   AS rent,
  (SELECT COUNT(*) FROM public.mv_dong_stats) AS mv_stats;
```

### 결과

마이그레이션 통과:

| 테이블 | row |
|---|---|
| `bjd_polygon` | 467 |
| `tx_apt_trade` | 5,456 |
| `tx_apt_rent` | 14,744 |
| `mv_dong_stats` | 801 |

REFRESH MATERIALIZED VIEW (`mv_dong_stats` + `mv_jeonse_ratio`) 둘 다 통과, GIST/B-tree 인덱스 5건 재생성 완료.

### 함정 6: 첫 GHA workflow run에서 `InvalidSchemaName`

GHA secrets 등록 + 첫 workflow_dispatch trigger에서:

```
psycopg2.errors.InvalidSchemaName: no schema has been selected to create in
LINE 2:             CREATE TABLE IF NOT EXISTS etl_job_status (
                                               ^
```

`etl/fetch_rtms.py:218`의 `ensure_etl_status_table`이 unqualified `CREATE TABLE`. Neon role의 `pg_roles.rolconfig`가 비어있어 cluster default `"$user", public`로 fallback. pooler의 transaction-mode 분배에서 일부 backend가 `"$user"`(=neondb_owner) schema 없는 상태로 첫 statement를 받으면 schema 결정 실패. 다음 trigger는 backend 운으로 통과 → 운에 의존하는 깨짐.

**Fix**: `psycopg2.connect(dsn, options="-c search_path=public")` — startup option으로 매 backend connect 시 server-side로 search_path 박힘. transaction pooler 분배와 무관하게 결정적.

```python
# etl/fetch_rtms.py
with psycopg2.connect(db_config.dsn, options="-c search_path=public") as conn:
    ensure_etl_status_table(conn)
    ...

# refresh_materialized_views도 동일 적용
with psycopg2.connect(dsn, options="-c search_path=public") as conn:
    ...

# .github/workflows/etl.yml post-summary도 동일
conn = psycopg2.connect(os.environ['DATABASE_URL'], options="-c search_path=public")
```

`ALTER ROLE neondb_owner SET search_path TO public`도 동일 효과지만 DB 영구 config 변경(blast radius 큼)이라 client 단 startup option이 더 안전.

### 마이그레이션 최종 상태

- [x] dump → import 완전 적재 (commit 6214840)
- [x] GitHub Secrets `DATABASE_URL` / `RTMS_KEY` (stdin pipe로 등록)
- [x] workflow_dispatch run 25360703985 success — trade 5,748 / rent 15,295
- [x] launchctl unload (plist는 fallback용 LaunchAgents에 보존)
- [x] search_path startup option 영구 fix (함정 6 대응)
- [x] launchd 잔재 `com.chsong.eodigakka-etl.plist` repo에서 삭제 (history는 d611364 commit에 보존)

## 교훈

- **macOS launchd + ~/Documents = TCC 지뢰밭**. 자동화 데몬 둘 거면 처음부터 `~/projects/`나 `~/Library/Application Support/` 같은 비보호 디렉토리에 둘 것
- **pg_dump 후처리 grep -v는 위험** — COPY stream의 data row까지 매칭. schema 단위 제외(`--exclude-schema`)가 정공법
- **Neon pooler vs direct endpoint** — pooler는 transaction pooling이라 statement 간 backend 분배 다름. session-state 의존 작업(SET search_path, prepared statement, 새 extension 즉시 사용)은 fully-qualified 또는 direct endpoint로
- **한 번 발견한 함정은 같은 스크립트 모든 statement에 일관 적용** — 함정 3을 점검 query에만 적용하고 검증 query에 빠뜨려 함정 5 재발. fix 적용할 때 grep으로 동일 패턴(unqualified table 참조) 전수검사할 것
- **client-side startup option > server-side ALTER ROLE** — search_path 같은 GUC는 connection startup option(`-c key=value`)이 더 surgical. ALTER ROLE은 영구 catalog 변경이라 blast radius가 다른 client(web 등)까지 가고 rollback도 추가 SQL 필요. psycopg2 `options="-c search_path=public"` 한 줄이 transaction pooler에도 결정적
- **GHA 첫 trigger green = 다음 cron green 보장 아님** — backend lottery로 운 좋게 통과한 뒤 cron firing에서 깨질 수 있음. 처음부터 결정적 fix(startup option) 박을 것
- **셸 변수에 password** — 작은따옴표 + `.env` source 패턴이 영구 안전. URL-encode(`%24` 등) 시도는 client별로 동작 다름
- **이런 종류의 마이그레이션은 functional → 검증 → 진단 → 수정의 사이클로 빠르게 돌릴 것**. 한 번에 다 하려다 6중 함정에 다 걸렸다면 원인 분리 어려움

## 관련

- GitHub Issue: https://github.com/jetsongdev/eodigakka/issues/1
- 영향받은 파일: `db/migrate_to_neon.sh`, `.github/workflows/etl.yml`, `etl/.env` (gitignore)
- 관련 commit: `8865f4d`, `776e869`, `14b1ae5`
