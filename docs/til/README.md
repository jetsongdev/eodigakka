# TIL (Today I Learned)

eodigakka 프로젝트 진행하며 마주친 시행착오·해결 기록.

규칙: `YYYY-MM-DD-짧은-키워드.md` 파일명, 본문은 `## 현상 / ## 원인 / ## 수정 / ## 교훈` 4단락.

---

## 2026-05-05 (Phase 1 — 법정동 마이그레이션 + 클라우드 이전)

### DB
- [V-World LSMD shapefile 함정 3종 (데이터셋 종류·EUC-KR·EMD_CD 8자리)](2026-05-05-lsmd-shapefile-pitfalls.md)

### Infra
- [launchd TCC 차단 → Neon 마이그레이션 함정 4중 (진행 중)](2026-05-05-neon-migration-tcc-launchd.md) — [issue #1](https://github.com/jetsongdev/eodigakka/issues/1)

---

## 2026-05-04 (Phase 0~1)

### MCP / API
- [real-estate-mcp 403 → Dev 엔드포인트 패치](2026-05-04-real-estate-mcp-403.md)
- [`claude mcp add` 명령어 문법 (name 위치)](2026-05-04-claude-mcp-add-syntax.md)

### ETL
- [PublicDataReader `translate=True`와 해제여부 필터 역전](2026-05-04-rtms-haeje-filter.md)
- [Python 3.14 `pyexpat` 크래시 → 3.12 venv](2026-05-04-python314-pyexpat.md)
- [`uv run` ETL 패키지 빌드 실패 회피](2026-05-04-etl-pyproject-build.md)

### DB
- [`REFRESH MATERIALIZED VIEW CONCURRENTLY` autocommit](2026-05-04-mv-refresh-autocommit.md)
- [`mv_dong_stats` does not exist → views.sql 먼저 적용](2026-05-04-views-apply-order.md)
- [HangJeongDong GeoJSON 서울 필터 (`sido=="11"` + `adm_cd2`)](2026-05-04-load-polygon-sido-filter.md)
- [행정동 vs 법정동 코드 불일치 → JOIN 0건](2026-05-04-bjd-code-haengjeong-vs-beopjeong.md)
