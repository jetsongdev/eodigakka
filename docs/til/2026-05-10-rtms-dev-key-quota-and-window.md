# TIL: RTMS Dev key 일일 한도 10,000건 — ETL 윈도우 정책 분리

날짜: 2026-05-10

## 현상
사이드패널 `/api/dong/[bjd]/recent` 더보기를 풀고(PR #24, v0.10.0) 상계동(매매 396건 적재)을 깊이 봤더니 **모든 거래가 2026-04에 몰려있음** — 70건+, 100건+에서도 단일 월. ETL `month_tokens(date.today(), count=3)`이라 3개월 fetch인데 2-3월 거래는 거의 없고 5월 초는 신고가 적어 결과적으로 4월만 노출되는 분포. 사용자 입장에선 "최근 3개월밖에 안 나오나?"로 보임.

## 원인
RTMS 신고기한 60일 + 늦은 신고가 흔함. 매일 ETL이 직전 3개월을 재조회해도, 적재된 raw는 fetch 시점에 RTMS API가 반환한 데이터 = 신고 들어온 거래뿐. 3개월 윈도우 정책은 "MV 통계 안정성"(ADR-005, `mv_dong_stats`는 직전 3개월) 기준이지 raw 누적 기준이 아님.

raw 테이블은 `ON CONFLICT DO NOTHING`으로 누적되지만, ETL이 fetch 범위 밖 거래(예: 1월·작년)는 영영 안 들어옴 → 사이드패널 `recent`(시간 필터 없음)도 raw 적재분만 노출.

## 수정
1. **ETL 윈도우 옵션화** — `etl/fetch_rtms.py`에 `argparse --months N` 추가. default 3 유지, max 36. 정기 cron은 인자 없이 호출돼 default 3 그대로(신고지연 보정).
2. **1회성 풀 재적재** — `--months 24` 호출로 24개월치 raw에 누적.
   ```bash
   ETL_DISABLED=0 \
   DATABASE_URL=$(grep DATABASE_URL etl/.env | cut -d= -f2-) \
   RTMS_KEY=$(grep RTMS_KEY etl/.env | cut -d= -f2-) \
   .venv-etl/bin/python3 etl/fetch_rtms.py --months 24
   ```
3. **이어받기 옵션 추가** — RTMS 응답 reset 같은 일시 오류 이후 특정 구간만 다시 돌리기 위해 `--start-month YYYYMM --end-month YYYYMM` 지원. 예: 2024-06까지 채운 뒤 더 과거 12개월을 추가할 때:
   ```bash
   ETL_DISABLED=0 \
   DATABASE_URL=$(grep DATABASE_URL etl/.env | cut -d= -f2-) \
   RTMS_KEY=$(grep RTMS_KEY etl/.env | cut -d= -f2-) \
   .venv-etl/bin/python3 etl/fetch_rtms.py --start-month 202405 --end-month 202306
   ```
4. **일시 오류 재시도** — `requests.exceptions.RequestException` 계열 오류는 월/구/거래유형 단위 최대 3회 재시도. `ETL fetch: year_month=... gu_code=... trade_type=...` 로그로 실패 위치를 좁힌다.
5. **문서**: SPEC ADR-012, README "풀 재적재 / 이어받기" 섹션, CLAUDE ETL 운영 메모, 본 TIL.

## 한도 확인 절차

코드/DB로는 알 수 없고 외부 포털 1차 출처:
1. https://www.data.go.kr 로그인
2. 마이페이지 → 데이터 활용 → Open API → 활용 신청 목록
3. 해당 API(`/getRTMSDataSvcAptTradeDev`, `/getRTMSDataSvcAptRentDev`) 클릭
4. **상세기능 표에 "일일 트래픽: N건"** 명시. 본 프로젝트(2026-05-10 확인): **10,000/일** (매매·전월세 각각, 합쳐 20,000/일).
5. "활용 통계"에서 당일/누적 사용량도 보임.

호출량 추정:
- 14구 × 2종(매매·전월세) × N개월 × 평균 5 페이지 = `14 × 2 × N × 5 = 140N`
- 정기 3개월: ≈ 420 호출 (한도의 4.2%)
- 풀 재적재 24개월: ≈ 3,360 호출 (한도의 33.6%, 한 방에 안전)
- 2년 이상은 하루에 못 끝낼 가능성 — `--months 36` 시 ≈ 5,040, 3개월 더하면 8,400로 한도 근접
- 더 과거 backfill은 `--start-month/--end-month`로 12개월 단위 실행 권장. 이미 적재된 raw는 `ON CONFLICT DO NOTHING`으로 중복 무시.

## 교훈
- "3개월"이라는 표현이 SPEC에 여러 번 등장하는데, 의미가 두 가지로 나뉜다: (a) MV 통계 윈도우(고정, ADR-005), (b) ETL fetch 윈도우(가변, ADR-012). 두 layer를 분리하면 "통계 안정성"과 "거래 깊이"를 독립적으로 다룰 수 있다.
- RTMS 신고지연이 한국 부동산 데이터의 구조적 특징 — `tx_count_3m`이 작은 동도 1년치 누적해 보면 표본이 충분할 수 있음. 향후 `tx_count_12m` 같은 보조 통계 추가 검토 가능.
- 외부 API 한도는 코드에 박지 말고 포털 확인 절차를 TIL에 남기는 게 stale 안전. 한도가 정책상 변경되면 코드 상수보다 문서 갱신이 빠름.
- argparse 옵션 추가 시 단위 테스트 — `parse_args(["--months", "24"])` / `parse_args(["--months", "0"])` SystemExit / `month_tokens(count=24)` cross-year token / `month_range_desc("202509", "202406")` / retry exhaustion. 외부 환경 의존 없는 순수 함수라 venv·DB·네트워크 없이 회귀 검증.
