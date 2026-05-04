#!/bin/bash
# eodigakka ETL 실행 래퍼
# .env 로드 후 venv python으로 fetch_rtms.py 실행. launchd / cron 양쪽에서 사용 가능.
#
# 환경:
#   PROJECT_DIR  - 프로젝트 루트 (이 스크립트 위치 기준 자동 감지)
#   LOG_DIR      - 로그 디렉토리 (기본: $PROJECT_DIR/logs)
#
# 종료 코드:
#   0  성공 (kill switch ETL_DISABLED=1 포함)
#   ≠0 실패
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/logs}"
mkdir -p "$LOG_DIR"

LOG_FILE="$LOG_DIR/etl-$(date +%Y%m%d).log"
exec >> "$LOG_FILE" 2>&1

echo "===== ETL run start: $(date '+%Y-%m-%d %H:%M:%S %Z') ====="

ENV_FILE="$PROJECT_DIR/etl/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

# .env 로드 (KEY=VALUE 줄만, 주석·공백 제거)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# kill switch 체크 (외부에서 ETL_DISABLED=1 설정해두면 fetch_rtms.py가 즉시 0 종료)
ETL_DISABLED="${ETL_DISABLED:-0}"
export ETL_DISABLED

PYTHON="$PROJECT_DIR/.venv-etl/bin/python3"
if [ ! -x "$PYTHON" ]; then
  echo "ERROR: venv python not found at $PYTHON"
  exit 1
fi

cd "$PROJECT_DIR"
"$PYTHON" etl/fetch_rtms.py
EXIT_CODE=$?

echo "===== ETL run end: $(date '+%Y-%m-%d %H:%M:%S %Z') (exit $EXIT_CODE) ====="
exit $EXIT_CODE
