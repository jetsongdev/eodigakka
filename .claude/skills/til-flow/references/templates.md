# til-flow 양식 풀 예시

`SKILL.md`에서 참조. 4문서 갱신 양식 그대로 복붙해 쓰는 템플릿.

---

## 1. TIL 본문 (`docs/til/YYYY-MM-DD-키워드.md`)

```markdown
# TIL: PublicDataReader translate=True와 해제여부 필터 역전 버그

날짜: 2026-05-04

## 현상

`fetch_rtms.py`에서 `trade_rows_seen=0`. 전세는 3,977건 정상 적재됐는데 매매만 0건.

## 원인

`api.get_data(translate=True)` 호출 시 `해제여부` 컬럼 값이 다음과 같이 동작:

| 거래 상태 | 원시값 | translate=True 후 |
|---|---|---|
| 정상 거래 | `NaN` / 빈 문자열 | `"nan"` 등 None과 다른 문자열 |
| 취소 계약 | `"O"` | `"O"` |

기존 필터는 `normalize_text(value) is None`으로 None/NaN만 통과시키려 했는데
`translate=True`가 `NaN`을 문자열 `"nan"`으로 바꾸어 정상 거래가 전부 필터 아웃됨.

## 수정

```python
# Before (broken with translate=True)
active = df["해제여부"].apply(lambda v: normalize_text(v) is None)

# After
active = df["해제여부"].apply(lambda v: str(v).strip().upper() != "O")
```

취소 계약은 `"O"` 여부로만 판단. None/NaN/빈 문자열/번역 부산물 모두 정상 거래로 통과.

## 교훈

- `translate=True`는 컬럼 이름뿐 아니라 값도 변환한다 (NaN → 문자열화 가능).
- API 라이브러리 wrapper 쓸 때는 None/NaN 체크 대신 도메인 값 명시 체크가 안전.
```

핵심:
- "## 원인"에 표·코드 비교 적극 활용
- "## 수정"에 변경 전/후 diff
- "## 교훈"은 구체적 일반화 룰 ("조심하자" 같은 모호한 문장 금지)

---

## 2. CHANGELOG 항목

```markdown
## [2026-05-04] ETL trade_rows_seen=0 버그 수정

### 수정
- `etl/fetch_rtms.py` `filter_cancelled` — `해제여부` 필터 로직 수정
  - 원인: `translate=True` 시 NaN이 문자열 `"nan"`으로 변환돼 정상 거래가 전부 필터 아웃
  - 수정: `normalize_text(v) is None` → `str(v).strip().upper() != "O"`
- `etl/tests/test_fetch_rtms.py` — 회귀 테스트 추가

### 추가
- `docs/til/2026-05-04-rtms-haeje-filter.md` — 원인·교훈 기록
```

ADR이 추가된 경우:

```markdown
### 결정 (ADR)
- ADR-N: <한 줄 결정>

### 수정
...
```

---

## 3. tasks.md 갱신

```markdown
- [x] `filter_cancelled` 버그 수정 — translate=True 시 NaN→"nan" 문제 (TIL)
- [x] ETL 1회 수동 실행 → `tx_apt_trade` row count 확인 (trade 5,476건 / rent 3,977건)
```

새 블로커 발견 시:

```markdown
- [ ] **법정동 폴리곤 재적재** (ADR-008, TIL `bjd-code-haengjeong-vs-beopjeong`)
  - [ ] NSDI에서 `LSMD_CONT_LDREG_11` shapefile 다운로드
  - [ ] `db/load_polygon.py`에 EPSG:5179→4326 변환 분기 추가
  - [ ] `bjd_polygon` TRUNCATE 후 재적재
```

---

## 4. docs/til/README.md 인덱스

기존 카테고리 아래 한 줄 추가. 새 날짜면 섹션부터 만들기.

```markdown
## 2026-05-04 (Phase 0~1)

### ETL
- [PublicDataReader `translate=True`와 해제여부 필터 역전](2026-05-04-rtms-haeje-filter.md)
- [Python 3.14 `pyexpat` 크래시 → 3.12 venv](2026-05-04-python314-pyexpat.md)

### DB
- [행정동 vs 법정동 코드 불일치 → JOIN 0건](2026-05-04-bjd-code-haengjeong-vs-beopjeong.md)
```

---

## 5. SPEC.md ADR (조건부)

```markdown
### ADR-008: bjd_polygon 법정동 체계로 마이그레이션 (2026-05-04)
- **결정**: `bjd_polygon`을 HangJeongDong GeoJSON(행정동) 기준에서 NSDI `LSMD_CONT_LDREG_11`(서울 법정동경계 shapefile, EPSG:5179→4326 변환) 기준으로 재적재.
- **근거**: RTMS API는 법정동 코드만 제공. HangJeongDong은 행정동 코드(`adm_cd2 = 1138051000`)라 JOIN 0건. 1법정동=다행정동 케이스에서 데이터 손실·임의 매핑 발생. 부동산 도메인 표준은 법정동.
- **영향**:
  - `db/load_polygon.py`에 LSMD shapefile 분기 추가 (EPSG:5179→4326).
  - `bjd_polygon` 재적재 후 MV REFRESH 필요.
  - ETL `apply_bjd_fallback`은 그대로 — 법정동 코드끼리 매칭되므로.
```

ADR 추가 트리거:
- 코드 체계 변경 (행정동→법정동 같은)
- 의존성 교체 (HangJeongDong→LSMD)
- 도메인 모델 마이그레이션
- 컷오프·임계값의 출처 명시

ADR 불필요:
- 단순 버그 수정
- 함수 시그니처 조정
- 회귀 테스트 추가
