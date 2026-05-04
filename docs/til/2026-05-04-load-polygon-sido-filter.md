# TIL: HangJeongDong GeoJSON 서울 필터 (`startswith("11")` 함정)

날짜: 2026-05-04

## 현상

`db/load_polygon.py`로 HangJeongDong_ver20260401.geojson 로드:

```python
gdf[bjd_col] = gdf[bjd_col].astype(str).str.zfill(10)
gdf = gdf[gdf[bjd_col].str.startswith("11")].copy()
```

→ "서울 필터 후: 0행"

## 원인

HangJeongDong GeoJSON에는 여러 코드 필드가 있다:

| 필드 | 의미 | 길이 | 예시 |
|---|---|---|---|
| `adm_cd` | 행정동 8자리 코드 | 8 | `11010530` |
| `adm_cd2` | 행정동 10자리 코드 | 10 | `1111053000` |
| `sido` | 시도 2자리 코드 | 2 | `"11"` (문자열) |
| `sidonm` | 시도 이름 | - | `"서울특별시"` |
| `sgg` | 시군구 5자리 | 5 | `"11110"` |
| `sggnm` | 시군구 이름 | - | `"종로구"` |

`detect_bjd_code_column`이 `adm_cd`(8자리)를 골랐다. 그걸 `zfill(10)`하면 `0011010530`이 돼서 `startswith("11")`이 false.

## 수정

1. 코드 컬럼 우선순위에서 `adm_cd2`(10자리)를 1순위로:
   ```python
   candidates = ["adm_cd2", "BJD_CODE", "PNU", ...]
   ```
2. 서울 필터는 `adm_cd2`의 prefix 대신 `sido` 컬럼 직접 비교:
   ```python
   if "sido" in gdf.columns:
       gdf = gdf[gdf["sido"] == "11"].copy()
   ```

→ 서울 427개 동 정상 로드.

## 교훈

- 외부 GeoJSON/Shapefile은 컬럼 스키마가 파일마다 다르다. 자동 탐지 로직 만들 때 후보 우선순위 신중히.
- `zfill` 같은 정규화는 의미 있는 길이의 코드에만. 8자리 코드를 10자리로 패딩하면 의미가 깨짐.
- 가능하면 의도가 명시된 필드(`sido`, `sidonm`)를 prefix 매칭보다 우선.
