# TIL: 행정동 vs 법정동 코드 불일치 → JOIN 0건

날짜: 2026-05-04

## 현상

ETL 성공 (trade 5,476건 / rent 3,977건). 그런데 `/api/affordable` 호출하면 `dongs: []` 빈 결과.

직접 쿼리해보니:

```sql
SELECT COUNT(*) FROM mv_dong_stats s
JOIN bjd_polygon p ON p.bjd_code = s.bjd_code
WHERE s.mode = 'TRADE';
-- count: 0
```

JEONSE는 137건 매칭, TRADE만 0건.

## 원인

bjd_code 체계가 둘이다:

| 종류 | 예시 (은평구 녹번동) | 출처 |
|---|---|---|
| **법정동** 코드 | `1138010300` | RTMS 매매 API (`법정동시군구코드` + `법정동읍면동코드`) |
| **행정동** 코드 | `1138051000` | HangJeongDong GeoJSON (`adm_cd2`) |

매매(trade) 데이터:
- ETL의 `build_bjd_code_from_columns`가 RTMS의 `법정동시군구코드` + `법정동읍면동코드`를 그대로 합쳐서 **법정동 코드** 생성
- → `tx_apt_trade.bjd_code = '1138010300'`

전세(rent) 데이터:
- RTMS 전월세 API에는 `법정동읍면동코드`가 없음 → `build_bjd_code_from_columns`가 None 반환
- fallback으로 `(법정동시군구코드, 법정동 이름)` → `bjd_polygon` lookup → **행정동 코드** 반환
- → `tx_apt_rent.bjd_code = '1138051000'`

`bjd_polygon`은 행정동 코드만 있으므로 매매와 JOIN 0건.

## 수정

**ADR-008 채택: 법정동 폴리곤 재적재** (옵션 B)

국가공간정보포털 `LSMD_CONT_LDREG_11` (서울 법정동경계 shapefile, EPSG:5179) 다운로드 후 EPSG:4326 변환 → `bjd_polygon` 재적재. RTMS 코드 체계와 일치, 데이터 손실 없음.

옵션 A(ETL 동 이름 lookup 강제)는 1법정동=다행정동 케이스(`불광동` → `불광1동/2동`)에서 데이터 손실 또는 임의 매핑 발생. 부동산 도메인 표준이 법정동인데 행정동에 강제 매핑하면 도메인-데이터 불일치.

## 교훈

- "동" 단위 데이터 다룰 때 **법정동/행정동** 어느 쪽인지 항상 명시. 한국 행정 시스템에서 두 체계가 공존하고 코드 끝자리 패턴이 다름:
  - 법정동: 시군구 5자리 + `1xxxx` 패턴 (예: `10300`, `10700`)
  - 행정동: 시군구 5자리 + `5xxxx` 패턴 (예: `51000`, `52000`)
- RTMS API는 법정동 기준. 부동산 데이터는 거의 다 법정동.
- 행정동 GeoJSON(HangJeongDong)은 인구·선거·생활인구 같은 통계용. 부동산엔 부적합.
- 외부 데이터 가져올 때 샘플 1~2건 직접 비교(JOIN 또는 EXISTS)로 키 매칭 검증을 PR 머지 전에 반드시.

## 참고

- [국가공간정보포털 법정동경계](https://www.nsdi.go.kr/) (LSMD_CONT_LDREG)
- 법정동 vs 행정동 차이: 법정동은 토지대장 기준 변하지 않는 공간 단위, 행정동은 동주민센터 단위로 인구 변화에 따라 통폐합·신설.
