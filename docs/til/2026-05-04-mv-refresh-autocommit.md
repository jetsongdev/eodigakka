# TIL: `REFRESH MATERIALIZED VIEW CONCURRENTLY`는 autocommit 필수

날짜: 2026-05-04

## 현상

ETL 마지막 단계에서 MV 갱신 시도:

```python
def refresh_materialized_views(conn):
    previous_autocommit = conn.autocommit
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dong_stats")
    finally:
        conn.autocommit = previous_autocommit
```

→ `psycopg2.errors.ActiveSqlTransaction: REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction block`

`conn.autocommit = True`를 줘도 이미 진행 중인 트랜잭션이 있으면 무시됨.

## 원인

psycopg2는 `cursor.execute()` 호출 시점에 자동으로 트랜잭션을 시작한다. ETL 본 작업(`INSERT … ON CONFLICT`)들이 끝나도 같은 connection에 implicit transaction이 살아 있으면 `autocommit = True` 변경이 다음 statement부터만 적용되는데, `REFRESH ... CONCURRENTLY`는 transaction context 자체를 거부.

## 수정

별도 connection을 autocommit으로 처음부터 만들어서 사용:

```python
def refresh_materialized_views(dsn: str) -> None:
    # CONCURRENTLY는 트랜잭션 밖(autocommit)에서만 실행 가능 → 별도 커넥션 사용
    with psycopg2.connect(dsn) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dong_stats")
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_jeonse_ratio")
```

호출부도 `conn` 대신 `dsn` 전달.

## 교훈

- `REFRESH MATERIALIZED VIEW CONCURRENTLY`, `CREATE INDEX CONCURRENTLY`, `VACUUM` 등은 트랜잭션 밖에서만 실행 가능.
- psycopg2에서 autocommit을 도중에 바꾸는 건 신뢰하지 말 것 — 처음부터 autocommit 커넥션 만드는 게 안전.
- ETL 패턴: bulk insert는 트랜잭션 커넥션, 후처리(REFRESH/VACUUM)는 별도 autocommit 커넥션으로 분리.
