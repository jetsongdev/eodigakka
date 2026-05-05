---
title: "~/Documents에서 ETL 자동화하다 함정 6개 만난 이야기 (Neon 마이그레이션)"
series: "Neon 마이그레이션 함정 6중"
part: 0
date: 2026-05-05
status: draft
tags: [postgres, neon, github-actions, macos, launchd, devops]
---

# 시리즈 개요

**한 줄 요약**: 부동산 ETL을 매일 새벽 3시에 돌리려고 launchd plist 등록했는데 macOS Tahoe TCC가 `~/Documents/` 접근을 막았다. 우회로 Neon Cloud + GitHub Actions cron으로 옮기는 과정에서 함정 6개를 연달아 만났고, 그걸 6편으로 정리한다.

## 시리즈 목차

| # | 제목 | 핵심 |
|---|---|---|
| 1 | macOS launchd가 ~/Documents를 못 본다 | TCC 정책, 우회 시도 4종 실패담, 클라우드 결정 |
| 2 | `$`가 들어간 비번이 셸에서 잘리는 이유 | 큰따옴표 vs 작은따옴표, `.env` source 패턴 |
| 3 | Neon pooler에서 PostGIS_Version()이 안 보이는 이유 | transaction-mode pooling이 함의하는 것 |
| 4 | pg_dump 후처리 grep이 COPY 데이터를 잘라먹은 사건 | `--exclude-schema` 정공법, stream 깨짐 디버깅 |
| 5 | 같은 함정에 두 번 빠진 이유 — fix 적용 일관성 | 함정 3을 점검 query에만 적용한 결과 |
| 6 | `InvalidSchemaName`과 두 번의 fix — pooler에서 direct endpoint로 | startup option은 Neon pooler가 차단, direct endpoint로 회귀 |

## 결론 미리

- macOS Sequoia/Tahoe 이후 `~/Documents`는 launchd에 매우 적대적. 자동화 daemon은 처음부터 `~/projects/` 같은 비보호 디렉토리에 둘 것.
- Neon pooler는 PgBouncer 기반 transaction pooling이라 statement/transaction 단위로 backend가 바뀐다. session-state 의존하는 모든 작업(SET, prepared statement, search_path)에 영향 — fully-qualified 또는 startup option으로 대응.
- 한 번 발견한 함정은 같은 스크립트 내 모든 statement에 일관 적용해야 한다. 점검에만 박고 검증에 빠뜨리면 그 자리에서 똑같이 깨진다.

## 환경

- macOS Sequoia/Tahoe (Mac M4 Pro)
- Postgres 16 + PostGIS 3.4 (로컬 docker) → Neon Postgres + PostGIS 3.5 (`ap-southeast-1`, free 0.5GB)
- Python 3.12 (psycopg2-binary, PublicDataReader)
- GitHub Actions ubuntu-latest, cron `0 18 * * *` UTC = KST 03:00

## 데이터 (참고)

- 강북 14구 RTMS 매매·전월세 최근 3개월
- bjd_polygon 467 / tx_apt_trade 5,748 / tx_apt_rent 15,295 / mv_dong_stats 801 (2026-05-05 06:12 UTC 기준)

## 참고 자료

- 1차 기록: [`docs/til/2026-05-05-neon-migration-tcc-launchd.md`](../../til/2026-05-05-neon-migration-tcc-launchd.md)
- GitHub Issue: https://github.com/jetsongdev/eodigakka/issues/1
- 관련 commit: `8865f4d`(GHA workflow 도입), `776e869`(README badge), `14b1ae5`(grep 후처리), `6214840`(검증 fully-qualified), `a2eb788`(startup option), `859ae12`(launchd plist 정리)
