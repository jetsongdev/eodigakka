# CHANGELOG

형식: `## [날짜] 제목` → `### 추가 / 변경 / 수정 / 결정`

---

## [2026-05-04] ETL trade_rows_seen=0 버그 수정

### 수정
- `etl/fetch_rtms.py` `filter_cancelled` — `해제여부` 필터 로직 수정
  - 원인: `translate=True` 시 NaN이 문자열 `"nan"`으로 변환돼 정상 거래가 전부 필터 아웃
  - 수정: `normalize_text(v) is None` → `str(v).strip().upper() != "O"` (취소 계약은 `"O"` 명시 체크)
- `etl/tests/test_fetch_rtms.py` — 회귀 테스트 추가

### 추가
- `til/2026-05-04-rtms-haeje-filter.md` — 원인·수정·교훈 기록

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
