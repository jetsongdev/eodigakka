---
title: "macOS launchd가 ~/Documents를 못 본다 — Tahoe TCC 정책의 변화"
series: "Neon 마이그레이션 함정 6중"
part: 1
date: 2026-05-05
status: draft
tags: [macos, launchd, tcc, automation]
---

## TL;DR

macOS Sequoia/Tahoe부터 launchd 데몬은 `~/Documents`, `~/Desktop`, `~/Downloads` 같은 보호 디렉토리에 접근할 수 없다. 사용자 셸은 GUI 권한 inherit으로 통과하지만, launchd는 별도 TCC 권한이 필요한데 `.sh` 파일은 Full Disk Access에 추가가 거부된다.

## 증상

```
shell-init: error retrieving current directory: getcwd: cannot access parent directories: Operation not permitted
/bin/bash: /Users/chsong/Documents/sidespace/projects/eodigakka/etl/run_etl.sh: Operation not permitted
```

`launchctl start <label>`을 칠 때마다 위 에러. plist 자체는 문제 없고, `bash run_etl.sh` 직접 실행은 통과. 차이는 launch context.

## 시도한 우회 4종

| 시도 | 결과 |
|---|---|
| `run_etl.sh` 자체를 Full Disk Access에 추가 | macOS가 `.sh` 항목 거부 |
| 심링크 `~/projects/eodigakka` → `~/Documents/.../eodigakka` | TCC가 resolved real path 추적, 동일 차단 |
| `/Library/LaunchAgents/` system domain | `EX_CONFIG (78)` — root 컨텍스트와 사용자 파일 권한 충돌 |
| 프로젝트 mv `~/Documents/...` → `~/projects/...` | 영구 해결되지만 채택 보류 (기존 git/IDE 설정과 충돌) |

## 핵심 관찰

심링크 우회는 통하지 않는다. macOS TCC는 inode 기준이 아니라 *resolved real path* 기준으로 검사한다. 즉 `realpath()`가 `~/Documents` 안으로 가면 동일 차단.

## 결정

ETL을 macOS에서 떼어내고 GitHub Actions cron으로 옮기기로 결정. 대신 Postgres도 Neon Cloud(Singapore region)로 옮긴다. 함정은 여기서부터 시작.

## 교훈

자동화 데몬을 둘 거면 처음부터 `~/projects/` 또는 `~/Library/Application Support/` 같은 비보호 디렉토리에 두자. macOS 정책은 풀어주지 않고 조여만 간다.

## 참고

- 원본 TIL: `docs/til/2026-05-05-neon-migration-tcc-launchd.md` 함정 1 섹션
- TCC 정책 변화: macOS Sequoia release notes, FB18223741 (관련 radar)
