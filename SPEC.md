# 임장 후보 필터링 (가칭: jeonse-buyable-map)

부동산 실거래가 기반 임장 후보 동 색칠지도. 자금 4~8억 매매·전세 모드 분리.

---

## 1. 청사진 정렬 (하네스 9원리)

이 프로젝트는 `agent-blueprint.md` 위에 **부동산 도메인을 갈아끼운 것**. 새로 짓지 않는다.

| 청사진 | 본 프로젝트 매핑 |
|---|---|
| 1. Plan→Review→Apply | ETL(룰) → 색칠/MCP(LLM read) → 임장(사람) |
| 2. 하네스=셸 | Skill 1개 = 부동산 1개 |
| 3. 2-tier 모델 | 집계는 SQL/cron, 자연어 탐색만 Claude |
| 4. 비대칭 가드 | Review 공격적, Apply(임장)는 사람만 |
| 5. 사람 게이트 | 자동 추천 금지. "조건 통과 N개"까지만 |
| 6. Evidence-first | 단정문 금지. "최근 3개월 N건, 출처 RTMS YYYY-MM" |
| 7. 상태는 파일/DB | PostGIS + GeoJSON. 컨텍스트 의존 X |
| 8. 채널이 깊이 | 색칠지도(개요) ↔ MCP 자연어(드릴다운) |
| 9. Kill switch | `ETL_DISABLED=1` 한 줄 + readonly 모드 |

---

## 2. 6하원칙 점검

- **누가**: 본인. 임장 후보 좁히기 1주 단축.
- **무엇**: 국토부 RTMS 아파트 매매·전월세 (서울 우선)
- **언제**: 매일 03:00 cron ETL (최근 3개월 재조회 — 신고지연 보정)
- **어디로**: (1) PWA 색칠지도, (2) MCP 자연어 드릴다운
- **왜 자동화 가능**: read-only 판단, Apply(임장)는 사람만 가능 → 둘 다 yes
- **어떻게 멈춤**: `.env` 플래그 + cron 비활성

---

## 3. 목표 / 비목표

### 목표 (MVP)
- 자금 4~8억으로 매매·전세 가능한 **동 색칠지도** 1장
- 매매·전세 **모드 토글** (의사결정 결 다름)
- 동 클릭 → **TOP5 단지 / 최근 거래** 사이드패널
- real-estate-mcp 자연어 드릴다운 연결
- 강북 14구 매매 + 서울 25구 전세

### 비목표 (의식적 제외)
- ❌ 호가 크롤링 (네이버부동산 등)
- ❌ DSR/LTV 시뮬레이터 직접 구현 (룰 자주 바뀜 — 슬라이더로 한도 직접 입력)
- ❌ 추천 단정문 ("TOP 5 추천 동" 같은 거)
- ❌ 강남4구 매매 ETL (자금 8억으로 거의 다 꺼짐)
- ❌ 경기도 (Phase 2 이후)
- ❌ 자체 인증/회원가입 (혼자 쓰는 도구)
- ❌ 모바일 네이티브 앱 (PWA로 충분)

---

## 4. 기술 스택

| 레이어 | 선택 | 근거 |
|---|---|---|
| ETL | Python + [PublicDataReader](https://github.com/WooilJeong/PublicDataReader) | RTMS XML 파싱·재시도 거저먹기 |
| DB | PostgreSQL 16 + PostGIS | shadow-map 경험 재사용 |
| 백엔드 | Next.js 16 API Routes + Kysely | sslife 스택 그대로 |
| 프론트 | Next.js 16 + Mapbox GL JS | 검증된 조합 |
| 자연어 | [real-estate-mcp](https://github.com/tae0y/real-estate-mcp) (그대로 사용) | Claude Desktop stdio |
| 배포 | Vercel (frontend) + 자체 Mac M4 Pro (Postgres+ETL) | 기존 인프라 |
| 폴리곤 | NSDI 법정동 GeoJSON (EPSG:5174 → 4326) | shadow-map 변환 코드 재활용 |

⚠️ PublicDataReader / real-estate-mcp 둘 다 **fork 떠두기** (1년 정체 / 외부 의존).

---

## 5. 데이터 모델

### 5.1 raw 테이블 (ETL 적재)

```sql
-- 매매
CREATE TABLE tx_apt_trade (
  id            BIGSERIAL PRIMARY KEY,
  sigungu_code  CHAR(5)        NOT NULL,
  bjd_code      CHAR(10)       NOT NULL,           -- 법정동
  complex_name  TEXT           NOT NULL,           -- 단지명
  area_m2       NUMERIC(6,2)   NOT NULL,
  build_year    SMALLINT,
  floor         SMALLINT,
  price_man     INTEGER        NOT NULL,           -- 만원
  contract_date DATE           NOT NULL,
  source        TEXT           NOT NULL DEFAULT 'RTMS',
  fetched_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (bjd_code, complex_name, area_m2, floor, price_man, contract_date)
);
CREATE INDEX ON tx_apt_trade (bjd_code, contract_date);

-- 전월세 (보증금 + 월세 분리)
CREATE TABLE tx_apt_rent (
  id            BIGSERIAL PRIMARY KEY,
  sigungu_code  CHAR(5)        NOT NULL,
  bjd_code      CHAR(10)       NOT NULL,
  complex_name  TEXT           NOT NULL,
  area_m2       NUMERIC(6,2)   NOT NULL,
  build_year    SMALLINT,
  floor         SMALLINT,
  deposit_man   INTEGER        NOT NULL,
  monthly_man   INTEGER        NOT NULL DEFAULT 0,  -- 0이면 순수 전세
  contract_date DATE           NOT NULL,
  source        TEXT           NOT NULL DEFAULT 'RTMS',
  fetched_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (bjd_code, complex_name, area_m2, floor, deposit_man, monthly_man, contract_date)
);
CREATE INDEX ON tx_apt_rent (bjd_code, contract_date);

-- 법정동 폴리곤
CREATE TABLE bjd_polygon (
  bjd_code  CHAR(10) PRIMARY KEY,
  bjd_name  TEXT NOT NULL,        -- "서울특별시 강북구 미아동"
  sido      TEXT NOT NULL,
  sigungu   TEXT NOT NULL,
  dong      TEXT NOT NULL,
  geom      GEOMETRY(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX ON bjd_polygon USING GIST (geom);
```

### 5.2 집계 뷰 (Materialized View)

```sql
-- 동 × 평형구간 × 모드 × 최근3개월
CREATE MATERIALIZED VIEW mv_dong_stats AS
SELECT
  bjd_code,
  CASE
    WHEN area_m2 < 60  THEN 'S'   -- 소형 (~59㎡)
    WHEN area_m2 < 85  THEN 'M'   -- 중형 (60~84㎡)
    ELSE 'L'                       -- 대형 (85㎡~)
  END AS size_bucket,
  'TRADE' AS mode,
  COUNT(*) AS tx_count_3m,
  COUNT(DISTINCT complex_name) AS unique_complex_3m,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_man) AS median_price_man,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_man) AS p25_price_man,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_man) AS p75_price_man,
  MAX(contract_date) AS last_contract_date,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY build_year) AS median_build_year,
  STDDEV(build_year) AS build_year_stddev,
  CASE
    WHEN COUNT(*) >= 10 THEN 'high'
    WHEN COUNT(*) >= 3  THEN 'low'
    ELSE 'insufficient'
  END AS confidence
FROM tx_apt_trade
WHERE contract_date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY bjd_code, size_bucket
UNION ALL
SELECT
  bjd_code, size_bucket, 'JEONSE' AS mode,
  tx_count_3m, unique_complex_3m,
  median_deposit_man, p25_deposit_man, p75_deposit_man,
  last_contract_date
FROM (
  SELECT
    bjd_code,
    CASE WHEN area_m2 < 60 THEN 'S' WHEN area_m2 < 85 THEN 'M' ELSE 'L' END AS size_bucket,
    COUNT(*) AS tx_count_3m,
    COUNT(DISTINCT complex_name) AS unique_complex_3m,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY deposit_man) AS median_deposit_man,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY deposit_man) AS p25_deposit_man,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY deposit_man) AS p75_deposit_man,
    MAX(contract_date) AS last_contract_date
  FROM tx_apt_rent
  WHERE contract_date >= CURRENT_DATE - INTERVAL '3 months'
    AND monthly_man = 0   -- 순수 전세만
  GROUP BY bjd_code, size_bucket
) j;

CREATE UNIQUE INDEX ON mv_dong_stats (bjd_code, size_bucket, mode);
```

### 5.3 전세가율 뷰

```sql
CREATE MATERIALIZED VIEW mv_jeonse_ratio AS
SELECT
  t.bjd_code,
  t.size_bucket,
  t.median_price_man   AS sale_median,
  j.median_deposit_man AS jeonse_median,
  j.median_deposit_man::FLOAT / NULLIF(t.median_price_man, 0) AS ratio
FROM mv_dong_stats t
JOIN mv_dong_stats j USING (bjd_code, size_bucket)
WHERE t.mode = 'TRADE' AND j.mode = 'JEONSE';
```

---

## 6. 필터 룰

### 6.1 매매 모드 (자금 4~8억)

```python
buyable = (
    cash_min <= median_price_3m <= cash_max
    and confidence != 'insufficient'   # 표본 가드 (ADR-005: 동적)
    and unique_complex_3m >= 2         # 임장 효율 (단지 다양성)
    and (p75_price / p25_price) < 1.5  # 가격 분산 가드
)
# confidence='low' 이면 색칠하되 연색 + tooltip "표본 적음 (N건)"
```

### 6.2 전세 모드 (자금 4~8억)

```python
rentable = (
    cash_min <= median_jeonse_3m <= cash_max
    and confidence != 'insufficient'   # ADR-005: 동적 표본 가드
    and unique_complex_3m >= 2
    and jeonse_to_sale_ratio < 0.80   # 깡통전세 가드 (강력, ADR-003)
)
# confidence='low' 이면 색칠하되 연색 + tooltip "표본 적음 (N건)"
```

### 6.3 정책대출 가드 (체크박스 옵션)

| 상품 | 보증금/매매가 상한 |
|---|---|
| 신생아특례 디딤돌 (매매) | 12억 이하 |
| 신생아특례 버팀목 (전세) | 수도권 5억 이하 |
| 신혼 버팀목 (전세) | 한도 3억 / 전세금 3.75억 (LTV 80%) |

체크하면 가드 추가. 본인이 직접 한도 입력하는 슬라이더가 메인.

### 6.4 색상 매핑

| 색 | 의미 |
|---|---|
| 진초록 | 자금 통과 + 깡통가드 통과 + confidence=high |
| 연초록 | 자금 통과 + confidence=high (깡통가드 미적용) |
| 진초록(투명 50%) | 자금 통과 + confidence=low → tooltip "표본 적음 (N건)" |
| 노랑 | 자금 통과 + 가격 분산 큼 (p75/p25 ≥ 1.5) → 조심 |
| 노랑(투명 50%) | 노랑 + confidence=low 복합 |
| 회색 | confidence=insufficient (3건 미만) / 임장 가치 낮음 |
| 빨강 | (전세모드) 전세가율 80%+ (HUG 기준, ADR-003) |
| 비표시 | 자금 범위 밖 |
| ⚠️ tooltip | build_year_stddev > 10년 → "신구축 혼재" 경고 (ADR-006) |

---

## 7. API 엔드포인트 (Next.js Route Handlers)

### `GET /api/affordable`

```
Query:
  mode:        'trade' | 'jeonse'
  cash_min:    int (만원)
  cash_max:    int (만원)
  size:        'S' | 'M' | 'L' | 'all'
  loan_filter: 'shinsang_buy' | 'shinsang_jeon' | 'newlywed' | null

Response:
{
  dongs: [
    {
      bjd_code: "1130510100",
      bjd_name: "서울특별시 강북구 미아동",
      median_price_man: 65000,
      tx_count_3m: 23,
      unique_complex_3m: 8,
      jeonse_ratio: 0.62,
      color: "deep_green",
      evidence: "최근 3개월 23건, 단지 8개, RTMS 2026-02~04"
    }
  ],
  generated_at: "2026-05-04T03:00:00Z",
  data_freshness: "RTMS 2026-04-30 신고분까지"
}
```

### `GET /api/dong/:bjd_code/complexes`

상위 5개 단지 + 최근 거래 10건. 사이드패널 드릴다운용.

### `GET /api/health`

ETL 마지막 성공 시각, raw 테이블 row count, mv refresh 시각. Kill switch 상태 표시.

---

## 8. UI/UX

### 헤더
- 모드 토글: `[매매] [전세]`
- 자금 슬라이더: 4억 ─ 8억 (만원 단위 / 5천만원 step)
- 평형: `[~59㎡] [60~84㎡] [85㎡~]` (multi-select)
- 정책대출 체크박스: 신생아·신혼·버팀목

### 메인
- Mapbox GL JS, 서울 중심 zoom 11
- 동 폴리곤 색칠 (위 6.4 매핑)
- 마우스오버: 동 이름 + median + tx_count tooltip
- 클릭: 사이드패널 열림

### 사이드패널
- 동 요약 카드 (Evidence 명시)
- TOP 5 단지 (median 매매·전세 + 거래 건수)
- 최근 거래 10건 (계약일 / 단지 / 면적 / 가격)
- "Claude로 더 보기" 버튼 → real-estate-mcp 자연어 쿼리 복사

### 푸터
- 데이터 출처: 국토교통부 RTMS
- 최종 갱신 시각
- ⚠️ "실거래가는 1~3개월 후행지표. 호가 별도 확인" 명시

---

## 9. ETL

### 9.1 스크립트

```python
# etl/fetch_rtms.py
from PublicDataReader import TransactionPrice
from sqlalchemy import create_engine
import os, sys
from datetime import date, timedelta

if os.getenv("ETL_DISABLED") == "1":
    print("ETL disabled by kill switch"); sys.exit(0)

api = TransactionPrice(os.environ["RTMS_KEY"])
engine = create_engine(os.environ["DATABASE_URL"])

GANGBUK_14 = [  # 한강 이북 (Phase 1)
    "11110","11140","11170","11200","11215","11230","11260",
    "11290","11305","11320","11350","11380","11410","11440",
]
GANGNAM_11 = [  # 한강 이남 (Phase 2 일부 + 매매는 자금범위 밖)
    "11470","11500","11530","11545","11560","11590","11620",
    "11650","11680","11710","11740",
]
SEOUL_25 = GANGBUK_14 + GANGNAM_11
assert len(set(SEOUL_25)) == 25  # 중복 검증

def fetch_month(gu: str, ym: str, kind: str):
    return api.get_data(
        property_type="아파트", trade_type=kind,
        sigungu_code=gu, year_month=ym,
    )

def upsert(df, table):
    # ON CONFLICT DO NOTHING (UNIQUE 제약 활용)
    df.to_sql("_stage", engine, if_exists="replace", index=False)
    with engine.begin() as conn:
        conn.execute(f"""
            INSERT INTO {table} (...)
            SELECT ... FROM _stage
            ON CONFLICT DO NOTHING
        """)

# 최근 3개월 재조회 (신고지연 보정)
months = [(date.today() - timedelta(days=30*i)).strftime("%Y%m") for i in range(3)]
TARGET_GU = GANGBUK_14  # Phase 1: 강북 14구만. Phase 2에서 SEOUL_25로 확장

for ym in months:
    for gu in TARGET_GU:
        upsert(fetch_month(gu, ym, "매매"), "tx_apt_trade")
        upsert(fetch_month(gu, ym, "전월세"), "tx_apt_rent")

# MV refresh
with engine.begin() as conn:
    conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dong_stats")
    conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_jeonse_ratio")
```

### 9.2 스케줄

- crontab: `0 3 * * * cd /path && uv run python etl/fetch_rtms.py >> /var/log/rtms.log 2>&1`
- 또는 GitHub Actions cron (lottery 봇과 동일 패턴)

### 9.3 idempotent 보장

- UNIQUE 제약 + `ON CONFLICT DO NOTHING`
- 같은 월 N번 호출해도 데이터 중복 X
- ETL 실패해도 다음 cron이 복구

---

## 10. Phase 마일스톤

| Phase | 범위 | 기간 | 상태 |
|---|---|---|---|
| 0 | real-estate-mcp 검증 + 강북 14구 3개월 bulk pull + 동별 표본 희소 지도 확인. ADR-001~007 확정. (ADR-004) | 0.5일 | ✅ 2026-05-04 완료 |
| 1 | 강북 14구 매매 + 전세 ETL → PostGIS, 색칠지도 1장 | 3일 | 🟢 거의 완료 (ETL·DB·API ✓ / 색칠지도 6단계 ✓ / e2e 12/12 ✓ / 임장 1회 ⏳) |
| 2 | 서울 25구 전세, 전세가율 가드, 사이드패널 | 2일 | 🔲 대기 |
| 3 | (선택) 외곽 매매 추가, 정책대출 옵션 |  | 🔲 Phase 2 후 재평가 |
| 4 | (선택) 자체 MCP tool: `find_affordable_dongs` |  | 🔲 Phase 2 후 재평가 |

**Phase 0 주요 발견:**
- M형 4~8억 high confidence 통과 동: 21개 (강북 14구 기준)
- 임장 우선 후보: 도봉(방학·쌍문·도봉동), 강북(미아·번동·수유), 중랑(신내·망우·묵동)
- 희소 구(종로·용산·광진): 색칠지도에서 회색 비중 높을 예정, 임장 우선순위 낮음

**Phase 1에서 멈춰도 가치 있음**. 임장 한 번 가고 우선순위 재평가.

---

## 11. Anti-pattern (밟지 마)

- ❌ 호가 크롤링 (네이버부동산 등) — 약관 위반
- ❌ DSR/LTV 직접 시뮬 — 정책 자주 바뀜
- ❌ "TOP 5 추천 동" 단정문 — 청사진 6번 위반
- ❌ 매매·전세 한 화면 통합 모드
- ❌ 자금만 보고 색칠 (단지·거래량 가드 필수)
- ❌ real-estate-mcp로 색칠지도 만들기 (토큰 폭발)
- ❌ 강남4구 매매 ETL 우선
- ❌ Phase 4부터 짓기
- ❌ 두 외부 레포 fork 안 떠두기
- ❌ "실거래 후행지표" UI 명시 누락

---

## 12. Kill Switch

```bash
# ETL 중단
echo "ETL_DISABLED=1" >> .env

# API readonly (DB 룰)
ALTER USER app_user SET default_transaction_read_only = on;

# 프론트 점검 모드
NEXT_PUBLIC_MAINTENANCE=1
```

---

## 13. 외부 의존 / 라이선스

| 레포 | 라이선스 | 용도 | fork |
|---|---|---|---|
| WooilJeong/PublicDataReader | MIT | ETL | 필수 |
| tae0y/real-estate-mcp | MIT | 자연어 인터페이스 | 권장 |
| NSDI 법정동 GeoJSON | 공공데이터 | 폴리곤 | static 적재 |
| 국토부 RTMS API | data.go.kr 약관 | 실거래가 | 키 분리 |

---

## 14. 디렉토리 구조

```
jeonse-buyable-map/
├── etl/                      # Python
│   ├── fetch_rtms.py
│   ├── load_polygon.py
│   ├── pyproject.toml
│   └── .env.example
├── db/
│   ├── schema.sql
│   └── views.sql
├── web/                      # Next.js 16
│   ├── app/
│   │   ├── page.tsx
│   │   ├── api/
│   │   │   ├── affordable/route.ts
│   │   │   ├── dong/[bjd]/complexes/route.ts
│   │   │   └── health/route.ts
│   ├── lib/
│   │   ├── db.ts             # Kysely
│   │   └── filter.ts         # 룰 (테스트 가능)
│   ├── components/
│   │   ├── Map.tsx
│   │   ├── ModeToggle.tsx
│   │   ├── BudgetSlider.tsx
│   │   └── DongDetailPanel.tsx
│   └── package.json
├── .mcp.json                 # real-estate-mcp 연결 (옵션)
├── docker-compose.yml        # postgres+postgis (개발용)
├── SPEC.md                   # 이 문서
└── README.md
```

---

## 15. ADR (Architecture Decision Records)

### ADR-001: 서울 25개 구 코드 목록 정오 (2026-05-04)
- **결정**: SEOUL_GU 단일 리스트 폐기 → `GANGBUK_14` / `GANGNAM_11` / `SEOUL_25` 분리.
- **근거**: 기존 리스트에 11440(마포)·11650(관악)·11680(서초) 중복, 11530(구로)·11560·11770 누락. `assert len(set(SEOUL_25)) == 25`로 코드 레벨 보장.
- **영향**: §9.1 ETL 스크립트 반영 완료. Phase 1 ETL은 `GANGBUK_14`만.

### ADR-002: mv_dong_stats 컬럼명 중립화 (2026-05-04)
- **결정**: `UNION ALL` 공통 컬럼명을 `median_man / p25_man / p75_man`으로 통일. `mv_jeonse_ratio`는 `mode='TRADE'` / `mode='JEONSE'` 각 CTE 후 조인.
- **근거**: §5.2 현재 TRADE쪽 컬럼명(`median_price_man`)이 UNION ALL 기준으로 굳어져 `mv_jeonse_ratio`에서 `j.median_deposit_man` 참조 시 컬럼 없음 에러. 뷰 분리하면 MV refresh 순서 의존성 증가 → 통일이 낫다.
- **영향**: §5.2 views.sql 작성 시 반드시 이 명칭 사용.

### ADR-003: 전세가율 80% 컷오프 출처 명시 (2026-05-04)
- **결정**: `jeonse_to_sale_ratio < 0.80` 기준은 HUG(주택도시보증공사) 전세보증보험 가입 가능 상한(보증금 ≤ 매매가 × 90%)에서 보수 마진 10%p를 적용한 운영 기준. 출처: HUG 보증약관 2024년판.
- **근거**: 청사진 6번(Evidence-first) — 단정 기준에는 출처 필수. 동별 편차 있으므로 UI에 "(HUG 기준, 동별 편차 있음)" 레이블 표기 강제.
- **영향**: §6.2 필터 룰, §6.4 색상 매핑 빨강 조건에 레이블 추가.

### ADR-005: tx_count_3m 임계값 동적 산정 (2026-05-04)
- **결정**: `tx_count_3m >= 5` 하드코딩 폐기. `mv_dong_stats`에 `confidence` 컬럼 추가.
  - `tx_count_3m >= 10` → `high` (정상 색칠)
  - `tx_count_3m >= 3` → `low` (색칠하되 연한 색 + tooltip에 "표본 적음" 표시)
  - `tx_count_3m < 3` → 회색 (비표시와 동일)
- **근거**: 강북구 실데이터(2026-04) 확인 결과 수유동(7건), 우이동(2건)처럼 구별로 거래량 편차가 크다. 일괄 5건 커트는 저거래 동을 과도하게 숨기거나 반대로 노출함. 숫자가 아닌 신뢰도 레이블로 색칠 레이어와 분리.
- **영향**: §5.2 mv_dong_stats에 `confidence` 컬럼 추가. §6.1 §6.2 필터 룰 재정의. §6.4 색상 매핑에 low-confidence 처리 추가.

### ADR-006: 평형 버킷과 연식 혼재 주의 (2026-05-04)
- **결정**: `mv_dong_stats`에 `median_build_year` 컬럼 추가(집계용, 필터 아님). UI 사이드패널에 중위 연식 표시. 평형 버킷은 기존(S/M/L) 유지하되, 같은 버킷 내 연식 분산이 10년 이상이면 tooltip에 "신구축 혼재" 경고.
- **근거**: 강북구 실데이터에서 신축 소형(꿈의숲해링턴플레이스 59㎡, 8.65~9.34억)이 구축 대형(벽산라이브파크 114㎡, 7.2억)보다 비쌈. S버킷 중위가 M버킷보다 높게 나오면 UI에서 혼란 발생. 평형 버킷이 가격 신뢰도를 보장하지 않는다는 사실을 사용자에게 노출해야 함.
- **영향**: §5.2 mv_dong_stats에 `median_build_year`, `build_year_stddev` 추가. §8 사이드패널 단지 카드에 연식 표시.

### ADR-007: real-estate-mcp Dev 엔드포인트 패치 (2026-05-04)
- **결정**: `_helpers.py` 아파트 매매·전세 URL을 Dev 엔드포인트로 교체.
  - `RTMSDataSvcAptTrade` → `RTMSDataSvcAptTradeDev`
  - `RTMSDataSvcAptRent` → `RTMSDataSvcAptRentDev`
  - `http://` (HTTP, Dev 엔드포인트 규격)
- **근거**: data.go.kr에서 발급된 키가 Dev 엔드포인트 승인. 프로덕션 엔드포인트는 403. 데이터 동일, 성능 차이 없음. 추후 프로덕션 키 발급 시 URL만 되돌리면 됨.
- **영향**: real-estate-mcp fork 내 `_helpers.py` 수정 완료(2026-05-04). SPEC §4 fork 항목에 패치 이력 추가.

### ADR-004: real-estate-mcp Phase 0 fallback (2026-05-04)
- **결정**: real-estate-mcp를 Phase 0에서 바로 신뢰하지 않는다. 검증 우선 — stdio 연결 + 쿼리 1건 실행 확인. 실패 시 fallback: PublicDataReader CLI 직접 실행으로 동일 목표(데이터 감 잡기) 달성.
- **근거**: SPEC §4에 "1년 정체" 명시. 미검증 외부 레포에 Phase 0 전체를 의존하면 반나절이 디버깅으로 소실.
- **영향**: §10 Phase 0 설명에 "(MCP 검증 우선, fallback: PDR CLI)" 추가.

### ADR-009: client-side 토큰은 환경별 분리 발급 (2026-05-05)
- **결정**: `NEXT_PUBLIC_*` 키처럼 client 번들에 노출되는 third-party 토큰은 Vercel 환경별로 분리 발급한다. Production env에는 strict URL restriction이 걸린 전용 토큰, Preview / Development env에는 unrestricted (또는 느슨한 restriction) default 토큰을 박는다.
- **근거**: Mapbox URL restriction은 정확한 origin 매칭만 허용하고 wildcard·port wildcard·subdomain 패턴 모두 거부한다. Vercel preview URL은 push마다 hash가 바뀌어 사전 등록 불가. 단일 토큰으론 production + preview를 동시에 보호할 수 없어 환경별 분리 외 대안이 없다. trade-off: preview·local은 노출 표면이 작고(PR-only URL, 로컬은 외부 비노출) abuse 시 production 사용량에 영향 없으므로 unrestricted 수용 가능.
- **영향**: §11 보안·운영 섹션에 "client-side token rotation 절차" 추가 필요. 현재 `NEXT_PUBLIC_MAPBOX_TOKEN` 1건 적용 완료. 향후 Sentry DSN, Analytics token 등 동일 패턴 후보. Vercel `Settings → Environment Variables`에서 같은 key를 환경별로 다른 value 등록하는 패턴이 표준. TIL `2026-05-05-mapbox-token-url-restriction`.

### ADR-010: Healthchecks.io 외부 watchdog 도입 (2026-05-05)
- **결정**: GHA cron(`RTMS ETL (daily)`)에 healthchecks.io 무료 tier ping 3-step(start / success / fail)을 박는다. `HEALTHCHECKS_PING_URL` GitHub secret으로 주입하며, secret 미등록 환경에선 graceful skip(echo 후 정상 진행).
- **근거**: ETL 자가 감지 한계 — `etl_job_status.last_succeeded_at`이 1~2일 비어도 외부 알림 없으면 사용자가 사이트 들어가기 전까지 인지 안 됨. GHA scheduler 자체가 부하로 미발사할 수도 있어 GHA 내부 모니터링은 sufficient하지 않다. 외부 watchdog가 schedule + grace time(1h) 기준으로 독립 판정 → 이메일/Telegram 알림. 무료 tier(20개 check)면 충분.
- **trade-off**: ping URL 누출 시 외부에서 임의로 success/fail 가짜 ping 가능 → 단, healthchecks는 전송된 timestamp만 신뢰하므로 가짜 success는 진짜 실패를 가릴 위험 있음. UUID 추측 어려워 실질 위험 낮음. 회전 비용 낮음(secret 갱신만).
- **영향**:
  - `.github/workflows/etl.yml` start/success/fail 3-step 추가 (env hoist로 GHA shell injection 방어 — `gha-shell-injection.md` TIL).
  - 향후 `/api/health` 외부 ping(HTTP check), 다른 cron(Vercel deployment 모니터링 등)도 같은 패턴으로 확장 가능.

### ADR-011: ETL 데이터 신선도 in-DB watchdog 추가 (2026-05-09)
- **결정**: ADR-010 외부 watchdog와 별개로, GHA 자체 워크플로 `.github/workflows/etl-stale-alert.yml`로 DB 측 신선도(`etl_job_status.last_succeeded_at`)를 25시간 interval 기준으로 일별 점검. stale 또는 NULL이면 label `etl-stale` 단일 open 이슈로 fan-out, dedup으로 outage N일 동안 같은 이슈에 모임. 정상화 후 issue close가 ack 신호이며 다음 stale에 자동 재생성.
- **근거**: Healthchecks ping은 ETL **실행 실패**(workflow step `failure()`)는 잡지만 silent success — ETL이 exit 0인데 `update_etl_status(succeeded=True)` 호출까지 도달 못한 케이스 — 또는 GHA scheduler 자체가 1~2시간 firing 지연된 케이스를 정상으로 본다. ADR-010 trade-off의 "가짜 success가 진짜 실패를 가릴 위험"을 데이터 freshness 자체를 DB에서 보는 방식으로 메운다. 두 layer(외부 ping + in-DB watchdog)가 서로 독립이라 single point of failure 회피.
- **trade-off**: 같은 outage에 두 채널(Healthchecks 이메일·Telegram + GH issue)로 알림이 동시에 와 중복 인지 비용 발생 가능. 다만 GH issue는 trail이 남고 close가 자연 ack라 운영 기록으로도 가치 있음. cron 시점 KST 05:00은 ETL firing(KST 03:00) + 2h 쿠션이라 GHA scheduler·ETL 자체 지연 둘 다 흡수.
- **영향**:
  - `.github/workflows/etl-stale-alert.yml` 신규: cron `0 20 * * *` UTC (KST 05:00) + `workflow_dispatch` `force_alert: bool` 검증 입력 + permissions `issues: write` / `contents: read` + label `gh label create --color B60205 --force` idempotent 보장.
  - stale 판정: `COALESCE(last_succeeded_at, '1970-01-01'::timestamptz) < NOW() - INTERVAL '25 hours'` (절대 clock math 회피, NULL 안전).
  - dedup: 본 워크플로 첫 step에서 `gh issue list --label etl-stale --state open --json number --jq 'length'` 0이 아니면 alert 생성 skip.
  - 검증 path: PR 머지 후 main에서 `gh workflow run etl-stale-alert.yml --field force_alert=true` 1회 → 이슈 1건 생성, 재실행 → dedup으로 skip, 이슈 close 후 다시 force → 신규 이슈 생성으로 재생성 path 검증.

### ADR-008: bjd_polygon 법정동 체계로 마이그레이션 (2026-05-04 결정 / 2026-05-05 실행)
- **결정**: `bjd_polygon`을 HangJeongDong GeoJSON(행정동) 기준에서 V-World `LSMD_ADM_SECT_UMD_11`(서울 법정 읍면동 경계 SHP, EPSG:5186→4326 변환) 기준으로 재적재.
- **근거**: RTMS API는 법정동 코드만 제공(`법정동시군구코드+법정동읍면동코드` → `1138010300` 패턴). HangJeongDong은 행정동 코드(`adm_cd2 = 1138051000`)라 JOIN 0건. JEONSE는 동 이름 fallback이 우연히 행정동에 매핑되지만 1법정동=다행정동 케이스(예: 불광동→불광1동/2동)에서 데이터 손실·임의 매핑 발생. 부동산 도메인 표준은 법정동.
- **데이터셋 정정**: 결정 시점에 `LSMD_CONT_LDREG_11`(연속지적도, 200MB 필지 단위, 동 이름 컬럼 없음)을 가정했으나 실행 단계에서 `LSMD_ADM_SECT_UMD_11`(법정 읍면동 경계, 2.4MB, 467행)로 정정. 좌표계도 EPSG:5179가 아닌 **EPSG:5186**.
- **영향 (실행 결과 2026-05-05)**:
  - `db/load_polygon.py` 보강: `detect_shapefile_encoding` (`.cpg`/`.cst` 사이드카에서 EUC-KR 등 자동 추출), `pad_bjd_code_to_10` (8자리 `EMD_CD`→10자리 끝 `00`).
  - `bjd_polygon` TRUNCATE 후 467개 법정동 적재. `tx_apt_rent`도 TRUNCATE 후 ETL 재실행(15,432건)으로 행정동 fallback 데이터 제거.
  - MV REFRESH 결과 `mv_dong_stats × bjd_polygon` JOIN 매칭률 100% (TRADE 390/390, JEONSE 411/411).
  - SQL 검증: 강북 14구 M형 4~8억 high confidence 동 정상 노출 (방학동 5.0억, 쌍문동 5.4억 등 Phase 0 결과와 일치).
  - 시행착오 기록: `docs/til/2026-05-05-lsmd-shapefile-pitfalls.md`.

### ADR-012: ETL 윈도우 정책 — 정기 3개월 + 1회성 24개월 풀 재적재 (2026-05-10)
- **결정**: `etl/fetch_rtms.py`에 `--months N` argparse 옵션 추가(default 3, max 36). 정기 cron은 default 3개월 그대로(신고지연 보정 — RTMS는 신고기한 60일 + 늦은 신고가 흔해 직전 3개월을 매일 재조회해야 backfill 됨). 풀 재적재는 1회성으로 `--months 24` 호출 → raw 테이블에 24개월치 누적.
- **근거**: 사이드패널 `/api/dong/[bjd]/recent` 더보기를 풀자(라운드 1·2 = PR #24, v0.10.0) 사용자가 거래를 깊이 보고 싶을 때 raw에 4월 한 달치만 적재돼 "여기까지" 끝 라벨이 빨리 떴다. 신고 지연 분포상 2026-05-10 시점에 3개월 fetch가 사실상 4월에 몰리는 결과. RTMS Dev key 일일 한도 10,000회 (매매·전월세 각각, 2026-05-10 마이페이지 확인) 기준 풀 재적재 호출량 ≈ 14구 × 2종 × 24월 × 평균 5 페이지 ≈ 3,360 호출이라 한 방에 가능.
- **trade-off**: raw 테이블 크기 증가(현재 ~20K 행 → 풀 재적재 후 ~150K~250K 추정). recent endpoint 응답 시간은 `bjd_code` 인덱스 + LIMIT trick이라 영향 미미. `mv_dong_stats`는 명시적으로 직전 3개월 윈도우(SPEC ADR-005)이라 통계 비교 안정성 유지 — 즉 색칠지도 confidence 분류는 변하지 않고 "최근 거래" 깊이만 늘어남.
- **영향**:
  - `etl/fetch_rtms.py` `parse_args(--months)` + `month_tokens(count=args.months)` + 시작 log에 윈도우 명시.
  - 풀 재적재 1회 명령 (Mr. Song 환경, `etl/.env` 로드):
    ```
    ETL_DISABLED=0 \
    DATABASE_URL=$(grep DATABASE_URL etl/.env | cut -d= -f2-) \
    RTMS_KEY=$(grep RTMS_KEY etl/.env | cut -d= -f2-) \
    .venv-etl/bin/python3 etl/fetch_rtms.py --months 24
    ```
  - GHA 정기 cron(`.github/workflows/rtms-etl-daily.yml`)은 인자 없이 호출되니 default 3 그대로 — 풀 재적재 후에도 정기 ETL은 신고지연 보정만 담당.
  - 검증: `tx_apt_trade` GROUP BY YYYY-MM 분포에 24개 월 모두 존재 + recent endpoint offset 0/100/200 모두 200 + 다중 월 그룹 헤더 노출.
  - 회귀 테스트: `etl/tests/test_fetch_rtms.py` `MonthTokensTest`(count=24 24개월 cross-year) + `ParseArgsTest`(default·max·범위 외 reject).

---

## 16. 한 줄 요약

> 색칠은 답이 아니다. **임장 후보 5개로 줄여주는 것**이 답이다.
