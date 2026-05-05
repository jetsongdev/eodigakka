#!/bin/bash
# 로컬 docker postgres → Neon 마이그레이션
# psql 시스템 설치 불필요 — docker run 임시 컨테이너로 처리.
#
# 사용법:
#   1. Neon DATABASE_URL 발급 + PostGIS 활성화:
#        Neon SQL Editor → CREATE EXTENSION IF NOT EXISTS postgis;
#   2. NEON_URL='postgresql://user:pass@ep-xxx.aws.neon.tech/eodigakka?sslmode=require' \
#        bash db/migrate_to_neon.sh
set -euo pipefail

LOCAL_CONTAINER="${LOCAL_CONTAINER:-eodigakka-postgres}"
LOCAL_USER="${LOCAL_USER:-app}"
LOCAL_DB="${LOCAL_DB:-eodigakka}"
DUMP_FILE="${DUMP_FILE:-/tmp/eodigakka-dump.sql}"
PSQL_IMAGE="${PSQL_IMAGE:-postgres:16}"

# NEON_URL 미설정이면 etl/.env 자동 로드 (셸 escaping 문제 회피용 권장 경로)
ENV_FILE="${ENV_FILE:-etl/.env}"
if [ -z "${NEON_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [ -z "${NEON_URL:-}" ]; then
  echo "ERROR: NEON_URL 미설정." >&2
  echo "  방법 A: etl/.env에 NEON_URL='postgresql://...' 한 줄 추가 (권장)" >&2
  echo "  방법 B: NEON_URL='postgresql://...' bash $0" >&2
  exit 1
fi

echo "===== 1) 로컬 docker postgres dump ====="
# pg_dump v16은 --exclude-extension 미지원(v17부터). EXTENSION 자체는 grep 후처리로 제거.
# tiger/topology 같은 PostGIS 부속 schema는 --exclude-schema로 정공법 제외 (grep -v는 COPY
# 데이터 row를 잘못 매칭해 stream 깨졌음, TIL 2026-05-05-neon-migration-tcc-launchd 참조).
docker exec "$LOCAL_CONTAINER" pg_dump \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --exclude-schema=tiger \
  --exclude-schema=tiger_data \
  --exclude-schema=topology \
  | grep -vE '^(DROP|CREATE|COMMENT ON) EXTENSION' \
  > "$DUMP_FILE"

echo "  dump size: $(wc -c < "$DUMP_FILE") bytes"

echo "===== 2) Neon PostGIS 활성화 점검 ====="
# pooler 모드에선 search_path가 다른 backend로 분배될 수 있어 fully-qualified 호출.
docker run --rm "$PSQL_IMAGE" psql "$NEON_URL" -c "SELECT public.postgis_version();" || {
  echo "ERROR: Neon에서 PostGIS extension 미활성 또는 public schema에 없음." >&2
  echo "Neon SQL Editor에서: CREATE EXTENSION IF NOT EXISTS postgis;" >&2
  exit 1
}

echo "===== 3) Neon에 import ====="
docker run --rm -i "$PSQL_IMAGE" psql "$NEON_URL" -v ON_ERROR_STOP=1 < "$DUMP_FILE"

echo "===== 4) 검증 ====="
# pooler는 statement별 backend 분배 가능 — search_path 의존 금지, fully-qualified 호출.
docker run --rm "$PSQL_IMAGE" psql "$NEON_URL" -c "
  SELECT
    (SELECT COUNT(*) FROM public.bjd_polygon)   AS bjd,
    (SELECT COUNT(*) FROM public.tx_apt_trade)  AS trade,
    (SELECT COUNT(*) FROM public.tx_apt_rent)   AS rent,
    (SELECT COUNT(*) FROM public.mv_dong_stats) AS mv_stats;
"

echo "===== 5) dump 파일 정리 ====="
rm "$DUMP_FILE"

echo
echo "========================================"
echo "✅ 마이그레이션 완료. 다음 단계:"
echo "  1) GitHub Secrets 등록 (Repository → Settings → Secrets → Actions):"
echo "     - DATABASE_URL = \$NEON_URL"
echo "     - RTMS_KEY     = etl/.env 의 RTMS_KEY 값"
echo "  2) GitHub Actions 수동 trigger:"
echo "     - Repository → Actions → 'RTMS ETL (daily)' → Run workflow"
echo "  3) launchd plist 정리:"
echo "     launchctl unload ~/Library/LaunchAgents/com.chsong.eodigakka-etl.plist"
echo "  4) 로컬 web 사용 시 .env.local DATABASE_URL은 그대로 (docker postgres) 또는 Neon으로 변경"
echo "========================================"
