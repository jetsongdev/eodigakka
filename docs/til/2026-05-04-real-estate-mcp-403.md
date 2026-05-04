# TIL: real-estate-mcp 403 → Dev 엔드포인트 패치

날짜: 2026-05-04

## 현상

`tae0y/real-estate-mcp`를 클론해 Claude Code MCP로 등록했는데, RTMS API 호출 시 모두 403 Forbidden.

```
HTTP 403 Forbidden — 인증 키가 유효하지 않거나 신청한 서비스가 아닙니다.
```

직접 PublicDataReader로 호출하면 200 OK. 같은 키인데 MCP에서만 실패.

## 원인

data.go.kr RTMS API에는 두 가지 엔드포인트가 있다:

| 구분 | URL | 키 승인 |
|---|---|---|
| 운영 (Prod) | `RTMSDataSvcAptTrade` | 별도 신청·심사 필요 |
| 개발 (Dev) | `RTMSDataSvcAptTradeDev` | 자동 승인, 일일 1만건 |

`tae0y/real-estate-mcp`의 `_helpers.py`는 운영 엔드포인트(`RTMSDataSvcAptTrade`)를 하드코딩하고 있었다. 우리 키는 Dev만 승인된 상태라 403.

## 수정

`real-estate-mcp/src/real_estate/mcp_server/_helpers.py` 패치:

```python
# Before
_APT_TRADE_URL = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
_APT_RENT_URL  = "http://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"

# After
_APT_TRADE_URL = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
_APT_RENT_URL  = "http://apis.data.go.kr/1613000/RTMSDataSvcAptRentDev/getRTMSDataSvcAptRentDev"
```

ADR-007로 SPEC에 기록.

## 교훈

- 공공데이터포털 API는 같은 데이터셋도 운영/개발 엔드포인트가 분리돼 있고 키 승인 범위가 다르다.
- 3rd-party MCP/라이브러리 사용 시 엔드포인트가 키 승인 범위와 맞는지 먼저 확인.
- 장기적으로는 fork 떠서 PR 보내거나 환경변수로 엔드포인트 선택 가능하게 하는 게 맞다.
