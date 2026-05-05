# 블로그 포스팅 초안

`docs/til/`이 1차 기록(현상→원인→수정→교훈, 4단락 양식)이라면, 이 디렉토리는 외부 독자용 narrative로 재구성한 초안.

## 작성 규약

- 파일명: `YYYY-MM-DD-슬러그/` 폴더 또는 `YYYY-MM-DD-슬러그.md` 단편.
- 시리즈는 폴더 + `00-index.md` + `01.md`부터 순번. 각 편 독립적으로 검색 친화적.
- frontmatter:

```yaml
---
title: "글 제목"
series: "시리즈 이름 (단편이면 생략)"
part: 1
date: 2026-05-05
status: draft   # draft | review | published
tags: [postgres, neon, devops]
---
```

- TIL과 cross-reference: 본문 끝 "참고" 섹션에 원본 TIL 링크.

## 단편

- 2026-05-05 — [\"Failed to initialize WebGL\" 한 줄에 숨은 원인 셋](./2026-05-05-mapbox-webgl-failure-modes.md) — mapbox + React StrictMode/HMR + Chrome GPU process 실패 진단기 (TIL `2026-05-05-mapbox-webgl-strictmode`)
- 2026-05-05 — [솔로 프로젝트 GHA workflow에 임의 코드 실행 취약점이 있었다](./2026-05-05-gha-shell-injection.md) — `${{ }}` substitution이 bash 파싱 전에 일어난다는 것의 무게, env hoist 한 단계로 막는 canonical 패턴
- 2026-05-05 — [Stacked PR이 base 브랜치 squash merge로 자동 close되던 날](./2026-05-05-stacked-pr-auto-close.md) — solo dev에 stacked PR + `--delete-branch` 함정, gh CLI도 막히는 closed PR base 변경, rebase + 새 PR 복구 패턴
- 2026-05-05 — [모바일에서 mouseleave가 안 발사된다 — touch hover의 진짜 모델](./2026-05-05-touch-mouseleave-hover.md) — 데스크톱 마우스 모델로 짠 tooltip이 모바일에서 영원히 잔류하는 회귀, `(hover: hover) and (pointer: fine)` + sidepanel 가드 두 단계 fix
- 2026-05-05 — [Mapbox 토큰을 'http://localhost:*'로 잠그려다 만난 wildcard 금지의 벽](./2026-05-05-mapbox-token-url-restriction.md) — Mapbox URL restriction의 exact origin 매칭 + Vercel preview hash URL의 충돌, 환경별 token 분리 발급 패턴 (TIL `2026-05-05-mapbox-token-url-restriction`)

## 시리즈 인덱스

### 2026-05-05 — `~/Documents`에서 ETL 자동화하다 함정 6개 만난 이야기 (Neon 마이그레이션)

[`2026-05-05-neon-migration-series/`](./2026-05-05-neon-migration-series/) — 6편 시리즈.

1. [macOS launchd가 ~/Documents를 못 본다](./2026-05-05-neon-migration-series/01-launchd-tcc.md)
2. [`$`가 들어간 비번이 셸에서 잘리는 이유](./2026-05-05-neon-migration-series/02-shell-password-escape.md)
3. [Neon pooler에서 PostGIS_Version()이 안 보이는 이유](./2026-05-05-neon-migration-series/03-pooler-search-path.md)
4. [pg_dump 후처리 grep이 COPY 데이터를 잘라먹은 사건](./2026-05-05-neon-migration-series/04-pg-dump-copy-stream.md)
5. [같은 함정에 두 번 빠진 이유 — fix 적용 일관성](./2026-05-05-neon-migration-series/05-fix-consistency.md)
6. [`InvalidSchemaName`과 두 번의 fix — pooler에서 direct endpoint로](./2026-05-05-neon-migration-series/06-startup-option.md)
