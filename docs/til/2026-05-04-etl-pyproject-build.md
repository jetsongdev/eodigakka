# TIL: `uv run`이 ETL을 패키지로 빌드하려다 실패

날짜: 2026-05-04

## 현상

```bash
cd etl && uv run python fetch_rtms.py
```

→ `Building eodigakka-etl @ file:///.../etl ...` 단계에서 빌드 실패.

`pyproject.toml`이 있으니 uv가 ETL 디렉토리를 패키지로 인식하고 빌드 시도. 하지만 실제로는 단일 스크립트 실행만 필요했음.

## 원인

`etl/pyproject.toml`이 의존성 명시용으로만 작성됐는데, `uv run`은 기본적으로 현재 프로젝트를 editable install로 빌드한다.

## 수정

빌드 단계 우회하고 venv 인터프리터 직접 실행:

```bash
.venv-etl/bin/python3 etl/fetch_rtms.py
```

또는 `uv run --no-project` 옵션 사용 가능 (의존성 다른 곳에서 관리할 때).

## 교훈

- `pyproject.toml` 있는 디렉토리에서 `uv run`은 패키지 빌드 트리거.
- ETL 스크립트는 `[build-system]`을 안 쓰는 의존성 매니페스트로 두거나, `--no-project` 명시.
- 가장 확실한 건 venv `bin/python3` 직접 호출. 환경변수도 명시적으로.
