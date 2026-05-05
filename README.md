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

## 문서

- [SPEC.md](SPEC.md) — 설계 SSOT, ADR-001~008
- [CLAUDE.md](CLAUDE.md) — 작업 규약, 도구 우선순위
- [tasks.md](tasks.md) — Phase별 TODO
- [CHANGELOG.md](CHANGELOG.md) — 일자별 변경
- [docs/til/](docs/til/) — 시행착오 9건
- [docs/snapshots/](docs/snapshots/) — 시각 진화 5장
