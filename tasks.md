# tasks.md

상태: `[ ]` 대기 | `[~]` 진행 중 | `[x]` 완료 | `[-]` 취소/불필요

SPEC.md가 single source of truth. 여기선 실행 단위만 관리.

---

## Phase 0 — 데이터 검증 (2026-05-04 완료 ✓)

- [x] RTMS API 키 발급·승인 (data.go.kr)
- [x] real-estate-mcp 클론 + Claude Code MCP 연결 (`claude mcp add`)
- [x] Dev 엔드포인트 패치 (`_helpers.py`, ADR-007)
- [x] 강북구 2026-04 매매 92건 실데이터 확인
- [x] 필터 룰 손 시뮬 (4~8억 61% 적중)
- [x] 신구축 혼재 문제 발견 → SPEC ADR-006 반영
- [x] 강북 14구 × 3개월 bulk pull → 동별 표본 희소 지도 확인
  - confidence 분포: high 44% / low 31% / insufficient 25%
  - M형 4~8억 high confidence 통과: 21개 동
  - 거래 희소 구 확인: 종로(156건), 광진(210건), 용산(211건)
  - 분산 가드 탈락 후보: 홍은동(IQR 1.61), 면목동(IQR 1.56)
- [x] ADR-001~007 SPEC 반영
- [x] CHANGELOG.md / tasks.md / SPEC.md 최신화
- [x] git init + GitHub private 레포 생성·푸시 (jetsongdev/eodigakka)

---

## Phase 1 — 강북 14구 매매 + 전세 ETL → 색칠지도 1장

### DB 셋업
- [x] docker-compose.yml 작성 (postgres 16 + postgis)
- [x] `db/schema.sql` 작성 (§5.1 raw 테이블, ADR-002 컬럼명 반영)
- [x] `db/views.sql` 작성 (§5.2 mv_dong_stats, §5.3 mv_jeonse_ratio, ADR-005/006 반영)
- [x] 법정동 GeoJSON 로드 (`db/load_polygon.py`) — 427개 동 적재 완료

### ETL
- [x] `etl/pyproject.toml` 작성 (PublicDataReader, psycopg2-binary, python-dotenv)
- [x] `etl/fetch_rtms.py` 작성 (§9.1 기준, GANGBUK_14, kill switch 포함)
- [x] `filter_cancelled` 버그 수정 — translate=True 시 NaN→"nan" 문제 (TIL)
- [x] ETL 1회 수동 실행 → `tx_apt_trade` row count 확인 (trade 5,476건 / rent 3,977건)
- [x] **법정동 폴리곤 재적재** (ADR-008, TIL `2026-05-04-bjd-code-…` + `2026-05-05-lsmd-shapefile-pitfalls`)
  - [x] V-World에서 `LSMD_ADM_SECT_UMD_11` (서울 법정동 467개) 다운로드 — 처음에 `LSMD_CONT_LDREG`(필지) 잘못 받음
  - [x] `db/load_polygon.py` 인코딩 자동 감지(`.cst` EUC-KR) + `EMD_CD` 8→10자리 패딩 추가
  - [x] `bjd_polygon` TRUNCATE 후 467개 법정동 적재 완료
  - [x] `tx_apt_rent` TRUNCATE 후 ETL 재실행 — 15,432건 법정동 코드로 재적재
  - [x] `REFRESH MATERIALIZED VIEW mv_dong_stats / mv_jeonse_ratio` (TRADE 390/390, JEONSE 411/411 매칭)
  - [x] SQL 검증 — 강북 14구 M형 4~8억 high confidence 동 정상 노출
  - [ ] `/api/affordable` 라이브 재검증 (dev 서버 재기동 후)
- [~] cron 설정 (Mac M4 Pro, `0 3 * * *`)
  - [x] `etl/run_etl.sh` 래퍼 작성 (.env 로드 + 로그 디렉토리 + venv python 직접 호출)
  - [x] `etl/com.chsong.eodigakka-etl.plist` 작성 (launchd, RunAtLoad=false)
  - [x] 스모크 테스트 통과 (`logs/etl-YYYYMMDD.log` exit 0)
  - [ ] **사용자**: `cp etl/com.chsong.eodigakka-etl.plist ~/Library/LaunchAgents/` + `launchctl load ~/Library/LaunchAgents/com.chsong.eodigakka-etl.plist`
  - [ ] 등록 확인: `launchctl list | grep eodigakka`

### API
- [x] `web/` Next.js 16 프로젝트 초기화 (Kysely 포함, npm install 완료)
- [x] `GET /api/affordable` 구현 (§7 기준, confidence 컬럼 활용)
- [x] `GET /api/dong/:bjd/complexes` 구현
- [x] `GET /api/health` 구현 (kill switch 상태 노출, smoke test 통과)
- [x] `web/.env.local` DATABASE_URL 설정 + dev 서버(3002) 기동 확인
- [~] `/api/affordable` 빈 결과 — bjd_code 불일치 해결 후 재검증 필요

### 프론트
- [x] `GET /api/polygons` 작성 (`bjd_polygon` → GeoJSON FeatureCollection, 24h 캐시)
- [x] **사용자**: Mapbox 토큰 발급 (Individual tier) → `web/.env.local`에 `NEXT_PUBLIC_MAPBOX_TOKEN=pk....`
- [x] Mapbox GL JS 세팅 (서울 zoom 11) + 폴리곤 source/layer (snapshot 01)
- [x] 동 폴리곤 색칠 (§6.4 색상 매핑, `/api/affordable` 결과를 feature-state로 join, snapshot 02)
- [x] 헤더 컨트롤 (모드 토글, 자금 셀렉터 cash_min/max, 평형 S/M/L/all 토글, 쿼리 변경 시 자동 재호출)
- [x] 마우스오버 tooltip (동 이름 + 중위 + tx_count + confidence + 미통과 안내)
- [x] 클릭 → 사이드패널 (Evidence + 모드별 TOP5 단지 + 최근 거래 10건 표 + 신구축 혼재 ⚠️)

### 검증
- [ ] 색칠지도 열고 "예상한 동이 초록인가" 눈으로 확인
- [ ] 수유동(저거래)이 회색 또는 low-confidence 투명으로 나오는지 확인
- [ ] 꿈의숲해링턴플레이스(고가 소형)가 S버킷에서 8억 초과로 비표시인지 확인
- [ ] Kill switch `ETL_DISABLED=1` 동작 확인
- [ ] **임장 1회** → Phase 2 진입 여부 재평가

---

## Phase 2 — 서울 25구 전세, 전세가율 가드, 사이드패널 강화 (대기)

- [ ] ETL `TARGET_GU = SEOUL_25` 확장
- [ ] `mv_jeonse_ratio` 활성화 (ADR-002 컬럼명 기준)
- [ ] 전세 모드 색칠 (빨강: 전세가율 80%+, ADR-003 레이블)
- [ ] 정책대출 체크박스 (신생아·신혼·버팀목, §6.3)
- [ ] **평형 size_bucket 세분화 — 1인 가구 케이스 분류** (현재 S=`<60㎡`가 너무 광범위, 18~33㎡ 도시형생활주택/소형 오피스텔과 33~60㎡ 신혼·1.5인 케이스 혼재)
  - [ ] 신규 ADR: 평형 분류 기준 — `XS: <33㎡` (1인) / `S: 33~60` (1~1.5인) / `M: 60~85` / `L: 85+` 또는 부동산 관행에 맞춰 `XS: <40` / `S: 40~60` 검토
  - [ ] `db/views.sql` `mv_dong_stats` size_bucket CASE 분기에 XS 추가 + REFRESH
  - [ ] `web/lib/filter.ts` `SizeBucket` 타입 + `parseAffordableQuery` 검증에 XS 추가
  - [ ] `web/app/api/affordable/route.ts` size 파라미터 검증 갱신
  - [ ] `web/app/page.tsx` size 토글에 XS 버튼 추가 (`['XS','S','M','L','all']`)
  - [ ] 검증: 강북 14구 1인 가구용 신축 도시형생활주택(예: 신논현·왕십리 같은 곳에 있는 33㎡ 매물)이 XS 버킷에 매핑되는지 SQL 확인
- [ ] "Claude로 더 보기" 버튼 → real-estate-mcp 자연어 쿼리 복사

---

## Phase 3 — 수도권 확장 (경기도) — Phase 2 후 재평가

서울만으로 후보가 부족하면 경기도 인접 시 확장. SPEC §3 비목표(`경기도`)는 **Phase 2 이후**라는 보류 표현이지 영구 제외 아님.

### 데이터·DB
- [ ] V-World `LSMD_ADM_SECT_UMD` 시도 코드 다른 zip 다운로드
  - 인천(28), 경기(41) 우선. 충남 세종 등은 추후
  - 파일명 예시: `LSMD_ADM_SECT_UMD_경기.zip` (3MB 내외)
- [ ] `db/load_polygon.py --truncate` 없이 추가 적재 (서울 467 + 경기 N개 합쳐서 보존)
  - `--sido` 인자 동적화 또는 자동 감지 (현재 "서울특별시" 하드코딩)
- [ ] ETL `TARGET_GU` 확장: GANGBUK_14 → 경기 인접 시 (광명·과천·하남·구리·고양·부천 등). 우선순위는 강북 14구와 통근 가능한 1시간권
  - 시군구 코드 새로 정의: `GYEONGGI_NEAR_SEOUL = ["41210"(광명), "41290"(과천), "41450"(하남), …]`
- [ ] RTMS Dev 엔드포인트 일일 호출 한도(10,000건) 재산정 — 서울 14구 + 경기 N구 × 3개월 × 매매·전세

### 도메인 함정 미리 메모
- 경기도 일부 시군은 행정구역 개편이 있어서 LSMD 갱신주기(분기) 영향 큼
- 부천·성남·안산 같은 광역시 산하 구가 있는 시는 시군구코드 5자리 vs 6자리 혼재 케이스 점검
- "동" 명칭 중복(예: 신촌동 — 서울 마포구 vs 경기 의왕시) → bjd_code로만 join, 이름 lookup 절대 사용 금지

### UI
- [ ] Mapbox 초기 zoom·center를 서울 + 인접 경기 포괄로 변경 (현재 zoom 11 → 10 정도)
- [ ] 사이드패널에 시군구 명시 (서울/경기 시각 구분)

### 트리거 조건
- Phase 1 임장 1회 후 "강북 14구 후보 부족" 판단 시
- 또는 "직장 위치가 서울이 아닌 경기 남부" 같은 사용자 상황 변화

---

## Phase 4 — 외곽 매매 추가 + 자체 MCP tool (선택)

- [ ] 외곽 매매 (강원·충청·전라 일부 — 가족 거주 등 비통근 케이스)
- [ ] 자체 MCP tool `find_affordable_dongs` (real-estate-mcp 의존 줄이기)
