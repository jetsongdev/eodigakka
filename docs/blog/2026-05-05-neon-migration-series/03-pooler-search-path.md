---
title: "Neon pooler에서 PostGIS_Version()이 안 보이는 이유"
series: "Neon 마이그레이션 함정 6중"
part: 3
date: 2026-05-05
status: draft
tags: [postgres, neon, pgbouncer, pooling]
---

## TL;DR

Neon pooler endpoint(`-pooler` 들어간 호스트)는 PgBouncer 기반 **transaction pooling 모드**다. 매 statement마다 다른 backend connection으로 분배될 수 있고, 새 backend의 `search_path`에 `public` schema가 빠질 수 있다. unqualified 함수 호출이 그때 "function does not exist"로 실패한다. fully-qualified(`public.postgis_version()`)로 해결.

## 증상

```sql
-- 마이그레이션 직후
docker run --rm postgres:16 psql "$NEON_URL" -c "SELECT PostGIS_Version();"
ERROR:  function postgis_version() does not exist
```

근데 `CREATE EXTENSION postgis`는 분명 통과했고, Neon SQL Editor에서 `\dx`로 보면 `postgis | 3.5.x | public`로 잘 잡힌다. 즉 extension은 있는데 *이 connection에서는* 못 본다.

## 원인

PgBouncer transaction-mode pooling의 본질:

```
client A ──┐                    ┌── backend 1 (search_path: "$user", public)
client B ──┼──> [pooler] ──────┼── backend 2 (search_path: "$user")
client C ──┘                    └── backend 3 (search_path: "")
```

매 statement(또는 transaction)마다 client → backend 분배가 바뀐다. backend 2/3에서는 `public.`가 search_path에 없어서 unqualified 함수가 안 보인다.

같은 client connection이어도 statement 사이에 backend가 바뀔 수 있다는 게 핵심.

## 해결

```sql
-- ❌ backend 운에 의존
SELECT PostGIS_Version();

-- ✅ fully-qualified
SELECT public.postgis_version();
```

함수만이 아니라 테이블·뷰·시퀀스 모든 데이터베이스 객체가 동일. 검증 query, 헬스체크, 진단 query 모두 schema 명시.

## pooler vs direct endpoint

Neon은 pooler endpoint와 direct endpoint를 동시에 발급한다. 호스트에서 `-pooler`만 빼면 direct.

| | pooler | direct |
|---|---|---|
| 사용처 | web app, 짧은 connection | batch ETL, 장기 connection |
| 동시성 | 수천 connection | endpoint별 제한 |
| session state | 비보존 (transaction 단위) | 보존 |
| prepared statement | 사용 어려움 | 자유롭게 사용 |
| 비용 | 동일 | 동일 |

ETL처럼 적은 동시성·세션 의존 작업이면 direct가 안전. 일관 fix가 어렵다면 endpoint 자체를 direct로 갈아끼우는 것도 옵션.

## 교훈

pooler를 쓴다는 건 "session-scope 동작을 포기한다"는 뜻이다. 그걸 처음에 인지하지 않고 평소 하던 unqualified 호출 그대로 쓰면 운에 따라 깨진다.

## 참고

- 원본 TIL: `docs/til/2026-05-05-neon-migration-tcc-launchd.md` 함정 3 섹션
- Neon docs: [Connection pooling](https://neon.tech/docs/connect/connection-pooling)
- PgBouncer docs: [Pool modes](https://www.pgbouncer.org/features.html#pool-modes)
