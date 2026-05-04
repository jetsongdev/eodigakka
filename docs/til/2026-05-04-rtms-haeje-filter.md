# TIL: PublicDataReader translate=True와 해제여부 필터 역전 버그

날짜: 2026-05-04

## 현상

`fetch_rtms.py`에서 `trade_rows_seen=0`. 전세(rent)는 3,806건 정상 적재됐는데 매매(trade)만 0건.

## 원인

PublicDataReader `api.get_data(translate=True)` 호출 시, `해제여부` 컬럼 값이 다음과 같이 동작한다:

| 거래 상태 | 원시값 | translate=True 후 |
|---|---|---|
| 정상 거래 | `NaN` / 빈 문자열 | `"nan"` 또는 `"O"` 와 **다른** 문자열 |
| 취소 계약 | `"O"` | `"O"` |

기존 필터는 `normalize_text(value) is None`으로 None/NaN만 통과시켰다.  
그런데 `translate=True`가 적용되면 정상 거래의 `NaN`이 문자열 `"nan"`으로 바뀌어  
`normalize_text("nan")` → `"nan"` (not None) → 전부 필터 아웃.

전세에 `해제여부` 컬럼 자체가 없어서 rent는 정상이었고, trade만 피해.

## 수정

```python
# Before (broken with translate=True)
active = df["해제여부"].apply(lambda value: normalize_text(value) is None)

# After
active = df["해제여부"].apply(lambda value: str(value).strip().upper() != "O")
```

취소 계약은 `"O"` 여부로만 판단. None/NaN/빈 문자열/번역 부산물 모두 정상 거래로 통과.

## 교훈

- `translate=True`는 컬럼 이름뿐 아니라 **값도 변환**한다 (NaN → 문자열화 가능).
- API 라이브러리 wrapper 쓸 때는 None/NaN 체크 대신 **도메인 값 명시 체크**가 안전.
- rent와 trade의 증상 차이(0건 vs 3,806건)가 `해제여부` 컬럼 유무 단서였음.
