# TIL (Today I Learned)

eodigakka 프로젝트 진행하며 마주친 시행착오·해결 기록.

규칙: `YYYY-MM-DD-짧은-키워드.md` 파일명, 본문은 `## 현상 / ## 원인 / ## 수정 / ## 교훈` 4단락.

---

## 2026-05-10 (Phase 1.5 — 사이드패널 깊이 보기)

### ETL / Data
- [RTMS Dev key 일일 한도 10,000건 — ETL 윈도우 정책 분리(정기 3개월 + 1회성 24개월 풀 재적재)](2026-05-10-rtms-dev-key-quota-and-window.md)

---

## 2026-05-05 (Phase 1 — 법정동 마이그레이션 + 클라우드 이전)

### DB
- [V-World LSMD shapefile 함정 3종 (데이터셋 종류·EUC-KR·EMD_CD 8자리)](2026-05-05-lsmd-shapefile-pitfalls.md)

### Infra
- [launchd TCC 차단 → Neon 마이그레이션 함정 6중 (완료)](2026-05-05-neon-migration-tcc-launchd.md) — [issue #1](https://github.com/jetsongdev/eodigakka/issues/1)
- [Vercel Hobby plan dispatcher stuck — All Projects 뷰 + cancel로 깨우기](2026-05-05-vercel-hobby-queue-stuck.md)

### Frontend
- [Mapbox WebGL 컨텍스트 누수 — StrictMode + HMR이 합쳐지면 `new Map()` throw](2026-05-05-mapbox-webgl-strictmode.md)
- [Mapbox 토큰 URL restriction은 wildcard 미지원 — Vercel preview를 위해 token 분리](2026-05-05-mapbox-token-url-restriction.md)
- [`<div onClick aria-hidden>` overlay 함정 — 스크린리더·키보드에서 닫기 동작이 사라진다](2026-05-05-aria-hidden-overlay-trap.md)

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
