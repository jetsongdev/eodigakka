---
title: "InvalidSchemaName과 두 번의 fix — pooler에서 direct endpoint로"
series: "Neon 마이그레이션 함정 6중"
part: 6
date: 2026-05-05
status: draft
tags: [postgres, neon, psycopg2, search_path, debugging]
---

## TL;DR

GitHub Actions ETL이 `psycopg2.errors.InvalidSchemaName: no schema has been selected to create in`로 실패. 1차 fix로 `options="-c search_path=public"` startup option을 박았지만 Neon pooler가 명시적으로 차단(`unsupported startup parameter in options: search_path`). 2차 fix로 **direct (unpooled) endpoint로 전환**해서 해결. ETL batch에 pooler를 쓴 게 처음부터 잘못된 선택이었다.

## 1차 증상

```
psycopg2.errors.InvalidSchemaName: no schema has been selected to create in
LINE 2:             CREATE TABLE IF NOT EXISTS etl_job_status (
                                               ^
```

`etl/fetch_rtms.py`의 `ensure_etl_status_table`. unqualified `CREATE TABLE`. 같은 코드가 trigger마다 다르게 동작 — 한 번은 통과, 한 번은 fail.

## 1차 진단

Neon role의 `pg_roles.rolconfig`가 비어있고 cluster default `search_path`는 `"$user", public`. pooler가 분배한 backend에서 `"$user"`(=neondb_owner) schema가 없으면 unqualified DDL이 schema를 결정 못 해서 `InvalidSchemaName`. 다음 trigger에서 운 좋게 다른 backend로 분배되면 통과 — 결정적이지 않은 깨짐.

## 1차 fix (틀린 fix)

PgBouncer 일반 지식: connection startup option으로 GUC 주입 가능.

```python
# etl/fetch_rtms.py
with psycopg2.connect(
    db_config.dsn,
    options="-c search_path=public",
) as conn:
    ...
```

이걸 commit하고 검증도 안 한 채 "결정적 fix"로 결론지었다. trigger:

```
ERROR:  unsupported startup parameter in options: search_path. 
Please use unpooled connection or remove this parameter from the startup package.
More details: https://neon.tech/docs/connect/connection-errors#unsupported-startup-parameter
```

Neon pooler는 PgBouncer 변형이지만 startup parameter 기반 GUC 주입을 명시적으로 차단한다. doc 자체가 "use unpooled connection"을 권장.

## 2차 fix (채택)

Neon은 pooler URL과 direct URL을 동시에 발급한다. 호스트에서 `-pooler`만 빼면 direct.

```
pooler:  ep-red-hill-xxxx-pooler.c-2.ap-southeast-1.aws.neon.tech
direct:  ep-red-hill-xxxx.c-2.ap-southeast-1.aws.neon.tech
```

GitHub Secret `DATABASE_URL`만 direct로 갱신, ETL 코드는 vanilla `psycopg2.connect(dsn)`로 회귀.

```bash
DIRECT_URL=$(echo "$NEON_URL" | sed 's/-pooler//')
printf '%s' "$DIRECT_URL" | gh secret set DATABASE_URL
```

direct endpoint는 transaction pooling이 없어서 backend가 일관. search_path도 항상 같음. 함정 6의 진짜 원인(pooler 분배 비결정성)이 자연 소멸.

## 결과

direct endpoint로 갈아끼운 후 workflow_dispatch trigger:

```
trade_count=..., rent_count=..., last_ok=..., mv_refreshed=..., last_err=(empty)
```

backend 운과 무관하게 결정적 통과.

## 핵심 교훈 — pooler vs direct는 워크로드 기준으로 고른다

| | pooler | direct |
|---|---|---|
| 동시성 | 수천 connection | endpoint별 제한 |
| session state | 비보존 (transaction 단위) | 보존 |
| prepared statement | 사용 어려움 | 자유롭게 사용 |
| startup options | Neon에서 차단 | 자유 |
| 적합 워크로드 | web app, 단명 connection 다수 | batch ETL, cron, 분석 |

ETL을 pooler에 박은 건 처음 결정부터 잘못. ETL은 GHA cron에서 1 connection만 쓰는 batch — pooler 이점 0. 처음부터 direct를 골랐으면 함정 6 자체가 발생 안 함.

## 메타 교훈 — fix 검증 전에 결론 박지 말 것

1차 fix를 commit한 직후 블로그 포스트 06편에 "PgBouncer가 backend connection 새로 열 때 이 option도 함께 전달되므로... 결정적 통과"라고 적었다. 실제 trigger는 unsupported error로 fail. **"이론상 맞아야 한다"와 "실제로 통과한다"는 다르다.** 실험 → 통과 확인 → 결론 작성 순서.

vendor-specific 환경에서는 일반 지식이 통하지 않을 수 있다. "PgBouncer는 이렇게 동작한다"가 "Neon pooler도 그렇게 동작한다"를 보장하지 않는다. vendor doc 한 번 검색하는 비용이 디버깅 한 라운드보다 훨씬 싸다.

## 추가 — startup options 일반론은 여전히 유효

PostgreSQL 자체는 connection startup 시 임의의 GUC를 `-c key=value`로 받는다. *direct endpoint나 RDS·self-hosted PostgreSQL이라면* 이 패턴이 잘 작동:

```python
psycopg2.connect(
    dsn,
    options="-c search_path=public "
            "-c statement_timeout=30000 "
            "-c application_name=eodigakka-etl",
)
```

Neon pooler에서만 안 되는 것이고, direct endpoint에서는 가능. 단 우리 사례에서는 direct로 옮기고 나면 search_path를 명시적으로 박을 필요 자체가 없어진다(transaction pooling이 없으니).

## 참고

- 원본 TIL: `docs/til/2026-05-05-neon-migration-tcc-launchd.md` 함정 6 섹션
- Neon docs: [Unsupported startup parameter](https://neon.tech/docs/connect/connection-errors#unsupported-startup-parameter)
- Neon docs: [Connection pooling](https://neon.tech/docs/connect/connection-pooling)
- 같은 시리즈: [Part 3 — Neon pooler search_path](./03-pooler-search-path.md)
- 관련 commit: `a2eb788`(1차 시도, options startup), `1c4a185`(revert + direct endpoint)
