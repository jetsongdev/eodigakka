# TIL: Python 3.14 `pyexpat` 크래시 → Python 3.12 venv

날짜: 2026-05-04

## 현상

macOS 26.x (Tahoe) 환경에서 Python 3.14 글로벌로 설치돼 있음.  
ETL용 `pip install PublicDataReader` 시도 → 패키지 설치 중 `pyexpat` 모듈 import 단계에서 segfault.

```
Fatal Python error: Segmentation fault
Current thread 0x... (most recent call first):
  File ".../xml/parsers/expat.py", line 4, in <module>
```

## 원인

Python 3.14가 macOS 26 시스템 라이브러리(`libexpat`)와 ABI 충돌. PublicDataReader 의존성 트리에 XML 파싱이 있어 import 시점에 터짐.

## 수정

`uv`로 Python 3.12 격리 venv 생성 후 사용:

```bash
cd /Users/chsong/Documents/sidespace/projects/eodigakka
uv venv --python 3.12 .venv-etl
.venv-etl/bin/pip install PublicDataReader psycopg2-binary python-dotenv geopandas pyproj
```

ETL 실행도 글로벌 python이 아닌 venv 직접 호출:

```bash
.venv-etl/bin/python3 etl/fetch_rtms.py
```

## 교훈

- 최신 Python(특히 3.14 같은 .0 release)을 시스템에 깔면 ABI 충돌 자주 발생.
- 데이터/ETL 워크로드는 Python 3.11~3.12 LTS-ish 버전이 안전.
- `uv`의 `--python` 플래그로 버전 고정한 격리 venv 만드는 게 표준 워크플로우.
