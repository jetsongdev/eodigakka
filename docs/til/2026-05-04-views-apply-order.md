# TIL: ETL 첫 실행 시 `mv_dong_stats does not exist`

날짜: 2026-05-04

## 현상

처음 ETL을 돌렸을 때:

```
psycopg2.errors.UndefinedTable: relation "mv_dong_stats" does not exist
```

데이터 적재는 성공했는데 마지막 `refresh_materialized_views` 단계에서 터짐.

## 원인

`db/schema.sql`은 컨테이너 시작 시점에 적용되도록 세팅했지만, `db/views.sql`(materialized views)은 별도로 적용해야 했음. ETL은 MV 존재를 가정하고 REFRESH 호출.

## 수정

views.sql을 수동 적용 후 ETL 재실행:

```bash
docker exec -i eodigakka-postgres psql -U app -d eodigakka < db/views.sql
.venv-etl/bin/python3 etl/fetch_rtms.py
```

## 교훈

- DB 스키마는 적용 순서가 중요: `schema.sql` → `views.sql` → 데이터 적재 → REFRESH.
- 초기화 자동화: docker entrypoint에 `/docker-entrypoint-initdb.d/`로 둘 다 마운트하거나, ETL 스크립트가 `CREATE MATERIALIZED VIEW IF NOT EXISTS`를 직접 보장하게 만들기.
- `IF NOT EXISTS`는 이미 모든 DDL에 붙어 있어서, 적용 순서만 맞으면 멱등.
