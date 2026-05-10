# eodigakka

[![RTMS ETL (daily)](https://github.com/jetsongdev/eodigakka/actions/workflows/etl.yml/badge.svg)](https://github.com/jetsongdev/eodigakka/actions/workflows/etl.yml)

부동산 실거래가 기반 임장 후보 동 색칠지도. 자금 4~8억 매매·전세 모드 분리.

## 스택

- **DB**: PostgreSQL 16 + PostGIS 3.5 (로컬 docker 또는 Neon ap-southeast-1)
- **ETL**: Python 3.12 + PublicDataReader (RTMS Dev 엔드포인트). 매일 03:00 KST GitHub Actions cron
- **API**: Next.js 16 App Router + Kysely
- **Map**: Mapbox GL JS + 법정동 SHP (V-World `LSMD_ADM_SECT_UMD_11`, 467개 동)
- **테스트**: Playwright e2e 12개 (`web/tests/e2e/`)

## 빠른 시작

```bash
docker compose up -d
docker exec -i eodigakka-postgres psql -U app -d eodigakka < db/schema.sql
docker exec -i eodigakka-postgres psql -U app -d eodigakka < db/views.sql

# ETL (수동 1회)
ETL_DISABLED=0 \
DATABASE_URL=$(grep DATABASE_URL etl/.env | cut -d= -f2-) \
RTMS_KEY=$(grep RTMS_KEY etl/.env | cut -d= -f2-) \
.venv-etl/bin/python3 etl/fetch_rtms.py

# Web
cd web && npm install && npm run dev
```

## 초기화 절차 (신규 환경 또는 Neon 재마이그레이션)

운영 SoT는 Neon. 새 머신·새 Neon 프로젝트로 옮기는 경우만 사용.

```bash
# 1. 로컬 docker postgres에 schema·views 적재 + ETL 1회로 raw 채움
docker compose up -d
docker exec -i eodigakka-postgres psql -U app -d eodigakka < db/schema.sql
docker exec -i eodigakka-postgres psql -U app -d eodigakka < db/views.sql
.venv-etl/bin/python3 db/load_polygon.py "/path/to/LSMD_ADM_SECT_UMD_11_YYYYMM.shp" --sido 서울특별시 --truncate
ETL_DISABLED=0 DATABASE_URL=postgresql://app:app@localhost:5432/eodigakka \
  RTMS_KEY=$(grep RTMS_KEY etl/.env | cut -d= -f2-) \
  .venv-etl/bin/python3 etl/fetch_rtms.py

# 2. Neon SQL Editor에서 PostGIS 활성화: CREATE EXTENSION IF NOT EXISTS postgis;
# 3. etl/.env에 NEON_URL='postgresql://...' 추가 후 마이그레이션
bash db/migrate_to_neon.sh

# 4. GitHub Secrets 등록 (DATABASE_URL=Neon, RTMS_KEY) + Vercel env (DATABASE_URL=Neon)
```

`db/migrate_to_neon.sh`는 `pg_dump --exclude-schema=tiger,topology` + extension 제거 grep + `psql` import + 검증 카운트(`bjd / trade / rent / mv_stats`)까지 자동. 시스템 `psql` 미설치라도 `docker run --rm postgres:16 psql`로 처리.

## 풀 재적재 (24개월 윈도우, 1회성)

ADR-012 — 정기 cron은 default 3개월(신고지연 보정)이지만 `--months N`으로 윈도우 확장 가능. 사이드패널 `/api/dong/[bjd]/recent` 더보기에 노출되는 raw가 1년치 이상 필요할 때 1회 실행.

```bash
# Neon 직결 (운영 환경에 직접 누적). 호출량 ≈ 3,360 (한도 10,000/일).
ETL_DISABLED=0 \
DATABASE_URL=$(grep DATABASE_URL etl/.env | cut -d= -f2-) \
RTMS_KEY=$(grep RTMS_KEY etl/.env | cut -d= -f2-) \
.venv-etl/bin/python3 etl/fetch_rtms.py --months 24
```

raw 테이블 `ON CONFLICT DO NOTHING` 누적이라 기존 데이터 안전. 정기 cron(`.github/workflows/rtms-etl-daily.yml`)은 인자 없이 호출되니 그대로 default 3 — 풀 재적재 후에도 정기 ETL은 신고지연 보정만 담당. `mv_dong_stats`/`mv_jeonse_ratio`는 명시적으로 직전 3개월 윈도우(ADR-005)라 색칠지도 confidence 분류는 변하지 않고 "최근 거래" 깊이만 늘어남.

검증:
```bash
docker run --rm -i postgres:16 psql "$(grep DATABASE_URL etl/.env | cut -d= -f2-)" -c \
  "SELECT to_char(contract_date,'YYYY-MM') ym, COUNT(*) FROM tx_apt_trade GROUP BY ym ORDER BY ym DESC;"
```
24개 월 모두 노출되면 성공.

## 문서

- [SPEC.md](SPEC.md) — 설계 SSOT, ADR-001~008
- [CLAUDE.md](CLAUDE.md) — 작업 규약, 도구 우선순위
- [tasks.md](tasks.md) — Phase별 TODO
- [CHANGELOG.md](CHANGELOG.md) — 일자별 변경
- [docs/til/](docs/til/) — 시행착오 9건
- [docs/snapshots/](docs/snapshots/) — 시각 진화 5장
