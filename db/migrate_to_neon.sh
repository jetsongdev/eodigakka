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

if [ -z "${NEON_URL:-}" ]; then
  echo "ERROR: NEON_URL 환경변수 필요" >&2
  echo "예: NEON_URL='postgresql://...' bash $0" >&2
  exit 1
fi

echo "===== 1) 로컬 docker postgres dump ====="
docker exec "$LOCAL_CONTAINER" pg_dump \
  -U "$LOCAL_USER" \
  -d "$LOCAL_DB" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --exclude-extension=postgis \
  --exclude-extension=postgis_topology \
  --exclude-extension=postgis_tiger_geocoder \
  --exclude-extension=fuzzystrmatch \
  --exclude-extension=plpgsql \
  > "$DUMP_FILE"

echo "  dump size: $(wc -c < "$DUMP_FILE") bytes"

echo "===== 2) Neon PostGIS 활성화 점검 ====="
docker run --rm "$PSQL_IMAGE" psql "$NEON_URL" -c "SELECT PostGIS_Version();" || {
  echo "ERROR: Neon에서 PostGIS extension 미활성." >&2
  echo "Neon SQL Editor에서 먼저: CREATE EXTENSION IF NOT EXISTS postgis;" >&2
  exit 1
}

echo "===== 3) Neon에 import ====="
docker run --rm -i "$PSQL_IMAGE" psql "$NEON_URL" -v ON_ERROR_STOP=1 < "$DUMP_FILE"

echo "===== 4) 검증 ====="
docker run --rm "$PSQL_IMAGE" psql "$NEON_URL" -c "
  SELECT
    (SELECT COUNT(*) FROM bjd_polygon)  AS bjd,
    (SELECT COUNT(*) FROM tx_apt_trade) AS trade,
    (SELECT COUNT(*) FROM tx_apt_rent)  AS rent,
    (SELECT COUNT(*) FROM mv_dong_stats) AS mv_stats;
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
