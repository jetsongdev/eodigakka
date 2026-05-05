# CHANGELOG

형식: `## [날짜] 제목` → `### 추가 / 변경 / 수정 / 결정`

---

## [2026-05-05] Neon 마이그레이션 적재 통과 (issue #1 후반부)

`bash db/migrate_to_neon.sh` 끝까지 green — bjd 467 / trade 5,456 / rent 14,744 / mv_stats 801, MV refresh 2건 + 인덱스 5건 재생성. GHA Secrets 등록·workflow_dispatch·launchd 정리는 issue #1로 이어진다.

### 수정
- `db/migrate_to_neon.sh` 검증 query를 fully-qualified로 (`public.bjd_polygon` 등). 함정 3(pooler search_path)을 PostGIS 점검에만 적용하고 검증 step에 빠뜨려 import 전부 성공한 뒤 마지막 SELECT만 `relation does not exist` 발생.

### 추가
- TIL `docs/til/2026-05-05-neon-migration-tcc-launchd.md` 함정 5(fix 적용 누락) 섹션 + 적재 결과 표 추가, 진행 상태를 "적재 완료, GHA 후속"으로 갱신.

---

## [2026-05-05] Phase 1 프론트 완성 + e2e 12/12 + 정책 추가

Phase 1 색칠지도 6단계 모두 동작 완료, 회귀 안전망 1차 구축.

### 추가
- **API**: `web/app/api/polygons/route.ts` — `bjd_polygon` 467개 동 GeoJSON FeatureCollection (24h 캐시), Mapbox source용
- **Mapbox 색칠지도** (`web/app/page.tsx`):
  - 서울 zoom 11 light 스타일 + `/api/polygons` source/layer (snapshot 01)
  - `/api/affordable` 결과를 feature-state로 join, `evaluateAffordableDong` 색상 매핑 적용 (snapshot 02)
  - 헤더 컨트롤: 매매·전세 토글 / cash 듀얼 슬라이더(`@radix-ui/react-slider`) + 카세트 6 버튼 + 평형 토글(snapshot 04)
  - 마우스오버 tooltip + 클릭 사이드패널(TOP5 단지 + 최근 거래 10건 + 신구축 혼재 ⚠️) (snapshot 03)
  - 전세 모드 색칠 — 79개 동 통과, 빨강(전세가율 80%+) 시각 노출 (snapshot 05)
- **e2e 회귀**: `web/tests/e2e/{api,map}.spec.ts` 12개 (Codex 작성, 4.2초 green)
  - api 5종(health/polygons/affordable trade·jeonse/invalid size 400)
  - map 7종(헤더/폴리곤 카운트/매매↔전세 토글/cash ±1억·±10억 점프 + 0억 clamp/size 토글/canvas 존재)
- **스냅샷 5장**: `docs/snapshots/01~05/` (각 데스크톱 1920×1080 + 모바일 390×844 + meta.md)
- **til-flow 스킬**: `.claude/skills/til-flow/` — TIL+CHANGELOG+tasks+README 일괄 갱신 워크플로우 자동화
- **snapshot 스킬 갱신**(글로벌): 데스크톱 1920×1080 표준, 한 폴더 여러 장 가이드, 브라우저 maximize 메모

### 결정
- **CLAUDE.md 도구 우선순위**: CLI > MCP (대체 가능 시). e2e/DB/외부 fetch는 CLI, 시각 캡처·자연어 탐색은 MCP.
- **CLAUDE.md 반복 작업 → skill-creator**: 워크플로우 2회 반복 시 자동 스킬화 제안 (til-flow / snapshot이 그 결과물).

### 추가 (의존성·도구)
- `@radix-ui/react-slider` (cash 듀얼 핸들 슬라이더)
- `@playwright/test` + chromium (e2e)
- `mapbox-gl` + `@types/mapbox-gl`

### 확인
- 강북 14구 매매 가격 분포: p99 26억, max 156억(outlier 1건). cash 슬라이더 max는 50억으로 결정 (99%+ cover, 청사진 §3 비목표 강남4구 준수)
- 매매 4~8억 M → 27개 동 통과, 전세 4~8억 M → 79개 동 통과 (Phase 0 bulk pull과 일치)

### Phase 2 task 누적 (총 9건)
1. 슬라이더 드래그 중 비동기 색칠 (debounce + AbortController)
2. 슬라이더/카세트 햅틱 피드백 (Web Vibration API, Android 한정)
3. 모바일 컨트롤·범례 분리 (시야 점유 60%+ 확보)
4. 사이드패널 UI 개선 (분포 차트·매매전세 동시·액션 버튼·bottom sheet)
5. 1인 가구 평형 세분화 (XS<33㎡ 또는 <40㎡)
6. 신축/구축 build_year 필터
7. 복도식/통로식 구분 (외부 데이터 K-apt OpenAPI)
8. 서울 25구 전세 확장 (TARGET_GU=SEOUL_25)
9. 정책대출 체크박스 (신생아·신혼·버팀목)

### 다음 작업
- 사용자: `cp etl/com.chsong.eodigakka-etl.plist ~/Library/LaunchAgents/ && launchctl load ...`로 일일 03:00 ETL 자동 실행 켜기
- 사용자: 임장 1회 (청사진 9원리 Apply 게이트)

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

---

## [2026-05-05] ETL 자동화 래퍼 + launchd plist

### 추가
- `etl/run_etl.sh` — `.env` 로드 + `logs/etl-YYYYMMDD.log` 출력 + venv python 직접 호출. cron/launchd 양쪽 호환. `set -euo pipefail`로 중간 실패 캐치.
- `etl/com.chsong.eodigakka-etl.plist` — launchd 매일 03:00 실행 schedule. `RunAtLoad=false` (load 시점에 즉시 실행 막음).
- `.gitignore`에 `logs/` 추가.

### 확인
- 래퍼 스모크 테스트: 38초, exit 0, `trade_rows_seen=5476 / rent_rows_seen=15432` 정상 적재.

### 다음 작업
- 사용자가 `cp ... ~/LaunchAgents/` + `launchctl load ...`로 plist 등록.
- Mapbox 색칠지도 (Phase 1 마지막 산출물).

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
