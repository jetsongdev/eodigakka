---
title: "같은 함정에 두 번 빠진 이유 — fix 적용 일관성"
series: "Neon 마이그레이션 함정 6중"
part: 5
date: 2026-05-05
status: draft
tags: [debugging, postgres, devops, lessons-learned]
---

## TL;DR

함정 3(pooler search_path)을 PostGIS 점검 query에만 적용하고 같은 스크립트의 검증 query에 빠뜨렸다. import는 끝까지 성공했는데 마지막 검증 SELECT만 `relation "bjd_polygon" does not exist`로 실패. 데이터는 정상인데 메시지만 실패처럼 보이는 위험한 케이스.

## 증상

```bash
$ bash db/migrate_to_neon.sh
... (생략, COPY 467 / COPY 14744 / COPY 5456 다 통과) ...
REFRESH MATERIALIZED VIEW
REFRESH MATERIALIZED VIEW
===== 4) 검증 =====
ERROR:  relation "bjd_polygon" does not exist
LINE 3:     (SELECT COUNT(*) FROM bjd_polygon)  AS bjd,
                                  ^
```

import는 다 됐는데 마지막 검증만 깨진다. 처음엔 "import가 부분만 됐나?"로 의심했지만 실제로는 데이터는 100% 적재 완료, 검증 query만 search_path 영향받음.

## 원인

스크립트 안에 두 query가 있었다:

```bash
# step 2: PostGIS 점검 — 이미 fully-qualified로 fix됨 (함정 3 적용)
docker run --rm "$PSQL_IMAGE" psql "$NEON_URL" \
  -c "SELECT public.postgis_version();"

# step 4: 검증 — fix 적용 누락 (함정 5)
docker run --rm "$PSQL_IMAGE" psql "$NEON_URL" -c "
  SELECT
    (SELECT COUNT(*) FROM bjd_polygon) AS bjd,    -- ❌ unqualified
    ...
"
```

함정 3을 발견했을 때 "PostGIS 호출에 fully-qualified 박는다"로 fix를 좁게 인식했다. 검증 query도 같은 pooler endpoint에 동일 함정에 노출된다는 사실을 그 자리에서 검토 안 했다.

## 해결

검증 query도 fully-qualified로:

```sql
SELECT
  (SELECT COUNT(*) FROM public.bjd_polygon)   AS bjd,
  (SELECT COUNT(*) FROM public.tx_apt_trade)  AS trade,
  (SELECT COUNT(*) FROM public.tx_apt_rent)   AS rent,
  (SELECT COUNT(*) FROM public.mv_dong_stats) AS mv_stats;
```

## 일반화: fix 적용 시 전수검사

함정을 발견하면 fix 자체보다 *fix가 적용되어야 할 모든 곳*을 찾는 게 더 중요하다.

체크리스트:

1. 같은 패턴 grep — `grep -nE '\bFROM [a-z_]+\b' migrate_to_neon.sh`로 unqualified table 참조 다 잡음.
2. 같은 connection 패턴 — `grep -n psycopg2.connect etl/*.py`로 connect 지점 다 검토.
3. 같은 secret/env 사용처 — `grep -nE 'NEON_URL|DATABASE_URL'`.

함정 발견 → fix 작성 → 전수검사 → fix 일관 적용 순서.

## 메타 교훈

발견 시점의 emotion("아 이거였구나")이 fix scope 인식을 좁힌다. 확인된 fix 한 곳에 박는 도파민이 후속 검사를 미루게 만든다. 잠깐 멈추고 같은 패턴이 어디 또 있는지 grep 한 번 더 돌리자.

## 참고

- 원본 TIL: `docs/til/2026-05-05-neon-migration-tcc-launchd.md` 함정 5 섹션
- 같은 시리즈: [Part 3 — Neon pooler search_path](./03-pooler-search-path.md)
