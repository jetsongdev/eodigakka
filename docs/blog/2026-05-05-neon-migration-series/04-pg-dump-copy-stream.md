---
title: "pg_dump 후처리 grep이 COPY 데이터를 잘라먹은 사건"
series: "Neon 마이그레이션 함정 6중"
part: 4
date: 2026-05-05
status: draft
tags: [postgres, pg_dump, postgis, devops]
---

## TL;DR

pg_dump v16은 `--exclude-extension` 미지원(v17부터). 대안으로 grep -v 후처리를 썼는데, 두 번째 grep이 **COPY ... FROM stdin 안의 데이터 row**까지 매칭해서 stream을 깼다. `invalid command \.` 에러로 일부 테이블이 부분 적재 또는 미적재. `pg_dump --exclude-schema=...`가 정공법.

## 증상

```
COPY 467     # bjd_polygon
COPY 1       # etl_job_status
COPY 0       # ?
COPY 14744   # tx_apt_rent (정상)
invalid command \.   # ❌ stream 깨짐
COPY 5456    # tx_apt_trade (이후 SELECT는 relation 못 찾음)
```

pg_dump 결과를 그대로 import하는데 일부 테이블만 데이터 빠짐. 후속 SELECT에서 `relation does not exist`. import 도중 어디선가 stream이 끊긴다.

## 원인

```bash
docker exec eodigakka-postgres pg_dump -U app -d eodigakka \
  --no-owner --no-privileges --clean --if-exists \
  | grep -vE '^(DROP|CREATE|COMMENT ON) EXTENSION' \
  | grep -vE '\btiger\.|tiger_geocoder|topology\.'   # ❌ 너무 광범위
```

PostGIS는 `tiger`, `tiger_data`, `topology` 같은 부속 schema를 자동 생성한다. Neon에서는 이런 schema 권한이 없거나 불필요하니 빼야 한다. 그런데 위 두 번째 grep 패턴이 **COPY 데이터 row 안의 텍스트**까지 매칭한다. 예를 들어 단지명에 `tiger`가 들어간 행, 또는 `topology` 키워드 들어간 도로명 — 그 행이 통째로 사라진다.

`COPY ... FROM stdin` 블록은 데이터 행 → 종료 마커 `\.`로 닫히는데, 데이터 row가 빠지면 일부는 통과하고 종료 마커는 다음 statement로 흘러들어가 `invalid command \.`로 보인다.

## 해결

pg_dump 자체에 schema 단위 제외 옵션을 쓴다. 데이터 row를 절대 안 건드린다.

```bash
docker exec eodigakka-postgres pg_dump -U app -d eodigakka \
  --no-owner --no-privileges --clean --if-exists \
  --exclude-schema=tiger \
  --exclude-schema=tiger_data \
  --exclude-schema=topology \
  | grep -vE '^(DROP|CREATE|COMMENT ON) EXTENSION' \
  > "$DUMP_FILE"
```

EXTENSION 라인 grep은 그대로 둔다(EXTENSION statement는 SQL 명령 줄 시작이라 데이터 row와 매칭 안 됨, anchor `^` 사용). schema 단위 제외는 pg_dump 내부에서 처리되므로 결과 dump에 그 schema 흔적이 아예 안 들어간다.

## 디버깅 팁

- `COPY N` 출력 줄을 모두 확인. 예상 row 수와 다르면 stream이 어딘가 깨졌다.
- `psql -v ON_ERROR_STOP=1`을 항상 써서 첫 에러에서 멈춰라. 그렇지 않으면 후속 에러가 도미노로 쌓여 원인이 묻힌다.
- 의심되면 dump file을 grep으로 직접 검사: `grep -c '^COPY ' dump.sql`이 import 측 `COPY N` 횟수와 일치하는지.

## 교훈

데이터 stream에 grep -v를 거는 건 거의 항상 위험하다. SQL 명령 라인은 보통 줄 시작 anchor가 있으니 좁게 쓸 것. schema/object 단위 제외는 pg_dump의 옵션을 먼저 찾아라.

## 참고

- 원본 TIL: `docs/til/2026-05-05-neon-migration-tcc-launchd.md` 함정 4 섹션
- `pg_dump` docs: `--exclude-schema`, `--exclude-extension`(v17+)
