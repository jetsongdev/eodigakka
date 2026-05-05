---
title: "$가 들어간 비번이 셸에서 잘리는 이유 — 큰따옴표가 범인"
series: "Neon 마이그레이션 함정 6중"
part: 2
date: 2026-05-05
status: draft
tags: [shell, bash, security, postgres]
---

## TL;DR

```bash
NEON_URL="postgresql://user:abc$def@host/db"
```

비번 안의 `$def`가 셸 변수로 해석돼서 비번이 `abc`로 잘린다. 작은따옴표(`'`) + `.env` 파일에 저장 + 자동 source 패턴이 영구 안전.

## 증상

```
psycopg2.OperationalError: connection to server at "ep-xxx.aws.neon.tech",
port 5432 failed: ERROR:  password authentication failed for user 'neondb_owner'
```

비번 분명히 맞게 입력했는데 인증 실패. Neon SQL Editor에선 같은 비번으로 접속 잘 됨. 즉 셸을 거치는 순간 무언가 변형된다.

## 원인

bash 큰따옴표 `"..."` 안에서는 `$VAR`가 변수 치환된다. `$def`라는 환경변수가 없으면 빈 문자열로 치환 → `postgresql://user:abc@host/db`가 된다. `psql -V` 같은 검증 안 거치고 바로 connect 호출하니 "비번이 잘렸다"는 게 안 보인다.

## 해결 패턴

```bash
# ❌ 위험
NEON_URL="postgresql://user:abc$def@host/db"

# ✅ 작은따옴표 (변수 치환 안 함)
NEON_URL='postgresql://user:abc$def@host/db'

# ✅✅ .env 파일 + auto-source
# etl/.env
NEON_URL='postgresql://user:abc$def@host/db'
```

```bash
# migrate_to_neon.sh 도입부
ENV_FILE="${ENV_FILE:-etl/.env}"
if [ -z "${NEON_URL:-}" ] && [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi
```

`.env`로 옮기면 셸에서 직접 export할 일이 없어 escape 사고 자체가 발생할 여지가 사라진다.

## URL-encode는 권장 안 함

`$` → `%24`로 percent-encoding하면 표면상 통하지만, client별로 percent-encoding 처리가 다르다(libpq는 처리, psycopg2는 처리, JDBC는 부분적, ...). 디버깅할 때 "이 URL은 어디서 통하고 어디서 안 통하지?"가 추가된다. 작은따옴표 + `.env`가 단순하고 universal.

## GitHub Actions Secrets는 어떻게?

GH UI에서 secret 값 입력할 때도 동일 위험. 비번에 `$`나 다른 메타문자 있으면 입력 그대로 보존되긴 하지만, 검증을 위해 `printf '%s' "$VAL" | gh secret set NAME` 패턴이 더 robust. value를 stdout에 안 띄우고 stdin pipe로 곧장 GitHub로 전달.

## 교훈

비번에 메타문자 있으면 *셸을 거치지 않는 경로*로만 흘릴 것. 큰따옴표는 변수 치환을 한다는 사실을 잊기 쉽다.

## 참고

- 원본 TIL: `docs/til/2026-05-05-neon-migration-tcc-launchd.md` 함정 2 섹션
- bash man page: "Double Quotes" 섹션
