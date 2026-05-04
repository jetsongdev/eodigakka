# CHANGELOG

형식: `## [날짜] 제목` → `### 추가 / 변경 / 수정 / 결정`

---

## [2026-05-05] ADR-008 실행 — bjd_polygon 법정동 마이그레이션 완료

### 결정
- ADR-008(법정동 폴리곤 채택) 실행 단계 완료. SPEC 변경 없음.

### 추가
- `db/load_polygon.py` `detect_shapefile_encoding()` — `.cpg`/`.cst` 사이드카에서 인코딩 자동 추출 (V-World는 EUC-KR을 `.cst`에 둠)
- `db/load_polygon.py` `pad_bjd_code_to_10()` — 8자리 `EMD_CD`(시도2+시군구3+읍면동3) → 10자리 법정동 코드 (끝에 "리" 자리 "00")
- `docs/til/2026-05-05-lsmd-shapefile-pitfalls.md` — V-World LSMD 함정 3종 정리

### 변경
- `db/load_polygon.py` `load_file()`: 인코딩 자동 감지 + 패딩 함수 적용
- `bjd_polygon` 데이터: HangJeongDong 행정동 427개 → LSMD UMD 법정동 467개 (TRUNCATE 후 재적재)
- `tx_apt_rent`: TRUNCATE 후 ETL 재실행 → 행정동 코드(잘못된 fallback) 데이터 제거, 법정동 코드로 재적재 (15,432건)

### 확인
- 다운로드 파일 사이즈로 데이터셋 검증 (`LSMD_CONT_LDREG` 200MB 필지 단위 → 잘못, `LSMD_ADM_SECT_UMD` 2.4MB 동 단위 → 정답)
- `mv_dong_stats × bjd_polygon` JOIN 100%: TRADE 390/390, JEONSE 411/411
- SQL 검증: 강북 14구 M형 4~8억 high confidence 동 정상 노출 — 방학동(5.0억), 쌍문동(5.4억), 도봉동(5.95억) 등 Phase 0 bulk pull 결과와 일치

### 다음 작업
- API `/api/affordable` 라이브 재검증 (dev 서버 재기동 후)
- cron 설정 (Mac M4 Pro, `0 3 * * *`)

---

## [2026-05-04] Phase 1 ETL 검증 + API smoke + 도메인 함정 발견

### 결정 (ADR)
- ADR-008: bjd_polygon 행정동→법정동 코드 체계 마이그레이션 (LSMD 법정동경계 shapefile 채택)

### 수정
- `etl/fetch_rtms.py` `filter_cancelled` — `해제여부` 필터 로직 수정
  - 원인: `translate=True` 시 NaN이 문자열 `"nan"`으로 변환돼 정상 거래가 전부 필터 아웃
  - 수정: `normalize_text(v) is None` → `str(v).strip().upper() != "O"` (취소 계약은 `"O"` 명시 체크)
- `etl/fetch_rtms.py` `refresh_materialized_views` — 별도 autocommit 커넥션으로 분리 (`CONCURRENTLY`는 트랜잭션 밖에서만 실행 가능)

### 추가
- `etl/tests/test_fetch_rtms.py` — 회귀 테스트 (`filter_cancelled` 정상 거래 보존)
- `docs/til/` — Phase 0~1 시행착오 9개 + README 인덱스
  - real-estate-mcp 403 / claude mcp add 문법 / Python 3.14 pyexpat / uv run 빌드 회피
  - REFRESH MV autocommit / views.sql 적용 순서 / GeoJSON sido 필터 / 해제여부 역전 / 행정동 vs 법정동
- `CLAUDE.md` — Claude Code 작업 규약 (`/init` 양식: 명령어·아키텍처·도메인 함정·TIL 강제 규칙)
- `web/.env.local` — DATABASE_URL (gitignore)
- `web/next-env.d.ts`, `web/tsconfig.json`, `web/package-lock.json` — Next.js 16 초기화

### 확인 (실데이터)
- ETL 1회 정상 실행: `trade_rows_seen=5476`, `rent_rows_seen=3977`
- `/api/health`: `etl_last_succeeded_at`, raw count, MV 신선도 정상 응답
- `/api/affordable?mode=trade&cash_min=40000&cash_max=80000&size=M`: `dongs:[]` ← 빈 결과
  - 원인: `mv_dong_stats(TRADE)` × `bjd_polygon` JOIN 0건 (행정동/법정동 코드 불일치)
  - JEONSE는 137건 매칭 (법정동읍면동코드 부재로 동 이름 fallback → 행정동 코드 → JOIN 성공)

### 진행 중 블로커
- bjd_polygon이 행정동(`adm_cd2 = 1138051000`) 기준이라 매매 ETL의 법정동(`1138010300`)과 매칭 불가
- 해결안: LSMD_CONT_LDREG_11 (서울 법정동경계 shapefile, EPSG:5179→4326) 다운로드 + 재적재 (ADR-008)

---

## [2026-05-04] Phase 0 — 데이터 검증 및 설계 확정

### 결정 (ADR)
- ADR-001: 서울 25구 코드 중복 제거 → `GANGBUK_14` / `GANGNAM_11` / `SEOUL_25` 분리
- ADR-002: `mv_dong_stats` UNION ALL 컬럼명 중립화 (`median_man / p25_man / p75_man`)
- ADR-003: 전세가율 80% 컷오프 출처 명시 (HUG 보증약관 2024년판)
- ADR-004: real-estate-mcp Phase 0 fallback 정책 (MCP 검증 우선, PDR CLI fallback)
- ADR-005: `tx_count_3m` 하드코딩 폐기 → `confidence=high/low/insufficient` 동적 산정
- ADR-006: `median_build_year` / `build_year_stddev` MV 추가, 신구축 혼재 tooltip
- ADR-007: real-estate-mcp Dev 엔드포인트 패치 (RTMSDataSvcAptTradeDev/RentDev)

### 추가
- `.mcp.json` — real-estate-mcp Claude Code 연결 설정
- `.venv-etl/` — Python 3.12 ETL 테스트용 venv (PublicDataReader 설치 완료)
- `real-estate-mcp/` — tae0y/real-estate-mcp 클론 (Dev 엔드포인트 패치 적용)

### 변경
- `SPEC.md` §9.1 — ETL GU 코드 목록 정오 및 `TARGET_GU = GANGBUK_14` 적용
- `SPEC.md` §5.2 — `mv_dong_stats`에 `confidence`, `median_build_year`, `build_year_stddev` 추가
- `SPEC.md` §6.1/6.2 — 필터 룰 `confidence != 'insufficient'` 기반으로 재정의
- `SPEC.md` §6.4 — 색상 매핑 low-confidence(투명 50%), 신구축 혼재 tooltip 추가
- `SPEC.md` §15 — ADR 섹션 신설 (ADR-001~007)

### 확인 (실데이터)
- 강북구(11305) 2026-04 매매 92건 조회 성공 (PublicDataReader + real-estate-mcp MCP)
- 4~8억 자금 범위: 56건/92건 (61%)
- 신구축 소형(꿈의숲해링턴플레이스 59㎡) 중위 8.7억 > 구축 대형(벽산라이브파크 114㎡) 7.2억 확인
- real-estate-mcp 403 원인: Dev vs 프로덕션 엔드포인트 키 분리. Dev 패치로 해결.

### 확인 (강북 14구 bulk pull — 동별 표본 희소 지도)
- 총 거래 집계: 3개월(2026-02~04) × 14구 매매 전수
- confidence 분포 (동×평형 417개 조합): high 183개(44%) / low 130개(31%) / insufficient 104개(25%)
- 구별 거래량: 노원 2,186건(28%) ← 압도적. 종로 156건·광진 210건·용산 211건 ← 희소
- M형 4~8억 high confidence 통과 동: 21개
  - 저가: 도봉 방학(5.2억)·쌍문(5.4억), 강북 수유(5.5억)
  - 고가 경계: 중랑 중화동(8.0억), 종로 창신동(7.9억)
- 분산 가드(IQR <1.5) 탈락 후보: 서대문 홍은동(1.61), 중랑 면목동(1.56) → §6.4 노랑 처리 확인
- 임장 우선순위 낮은 구(희소): 종로·용산·광진 — Phase 1 검증에서 회색 비중 높을 것

### 추가
- `CHANGELOG.md` — 변경 이력 관리 시작
- `tasks.md` — Phase별 TODO 관리
- `.gitignore` — .env, venv 제외
- GitHub private 레포: jetsongdev/eodigakka
