# TIL: `claude mcp add` 명령어 인자 순서

날짜: 2026-05-04

## 현상

real-estate-mcp를 등록하려고:

```bash
claude mcp add -s local -e DATA_GO_KR_API_KEY=xxx -- real-estate uv run real-estate-mcp
```

→ 에러:
```
Error: Cannot use 'real-estate' as environment variable
```

`-e` 플래그가 다음 토큰을 환경변수로 소비하면서 MCP 이름인 `real-estate`를 환경변수로 해석함.

## 원인

`claude mcp add`의 인자 순서:

```
claude mcp add [-s scope] <name> [-e KEY=VAL ...] -- <command> [args...]
```

`<name>`이 `-e` 앞에 와야 한다. argparse처럼 옵션이 먼저 와도 되는 게 아니라 위치 인자.

## 수정

```bash
# 올바른 순서: -s 다음에 name, 그 다음 -e
claude mcp add -s local real-estate -e DATA_GO_KR_API_KEY=xxx -- uv run real-estate-mcp
```

## 교훈

- 문서 안 읽고 `--help` 패턴 추정으로 쓰면 이렇게 시간 날린다.
- `claude mcp add --help` 한 번 보고 시작.
- 에러 메시지가 직접적이지 않을 때(`Cannot use X as environment variable`)는 인자 파싱 위치 문제 의심.
